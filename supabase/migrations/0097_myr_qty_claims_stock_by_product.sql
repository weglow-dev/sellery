-- ============================================================
-- 0097 — MYR 수량 상한 제거(0095) 뒤에 남은 곳 + 옵션별 재고 + 수량 판정 한 곳(2026-11-11 · PR #294 리뷰)
--   1) 교환·환불 요청 · 바로 환불의 수량 형식 검사가 그대로였다 — 150개 산 고객이 150개를 요청하면 거절됐다.
--      myr_refund_requests.qty 1~9(0078 표 제약) → 1 이상 · myr_app_claim_open(99) · myr_refund_lines(999) → 숫자 형식만.
--      실제 한도는 그대로 "남은 수량"(TOO_MANY).
--   2) 결제 생성(myr_app_create_checkout)이 재고를 상품 · 옵션 단위로 따로 봤다 — 재고는 상품 하나에 걸려 있어
--      옵션 A · B 를 각각 남은 수량 이하로 담으면 합계가 재고를 넘어도 통과했고, 결제 승인(상품 합계)에서야 SOLD_OUT → 자동 결제 취소가 됐다(0058 부터).
--      이제 같은 상품의 옵션 수량을 합쳐 지금 살 수 있는 수량(myr_product_buyable)과 비교한다. SOLD_OUT 의 left 는 앞 옵션이 쓴 만큼을 뺀 값.
--   3) 같은 판정을 함수 하나로(백엔드 원칙 1)
--      myr_qty_max() · myr_qty_parse(text)   수량 숫자 형식(1~6자리 정수 · 아니면 -1) — 장바구니 저장 · 합치기 · 견적 · 결제 생성 · 요청 접수 · 바로 환불 6곳이
--                                            각자 쓰던 999,999 · \d{1,6} 을 여기 한 곳으로. 구매 수량 "상한"이 아니라 정수 계산이 안전한 형식 범위다.
--      myr_line_left(item)                   줄의 남은 수량 = max(주문 수량 − 환불 수량, 0) — 환불 길 4곳(myr_refund_lines · myr_app_refund_precheck ·
--                                            myr_app_claim_open · myr_line_refund_path)이 이 함수를 쓰고, 주문 JSON 줄마다 left_qty 로 실어 샵 환불 화면이 계산하지 않는다.
--                                            (발송 · 정산 · 실적 쪽 함수의 같은 식은 별도 PR — 돈 · 정산 경로라 따로 확인한다)
--   바뀌는 함수(해당 부분만 · 나머지 그대로)
--     myr_cart_set · myr_cart_merge(0095) · myr_app_cart_quote(0096) · myr_app_create_checkout(0096) · myr_app_claim_open(0093) · myr_refund_lines(0068)
--     myr_app_refund_precheck(0092) · myr_line_refund_path(0092) · myr_order_json(0093 + left_qty)
--   권한: 새 내부 함수는 anon · authenticated EXECUTE 회수. 테스트: supabase/tests/myr_qty_no_cap.test.sql(추가) + 기존 환불 · 요청 · 장바구니 · 체크아웃 테스트 그대로.
-- ============================================================

alter table public.myr_refund_requests drop constraint if exists myr_refund_requests_qty_check;
alter table public.myr_refund_requests add constraint myr_refund_requests_qty_check check (qty >= 1);

-- ---------- 수량 숫자 형식 — 한 곳 ----------
create or replace function public.myr_qty_max()
returns integer
language sql
immutable
as $$
  select 999999
$$;
revoke all on function public.myr_qty_max() from public, anon, authenticated;

-- 1~6자리 숫자면 그 정수, 아니면(null · 음수 · 소수 · 글자 · 7자리 이상) -1
create or replace function public.myr_qty_parse(p_text text)
returns integer
language sql
immutable
as $$
  select case when p_text ~ '^\d{1,6}$' then p_text::integer else -1 end
$$;
revoke all on function public.myr_qty_parse(text) from public, anon, authenticated;

-- ---------- 줄의 남은 수량 — 한 곳 ----------
create or replace function public.myr_line_left(i public.myr_order_items)
returns integer
language sql
stable
as $$
  select greatest(coalesce(i.qty, 0) - coalesce(i.refunded_qty, 0), 0)
$$;
revoke all on function public.myr_line_left(public.myr_order_items) from public, anon, authenticated;

-- 0095 정의 + 수량 형식 = myr_qty_max
create or replace function public.myr_cart_set(p_user_id uuid, p_code text, p_option_index integer default 0, p_qty integer default 1, p_add boolean default false, p_groupbuy text default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_code       text := lower(btrim(coalesce(p_code, '')));
  v_product_id uuid;
  v_available  boolean;
  v_qty        integer;
  v_gb         uuid;
begin
  if p_user_id is null then return jsonb_build_object('ok', false, 'code', 'NO_USER'); end if;
  -- 구매 수량 상한 없음(2026-11-11 · 0095) — 실제 한도는 결제 때 재고. 999,999 는 숫자 형식 검사일 뿐
  if p_qty is null or p_qty < 0 or p_qty > public.myr_qty_max() then return jsonb_build_object('ok', false, 'code', 'BAD_QTY'); end if;
  if p_option_index is null or p_option_index < 0 then return jsonb_build_object('ok', false, 'code', 'BAD_OPTION'); end if;

  select p.id, public.myr_product_available(p, s) into v_product_id, v_available
    from public.myr_products p
    left join public.sellers s on s.id = p.seller_id
   where p.code = v_code and p.deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;

  if p_qty = 0 then
    delete from public.myr_cart_items where user_id = p_user_id and product_id = v_product_id and option_index = p_option_index;
    return jsonb_build_object('ok', true, 'code', v_code, 'qty', 0);
  end if;
  if not v_available then return jsonb_build_object('ok', false, 'code', 'NOT_AVAILABLE'); end if;

  if p_groupbuy is not null then
    select g.id into v_gb from public.myr_groupbuys g
     where g.code = lower(btrim(p_groupbuy)) and g.product_id = v_product_id and public.myr_groupbuy_state(g) <> 'ended';
  end if;

  insert into public.myr_cart_items (user_id, product_id, option_index, qty, groupbuy_id)
  values (p_user_id, v_product_id, p_option_index, p_qty, v_gb)
  on conflict (user_id, product_id, option_index) do update
    set qty = case when p_add then least(public.myr_qty_max(), public.myr_cart_items.qty + excluded.qty) else excluded.qty end,
        groupbuy_id = coalesce(excluded.groupbuy_id, public.myr_cart_items.groupbuy_id)
  returning qty into v_qty;
  return jsonb_build_object('ok', true, 'code', v_code, 'qty', v_qty);
end;
$$;
revoke all on function public.myr_cart_set(uuid, text, integer, integer, boolean, text) from public, anon, authenticated;
grant execute on function public.myr_cart_set(uuid, text, integer, integer, boolean, text) to service_role;

-- 0095 정의 + 수량 형식 = myr_qty_parse
create or replace function public.myr_cart_merge(p_user_id uuid, p_lines jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  l        jsonb;
  r        jsonb;
  v_qty    integer;
  v_opt    integer;
  v_merged integer := 0;
  v_skip   integer := 0;
begin
  if p_user_id is null then return jsonb_build_object('ok', false, 'code', 'NO_USER'); end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 50 then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty := public.myr_qty_parse(l->>'qty');
    v_opt := case when (l->>'option_index') is null then 0 when (l->>'option_index') ~ '^\d{1,3}$' then (l->>'option_index')::integer else -1 end;
    r := public.myr_cart_set(p_user_id, l->>'code', v_opt, v_qty, true, nullif(l->>'gb', ''));
    if (r->>'ok')::boolean and v_qty > 0 then v_merged := v_merged + 1; else v_skip := v_skip + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'merged', v_merged, 'skipped', v_skip);
end;
$$;
revoke all on function public.myr_cart_merge(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_cart_merge(uuid, jsonb) to service_role;

-- 0096 정의 + 수량 형식 = myr_qty_parse
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
  v_items bigint := 0;
  v_rule  jsonb := public.myr_shipping_rule();
  v_fee   integer;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 50 then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    v_code := lower(btrim(coalesce(l ->> 'code', '')));
    v_opt  := case when (l ->> 'option_index') is null then 0 when (l ->> 'option_index') ~ '^\d{1,3}$' then (l ->> 'option_index')::int else -1 end;
    v_qty  := public.myr_qty_parse(l ->> 'qty');
    if v_code !~ '^[a-z0-9][a-z0-9-]{0,47}$' or v_opt < 0 or v_qty < 1 then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
    if (l ->> 'gb') is not null and (l ->> 'gb') !~ '^[a-z0-9]{6,16}$' then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
    select p1.* into p from public.myr_products p1 join public.sellers s on s.id = p1.seller_id and s.active
     where p1.code = v_code and p1.deleted_at is null and p1.status = 'listed';
    if not found then
      v_out := v_out || jsonb_build_object('code', v_code, 'option_index', v_opt, 'qty', v_qty, 'unit_price', null, 'base_price', null, 'line_amount', null,
                                           'base_amount', null, 'stock_left', 0, 'groupbuy_state', null, 'groupbuy_code', null);
      continue;
    end if;
    v_price := public.myr_line_price(p, v_opt, nullif(l ->> 'gb', ''));
    v_unit := (v_price ->> 'unit_price')::integer;
    v_out := v_out || (jsonb_build_object('code', v_code, 'option_index', v_opt, 'qty', v_qty, 'line_amount', v_unit::bigint * v_qty,
                                          'stock_left', public.myr_product_buyable(p),
                                          'base_amount', (v_price ->> 'base_price')::bigint * v_qty)
                       || (v_price - 'groupbuy_id'));
    v_items := v_items + coalesce(v_unit::bigint * v_qty, 0);
  end loop;
  v_fee := public.myr_shipping_fee(least(v_items, 2147483647)::integer);
  return jsonb_build_object('ok', true, 'lines', v_out, 'items_amount', v_items, 'shipping_fee', v_fee,
                            'free_over', (v_rule ->> 'free_over')::int,
                            'free_shipping_left', case when v_items > 0 and v_fee > 0 then greatest((v_rule ->> 'free_over')::int - v_items, 0) else 0 end);
end;
$$;
revoke all on function public.myr_app_cart_quote(jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_cart_quote(jsonb) to service_role;

-- 0068 정의 + 수량 형식 = myr_qty_parse · 남은 수량 = myr_line_left
create or replace function public.myr_refund_lines(o public.myr_orders, p_items jsonb)
returns table (item_id uuid, qty integer, unit_price integer, seller_id uuid, remaining integer, item_status text, problem text, note text, photos text[])
language plpgsql
stable
security definer set search_path = public
as $$
declare
  l jsonb;
  v_id uuid;
  v_qty integer;
  v_note text;
  v_photos jsonb;
  v_req jsonb := '{}'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    -- 전체: 남은 수량이 있는 줄 전부(상세·사진 없음)
    return query
      select i.id, public.myr_line_left(i), i.unit_price, i.seller_id, public.myr_line_left(i), i.status, null::text, null::text, '{}'::text[]
        from public.myr_order_items i where i.order_id = o.id and i.status not in ('CANCELED') and public.myr_line_left(i) > 0;
    return;
  end if;
  for l in select * from jsonb_array_elements(p_items) loop
    if (l ->> 'item_id') !~ '^[0-9a-f-]{36}$' or public.myr_qty_parse(l ->> 'qty') < 0 then   -- 숫자 형식만(수량 상한 없음 · 남은 수량은 TOO_MANY)
      return query select null::uuid, 0, 0, null::uuid, 0, null::text, 'BAD_FORMAT'::text, null::text, '{}'::text[];
      return;
    end if;
    v_id := (l ->> 'item_id')::uuid;
    v_qty := (l ->> 'qty')::int + coalesce((v_req -> v_id::text ->> 'q')::int, 0);
    -- 같은 줄이 두 번 오면 수량은 합치고 상세·사진은 마지막 비지 않은 것
    v_note := coalesce(nullif(btrim(left(l ->> 'note', 300)), ''), v_req -> v_id::text ->> 'n');
    v_photos := case when jsonb_typeof(l -> 'photos') = 'array' and jsonb_array_length(l -> 'photos') > 0
                     then (select jsonb_agg(x) from (select x from jsonb_array_elements_text(l -> 'photos') x where x <> '' limit 3) s)
                     else v_req -> v_id::text -> 'p' end;
    v_req := v_req || jsonb_build_object(v_id::text, jsonb_build_object('q', v_qty, 'n', v_note, 'p', v_photos));
  end loop;
  return query
    select k.id, k.q, i.unit_price, i.seller_id, public.myr_line_left(i), i.status,
           case when i.id is null then 'NOT_IN_ORDER'
                when i.status = 'CANCELED' then 'CANCELED'
                when k.q < 1 then 'BAD_QTY'
                when k.q > public.myr_line_left(i) then 'TOO_MANY'
                else null end,
           k.n, k.p
      from (select (key)::uuid as id, (value ->> 'q')::int as q, value ->> 'n' as n,
                   coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(value -> 'p') = 'array' then value -> 'p' else '[]'::jsonb end) x), '{}'::text[]) as p
              from jsonb_each(v_req)) k
      left join public.myr_order_items i on i.id = k.id and i.order_id = o.id;
end;
$$;
revoke all on function public.myr_refund_lines(public.myr_orders, jsonb) from public, anon, authenticated;

-- 0092 정의 + 남은 수량 = myr_line_left
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
  select coalesce(sum(public.myr_line_left(i)), 0) into v_left_total from public.myr_order_items i where i.order_id = o.id and i.status <> 'CANCELED';
  v_full := v_req_total >= v_left_total;
  if v_full and o.shipping_fee > 0 and o.refund_amount + v_amount + o.shipping_fee <= o.amount then v_amount := v_amount + o.shipping_fee; end if;

  return jsonb_build_object('ok', true, 'order_code', o.code, 'order_status', o.status, 'payment_key', o.payment_key,
                            'amount', v_amount, 'deposit', o.status = 'WAITING_DEPOSIT', 'full', v_full, 'items', v_items);
end;
$$;
revoke all on function public.myr_app_refund_precheck(uuid, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_refund_precheck(uuid, jsonb, text, uuid) to service_role;

-- 0092 정의 + 남은 수량 = myr_line_left
create or replace function public.myr_line_refund_path(o public.myr_orders, i public.myr_order_items)
returns text
language sql
stable
as $$
  select case
    when o.status not in ('PAID', 'PARTIAL_REFUNDED', 'WAITING_DEPOSIT') then null
    when i.status = 'CANCELED' or public.myr_line_left(i) <= 0 then null
    when i.ship_status = 'PAID' then 'instant'
    when o.status = 'WAITING_DEPOSIT' then null
    else 'claim' end
$$;
revoke all on function public.myr_line_refund_path(public.myr_orders, public.myr_order_items) from public, anon, authenticated;

-- 0093 정의 + 수량 형식 = myr_qty_parse · 남은 수량 = myr_line_left
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
    if (l ->> 'item_id') !~ '^[0-9a-f-]{36}$' or public.myr_qty_parse(l ->> 'qty') < 0 then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS'); end if;   -- 숫자 형식만(수량 상한 없음 · 남은 수량은 아래 TOO_MANY)
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
    elsif v_qty > public.myr_line_left(i) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'TOO_MANY');
    elsif public.myr_line_refund_path(o, i) is distinct from 'claim' then
      -- 결제완료(발주 전) 줄은 요청이 아니라 바로 환불 — 줄 길 판정은 myr_line_refund_path 한 곳(0092)
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'NOT_PREPARED');
    elsif exists (select 1 from public.myr_refund_requests q where q.order_item_id = v_id and q.status in ('pending','progress')) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'OPEN_EXISTS');
    elsif p_reason = '단순 변심' and not public.myr_line_change_mind_ok(i) then
      -- 단순 변심은 수령 후 7일(날짜 기준)까지 — 기한 판정은 myr_line_change_mind_until 한 곳(샵 화면도 같은 값 · 0093)
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'CHANGE_MIND_EXPIRED', 'until', public.myr_line_change_mind_until(i));
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

-- 0093 정의 + 줄마다 left_qty
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
    -- 줄마다 환불 길(instant · claim · null · 0092) · 단순 변심 기한 · 지금 가능한지(0093) — 샵 화면이 이 값을 그대로 쓴다
    'items', coalesce((select jsonb_agg(public.myr_order_item_json(i) || jsonb_build_object('refund_path', public.myr_line_refund_path(o, i), 'left_qty', public.myr_line_left(i),
                                                                                   'change_mind_until', public.myr_line_change_mind_until(i),
                                                                                   'change_mind_ok', public.myr_line_change_mind_ok(i)) order by i.created_at, i.id)
                         from public.myr_order_items i where i.order_id = o.id), '[]'::jsonb))
$$;
revoke all on function public.myr_order_json(public.myr_orders, boolean) from public, anon, authenticated;

-- 0096 정의 + 수량 형식 = myr_qty_parse · 같은 상품 옵션 합쳐 재고 확인
create or replace function public.myr_app_create_checkout(
  p_user_id uuid, p_customer_id uuid, p_buyer jsonb, p_shipping jsonb, p_lines jsonb, p_toss_order_id text, p_prev_checkout_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
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
  v_need       jsonb := '{}'::jsonb;            -- 상품 id → 이 결제에서 지금까지 담은 수량(옵션을 합친다 · 재고는 상품 하나에 걸려 있다 · 0097)
  v_tot        integer;
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
    v_qty  := public.myr_qty_parse(l ->> 'qty');   -- 숫자 형식만 · 구매 수량 상한 없음(0095) — 실제 한도는 재고(SOLD_OUT)
    if v_code !~ '^[a-z0-9][a-z0-9-]{0,47}$' or v_opt < 0 or v_qty < 1 then
      return jsonb_build_object('ok', false, 'code', 'BAD_LINES');
    end if;
    if (l ->> 'gb') is not null and (l ->> 'gb') !~ '^[a-z0-9]{6,16}$' then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
    if (l ->> 'price') is not null and (l ->> 'price') !~ '^\d{1,9}$' then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
    v_key := v_code || '#' || v_opt;
    v_qty := v_qty + coalesce((v_merged ->> v_key)::int, 0);
    if v_qty > public.myr_qty_max() then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
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
    v_left := public.myr_product_buyable(p, v_own);   -- 지금 살 수 있는 수량 = myr_product_buyable 한 곳(0096 · 상품 페이지 표시와 같은 값)
    -- 재고는 상품 하나에 걸려 있다 — 같은 상품의 옵션을 합쳐서 본다(0097 · 전에는 옵션마다 따로 봐서 결제 승인 때에야 품절이 났다)
    v_tot := coalesce((v_need ->> p.id::text)::int, 0) + v_qty;
    v_need := v_need || jsonb_build_object(p.id::text, v_tot);
    if v_left < v_tot then
      v_problems := v_problems || jsonb_build_object('code', v_code, 'reason', 'SOLD_OUT', 'left', greatest(v_left - (v_tot - v_qty), 0));
      continue;
    end if;
    v_rows := v_rows || jsonb_build_object('product_id', p.id, 'seller_id', p.seller_id, 'product_name', p.name, 'option_index', v_opt,
                                           'option_name', v_optname, 'qty', v_qty, 'unit_price', v_unit, 'groupbuy_id', v_gb_id);
    -- 수량 상한이 없어 합계가 정수 범위를 넘을 수 있다 — 오류 대신 AMOUNT_TOO_LARGE(20억 · 0095)
    if v_items_amt::bigint + v_unit::bigint * v_qty > 2000000000 then return jsonb_build_object('ok', false, 'code', 'AMOUNT_TOO_LARGE'); end if;
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
