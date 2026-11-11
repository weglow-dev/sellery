-- ============================================================
-- 0099 — MYR 남은 판정을 함수 하나씩으로(2026-11-11 · 백엔드 원칙 1 · 2)
--   0092~0098 이 견적 · 환불 길 · 재고 · 줄의 남은 수량을 한 곳으로 모았다. 아래 판정은 아직 함수마다 같은 식을 따로 쓰고 있었다 — 전부 이름 붙은 함수로 옮긴다.
--   계산 결과는 그대로(기존 pgTAP 은 응답에 더한 칸만 고쳐 그대로 통과). 달라지는 것은 맨 아래 "달라지는 동작" 넷뿐.
--
--   새 함수(판정 하나에 함수 하나)
--     상품   myr_product_listed(판매 중 = listed · 삭제 아님) · myr_product_visible(샵에 보이는 상품 = 판매 중 + 크리에이터 활성) · myr_product_sold_out(품절 = 남은 재고 0)
--            myr_product_status_approved(심사 통과 = listed · paused → 수정본 · 판매 종료 가능) · myr_product_status_editable(직접 수정 = draft · rejected)
--            myr_revision_status_open(열린 수정본 = pending · rejected) · myr_product_price_max(판매가 상한)
--     주문   myr_order_status_paid(결제된 주문 = PAID · PARTIAL_REFUNDED · REFUNDED) · myr_order_status_alive(끝나지 않은 주문 = WAITING_DEPOSIT · PAID · PARTIAL_REFUNDED)
--            myr_order_status_open(결제됐고 끝나지 않은 주문 = 둘 다) · myr_order_net(결제 − 환불) · myr_order_owned_by(주문 주인)
--     줄     myr_line_valid(취소가 아닌 줄) · myr_line_net(줄 금액 − 환불) · myr_line_amount(단가 × 수량) · myr_ship_status_unshipped(출고 전 = 결제완료 · 배송준비중)
--     요청   myr_claim_status_open(열린 요청 = pending · progress) · myr_claim_resolution_deducts(왕복 배송비를 빼는 처리 방법)
--            myr_claim_open_deduction(새 요청의 예상 차감 — 샵 예상 금액이 부른다)
--     공구   myr_groupbuy_pct_min · max · ok(할인율 범위 — 표 CHECK · 만들기 · 미리보기 · 콘솔 폼이 같이 쓴다)
--     제조   myr_deposit_amount(보증금 = 제조비 × 보증금 비율)
--   화면이 다시 계산하지 않게 응답에 더하는 값
--     주문(샵)     net_amount · alive · 줄 live · left_amount(남은 수량 금액) · claim_status 는 결제됐고 끝나지 않은 주문에만
--     주문(콘솔)   주문마다 ship_status(내 줄) · amounts(paid · refunded · net)
--     요청         open · refund_paid · shipping_back · 줄 amount(주문 수량 금액)
--     환불 precheck  goods · shipping_back
--     내 상품      editable · approved · 목록 sold_out · 공구 화면 product.listed · pct_min · pct_max
--     상품 저장    판매가 거절 응답에 max(콘솔 안내 문구가 서버 상한을 쓴다)
--   새 RPC      myr_app_order_refresh_payment(주문, 토스 payment) — 결제됐고 끝나지 않은 주문의 결제 원문 갱신(샵 서버가 상태 묶음을 직접 쓰지 않게)
--   없애는 값   myr_app_seller_sales 의 payout(옛 마진율 계산 — 화면은 정산 예상 myr_settlement_preview 를 쓴다) · myr_sales_lines 의 seller_margin_rate
--   권한: 새 내부 함수는 anon · authenticated EXECUTE 회수 · myr_claim_open_deduction · myr_app_order_refresh_payment 만 service_role.
--   테스트: supabase/tests/myr_single_source.test.sql(새 함수 · 권한 · "식이 지정한 함수 밖에 없다" 검사) + 기존 테스트 그대로.
-- ============================================================

-- ── 1. 판정 함수 ─────────────────────────────────────────────

-- 상품
create or replace function public.myr_product_listed(p public.myr_products)
returns boolean
language sql
stable
as $$
  select coalesce(p.status = 'listed' and p.deleted_at is null, false)
$$;
revoke all on function public.myr_product_listed(public.myr_products) from public, anon, authenticated;

create or replace function public.myr_product_visible(p public.myr_products, s public.sellers)
returns boolean
language sql
stable
as $$
  select public.myr_product_listed(p) and coalesce(s.active, false)
$$;
revoke all on function public.myr_product_visible(public.myr_products, public.sellers) from public, anon, authenticated;

create or replace function public.myr_product_sold_out(p public.myr_products)
returns boolean
language sql
stable
as $$
  select public.myr_product_left(p) <= 0
$$;
revoke all on function public.myr_product_sold_out(public.myr_products) from public, anon, authenticated;

create or replace function public.myr_product_status_approved(p_status text)
returns boolean
language sql
immutable
as $$
  select p_status in ('listed', 'paused')
$$;
revoke all on function public.myr_product_status_approved(text) from public, anon, authenticated;

create or replace function public.myr_product_status_editable(p_status text)
returns boolean
language sql
immutable
as $$
  select p_status in ('draft', 'rejected')
$$;
revoke all on function public.myr_product_status_editable(text) from public, anon, authenticated;

create or replace function public.myr_revision_status_open(p_status text)
returns boolean
language sql
immutable
as $$
  select p_status in ('pending', 'rejected')
$$;
revoke all on function public.myr_revision_status_open(text) from public, anon, authenticated;

create or replace function public.myr_product_price_max()
returns integer
language sql
immutable
as $$
  select 10000000
$$;
revoke all on function public.myr_product_price_max() from public, anon, authenticated;

-- 주문 상태
create or replace function public.myr_order_status_paid(p_status text)
returns boolean
language sql
immutable
as $$
  select p_status in ('PAID', 'PARTIAL_REFUNDED', 'REFUNDED')
$$;
revoke all on function public.myr_order_status_paid(text) from public, anon, authenticated;

create or replace function public.myr_order_status_alive(p_status text)
returns boolean
language sql
immutable
as $$
  select p_status in ('WAITING_DEPOSIT', 'PAID', 'PARTIAL_REFUNDED')
$$;
revoke all on function public.myr_order_status_alive(text) from public, anon, authenticated;

create or replace function public.myr_order_status_open(p_status text)
returns boolean
language sql
immutable
as $$
  select public.myr_order_status_paid(p_status) and public.myr_order_status_alive(p_status)
$$;
revoke all on function public.myr_order_status_open(text) from public, anon, authenticated;

create or replace function public.myr_order_net(o public.myr_orders)
returns integer
language sql
stable
as $$
  select greatest(o.amount - o.refund_amount, 0)
$$;
revoke all on function public.myr_order_net(public.myr_orders) from public, anon, authenticated;

-- 주문 주인 — 회원 주문은 user_id · 비회원 주문은 customer_id (actor 가 없으면 거짓)
create or replace function public.myr_order_owned_by(o public.myr_orders, p_actor_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(p_actor_id is not null and (o.user_id = p_actor_id or (o.user_id is null and o.customer_id = p_actor_id)), false)
$$;
revoke all on function public.myr_order_owned_by(public.myr_orders, uuid) from public, anon, authenticated;

-- 줄
create or replace function public.myr_line_valid(i public.myr_order_items)
returns boolean
language sql
stable
as $$
  select coalesce(i.status <> 'CANCELED', false)
$$;
revoke all on function public.myr_line_valid(public.myr_order_items) from public, anon, authenticated;

create or replace function public.myr_line_live(i public.myr_order_items)
returns boolean
language sql
stable
as $$
  select public.myr_line_valid(i) and public.myr_line_left(i) > 0
$$;
revoke all on function public.myr_line_live(public.myr_order_items) from public, anon, authenticated;

create or replace function public.myr_line_net(i public.myr_order_items)
returns integer
language sql
stable
as $$
  select i.amount - i.refund_amount
$$;
revoke all on function public.myr_line_net(public.myr_order_items) from public, anon, authenticated;

create or replace function public.myr_line_amount(p_unit_price integer, p_qty integer)
returns bigint
language sql
immutable
as $$
  select p_unit_price::bigint * p_qty
$$;
revoke all on function public.myr_line_amount(integer, integer) from public, anon, authenticated;

-- 아직 출고 전인 줄(결제완료 · 배송준비중)
create or replace function public.myr_ship_status_unshipped(p_ship_status text)
returns boolean
language sql
immutable
as $$
  select p_ship_status in ('PAID', 'PREPARING')
$$;
revoke all on function public.myr_ship_status_unshipped(text) from public, anon, authenticated;

-- 교환 · 환불 요청
create or replace function public.myr_claim_status_open(p_status text)
returns boolean
language sql
immutable
as $$
  select p_status in ('pending', 'progress')
$$;
revoke all on function public.myr_claim_status_open(text) from public, anon, authenticated;

create or replace function public.myr_claim_resolution_deducts(p_resolution text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_resolution = 'partial', false)
$$;
revoke all on function public.myr_claim_resolution_deducts(text) from public, anon, authenticated;

-- 새 요청의 예상 차감 — 환불 요청이고 처리 방법 기본(myr_refund_request_options 첫 값)이 왕복 배송비를 빼는 방법이면 왕복 배송비 · 그 밖은 0.
--   한 번에 보낸 요청은 묶음에서 한 번만 뺀다(myr_refund_request_fee_due) — 샵 예상 금액은 고른 줄 전체를 한 번에 계산하므로 한 번
create or replace function public.myr_claim_open_deduction(p_kind text, p_reason text)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select case when p_kind = 'refund' and public.myr_claim_resolution_deducts((public.myr_refund_request_options(p_kind, p_reason))[1])
              then public.myr_claim_return_fee() else 0 end
$$;
revoke all on function public.myr_claim_open_deduction(text, text) from public, anon, authenticated;
grant execute on function public.myr_claim_open_deduction(text, text) to service_role;

-- 토스 재조회(웹훅 · reconcile)로 받은 결제 원문을 주문에 반영 — 결제됐고 끝나지 않은 주문만(환불 · 취소로 끝난 주문의 원문은 그대로 둔다).
--   샵 서버가 상태 묶음('PAID','PARTIAL_REFUNDED')을 직접 쓰던 update 를 옮긴 것 · 바뀐 줄이 있으면 true
create or replace function public.myr_app_order_refresh_payment(p_order_id uuid, p_payment jsonb)
returns boolean
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_n integer;
begin
  if p_payment is null or jsonb_typeof(p_payment) <> 'object' then return false; end if;
  update public.myr_orders o
     set raw_payment = p_payment, payment_method = p_payment ->> 'method'
   where o.id = p_order_id and public.myr_order_status_open(o.status);
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;
revoke all on function public.myr_app_order_refresh_payment(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_order_refresh_payment(uuid, jsonb) to service_role;

-- 공구 할인율 범위
create or replace function public.myr_groupbuy_pct_min()
returns integer
language sql
immutable
as $$
  select 1
$$;
revoke all on function public.myr_groupbuy_pct_min() from public, anon, authenticated;

create or replace function public.myr_groupbuy_pct_max()
returns integer
language sql
immutable
as $$
  select 70
$$;
revoke all on function public.myr_groupbuy_pct_max() from public, anon, authenticated;

create or replace function public.myr_groupbuy_pct_ok(p_pct integer)
returns boolean
language sql
immutable
as $$
  select coalesce(p_pct between public.myr_groupbuy_pct_min() and public.myr_groupbuy_pct_max(), false)
$$;
revoke all on function public.myr_groupbuy_pct_ok(integer) from public, anon, authenticated;

alter table public.myr_groupbuys drop constraint if exists myr_groupbuys_discount_pct_check;
alter table public.myr_groupbuys add constraint myr_groupbuys_discount_pct_check check (public.myr_groupbuy_pct_ok(discount_pct));

-- 제조비 보증금
create or replace function public.myr_deposit_amount(p_amount integer)
returns integer
language sql
stable
as $$
  select (p_amount::bigint * public.myr_deposit_pct() / 100)::integer
$$;
revoke all on function public.myr_deposit_amount(integer) from public, anon, authenticated;

-- 실적 줄(0098) + net · seller_margin_rate 는 뺀다 — 반환 모양이 바뀌어 다시 만든다(쓰는 함수 둘은 아래에서 같이 바꾼다)
drop function if exists public.myr_sales_lines();
create function public.myr_sales_lines()
returns table (order_id uuid, seller_id uuid, product_id uuid, groupbuy_id uuid, qty integer, refunded_qty integer, amount integer,
               refund_amount integer, paid_at timestamptz, left_qty integer, net integer)
language sql
stable
as $$
  select i.order_id, i.seller_id, i.product_id, i.groupbuy_id, i.qty, i.refunded_qty, i.amount, i.refund_amount, o.paid_at,
         public.myr_line_left(i), public.myr_line_net(i)
    from public.myr_order_items i
    join public.myr_orders o on o.id = i.order_id
   where o.paid_at is not null
     and public.myr_order_status_paid(o.status)
$$;
revoke all on function public.myr_sales_lines() from public, anon, authenticated;

-- 배송 상태(0098) + 크리에이터 — p_seller 를 주면 그 크리에이터 줄만(콘솔 주문 탭) · 인자가 늘어 다시 만든다
drop function if exists public.myr_order_ship_status(uuid);
create or replace function public.myr_order_ship_status(p_order_id uuid, p_seller uuid default null)
returns text
language sql
stable
set search_path = public
as $$
  select case min(case i.ship_status when 'PAID' then 1 when 'PREPARING' then 2 when 'SHIPPING' then 3 else 4 end)
           when 1 then 'PAID' when 2 then 'PREPARING' when 3 then 'SHIPPING' when 4 then 'DELIVERED' end
    from public.myr_order_items i
   where i.order_id = p_order_id and (p_seller is null or i.seller_id = p_seller) and public.myr_line_live(i)
$$;
revoke all on function public.myr_order_ship_status(uuid, uuid) from public, anon, authenticated;

-- ── 2. 판정을 쓰던 함수 — 식만 위 함수로 ─────────────────────────

-- 0096 정의 + myr_product_visible · myr_product_sold_out
create or replace function public.myr_product_available(p public.myr_products, s public.sellers)
returns boolean
language sql
stable
as $$
  select public.myr_product_visible(p, s) and not public.myr_product_sold_out(p)
$$;
revoke all on function public.myr_product_available(public.myr_products, public.sellers) from public, anon, authenticated;

-- 0096 정의 + myr_product_sold_out
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
    'sold_out', public.myr_product_sold_out(p),
    'stock_left', public.myr_product_buyable(p),
    'creator', jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'avatar_url', s.avatar_url),
    'created_at', p.created_at
  )
$$;
revoke all on function public.myr_product_public_json(public.myr_products, public.sellers) from public, anon, authenticated;

-- 0096 정의 + sold_out · editable · approved(콘솔 목록이 다시 판정하지 않게)
create or replace function public.myr_app_seller_products(p_seller uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'code', p.code, 'name', p.name, 'status', p.status, 'reject_reason', p.reject_reason, 'reject_items', p.reject_items,
           'category', p.category, 'price', p.price, 'option_count', jsonb_array_length(p.options),
           'stock', p.stock, 'sold_qty', p.sold_qty, 'stock_left', public.myr_product_left(p), 'sold_out', public.myr_product_sold_out(p),
           'editable', public.myr_product_status_editable(p.status), 'approved', public.myr_product_status_approved(p.status),
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

-- 0097 정의 + myr_product_visible · myr_line_amount
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
                                           'base_amount', null, 'stock_left', 0, 'groupbuy_state', null, 'groupbuy_code', null);
      continue;
    end if;
    v_price := public.myr_line_price(p, v_opt, nullif(l ->> 'gb', ''));
    v_unit := (v_price ->> 'unit_price')::integer;
    v_out := v_out || (jsonb_build_object('code', v_code, 'option_index', v_opt, 'qty', v_qty, 'line_amount', public.myr_line_amount(v_unit, v_qty),
                                          'stock_left', public.myr_product_buyable(p),
                                          'base_amount', public.myr_line_amount((v_price ->> 'base_price')::integer, v_qty))
                       || (v_price - 'groupbuy_id'));
    v_items := v_items + coalesce(public.myr_line_amount(v_unit, v_qty), 0);
  end loop;
  v_fee := public.myr_shipping_fee(least(v_items, 2147483647)::integer);
  return jsonb_build_object('ok', true, 'lines', v_out, 'items_amount', v_items, 'shipping_fee', v_fee,
                            'free_over', (v_rule ->> 'free_over')::int,
                            'free_shipping_left', case when v_items > 0 and v_fee > 0 then greatest((v_rule ->> 'free_over')::int - v_items, 0) else 0 end);
end;
$$;
revoke all on function public.myr_app_cart_quote(jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_cart_quote(jsonb) to service_role;

-- 0097 정의 + myr_product_visible · myr_line_amount
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

-- 0096 정의 + myr_product_visible
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

-- 0086 정의 + myr_product_visible
create or replace function public.myr_groupbuy_lookup(p_code text)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object('product_code', p.code, 'groupbuy', public.myr_groupbuy_product_json(g, p))
    from public.myr_groupbuys g
    join public.myr_products p on p.id = g.product_id
    join public.sellers s on s.id = p.seller_id and public.myr_product_visible(p, s)
   where g.code = lower(btrim(coalesce(p_code, '')))
$$;
revoke all on function public.myr_groupbuy_lookup(text) from public, anon, authenticated;
grant execute on function public.myr_groupbuy_lookup(text) to service_role;

-- 0056 정의 + myr_product_visible
create or replace function public.myr_home_products()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(public.myr_product_public_json(p, s) order by p.created_at desc), '[]'::jsonb)
    from public.myr_products p
    join public.sellers s on s.id = p.seller_id
   where public.myr_product_visible(p, s)
$$;
revoke all on function public.myr_home_products() from public;
grant execute on function public.myr_home_products() to anon, authenticated;

-- 0084 정의 + myr_product_visible
create or replace function public.myr_likes_get(p_user_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(public.myr_product_public_json(p, s) order by l.created_at desc), '[]'::jsonb)
    from public.myr_likes l
    join public.myr_products p on p.id = l.product_id
    join public.sellers s on s.id = p.seller_id
   where l.user_id = p_user_id and public.myr_product_visible(p, s)
$$;
revoke all on function public.myr_likes_get(uuid) from public, anon, authenticated;
grant execute on function public.myr_likes_get(uuid) to service_role;

-- 0056 정의 + myr_product_visible
create or replace function public.myr_product_card(p_code text)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  p public.myr_products%rowtype;
  s public.sellers%rowtype;
  v_related jsonb;
begin
  select p1.* into p from public.myr_products p1 join public.sellers s1 on s1.id = p1.seller_id
   where p1.code = lower(btrim(coalesce(p_code, ''))) and public.myr_product_visible(p1, s1);
  if not found then return null; end if;
  select * into s from public.sellers where id = p.seller_id;
  -- 후보 id 를 먼저 고르고 실제 행으로 다시 조인한다 — 함수 인자가 myr_products 행 타입이라 파생 테이블의 r 을 그대로 넘길 수 없다
  select coalesce(jsonb_agg(public.myr_product_public_json(r, rs) order by (r.seller_id = p.seller_id) desc, r.created_at desc), '[]'::jsonb)
    into v_related
    from (
      select c.id from public.myr_products c
        join public.sellers cs on cs.id = c.seller_id
       where c.id <> p.id and public.myr_product_visible(c, cs)
         and (c.category = p.category or c.seller_id = p.seller_id)
       order by (c.seller_id = p.seller_id) desc, c.created_at desc
       limit 4
    ) x
    join public.myr_products r on r.id = x.id
    join public.sellers rs on rs.id = r.seller_id;
  return public.myr_product_public_json(p, s) || jsonb_build_object('related', v_related);
end;
$$;
revoke all on function public.myr_product_card(text) from public;
grant execute on function public.myr_product_card(text) to anon, authenticated;

-- 0096 정의 + myr_product_listed · myr_groupbuy_pct_ok(거절 응답에 범위)
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
  if not public.myr_product_listed(p) then return jsonb_build_object('ok', false, 'code', 'NOT_LISTED'); end if;
  if public.myr_product_sold_out(p) then return jsonb_build_object('ok', false, 'code', 'SOLD_OUT'); end if;
  if not public.myr_groupbuy_pct_ok(p_pct) then
    return jsonb_build_object('ok', false, 'code', 'BAD_PCT', 'min', public.myr_groupbuy_pct_min(), 'max', public.myr_groupbuy_pct_max());
  end if;
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

-- 0092 정의 + myr_groupbuy_pct_ok — 만들기와 같은 범위(전에는 0~99 를 받았다)
create or replace function public.myr_app_groupbuy_preview(p_seller uuid, p_product_id uuid, p_pct integer)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select case
    when p.id is null then jsonb_build_object('ok', false, 'code', 'NOT_FOUND')
    when not public.myr_groupbuy_pct_ok(p_pct) then jsonb_build_object('ok', false, 'code', 'BAD_PCT', 'min', public.myr_groupbuy_pct_min(), 'max', public.myr_groupbuy_pct_max())
    else jsonb_build_object('ok', true,
                            'base_price', coalesce(public.myr_product_unit_price(p, 0), p.price),
                            'price', public.myr_groupbuy_price(coalesce(public.myr_product_unit_price(p, 0), p.price), p_pct))
  end
  from (select 1) one
  left join public.myr_products p on p.id = p_product_id and p.seller_id = p_seller and p.deleted_at is null
$$;
revoke all on function public.myr_app_groupbuy_preview(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.myr_app_groupbuy_preview(uuid, uuid, integer) to service_role;

-- 0096 정의 + product.listed · pct_min · pct_max(콘솔 폼이 서버 값을 쓴다)
create or replace function public.myr_app_seller_groupbuys(p_seller uuid, p_product_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
           'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'price', coalesce(public.myr_product_unit_price(p, 0), p.price), 'status', p.status, 'listed', public.myr_product_listed(p),
                                         'sold_out', public.myr_product_sold_out(p), 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url),
           'pct_min', public.myr_groupbuy_pct_min(), 'pct_max', public.myr_groupbuy_pct_max(),
           'items', coalesce((select jsonb_agg(public.myr_groupbuy_seller_json(g, p) order by g.created_at desc)
                                from public.myr_groupbuys g where g.product_id = p.id), '[]'::jsonb))
    from public.myr_products p
   where p.id = p_product_id and p.seller_id = p_seller and p.deleted_at is null and p_seller is not null
$$;
revoke all on function public.myr_app_seller_groupbuys(uuid, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_groupbuys(uuid, uuid) to service_role;

-- 0098 정의 + myr_sales_lines.net
create or replace function public.myr_groupbuy_seller_json(g public.myr_groupbuys, p public.myr_products)
returns jsonb
language sql
stable
as $$
  select public.myr_groupbuy_product_json(g, p)
      || jsonb_build_object('planned_ends_at', g.ends_at, 'closed_at', g.closed_at, 'created_at', g.created_at,
                            'stats', (select jsonb_build_object('orders', count(distinct l.order_id),
                                                                'units', coalesce(sum(l.left_qty), 0),
                                                                'net', coalesce(sum(l.net), 0))
                                        from public.myr_sales_lines() l where l.groupbuy_id = g.id))
$$;
revoke all on function public.myr_groupbuy_seller_json(public.myr_groupbuys, public.myr_products) from public, anon, authenticated;

-- 0082 정의 + myr_product_listed · myr_product_status_approved
create or replace function public.myr_app_admin_review_product(p_product_id uuid, p_decision text, p_reason text default null, p_reviewer uuid default null, p_items jsonb default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p          public.myr_products%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_items    jsonb := public.myr_reject_items(p_items);
  v_reason   text := public.myr_reject_reason(p_reason, v_items);
begin
  select * into p from public.myr_products where id = p_product_id and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_decision not in ('approve', 'reject', 'pause', 'end') then return jsonb_build_object('ok', false, 'code', 'BAD_DECISION'); end if;
  if v_decision = 'reject' and v_reason is null then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;
  if v_decision = 'pause' and not public.myr_product_listed(p) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', p.status); end if;
  if v_decision = 'end' then
    if not public.myr_product_status_approved(p.status) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', p.status); end if;
    update public.myr_products set status = 'ended', reviewed_at = now(), reviewed_by = p_reviewer where id = p.id;
    update public.myr_product_revisions set status = 'canceled' where product_id = p.id and status = 'pending';
    return jsonb_build_object('ok', true, 'code', p.code, 'status', 'ended');
  end if;
  update public.myr_products
     set status = case v_decision when 'approve' then 'listed' when 'reject' then 'rejected' else 'paused' end,
         reject_reason = case v_decision when 'reject' then v_reason else null end,
         reject_items = case v_decision when 'reject' then v_items else '[]'::jsonb end,
         reviewed_at = now(),
         reviewed_by = p_reviewer
   where id = p.id;
  return jsonb_build_object('ok', true, 'code', p.code, 'status', case v_decision when 'approve' then 'listed' when 'reject' then 'rejected' else 'paused' end);
end;
$$;
revoke all on function public.myr_app_admin_review_product(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_admin_review_product(uuid, text, text, uuid, jsonb) to service_role;

-- 0074 정의 + myr_product_status_approved
create or replace function public.myr_app_admin_review_revision(p_product_id uuid, p_decision text, p_reason text default null, p_reviewer uuid default null, p_items jsonb default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p          public.myr_products%rowtype;
  rv         public.myr_product_revisions%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_items    jsonb := public.myr_reject_items(p_items);
  v_reason   text := public.myr_reject_reason(p_reason, v_items);
begin
  if v_decision not in ('approve', 'reject') then return jsonb_build_object('ok', false, 'code', 'BAD_DECISION'); end if;
  select * into p from public.myr_products where id = p_product_id and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select * into rv from public.myr_product_revisions where product_id = p.id and status = 'pending' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_decision = 'reject' and v_reason is null then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;

  if v_decision = 'approve' then
    if not public.myr_product_status_approved(p.status) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', p.status); end if;
    perform public.myr_product_apply_fields(p.id, rv.fields);
    update public.myr_products set reviewed_at = now(), reviewed_by = p_reviewer where id = p.id;
  end if;
  update public.myr_product_revisions
     set status = case v_decision when 'approve' then 'approved' else 'rejected' end,
         reject_reason = case v_decision when 'reject' then v_reason end,
         reject_items = case v_decision when 'reject' then v_items else '[]'::jsonb end,
         reviewed_at = now(),
         reviewed_by = p_reviewer
   where id = rv.id;
  return jsonb_build_object('ok', true, 'code', p.code, 'status', case v_decision when 'approve' then 'approved' else 'rejected' end);
end;
$$;
revoke all on function public.myr_app_admin_review_revision(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_admin_review_revision(uuid, text, text, uuid, jsonb) to service_role;

-- 0074 정의 + myr_product_status_approved
create or replace function public.myr_app_seller_submit_revision(p_seller uuid, p_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p     public.myr_products%rowtype;
  keep  text[];
  r     jsonb;
  cur   jsonb;
  v_id  uuid;
begin
  select * into p from public.myr_products where id = p_id and seller_id = p_seller and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not public.myr_product_status_approved(p.status) then return jsonb_build_object('ok', false, 'code', 'NOT_REVISABLE', 'status', p.status); end if;
  if exists (select 1 from public.myr_product_revisions where product_id = p.id and status = 'pending') then
    return jsonb_build_object('ok', false, 'code', 'REVISION_PENDING');
  end if;

  keep := array_remove(p.image_urls || p.thumb_url, null);
  r := public.myr_product_fields(p_seller, p_payload, true, keep);
  if not (r ->> 'ok')::boolean then return r; end if;
  -- 지금 내용도 같은 정리를 거쳐 비교(공백 · 빈 줄 차이는 "바뀜" 이 아니다)
  cur := coalesce(public.myr_product_fields(p_seller, public.myr_product_fields_json(p), false, keep) -> 'fields', public.myr_product_fields_json(p));
  if r -> 'fields' = cur then return jsonb_build_object('ok', false, 'code', 'NO_CHANGE'); end if;

  insert into public.myr_product_revisions (product_id, seller_id, fields)
  values (p.id, p_seller, r -> 'fields')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'revision_id', v_id, 'status', 'pending');
end;
$$;
revoke all on function public.myr_app_seller_submit_revision(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_seller_submit_revision(uuid, uuid, jsonb) to service_role;

-- 0074 정의 + myr_product_status_editable
create or replace function public.myr_app_seller_save_product(p_seller uuid, p_id uuid, p_payload jsonb, p_submit boolean)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p        public.myr_products%rowtype;
  r        jsonb;
  f        jsonb;
  v_status text;
begin
  -- 대상 — 새 상품이거나 내 상품 중 draft · rejected (판매 중 수정은 myr_app_seller_submit_revision)
  if p_id is not null then
    select * into p from public.myr_products where id = p_id and seller_id = p_seller and deleted_at is null for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
    if not public.myr_product_status_editable(p.status) then return jsonb_build_object('ok', false, 'code', 'NOT_EDITABLE', 'status', p.status); end if;
  elsif not exists (select 1 from public.sellers s where s.id = p_seller and s.active) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  r := public.myr_product_fields(p_seller, p_payload, p_submit);
  if not (r ->> 'ok')::boolean then return r; end if;
  f := r -> 'fields';
  v_status := case when p_submit then 'pending' when p_id is null then 'draft' else p.status end;

  if p_id is null then
    insert into public.myr_products (seller_id, category, name, price, status, submitted_at)
    values (p_seller, f ->> 'category', f ->> 'name', (f ->> 'price')::integer, v_status, now())
    returning * into p;
  end if;
  perform public.myr_product_apply_fields(p.id, f);
  if p_id is not null then
    update public.myr_products
       set status = v_status,
           submitted_at = case when p_submit then now() else submitted_at end,
           reject_reason = case when p_submit then null else reject_reason end,
           reject_items = case when p_submit then '[]'::jsonb else reject_items end,
           reviewed_at = case when p_submit then null else reviewed_at end
     where id = p.id;
  end if;
  select * into p from public.myr_products where id = p.id;

  return jsonb_build_object('ok', true, 'id', p.id, 'code', p.code, 'status', p.status);
end;
$$;
revoke all on function public.myr_app_seller_save_product(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_seller_save_product(uuid, uuid, jsonb, boolean) to service_role;

-- 0074 정의 + editable · approved(콘솔이 상태 묶음을 다시 쓰지 않게)
create or replace function public.myr_seller_product_json(p public.myr_products)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p.id, 'code', p.code, 'status', p.status,
    'editable', public.myr_product_status_editable(p.status), 'approved', public.myr_product_status_approved(p.status), 'reject_reason', p.reject_reason, 'reject_items', p.reject_items,
    'name', p.name, 'price', p.price, 'unit', p.unit, 'category', p.category,
    'tile', p.tile, 'icon', p.icon, 'image_urls', to_jsonb(p.image_urls), 'chips', to_jsonb(p.chips), 'note', p.note,
    'story_title', p.story_title, 'story', p.story, 'ingredient_rows', p.ingredient_rows, 'howto_steps', p.howto_steps, 'faq', p.faq,
    'form', p.form, 'pack', p.pack, 'shelf_life', p.shelf_life, 'storage_method', p.storage_method,
    'submitted_at', p.submitted_at, 'reviewed_at', p.reviewed_at, 'updated_at', p.updated_at
  )
$$;
revoke all on function public.myr_seller_product_json(public.myr_products) from public, anon, authenticated;

-- 0074 정의 + myr_revision_status_open
create or replace function public.myr_product_open_revision(p_product_id uuid)
returns public.myr_product_revisions
language sql
stable
set search_path = public
as $$
  select r.* from (
    select * from public.myr_product_revisions where product_id = p_product_id order by created_at desc limit 1
  ) r where public.myr_revision_status_open(r.status)
$$;
revoke all on function public.myr_product_open_revision(uuid) from public, anon, authenticated;

-- 0074 정의 + myr_revision_status_open
create or replace function public.myr_product_image_orphans(p_age interval default interval '24 hours', p_limit integer default 100)
returns setof text
language sql
stable
security definer set search_path = public
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'myr-products'
     and o.created_at < now() - p_age
     and not exists (select 1 from public.myr_products p, unnest(p.image_urls) u where right(u, length(o.name) + 1) = '/' || o.name)
     and not exists (
       select 1
         from public.myr_product_revisions r, jsonb_array_elements_text(r.fields -> 'image_urls') u
        where public.myr_revision_status_open(r.status)
          and (public.myr_product_open_revision(r.product_id)).id = r.id
          and right(u, length(o.name) + 1) = '/' || o.name)
   order by o.created_at
   limit greatest(coalesce(p_limit, 100), 1)
$$;
revoke all on function public.myr_product_image_orphans(interval, integer) from public, anon, authenticated;
grant execute on function public.myr_product_image_orphans(interval, integer) to service_role;

-- 0094 정의 + myr_product_price_max(거절 응답에 상한)
create or replace function public.myr_product_fields(p_seller uuid, p_payload jsonb, p_submit boolean, p_keep_images text[] default '{}')
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  j          jsonb := coalesce(p_payload, '{}'::jsonb);
  v_name     text := public.myr_clip(j -> 'name', 60);
  v_price    integer;
  v_price_n  numeric;
  v_category text := nullif(public.myr_clip(j -> 'category', 20), '');
  v_note     text := public.myr_clip(j -> 'note', 1000);
  v_images   text[];
  v_chips    text[];
  v_ing      jsonb;
  v_steps    jsonb;
  v_faq      jsonb;
  v_tile     text := nullif(public.myr_clip(j -> 'tile', 200), '');
  v_icon     text := public.myr_clip(j -> 'icon', 20);
  v_img_re   text := '^https?://[^/]+/storage/v1/object/public/myr-products/' || p_seller::text || '/[A-Za-z0-9-]{8,64}\.(jpg|png|webp)$';
begin
  -- 범위를 숫자(numeric) 그대로 먼저 본다 — 정수로 먼저 바꾸면 약 21억을 넘는 값에서 integer out of range 오류가 나 "저장하지 못했어요"로 끝났다(0094)
  v_price_n := case when jsonb_typeof(j -> 'price') = 'number' then (j ->> 'price')::numeric else 0 end;
  if v_price_n < 0 or v_price_n > public.myr_product_price_max() then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'price', 'max', public.myr_product_price_max());
  end if;
  v_price := v_price_n::integer;
  if v_category is not null and v_category not in ('diet','inner','derma','hair','mental','mens') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'category');
  end if;
  if jsonb_typeof(j -> 'image_urls') = 'array' and jsonb_array_length(j -> 'image_urls') > 6 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'images');
  end if;
  select coalesce(array_agg(u order by o), '{}') into v_images
    from jsonb_array_elements_text(case when jsonb_typeof(j -> 'image_urls') = 'array' then j -> 'image_urls' else '[]'::jsonb end) with ordinality as t(u, o);
  if exists (select 1 from unnest(v_images) u where u !~ v_img_re and not coalesce(u = any (p_keep_images), false)) then
    return jsonb_build_object('ok', false, 'code', 'BAD_IMAGE');
  end if;
  select coalesce(array_agg(c order by o), '{}') into v_chips
    from (select left(btrim(c), 20) c, o from jsonb_array_elements_text(case when jsonb_typeof(j -> 'chips') = 'array' then j -> 'chips' else '[]'::jsonb end) with ordinality as t(c, o)) x
   where c <> '' and o <= 3;
  select coalesce(jsonb_agg(jsonb_build_object('name', public.myr_clip(e -> 'name', 40), 'why', public.myr_clip(e -> 'why', 200), 'amount', public.myr_clip(e -> 'amount', 40)) order by o), '[]'::jsonb) into v_ing
    from jsonb_array_elements(case when jsonb_typeof(j -> 'ingredient_rows') = 'array' then j -> 'ingredient_rows' else '[]'::jsonb end) with ordinality as t(e, o)
   where o <= 12 and public.myr_clip(e -> 'name', 40) <> '';
  select coalesce(jsonb_agg(jsonb_build_object('t', public.myr_clip(e -> 't', 40), 'd', public.myr_clip(e -> 'd', 300)) order by o), '[]'::jsonb) into v_steps
    from jsonb_array_elements(case when jsonb_typeof(j -> 'howto_steps') = 'array' then j -> 'howto_steps' else '[]'::jsonb end) with ordinality as t(e, o)
   where o <= 6 and public.myr_clip(e -> 't', 40) <> '';
  select coalesce(jsonb_agg(jsonb_build_object('q', public.myr_clip(e -> 'q', 120), 'a', public.myr_clip(e -> 'a', 600)) order by o), '[]'::jsonb) into v_faq
    from jsonb_array_elements(case when jsonb_typeof(j -> 'faq') = 'array' then j -> 'faq' else '[]'::jsonb end) with ordinality as t(e, o)
   where o <= 10 and public.myr_clip(e -> 'q', 120) <> '' and public.myr_clip(e -> 'a', 600) <> '';
  -- 비주얼 — 그라데이션 · 아이콘 id 만(스타일 주입 방지)
  if v_tile is not null and v_tile !~ '^linear-gradient\([0-9a-zA-Z#,.% ()-]{1,180}\)$' then v_tile := null; end if;
  if v_icon !~ '^[a-z]{2,20}$' then v_icon := 'pill'; end if;

  -- 필수 — 임시저장은 제품명만 · 심사 요청(새 상품 · 수정)은 제품명 · 가격 · 카테고리 · 레시피 노트
  if v_name = '' then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'name'); end if;
  if p_submit then
    if v_price <= 0 then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'price'); end if;
    if v_category is null then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'category'); end if;
    if v_note = '' then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'note'); end if;
  end if;

  return jsonb_build_object('ok', true, 'fields', jsonb_build_object(
    'name', v_name, 'price', v_price, 'unit', public.myr_clip(j -> 'unit', 40), 'category', v_category,
    'tile', v_tile, 'icon', v_icon, 'image_urls', to_jsonb(v_images), 'chips', to_jsonb(v_chips), 'note', v_note,
    'story_title', public.myr_clip(j -> 'story_title', 80), 'story', public.myr_clip(j -> 'story', 3000),
    'ingredient_rows', v_ing, 'howto_steps', v_steps, 'faq', v_faq,
    'form', public.myr_clip(j -> 'form', 30), 'pack', public.myr_clip(j -> 'pack', 30),
    'shelf_life', public.myr_clip(j -> 'shelf_life', 80), 'storage_method', public.myr_clip(j -> 'storage_method', 80)
  ));
end;
$$;
revoke all on function public.myr_product_fields(uuid, jsonb, boolean, text[]) from public, anon, authenticated;

-- 0098 정의 + myr_order_status_open
create or replace function public.myr_app_admin_mark_prepared(p_item_ids uuid[], p_ebut boolean default false)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_ids uuid[];
begin
  with u as (
    update public.myr_order_items i
       set ship_status = 'PREPARING', ebut_registered_at = case when p_ebut then now() else i.ebut_registered_at end
      from public.myr_orders o
     where o.id = i.order_id and i.id = any (coalesce(p_item_ids, '{}'))
       and i.ship_status = 'PAID' and public.myr_line_live(i)
       and public.myr_order_status_open(o.status)
    returning i.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from u;
  return jsonb_build_object('ok', true, 'count', cardinality(v_ids),
    'orders', coalesce((select jsonb_agg(distinct o.code) from public.myr_order_items i join public.myr_orders o on o.id = i.order_id where i.id = any (v_ids)), '[]'::jsonb));
end;
$$;
revoke all on function public.myr_app_admin_mark_prepared(uuid[], boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_mark_prepared(uuid[], boolean) to service_role;

-- 0098 정의 + myr_order_status_open
create or replace function public.myr_app_admin_prepare_candidates(p_cutoff timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', i.id, 'order_id', o.id, 'order_code', o.code, 'ordered_at', o.created_at, 'paid_at', o.paid_at,
           'goods_code', coalesce(nullif(btrim(p.ebut_goods_code), ''), p.code), 'goods_name', i.product_name, 'goods_option', coalesce(i.option_name, ''),
           'qty', public.myr_line_left(i), 'seller_id', i.seller_id, 'shipping', o.shipping
         ) order by o.paid_at, o.id, i.created_at, i.id), '[]'::jsonb)
    from public.myr_order_items i
    join public.myr_orders o on o.id = i.order_id
    join public.myr_products p on p.id = i.product_id
   where i.ship_status = 'PAID' and public.myr_line_live(i)
     and public.myr_order_status_open(o.status) and o.paid_at is not null and o.paid_at < p_cutoff
$$;
revoke all on function public.myr_app_admin_prepare_candidates(timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_admin_prepare_candidates(timestamptz) to service_role;

-- 0098 정의 + myr_order_status_open · myr_ship_status_unshipped
create or replace function public.myr_app_admin_ship(p_order_code text, p_courier text, p_tracking_no text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o          public.myr_orders%rowtype;
  v_courier  text := btrim(coalesce(p_courier, ''));
  v_tracking text := regexp_replace(coalesce(p_tracking_no, ''), '[\s-]', '', 'g');
  v_old      text;
begin
  if v_courier not in ('CJ대한통운','우체국택배','한진택배','롯데택배','로젠택배') then return jsonb_build_object('ok', false, 'code', 'BAD_COURIER'); end if;
  if v_tracking !~ '^\d{8,30}$' then return jsonb_build_object('ok', false, 'code', 'BAD_TRACKING'); end if;
  select * into o from public.myr_orders where code = lower(btrim(coalesce(p_order_code, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not public.myr_order_status_open(o.status) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if o.tracking_no = v_tracking and o.courier = v_courier
     and not exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_line_live(i) and public.myr_ship_status_unshipped(i.ship_status)) then
    return jsonb_build_object('ok', true, 'already', true, 'order_id', o.id, 'order_code', o.code, 'status', o.status, 'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at);
  end if;
  v_old := o.tracking_no;
  update public.myr_orders
     set courier = v_courier, tracking_no = v_tracking, shipped_at = coalesce(shipped_at, now()), updated_at = now()
   where id = o.id
   returning * into o;
  -- 남은 줄(결제완료 · 배송준비중) + 예전 송장을 달고 있던 줄(정정) — 배송완료 줄은 상태를 되돌리지 않는다
  update public.myr_order_items i
     set ship_status = case when i.ship_status = 'DELIVERED' then 'DELIVERED' else 'SHIPPING' end,
         courier = v_courier, tracking_no = v_tracking, shipped_at = coalesce(i.shipped_at, now()), is_delayed = false
   where i.order_id = o.id and public.myr_line_live(i)
     and (public.myr_ship_status_unshipped(i.ship_status) or (v_old is not null and i.tracking_no = v_old));
  return jsonb_build_object('ok', true, 'already', false, 'order_id', o.id, 'order_code', o.code, 'status', o.status, 'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at);
end;
$$;
revoke all on function public.myr_app_admin_ship(text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship(text, text, text) to service_role;

-- 0098 정의 + myr_order_status_open
create or replace function public.myr_app_admin_ship_line(p_item_id uuid, p_courier text, p_tracking_no text, p_delivered boolean default false)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  i          public.myr_order_items%rowtype;
  o          public.myr_orders%rowtype;
  v_courier  text := nullif(btrim(coalesce(p_courier, '')), '');
  v_tracking text := regexp_replace(coalesce(p_tracking_no, ''), '[\s-]', '', 'g');
  v_new      boolean;
begin
  if v_courier is not null and v_courier not in ('CJ대한통운','우체국택배','한진택배','롯데택배','로젠택배') then return jsonb_build_object('ok', false, 'code', 'BAD_COURIER'); end if;
  if v_tracking !~ '^\d{8,30}$' then return jsonb_build_object('ok', false, 'code', 'BAD_TRACKING'); end if;
  select * into i from public.myr_order_items where id = p_item_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select * into o from public.myr_orders where id = i.order_id for update;
  if not public.myr_order_status_open(o.status) or not public.myr_line_live(i) then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status);
  end if;
  v_new := i.tracking_no is distinct from v_tracking;
  update public.myr_order_items
     set ship_status = case when p_delivered or ship_status = 'DELIVERED' then 'DELIVERED' else 'SHIPPING' end,
         courier = coalesce(v_courier, courier), tracking_no = v_tracking, shipped_at = coalesce(shipped_at, now()),
         delivered_at = case when p_delivered then coalesce(delivered_at, now()) else delivered_at end, is_delayed = false
   where id = i.id
   returning * into i;
  -- 주문 칸(옛 화면 · 배송 시작 메일) — 비었을 때만 채운다 · 살아 있는 줄이 전부 배송완료면 주문 배송완료 시각
  update public.myr_orders
     set courier = coalesce(courier, i.courier), tracking_no = coalesce(tracking_no, i.tracking_no), shipped_at = coalesce(shipped_at, i.shipped_at),
         delivered_at = case when public.myr_order_ship_status(o.id) = 'DELIVERED' then coalesce(delivered_at, now()) else delivered_at end,
         updated_at = now()
   where id = o.id;
  return jsonb_build_object('ok', true, 'newly_shipped', v_new, 'order_id', o.id, 'order_code', o.code, 'item_id', i.id,
                            'ship_status', i.ship_status, 'courier', i.courier, 'tracking_no', i.tracking_no, 'shipped_at', i.shipped_at);
end;
$$;
revoke all on function public.myr_app_admin_ship_line(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship_line(uuid, text, text, boolean) to service_role;

-- 0098 정의 + myr_order_status_open · myr_ship_status_unshipped
create or replace function public.myr_app_admin_ship_pending(p_limit integer default 100, p_shipped boolean default false)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'code', o.code, 'status', o.status, 'buyer_name', o.buyer_name, 'order_name', o.order_name, 'amount', o.amount,
           'paid_at', o.paid_at, 'created_at', o.created_at, 'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at,
           'recipient', o.shipping ->> 'recipient',
           'lines', (select count(*) from public.myr_order_items i where i.order_id = o.id and public.myr_line_live(i)),
           'ship_status', public.myr_order_ship_status(o.id),
           'preparing', (select count(*) from public.myr_order_items i where i.order_id = o.id and public.myr_line_live(i) and i.ship_status = 'PREPARING')
         ) order by case when p_shipped then o.shipped_at else o.paid_at end desc), '[]'::jsonb)
    from (select * from public.myr_orders o
           where public.myr_order_status_open(o.status)
             and (case when p_shipped
                       then not exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_line_live(i) and public.myr_ship_status_unshipped(i.ship_status))
                            and exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_line_live(i))
                       else exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_line_live(i) and public.myr_ship_status_unshipped(i.ship_status)) end)
           order by case when p_shipped then o.shipped_at else o.paid_at end desc
           limit greatest(coalesce(p_limit, 100), 1)) o
$$;
revoke all on function public.myr_app_admin_ship_pending(integer, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship_pending(integer, boolean) to service_role;

-- 0098 정의 + myr_order_status_open
create or replace function public.myr_app_admin_ship_sync_candidates()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'order_id', i.order_id, 'ship_status', i.ship_status, 'tracking_no', i.tracking_no, 'shipped_at', i.shipped_at)
                            order by i.order_id, i.id), '[]'::jsonb)
    from public.myr_order_items i
    join public.myr_orders o on o.id = i.order_id
   where i.ship_status in ('PREPARING','SHIPPING') and i.ebut_registered_at is not null
     and public.myr_line_live(i) and public.myr_order_status_open(o.status)
$$;
revoke all on function public.myr_app_admin_ship_sync_candidates() from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship_sync_candidates() to service_role;

-- 0098 정의 + myr_order_status_open
create or replace function public.myr_app_admin_deliver(p_order_code text, p_delivered_at timestamptz default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o     public.myr_orders%rowtype;
  v_at  timestamptz := coalesce(p_delivered_at, now());
  v_n   integer;
begin
  select * into o from public.myr_orders where code = lower(btrim(coalesce(p_order_code, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not public.myr_order_status_open(o.status) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if v_at > now() + interval '5 minutes' or v_at < o.paid_at then return jsonb_build_object('ok', false, 'code', 'BAD_DATE'); end if;
  perform 1 from public.myr_order_items where order_id = o.id for update;
  if not exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.ship_status = 'SHIPPING' and public.myr_line_live(i)) then
    if exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.ship_status = 'DELIVERED' and public.myr_line_live(i)) then
      return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'delivered', 0);
    end if;
    return jsonb_build_object('ok', false, 'code', 'NOT_SHIPPED');
  end if;
  with u as (
    update public.myr_order_items
       set ship_status = 'DELIVERED', delivered_at = v_at, is_delayed = false
     where order_id = o.id and ship_status = 'SHIPPING' and public.myr_line_live(myr_order_items)
    returning 1)
  select count(*) into v_n from u;
  update public.myr_orders
     set delivered_at = case when public.myr_order_ship_status(o.id) = 'DELIVERED' then coalesce(delivered_at, v_at) else delivered_at end,
         updated_at = now()
   where id = o.id;
  return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'delivered', v_n, 'delivered_at', v_at);
end;
$$;
revoke all on function public.myr_app_admin_deliver(text, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_admin_deliver(text, timestamptz) to service_role;

-- 0098 정의 + myr_order_status_open
create or replace function public.myr_app_admin_undelivered(p_days integer default 5)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'order_code', o.code, 'item_id', i.id, 'product', i.product_name, 'option', i.option_name, 'qty', public.myr_line_left(i),
           'seller', s.handle, 'courier', i.courier, 'tracking_no', i.tracking_no, 'shipped_at', i.shipped_at,
           'days', floor(extract(epoch from (now() - i.shipped_at)) / 86400)::integer, 'ebut', i.ebut_registered_at is not null)
         order by i.shipped_at, o.code), '[]'::jsonb)
    from public.myr_order_items i
    join public.myr_orders o on o.id = i.order_id
    join public.sellers s on s.id = i.seller_id
   where i.ship_status = 'SHIPPING' and public.myr_line_live(i)
     and public.myr_order_status_open(o.status)
     and i.shipped_at <= now() - make_interval(days => greatest(coalesce(p_days, 5), 0))
$$;
revoke all on function public.myr_app_admin_undelivered(integer) from public, anon, authenticated;
grant execute on function public.myr_app_admin_undelivered(integer) to service_role;

-- 0058 정의 + myr_order_status_paid
create or replace function public.myr_app_deposit_done(p_order_id uuid, p_payment jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o public.myr_orders%rowtype;
begin
  select * into o from public.myr_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if public.myr_order_status_paid(o.status) then return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'status', o.status); end if;
  if o.status <> 'WAITING_DEPOSIT' then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if p_payment is null or p_payment ->> 'status' is distinct from 'DONE' or p_payment ->> 'paymentKey' is distinct from o.payment_key
     or (p_payment ->> 'totalAmount')::bigint is distinct from o.amount::bigint then
    return jsonb_build_object('ok', false, 'code', 'PAYMENT_MISMATCH');
  end if;
  update public.myr_orders
     set status = 'PAID', paid_at = coalesce((p_payment ->> 'approvedAt')::timestamptz, now()), raw_payment = p_payment, payment_method = coalesce(p_payment ->> 'method', payment_method)
   where id = o.id;
  return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'status', 'PAID');
end;
$$;
revoke all on function public.myr_app_deposit_done(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_deposit_done(uuid, jsonb) to service_role;

-- 0098 정의 + myr_order_status_alive · myr_line_live(남은 수량 합이라 결과는 같다)
create or replace function public.myr_recalc_product_sold_qty(p_product_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  update public.myr_products p
     set sold_qty = coalesce((
       select sum(public.myr_line_left(i))
         from public.myr_order_items i
         join public.myr_orders o on o.id = i.order_id
        where i.product_id = p_product_id
          and public.myr_order_status_alive(o.status)
          and public.myr_line_live(i)), 0)
   where p.id = p_product_id
$$;
revoke all on function public.myr_recalc_product_sold_qty(uuid) from public, anon, authenticated;

-- 0098 정의 + myr_order_status_alive · open
create or replace function public.myr_line_refund_path(o public.myr_orders, i public.myr_order_items)
returns text
language sql
stable
as $$
  select case
    when not public.myr_order_status_alive(o.status) then null
    when not public.myr_line_live(i) then null
    when i.ship_status = 'PAID' then 'instant'
    when not public.myr_order_status_open(o.status) then null
    else 'claim' end
$$;
revoke all on function public.myr_line_refund_path(public.myr_orders, public.myr_order_items) from public, anon, authenticated;

-- 0098 정의 + myr_line_valid
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
        from public.myr_order_items i where i.order_id = o.id and public.myr_line_live(i);
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
                when not public.myr_line_valid(i) then 'CANCELED'
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

-- 0097 정의 + myr_order_owned_by · myr_order_status_alive · myr_line_amount · myr_line_live · 응답에 goods · shipping_back
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
  v_goods    integer;
begin
  if p_actor is null or p_actor not in ('customer','seller','admin','system') then return jsonb_build_object('ok', false, 'code', 'BAD_ACTOR'); end if;
  select * into o from public.myr_orders where id = p_order_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;

  -- 소유·권한 (존재 여부를 흘리지 않게 customer 의 남의 주문은 NOT_FOUND)
  if p_actor = 'customer' then
    if not public.myr_order_owned_by(o, p_actor_id) then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;
  end if;

  if not public.myr_order_status_alive(o.status) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
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
    v_items := v_items || jsonb_build_object('item_id', r.item_id, 'qty', r.qty, 'amount', public.myr_line_amount(r.unit_price, r.qty), 'seller_id', r.seller_id);
    v_amount := v_amount + public.myr_line_amount(r.unit_price, r.qty);
    v_req_total := v_req_total + r.qty;
  end loop;
  if jsonb_array_length(v_problems) > 0 then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS', 'items', v_problems); end if;
  if v_req_total = 0 then return jsonb_build_object('ok', false, 'code', 'NOTHING_LEFT'); end if;

  -- 이번 환불로 주문이 전부 환불되면 배송비도 돌려준다(§9-11 기본) — 배송비는 아직 환불 안 됐을 때 한 번만
  select coalesce(sum(public.myr_line_left(i)), 0) into v_left_total from public.myr_order_items i where i.order_id = o.id and public.myr_line_live(i);
  v_full := v_req_total >= v_left_total;
  v_goods := v_amount;
  if v_full and o.shipping_fee > 0 and o.refund_amount + v_amount + o.shipping_fee <= o.amount then v_amount := v_amount + o.shipping_fee; end if;

  return jsonb_build_object('ok', true, 'order_code', o.code, 'order_status', o.status, 'payment_key', o.payment_key,
                            'amount', v_amount, 'goods', v_goods, 'shipping_back', v_amount - v_goods, 'deposit', o.status = 'WAITING_DEPOSIT', 'full', v_full, 'items', v_items);
end;
$$;
revoke all on function public.myr_app_refund_precheck(uuid, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_refund_precheck(uuid, jsonb, text, uuid) to service_role;

-- 0068 정의 + myr_order_status_alive · myr_line_amount
create or replace function public.myr_app_refund_record(p_order_id uuid, p_items jsonb, p_actor text, p_actor_id uuid, p_reason text, p_amount integer, p_raw jsonb default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o         public.myr_orders%rowtype;
  r         record;
  v_reason  text := left(coalesce(p_reason, ''), 200);
  v_n       integer := 0;
  v_status  text;
begin
  if p_actor is null or p_actor not in ('customer','seller','admin','system') then return jsonb_build_object('ok', false, 'code', 'BAD_ACTOR'); end if;
  select * into o from public.myr_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not public.myr_order_status_alive(o.status) then return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'status', o.status, 'amount', o.refund_amount); end if;

  if o.status = 'WAITING_DEPOSIT' then
    update public.myr_order_items set status = 'CANCELED', refunded_at = now(), refund_reason = v_reason, refund_actor = p_actor where order_id = o.id;
    update public.myr_orders set status = 'CANCELED', refunded_at = now(), refund_reason = v_reason, refund_actor = p_actor, raw_cancel = p_raw where id = o.id;
    return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'status', 'CANCELED', 'amount', 0);
  end if;

  for r in select * from public.myr_refund_lines(o, p_items) loop
    if r.problem is not null then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS', 'items', jsonb_build_array(jsonb_build_object('item_id', r.item_id, 'reason', r.problem, 'left', r.remaining))); end if;
    -- 0068: 사진 경로는 이 주문·이 줄 아래(<order id>/<item id>/<uuid>.<ext>)만 — 아니면 거부(서버가 올린 경로가 아니다)
    if coalesce(array_length(r.photos, 1), 0) > 0
       and not (select bool_and(p ~ ('^' || o.id::text || '/' || r.item_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')) from unnest(r.photos) p) then
      return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS', 'items', jsonb_build_array(jsonb_build_object('item_id', r.item_id, 'reason', 'BAD_PHOTOS', 'left', r.remaining)));
    end if;
    update public.myr_order_items
       set refunded_qty = refunded_qty + r.qty,
           refund_amount = refund_amount + public.myr_line_amount(r.unit_price, r.qty),
           status = case when refunded_qty + r.qty >= qty then 'REFUNDED' else 'PARTIAL_REFUNDED' end,
           refunded_at = now(),
           -- 0067: 줄에는 "사유 — 상세"(상세가 있을 때만) · 0068: 사진 경로
           refund_reason = case when r.note is not null then left(v_reason || ' — ' || r.note, 500) else v_reason end,
           refund_photos = coalesce(r.photos, '{}'::text[]),
           refund_actor = p_actor
     where id = r.item_id;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'status', o.status, 'amount', o.refund_amount); end if;

  select case when bool_and(i.status in ('REFUNDED','CANCELED')) then 'REFUNDED' else 'PARTIAL_REFUNDED' end into v_status
    from public.myr_order_items i where i.order_id = o.id;
  update public.myr_orders
     set refund_amount = refund_amount + greatest(coalesce(p_amount, 0), 0), status = v_status,
         refunded_at = now(), refund_reason = v_reason, refund_actor = p_actor, raw_cancel = coalesce(p_raw, raw_cancel)
   where id = o.id;
  -- myr_order_items_sync_sold_qty(0058) 가 줄 update 마다 sold_qty 를 (qty − refunded_qty) 로 재계산했다.
  return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'status', v_status, 'amount', o.refund_amount + greatest(coalesce(p_amount, 0), 0));
end;
$$;
revoke all on function public.myr_app_refund_record(uuid, jsonb, text, uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_refund_record(uuid, jsonb, text, uuid, text, integer, jsonb) to service_role;

-- 0097 정의 + myr_order_owned_by · myr_order_status_open · myr_line_valid · myr_claim_status_open
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
  if not found or not public.myr_order_owned_by(o, p_actor_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if not public.myr_order_status_open(o.status) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
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
    elsif not public.myr_line_valid(i) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'CANCELED');
    elsif v_qty < 1 then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'BAD_QTY');
    elsif v_qty > public.myr_line_left(i) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'TOO_MANY');
    elsif public.myr_line_refund_path(o, i) is distinct from 'claim' then
      -- 결제완료(발주 전) 줄은 요청이 아니라 바로 환불 — 줄 길 판정은 myr_line_refund_path 한 곳(0092)
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'NOT_PREPARED');
    elsif exists (select 1 from public.myr_refund_requests q where q.order_item_id = v_id and public.myr_claim_status_open(q.status)) then
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

-- 0091 정의 + myr_claim_resolution_deducts · myr_line_amount
create or replace function public.myr_app_claim_decide(p_code text, p_user uuid, p_decision text, p_resolution text, p_message text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  r      public.myr_refund_requests%rowtype;
  i      public.myr_order_items%rowtype;
  v_msg  text := nullif(btrim(coalesce(p_message, '')), '');
  v_fee  integer;
begin
  select r2.* into r from public.myr_refund_requests r2 join public.sellers s on s.id = r2.seller_id
   where s.user_id = p_user and r2.code = lower(btrim(coalesce(p_code, ''))) for update of r2;
  if not found or p_user is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'code', 'NOT_PENDING', 'status', r.status); end if;
  -- 같은 묶음의 다른 요청을 동시에 승인해도 배송비가 두 번 빠지지 않게 묶음을 잠근다
  perform 1 from public.myr_refund_requests q where q.batch = r.batch for update;
  if p_decision is null or p_decision not in ('approve','reject') then return jsonb_build_object('ok', false, 'code', 'BAD_DECISION'); end if;
  -- 승인은 메시지 선택(비우면 null · 메일은 결과 · 다음 단계만) · 반려는 사유를 고객에게 알려야 하니 필수 · 둘 다 1000자까지
  if (p_decision = 'reject' and v_msg is null) or length(coalesce(v_msg, '')) > 1000 then return jsonb_build_object('ok', false, 'code', 'BAD_MESSAGE'); end if;

  if p_decision = 'reject' then
    update public.myr_refund_requests set status = 'rejected', message = v_msg, decided_at = now(), decided_by = p_user, done_at = now() where id = r.id
      returning * into r;
    return jsonb_build_object('ok', true, 'request', public.myr_refund_request_json(r), 'refund_now', false);
  end if;

  if p_resolution is null or not (p_resolution = any (public.myr_refund_request_options(r.kind, r.reason))) then
    return jsonb_build_object('ok', false, 'code', 'BAD_RESOLUTION');
  end if;
  select * into i from public.myr_order_items where id = r.order_item_id;
  v_fee := public.myr_refund_request_fee_due(r);
  -- 차감 뒤 0원 이하가 되면 부분 환불은 안 된다(같은 묶음에서 이미 뺐으면 v_fee = 0 → 전액과 같다)
  if public.myr_claim_resolution_deducts(p_resolution) and public.myr_line_amount(i.unit_price, r.qty) <= v_fee then return jsonb_build_object('ok', false, 'code', 'BAD_RESOLUTION'); end if;

  update public.myr_refund_requests
     set status = 'progress', resolution = p_resolution, message = v_msg, decided_at = now(), decided_by = p_user,
         needs_refund  = p_resolution in ('refund','partial'),
         needs_reship  = p_resolution in ('reship','reship_collect'),
         -- 파손 · 누액은 회수 없이(사진으로 확인) · 단순 변심 · 오배송 환불과 회수 후 재발송은 회수
         needs_collect = case when p_resolution = 'reship_collect' or p_resolution = 'partial' then true
                              when p_resolution = 'refund' then r.reason <> '파손 · 누액'
                              else false end,
         deduction     = case when public.myr_claim_resolution_deducts(p_resolution) then v_fee else 0 end
   where id = r.id
   returning * into r;
  return jsonb_build_object('ok', true, 'request', public.myr_refund_request_json(r), 'refund_now', public.myr_refund_request_step(r) = 'refund');
end;
$$;
revoke all on function public.myr_app_claim_decide(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_claim_decide(text, uuid, text, text, text) to service_role;

-- 0078 정의 + myr_claim_status_open
create or replace function public.myr_app_admin_claims(p_open_only boolean default true)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select jsonb_agg(public.myr_refund_request_json(r) order by r.created_at)
      from (select * from public.myr_refund_requests r
             where (not coalesce(p_open_only, true)) or public.myr_claim_status_open(r.status)
             order by r.created_at desc limit 500) r
  ), '[]'::jsonb)
$$;
revoke all on function public.myr_app_admin_claims(boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_claims(boolean) to service_role;

-- 0092 정의 + myr_claim_status_open
create or replace function public.myr_order_claim_status(p_order_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select case when bool_or(r.status = 'pending') then 'pending' when bool_or(r.status = 'progress') then 'progress' end
    from public.myr_refund_requests r
   where r.order_id = p_order_id and public.myr_claim_status_open(r.status)
$$;
revoke all on function public.myr_order_claim_status(uuid) from public, anon, authenticated;

-- 0090 정의 + open · refund_paid · shipping_back · 줄 amount · myr_line_amount
create or replace function public.myr_refund_request_json(r public.myr_refund_requests)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id, 'code', r.code, 'status', r.status, 'open', public.myr_claim_status_open(r.status), 'step', public.myr_refund_request_step(r),
    'kind', r.kind, 'reason', r.reason, 'qty', r.qty, 'note', r.note, 'photos', to_jsonb(r.photos),
    'options', to_jsonb(public.myr_refund_request_options(r.kind, r.reason)),
    'resolution', r.resolution, 'message', r.message, 'decided_at', r.decided_at,
    'needs_collect', r.needs_collect, 'collected_at', r.collected_at,
    'needs_reship', r.needs_reship, 'reship_courier', r.reship_courier, 'reship_tracking_no', r.reship_tracking_no, 'reshipped_at', r.reshipped_at,
    'needs_refund', r.needs_refund, 'deduction', r.deduction, 'return_fee', public.myr_refund_request_fee_due(r),
    'refund_amount', r.refund_amount, 'refunded_at', r.refunded_at, 'done_at', r.done_at, 'created_at', r.created_at,
    'amount', public.myr_line_amount(i.unit_price, r.qty),
    -- 환불이 끝난 요청을 결제 기준으로 — 결제 금액(상품 + 함께 돌려준 처음 배송비) = 환불액 + 차감 · 환불 전이면 refund_paid null · shipping_back 0
    'refund_paid', r.refund_amount + r.deduction,
    'shipping_back', greatest(r.refund_amount + r.deduction - public.myr_line_amount(i.unit_price, r.qty), 0),
    'buyer_name', o.buyer_name,
    'buyer_phone', case when length(regexp_replace(coalesce(o.buyer_phone, o.shipping ->> 'phone', ''), '\D', '', 'g')) >= 10
                        then left(regexp_replace(coalesce(o.buyer_phone, o.shipping ->> 'phone'), '\D', '', 'g'), 3) || '-****-' || right(regexp_replace(coalesce(o.buyer_phone, o.shipping ->> 'phone'), '\D', '', 'g'), 4)
                        else null end,
    'order', jsonb_build_object('id', o.id, 'code', o.code, 'status', o.status, 'paid_at', o.paid_at, 'is_member', o.user_id is not null,
                                'shipping_fee', o.shipping_fee,
                                'item', jsonb_build_object('id', i.id, 'name', i.product_name, 'option', i.option_name, 'qty', i.qty, 'unit_price', i.unit_price, 'amount', i.amount,
                                                           'refunded_qty', i.refunded_qty, 'status', i.status, 'ship_status', i.ship_status,
                                                           'courier', i.courier, 'tracking_no', i.tracking_no,
                                                           'shipped_at', i.shipped_at, 'delivered_at', i.delivered_at)),
    'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = r.product_id),
    'seller', (select jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle) from public.sellers s where s.id = r.seller_id))
    from public.myr_orders o
    join public.myr_order_items i on i.id = r.order_item_id
   where o.id = r.order_id
$$;
revoke all on function public.myr_refund_request_json(public.myr_refund_requests) from public, anon, authenticated;
grant execute on function public.myr_refund_request_json(public.myr_refund_requests) to service_role;

-- 0097 정의 + net_amount · alive · 줄 live · left_amount · claim_status 는 결제됐고 끝나지 않은 주문에만
create or replace function public.myr_order_json(o public.myr_orders, p_full boolean)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id, 'code', o.code, 'status', o.status,
    'amount', o.amount, 'items_amount', o.items_amount, 'shipping_fee', o.shipping_fee, 'refund_amount', o.refund_amount,
    'net_amount', public.myr_order_net(o), 'alive', public.myr_order_status_alive(o.status),
    'order_name', o.order_name, 'payment_method', o.payment_method, 'paid_at', o.paid_at, 'created_at', o.created_at,
    'deposit_due_at', o.deposit_due_at,
    'deposit', case when o.status = 'WAITING_DEPOSIT' and jsonb_typeof(o.raw_payment -> 'virtualAccount') = 'object'
                 then jsonb_build_object('bank', o.raw_payment -> 'virtualAccount' ->> 'bankCode', 'account', o.raw_payment -> 'virtualAccount' ->> 'accountNumber',
                                         'holder', o.raw_payment -> 'virtualAccount' ->> 'customerName', 'due', o.raw_payment -> 'virtualAccount' ->> 'dueDate')
                 else null end,
    'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at, 'delivered_at', o.delivered_at,
    'ship_status', public.myr_order_ship_status(o.id),
    'claim_status', case when public.myr_order_status_open(o.status) then public.myr_order_claim_status(o.id) end,
    'guest', o.user_id is null, 'buyer_name', o.buyer_name,
    'shipping', case when p_full then o.shipping else null end,
    'buyer_email', case when p_full then o.buyer_email else null end,
    'refund_reason', case when p_full and o.refund_amount > 0 then o.refund_reason else null end,
    'refunded_at', case when p_full and o.refund_amount > 0 then o.refunded_at else null end,
    -- 줄마다 환불 길(instant · claim · null · 0092) · 단순 변심 기한 · 지금 가능한지(0093) — 샵 화면이 이 값을 그대로 쓴다
    'items', coalesce((select jsonb_agg(public.myr_order_item_json(i) || jsonb_build_object('refund_path', public.myr_line_refund_path(o, i), 'left_qty', public.myr_line_left(i), 'left_amount', public.myr_line_amount(i.unit_price, public.myr_line_left(i)), 'live', public.myr_line_live(i),
                                                                                   'change_mind_until', public.myr_line_change_mind_until(i),
                                                                                   'change_mind_ok', public.myr_line_change_mind_ok(i)) order by i.created_at, i.id)
                         from public.myr_order_items i where i.order_id = o.id), '[]'::jsonb))
$$;
revoke all on function public.myr_order_json(public.myr_orders, boolean) from public, anon, authenticated;

-- 0098 정의 + ship_status · amounts · myr_claim_status_open · myr_order_status_paid
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
             -- 내 줄의 배송 상태 · 금액 — 화면이 줄을 다시 훑어 계산하지 않는다
             'ship_status', public.myr_order_ship_status(o.id, p_seller),
             'amounts', (select jsonb_build_object('paid', coalesce(sum(i.amount), 0), 'refunded', coalesce(sum(i.refund_amount), 0),
                                                  'net', coalesce(sum(public.myr_line_net(i)), 0))
                           from public.myr_order_items i where i.order_id = o.id and i.seller_id = p_seller),
             'items', (select jsonb_agg(jsonb_build_object(
                         'id', i.id, 'name', i.product_name, 'option', i.option_name, 'qty', i.qty, 'unit_price', i.unit_price, 'amount', i.amount,
                         'status', i.status, 'refunded_qty', i.refunded_qty, 'refund_amount', i.refund_amount,
                         'left_qty', public.myr_line_left(i), 'live', public.myr_line_live(i),
                         'ship_status', i.ship_status, 'courier', i.courier, 'tracking_no', i.tracking_no, 'shipped_at', i.shipped_at, 'delivered_at', i.delivered_at,
                         'groupbuy', i.groupbuy_id is not null,
                         'product', (select jsonb_build_object('code', p.code, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = i.product_id),
                         'claim', (select jsonb_build_object('code', r.code, 'status', r.status, 'kind', r.kind)
                                     from public.myr_refund_requests r where r.order_item_id = i.id and public.myr_claim_status_open(r.status)
                                    order by r.created_at desc limit 1))
                       order by i.created_at, i.id)
                       from public.myr_order_items i where i.order_id = o.id and i.seller_id = p_seller))
           order by o.paid_at desc, o.code desc)
      from (select o.* from public.myr_orders o
             where public.myr_order_status_paid(o.status)
               and exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.seller_id = p_seller)
             order by o.paid_at desc, o.code desc
             limit least(greatest(coalesce(p_limit, 200), 1), 500)) o
  ), '[]'::jsonb)
$$;
revoke all on function public.myr_app_seller_orders(uuid, integer) from public, anon, authenticated;
grant execute on function public.myr_app_seller_orders(uuid, integer) to service_role;

-- 0098 정의 + myr_sales_lines.net · payout(옛 마진율 계산) 제거
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
    select l.order_id, l.qty, l.refunded_qty, l.left_qty, l.amount, l.refund_amount, l.net,
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
    'net', coalesce((select sum(net) from m), 0),
    'orders', (select count(distinct order_id) from m),
    'units', coalesce((select sum(left_qty) from m), 0),
    'refunded_orders', (select count(distinct order_id) from m where refunded_qty > 0),
    'week', (select jsonb_agg(jsonb_build_object('date', to_char(d, 'YYYY-MM-DD'),
                                                 'orders', (select count(distinct w.order_id) from w where date_trunc('day', w.paid_kst) = d))
                              order by d)
               from generate_series(b.d0 - interval '6 days', b.d0, interval '1 day') d)
  )
  from b
$$;
revoke all on function public.myr_app_seller_sales(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_sales(uuid, timestamptz) to service_role;

-- 0089 정의 + myr_line_net · myr_order_status_paid · myr_line_valid
create or replace function public.myr_settlement_candidates(p_end timestamptz, p_seller uuid default null)
returns table (order_item_id uuid, product_id uuid, seller_id uuid, kind text, amount integer, refund_snapshot integer)
language sql
stable
as $$
  select i.id, i.product_id, i.seller_id, 'sale'::text, public.myr_line_net(i), i.refund_amount
    from public.myr_order_items i
    join public.myr_orders o on o.id = i.order_id
   where o.paid_at is not null and public.myr_order_status_paid(o.status)
     and public.myr_line_valid(i) and i.delivered_at is not null and i.delivered_at < p_end
     and (p_seller is null or i.seller_id = p_seller)
     and not exists (select 1 from public.myr_settlement_items s where s.order_item_id = i.id and s.kind = 'sale')
  union all
  -- 환불이 있는 줄만 보고(refund_amount > 0), 스냅샷은 줄마다 한 번 모은다(줄마다 하위 조회하면 정산한 줄이 쌓일수록 느려진다)
  select i.id, i.product_id, i.seller_id, 'refund_adj'::text, i.refund_amount - last.snap, i.refund_amount
    from public.myr_order_items i
    join (select s.order_item_id, max(s.refund_snapshot) as snap from public.myr_settlement_items s group by s.order_item_id) last on last.order_item_id = i.id
   where i.refund_amount > 0 and i.refund_amount > last.snap
     and (p_seller is null or i.seller_id = p_seller)
$$;
revoke all on function public.myr_settlement_candidates(timestamptz, uuid) from public, anon, authenticated;

-- 0098 정의 + myr_line_net · myr_order_status_open
create or replace function public.myr_settlement_preview(p_seller uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_month  date;
  v_end    timestamptz;
  v_rows   jsonb := '[]'::jsonb;
  pr       record;
  pc       record;
  oc       record;
  hr       record;
  v_offset integer;
  v_refund integer;
  v_payout integer;
  v_prior  jsonb := '{}'::jsonb;   -- 상품 → { offset: 앞선 줄 상계 합, refunded: 보증금 환급 여부 } (회차가 실제로 확정하는 순서를 따라간다)
  v_po     integer;
  v_pr     boolean;
begin
  select n.month, n.end_at into v_month, v_end from public.myr_settlement_next(p_now) n;
  -- 1) 보류 해제 예정 — 제조금액이 들어온 지난 보류 줄(정산월 순서 · 다음 회차가 먼저 확정한다)
  for hr in
    select r.*, u.month as origin,
           (select count(*) from public.myr_settlement_items t where t.row_id = r.id and t.kind = 'sale') as lines
      from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
     where r.seller_id = p_seller and r.status = 'held' and public.myr_mfg_has_ledger(r.product_id)
     order by u.month, r.product_id
  loop
    v_po := coalesce((v_prior -> hr.product_id::text ->> 'offset')::int, 0);
    v_pr := coalesce((v_prior -> hr.product_id::text ->> 'refunded')::boolean, false);
    select * into oc from public.myr_settlement_offset_calc(hr.product_id, hr.settle, v_po, v_pr);
    v_prior := v_prior || jsonb_build_object(hr.product_id::text, jsonb_build_object('offset', v_po + oc.offset_amount, 'refunded', v_pr or oc.mfg_after = 0));
    v_rows := v_rows || jsonb_build_object(
      'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = hr.product_id),
      'status', 'estimated', 'origin', to_char(hr.origin, 'YYYY-MM'), 'lines', hr.lines, 'pct', hr.pct,
      'sales', hr.sales, 'refund_adj', hr.refund_adj, 'carry_in', hr.carry_in, 'settle', hr.settle,
      'offset', oc.offset_amount, 'deposit_refund', oc.deposit_refund, 'payout', hr.settle - oc.offset_amount + oc.deposit_refund);
  end loop;
  -- 2) 이번 회차 줄 — 같은 상품이면 앞선 줄의 상계 · 환급 뒤로 이어서
  for pr in
    select n.product_id,
           coalesce(sum(n.amount) filter (where n.kind = 'sale'), 0)::integer as sales,
           coalesce(sum(n.amount) filter (where n.kind = 'refund_adj'), 0)::integer as refund_adj,
           count(*) filter (where n.kind = 'sale') as lines
      from public.myr_settlement_candidates(v_end, p_seller) n group by n.product_id
  loop
    select * into pc from public.myr_settlement_product_calc(pr.product_id, pr.sales, pr.refund_adj);
    if pc.held then
      v_offset := null; v_refund := null; v_payout := null;
    else
      v_po := coalesce((v_prior -> pr.product_id::text ->> 'offset')::int, 0);
      v_pr := coalesce((v_prior -> pr.product_id::text ->> 'refunded')::boolean, false);
      select * into oc from public.myr_settlement_offset_calc(pr.product_id, pc.settle, v_po, v_pr);
      v_offset := oc.offset_amount; v_refund := oc.deposit_refund; v_payout := pc.settle - oc.offset_amount + oc.deposit_refund;
    end if;
    v_rows := v_rows || jsonb_build_object(
      'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = pr.product_id),
      'status', case when pc.held then 'held' else 'estimated' end, 'origin', null, 'lines', pr.lines, 'pct', pc.pct,
      'sales', pr.sales, 'refund_adj', pr.refund_adj, 'carry_in', pc.carry_in, 'settle', pc.settle,
      'offset', v_offset, 'deposit_refund', v_refund, 'payout', v_payout);
  end loop;
  return jsonb_build_object(
    'month', to_char(v_month, 'YYYY-MM'),
    'settle_at', public.myr_month_start((v_month + interval '1 month')::date) + interval '13 hours',
    'rows', v_rows,
    'total', jsonb_build_object(
      'sales', coalesce((select sum((e ->> 'sales')::int) from jsonb_array_elements(v_rows) e), 0),
      'refund_adj', coalesce((select sum((e ->> 'refund_adj')::int) from jsonb_array_elements(v_rows) e), 0),
      'settle', coalesce((select sum((e ->> 'settle')::int) from jsonb_array_elements(v_rows) e), 0),
      'offset', coalesce((select sum((e ->> 'offset')::int) from jsonb_array_elements(v_rows) e), 0),
      'deposit_refund', coalesce((select sum((e ->> 'deposit_refund')::int) from jsonb_array_elements(v_rows) e), 0),
      'payout', coalesce((select sum((e ->> 'payout')::int) from jsonb_array_elements(v_rows) e), 0),
      'held', (select count(*) from jsonb_array_elements(v_rows) e where e ->> 'status' = 'held')),
    -- 아직 배송 완료가 아닌 판매(결제됨 · 취소 아님 · 남은 수량) — 배송 완료되면 그 회차에 들어간다
    'undelivered', (select jsonb_build_object('lines', count(*), 'amount', coalesce(sum(public.myr_line_net(i)), 0))
                      from public.myr_order_items i join public.myr_orders o on o.id = i.order_id
                     where i.seller_id = p_seller and o.paid_at is not null and public.myr_order_status_open(o.status)
                       and public.myr_line_live(i) and i.delivered_at is null));
end;
$$;
revoke all on function public.myr_settlement_preview(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_settlement_preview(uuid, timestamptz) to service_role;

-- 0089 정의 + myr_line_valid
create or replace function public.myr_app_seller_settlements_of_user(p_user uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'settle_status', s.myr_settle_status,
    'preview', public.myr_settlement_preview(s.id, p_now),
    -- 제조 원장 — 원장이 있거나 · 정산 줄이 있거나 · 팔린 적이 있는 내 상품(원장 없이 팔렸으면 "제조금액 확인 중"으로 보인다)
    'ledgers', coalesce((select jsonb_agg(jsonb_build_object(
                 'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url),
                 'has_ledger', public.myr_mfg_has_ledger(p.id),
                 'batches', coalesce((select jsonb_agg(jsonb_build_object('seq', b.seq, 'amount', b.amount, 'deposit_amount', b.deposit_amount,
                                                                          'deposit_paid', b.deposit_paid_at is not null, 'deposit_refunded', b.deposit_refund_row_id is not null)
                                                       order by b.seq)
                                        from public.myr_mfg_batches b where b.product_id = p.id and b.voided_at is null), '[]'::jsonb),
                 'total', coalesce((select sum(b.amount) from public.myr_mfg_batches b where b.product_id = p.id and b.voided_at is null), 0),
                 'offset', coalesce((select sum(r.offset_amount) from public.myr_settlement_rows r where r.product_id = p.id and r.status = 'confirmed'), 0),
                 'remaining', public.myr_mfg_remaining(p.id),
                 'deposit_paid', coalesce((select sum(b.deposit_amount) from public.myr_mfg_batches b where b.product_id = p.id and b.voided_at is null and b.deposit_paid_at is not null), 0),
                 'deposit_unpaid', coalesce((select sum(b.deposit_amount) from public.myr_mfg_batches b where b.product_id = p.id and b.voided_at is null and b.deposit_paid_at is null), 0),
                 'deposit_refunded', coalesce((select sum(b.deposit_amount) from public.myr_mfg_batches b where b.product_id = p.id and b.deposit_refund_row_id is not null), 0))
               order by p.created_at)
               from public.myr_products p
              where p.seller_id = s.id and p.deleted_at is null
                and (public.myr_mfg_has_ledger(p.id) or exists (select 1 from public.myr_settlement_rows r where r.product_id = p.id)
                     or exists (select 1 from public.myr_order_items i join public.myr_orders o on o.id = i.order_id
                                 where i.product_id = p.id and o.paid_at is not null and public.myr_line_valid(i)))), '[]'::jsonb),
    -- 월별 내역(최근 순) — 내 상품 줄만. 한 달 카드 = 그 회차의 내 줄 + 그 회차에서 보류 해제되어 지급된 지난 줄(origin).
    --   보류 해제된 줄은 원래 달 카드에도 남지만(released_in) 그 달 합계에서는 빠진다 — 지급한 달 합계에만 들어간다(같은 돈을 두 번 더하지 않게)
    'months', coalesce((select jsonb_agg(m.j order by m.month desc) from (
                 select x.month, jsonb_build_object(
                   'month', to_char(x.month, 'YYYY-MM'),
                   'settled_at', x.cutoff_at,
                   'total', jsonb_build_object(
                     'sales', coalesce(sum(x.sales) filter (where x.counted), 0), 'refund_adj', coalesce(sum(x.refund_adj) filter (where x.counted), 0),
                     'settle', coalesce(sum(x.settle) filter (where x.counted), 0),
                     'offset', coalesce(sum(x.offset_amount) filter (where x.counted), 0), 'deposit_refund', coalesce(sum(x.deposit_refund) filter (where x.counted), 0),
                     'payout', coalesce(sum(x.payout) filter (where x.counted), 0), 'held', count(*) filter (where x.status = 'held')),
                   'rows', jsonb_agg(jsonb_build_object(
                     'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url),
                     'status', x.status, 'origin', to_char(x.origin, 'YYYY-MM'), 'released_in', to_char(x.released_in, 'YYYY-MM'),
                     'pct', x.pct, 'sales', x.sales, 'refund_adj', x.refund_adj, 'carry_in', x.carry_in, 'carry_out', x.carry_out,
                     'settle', x.settle, 'offset', x.offset_amount, 'mfg_after', x.mfg_after, 'deposit_refund', x.deposit_refund, 'payout', x.payout)
                     order by x.origin nulls first, p.name)) as j
                   from (
                     -- 그 회차의 내 줄(나중에 보류 해제됐으면 released_in · 합계 제외)
                     select u.month, u.cutoff_at, r.product_id, r.status, null::date as origin, ru.month as released_in, (r.released_run_id is null) as counted,
                            r.pct, r.sales, r.refund_adj, r.carry_in, r.carry_out, r.settle, r.offset_amount, r.mfg_after, r.deposit_refund, r.payout
                       from public.myr_settlement_rows r
                       join public.myr_settlement_runs u on u.id = r.run_id
                       left join public.myr_settlement_runs ru on ru.id = r.released_run_id
                      where r.seller_id = s.id
                     union all
                     -- 그 회차에서 보류 해제되어 지급된 지난 줄(origin = 원래 달 · 합계 포함)
                     select u.month, u.cutoff_at, r.product_id, r.status, ro.month, null::date, true,
                            r.pct, r.sales, r.refund_adj, r.carry_in, r.carry_out, r.settle, r.offset_amount, r.mfg_after, r.deposit_refund, r.payout
                       from public.myr_settlement_rows r
                       join public.myr_settlement_runs u on u.id = r.released_run_id
                       join public.myr_settlement_runs ro on ro.id = r.run_id
                      where r.seller_id = s.id
                   ) x
                   join public.myr_products p on p.id = x.product_id
                  group by x.month, x.cutoff_at) m), '[]'::jsonb))
    from public.sellers s
   where s.user_id = p_user and p_user is not null
$$;
revoke all on function public.myr_app_seller_settlements_of_user(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_settlements_of_user(uuid, timestamptz) to service_role;

-- 0087 정의 + myr_product_status_approved
create or replace function public.myr_mfg_pending()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'held', coalesce((select jsonb_agg(jsonb_build_object('product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name),
                                                          'seller', jsonb_build_object('name', s.name, 'handle', s.handle),
                                                          'months', h.months, 'settle', h.settle) order by p.code)
                        from (select r.product_id, jsonb_agg(to_char(u.month, 'YYYY-MM') order by u.month) as months, sum(r.settle)::integer as settle
                                from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
                               where r.status = 'held' group by r.product_id) h
                        join public.myr_products p on p.id = h.product_id
                        join public.sellers s on s.id = p.seller_id), '[]'::jsonb),
    'no_ledger', coalesce((select jsonb_agg(jsonb_build_object('product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name),
                                                               'seller', jsonb_build_object('name', s.name, 'handle', s.handle), 'status', p.status) order by p.code)
                             from public.myr_products p join public.sellers s on s.id = p.seller_id
                            where p.deleted_at is null and (public.myr_product_status_approved(p.status) or p.status = 'ended')
                              and not public.myr_mfg_has_ledger(p.id)), '[]'::jsonb))
$$;
revoke all on function public.myr_mfg_pending() from public, anon, authenticated;
grant execute on function public.myr_mfg_pending() to service_role;

-- 0087 정의 + myr_deposit_amount
create or replace function public.myr_mfg_add(p_product_id uuid, p_amount integer, p_note text, p_actor text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p public.myr_products%rowtype;
  b public.myr_mfg_batches%rowtype;
begin
  select * into p from public.myr_products where id = p_product_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p_amount is null or p_amount < 0 then return jsonb_build_object('ok', false, 'code', 'BAD_AMOUNT'); end if;
  insert into public.myr_mfg_batches (product_id, seller_id, seq, amount, deposit_amount, note, created_by)
  values (p.id, p.seller_id, coalesce((select max(seq) from public.myr_mfg_batches where product_id = p.id), 0) + 1,
          p_amount, public.myr_deposit_amount(p_amount), nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_actor, 'script'))
  returning * into b;
  return jsonb_build_object('ok', true, 'batch', public.myr_mfg_batch_json(b), 'remaining', public.myr_mfg_remaining(p.id));
end;
$$;
revoke all on function public.myr_mfg_add(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.myr_mfg_add(uuid, integer, text, text) to service_role;

-- 0087 정의 + myr_deposit_amount
create or replace function public.myr_mfg_fix(p_product_id uuid, p_seq integer, p_amount integer, p_reason text, p_actor text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  b        public.myr_mfg_batches%rowtype;
  n        public.myr_mfg_batches%rowtype;
  v_total  integer;
  v_offset integer;
begin
  perform 1 from public.myr_products where id = p_product_id for update;
  select * into b from public.myr_mfg_batches where product_id = p_product_id and seq = p_seq for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if b.voided_at is not null then return jsonb_build_object('ok', false, 'code', 'ALREADY_VOIDED'); end if;
  if coalesce(btrim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;
  if p_amount is null or p_amount < 0 then return jsonb_build_object('ok', false, 'code', 'BAD_AMOUNT'); end if;
  if p_amount = b.amount then return jsonb_build_object('ok', false, 'code', 'SAME_AMOUNT'); end if;
  if b.deposit_refund_row_id is not null then return jsonb_build_object('ok', false, 'code', 'REFUNDED'); end if;
  select coalesce(sum(amount), 0) into v_total from public.myr_mfg_batches where product_id = p_product_id and voided_at is null and id <> b.id;
  select coalesce(sum(offset_amount), 0) into v_offset from public.myr_settlement_rows where product_id = p_product_id and status = 'confirmed';
  if v_total + p_amount < v_offset then return jsonb_build_object('ok', false, 'code', 'USED', 'shortfall', v_offset - (v_total + p_amount)); end if;
  insert into public.myr_mfg_batches (product_id, seller_id, seq, amount, deposit_amount, deposit_paid_at, note, created_by)
  values (b.product_id, b.seller_id, (select max(seq) from public.myr_mfg_batches where product_id = p_product_id) + 1,
          p_amount, public.myr_deposit_amount(p_amount), b.deposit_paid_at,
          format('%s차 정정 · %s', b.seq, btrim(p_reason)), coalesce(p_actor, 'script'))
  returning * into n;
  update public.myr_mfg_batches set voided_at = now(), voided_by = coalesce(p_actor, 'script'), void_reason = format('%s차로 정정 · %s', n.seq, btrim(p_reason))
   where id = b.id;
  return jsonb_build_object('ok', true, 'voided_seq', b.seq, 'batch', public.myr_mfg_batch_json(n), 'remaining', public.myr_mfg_remaining(p_product_id),
                            'deposit_diff', case when b.deposit_paid_at is not null then b.deposit_amount - n.deposit_amount else 0 end);
end;
$$;
revoke all on function public.myr_mfg_fix(uuid, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.myr_mfg_fix(uuid, integer, integer, text, text) to service_role;


-- ── 3. 달라지는 동작(넷) ───────────────────────────────────────
--   · 공구가 미리보기(myr_app_groupbuy_preview)는 만들기와 같은 범위(1~70)만 받는다 — 전에는 0~99 를 받아 만들 수 없는 할인율도 가격을 보여 줬다.
--   · 주인 판정(myr_order_owned_by)은 user_id · customer_id 가 둘 다 비어 있는 주문을 남의 주문으로 본다 — 전에는 그 식이 NULL 이 되어 통과할 수 있었다(그런 주문은 없다).
--   · myr_app_seller_sales 의 payout 이 없어진다(쓰는 화면 없음).
--   · 주문 응답의 claim_status 는 결제됐고 끝나지 않은 주문에만 실린다 — 전액 환불 · 취소 · 입금 대기 주문은 null(화면은 전에도 그 주문에서 요청 상태를 쓰지 않았다).
