-- ============================================================
-- 0095 — MYR 구매 수량 상한(9개) 없애기(2026-11-11 대표 결정 "구매는 몇 개를 사든 상관없다")
--   9개는 정책으로 정한 적 없이 첫 샵 화면(2026-10-29)의 수량 칸 상한이 장바구니(0057) · 체크아웃(0058) 서버로 옮겨진 값이었다.
--   이제 실제 한도는 재고 하나 — 체크아웃이 남은 재고보다 많으면 지금처럼 SOLD_OUT(left 포함)으로 막는다.
--   999,999 는 숫자 형식 검사(정수 범위)일 뿐 상한이 아니다.
--   수량이 커지면 합계가 정수 범위를 넘을 수 있어 체크아웃은 상품 합계 20억 초과를 AMOUNT_TOO_LARGE 로 거절하고(DB 오류 대신),
--   장바구니 견적은 합계를 bigint 로 센다.
--
--   표 제약: myr_cart_items · myr_checkout_items · myr_order_items 의 qty 1~9 → qty >= 1
--   바뀌는 함수(수량 검사만 · 나머지 그대로): myr_cart_set(0086) · myr_cart_merge(0086) · myr_app_create_checkout(0092) · myr_app_cart_quote(0092)
--   권한: 그대로. 테스트: supabase/tests/myr_qty_no_cap.test.sql.
-- ============================================================

alter table public.myr_cart_items drop constraint if exists myr_cart_items_qty_check;
alter table public.myr_cart_items add constraint myr_cart_items_qty_check check (qty >= 1);
alter table public.myr_checkout_items drop constraint if exists myr_checkout_items_qty_check;
alter table public.myr_checkout_items add constraint myr_checkout_items_qty_check check (qty >= 1);
alter table public.myr_order_items drop constraint if exists myr_order_items_qty_check;
alter table public.myr_order_items add constraint myr_order_items_qty_check check (qty >= 1);

-- 0086 정의 + 수량 상한 없음
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
  if p_qty is null or p_qty < 0 or p_qty > 999999 then return jsonb_build_object('ok', false, 'code', 'BAD_QTY'); end if;
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
    set qty = case when p_add then least(999999, public.myr_cart_items.qty + excluded.qty) else excluded.qty end,
        groupbuy_id = coalesce(excluded.groupbuy_id, public.myr_cart_items.groupbuy_id)
  returning qty into v_qty;
  return jsonb_build_object('ok', true, 'code', v_code, 'qty', v_qty);
end;
$$;
revoke all on function public.myr_cart_set(uuid, text, integer, integer, boolean, text) from public, anon, authenticated;
grant execute on function public.myr_cart_set(uuid, text, integer, integer, boolean, text) to service_role;

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
    v_qty := case when (l->>'qty') ~ '^\d{1,6}$' then (l->>'qty')::integer else -1 end;
    v_opt := case when (l->>'option_index') is null then 0 when (l->>'option_index') ~ '^\d{1,3}$' then (l->>'option_index')::integer else -1 end;
    r := public.myr_cart_set(p_user_id, l->>'code', v_opt, v_qty, true, nullif(l->>'gb', ''));
    if (r->>'ok')::boolean and v_qty > 0 then v_merged := v_merged + 1; else v_skip := v_skip + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'merged', v_merged, 'skipped', v_skip);
end;
$$;
revoke all on function public.myr_cart_merge(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_cart_merge(uuid, jsonb) to service_role;

-- 0092 정의 + 수량 상한 없음 · 합계 20억 초과 AMOUNT_TOO_LARGE
create or replace function public.myr_app_create_checkout(
  p_user_id uuid, p_customer_id uuid, p_buyer jsonb, p_shipping jsonb, p_lines jsonb, p_toss_order_id text, p_prev_checkout_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c_qty_fmt   constant integer := 999999;      -- 숫자 형식 검사일 뿐 · 구매 수량 상한 없음(0095) — 실제 한도는 재고(SOLD_OUT)
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
    v_qty  := case when (l ->> 'qty') ~ '^\d{1,6}$' then (l ->> 'qty')::int else -1 end;
    if v_code !~ '^[a-z0-9][a-z0-9-]{0,47}$' or v_opt < 0 or v_qty < 1 or v_qty > c_qty_fmt then
      return jsonb_build_object('ok', false, 'code', 'BAD_LINES');
    end if;
    if (l ->> 'gb') is not null and (l ->> 'gb') !~ '^[a-z0-9]{6,16}$' then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
    if (l ->> 'price') is not null and (l ->> 'price') !~ '^\d{1,9}$' then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
    v_key := v_code || '#' || v_opt;
    v_qty := v_qty + coalesce((v_merged ->> v_key)::int, 0);
    if v_qty > c_qty_fmt then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
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

-- 0092 정의 + 수량 상한 없음 · 합계 bigint
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
    v_qty  := case when (l ->> 'qty') ~ '^\d{1,6}$' then (l ->> 'qty')::int else -1 end;
    if v_code !~ '^[a-z0-9][a-z0-9-]{0,47}$' or v_opt < 0 or v_qty < 1 or v_qty > 999999 then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
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
    v_out := v_out || (jsonb_build_object('code', v_code, 'option_index', v_opt, 'qty', v_qty, 'line_amount', v_unit::bigint * v_qty,
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
