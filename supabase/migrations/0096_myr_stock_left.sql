-- ============================================================
-- 0096 — MYR 재고 판정을 서버 함수 하나로 · 상품 페이지 · 장바구니에 지금 살 수 있는 수량(2026-11-11)
--   "남은 재고"(입고 − 판매)를 7곳이 각자 계산했고, 결제 생성만 결제 대기 수량까지 뺐다(백엔드 원칙 1 위반).
--
--   새 함수
--     myr_product_left(product)            남은 재고 = max(입고 stock − 판매 sold_qty, 0) — 계산식은 이 한 곳
--     myr_product_buyable(product, own)    지금 살 수 있는 수량 = 남은 재고 − 다른 고객 결제 대기(본인 대기 own 은 곧 대체되니 뺀다) — myr_product_left 위에
--   바뀌는 함수(재고 계산만 위 함수로 · 결과 그대로)
--     myr_product_available(0057)          장바구니 "살 수 있음" — 남은 재고 > 0
--     myr_product_public_json(0073)        "품절" — 남은 재고 ≤ 0 · **새 칸 stock_left = 지금 살 수 있는 수량**(상품 페이지 표시 · 수량 버튼 상한)
--     myr_app_seller_products(0074)        콘솔 내 제품 stock_left — 남은 재고
--     myr_app_seller_groupbuy_create(0086) 공구 만들기 품절 막기 — 남은 재고 ≤ 0
--     myr_app_seller_groupbuys(0086)       콘솔 공구 "품절" — 남은 재고 ≤ 0
--     myr_app_confirm_checkout(0086)       결제 승인 재확인 — 남은 재고
--     myr_app_create_checkout(0095)        결제 생성 재고 부족 — 지금 살 수 있는 수량(상품 페이지 표시와 같은 값)
--     myr_app_cart_quote(0095)             장바구니 견적 줄마다 stock_left(지금 살 수 있는 수량)
--   권한: 새 내부 함수는 anon · authenticated EXECUTE 회수. 테스트: supabase/tests/myr_stock_left.test.sql(+ 기존 체크아웃 · 공구 · 장바구니 · 상품 테스트 그대로).
-- ============================================================

create or replace function public.myr_product_left(p public.myr_products)
returns integer
language sql
stable
as $$
  select greatest(coalesce(p.stock, 0) - coalesce(p.sold_qty, 0), 0)
$$;
revoke all on function public.myr_product_left(public.myr_products) from public, anon, authenticated;

create or replace function public.myr_product_buyable(p public.myr_products, p_own integer default 0)
returns integer
language sql
stable
as $$
  select greatest(public.myr_product_left(p) - greatest(public.myr_app_checkout_reserved(p.id) - coalesce(p_own, 0), 0), 0)
$$;
revoke all on function public.myr_product_buyable(public.myr_products, integer) from public, anon, authenticated;

-- 0057 정의 + 재고 = myr_product_left / myr_product_buyable
create or replace function public.myr_product_available(p public.myr_products, s public.sellers)
returns boolean
language sql
stable
as $$
  select p.status = 'listed' and p.deleted_at is null and coalesce(s.active, false) and public.myr_product_left(p) > 0
$$;
revoke all on function public.myr_product_available(public.myr_products, public.sellers) from public, anon, authenticated;

-- 0073 정의 + 재고 = myr_product_left / myr_product_buyable
create or replace function public.myr_product_public_json(p public.myr_products, s public.sellers)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', p.id, 'code', p.code, 'category', p.category, 'name', p.name, 'unit', p.unit, 'price', p.price,
    'tile', p.tile, 'thumb_url', p.thumb_url, 'image_urls', to_jsonb(p.image_urls), 'icon', p.icon, 'form', p.form, 'pack', p.pack, 'flavor', p.flavor, 'tag', p.tag,
    'chips', to_jsonb(p.chips), 'ingredients', to_jsonb(p.ingredients), 'note', p.note, 'howto', p.howto,
    'story_title', p.story_title, 'story', p.story, 'ingredient_rows', p.ingredient_rows,
    'howto_steps', p.howto_steps, 'faq', p.faq, 'shelf_life', p.shelf_life, 'storage_method', p.storage_method,
    'sold_out', public.myr_product_left(p) <= 0,
    'stock_left', public.myr_product_buyable(p),
    'creator', jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'avatar_url', s.avatar_url),
    'created_at', p.created_at
  )
$$;
revoke all on function public.myr_product_public_json(public.myr_products, public.sellers) from public, anon, authenticated;

-- 0074 정의 + 재고 = myr_product_left / myr_product_buyable
create or replace function public.myr_app_seller_products(p_seller uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'code', p.code, 'name', p.name, 'status', p.status, 'reject_reason', p.reject_reason, 'reject_items', p.reject_items,
           'category', p.category, 'price', p.price, 'option_count', jsonb_array_length(p.options),
           'stock', p.stock, 'sold_qty', p.sold_qty, 'stock_left', public.myr_product_left(p),
           'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url,
           'submitted_at', p.submitted_at, 'reviewed_at', p.reviewed_at, 'created_at', p.created_at, 'updated_at', p.updated_at,
           'revision', case when rv.id is null then null
                            else jsonb_build_object('status', rv.status, 'reject_reason', rv.reject_reason, 'reject_items', rv.reject_items, 'submitted_at', rv.submitted_at, 'reviewed_at', rv.reviewed_at) end
         ) order by p.updated_at desc, p.created_at desc), '[]'::jsonb)
    from public.myr_products p
    left join lateral public.myr_product_open_revision(p.id) rv on true
   where p.seller_id = p_seller
     and p.deleted_at is null
$$;
revoke all on function public.myr_app_seller_products(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_products(uuid) to service_role;

-- 0086 정의 + 재고 = myr_product_left / myr_product_buyable
create or replace function public.myr_app_seller_groupbuy_create(p_seller uuid, p_product_id uuid, p_pct integer, p_starts_at timestamptz, p_ends_at timestamptz)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p       public.myr_products%rowtype;
  g       public.myr_groupbuys%rowtype;
  v_start timestamptz := p_starts_at;
  v_code  text;
begin
  select * into p from public.myr_products where id = p_product_id and seller_id = p_seller and deleted_at is null for update;
  if not found or p_seller is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p.status <> 'listed' then return jsonb_build_object('ok', false, 'code', 'NOT_LISTED'); end if;
  if public.myr_product_left(p) <= 0 then return jsonb_build_object('ok', false, 'code', 'SOLD_OUT'); end if;
  if p_pct is null or p_pct < 1 or p_pct > 70 then return jsonb_build_object('ok', false, 'code', 'BAD_PCT'); end if;
  if v_start is null or p_ends_at is null then return jsonb_build_object('ok', false, 'code', 'BAD_PERIOD'); end if;
  if v_start < now() then v_start := now(); end if;   -- 지난 시각으로 시작하면 지금부터
  if p_ends_at <= v_start then return jsonb_build_object('ok', false, 'code', 'BAD_PERIOD'); end if;
  if exists (select 1 from public.myr_groupbuys x where x.product_id = p.id and public.myr_groupbuy_state(x) <> 'ended') then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_OPEN');
  end if;
  loop
    v_code := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    begin
      insert into public.myr_groupbuys (code, product_id, seller_id, discount_pct, starts_at, ends_at)
      values (v_code, p.id, p_seller, p_pct, v_start, p_ends_at)
      returning * into g;
      exit;
    exception when unique_violation then
      -- 코드가 겹치면 다시
    end;
  end loop;
  return jsonb_build_object('ok', true, 'groupbuy', public.myr_groupbuy_seller_json(g, p));
end;
$$;
revoke all on function public.myr_app_seller_groupbuy_create(uuid, uuid, integer, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_groupbuy_create(uuid, uuid, integer, timestamptz, timestamptz) to service_role;

-- 0086 정의 + 재고 = myr_product_left / myr_product_buyable
create or replace function public.myr_app_seller_groupbuys(p_seller uuid, p_product_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
           'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'price', coalesce(public.myr_product_unit_price(p, 0), p.price), 'status', p.status,
                                         'sold_out', public.myr_product_left(p) <= 0, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url),
           'items', coalesce((select jsonb_agg(public.myr_groupbuy_seller_json(g, p) order by g.created_at desc)
                                from public.myr_groupbuys g where g.product_id = p.id), '[]'::jsonb))
    from public.myr_products p
   where p.id = p_product_id and p.seller_id = p_seller and p.deleted_at is null and p_seller is not null
$$;
revoke all on function public.myr_app_seller_groupbuys(uuid, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_groupbuys(uuid, uuid) to service_role;

-- 0086 정의 + 재고 = myr_product_left / myr_product_buyable
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
    select p.id, p.code, p.status, p.deleted_at, public.myr_product_left(p) as left_qty, s.active as seller_active,
           (select sum(ci.qty) from public.myr_checkout_items ci where ci.checkout_id = c.id and ci.product_id = p.id) as need
      from public.myr_products p
      left join public.sellers s on s.id = p.seller_id
     where p.id in (select product_id from public.myr_checkout_items where checkout_id = c.id)
     order by p.id
       for update of p
  loop
    v_need := coalesce(pr.need, 0);
    if pr.status <> 'listed' or pr.deleted_at is not null or not coalesce(pr.seller_active, false) then
      v_problems := v_problems || jsonb_build_object('code', pr.code, 'reason', 'NOT_AVAILABLE');
    else
      v_left := pr.left_qty;   -- 남은 재고 = myr_product_left 한 곳(0096)
      if v_left < v_need then v_problems := v_problems || jsonb_build_object('code', pr.code, 'reason', 'SOLD_OUT', 'left', greatest(v_left, 0)); end if;
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

-- 0095 정의 + 재고 = myr_product_left / myr_product_buyable
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
    v_left := public.myr_product_buyable(p, v_own);   -- 지금 살 수 있는 수량 = myr_product_buyable 한 곳(0096 · 상품 페이지 표시와 같은 값)
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

-- 0095 정의 + 재고 = myr_product_left / myr_product_buyable
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
