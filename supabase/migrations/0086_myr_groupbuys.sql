-- ============================================================
-- 0086 — MYR 공구 링크(docs/myr.md §9-6 작업 순서 4 · 2026-11-10 대표 결정)
--
--   크리에이터가 내 제품 메뉴에서 공구 링크를 만든다 — 할인율(1~70%) · 시작 · 종료. 운영 승인 없음 · 수량 제한 없음.
--   상품당 진행 중이거나 예정된 공구는 하나만(지난 공구는 기록으로 남는다). 링크(`/g/<code>`)는 만들자마자 발행되고,
--   공구가는 **시작~종료 사이에 링크로 들어온 고객**에게만 — 기본가는 그대로다. 같은 방문에서 산 다른 상품은 일반 경로.
--
--   myr_groupbuys                                 공구 1건 = 링크 1개 · closed_at = [지금 종료](끝 = least(ends_at, closed_at))
--   myr_groupbuy_price(price, pct)                공구가 = 기본가 × (100 − pct)% 를 10원 아래 버림 — 공구가 계산은 이 한 곳(장바구니 · 체크아웃 · 콘솔)
--   myr_groupbuy_state(g, now)                    scheduled | active | ended
--   myr_groupbuy_lookup(code)                     샵 `/g/<code>` · 상품 페이지 — { product_code, groupbuy } · 없으면 null
--   myr_product_unit_price(p, option_index)       옵션 단가 또는 대표가(0058 체크아웃과 같은 규칙 · 이제 체크아웃 · 장바구니가 이 함수를 쓴다)
--
--   장바구니(0057): myr_cart_items.groupbuy_id · myr_cart_set(…, p_groupbuy) · myr_cart_merge 줄의 gb · myr_cart_get 줄에 groupbuy
--   체크아웃(0058): 줄 { code, option_index, qty, gb?, price? } — gb 가 지금 진행 중이면 공구가 · 끝났으면 기본가.
--     price(화면이 보여 준 단가)가 서버 단가와 다르면 아무것도 만들지 않고 { ok:false, code:'PRICE_CHANGED', items:[{code, option_index, was, now, groupbuy}] }
--     groupbuy = active(공구가 적용) · inactive(공구 코드가 왔지만 기간 밖 · 종료) · null(공구 아님)
--     → 샵이 바뀐 금액을 보여 주고 고객이 확인해야 다시 결제한다. **결제 건을 만든 순간의 단가로 고정** — 결제창을 연 뒤 공구가 끝나도 그 결제는 공구가.
--     myr_checkout_items.groupbuy_id → myr_order_items.groupbuy_id(myr_app_confirm_checkout 이 복사)
--
--   크리에이터(콘솔 서버가 세션의 seller id 를 넘긴다 · 결정 3):
--     myr_app_seller_groupbuy_create(seller, product, pct, starts, ends)  { ok, groupbuy } · NOT_FOUND | NOT_LISTED | BAD_PCT | BAD_PERIOD | ALREADY_OPEN
--     myr_app_seller_groupbuy_close(seller, code)                          { ok, groupbuy } · NOT_FOUND | ALREADY_ENDED
--     myr_app_seller_groupbuys(seller, product)                            { product, items:[공구 + 실적] } · 남의 상품이면 null
--   실적(판매 수량 · 주문 수 · 매출)은 0076 홈 실적과 같은 줄 기준 — myr_sales_lines() 하나로 묶었다(백엔드 원칙 1 · 0076 결과 불변).
--   주문(0081): 줄에 groupbuy(공구로 산 줄이면 true) — 콘솔 "공구" 표시.
--
--   권한: 표는 service role 만 · 함수 전부 anon · authenticated EXECUTE 회수(service_role 만).
--   테스트: supabase/tests/myr_groupbuys.test.sql (+ myr_cart_likes · myr_checkout_orders · myr_seller_sales · myr_seller_orders 그대로 통과). 재실행 가능.
-- ============================================================

create table if not exists public.myr_groupbuys (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[a-z0-9]{6,16}$'),     -- 링크 /g/<code>
  product_id    uuid not null references public.myr_products (id) on delete cascade,
  seller_id     uuid not null references public.sellers (id) on delete cascade,
  discount_pct  integer not null check (discount_pct between 1 and 70),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  closed_at     timestamptz,                                                -- [지금 종료]
  created_at    timestamptz not null default now(),
  constraint myr_groupbuys_period check (ends_at > starts_at)
);
create index if not exists myr_groupbuys_product_idx on public.myr_groupbuys (product_id, created_at desc);
create index if not exists myr_groupbuys_seller_idx  on public.myr_groupbuys (seller_id, created_at desc);
alter table public.myr_groupbuys enable row level security;
revoke all on public.myr_groupbuys from anon, authenticated;

alter table public.myr_cart_items     add column if not exists groupbuy_id uuid references public.myr_groupbuys (id) on delete set null;
alter table public.myr_checkout_items add column if not exists groupbuy_id uuid references public.myr_groupbuys (id) on delete restrict;
alter table public.myr_order_items    add column if not exists groupbuy_id uuid references public.myr_groupbuys (id) on delete restrict;
create index if not exists myr_order_items_groupbuy_idx on public.myr_order_items (groupbuy_id) where groupbuy_id is not null;

-- ------------------------------------------------------------
-- 규칙(내부)
-- ------------------------------------------------------------
create or replace function public.myr_groupbuy_price(p_price integer, p_pct integer)
returns integer
language sql
immutable
as $$
  select ((p_price::bigint * (100 - p_pct)) / 1000 * 10)::integer
$$;
revoke all on function public.myr_groupbuy_price(integer, integer) from public, anon, authenticated;

create or replace function public.myr_groupbuy_state(g public.myr_groupbuys, p_now timestamptz default now())
returns text
language sql
stable
as $$
  select case when g.closed_at is not null or p_now >= g.ends_at then 'ended'
              when p_now < g.starts_at then 'scheduled'
              else 'active' end
$$;
revoke all on function public.myr_groupbuy_state(public.myr_groupbuys, timestamptz) from public, anon, authenticated;

create or replace function public.myr_product_unit_price(p public.myr_products, p_option_index integer)
returns integer
language sql
immutable
as $$
  select case
           when jsonb_typeof(p.options) = 'array' and jsonb_array_length(p.options) > 0 then
             case when p_option_index between 0 and jsonb_array_length(p.options) - 1 and (p.options -> p_option_index ->> 'price') ~ '^\d{1,9}$'
                  then (p.options -> p_option_index ->> 'price')::integer end
           when p_option_index = 0 then p.price
         end
$$;
revoke all on function public.myr_product_unit_price(public.myr_products, integer) from public, anon, authenticated;

-- 공개 모양(샵 · 장바구니) — 기본가 p_base 에 대한 공구가 포함. ends_at 은 [지금 종료]를 반영한 끝
create or replace function public.myr_groupbuy_json(g public.myr_groupbuys, p_base integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'code', g.code, 'state', public.myr_groupbuy_state(g), 'discount_pct', g.discount_pct,
    'starts_at', g.starts_at, 'ends_at', least(g.ends_at, coalesce(g.closed_at, g.ends_at)),
    'price', case when p_base is null then null else public.myr_groupbuy_price(p_base, g.discount_pct) end)
$$;
revoke all on function public.myr_groupbuy_json(public.myr_groupbuys, integer) from public, anon, authenticated;

-- 실적 줄 — 결제된 주문(paid_at 있음 · PAID · PARTIAL_REFUNDED · REFUNDED)의 줄. 0076 홈 실적 · 공구 실적이 같이 쓴다(인라인되도록 SET 없음)
create or replace function public.myr_sales_lines()
returns table (order_id uuid, seller_id uuid, product_id uuid, groupbuy_id uuid, qty integer, refunded_qty integer, amount integer,
               refund_amount integer, seller_margin_rate numeric, paid_at timestamptz)
language sql
stable
as $$
  select i.order_id, i.seller_id, i.product_id, i.groupbuy_id, i.qty, i.refunded_qty, i.amount, i.refund_amount, i.seller_margin_rate, o.paid_at
    from public.myr_order_items i
    join public.myr_orders o on o.id = i.order_id
   where o.paid_at is not null
     and o.status in ('PAID', 'PARTIAL_REFUNDED', 'REFUNDED')
$$;
revoke all on function public.myr_sales_lines() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 0076 홈 실적 — 줄 고르기를 myr_sales_lines() 로(계산 결과 불변 · myr_seller_sales.test.sql)
-- ------------------------------------------------------------
create or replace function public.myr_app_seller_sales(p_seller uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  with b as (
    select date_trunc('month', p_now at time zone 'Asia/Seoul') as m0,
           date_trunc('day', p_now at time zone 'Asia/Seoul') as d0
  ),
  lines as (
    select l.order_id, l.qty, l.refunded_qty, l.amount, l.refund_amount, l.seller_margin_rate,
           (l.paid_at at time zone 'Asia/Seoul') as paid_kst
      from public.myr_sales_lines() l
     where l.seller_id = p_seller
  ),
  m as (select l.* from lines l, b where l.paid_kst >= b.m0 and l.paid_kst < b.m0 + interval '1 month'),
  w as (select l.* from lines l, b where l.paid_kst >= b.d0 - interval '6 days' and l.paid_kst < b.d0 + interval '1 day')
  select jsonb_build_object(
    'month', to_char(b.m0, 'YYYY-MM'),
    'gross', coalesce((select sum(amount) from m), 0),
    'refunds', coalesce((select sum(refund_amount) from m), 0),
    'net', coalesce((select sum(amount - refund_amount) from m), 0),
    'orders', (select count(distinct order_id) from m),
    'units', coalesce((select sum(qty - refunded_qty) from m), 0),
    'refunded_orders', (select count(distinct order_id) from m where refunded_qty > 0),
    'payout', case when exists (select 1 from m where seller_margin_rate is null) then null
                   else coalesce((select round(sum((amount - refund_amount) * seller_margin_rate)) from m), 0) end,
    'week', (select jsonb_agg(jsonb_build_object('date', to_char(d, 'YYYY-MM-DD'),
                                                 'orders', (select count(distinct w.order_id) from w where date_trunc('day', w.paid_kst) = d))
                              order by d)
               from generate_series(b.d0 - interval '6 days', b.d0, interval '1 day') d)
  )
  from b
$$;
revoke all on function public.myr_app_seller_sales(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_sales(uuid, timestamptz) to service_role;

-- ------------------------------------------------------------
-- 샵 — myr_groupbuy_lookup(code): 링크 코드 → { product_code, groupbuy } · 없거나 상품이 샵에 없으면 null
-- ------------------------------------------------------------
create or replace function public.myr_groupbuy_lookup(p_code text)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object('product_code', p.code, 'groupbuy', public.myr_groupbuy_json(g, p.price))
    from public.myr_groupbuys g
    join public.myr_products p on p.id = g.product_id and p.deleted_at is null and p.status = 'listed'
    join public.sellers s on s.id = p.seller_id and s.active
   where g.code = lower(btrim(coalesce(p_code, '')))
$$;
revoke all on function public.myr_groupbuy_lookup(text) from public, anon, authenticated;
grant execute on function public.myr_groupbuy_lookup(text) to service_role;

-- ------------------------------------------------------------
-- 장바구니(0057) — 줄에 공구 코드. 담을 때 공구가 끝났거나 다른 상품의 코드면 조용히 버린다(기본가로 담긴다).
--   같은 줄을 다시 담을 때 코드가 없으면 기존 공구를 그대로 둔다.
-- ------------------------------------------------------------
create or replace function public.myr_cart_get(p_user_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(
           public.myr_product_public_json(p, s)
             || jsonb_build_object('qty', c.qty, 'option_index', c.option_index, 'available', public.myr_product_available(p, s),
                                   'groupbuy', case when g.id is null then null else public.myr_groupbuy_json(g, public.myr_product_unit_price(p, c.option_index)) end)
           order by c.created_at, c.id), '[]'::jsonb)
    from public.myr_cart_items c
    join public.myr_products p on p.id = c.product_id
    join public.sellers s on s.id = p.seller_id
    left join public.myr_groupbuys g on g.id = c.groupbuy_id
   where c.user_id = p_user_id
$$;
revoke all on function public.myr_cart_get(uuid) from public, anon, authenticated;
grant execute on function public.myr_cart_get(uuid) to service_role;

drop function if exists public.myr_cart_set(uuid, text, integer, integer, boolean);
create or replace function public.myr_cart_set(p_user_id uuid, p_code text, p_option_index integer default 0, p_qty integer default 1, p_add boolean default false, p_groupbuy text default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c_max_qty    constant integer := 9;
  v_code       text := lower(btrim(coalesce(p_code, '')));
  v_product_id uuid;
  v_available  boolean;
  v_qty        integer;
  v_gb         uuid;
begin
  if p_user_id is null then return jsonb_build_object('ok', false, 'code', 'NO_USER'); end if;
  if p_qty is null or p_qty < 0 or p_qty > c_max_qty then return jsonb_build_object('ok', false, 'code', 'BAD_QTY'); end if;
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
    set qty = case when p_add then least(c_max_qty, public.myr_cart_items.qty + excluded.qty) else excluded.qty end,
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
    v_qty := case when (l->>'qty') ~ '^\d{1,3}$' then (l->>'qty')::integer else -1 end;
    v_opt := case when (l->>'option_index') is null then 0 when (l->>'option_index') ~ '^\d{1,3}$' then (l->>'option_index')::integer else -1 end;
    r := public.myr_cart_set(p_user_id, l->>'code', v_opt, v_qty, true, nullif(l->>'gb', ''));
    if (r->>'ok')::boolean and v_qty > 0 then v_merged := v_merged + 1; else v_skip := v_skip + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'merged', v_merged, 'skipped', v_skip);
end;
$$;
revoke all on function public.myr_cart_merge(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_cart_merge(uuid, jsonb) to service_role;

-- ============================================================
-- 체크아웃(0058) — 줄의 gb · price. 바뀐 곳: ① 합칠 때 gb · price 를 같이 기억 ② 단가 = myr_product_unit_price → 진행 중 공구면 공구가
--   ③ 화면 단가(price)와 다르면 PRICE_CHANGED ④ 줄에 groupbuy_id. 나머지(검증 순서 · 잔여 · supersede · 반환)는 0058 그대로.
-- ============================================================
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
  g            public.myr_groupbuys%rowtype;
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
    v_unit := public.myr_product_unit_price(p, v_opt);
    if v_unit is null then
      v_problems := v_problems || jsonb_build_object('code', v_code, 'reason', 'BAD_OPTION');
      continue;
    end if;
    v_optname := case when jsonb_typeof(p.options) = 'array' and jsonb_array_length(p.options) > 0 then coalesce(p.options -> v_opt ->> 'n', '') else '' end;
    -- 공구 — 이 상품의 공구이고 지금 진행 중일 때만 공구가. 아니면 기본가(줄을 막지 않는다 · 가격 비교가 알린다)
    v_gb_id := null;
    v_gb_code := v_gbs ->> v_key;
    if v_gb_code is not null then
      select * into g from public.myr_groupbuys where code = v_gb_code and product_id = p.id;
      if found and public.myr_groupbuy_state(g) = 'active' then
        v_unit := public.myr_groupbuy_price(v_unit, g.discount_pct);
        v_gb_id := g.id;
      end if;
    end if;
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

-- 승인 확정(0058) — 바뀐 곳은 줄 insert 의 groupbuy_id 한 칸. 결제 건의 단가를 그대로 옮긴다(공구가 끝났어도 결제 건을 만든 때의 값)
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
    select p.id, p.code, p.status, p.deleted_at, p.stock, p.sold_qty, s.active as seller_active,
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
      v_left := pr.stock - pr.sold_qty;
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

-- ------------------------------------------------------------
-- 크리에이터 — 공구 만들기 · 지금 종료 · 상품의 공구 목록(실적 포함)
-- ------------------------------------------------------------
create or replace function public.myr_groupbuy_seller_json(g public.myr_groupbuys, p_base integer)
returns jsonb
language sql
stable
as $$
  select public.myr_groupbuy_json(g, p_base)
      || jsonb_build_object('planned_ends_at', g.ends_at, 'closed_at', g.closed_at, 'created_at', g.created_at,
                            'stats', (select jsonb_build_object('orders', count(distinct l.order_id),
                                                                'units', coalesce(sum(l.qty - l.refunded_qty), 0),
                                                                'net', coalesce(sum(l.amount - l.refund_amount), 0))
                                        from public.myr_sales_lines() l where l.groupbuy_id = g.id))
$$;
revoke all on function public.myr_groupbuy_seller_json(public.myr_groupbuys, integer) from public, anon, authenticated;

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
  return jsonb_build_object('ok', true, 'groupbuy', public.myr_groupbuy_seller_json(g, p.price));
end;
$$;
revoke all on function public.myr_app_seller_groupbuy_create(uuid, uuid, integer, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_groupbuy_create(uuid, uuid, integer, timestamptz, timestamptz) to service_role;

create or replace function public.myr_app_seller_groupbuy_close(p_seller uuid, p_code text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  g public.myr_groupbuys%rowtype;
  v_price integer;
begin
  select * into g from public.myr_groupbuys where code = lower(btrim(coalesce(p_code, ''))) and seller_id = p_seller for update;
  if not found or p_seller is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if public.myr_groupbuy_state(g) = 'ended' then return jsonb_build_object('ok', false, 'code', 'ALREADY_ENDED'); end if;
  update public.myr_groupbuys set closed_at = now() where id = g.id returning * into g;
  select price into v_price from public.myr_products where id = g.product_id;
  return jsonb_build_object('ok', true, 'groupbuy', public.myr_groupbuy_seller_json(g, v_price));
end;
$$;
revoke all on function public.myr_app_seller_groupbuy_close(uuid, text) from public, anon, authenticated;
grant execute on function public.myr_app_seller_groupbuy_close(uuid, text) to service_role;

create or replace function public.myr_app_seller_groupbuys(p_seller uuid, p_product_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
           'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'price', p.price, 'status', p.status,
                                         'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url),
           'items', coalesce((select jsonb_agg(public.myr_groupbuy_seller_json(g, p.price) order by g.created_at desc)
                                from public.myr_groupbuys g where g.product_id = p.id), '[]'::jsonb))
    from public.myr_products p
   where p.id = p_product_id and p.seller_id = p_seller and p.deleted_at is null and p_seller is not null
$$;
revoke all on function public.myr_app_seller_groupbuys(uuid, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_groupbuys(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- 주문(0081) — 줄에 groupbuy(공구로 산 줄). 나머지 그대로
-- ------------------------------------------------------------
create or replace function public.myr_app_seller_orders(p_seller uuid, p_limit integer default 200)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', o.id, 'code', o.code, 'status', o.status, 'paid_at', o.paid_at,
             'buyer', public.myr_mask_name(o.buyer_name),
             'items', (select jsonb_agg(jsonb_build_object(
                         'id', i.id, 'name', i.product_name, 'option', i.option_name, 'qty', i.qty, 'unit_price', i.unit_price, 'amount', i.amount,
                         'status', i.status, 'refunded_qty', i.refunded_qty, 'refund_amount', i.refund_amount,
                         'ship_status', i.ship_status, 'courier', i.courier, 'tracking_no', i.tracking_no, 'shipped_at', i.shipped_at, 'delivered_at', i.delivered_at,
                         'groupbuy', i.groupbuy_id is not null,
                         'product', (select jsonb_build_object('code', p.code, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = i.product_id),
                         'claim', (select jsonb_build_object('code', r.code, 'status', r.status, 'kind', r.kind)
                                     from public.myr_refund_requests r where r.order_item_id = i.id and r.status in ('pending', 'progress')
                                    order by r.created_at desc limit 1))
                       order by i.created_at, i.id)
                       from public.myr_order_items i where i.order_id = o.id and i.seller_id = p_seller))
           order by o.paid_at desc, o.code desc)
      from (select o.* from public.myr_orders o
             where o.status in ('PAID', 'PARTIAL_REFUNDED', 'REFUNDED')
               and exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.seller_id = p_seller)
             order by o.paid_at desc, o.code desc
             limit least(greatest(coalesce(p_limit, 200), 1), 500)) o
  ), '[]'::jsonb)
$$;
revoke all on function public.myr_app_seller_orders(uuid, integer) from public, anon, authenticated;
grant execute on function public.myr_app_seller_orders(uuid, integer) to service_role;
