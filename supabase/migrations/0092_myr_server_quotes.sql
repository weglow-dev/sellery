-- ============================================================
-- 0092 — MYR 화면이 서버 판정을 다시 계산하지 않게(백엔드 원칙 1 · 2026-11-11 대표 지시)
--   화면(장바구니 · 체크아웃 요약 · 상품 페이지 공구 · 콘솔 정산 미리보기 · 공구 미리보기 · 환불 버튼)이 TS 로 따로 하던 계산을
--   서버 함수 하나로 모으고, 실제 처리(결제 · 정산 · 환불 가드)도 같은 함수를 부르게 한다. 결과(결제 금액 · 정산금 · 가드)는 바뀌지 않는다.
--
--   새 함수
--     myr_shipping_rule()                       배송비 설정 { free_over, fee } — myr_shipping_fee · 장바구니 견적이 이 한 곳에서 읽는다
--     myr_line_price(p, option_index, gb_code)  줄 단가 { unit_price, base_price, groupbuy_id, groupbuy_code, groupbuy_state } — 진행 중 공구면 공구가
--     myr_app_cart_quote(lines)                 장바구니 · 체크아웃 요약 견적 — 줄 단가 · 상품 합계 · 배송비 · 무료배송까지 남은 금액(돈은 움직이지 않는다)
--     myr_settlement_amount(base, pct)          정산금 = max(base, 0) × pct% 버림 — 정산 회차 · 예상 · 콘솔 미리보기
--     myr_app_settlement_unit(price)            콘솔 상품 등록 "정산 ₩N / 개" · 정산 비율 문구
--     myr_app_groupbuy_preview(seller, product, pct)  콘솔 공구 할인율 미리보기 — 실제 공구와 같은 단가(옵션 0번) · myr_groupbuy_price
--     myr_line_refund_path(order, item)         줄 환불 길 instant(바로 환불) · claim(교환·환불 요청) · null(불가)
--
--   클라우드 보정(0078 정의 그대로 다시 만들기 — 0078 초안이 먼저 올라가 클라우드에 없던 함수)
--     myr_order_claim_status(order) · myr_app_claims_of_user(user, limit)
--
--   바뀌는 함수(판정 부분만 새 함수 호출로 — 나머지 그대로)
--     myr_shipping_fee              0058 → myr_shipping_rule
--     myr_app_create_checkout       0086 → 단가 · 공구를 myr_line_price 로
--     myr_settlement_product_calc   0089 → 정산금을 myr_settlement_amount 로
--     myr_app_refund_precheck       0077 → 고객 셀프 환불 가드를 myr_line_refund_path 로
--     myr_app_claim_open            0078 → 요청 가드(NOT_PREPARED)를 myr_line_refund_path 로
--     myr_order_json                0078 → 줄마다 refund_path
--
--   권한: 새 security definer RPC 는 service role 만(anon · authenticated EXECUTE 회수). 내부 함수도 anon · authenticated 회수.
--   테스트: supabase/tests/myr_server_quotes.test.sql(새) + 기존 체크아웃 · 공구 · 정산 · 환불 · 요청 테스트가 고치지 않고 통과(계산 결과 불변).
-- ============================================================

-- ---------- 클라우드 보정 — 0078 의 함수 2개 ----------
-- 0078 은 PR 작업 중간 버전이 클라우드(sellery)에 먼저 올라가, 그 뒤 0078 에 더해진 이 두 함수가 클라우드에 없다(같은 번호라 다시 적용되지 않음 · 2026-11-11 db push 실패로 발견).
-- 정의는 0078 그대로 — 로컬 · 새 DB 에서는 같은 내용으로 다시 만들 뿐(변화 없음). 클라우드의 myr_order_json(0077 버전)은 아래 0092 정의가 덮는다.
create or replace function public.myr_order_claim_status(p_order_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select case when bool_or(r.status = 'pending') then 'pending' when bool_or(r.status = 'progress') then 'progress' end
    from public.myr_refund_requests r
   where r.order_id = p_order_id and r.status in ('pending', 'progress')
$$;
revoke all on function public.myr_order_claim_status(uuid) from public, anon, authenticated;

create or replace function public.myr_app_claims_of_user(p_user uuid, p_limit integer default 50)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select jsonb_agg(public.myr_refund_request_json(r) order by r.created_at desc)
      from (select r.* from public.myr_refund_requests r join public.myr_orders o on o.id = r.order_id
             where o.user_id = p_user and p_user is not null
             order by r.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) r
  ), '[]'::jsonb)
$$;
revoke all on function public.myr_app_claims_of_user(uuid, integer) from public, anon, authenticated;
grant execute on function public.myr_app_claims_of_user(uuid, integer) to service_role;

-- ---------- 배송비 ----------
create or replace function public.myr_shipping_rule()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'free_over', coalesce((select (ps.value ->> 'free_over')::int from public.platform_settings ps where ps.key = 'myr_shipping'), 50000),
    'fee',       coalesce((select (ps.value ->> 'fee')::int from public.platform_settings ps where ps.key = 'myr_shipping'), 3000))
$$;
revoke all on function public.myr_shipping_rule() from public, anon, authenticated;

-- 0058 정의와 같은 결과 — 설정을 myr_shipping_rule 한 곳에서 읽는다
create or replace function public.myr_shipping_fee(p_items_amount integer)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select case
    when p_items_amount <= 0 then 0
    when p_items_amount >= (r ->> 'free_over')::int then 0
    else (r ->> 'fee')::int
  end
  from (select public.myr_shipping_rule() as r) x
$$;
revoke all on function public.myr_shipping_fee(integer) from public, anon, authenticated;
grant execute on function public.myr_shipping_fee(integer) to service_role;

-- ---------- 줄 단가(공구 포함) ----------
-- 공구는 이 상품의 공구이고 지금 진행 중일 때만 공구가. 아니면 기본가. 옵션이 틀리면 unit_price null
create or replace function public.myr_line_price(p public.myr_products, p_option_index integer, p_gb_code text)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  with b as (select public.myr_product_unit_price(p, p_option_index) as base),
       g as (select g1.*, public.myr_groupbuy_state(g1) as st from public.myr_groupbuys g1
              where p_gb_code is not null and g1.code = p_gb_code and g1.product_id = p.id)
  select jsonb_build_object(
    'base_price', b.base,
    'unit_price', case when b.base is null then null
                       when g.st = 'active' then public.myr_groupbuy_price(b.base, g.discount_pct)
                       else b.base end,
    'groupbuy_id', case when g.st = 'active' then g.id end,
    'groupbuy_code', g.code,
    'groupbuy_state', g.st)
  from b left join g on true
$$;
revoke all on function public.myr_line_price(public.myr_products, integer, text) from public, anon, authenticated;

-- ---------- 장바구니 · 체크아웃 요약 견적 ----------
-- p_lines = [{ code, option_index?, qty, gb? }] (50줄까지) → { ok, lines:[{ code, option_index, qty, unit_price, base_price, line_amount, base_amount, groupbuy_state, groupbuy_code }],
--   items_amount, shipping_fee, free_over, free_shipping_left }. 샵에 없는 상품 · 틀린 옵션은 unit_price null(합계에서 뺀다 · 결제는 체크아웃이 다시 막는다).
-- 거부: BAD_LINES
create or replace function public.myr_app_cart_quote(p_lines jsonb)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  l       jsonb;
  p       public.myr_products%rowtype;
  v_code  text;
  v_opt   integer;
  v_qty   integer;
  v_price jsonb;
  v_unit  integer;
  v_out   jsonb := '[]'::jsonb;
  v_items integer := 0;
  v_rule  jsonb := public.myr_shipping_rule();
  v_fee   integer;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 50 then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    v_code := lower(btrim(coalesce(l ->> 'code', '')));
    v_opt  := case when (l ->> 'option_index') is null then 0 when (l ->> 'option_index') ~ '^\d{1,3}$' then (l ->> 'option_index')::int else -1 end;
    v_qty  := case when (l ->> 'qty') ~ '^\d{1,3}$' then (l ->> 'qty')::int else -1 end;
    if v_code !~ '^[a-z0-9][a-z0-9-]{0,47}$' or v_opt < 0 or v_qty < 1 or v_qty > 99 then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
    if (l ->> 'gb') is not null and (l ->> 'gb') !~ '^[a-z0-9]{6,16}$' then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
    select p1.* into p from public.myr_products p1 join public.sellers s on s.id = p1.seller_id and s.active
     where p1.code = v_code and p1.deleted_at is null and p1.status = 'listed';
    if not found then
      v_out := v_out || jsonb_build_object('code', v_code, 'option_index', v_opt, 'qty', v_qty, 'unit_price', null, 'base_price', null, 'line_amount', null,
                                           'base_amount', null, 'groupbuy_state', null, 'groupbuy_code', null);
      continue;
    end if;
    v_price := public.myr_line_price(p, v_opt, nullif(l ->> 'gb', ''));
    v_unit := (v_price ->> 'unit_price')::integer;
    v_out := v_out || (jsonb_build_object('code', v_code, 'option_index', v_opt, 'qty', v_qty, 'line_amount', v_unit * v_qty,
                                          'base_amount', (v_price ->> 'base_price')::integer * v_qty)
                       || (v_price - 'groupbuy_id'));
    v_items := v_items + coalesce(v_unit * v_qty, 0);
  end loop;
  v_fee := public.myr_shipping_fee(v_items);
  return jsonb_build_object('ok', true, 'lines', v_out, 'items_amount', v_items, 'shipping_fee', v_fee,
                            'free_over', (v_rule ->> 'free_over')::int,
                            'free_shipping_left', case when v_items > 0 and v_fee > 0 then greatest((v_rule ->> 'free_over')::int - v_items, 0) else 0 end);
end;
$$;
revoke all on function public.myr_app_cart_quote(jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_cart_quote(jsonb) to service_role;

-- ---------- 정산금 ----------
create or replace function public.myr_settlement_amount(p_base bigint, p_pct integer)
returns integer
language sql
immutable
as $$
  select (greatest(p_base, 0) * p_pct / 100)::integer
$$;
revoke all on function public.myr_settlement_amount(bigint, integer) from public, anon, authenticated;

-- 콘솔 상품 등록 "정산 ₩N / 개" · "판매가의 N%" — 회차와 같은 비율 · 같은 식
create or replace function public.myr_app_settlement_unit(p_price integer)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object('pct', public.myr_settlement_pct(),
                            'amount', case when p_price is null or p_price <= 0 then 0 else public.myr_settlement_amount(p_price, public.myr_settlement_pct()) end)
$$;
revoke all on function public.myr_app_settlement_unit(integer) from public, anon, authenticated;
grant execute on function public.myr_app_settlement_unit(integer) to service_role;

-- ---------- 공구가 미리보기 ----------
-- 콘솔 [공구 링크] 할인율 미리보기 — 실제 공구(myr_groupbuy_product_json)와 같은 단가(옵션 0번 · myr_product_unit_price) · 같은 공구가 식(myr_groupbuy_price).
-- 내 상품만(seller 는 세션에서). 할인율 허용 범위는 공구 생성(myr_app_seller_groupbuy_create)이 정한다 — 여기는 0~99 밖만 BAD_PCT.
-- 거부: NOT_FOUND(없거나 남의 상품) · BAD_PCT
create or replace function public.myr_app_groupbuy_preview(p_seller uuid, p_product_id uuid, p_pct integer)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select case
    when p.id is null then jsonb_build_object('ok', false, 'code', 'NOT_FOUND')
    when p_pct is null or p_pct < 0 or p_pct > 99 then jsonb_build_object('ok', false, 'code', 'BAD_PCT')
    else jsonb_build_object('ok', true,
                            'base_price', coalesce(public.myr_product_unit_price(p, 0), p.price),
                            'price', public.myr_groupbuy_price(coalesce(public.myr_product_unit_price(p, 0), p.price), p_pct))
  end
  from (select 1) one
  left join public.myr_products p on p.id = p_product_id and p.seller_id = p_seller and p.deleted_at is null
$$;
revoke all on function public.myr_app_groupbuy_preview(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.myr_app_groupbuy_preview(uuid, uuid, integer) to service_role;

-- ---------- 줄 환불 길 ----------
-- instant = 고객 셀프 바로 환불(결제완료 · 발주 전 줄 · 입금 전 주문) · claim = 교환·환불 요청(배송준비중 이후 줄) · null = 불가(취소 · 다 환불 · 주문 상태)
create or replace function public.myr_line_refund_path(o public.myr_orders, i public.myr_order_items)
returns text
language sql
stable
as $$
  select case
    when o.status not in ('PAID', 'PARTIAL_REFUNDED', 'WAITING_DEPOSIT') then null
    when i.status = 'CANCELED' or i.qty - i.refunded_qty <= 0 then null
    when i.ship_status = 'PAID' then 'instant'
    when o.status = 'WAITING_DEPOSIT' then null
    else 'claim' end
$$;
revoke all on function public.myr_line_refund_path(public.myr_orders, public.myr_order_items) from public, anon, authenticated;

-- ============================================================
-- 바뀌는 함수 — 정의는 앞 번호 그대로, 판정 부분만 위 함수로
-- ============================================================

-- 0086 정의 + 단가 · 공구 = myr_line_price
create or replace function public.myr_app_create_checkout(
  p_user_id uuid, p_customer_id uuid, p_buyer jsonb, p_shipping jsonb, p_lines jsonb, p_toss_order_id text, p_prev_checkout_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c_max_qty   constant integer := 9;
  c_max_lines constant integer := 20;
  l            jsonb;
  v_code       text;
  v_opt        integer;
  v_qty        integer;
  v_merged     jsonb := '{}'::jsonb;            -- key "code#opt" → qty
  v_gbs        jsonb := '{}'::jsonb;            -- key → 공구 코드(줄에 있으면)
  v_expect     jsonb := '{}'::jsonb;            -- key → 화면이 보여 준 단가(줄에 있으면)
  v_key        text;
  v_problems   jsonb := '[]'::jsonb;
  v_changes    jsonb := '[]'::jsonb;
  v_rows       jsonb := '[]'::jsonb;            -- 통과한 줄 [{product_id, seller_id, product_name, option_index, option_name, qty, unit_price, groupbuy_id}]
  p            public.myr_products%rowtype;
  s            public.sellers%rowtype;
  v_price      jsonb;
  v_unit       integer;
  v_gb_id      uuid;
  v_gb_code    text;
  v_optname    text;
  v_left       integer;
  v_own        integer;
  v_items_amt  integer := 0;
  v_fee        integer;
  v_name       text;
  v_n          integer := 0;
  v_order_name text;
  c            public.myr_checkouts%rowtype;
  r            jsonb;
begin
  if p_buyer is null or coalesce(btrim(p_buyer ->> 'name'), '') = '' then return jsonb_build_object('ok', false, 'code', 'NO_BUYER'); end if;
  if p_shipping is null or jsonb_typeof(p_shipping) <> 'object' then return jsonb_build_object('ok', false, 'code', 'BAD_SHIPPING'); end if;
  if p_toss_order_id is null or p_toss_order_id !~ '^[A-Za-z0-9_-]{6,64}$' then return jsonb_build_object('ok', false, 'code', 'BAD_ORDER_ID'); end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > c_max_lines then
    return jsonb_build_object('ok', false, 'code', 'BAD_LINES');
  end if;

  -- 1) 같은 (code, option_index) 합치기 + 형식 검사 (gb · price 는 처음 나온 값)
  for l in select * from jsonb_array_elements(p_lines) loop
    v_code := lower(btrim(coalesce(l ->> 'code', '')));
    v_opt  := case when (l ->> 'option_index') is null then 0 when (l ->> 'option_index') ~ '^\d{1,3}$' then (l ->> 'option_index')::int else -1 end;
    v_qty  := case when (l ->> 'qty') ~ '^\d{1,3}$' then (l ->> 'qty')::int else -1 end;
    if v_code !~ '^[a-z0-9][a-z0-9-]{0,47}$' or v_opt < 0 or v_qty < 1 or v_qty > c_max_qty then
      return jsonb_build_object('ok', false, 'code', 'BAD_LINES');
    end if;
    if (l ->> 'gb') is not null and (l ->> 'gb') !~ '^[a-z0-9]{6,16}$' then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
    if (l ->> 'price') is not null and (l ->> 'price') !~ '^\d{1,9}$' then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
    v_key := v_code || '#' || v_opt;
    v_qty := v_qty + coalesce((v_merged ->> v_key)::int, 0);
    if v_qty > c_max_qty then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
    v_merged := v_merged || jsonb_build_object(v_key, v_qty);
    if (l ->> 'gb') is not null and not (v_gbs ? v_key) then v_gbs := v_gbs || jsonb_build_object(v_key, l ->> 'gb'); end if;
    if (l ->> 'price') is not null and not (v_expect ? v_key) then v_expect := v_expect || jsonb_build_object(v_key, (l ->> 'price')::int); end if;
  end loop;

  -- 2) 줄마다 상품 검증 · 단가(공구) · 잔여
  for v_key, v_qty in select key, value::int from jsonb_each_text(v_merged) order by key loop
    v_code := split_part(v_key, '#', 1);
    v_opt  := split_part(v_key, '#', 2)::int;
    select * into p from public.myr_products where code = v_code and deleted_at is null;
    if not found then
      v_problems := v_problems || jsonb_build_object('code', v_code, 'reason', 'NOT_FOUND');
      continue;
    end if;
    select * into s from public.sellers where id = p.seller_id;
    if p.status <> 'listed' or not coalesce(s.active, false) then
      v_problems := v_problems || jsonb_build_object('code', v_code, 'reason', 'NOT_AVAILABLE');
      continue;
    end if;
    -- 단가 · 공구 — 장바구니 견적(myr_app_cart_quote)과 같은 myr_line_price 한 곳(0092)
    v_gb_code := v_gbs ->> v_key;
    v_price := public.myr_line_price(p, v_opt, v_gb_code);
    v_unit := (v_price ->> 'unit_price')::integer;
    if v_unit is null then
      v_problems := v_problems || jsonb_build_object('code', v_code, 'reason', 'BAD_OPTION');
      continue;
    end if;
    v_optname := case when jsonb_typeof(p.options) = 'array' and jsonb_array_length(p.options) > 0 then coalesce(p.options -> v_opt ->> 'n', '') else '' end;
    v_gb_id := nullif(v_price ->> 'groupbuy_id', '')::uuid;
    if (v_expect ? v_key) and (v_expect ->> v_key)::int <> v_unit then
      v_changes := v_changes || jsonb_build_object('code', v_code, 'option_index', v_opt, 'was', (v_expect ->> v_key)::int, 'now', v_unit,
                                                   'groupbuy', case when v_gb_code is null then null when v_gb_id is null then 'inactive' else 'active' end);
    end if;
    -- 본인 PENDING 예약분(곧 SUPERSEDED) 은 되돌린다
    if p_user_id is not null then
      select coalesce(sum(ci.qty), 0) into v_own from public.myr_checkout_items ci join public.myr_checkouts c2 on c2.id = ci.checkout_id
       where ci.product_id = p.id and c2.user_id = p_user_id and c2.status = 'PENDING' and c2.expires_at > now();
    elsif p_prev_checkout_id is not null then
      select coalesce(sum(ci.qty), 0) into v_own from public.myr_checkout_items ci join public.myr_checkouts c2 on c2.id = ci.checkout_id
       where ci.product_id = p.id and c2.id = p_prev_checkout_id and c2.user_id is null and c2.status = 'PENDING' and c2.expires_at > now();
    else
      v_own := 0;
    end if;
    v_left := p.stock - p.sold_qty - greatest(public.myr_app_checkout_reserved(p.id) - v_own, 0);
    if v_left < v_qty then
      v_problems := v_problems || jsonb_build_object('code', v_code, 'reason', 'SOLD_OUT', 'left', greatest(v_left, 0));
      continue;
    end if;
    v_rows := v_rows || jsonb_build_object('product_id', p.id, 'seller_id', p.seller_id, 'product_name', p.name, 'option_index', v_opt,
                                           'option_name', v_optname, 'qty', v_qty, 'unit_price', v_unit, 'groupbuy_id', v_gb_id);
    v_items_amt := v_items_amt + v_unit * v_qty;
    v_n := v_n + 1;
    if v_name is null then v_name := p.name; end if;
  end loop;

  if jsonb_array_length(v_problems) > 0 then return jsonb_build_object('ok', false, 'code', 'LINES_REJECTED', 'items', v_problems); end if;
  if jsonb_array_length(v_changes) > 0 then return jsonb_build_object('ok', false, 'code', 'PRICE_CHANGED', 'items', v_changes); end if;
  if v_items_amt < 100 then return jsonb_build_object('ok', false, 'code', 'AMOUNT_TOO_SMALL'); end if;
  v_fee := public.myr_shipping_fee(v_items_amt);
  v_order_name := left(v_name || case when v_n > 1 then ' 외 ' || (v_n - 1) || '건' else '' end, 100);

  -- 3) supersede (모든 검증 뒤 · insert 직전)
  if p_user_id is not null then
    update public.myr_checkouts set status = 'EXPIRED', fail_code = 'SUPERSEDED', fail_message = '새 결제 시도로 대체되었습니다'
     where user_id = p_user_id and status = 'PENDING';
  elsif p_prev_checkout_id is not null then
    update public.myr_checkouts set status = 'EXPIRED', fail_code = 'SUPERSEDED', fail_message = '새 결제 시도로 대체되었습니다'
     where id = p_prev_checkout_id and user_id is null and status = 'PENDING';
  end if;

  -- 4) insert
  insert into public.myr_checkouts (toss_order_id, user_id, customer_id, buyer_name, buyer_phone, buyer_email, shipping, items_amount, shipping_fee, order_name)
  values (p_toss_order_id, p_user_id, p_customer_id, left(btrim(p_buyer ->> 'name'), 50), nullif(p_buyer ->> 'phone', ''), nullif(p_buyer ->> 'email', ''),
          p_shipping, v_items_amt, v_fee, v_order_name)
  returning * into c;
  for r in select * from jsonb_array_elements(v_rows) loop
    insert into public.myr_checkout_items (checkout_id, product_id, seller_id, product_name, option_index, option_name, qty, unit_price, groupbuy_id)
    values (c.id, (r ->> 'product_id')::uuid, (r ->> 'seller_id')::uuid, r ->> 'product_name', (r ->> 'option_index')::int, r ->> 'option_name', (r ->> 'qty')::int,
            (r ->> 'unit_price')::int, nullif(r ->> 'groupbuy_id', '')::uuid);
  end loop;
  return jsonb_build_object('ok', true, 'checkout', public.myr_checkout_brief(c));
end;
$$;
revoke all on function public.myr_app_create_checkout(uuid, uuid, jsonb, jsonb, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_create_checkout(uuid, uuid, jsonb, jsonb, jsonb, text, uuid) to service_role;

-- 0089 정의 + 정산금 = myr_settlement_amount
create or replace function public.myr_settlement_product_calc(p_product_id uuid, p_sales integer, p_refund_adj integer)
returns table (pct integer, carry_in integer, base integer, carry_out integer, settle integer, held boolean)
language sql
stable
as $$
  with c as (
    select public.myr_settlement_pct() as pct,
           coalesce((select r.carry_out from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
                      where r.product_id = p_product_id order by u.month desc limit 1), 0) as carry_in
  )
  select c.pct, c.carry_in, p_sales - p_refund_adj + c.carry_in, least(p_sales - p_refund_adj + c.carry_in, 0),
         public.myr_settlement_amount(p_sales - p_refund_adj + c.carry_in, c.pct),
         -- 원장이 없으면 보류. 원장이 있는 상품의 지난 보류는 회차 · 예상이 이 계산 전에 먼저 해제한다(보류가 원장 없이만 남는다)
         not public.myr_mfg_has_ledger(p_product_id)
    from c
$$;
revoke all on function public.myr_settlement_product_calc(uuid, integer, integer) from public, anon, authenticated;

-- 0077 정의 + 고객 셀프 환불 가드 = myr_line_refund_path
create or replace function public.myr_app_refund_precheck(p_order_id uuid, p_items jsonb, p_actor text, p_actor_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  o          public.myr_orders%rowtype;
  r          record;
  v_items    jsonb := '[]'::jsonb;
  v_problems jsonb := '[]'::jsonb;
  v_amount   integer := 0;
  v_req_total integer := 0;
  v_left_total integer;
  v_full     boolean;
begin
  if p_actor is null or p_actor not in ('customer','seller','admin','system') then return jsonb_build_object('ok', false, 'code', 'BAD_ACTOR'); end if;
  select * into o from public.myr_orders where id = p_order_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;

  -- 소유·권한 (존재 여부를 흘리지 않게 customer 의 남의 주문은 NOT_FOUND)
  if p_actor = 'customer' then
    if p_actor_id is null or not (o.user_id = p_actor_id or (o.user_id is null and o.customer_id = p_actor_id)) then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;
  end if;

  if o.status in ('REFUNDED','CANCELED') then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if o.status not in ('PAID','PARTIAL_REFUNDED','WAITING_DEPOSIT') then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  -- 고객 셀프 환불은 발주(배송준비중) 전 줄만 — 0077 에서 주문 운송장 기준 → 줄 배송 상태 기준(아래 줄마다)

  for r in select * from public.myr_refund_lines(o, p_items) loop
    if r.problem = 'BAD_FORMAT' then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS'); end if;
    if r.problem is not null then
      v_problems := v_problems || jsonb_build_object('item_id', r.item_id, 'reason', r.problem, 'left', r.remaining);
      continue;
    end if;
    -- 고객 셀프 환불은 바로 환불 줄만 — 줄 길 판정은 myr_line_refund_path 한 곳(샵 화면 · 요청 가드와 같다 · 0092)
    if p_actor = 'customer' and exists (select 1 from public.myr_order_items x where x.id = r.item_id and public.myr_line_refund_path(o, x) is distinct from 'instant') then
      return jsonb_build_object('ok', false, 'code', 'SHIPPED');
    end if;
    if p_actor = 'seller' and (p_actor_id is null or r.seller_id is distinct from p_actor_id) then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
    end if;
    v_items := v_items || jsonb_build_object('item_id', r.item_id, 'qty', r.qty, 'amount', r.unit_price * r.qty, 'seller_id', r.seller_id);
    v_amount := v_amount + r.unit_price * r.qty;
    v_req_total := v_req_total + r.qty;
  end loop;
  if jsonb_array_length(v_problems) > 0 then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS', 'items', v_problems); end if;
  if v_req_total = 0 then return jsonb_build_object('ok', false, 'code', 'NOTHING_LEFT'); end if;

  -- 이번 환불로 주문이 전부 환불되면 배송비도 돌려준다(§9-11 기본) — 배송비는 아직 환불 안 됐을 때 한 번만
  select coalesce(sum(i.qty - i.refunded_qty), 0) into v_left_total from public.myr_order_items i where i.order_id = o.id and i.status <> 'CANCELED';
  v_full := v_req_total >= v_left_total;
  if v_full and o.shipping_fee > 0 and o.refund_amount + v_amount + o.shipping_fee <= o.amount then v_amount := v_amount + o.shipping_fee; end if;

  return jsonb_build_object('ok', true, 'order_code', o.code, 'order_status', o.status, 'payment_key', o.payment_key,
                            'amount', v_amount, 'deposit', o.status = 'WAITING_DEPOSIT', 'full', v_full, 'items', v_items);
end;
$$;
revoke all on function public.myr_app_refund_precheck(uuid, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_refund_precheck(uuid, jsonb, text, uuid) to service_role;

-- 0078 정의 + 요청 가드 = myr_line_refund_path
create or replace function public.myr_app_claim_open(p_order_id uuid, p_actor_id uuid, p_kind text, p_reason text, p_lines jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o          public.myr_orders%rowtype;
  i          public.myr_order_items%rowtype;
  l          jsonb;
  v_id       uuid;
  v_qty      integer;
  v_note     text;
  v_photos   text[];
  v_problems jsonb := '[]'::jsonb;
  v_seen     uuid[] := '{}';
  v_out      jsonb := '[]'::jsonb;
  v_code     text;
  v_batch    uuid := gen_random_uuid();
begin
  if p_kind is null or p_kind not in ('refund','exchange') then return jsonb_build_object('ok', false, 'code', 'BAD_KIND'); end if;
  if p_reason is null or p_reason not in ('단순 변심','파손 · 누액','오배송') then return jsonb_build_object('ok', false, 'code', 'BAD_REASON'); end if;
  if p_reason = '단순 변심' and p_kind = 'exchange' then return jsonb_build_object('ok', false, 'code', 'EXCHANGE_NOT_ALLOWED'); end if;
  select * into o from public.myr_orders where id = p_order_id for update;
  if not found or p_actor_id is null or not (o.user_id = p_actor_id or (o.user_id is null and o.customer_id = p_actor_id)) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if o.status not in ('PAID','PARTIAL_REFUNDED') then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then return jsonb_build_object('ok', false, 'code', 'NOTHING'); end if;
  if jsonb_array_length(p_lines) > 20 then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS'); end if;

  -- 1) 검사(하나라도 걸리면 아무것도 만들지 않는다)
  for l in select * from jsonb_array_elements(p_lines) loop
    if (l ->> 'item_id') !~ '^[0-9a-f-]{36}$' or (l ->> 'qty') !~ '^\d{1,2}$' then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS'); end if;
    v_id := (l ->> 'item_id')::uuid;
    v_qty := (l ->> 'qty')::int;
    v_photos := coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(l -> 'photos') = 'array' then l -> 'photos' else '[]'::jsonb end) x where x <> ''), '{}');
    select * into i from public.myr_order_items where id = v_id and order_id = o.id;
    if not found or v_id = any (v_seen) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'NOT_IN_ORDER');
    elsif i.status = 'CANCELED' then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'CANCELED');
    elsif v_qty < 1 then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'BAD_QTY');
    elsif v_qty > i.qty - i.refunded_qty then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'TOO_MANY');
    elsif public.myr_line_refund_path(o, i) is distinct from 'claim' then
      -- 결제완료(발주 전) 줄은 요청이 아니라 바로 환불 — 줄 길 판정은 myr_line_refund_path 한 곳(0092)
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'NOT_PREPARED');
    elsif exists (select 1 from public.myr_refund_requests q where q.order_item_id = v_id and q.status in ('pending','progress')) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'OPEN_EXISTS');
    elsif cardinality(v_photos) > 3 or exists (select 1 from unnest(v_photos) p where p !~ ('^' || o.id::text || '/' || v_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'BAD_PHOTOS');
    elsif p_reason in ('파손 · 누액','오배송') and cardinality(v_photos) = 0 then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'PHOTO_REQUIRED');
    end if;
    v_seen := v_seen || v_id;
  end loop;
  if jsonb_array_length(v_problems) > 0 then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS', 'items', v_problems); end if;

  -- 2) 만들기
  for l in select * from jsonb_array_elements(p_lines) loop
    v_id := (l ->> 'item_id')::uuid;
    v_note := nullif(btrim(left(l ->> 'note', 300)), '');
    v_photos := coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(l -> 'photos') = 'array' then l -> 'photos' else '[]'::jsonb end) x where x <> ''), '{}');
    insert into public.myr_refund_requests (batch, order_id, order_item_id, seller_id, product_id, kind, qty, reason, note, photos)
    select v_batch, o.id, i2.id, i2.seller_id, i2.product_id, p_kind, (l ->> 'qty')::int, p_reason, v_note, v_photos
      from public.myr_order_items i2 where i2.id = v_id
    returning code into v_code;
    v_out := v_out || jsonb_build_object('code', v_code, 'item_id', v_id);
  end loop;
  return jsonb_build_object('ok', true, 'order_code', o.code, 'requests', v_out);
end;
$$;
revoke all on function public.myr_app_claim_open(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_claim_open(uuid, uuid, text, text, jsonb) to service_role;

-- 0078 정의 + 줄마다 refund_path
create or replace function public.myr_order_json(o public.myr_orders, p_full boolean)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id, 'code', o.code, 'status', o.status,
    'amount', o.amount, 'items_amount', o.items_amount, 'shipping_fee', o.shipping_fee, 'refund_amount', o.refund_amount,
    'order_name', o.order_name, 'payment_method', o.payment_method, 'paid_at', o.paid_at, 'created_at', o.created_at,
    'deposit_due_at', o.deposit_due_at,
    'deposit', case when o.status = 'WAITING_DEPOSIT' and jsonb_typeof(o.raw_payment -> 'virtualAccount') = 'object'
                 then jsonb_build_object('bank', o.raw_payment -> 'virtualAccount' ->> 'bankCode', 'account', o.raw_payment -> 'virtualAccount' ->> 'accountNumber',
                                         'holder', o.raw_payment -> 'virtualAccount' ->> 'customerName', 'due', o.raw_payment -> 'virtualAccount' ->> 'dueDate')
                 else null end,
    'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at, 'delivered_at', o.delivered_at,
    'ship_status', public.myr_order_ship_status(o.id),
    'claim_status', public.myr_order_claim_status(o.id),
    'guest', o.user_id is null, 'buyer_name', o.buyer_name,
    'shipping', case when p_full then o.shipping else null end,
    'buyer_email', case when p_full then o.buyer_email else null end,
    'refund_reason', case when p_full and o.refund_amount > 0 then o.refund_reason else null end,
    'refunded_at', case when p_full and o.refund_amount > 0 then o.refunded_at else null end,
    -- 줄마다 환불 길(instant · claim · null) — 샵 버튼 · 신청 화면 줄 나누기가 이 값을 그대로 쓴다(0092)
    'items', coalesce((select jsonb_agg(public.myr_order_item_json(i) || jsonb_build_object('refund_path', public.myr_line_refund_path(o, i)) order by i.created_at, i.id)
                         from public.myr_order_items i where i.order_id = o.id), '[]'::jsonb))
$$;
revoke all on function public.myr_order_json(public.myr_orders, boolean) from public, anon, authenticated;
