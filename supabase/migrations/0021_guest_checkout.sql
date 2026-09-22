-- ============================================================
-- 0021 — 비회원 구매 (owner 결정 2026-09-22): 카카오 로그인 없이 결제 → 주문번호 + 연락처로 주문 조회 · 환불 · 문의.
--        customers 비회원 행(guest · phone_norm · 조회 토큰 해시) · app_guest_customer_upsert · app_guest_order_lookup ·
--        app_guest_token_issue · app_guest_order_verify · purge_checkout_pii 확장(결제에 이르지 못한 비회원 행 삭제).
--
-- 실행: 0020 이후. 재실행 가능(add column if not exists / create or replace / create index if not exists).
-- 근거: docs/app-plan.md §6.1(/checkout · /orders/lookup · /orders/g/[code]) · §5.1(보존·파기) · packages/db/src/legal/privacy.ts 제2조의3.
--
-- 설계 요점
--   · 0004 customers.user_id 는 이미 nullable + unique (PostgreSQL unique 는 null 을 서로 다르게 본다 → 비회원 행 여러 개 가능).
--     0008 checkout_sessions.user_id · orders.user_id 도 nullable. app_claim_checkout / app_confirm_checkout 은 user_id 를 검사하지
--     않으므로 그대로 쓴다(소유자 확인은 라우트 — 회원은 user.id, 비회원은 체크아웃 때 발급한 HttpOnly 쿠키 slry_gck = 세션 id).
--   · **비회원 체크아웃 1건 = customers 행 1개**(guest=true). 같은 연락처의 이전 비회원 행을 재사용하지 않는다 — 조회 토큰이 행 단위라
--     재사용하면 한 주문의 조회가 다른 주문의 토큰을 회전시키고, 이름만 같은 타인의 주문이 묶일 수 있다. 행이 늘어나는 비용은 감수한다.
--   · 조회 토큰: 서버가 32바이트 난수(hex)를 만들어 **sha256 해시만** customers.lookup_token_hash 에 저장. 원문은 HttpOnly 쿠키
--     slry_guest_<주문번호> 로만 브라우저에 있다. 발급(결제 확정 직후 · 주문 조회 성공 시)마다 회전 — 이전 쿠키는 무효.
--   · app_guest_order_lookup(주문번호, 연락처) 는 비회원 주문(customers.guest) 만 찾는다 — 회원 주문은 /account/orders. 찾지 못한 이유
--     (주문번호 없음 / 연락처 불일치 / 회원 주문) 를 구분해 돌려주지 않는다(열거 방지). 레이트리밋은 앱(IP 30분 5회).
--   · app_refund_precheck(0008) 는 소유자를 검사하지 않는다(라우트 책임) — 비회원 환불은 라우트가 app_guest_order_verify 로 소유를
--     확인한 뒤 같은 precheck → 토스 취소 → app_refund_record 를 탄다. 함수 변경 없음.
--   · purge_checkout_pii: 기존(FAILED/EXPIRED 세션 PII 익명화)에 더해, 주문이 없는 비회원 customers 행(결제에 이르지 못한 방문자의
--     이름·연락처·이메일)을 p_older_than 뒤 **삭제**한다. checkout_sessions.customer_id 는 on delete set null. 반환값은 두 작업의 행 수 합.
--   · 모든 함수는 service role 전용 — revoke from public/anon/authenticated (0007 의 default privileges 로 service_role 은 execute 가능).
-- ============================================================

-- ============================================================
-- customers — 비회원 컬럼
-- ============================================================
alter table public.customers add column if not exists guest boolean not null default false;   -- true = 비회원 체크아웃이 만든 행 (user_id null)
alter table public.customers add column if not exists phone_norm text                            -- 숫자만 8~15자리 (normalizePhone) — 주문 조회 대조
  check (phone_norm is null or phone_norm ~ '^[0-9]{8,15}$');
alter table public.customers add column if not exists lookup_token_hash text;                    -- sha256(hex) — 원문 토큰은 저장하지 않는다
alter table public.customers add column if not exists lookup_token_issued_at timestamptz;

create index if not exists customers_guest_phone_idx on public.customers (phone_norm) where guest;
-- authenticated 의 컬럼 grant(0004 · 0008)는 그대로 — 새 컬럼은 grant 하지 않는다(RLS customers_select_own 은 user_id = auth.uid() 라 비회원 행은 보이지도 않는다).

-- ============================================================
-- app_guest_customer_upsert(name, phone, email) — 비회원 customers 행 생성 (서비스 롤 전용). 항상 새 행 (위 설계 요점).
--   반환: customers.id
-- ============================================================
create or replace function public.app_guest_customer_upsert(p_name text, p_phone text, p_email text default null)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'GUEST_NAME_REQUIRED';
  end if;
  if p_phone is null or p_phone !~ '^[0-9]{8,15}$' then
    raise exception 'GUEST_PHONE_INVALID';
  end if;
  insert into public.customers (user_id, guest, name, phone, phone_norm, email)
  values (null, true, left(btrim(p_name), 50), p_phone, p_phone, nullif(left(btrim(coalesce(p_email, '')), 200), ''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.app_guest_customer_upsert(text, text, text) from public, anon, authenticated;

-- 토큰 발급 내부 헬퍼 — customers 행에 새 해시를 쓰고 원문을 돌려준다 (호출자: lookup · issue)
create or replace function public.guest_token_rotate(p_customer_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  update public.customers
     set lookup_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
         lookup_token_issued_at = now()
   where id = p_customer_id and guest;
  if not found then
    return null;
  end if;
  return v_token;
end;
$$;
revoke all on function public.guest_token_rotate(uuid) from public, anon, authenticated;

-- ============================================================
-- app_guest_order_lookup(order_code, phone) — 주문번호 + 연락처로 비회원 주문 찾기 → 토큰 발급(회전) (서비스 롤 전용)
--   대조: orders.code(대소문자 무시) · is_sample=false · customers.guest · 연락처는 customers.phone_norm 또는 orders.buyer_phone 또는
--   배송지 shipping.phone 중 하나와 일치(숫자만 비교).
--   반환: { ok:true, order_id, order_code, customer_id, token } | { ok:false, code:'NOT_FOUND' }
-- ============================================================
create or replace function public.app_guest_order_lookup(p_order_code text, p_phone text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_oid   uuid;
  v_ocode text;
  v_cid   uuid;
  v_token text;
begin
  if p_order_code is null or p_phone is null or p_phone !~ '^[0-9]{8,15}$' then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select o.id, o.code, cu.id into v_oid, v_ocode, v_cid
    from public.orders o
    join public.customers cu on cu.id = o.customer_id
   where lower(o.code) = lower(btrim(p_order_code))
     and not o.is_sample
     and cu.guest
     and (cu.phone_norm = p_phone
          or regexp_replace(coalesce(o.buyer_phone, ''), '[^0-9]', '', 'g') = p_phone
          or regexp_replace(coalesce(o.shipping ->> 'phone', ''), '[^0-9]', '', 'g') = p_phone)
   limit 1;
  if v_oid is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  v_token := public.guest_token_rotate(v_cid);
  return jsonb_build_object('ok', true, 'order_id', v_oid, 'order_code', v_ocode, 'customer_id', v_cid, 'token', v_token);
end;
$$;
revoke all on function public.app_guest_order_lookup(text, text) from public, anon, authenticated;

-- ============================================================
-- app_guest_token_issue(order_code) — 결제 확정 직후 성공 페이지·"주문 보기" 용 토큰 발급 (서비스 롤 전용 · 회전)
--   비회원 주문(customers.guest)이 아니면 null. 호출자(/api/payments/confirm)는 세션 소유(slry_gck 쿠키)를 이미 확인한 뒤다.
-- ============================================================
create or replace function public.app_guest_token_issue(p_order_code text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_cid uuid;
begin
  select cu.id into v_cid
    from public.orders o
    join public.customers cu on cu.id = o.customer_id
   where lower(o.code) = lower(btrim(coalesce(p_order_code, ''))) and cu.guest
   limit 1;
  if v_cid is null then
    return null;
  end if;
  return public.guest_token_rotate(v_cid);
end;
$$;
revoke all on function public.app_guest_token_issue(text) from public, anon, authenticated;

-- ============================================================
-- app_guest_order_verify(order_code, token) — 쿠키 토큰 검증 → 주문 id (서비스 롤 전용)
--   sha256(token) = customers.lookup_token_hash 이고 그 customers 행이 이 주문의 customer_id 일 때만 order_id. 아니면 null.
--   상세 json 은 만들지 않는다 — 앱이 order_id 로 fetchOrderById(회원 상세와 같은 조인·같은 모양 MyOrder)를 쓴다.
-- ============================================================
create or replace function public.app_guest_order_verify(p_order_code text, p_token text)
returns uuid
language sql stable
security definer set search_path = public
as $$
  select o.id
    from public.orders o
    join public.customers cu on cu.id = o.customer_id
   where lower(o.code) = lower(btrim(coalesce(p_order_code, '')))
     and cu.guest
     and cu.lookup_token_hash is not null
     and p_token ~ '^[0-9a-f]{64}$'
     and cu.lookup_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
   limit 1
$$;
revoke all on function public.app_guest_order_verify(text, text) from public, anon, authenticated;

-- ============================================================
-- purge_checkout_pii(older_than) — 0008 정의 + 비회원 행 파기 (시그니처 동일)
--   ① FAILED/EXPIRED 세션의 buyer_*/shipping/raw_payment 익명화 (0008 그대로)
--   ② 주문이 없는 비회원 customers 행(guest · created_at < now()-p_older_than) 삭제 — checkout_sessions.customer_id 는 set null.
--   주문이 있는 비회원 행은 거래기록(5년)과 함께 보존 — 여기서 다루지 않는다. 반환 = ① + ② 행 수.
-- ============================================================
create or replace function public.purge_checkout_pii(p_older_than interval default interval '30 days')
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n1 integer;
  n2 integer;
begin
  update public.checkout_sessions
     set buyer_name = '(삭제)', buyer_phone = null, buyer_email = null,
         shipping = '{}'::jsonb, raw_payment = null
   where status in ('FAILED','EXPIRED')
     and updated_at < now() - p_older_than
     and buyer_name <> '(삭제)';
  get diagnostics n1 = row_count;

  delete from public.customers cu
   where cu.guest
     and cu.user_id is null
     and cu.created_at < now() - p_older_than
     and not exists (select 1 from public.orders o where o.customer_id = cu.id);
  get diagnostics n2 = row_count;

  return n1 + n2;
end;
$$;
revoke all on function public.purge_checkout_pii(interval) from public, anon, authenticated;
