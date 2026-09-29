-- ============================================================
-- 0025 — 독점권 신청 / 승인
--
-- 배경: `exclusive_requests`(0002) 는 테이블만 있고 **쓰는 코드가 어디에도 없었다.**
--   브랜드는 오퍼를 걸 수 있고(`products.exclusive_grade` · `exclusive_label`),
--   인플루언서는 오퍼를 볼 수 있고, 잠금(`products.exclusive_seller_id`)도 후보·초대·샘플에서
--   제대로 걸러진다. 그런데 **신청과 승인이 없어서** 운영자가 DB 를 직접 고쳐야 독점권이 확정됐다.
--   프로토타입에는 있다 — `reqExclusive`(actions.ts L46) · `approveExcl` · `rejectExcl`.
--
-- 흐름 (프로토타입과 같다)
--   인플루언서  app_seller_request_exclusive   → exclusive_requests PENDING
--   브랜드      app_brand_decide_exclusive     → APPROVED 시 products.exclusive_seller_id 세팅
--                                              → REJECTED 는 상품을 건드리지 않는다
--   목록        app_brand_exclusive_requests   → 브랜드 `/requests` 처리 대기 큐
--               app_seller_exclusive_requests  → 인플루언서 상품 상세의 내 신청 상태
--
-- 등급 판정은 0011(`app_seller_sample_quote`)과 같은 규칙 — `grade_tiers.sort_order`,
--   0 = 블랙이므로 "이상" = `sort_order <=`. 등급 캐시가 비면 `grade_for_sales(m3_sales)` 로 재계산.
--
-- 이 파일은 기존 함수를 바꾸지 않는다(추가만).
-- ============================================================

-- ------------------------------------------------------------
-- seller_exclusive_eligible(product, seller) — 신청 자격 판정 (공용)
--   반환: (eligible, grade, need_grade, reason)
--   reason: OK · NO_OFFER(오퍼 없음) · LOCKED(이미 확정) · GRADE(등급 미달) · NOT_LISTED
-- ------------------------------------------------------------
create or replace function public.seller_exclusive_eligible(p_product_id uuid, p_seller_id uuid)
returns table (eligible boolean, grade text, need_grade text, reason text)
language plpgsql
stable
security definer set search_path = public
as $$
declare
  p            public.products;
  s            public.sellers;
  v_grade      text;
  v_grade_idx  integer;
  v_need       text;
  v_need_idx   integer;
begin
  select * into s from public.sellers where id = p_seller_id;
  if not found then
    return query select false, null::text, null::text, 'NO_SELLER'::text;
    return;
  end if;

  select * into p from public.products where id = p_product_id;
  if not found or p.deleted_at is not null or p.status <> 'listed' then
    return query select false, null::text, null::text, 'NOT_LISTED'::text;
    return;
  end if;

  -- 오퍼가 없으면 신청 대상이 아니다. 라벨만 있고 등급이 비면 플래티넘 (화면 폴백과 같다)
  if p.exclusive_label is null and p.exclusive_grade is null then
    return query select false, null::text, null::text, 'NO_OFFER'::text;
    return;
  end if;
  v_need := coalesce(p.exclusive_grade, '플래티넘');

  -- 이미 독점 인플루언서가 확정됐다 (본인이어도 재신청은 막는다 — 이미 가진 권리다)
  if p.exclusive_seller_id is not null then
    return query select false, null::text, v_need, 'LOCKED'::text;
    return;
  end if;

  -- 등급 (0011 과 같은 규칙: 캐시 → 비면 m3_sales 로 재계산 · 표에 없으면 최하위로)
  v_grade := coalesce(s.grade, public.grade_for_sales(s.m3_sales));
  select gt.sort_order into v_grade_idx from public.grade_tiers gt where gt.name = v_grade;
  if v_grade_idx is null then
    select gt.name, gt.sort_order into v_grade, v_grade_idx
      from public.grade_tiers gt order by gt.sort_order desc limit 1;
  end if;

  select gt.sort_order into v_need_idx from public.grade_tiers gt where gt.name = v_need;
  if v_need_idx is null then
    -- 오퍼 등급이 표에 없다 — 데이터 오류. 신청을 막고 사유를 남긴다
    return query select false, v_grade, v_need, 'BAD_OFFER'::text;
    return;
  end if;

  if v_grade_idx <= v_need_idx then
    return query select true, v_grade, v_need, 'OK'::text;
  else
    return query select false, v_grade, v_need, 'GRADE'::text;
  end if;
end;
$$;

revoke all on function public.seller_exclusive_eligible(uuid, uuid) from public, anon, authenticated;
grant execute on function public.seller_exclusive_eligible(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_seller_request_exclusive — 인플루언서가 독점권을 신청한다
--   가드: 자격(위 함수) · (product, seller) PENDING 1건(0002 unique) · 이미 APPROVED 면 거부
--   REJECTED 이력이 있어도 재신청은 허용한다 (프로토타입도 status !== 'REJECTED' 만 막는다)
-- ------------------------------------------------------------
create or replace function public.app_seller_request_exclusive(p_seller_id uuid, p_product_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  e        record;
  v_exist  public.exclusive_requests;
  v_id     uuid;
  v_code   text;
begin
  select * into e from public.seller_exclusive_eligible(p_product_id, p_seller_id);
  if not e.eligible then
    return jsonb_build_object('ok', false, 'code', e.reason,
      'grade', e.grade, 'need_grade', e.need_grade);
  end if;

  -- 같은 상품에 이미 살아있는 신청이 있나 (PENDING = 대기 · APPROVED = 이미 받음)
  select * into v_exist from public.exclusive_requests
    where product_id = p_product_id and seller_id = p_seller_id and status in ('PENDING', 'APPROVED')
    order by created_at desc limit 1;
  if found then
    return jsonb_build_object('ok', true, 'already', true, 'status', v_exist.status,
      'request_id', v_exist.id, 'code', 'ALREADY');
  end if;

  insert into public.exclusive_requests (product_id, seller_id, status)
    values (p_product_id, p_seller_id, 'PENDING')
    returning id, code into v_id, v_code;

  return jsonb_build_object('ok', true, 'already', false, 'status', 'PENDING',
    'request_id', v_id, 'grade', e.grade, 'need_grade', e.need_grade);
exception
  when unique_violation then
    -- 0002 의 부분 unique 인덱스 (product_id, seller_id) where status='PENDING' — 동시 클릭
    select * into v_exist from public.exclusive_requests
      where product_id = p_product_id and seller_id = p_seller_id and status = 'PENDING' limit 1;
    return jsonb_build_object('ok', true, 'already', true, 'status', 'PENDING',
      'request_id', v_exist.id, 'code', 'ALREADY');
end;
$$;

revoke all on function public.app_seller_request_exclusive(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_seller_request_exclusive(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_seller_exclusive_requests — 내 신청 상태 (상품 상세 표시용)
--   p_product_id 를 주면 그 상품만, 비우면 전부
-- ------------------------------------------------------------
create or replace function public.app_seller_exclusive_requests(p_seller_id uuid, p_product_id uuid default null)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object('ok', true, 'rows', coalesce(jsonb_agg(t.r order by t.created_at desc), '[]'::jsonb))
  from (
    select jsonb_build_object(
             'id', x.id, 'status', x.status,
             'product_id', x.product_id, 'product_code', p.code, 'product_name', p.name,
             'exclusive_label', p.exclusive_label, 'exclusive_grade', p.exclusive_grade,
             'locked_by_me', (p.exclusive_seller_id = x.seller_id),
             'created_at', x.created_at, 'decided_at', x.decided_at
           ) as r, x.created_at
    from public.exclusive_requests x
    join public.products p on p.id = x.product_id
    where x.seller_id = p_seller_id
      and (p_product_id is null or x.product_id = p_product_id)
  ) t;
$$;

revoke all on function public.app_seller_exclusive_requests(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_seller_exclusive_requests(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_exclusive_requests — 내 상품에 들어온 독점권 신청
--   기본 PENDING 만. 신청 시 브랜드에 프로필이 공개되므로(프로토타입 안내 문구) 이름·핸들·지표를 준다.
-- ------------------------------------------------------------
create or replace function public.app_brand_exclusive_requests(p_brand_id uuid, p_status text default 'PENDING')
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object('ok', true, 'rows', coalesce(jsonb_agg(t.r order by t.created_at), '[]'::jsonb))
  from (
    select jsonb_build_object(
             'id', x.id, 'status', x.status,
             'product_id', x.product_id, 'product_code', p.code, 'product_name', p.name,
             'exclusive_label', p.exclusive_label, 'exclusive_grade', p.exclusive_grade,
             'locked', (p.exclusive_seller_id is not null),
             'locked_seller_id', p.exclusive_seller_id,
             'seller_id', s.id, 'seller_code', s.code, 'seller_name', s.name,
             'seller_handle', s.handle, 'seller_grade', coalesce(s.grade, public.grade_for_sales(s.m3_sales)),
             'seller_followers', s.followers, 'seller_m3_sales', s.m3_sales,
             'created_at', x.created_at, 'decided_at', x.decided_at
           ) as r, x.created_at
    from public.exclusive_requests x
    join public.products p on p.id = x.product_id
    join public.sellers  s on s.id = x.seller_id
    where p.brand_id = p_brand_id
      and p.deleted_at is null
      and (p_status is null or x.status = p_status)
  ) t;
$$;

revoke all on function public.app_brand_exclusive_requests(uuid, text) from public, anon, authenticated;
grant execute on function public.app_brand_exclusive_requests(uuid, text) to service_role;

-- ------------------------------------------------------------
-- app_brand_decide_exclusive — 브랜드가 승인/거절한다
--   승인: status=APPROVED · products.exclusive_seller_id = seller_id
--         + 같은 상품의 다른 PENDING 은 자동 REJECTED (독점권은 1명이다)
--   거절: status=REJECTED · 상품은 건드리지 않는다
--   가드: 내 상품인지 · PENDING 인지 · 이미 다른 사람으로 잠겼는지
-- ------------------------------------------------------------
create or replace function public.app_brand_decide_exclusive(
  p_brand_id uuid, p_request_id uuid, p_approve boolean
)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  x        public.exclusive_requests;
  p        public.products;
  v_name   text;
  v_handle text;
  v_others integer := 0;
begin
  select * into x from public.exclusive_requests where id = p_request_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select * into p from public.products where id = x.product_id;
  if not found or p.brand_id <> p_brand_id or p.deleted_at is not null then
    -- 남의 상품 · 삭제된 상품 — 소유자 불일치를 구분하지 않는다 (다른 화면과 같은 방식)
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if x.status <> 'PENDING' then
    return jsonb_build_object('ok', true, 'already', true, 'status', x.status, 'code', 'ALREADY');
  end if;

  select s.name, s.handle into v_name, v_handle from public.sellers s where s.id = x.seller_id;

  if p_approve then
    -- 이미 다른 인플루언서로 확정됐다면 승인할 수 없다
    if p.exclusive_seller_id is not null and p.exclusive_seller_id <> x.seller_id then
      return jsonb_build_object('ok', false, 'code', 'LOCKED');
    end if;

    update public.exclusive_requests
      set status = 'APPROVED', decided_at = now() where id = x.id;
    update public.products
      set exclusive_seller_id = x.seller_id where id = p.id;

    -- 독점권은 한 명 — 같은 상품의 남은 대기 신청은 자동 거절한다
    with d as (
      update public.exclusive_requests
        set status = 'REJECTED', decided_at = now()
        where product_id = p.id and status = 'PENDING' and id <> x.id
        returning 1
    ) select count(*)::integer into v_others from d;

    return jsonb_build_object('ok', true, 'already', false, 'status', 'APPROVED',
      'seller_name', v_name, 'seller_handle', v_handle,
      'product_code', p.code, 'product_name', p.name, 'auto_rejected', v_others);
  else
    update public.exclusive_requests
      set status = 'REJECTED', decided_at = now() where id = x.id;
    return jsonb_build_object('ok', true, 'already', false, 'status', 'REJECTED',
      'seller_name', v_name, 'seller_handle', v_handle,
      'product_code', p.code, 'product_name', p.name, 'auto_rejected', 0);
  end if;
end;
$$;

revoke all on function public.app_brand_decide_exclusive(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.app_brand_decide_exclusive(uuid, uuid, boolean) to service_role;

-- ------------------------------------------------------------
-- app_admin_exclusive_requests — 관리자 열람 전용 (승인은 브랜드가 한다)
--   관리자 홈 "오늘 할 일" 에는 넣지 않는다 — 관리자가 처리하는 일이 아니다
--   (dashboard.server.ts:125 의 판단과 같다)
-- ------------------------------------------------------------
create or replace function public.app_admin_exclusive_requests(p_status text default 'PENDING')
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object('ok', true, 'rows', coalesce(jsonb_agg(t.r order by t.created_at), '[]'::jsonb))
  from (
    select jsonb_build_object(
             'id', x.id, 'status', x.status,
             'product_code', p.code, 'product_name', p.name,
             'brand_code', b.code, 'brand_name', b.name,
             'exclusive_label', p.exclusive_label, 'exclusive_grade', p.exclusive_grade,
             'locked', (p.exclusive_seller_id is not null),
             'seller_code', s.code, 'seller_name', s.name, 'seller_handle', s.handle,
             'seller_grade', coalesce(s.grade, public.grade_for_sales(s.m3_sales)),
             'created_at', x.created_at, 'decided_at', x.decided_at
           ) as r, x.created_at
    from public.exclusive_requests x
    join public.products p on p.id = x.product_id
    join public.brands   b on b.id = p.brand_id
    join public.sellers  s on s.id = x.seller_id
    where p.deleted_at is null
      and (p_status is null or x.status = p_status)
  ) t;
$$;

revoke all on function public.app_admin_exclusive_requests(text) from public, anon, authenticated;
grant execute on function public.app_admin_exclusive_requests(text) to service_role;
