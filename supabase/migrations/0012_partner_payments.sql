-- ============================================================
-- 0012 — 인플루언서 콘솔 4단계 "결제 1 — 샘플 구매": partner_payments · 선점/확정/실패/취소/환불/만료 함수 · celery_spend ·
--        recalc_campaign_sold_qty 재정의(샘플 주문 제외)
--
-- 근거: docs/inf-console-plan.md §5.1(범위) · §5.3(🥬+현금 규칙 — app_sample_quote 가 단일 소스) · §5.4(테이블·함수 초안) ·
--       §5.5(확정 트랜잭션 · 멱등) · §5.6(webhook · orderId 접두 slrp_) · §5.7(실패·환불 규칙) · §7 "4. 결제 1 — 샘플 구매" ·
--       docs/app-plan.md §7(고객 결제 관례 — 0008 app_claim_checkout / app_confirm_checkout 을 그대로 본뜬다) · docs/sample-policy.md.
-- 실행: 0011 이후. 재실행 가능(create table if not exists / create or replace / drop … if exists).
-- 범위: 4단계 부분집합 — kind='sample' 만 만든다. 🥬 충전(topup) · 셀러리 샵(shop) 함수는 규제 검토 게이트(§5.8) 뒤 별도 번호로.
--       화면(/pay/*) · API 라우트 · 웹훅 분기는 다음 PR(PR-B). 이 파일 + @sellery/payments/server/partner-sample.server.ts 가 계약이다.
--
-- 숫자·규칙의 정답은 packages/core/src/{constants,helpers,actions}.ts 다. 이 SQL 은 그 규칙을 옮긴 것이고, 바꿀 때는 둘을 함께 고친다.
--
-- | 규칙 | 코어 원본 | 여기서 |
-- |---|---|---|
-- | 샘플 구매가 · 🥬 분할(cel = min(floor(price/20000), 잔액) · cash = price − cel×20000 · 0<cash<100 이면 cel−1) | samplePrice · sampleSplit · SAMPLE_CEL_WON | app_sample_quote(0011) 를 선점 시 서버가 다시 계산 — 클라이언트 금액 불신(§5.3). 행에 스냅샷(quote) |
-- | 1🥬 = ₩20,000 | SAMPLE_CEL_WON | partner_payments.cel_won check (= 20000) — 0003 campaigns_sample_split_consistent 의 20000 과 같은 값. 바꾸려면 두 제약 + platform_settings.sample_cel_won 을 한 마이그레이션에서 |
-- | 🥬 차감 = 잔액 이내에서만 · 원장 −n · memo '샘플 구매 · {상품} (₩n 상당)' | celSpend(actions.ts) · 0005 celery_ledger 주석 | celery_spend() — advisory lock + 잔액 재조회 → 부족 시 raise 'CEL_INSUFFICIENT'(확정 트랜잭션 전체 롤백) |
-- | 구매 확정 = 캠페인 SAMPLE_PURCHASED(purchased=true · samplePaid{price,cel,cash,method}) + 주문 1건(sample:true · qty 1 · unit=price · buyer '{이름} (샘플 구매)') + 시스템 메시지 | confirmSampleBuy(actions.ts L36-44) | app_partner_payment_confirm 5·6단계 — campaign_events.body 는 프로토타입 원문에서 <b> 만 제거 |
-- | 샘플 주문은 재고·잔여(sold_qty)에 세지 않는다 — 정산의 sample_net 으로만 | soldQty(PAID 고객 주문) · calc().sampleNet | recalc_campaign_sold_qty 에 `and not o.is_sample` (0004 정의 유지 · 트리거 orders_sync_sold_qty 그대로) |
-- | 환급 옵션(refund)은 정산 시 1회 — 지금은 플래그만 기록 | spOf(p).refund · runSettle | quote.refund 스냅샷 + 시스템 메시지 꼬리 ' · 판매 확정 시 구매액 환급' (정산은 5단계) |
-- | 결제 전 취소 = 브랜드 발송 전(캠페인 SAMPLE_PURCHASED 유지)만 · 🥬 복구 · 주문 CANCELED(조정 큐) · 캠페인 DECLINED | §5.7 · 0004 orders_sample_not_refunded(REFUNDED 불가) | app_partner_payment_refund — 운영 스크립트가 토스 취소 뒤 호출 |
-- | 토스 orderId 접두 — 고객 'slry_' · 파트너 'slrp_' | @sellery/payments money.ts ORDER_ID_PREFIX | partner_payments.toss_order_id check `^slrp_[A-Za-z0-9_-]{6,59}$` (웹훅이 접두로 분기, §5.6) |
--
-- 상태 기계(0008 checkout_sessions 를 본뜸 · 대문자):
--   PENDING(선점) → CONFIRMING(토스 confirm 직전 · payment_key 저장) → CONFIRMED(원장·캠페인·주문 생성 = "paid")
--                 → FAILED(승인 실패 · 금액/정보 불일치 · CEL_INSUFFICIENT 등 — fail_code · CANCEL_PENDING 은 토스 취소 실패로 재시도 대기)
--                 → CANCELED(인플루언서가 결제 전 그만둠 · SUPERSEDED = 새 선점으로 대체) → EXPIRED(만료 크론)
--   CONFIRMED → REFUNDED(운영자 취소: 토스 취소 뒤 app_partner_payment_refund)
--   0008 과의 차이: 🥬 전액(amount_cash=0)은 토스 없이 PENDING → CONFIRMED 로 바로 간다(p_toss = null).
--
-- 설계 요점
--   · 전부 security definer · service_role 만 execute(0007 패턴). 콘솔은 requireSeller() 의 seller.id 만 넘긴다 — 금액·🥬 개수는 서버(quote)가 정한다.
--   · 선점(claim)은 **🥬 를 건드리지 않는다**(후차감) — 만료·이탈로 잔액이 잠기지 않는다(§5.4 expire 주석). 차감은 확정 트랜잭션 안에서 1회.
--   · 확정은 한 트랜잭션·멱등: CONFIRMED 면 {already:true}. 원장 → 캠페인 → 이벤트 → 주문 → 결제 행 갱신을 한 서브블록에 묶어
--     unique_violation(진행 중 캠페인) · CEL_INSUFFICIENT 어느 쪽이든 전부 되돌린다(돈은 토스에서 이미 움직인 뒤라 호출자가 전액 취소 → fail).
--   · 함수는 예외 대신 {ok, code} 를 돌려준다(0010·0011 관례). 라우트가 code 를 문구로(packages/db/src/partner/sample-rules.ts).
--   · RLS on + revoke all(anon·authenticated) — 콘솔 읽기는 service role + seller_id 필터(§6 /pay/[id]: 남의 id 는 404).
--   · 계획서 §5.4 초안과의 이름 차이(구현 PR 에서 확정): price_total → amount_total · cel_won_snapshot → cel_won ·
--     app_begin_sample_purchase → app_partner_payment_claim · app_claim_partner_payment → app_partner_payment_confirming ·
--     app_confirm_sample_purchase → app_partner_payment_confirm · app_fail/cancel_… → app_partner_payment_fail/cancel/refund ·
--     expire/stale_partner_payments → app_partner_payments_expire/stale. SUPERSEDED 는 상태가 아니라 CANCELED + fail_code.
-- ============================================================

-- ============================================================
-- partner_payments — 파트너(인플루언서) 결제 1건 = 행 1건. 서비스 롤 전용.
-- ============================================================
create table if not exists public.partner_payments (
  id              uuid primary key default gen_random_uuid(),
  owner_type      text not null default 'seller' check (owner_type in ('seller','brand')),   -- 브랜드 결제(충전·데이터)는 후속 — 열만 예약
  seller_id       uuid references public.sellers (id) on delete restrict,
  brand_id        uuid references public.brands (id) on delete restrict,
  user_id         uuid references auth.users (id) on delete set null,   -- 소유자 일치 검사용(선점 시 sellers.user_id 스냅샷)
  kind            text not null default 'sample' check (kind in ('sample','topup','shop')),   -- 4단계는 'sample' 만 생성
  product_id      uuid references public.products (id) on delete restrict,
  campaign_id     uuid references public.campaigns (id) on delete set null,                  -- 확정 시 기록
  amount_total    integer not null check (amount_total >= 0),                                -- 샘플 구매가 (quote.price)
  amount_cel      integer not null default 0 check (amount_cel >= 0),                        -- 🥬 개수
  amount_cash     integer not null check (amount_cash >= 0),                                 -- 토스 청구액 (0 이면 위젯 없이 🥬 전액)
  cel_won         integer not null default 20000 check (cel_won = 20000),                    -- SAMPLE_CEL_WON — 0003 split 제약과 같은 값
  use_cel         boolean not null default false,                                            -- 실제 적용된 🥬 사용 여부 (quote.use_cel)
  quote           jsonb,                                                                     -- app_sample_quote 스냅샷 (표시·감사용)
  shipping        jsonb not null,                                                            -- 배송지 — 확정 시 campaigns.sample_shipping · orders.shipping 으로 복사
  order_name      text not null check (char_length(order_name) between 1 and 100),          -- 토스 orderName '샘플 · {상품명}'
  toss_order_id   text not null unique
                    check (toss_order_id ~ '^slrp_[A-Za-z0-9_-]{6,59}$'),                  -- ORDER_ID_PREFIX.partner (money.ts)
  payment_key     text,                                                                      -- 토스 paymentKey (CONFIRMING 전이 시 저장)
  status          text not null default 'PENDING'
                    check (status in ('PENDING','CONFIRMING','CONFIRMED','FAILED','CANCELED','EXPIRED','REFUNDED')),
  payment_method  text,                                                                      -- 토스 method · 🥬 전액이면 '셀러리 포인트'
  approved_at     timestamptz,                                                               -- 토스 approvedAt (🥬 전액은 확정 시각)
  raw_payment     jsonb,                                                                     -- confirm/조회 응답 원문 (실패 응답 포함)
  fail_code       text,                                                                      -- AMOUNT_MISMATCH · PAYMENT_MISMATCH · CEL_INSUFFICIENT · NOT_LISTED · LOCKED · ALREADY_ACTIVE
                                                                                             -- · VIRTUAL_ACCOUNT_NOT_SUPPORTED · EXPIRED · SUPERSEDED · CANCEL_PENDING(토스 취소 실패 — 재시도) · 토스 code …
  fail_message    text,                                                                      -- CANCEL_PENDING 일 때는 원래 code (0008 cancelAndFail 관례)
  refunded_at     timestamptz,                                                               -- REFUNDED 시각
  raw_cancel      jsonb,                                                                     -- 토스 취소 응답 원문
  expires_at      timestamptz not null default (now() + interval '30 minutes'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint partner_payments_owner_matches_type
    check ((owner_type = 'seller' and seller_id is not null and brand_id is null)
        or (owner_type = 'brand'  and brand_id  is not null and seller_id is null)),
  constraint partner_payments_sample_has_product
    check (kind <> 'sample' or product_id is not null),
  -- sampleSplit: cel×20,000 + cash = price (0003 campaigns_sample_split_consistent 와 같은 식)
  constraint partner_payments_split_consistent
    check (kind <> 'sample' or amount_cel * cel_won + amount_cash = amount_total),
  constraint partner_payments_use_cel_consistent
    check ((amount_cel > 0) = use_cel),
  constraint partner_payments_confirmed_complete
    check (status <> 'CONFIRMED' or (approved_at is not null and (amount_cash = 0 or payment_key is not null))),
  constraint partner_payments_refunded_has_time
    check (status <> 'REFUNDED' or refunded_at is not null)
);

create index if not exists partner_payments_seller_idx   on public.partner_payments (seller_id, created_at desc);
create index if not exists partner_payments_campaign_idx on public.partner_payments (campaign_id) where campaign_id is not null;
create index if not exists partner_payments_pending_idx  on public.partner_payments (status, expires_at)
  where status in ('PENDING','CONFIRMING');                                                 -- app_partner_payments_expire · stale
create unique index if not exists partner_payments_payment_key_uidx on public.partner_payments (payment_key)
  where payment_key is not null;                                                             -- 웹훅 paymentKey 역조회 · 타 행과의 충돌 검출

drop trigger if exists partner_payments_updated_at on public.partner_payments;
create trigger partner_payments_updated_at
  before update on public.partner_payments
  for each row execute function public.set_updated_at();

alter table public.partner_payments enable row level security;
revoke all on public.partner_payments from anon, authenticated;
grant all on public.partner_payments to service_role;   -- 0007 default privileges 로도 붙지만 명시
-- 정책 없음. /pay/[id] · /pay/success · /pay/fail 은 service role 로 읽되 seller_id = ctx.seller.id 필터 — 남의 id 는 404(§6).
comment on table public.partner_payments is '파트너 결제(4단계: 인플루언서 샘플 구매 · 토스 현금 + 🥬) — 0012. service role 전용';

-- ============================================================
-- partner_normalize_shipping(p_shipping) — 배송지 검증·정규화 (0011 app_request_free_sample 의 인라인 규칙을 함수로)
--   반환 { ok:true, shipping:{recipient, phone, postcode, address1, address2?, memo?} } | { ok:false, field }
--   수취인·연락처(숫자 8~15)·우편번호·주소 필수 · 공백 정리 · 길이 상한 40/15/10/200/200/200 (sample-rules.ts parseShippingInput 과 동일)
-- ============================================================
create or replace function public.partner_normalize_shipping(p_shipping jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_recipient text;
  v_phone     text;
  v_postcode  text;
  v_addr1     text;
  v_addr2     text;
  v_memo      text;
begin
  if p_shipping is null or jsonb_typeof(p_shipping) <> 'object' then
    return jsonb_build_object('ok', false, 'field', 'shipping');
  end if;
  v_recipient := left(regexp_replace(btrim(coalesce(p_shipping ->> 'recipient', '')), '\s+', ' ', 'g'), 40);
  v_phone     := regexp_replace(coalesce(p_shipping ->> 'phone', ''), '\D', '', 'g');
  v_postcode  := left(btrim(coalesce(p_shipping ->> 'postcode', '')), 10);
  v_addr1     := left(regexp_replace(btrim(coalesce(p_shipping ->> 'address1', '')), '\s+', ' ', 'g'), 200);
  v_addr2     := nullif(left(regexp_replace(btrim(coalesce(p_shipping ->> 'address2', '')), '\s+', ' ', 'g'), 200), '');
  v_memo      := nullif(left(regexp_replace(btrim(coalesce(p_shipping ->> 'memo', '')), '\s+', ' ', 'g'), 200), '');
  if v_recipient = '' then return jsonb_build_object('ok', false, 'field', 'recipient'); end if;
  if v_phone !~ '^\d{8,15}$' then return jsonb_build_object('ok', false, 'field', 'phone'); end if;
  if v_postcode = '' then return jsonb_build_object('ok', false, 'field', 'postcode'); end if;
  if v_addr1 = '' then return jsonb_build_object('ok', false, 'field', 'address1'); end if;
  return jsonb_build_object('ok', true, 'shipping', jsonb_strip_nulls(jsonb_build_object(
    'recipient', v_recipient, 'phone', v_phone, 'postcode', v_postcode,
    'address1', v_addr1, 'address2', v_addr2, 'memo', v_memo)));
end;
$$;
revoke all on function public.partner_normalize_shipping(jsonb) from public, anon, authenticated;
grant execute on function public.partner_normalize_shipping(jsonb) to service_role;

-- ============================================================
-- partner_payment_brief(row) — 라우트·웹훅·reconcile 이 읽는 요약 (배송지·토스 원문 없음). 0008 checkout_session_brief 와 같은 역할.
-- ============================================================
create or replace function public.partner_payment_brief(p public.partner_payments)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id, 'status', p.status, 'kind', p.kind, 'owner_type', p.owner_type,
    'seller_id', p.seller_id, 'user_id', p.user_id, 'product_id', p.product_id, 'campaign_id', p.campaign_id,
    'toss_order_id', p.toss_order_id, 'payment_key', p.payment_key, 'order_name', p.order_name,
    'amount_total', p.amount_total, 'amount_cel', p.amount_cel, 'amount_cash', p.amount_cash, 'cel_won', p.cel_won, 'use_cel', p.use_cel,
    'payment_method', p.payment_method, 'approved_at', p.approved_at, 'fail_code', p.fail_code, 'fail_message', p.fail_message,
    'expires_at', p.expires_at, 'created_at', p.created_at, 'updated_at', p.updated_at)
$$;
revoke all on function public.partner_payment_brief(public.partner_payments) from public, anon, authenticated;
grant execute on function public.partner_payment_brief(public.partner_payments) to service_role;

-- ============================================================
-- celery_spend(owner_type, owner_id, delta, reason, memo, ref_type, ref_id) — 🥬 원장 증감 (내부 헬퍼 · 잔액 검사 포함)
--   pg_advisory_xact_lock(소유자) → 잔액 재조회(Σ delta) → 부족하면 raise 'CEL_INSUFFICIENT'(errcode P0001) → 원장 insert → 새 잔액 반환.
--   delta 는 음수(차감)·양수(환급/지급) 모두. delta = 0 이면 insert 없이 잔액만 돌려준다(celery_ledger delta <> 0 제약).
--   샘플 확정(여기) · 환급 · 이후 셀러리 샵 · 데이터패스 · 브랜드 제안권이 공유한다(§5.4 · §9).
-- ============================================================
create or replace function public.celery_spend(
  p_owner_type text, p_owner_id uuid, p_delta integer, p_reason text,
  p_memo text default null, p_ref_type text default null, p_ref_id uuid default null)
returns integer
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_bal integer;
begin
  if p_owner_type not in ('seller','brand') then
    raise exception 'celery_spend: bad owner_type %', p_owner_type;
  end if;
  perform pg_advisory_xact_lock(hashtext('celery:' || p_owner_type || ':' || p_owner_id::text));
  select coalesce(sum(l.delta), 0)::integer into v_bal
    from public.celery_ledger l
   where l.owner_type = p_owner_type
     and ((p_owner_type = 'seller' and l.seller_id = p_owner_id) or (p_owner_type = 'brand' and l.brand_id = p_owner_id));
  if p_delta = 0 then
    return v_bal;
  end if;
  if v_bal + p_delta < 0 then
    raise exception 'CEL_INSUFFICIENT' using errcode = 'P0001', detail = format('balance=%s delta=%s', v_bal, p_delta);
  end if;
  insert into public.celery_ledger (owner_type, seller_id, brand_id, delta, reason, memo, ref_type, ref_id)
  values (p_owner_type,
          case when p_owner_type = 'seller' then p_owner_id end,
          case when p_owner_type = 'brand'  then p_owner_id end,
          p_delta, p_reason, p_memo, p_ref_type, p_ref_id);
  return v_bal + p_delta;
end;
$$;
revoke all on function public.celery_spend(text, uuid, integer, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.celery_spend(text, uuid, integer, text, text, text, uuid) to service_role;

-- ============================================================
-- app_partner_payment_claim(p_seller_id, p_product_id, p_use_cel, p_shipping, p_user_id, p_order_id) — 샘플 구매 선점 (PENDING 행 생성)
--   서버가 app_sample_quote 를 다시 계산해 금액·🥬 를 정한다(클라이언트 값 불신). 🥬 는 차감하지 않는다(후차감).
--   같은 인플루언서의 기존 PENDING 이 같은 상품·같은 분할·같은 배송지·미만료(5분 이상 남음)면 그 행을 돌려준다(reused:true) —
--   아니면 기존 PENDING 을 CANCELED(SUPERSEDED) 로 정리하고 새 행. CONFIRMING(토스 진행 중) 행은 건드리지 않는다.
--   p_order_id: 서버(TS generateOrderId('partner'))가 만든 토스 orderId. null 이면 DB 가 같은 꼴('slrp_{epoch ms}_{hex 12}')로 만든다.
--   반환:
--     { ok:true,  reused, payment_id, order_id, order_name, amount_total, amount_cel, amount_cash, cash_required, use_cel, expires_at, quote }
--     { ok:false, code:'BAD_SHIPPING', field }                        수취인·연락처·우편번호·주소
--     { ok:false, code:'BAD_ORDER_ID' }                               p_order_id 형식(slrp_ 접두 · 6~59자)
--     { ok:false, code:'NOT_FOUND' }                                  인플루언서 없음 · 정지
--     { ok:false, code:'NOT_BUYABLE', mode, reason, quote }           quote.mode ≠ 'buy' — free(무상 요청으로) · active(진행 중) · locked · unlisted
--     { ok:false, code:'INSUFFICIENT_CEL', cel, balance, quote }      방어선 — quote 가 잔액으로 자르므로 정상 경로에서는 나오지 않는다
--     { ok:false, code:'CASH_TOO_SMALL', cash, quote }                0 < cash < 100 (토스 최소 결제금액) — 지정가가 100원 미만인 상품
-- ============================================================
create or replace function public.app_partner_payment_claim(
  p_seller_id uuid, p_product_id uuid, p_use_cel boolean, p_shipping jsonb,
  p_user_id uuid default null, p_order_id text default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  s        public.sellers%rowtype;
  p        public.products%rowtype;
  pp       public.partner_payments%rowtype;
  ns       jsonb;
  v_ship   jsonb;
  q        jsonb;
  v_price  integer;
  v_cel    integer;
  v_cash   integer;
  v_use    boolean;
  v_oid    text;
begin
  -- 1. 배송지
  ns := public.partner_normalize_shipping(p_shipping);
  if not (ns ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', 'BAD_SHIPPING', 'field', ns ->> 'field');
  end if;
  v_ship := ns -> 'shipping';

  -- 2. orderId
  if p_order_id is not null and p_order_id !~ '^slrp_[A-Za-z0-9_-]{6,59}$' then
    return jsonb_build_object('ok', false, 'code', 'BAD_ORDER_ID');
  end if;

  -- 3. 인플루언서 행 잠금 — 같은 인플루언서의 동시 선점을 직렬화
  select * into s from public.sellers where id = p_seller_id for update;
  if not found or not s.active then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- 4. 견적 재계산 (잠금 뒤 · 표시와 같은 함수)
  q := public.app_sample_quote(s.id, p_product_id, coalesce(p_use_cel, false));
  if q ->> 'mode' <> 'buy' then
    return jsonb_build_object('ok', false, 'code', 'NOT_BUYABLE', 'mode', q ->> 'mode', 'reason', q ->> 'reason', 'quote', q);
  end if;
  v_price := (q ->> 'price')::integer;
  v_cel   := coalesce((q ->> 'cel')::integer, 0);
  v_cash  := (q ->> 'cash')::integer;
  v_use   := coalesce((q ->> 'use_cel')::boolean, false) and v_cel > 0;
  if v_cel > coalesce((q ->> 'balance')::integer, 0) then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_CEL', 'cel', v_cel, 'balance', q -> 'balance', 'quote', q);
  end if;
  if v_cash > 0 and v_cash < 100 then
    return jsonb_build_object('ok', false, 'code', 'CASH_TOO_SMALL', 'cash', v_cash, 'quote', q);
  end if;

  select * into p from public.products where id = p_product_id;

  -- 5. 기존 PENDING 재사용 / 대체
  select * into pp from public.partner_payments
   where seller_id = s.id and kind = 'sample' and status = 'PENDING'
     and product_id = p.id and use_cel = v_use and amount_cel = v_cel and amount_cash = v_cash and amount_total = v_price
     and shipping = v_ship and expires_at > now() + interval '5 minutes'
   order by created_at desc limit 1;
  if found then
    update public.sellers set sample_address = v_ship where id = s.id;
    return jsonb_build_object('ok', true, 'reused', true, 'payment_id', pp.id, 'order_id', pp.toss_order_id, 'order_name', pp.order_name,
      'amount_total', pp.amount_total, 'amount_cel', pp.amount_cel, 'amount_cash', pp.amount_cash,
      'cash_required', pp.amount_cash > 0, 'use_cel', pp.use_cel, 'expires_at', pp.expires_at, 'quote', q);
  end if;

  update public.partner_payments
     set status = 'CANCELED', fail_code = 'SUPERSEDED', fail_message = '새 결제 시도로 대체되었습니다'
   where seller_id = s.id and kind = 'sample' and status = 'PENDING';

  -- 6. 새 행
  v_oid := coalesce(p_order_id,
    'slrp_' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text || '_' || substr(md5(gen_random_uuid()::text), 1, 12));

  insert into public.partner_payments (
    owner_type, seller_id, user_id, kind, product_id,
    amount_total, amount_cel, amount_cash, cel_won, use_cel, quote, shipping, order_name, toss_order_id, status)
  values (
    'seller', s.id, coalesce(p_user_id, s.user_id), 'sample', p.id,
    v_price, v_cel, v_cash, coalesce((q ->> 'cel_won')::integer, 20000), v_use, q, v_ship,
    left('샘플 · ' || p.name, 100), v_oid, 'PENDING')
  returning * into pp;

  -- 7. 배송지 기본값 (다음 요청·결제 폼 프리필 — 0011 과 동일)
  update public.sellers set sample_address = v_ship where id = s.id;

  return jsonb_build_object('ok', true, 'reused', false, 'payment_id', pp.id, 'order_id', pp.toss_order_id, 'order_name', pp.order_name,
    'amount_total', pp.amount_total, 'amount_cel', pp.amount_cel, 'amount_cash', pp.amount_cash,
    'cash_required', pp.amount_cash > 0, 'use_cel', pp.use_cel, 'expires_at', pp.expires_at, 'quote', q);
end;
$$;
revoke all on function public.app_partner_payment_claim(uuid, uuid, boolean, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.app_partner_payment_claim(uuid, uuid, boolean, jsonb, uuid, text) to service_role;

-- ============================================================
-- app_partner_payment_confirming(p_payment_id, p_seller_id, p_payment_key, p_stale) — 토스 confirm 직전 선점 (0008 app_claim_checkout 복제)
--   PENDING(미만료) → CONFIRMING + payment_key. CONFIRMING 인데 updated_at 이 p_stale(기본 20초)보다 오래됐고 payment_key 가 같으면(또는 없으면)
--   고착으로 보고 재선점. amount_cash = 0(🥬 전액)은 이 단계가 필요 없다 — 바로 app_partner_payment_confirm(p_toss = null).
--   p_seller_id 가 null 이면 소유자 검사를 건너뛴다(웹훅·reconcile — 사용자 컨텍스트 없음).
--   반환:
--     { ok:true,  claimed:true,  payment:{brief} }      선점(재선점) — 이어서 토스 confirm
--     { ok:true,  claimed:false, payment:{brief} }      이미 CONFIRMED (멱등) — app_partner_payment_confirm 이 already:true 를 준다
--     { ok:false, code:'NOT_FOUND' }                    없는 id · 남의 결제
--     { ok:false, code:'CONFIRMING' }                   다른 요청이 진행 중(신선한 CONFIRMING) → 409
--     { ok:false, code:<fail_code|status>, message }    FAILED / CANCELED / EXPIRED / REFUNDED (만료 도래 PENDING 은 여기서 EXPIRED 로 바꾼 뒤)
--     { ok:false, code:'PAYMENT_KEY_CONFLICT' }         같은 paymentKey 가 다른 행에 있음
-- ============================================================
create or replace function public.app_partner_payment_confirming(
  p_payment_id uuid, p_seller_id uuid, p_payment_key text, p_stale interval default interval '20 seconds')
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  pp public.partner_payments%rowtype;
begin
  select * into pp from public.partner_payments where id = p_payment_id for update;
  if not found or (p_seller_id is not null and pp.seller_id is distinct from p_seller_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if pp.status = 'CONFIRMED' then
    return jsonb_build_object('ok', true, 'claimed', false, 'payment', public.partner_payment_brief(pp));
  end if;
  if pp.status in ('FAILED','CANCELED','EXPIRED','REFUNDED') then
    return jsonb_build_object('ok', false, 'code', coalesce(pp.fail_code, pp.status), 'message', pp.fail_message);
  end if;
  if pp.status = 'CONFIRMING'
     and not (pp.updated_at < now() - p_stale and (pp.payment_key is null or pp.payment_key = p_payment_key)) then
    return jsonb_build_object('ok', false, 'code', 'CONFIRMING');
  end if;
  if pp.status = 'PENDING' and pp.expires_at <= now() then
    update public.partner_payments set status = 'EXPIRED', fail_code = 'EXPIRED', fail_message = '결제 시간이 만료되었습니다' where id = pp.id;
    return jsonb_build_object('ok', false, 'code', 'EXPIRED', 'message', '결제 시간이 만료되었습니다');
  end if;
  begin
    update public.partner_payments set status = 'CONFIRMING', payment_key = p_payment_key where id = pp.id returning * into pp;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'PAYMENT_KEY_CONFLICT');
  end;
  return jsonb_build_object('ok', true, 'claimed', true, 'payment', public.partner_payment_brief(pp));
end;
$$;
revoke all on function public.app_partner_payment_confirming(uuid, uuid, text, interval) from public, anon, authenticated;
grant execute on function public.app_partner_payment_confirming(uuid, uuid, text, interval) to service_role;

-- ============================================================
-- app_partner_payment_confirm(p_payment_id, p_seller_id, p_toss, p_amount_cash) — 샘플 구매 확정 (§5.5 · 한 트랜잭션 · 멱등)
--   현금이 있으면(amount_cash > 0) 호출자가 토스 confirm 으로 status='DONE' 을 받은 **뒤** 원문을 p_toss 로 넘긴다.
--   🥬 전액(amount_cash = 0)은 p_toss = null 로 바로 호출한다. p_amount_cash 는 successUrl 의 amount(또는 0) — 행과 다르면 AMOUNT_MISMATCH.
--   p_seller_id 가 null 이면 소유자 검사를 건너뛴다(웹훅·reconcile).
--   순서: 행 for update → 멱등 → 상태 → 금액 → 토스 원문 대조 → (🥬 전액) 만료 → 상품·진행 중 재검사 → [서브블록: 원장 −cel → 캠페인 → 이벤트 → 주문 → 행 CONFIRMED]
--   반환:
--     { ok:true,  already:false, payment_id, campaign_id, campaign_code, order_id, order_code, amount_total, amount_cel, amount_cash, balance }
--     { ok:true,  already:true,  payment_id, campaign_id, campaign_code, order_id, order_code, … }   이미 CONFIRMED (성공 페이지 새로고침 · 웹훅 중복)
--     { ok:false, code:'NOT_FOUND' }
--     { ok:false, code:'NOT_CONFIRMABLE', status, fail_code, message }   FAILED / CANCELED / EXPIRED / REFUNDED — 주문 없음. 돈이 DONE 이면 호출자가 취소
--     { ok:false, code:'AMOUNT_MISMATCH', amount_cash }                  successUrl 금액 변조 — 상태 변경 없음, 호출자가 fail 로 종결(토스 미호출)
--     { ok:false, code:'PAYMENT_MISMATCH' }                              p_toss 가 행과 다름(status≠DONE · orderId · totalAmount · paymentKey) 또는 🥬 전액인데 p_toss 있음
--     { ok:false, code:'VIRTUAL_ACCOUNT_NOT_SUPPORTED' }                 가상계좌 (호출자가 전액 취소)
--     { ok:false, code:'EXPIRED' }                                       🥬 전액 경로에서 PENDING 만료 (행 EXPIRED 로)
--     { ok:false, code:'NOT_LISTED' | 'LOCKED' | 'ALREADY_ACTIVE', campaign_code? }   상품·캠페인 재검사 (돈이 DONE 이면 호출자가 전액 취소 → fail)
--     { ok:false, code:'CEL_INSUFFICIENT', cel, balance }               잔액 부족 — 원장·캠페인 미생성 (호출자가 전액 취소 → fail)
--     { ok:false, code:'PAYMENT_KEY_CONFLICT' }                          같은 paymentKey 가 다른 행에
--   ok:false 중 PAYMENT_MISMATCH · VIRTUAL_ACCOUNT_NOT_SUPPORTED · NOT_LISTED · LOCKED · ALREADY_ACTIVE · CEL_INSUFFICIENT · NOT_CONFIRMABLE 은
--   돈이 이미 잡힌 뒤일 수 있으므로 호출자가 토스 전액 취소 후 app_partner_payment_fail(code) — 취소 실패 시 fail('CANCEL_PENDING', message=code).
-- ============================================================
create or replace function public.app_partner_payment_confirm(p_payment_id uuid, p_seller_id uuid, p_toss jsonb, p_amount_cash integer)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  pp        public.partner_payments%rowtype;
  s         public.sellers%rowtype;
  p         public.products%rowtype;
  q         jsonb;
  v_key     text;
  v_method  text;
  v_appr    timestamptz;
  v_refund  boolean;
  v_cid     uuid;
  v_code    text;
  v_oid     uuid;
  v_ocode   text;
  v_bal     integer;
  v_memo    text;
  v_body    text;
  v_constraint text;
begin
  select * into pp from public.partner_payments where id = p_payment_id for update;
  if not found or (p_seller_id is not null and pp.seller_id is distinct from p_seller_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- 멱등
  if pp.status = 'CONFIRMED' then
    select o.id, o.code into v_oid, v_ocode from public.orders o where o.campaign_id = pp.campaign_id and o.is_sample order by o.created_at limit 1;
    select c.code into v_code from public.campaigns c where c.id = pp.campaign_id;
    return jsonb_build_object('ok', true, 'already', true, 'payment_id', pp.id, 'campaign_id', pp.campaign_id, 'campaign_code', v_code,
      'order_id', v_oid, 'order_code', v_ocode, 'amount_total', pp.amount_total, 'amount_cel', pp.amount_cel, 'amount_cash', pp.amount_cash);
  end if;
  if pp.status not in ('PENDING','CONFIRMING') then
    return jsonb_build_object('ok', false, 'code', 'NOT_CONFIRMABLE', 'status', pp.status, 'fail_code', pp.fail_code, 'message', pp.fail_message);
  end if;

  -- 금액 (successUrl 의 amount 대조 — 토스 호출 전 방어선은 라우트, 여기는 마지막 방어선)
  if coalesce(p_amount_cash, -1) <> pp.amount_cash then
    return jsonb_build_object('ok', false, 'code', 'AMOUNT_MISMATCH', 'amount_cash', pp.amount_cash);
  end if;

  -- 토스 원문 대조 (0009 app_confirm_checkout 과 같은 규칙)
  if pp.amount_cash > 0 then
    if p_toss is null
       or p_toss ->> 'status' is distinct from 'DONE'
       or p_toss ->> 'orderId' is distinct from pp.toss_order_id
       or (p_toss ->> 'totalAmount')::bigint is distinct from pp.amount_cash::bigint
       or p_toss ->> 'paymentKey' is null
       or (pp.payment_key is not null and p_toss ->> 'paymentKey' <> pp.payment_key) then
      return jsonb_build_object('ok', false, 'code', 'PAYMENT_MISMATCH');
    end if;
    if p_toss ->> 'method' = '가상계좌'
       or (p_toss ? 'virtualAccount' and jsonb_typeof(p_toss -> 'virtualAccount') <> 'null') then
      return jsonb_build_object('ok', false, 'code', 'VIRTUAL_ACCOUNT_NOT_SUPPORTED');
    end if;
    v_key    := p_toss ->> 'paymentKey';
    v_method := p_toss ->> 'method';
    v_appr   := coalesce((p_toss ->> 'approvedAt')::timestamptz, now());
  else
    if p_toss is not null then
      return jsonb_build_object('ok', false, 'code', 'PAYMENT_MISMATCH');
    end if;
    if pp.status = 'PENDING' and pp.expires_at <= now() then
      update public.partner_payments set status = 'EXPIRED', fail_code = 'EXPIRED', fail_message = '결제 시간이 만료되었습니다' where id = pp.id;
      return jsonb_build_object('ok', false, 'code', 'EXPIRED');
    end if;
    v_key    := null;
    v_method := '셀러리 포인트';
    v_appr   := now();
  end if;

  -- 인플루언서 · 상품 · 진행 중 재검사 (가격은 다시 계산하지 않는다 — 행의 금액이 계약이고 돈은 이미 움직였다)
  select * into s from public.sellers where id = pp.seller_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  q := public.app_sample_quote(s.id, pp.product_id, pp.use_cel);
  if q ->> 'mode' = 'unlisted' then
    return jsonb_build_object('ok', false, 'code', 'NOT_LISTED');
  elsif q ->> 'mode' = 'locked' then
    return jsonb_build_object('ok', false, 'code', 'LOCKED');
  elsif q ->> 'mode' = 'active' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_ACTIVE', 'campaign_code', q ->> 'campaign_code');
  end if;
  select * into p from public.products where id = pp.product_id;
  v_refund := coalesce((q ->> 'refund')::boolean, false);   -- 정산 시 환급 옵션(5단계) — 지금은 메시지·payload 에만

  -- 원장 → 캠페인 → 이벤트 → 주문 → 행 갱신: 한 서브블록. 어느 하나라도 실패하면 전부 되돌린다.
  begin
    v_bal := coalesce((q ->> 'balance')::integer, 0);
    if pp.amount_cel > 0 then
      v_memo := format('샘플 구매 · %s (₩%s 상당)', p.name, to_char(pp.amount_cel * pp.cel_won, 'FM999,999,999'));
      v_bal := public.celery_spend('seller', s.id, -pp.amount_cel, 'sample_purchase', v_memo, 'partner_payment', pp.id);
    end if;

    -- 5. 캠페인 (brand_id 는 campaigns_fill_brand 트리거)
    insert into public.campaigns (seller_id, product_id, status, purchased, sample_price, sample_cel, sample_cash, sample_method, sample_shipping)
    values (s.id, p.id, 'SAMPLE_PURCHASED', true, pp.amount_total, pp.amount_cel, pp.amount_cash,
            case when pp.amount_cel > 0 then 'cel' else 'cash' end, pp.shipping)
    returning id, code into v_cid, v_code;

    -- 프로토타입 confirmSampleBuy 의 pushSys 원문 (<b> 제거)
    v_body := format('🧾 인플루언서 %s(%s)가 샘플을 구매했습니다 · ₩%s%s · 브랜드는 일반 판매와 동일하게 정산%s',
      s.name, s.handle, to_char(pp.amount_total, 'FM999,999,999'),
      case when pp.amount_cel > 0
           then format(' (🥬 %s + ₩%s)', pp.amount_cel, to_char(pp.amount_cash, 'FM999,999,999'))
           else ' (현금)' end,
      case when v_refund then ' · 판매 확정 시 구매액 환급' else '' end);
    insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
    values (v_cid, 'system', 'system', 'seller', v_body, 'sample_purchased',
            jsonb_build_object('seller_name', s.name, 'handle', s.handle, 'product_name', p.name,
              'price', pp.amount_total, 'cel', pp.amount_cel, 'cash', pp.amount_cash,
              'method', case when pp.amount_cel > 0 then 'cel' else 'cash' end,
              'refund', v_refund, 'payment_id', pp.id, 'toss_order_id', pp.toss_order_id));

    -- 6. 주문 (is_sample · qty 1 · unit = 구매가 · buyer '{이름} (샘플 구매)' — 프로토타입 원문 · orders.buyer_name not null)
    insert into public.orders (
      campaign_id, customer_id, user_id, status, buyer_name, qty, unit_price, option_name, is_sample, shipping, order_name,
      payment_key, payment_method, paid_at, raw_payment, checkout_session_id)
    values (
      v_cid, null, s.user_id, 'PAID', s.name || ' (샘플 구매)', 1, pp.amount_total, null, true, pp.shipping, pp.order_name,
      v_key, v_method, v_appr, p_toss, null)
    returning id, code into v_oid, v_ocode;
    -- orders_sync_sold_qty 가 돌지만 아래 재정의로 샘플 주문은 sold_qty 에 세지 않는다.

    -- 7. 결제 행
    update public.partner_payments
       set status = 'CONFIRMED', campaign_id = v_cid, payment_key = v_key, payment_method = v_method,
           approved_at = v_appr, raw_payment = p_toss, fail_code = null, fail_message = null
     where id = pp.id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'partner_payments_payment_key_uidx' then
        return jsonb_build_object('ok', false, 'code', 'PAYMENT_KEY_CONFLICT');
      end if;
      -- campaigns_active_pair_uidx — 잠금 밖에서 생긴 진행 중 캠페인
      return jsonb_build_object('ok', false, 'code', 'ALREADY_ACTIVE');
    when raise_exception then
      if sqlerrm = 'CEL_INSUFFICIENT' then
        return jsonb_build_object('ok', false, 'code', 'CEL_INSUFFICIENT', 'cel', pp.amount_cel, 'balance', q -> 'balance');
      end if;
      raise;
  end;

  return jsonb_build_object('ok', true, 'already', false, 'payment_id', pp.id, 'campaign_id', v_cid, 'campaign_code', v_code,
    'order_id', v_oid, 'order_code', v_ocode, 'amount_total', pp.amount_total, 'amount_cel', pp.amount_cel, 'amount_cash', pp.amount_cash,
    'balance', v_bal);
end;
$$;
revoke all on function public.app_partner_payment_confirm(uuid, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.app_partner_payment_confirm(uuid, uuid, jsonb, integer) to service_role;

-- ============================================================
-- app_partner_payment_fail(p_payment_id, p_code, p_message, p_raw) — FAILED(code). CONFIRMED · REFUNDED 는 덮지 않는다.
--   FAILED → FAILED 재기록은 허용(CANCEL_PENDING → 원래 code 로 종결, 0008 resolveCancelPending 역할). 선차감이 없으므로 원장 복구 없음.
--   반환 { ok:true, already:false, status:'FAILED' } | { ok:true, already:true, status } (CONFIRMED/REFUNDED) | { ok:false, code:'NOT_FOUND' }
-- ============================================================
create or replace function public.app_partner_payment_fail(p_payment_id uuid, p_code text, p_message text default null, p_raw jsonb default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  pp public.partner_payments%rowtype;
begin
  select * into pp from public.partner_payments where id = p_payment_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if pp.status in ('CONFIRMED','REFUNDED') then
    return jsonb_build_object('ok', true, 'already', true, 'status', pp.status);
  end if;
  update public.partner_payments
     set status = 'FAILED', fail_code = coalesce(nullif(p_code, ''), 'FAILED'), fail_message = p_message,
         raw_payment = coalesce(p_raw, raw_payment)
   where id = pp.id;
  return jsonb_build_object('ok', true, 'already', false, 'status', 'FAILED', 'fail_code', coalesce(nullif(p_code, ''), 'FAILED'));
end;
$$;
revoke all on function public.app_partner_payment_fail(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_partner_payment_fail(uuid, text, text, jsonb) to service_role;

-- ============================================================
-- app_partner_payment_cancel(p_payment_id, p_seller_id, p_reason) — 인플루언서가 결제 전 그만둠 (PENDING · payment_key 없는 CONFIRMING 만)
--   payment_key 가 있는 CONFIRMING 은 돈이 잡혔을 수 있어 여기서 닫지 않는다(CONFIRMING → reconcile). CONFIRMED 는 운영 환불 경로(refund).
--   반환 { ok:true, already:false, status:'CANCELED' } | { ok:true, already:true, status } (이미 종결) | { ok:false, code:'NOT_FOUND' | 'CONFIRMING' | 'CONFIRMED' }
-- ============================================================
create or replace function public.app_partner_payment_cancel(p_payment_id uuid, p_seller_id uuid default null, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  pp public.partner_payments%rowtype;
begin
  select * into pp from public.partner_payments where id = p_payment_id for update;
  if not found or (p_seller_id is not null and pp.seller_id is distinct from p_seller_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if pp.status in ('CANCELED','FAILED','EXPIRED') then
    return jsonb_build_object('ok', true, 'already', true, 'status', pp.status);
  end if;
  if pp.status in ('CONFIRMED','REFUNDED') then
    return jsonb_build_object('ok', false, 'code', 'CONFIRMED', 'status', pp.status);
  end if;
  if pp.status = 'CONFIRMING' and pp.payment_key is not null then
    return jsonb_build_object('ok', false, 'code', 'CONFIRMING');
  end if;
  update public.partner_payments
     set status = 'CANCELED', fail_code = 'CANCELED', fail_message = coalesce(nullif(p_reason, ''), '결제를 취소했어요')
   where id = pp.id;
  return jsonb_build_object('ok', true, 'already', false, 'status', 'CANCELED');
end;
$$;
revoke all on function public.app_partner_payment_cancel(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_partner_payment_cancel(uuid, uuid, text) to service_role;

-- ============================================================
-- app_partner_payment_refund(p_payment_id, p_reason, p_raw) — 결제 후·브랜드 발송 전 취소 (§5.7 운영자 경로 · 멱등)
--   호출 전에 운영 스크립트가 토스 현금분 전액 취소를 끝낸다(amount_cash > 0). 여기서는 DB 만:
--   캠페인이 아직 SAMPLE_PURCHASED 일 때만 → 🥬 원장 +amount_cel('sample_refund') → campaigns DECLINED(decision_reason) + 이벤트
--   → orders(is_sample) CANCELED(refund_amount = amount_cash · refund_actor 'admin' · raw_cancel — REFUNDED 는 0004 제약으로 불가)
--   → partner_payments REFUNDED. 두 번 실행해도 원장 1행(already:true).
--   반환 { ok:true, already:false, campaign_id, order_id, amount_cel, amount_cash, balance }
--        { ok:true, already:true, campaign_id }
--        { ok:false, code:'NOT_FOUND' | 'NOT_REFUNDABLE'(status ≠ CONFIRMED, status) | 'NOT_CANCELABLE'(브랜드가 이미 발송 등, campaign_status) }
-- ============================================================
create or replace function public.app_partner_payment_refund(p_payment_id uuid, p_reason text default null, p_raw jsonb default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  pp      public.partner_payments%rowtype;
  c       public.campaigns%rowtype;
  p       public.products%rowtype;
  v_bal   integer;
  v_oid   uuid;
  v_reason text := coalesce(nullif(p_reason, ''), '샘플 구매 취소 (브랜드 발송 전)');
begin
  select * into pp from public.partner_payments where id = p_payment_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if pp.status = 'REFUNDED' then
    return jsonb_build_object('ok', true, 'already', true, 'campaign_id', pp.campaign_id);
  end if;
  if pp.status <> 'CONFIRMED' or pp.campaign_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_REFUNDABLE', 'status', pp.status);
  end if;
  select * into c from public.campaigns where id = pp.campaign_id for update;
  if not found or c.status <> 'SAMPLE_PURCHASED' then
    return jsonb_build_object('ok', false, 'code', 'NOT_CANCELABLE', 'campaign_status', c.status);
  end if;
  select * into p from public.products where id = pp.product_id;

  v_bal := public.celery_spend('seller', pp.seller_id, pp.amount_cel, 'sample_refund',
             format('샘플 구매 환급 · %s', coalesce(p.name, '')), 'partner_payment', pp.id);

  update public.campaigns set status = 'DECLINED', decision_reason = v_reason where id = c.id;
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (c.id, 'system', 'system', 'admin',
          format('샘플 구매가 취소되었습니다 · ₩%s 환불%s', to_char(pp.amount_total, 'FM999,999,999'),
                 case when pp.amount_cel > 0 then format(' (🥬 %s 복구 + ₩%s)', pp.amount_cel, to_char(pp.amount_cash, 'FM999,999,999')) else '' end),
          'sample_purchase_canceled',
          jsonb_build_object('reason', v_reason, 'cel', pp.amount_cel, 'cash', pp.amount_cash, 'payment_id', pp.id));

  update public.orders
     set status = 'CANCELED', refunded_at = now(), refund_reason = v_reason, refund_actor = 'admin',
         refund_amount = pp.amount_cash, raw_cancel = coalesce(p_raw, raw_cancel)
   where campaign_id = c.id and is_sample and status = 'PAID'
   returning id into v_oid;

  update public.partner_payments
     set status = 'REFUNDED', refunded_at = now(), raw_cancel = coalesce(p_raw, raw_cancel), fail_code = null, fail_message = v_reason
   where id = pp.id;

  return jsonb_build_object('ok', true, 'already', false, 'campaign_id', c.id, 'order_id', v_oid,
    'amount_cel', pp.amount_cel, 'amount_cash', pp.amount_cash, 'balance', v_bal);
end;
$$;
revoke all on function public.app_partner_payment_refund(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_partner_payment_refund(uuid, text, jsonb) to service_role;

-- ============================================================
-- app_partner_payments_expire(p_grace) — 만료 정리 (크론 · reconcile). PENDING 과 payment_key 없는 CONFIRMING 만 EXPIRED.
--   payment_key 가 있는 CONFIRMING 은 토스 재조회로만 종결(app_partner_payments_stale). 🥬 는 선차감이 없어 만료로 잠기지 않는다.
-- ============================================================
create or replace function public.app_partner_payments_expire(p_grace interval default interval '0')
returns integer
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  n integer;
begin
  update public.partner_payments
     set status = 'EXPIRED', fail_code = coalesce(fail_code, 'EXPIRED'), fail_message = coalesce(fail_message, '결제 시간이 만료되었습니다')
   where (status = 'PENDING' or (status = 'CONFIRMING' and payment_key is null))
     and expires_at < now() - p_grace;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.app_partner_payments_expire(interval) from public, anon, authenticated;
grant execute on function public.app_partner_payments_expire(interval) to service_role;

-- ============================================================
-- app_partner_payments_stale(p_age, p_limit) — reconcile 입력: payment_key 있는 CONFIRMING(고착) + FAILED(CANCEL_PENDING)
-- ============================================================
create or replace function public.app_partner_payments_stale(p_age interval default interval '2 minutes', p_limit integer default 100)
returns setof jsonb
language sql stable
security definer set search_path = public
as $$
  select public.partner_payment_brief(pp)
    from public.partner_payments pp
   where (pp.status = 'CONFIRMING' and pp.payment_key is not null and pp.updated_at < now() - p_age)
      or (pp.status = 'FAILED' and pp.fail_code = 'CANCEL_PENDING' and pp.payment_key is not null)
   order by pp.updated_at
   limit p_limit
$$;
revoke all on function public.app_partner_payments_stale(interval, integer) from public, anon, authenticated;
grant execute on function public.app_partner_payments_stale(interval, integer) to service_role;

-- ============================================================
-- recalc_campaign_sold_qty(campaign) 재정의 — 0004 정의 + `and not o.is_sample` (§5.4 마지막 행)
--   0004 트리거 orders_sync_sold_qty 는 PAID 주문을 is_sample 구분 없이 합산해 샘플 주문 1건이 sold_qty=1 로 잡혔다 →
--   LIVE 잔여(qty − sold_qty)·소프트 예약이 1개 적게 계산되는 불일치. 샘플 주문은 정산의 sample_net 으로만 집계한다.
--   create or replace 라 트리거 연결·권한(0004 revoke)은 그대로다. 적용 직후 purchased 캠페인(시드 c2 포함)을 재계산한다.
-- ============================================================
create or replace function public.recalc_campaign_sold_qty(p_campaign uuid)
returns void
language sql
set search_path = public
as $$
  update public.campaigns c
     set sold_qty = coalesce((select sum(o.qty) from public.orders o
                              where o.campaign_id = p_campaign and o.status = 'PAID' and not o.is_sample), 0)
   where c.id = p_campaign;
$$;

select public.recalc_campaign_sold_qty(c.id) from public.campaigns c where c.purchased;
