-- ============================================================
-- 0107 · MYR 결제가 재고를 잡는지 · 새 결제로 대체되는지를 이름 붙은 함수로 (2026-11-13)
--
--   점검(백엔드 원칙 1 · 상태 묶음도 판정): 결제 상태 묶음이 이름 없이 쓰였다.
--     재고를 잡는 결제(PENDING · CONFIRMING · 만료 전) — myr_app_checkout_reserved
--     새 결제로 대체될 내 예약(PENDING) — myr_app_create_checkout 의 내 예약 합계 2곳(회원 · 비회원) · 대체 update 2곳
--   "내 예약 합계"(재고에 되돌려 줄 수량)와 "대체 update"(실제로 풀리는 예약)가 같은 함수에서 나오게 한다 — 어긋나면 품절 표시가 틀린다.
--   고침:
--     myr_checkout_holds_stock(c)            재고를 잡는 결제 — PENDING · CONFIRMING · 만료 전
--     myr_checkout_supersedable(c)           새 결제로 대체될 결제 — PENDING(만료 조건 없음 · 이미 만료된 PENDING 도 지금처럼 SUPERSEDED)
--     myr_checkout_mine(c, 회원, 이전 결제)   내 결제 — 회원이면 그 회원 · 비회원이면 이전 결제(회원 없는 것만)
--     myr_checkout_own_held(상품, 회원, 이전) 재고에 되돌려 줄 내 예약 = mine · holds_stock · supersedable(= PENDING · 만료 전 · 지금과 같다)
--   그대로 둔 것: myr_app_claim_checkout(만료로 바꾸기) · myr_expire_checkouts(정리 크론 · 유예) · myr_app_confirm_checkout(이미 끝난 결제인지) —
--     재고 판정이 아니라 상태 바꾸기라 자기 조건을 둔다(pgTAP _rules 허용 목록에 이름으로 남긴다).
--   계산 결과 불변 — 같은 조건을 함수로 옮겼다(supabase/tests/myr_checkout_holds.test.sql · 기존 결제 테스트).
-- ============================================================

create or replace function public.myr_checkout_holds_stock(c public.myr_checkouts)
returns boolean
language sql
stable
as $$
  select c.status in ('PENDING', 'CONFIRMING') and c.expires_at > now()
$$;
revoke all on function public.myr_checkout_holds_stock(public.myr_checkouts) from public, anon, authenticated;

create or replace function public.myr_checkout_supersedable(c public.myr_checkouts)
returns boolean
language sql
immutable
as $$
  select c.status = 'PENDING'
$$;
revoke all on function public.myr_checkout_supersedable(public.myr_checkouts) from public, anon, authenticated;

create or replace function public.myr_checkout_mine(c public.myr_checkouts, p_user_id uuid, p_prev_checkout_id uuid)
returns boolean
language sql
immutable
as $$
  select coalesce(case when p_user_id is not null then c.user_id = p_user_id
                       when p_prev_checkout_id is not null then c.id = p_prev_checkout_id and c.user_id is null
                       else false end, false)
$$;
revoke all on function public.myr_checkout_mine(public.myr_checkouts, uuid, uuid) from public, anon, authenticated;

create or replace function public.myr_checkout_own_held(p_product_id uuid, p_user_id uuid, p_prev_checkout_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(sum(ci.qty), 0)::int
    from public.myr_checkout_items ci
    join public.myr_checkouts c on c.id = ci.checkout_id
   where ci.product_id = p_product_id
     and public.myr_checkout_mine(c, p_user_id, p_prev_checkout_id)
     and public.myr_checkout_holds_stock(c)
     and public.myr_checkout_supersedable(c)
$$;
revoke all on function public.myr_checkout_own_held(uuid, uuid, uuid) from public, anon, authenticated;

-- 0058 정의 → myr_checkout_holds_stock
create or replace function public.myr_app_checkout_reserved(p_product_id uuid)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select coalesce(sum(ci.qty), 0)::int
    from public.myr_checkout_items ci
    join public.myr_checkouts c on c.id = ci.checkout_id
   where ci.product_id = p_product_id
     and public.myr_checkout_holds_stock(c)
$$;
revoke all on function public.myr_app_checkout_reserved(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_checkout_reserved(uuid) to service_role;

-- 0099 정의 + 내 예약 합계 → myr_checkout_own_held · 대체 update → myr_checkout_mine · myr_checkout_supersedable(바뀐 곳은 이 둘뿐)
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
    if v_left < v_tot then
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
