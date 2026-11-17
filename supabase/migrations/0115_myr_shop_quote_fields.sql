-- ============================================================
-- 0115 · MYR 샵 화면 숫자를 서버 견적에서 — 결제 금액 · 재고 초과 · 한 번에 결제할 줄 수 · 무료배송 기준 (2026-11-17)
--
--   점검(백엔드 원칙 1 · 샵 화면):
--     장바구니 · 결제 화면 총 결제 금액     화면이 itemsAmount + shippingFee 로 더했다(결제 · 주문 표 amount 생성 칸과 같은 식)
--     장바구니 재고 초과 안내               화면이 qty > stockLeft 로 판정했다(결제 생성 · 승인의 SOLD_OUT 은 v_left < v_tot · v_left < v_need)
--     한 번에 결제할 줄 수                  장바구니 · 견적은 50줄까지 받는데 결제는 20줄(c_max_lines) — 21~50줄을 고르면 결제에서 BAD_LINES
--     상품 페이지 [담기] 금액 · 무료배송 문구  화면이 단가 × 수량 · "5만원" 고정 — 견적 한 줄(line_amount · free_over)로 바꾼다(앱 코드)
--   고침:
--     myr_pay_amount(상품 합계, 배송비)        결제 금액 — 견적 amount
--     myr_stock_short(남은 수량, 필요 수량)     재고가 모자란지 — 견적 줄 over_stock · 결제 생성 · 결제 승인 SOLD_OUT
--     myr_checkout_lines_max() · myr_checkout_lines_over(줄 수)   한 번에 결제할 수 있는 줄 수(20) · 넘는지 — 견적 lines_max · lines_over · 결제 생성 BAD_LINES
--   그대로 둔 것: 결제 · 주문 표의 amount 생성 칸(items_amount + shipping_fee)은 표 정의라 그대로(바꾸려면 표를 다시 쓴다) · 견적 · 장바구니 합치기의 50줄은 전송 형식 한도
--   계산 결과 불변 — 결제 생성 · 승인은 같은 비교를 함수로 감쌌을 뿐 · 견적은 칸만 더해진다
--   테스트: supabase/tests/myr_shop_quote_fields.test.sql · 기존 견적 · 결제 · 재고 테스트
-- ============================================================

create or replace function public.myr_pay_amount(p_items_amount bigint, p_shipping_fee integer)
returns bigint
language sql
immutable
as $$
  select p_items_amount + p_shipping_fee
$$;
revoke all on function public.myr_pay_amount(bigint, integer) from public, anon, authenticated;

create or replace function public.myr_stock_short(p_left integer, p_need integer)
returns boolean
language sql
immutable
as $$
  select coalesce(p_left < p_need, false)
$$;
revoke all on function public.myr_stock_short(integer, integer) from public, anon, authenticated;

create or replace function public.myr_checkout_lines_max()
returns integer
language sql
immutable
as $$
  select 20
$$;
revoke all on function public.myr_checkout_lines_max() from public, anon, authenticated;

create or replace function public.myr_checkout_lines_over(p_n integer)
returns boolean
language sql
immutable
as $$
  select coalesce(p_n, 0) > public.myr_checkout_lines_max()
$$;
revoke all on function public.myr_checkout_lines_over(integer) from public, anon, authenticated;

-- 0099 정의 + over_stock · amount · lines_max · lines_over(칸만 더함)
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
    select p1.* into p from public.myr_products p1 join public.sellers s on s.id = p1.seller_id
     where p1.code = v_code and public.myr_product_visible(p1, s);
    if not found then
      v_out := v_out || jsonb_build_object('code', v_code, 'option_index', v_opt, 'qty', v_qty, 'unit_price', null, 'base_price', null, 'line_amount', null,
                                           'base_amount', null, 'stock_left', 0, 'over_stock', null, 'groupbuy_state', null, 'groupbuy_code', null);
      continue;
    end if;
    v_price := public.myr_line_price(p, v_opt, nullif(l ->> 'gb', ''));
    v_unit := (v_price ->> 'unit_price')::integer;
    v_out := v_out || (jsonb_build_object('code', v_code, 'option_index', v_opt, 'qty', v_qty, 'line_amount', public.myr_line_amount(v_unit, v_qty),
                                          'stock_left', public.myr_product_buyable(p),
                                          -- 0115: 남은 수량보다 많이 담았는지 — 결제 생성 · 승인의 SOLD_OUT 과 같은 함수(myr_stock_short)
                                          'over_stock', public.myr_stock_short(public.myr_product_buyable(p), v_qty),
                                          'base_amount', public.myr_line_amount((v_price ->> 'base_price')::integer, v_qty))
                       || (v_price - 'groupbuy_id'));
    v_items := v_items + coalesce(public.myr_line_amount(v_unit, v_qty), 0);
  end loop;
  v_fee := public.myr_shipping_fee(least(v_items, 2147483647)::integer);
  -- 0115: 결제 금액(myr_pay_amount — 결제 · 주문 표 amount 생성 칸과 같은 식) · 한 번에 결제할 수 있는 줄 수(myr_checkout_lines_max · 넘는지 myr_checkout_lines_over)
  return jsonb_build_object('ok', true, 'lines', v_out, 'items_amount', v_items, 'shipping_fee', v_fee, 'amount', public.myr_pay_amount(v_items, v_fee),
                            'lines_max', public.myr_checkout_lines_max(), 'lines_over', public.myr_checkout_lines_over(jsonb_array_length(p_lines)),
                            'free_over', (v_rule ->> 'free_over')::int,
                            'free_shipping_left', case when v_items > 0 and v_fee > 0 then greatest((v_rule ->> 'free_over')::int - v_items, 0) else 0 end);
end;
$$;
revoke all on function public.myr_app_cart_quote(jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_cart_quote(jsonb) to service_role;

-- 0107 정의 → 줄 수 myr_checkout_lines_over · 재고 myr_stock_short
create or replace function public.myr_app_create_checkout(
  p_user_id uuid, p_customer_id uuid, p_buyer jsonb, p_shipping jsonb, p_lines jsonb, p_toss_order_id text, p_prev_checkout_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
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
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 or public.myr_checkout_lines_over(jsonb_array_length(p_lines)) then
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
    if not public.myr_product_visible(p, s) then
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
    -- 본인 PENDING 예약분(곧 SUPERSEDED) 은 되돌린다 — 아래 supersede 와 같은 "내 결제 · 대체될 결제" 함수(0107 myr_checkout_own_held)
    v_own := public.myr_checkout_own_held(p.id, p_user_id, p_prev_checkout_id);
    v_left := public.myr_product_buyable(p, v_own);   -- 지금 살 수 있는 수량 = myr_product_buyable 한 곳(0096 · 상품 페이지 표시와 같은 값)
    -- 재고는 상품 하나에 걸려 있다 — 같은 상품의 옵션을 합쳐서 본다(0097 · 전에는 옵션마다 따로 봐서 결제 승인 때에야 품절이 났다)
    v_tot := coalesce((v_need ->> p.id::text)::int, 0) + v_qty;
    v_need := v_need || jsonb_build_object(p.id::text, v_tot);
    if public.myr_stock_short(v_left, v_tot) then
      v_problems := v_problems || jsonb_build_object('code', v_code, 'reason', 'SOLD_OUT', 'left', greatest(v_left - (v_tot - v_qty), 0));
      continue;
    end if;
    v_rows := v_rows || jsonb_build_object('product_id', p.id, 'seller_id', p.seller_id, 'product_name', p.name, 'option_index', v_opt,
                                           'option_name', v_optname, 'qty', v_qty, 'unit_price', v_unit, 'groupbuy_id', v_gb_id);
    -- 수량 상한이 없어 합계가 정수 범위를 넘을 수 있다 — 오류 대신 AMOUNT_TOO_LARGE(20억 · 0095)
    if v_items_amt::bigint + public.myr_line_amount(v_unit, v_qty) > 2000000000 then return jsonb_build_object('ok', false, 'code', 'AMOUNT_TOO_LARGE'); end if;
    v_items_amt := v_items_amt + public.myr_line_amount(v_unit, v_qty);
    v_n := v_n + 1;
    if v_name is null then v_name := p.name; end if;
  end loop;

  if jsonb_array_length(v_problems) > 0 then return jsonb_build_object('ok', false, 'code', 'LINES_REJECTED', 'items', v_problems); end if;
  if jsonb_array_length(v_changes) > 0 then return jsonb_build_object('ok', false, 'code', 'PRICE_CHANGED', 'items', v_changes); end if;
  if v_items_amt < 100 then return jsonb_build_object('ok', false, 'code', 'AMOUNT_TOO_SMALL'); end if;
  v_fee := public.myr_shipping_fee(v_items_amt);
  v_order_name := left(v_name || case when v_n > 1 then ' 외 ' || (v_n - 1) || '건' else '' end, 100);

  -- 3) supersede (모든 검증 뒤 · insert 직전) — 위 예약 합계와 같은 함수(0107 · 만료된 PENDING 도 SUPERSEDED)
  update public.myr_checkouts x set status = 'EXPIRED', fail_code = 'SUPERSEDED', fail_message = '새 결제 시도로 대체되었습니다'
   where public.myr_checkout_mine(x, p_user_id, p_prev_checkout_id) and public.myr_checkout_supersedable(x);

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

-- 0099 정의 → 재고 myr_stock_short
create or replace function public.myr_app_confirm_checkout(p_checkout_id uuid, p_payment_key text, p_payment jsonb, p_recover boolean default false)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c          public.myr_checkouts%rowtype;
  o_id       uuid;
  o_code     text;
  o_status   text;
  v_status   text;
  v_is_va    boolean;
  v_appr     timestamptz;
  v_due      timestamptz;
  v_problems jsonb := '[]'::jsonb;
  pr         record;
  v_need     integer;
  v_left     integer;
begin
  select * into c from public.myr_checkouts where id = p_checkout_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;

  if c.status = 'CONFIRMED' then
    select o.id, o.code, o.status into o_id, o_code, o_status from public.myr_orders o where o.checkout_id = c.id;
    return jsonb_build_object('ok', true, 'already', true, 'order_id', o_id, 'order_code', o_code, 'status', o_status);
  end if;
  if c.status not in ('PENDING','CONFIRMING') then
    select o.id, o.code, o.status into o_id, o_code, o_status from public.myr_orders o where o.checkout_id = c.id;
    if found then return jsonb_build_object('ok', true, 'already', true, 'order_id', o_id, 'order_code', o_code, 'status', o_status); end if;
    if not p_recover or c.fail_code = 'CANCEL_PENDING' then
      return jsonb_build_object('ok', false, 'code', coalesce(c.fail_code, c.status), 'message', c.fail_message);
    end if;
  end if;

  if p_payment is null
     or p_payment ->> 'status' not in ('DONE','WAITING_FOR_DEPOSIT')
     or p_payment ->> 'orderId' is distinct from c.toss_order_id
     or (p_payment ->> 'totalAmount')::bigint is distinct from c.amount::bigint
     or p_payment ->> 'paymentKey' is distinct from p_payment_key then
    return jsonb_build_object('ok', false, 'code', 'PAYMENT_MISMATCH');
  end if;
  v_is_va := p_payment ->> 'method' = '가상계좌' or (p_payment ? 'virtualAccount' and jsonb_typeof(p_payment -> 'virtualAccount') <> 'null');
  v_status := case when p_payment ->> 'status' = 'WAITING_FOR_DEPOSIT' then 'WAITING_DEPOSIT' else 'PAID' end;
  if v_status = 'WAITING_DEPOSIT' and not v_is_va then return jsonb_build_object('ok', false, 'code', 'PAYMENT_MISMATCH'); end if;
  v_appr := coalesce((p_payment ->> 'approvedAt')::timestamptz, (p_payment ->> 'requestedAt')::timestamptz, now());
  v_due  := case when v_status = 'WAITING_DEPOSIT' then (p_payment -> 'virtualAccount' ->> 'dueDate')::timestamptz else null end;

  -- 상품 행 잠금(id 순) → 상태·재고 재검사. 같은 상품을 담은 동시 confirm 은 여기서 직렬화된다.
  for pr in
    select p.id, p.code, public.myr_product_visible(p, s) as visible, public.myr_product_left(p) as left_qty,
           (select sum(ci.qty) from public.myr_checkout_items ci where ci.checkout_id = c.id and ci.product_id = p.id) as need
      from public.myr_products p
      left join public.sellers s on s.id = p.seller_id
     where p.id in (select product_id from public.myr_checkout_items where checkout_id = c.id)
     order by p.id
       for update of p
  loop
    v_need := coalesce(pr.need, 0);
    if not pr.visible then
      v_problems := v_problems || jsonb_build_object('code', pr.code, 'reason', 'NOT_AVAILABLE');
    else
      v_left := pr.left_qty;   -- 남은 재고 = myr_product_left 한 곳(0096)
      if public.myr_stock_short(v_left, v_need) then v_problems := v_problems || jsonb_build_object('code', pr.code, 'reason', 'SOLD_OUT', 'left', greatest(v_left, 0)); end if;
    end if;
  end loop;
  if jsonb_array_length(v_problems) > 0 then
    return jsonb_build_object('ok', false,
      'code', case when exists (select 1 from jsonb_array_elements(v_problems) e where e ->> 'reason' = 'SOLD_OUT') then 'SOLD_OUT' else 'NOT_AVAILABLE' end,
      'items', v_problems);
  end if;

  insert into public.myr_orders (checkout_id, user_id, customer_id, status, buyer_name, buyer_phone, buyer_email, shipping, order_name,
                                 items_amount, shipping_fee, payment_key, payment_method, paid_at, deposit_due_at, raw_payment)
  values (c.id, c.user_id, c.customer_id, v_status, c.buyer_name, c.buyer_phone, c.buyer_email, c.shipping, c.order_name,
          c.items_amount, c.shipping_fee, p_payment_key, p_payment ->> 'method', case when v_status = 'PAID' then v_appr else null end, v_due, p_payment)
  returning id, code into o_id, o_code;

  insert into public.myr_order_items (order_id, product_id, seller_id, product_name, option_index, option_name, qty, unit_price, seller_margin_rate, groupbuy_id)
  select o_id, ci.product_id, ci.seller_id, ci.product_name, ci.option_index, ci.option_name, ci.qty, ci.unit_price, p.seller_margin_rate, ci.groupbuy_id
    from public.myr_checkout_items ci
    join public.myr_products p on p.id = ci.product_id
   where ci.checkout_id = c.id;
  -- myr_order_items_sync_sold_qty 가 같은 트랜잭션에서 sold_qty 를 갱신한다.

  update public.myr_checkouts
     set status = 'CONFIRMED', payment_key = p_payment_key, payment_method = p_payment ->> 'method', approved_at = v_appr,
         raw_payment = p_payment, fail_code = null, fail_message = null
   where id = c.id;
  return jsonb_build_object('ok', true, 'already', false, 'order_id', o_id, 'order_code', o_code, 'status', v_status);
end;
$$;
revoke all on function public.myr_app_confirm_checkout(uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_confirm_checkout(uuid, text, jsonb, boolean) to service_role;
