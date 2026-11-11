-- ============================================================
-- 0097 — MYR 수량 상한 제거(0095) 뒤에 남은 곳 + 옵션별 재고(2026-11-11 · PR #294 리뷰)
--   1) 교환·환불 요청 · 바로 환불의 수량 형식 검사가 그대로였다 — 150개 산 고객이 150개를 요청하면 거절됐다.
--      myr_refund_requests.qty 1~9(0078 표 제약) → 1 이상 · myr_app_claim_open \d{1,2}(99) → \d{1,6} · myr_refund_lines \d{1,3}(999) → \d{1,6}
--      실제 한도는 그대로 "남은 수량"(TOO_MANY · 0068 · 0078).
--   2) 결제 생성(myr_app_create_checkout)이 재고를 상품 · 옵션 단위로 따로 봤다 — 재고는 상품 하나에 걸려 있어
--      옵션 A · B 를 각각 남은 수량 이하로 담으면 합계가 재고를 넘어도 통과했고, 결제 승인(myr_app_confirm_checkout · 상품 합계)에서야
--      SOLD_OUT → 자동 결제 취소가 됐다(0058 부터 있던 구조). 이제 같은 상품의 옵션 수량을 합쳐 지금 살 수 있는 수량(myr_product_buyable)과 비교한다.
--      SOLD_OUT 의 left 는 앞 옵션이 쓴 만큼을 뺀 값.
--   바뀌는 함수: myr_app_create_checkout(0096) · myr_app_claim_open(0093) · myr_refund_lines(0068) — 나머지 그대로.
--   테스트: supabase/tests/myr_qty_no_cap.test.sql(추가).
-- ============================================================

alter table public.myr_refund_requests drop constraint if exists myr_refund_requests_qty_check;
alter table public.myr_refund_requests add constraint myr_refund_requests_qty_check check (qty >= 1);

-- 0068 정의 + 수량 형식 6자리
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
      select i.id, (i.qty - i.refunded_qty), i.unit_price, i.seller_id, (i.qty - i.refunded_qty), i.status, null::text, null::text, '{}'::text[]
        from public.myr_order_items i where i.order_id = o.id and i.status not in ('CANCELED') and (i.qty - i.refunded_qty) > 0;
    return;
  end if;
  for l in select * from jsonb_array_elements(p_items) loop
    if (l ->> 'item_id') !~ '^[0-9a-f-]{36}$' or (l ->> 'qty') !~ '^\d{1,6}$' then   -- 형식만(0097 · 수량 상한 없음 · 남은 수량은 TOO_MANY)
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
    select k.id, k.q, i.unit_price, i.seller_id, coalesce(i.qty - i.refunded_qty, 0), i.status,
           case when i.id is null then 'NOT_IN_ORDER'
                when i.status = 'CANCELED' then 'CANCELED'
                when k.q < 1 then 'BAD_QTY'
                when k.q > (i.qty - i.refunded_qty) then 'TOO_MANY'
                else null end,
           k.n, k.p
      from (select (key)::uuid as id, (value ->> 'q')::int as q, value ->> 'n' as n,
                   coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(value -> 'p') = 'array' then value -> 'p' else '[]'::jsonb end) x), '{}'::text[]) as p
              from jsonb_each(v_req)) k
      left join public.myr_order_items i on i.id = k.id and i.order_id = o.id;
end;
$$;
revoke all on function public.myr_refund_lines(public.myr_orders, jsonb) from public, anon, authenticated;

-- 0093 정의 + 수량 형식 6자리
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
    if (l ->> 'item_id') !~ '^[0-9a-f-]{36}$' or (l ->> 'qty') !~ '^\d{1,6}$' then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS'); end if;   -- 형식만(0097 · 수량 상한 없음 · 남은 수량은 아래 TOO_MANY)
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

-- 0096 정의 + 같은 상품 옵션 합쳐 재고 확인
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
