-- ============================================================
-- 0098 — MYR "줄의 남은 수량" · "살아 있는 줄" 판정을 나머지 함수도 한 곳으로(2026-11-11 · 백엔드 원칙 1)
--   0097 이 myr_line_left(주문 수량 − 환불 수량)를 만들고 환불 길 4곳을 옮겼다. 발송 · 정산 · 실적 · 재고 쪽 13개 함수는
--   같은 식(qty − refunded_qty)과 "취소가 아니고 남은 수량이 있는 줄"을 각자 쓰고 있었다 — 전부 아래 두 함수로 바꾼다. 계산 결과는 그대로.
--
--   새 함수   myr_line_live(item)   살아 있는 줄 = 취소(CANCELED)가 아니고 myr_line_left > 0
--   바뀌는 함수(식만 · 나머지 그대로)
--     발송   myr_app_admin_mark_prepared · prepare_candidates · ship · ship_line · ship_pending · ship_sync_candidates(0077) · deliver · undelivered(0088)
--            myr_order_ship_status(0077 — 주문 배송 상태)
--     정산   myr_settlement_preview(0089 — "아직 포함되지 않은 판매")
--     실적   myr_sales_lines(0086 + left_qty 칸 — 반환 모양이 바뀌어 drop 뒤 다시 만든다) · myr_app_seller_sales · myr_groupbuy_seller_json(판매 수량 = left_qty 합)
--     재고   myr_recalc_product_sold_qty(0058 — 상품 판매 수량)
--     콘솔   myr_app_seller_orders(0086 + 줄마다 left_qty · live — 주문 탭이 화면에서 다시 계산하지 않게)
--     환불   myr_refund_lines · myr_line_refund_path(0097 — 살아 있는 줄 판정을 myr_line_live 로)
--   거래 메일(배송 시작)은 PostgREST 계산 칸으로 같은 함수를 읽는다(myr_order_items 의 myr_line_left · myr_line_live).
--   권한: 새 내부 함수는 anon · authenticated EXECUTE 회수. 테스트: supabase/tests/myr_line_live.test.sql + 기존 발송 · 배송 완료 · 정산 · 실적 · 공구 · 주문 테스트 그대로.
-- ============================================================

create or replace function public.myr_line_live(i public.myr_order_items)
returns boolean
language sql
stable
as $$
  select coalesce(i.status <> 'CANCELED', false) and public.myr_line_left(i) > 0
$$;
revoke all on function public.myr_line_live(public.myr_order_items) from public, anon, authenticated;

-- 실적 줄(0086) + left_qty — 반환 모양이 바뀌어 다시 만든다(쓰는 함수 둘은 아래에서 같이 바꾼다)
drop function if exists public.myr_sales_lines();
create function public.myr_sales_lines()
returns table (order_id uuid, seller_id uuid, product_id uuid, groupbuy_id uuid, qty integer, refunded_qty integer, amount integer,
               refund_amount integer, seller_margin_rate numeric, paid_at timestamptz, left_qty integer)
language sql
stable
as $$
  select i.order_id, i.seller_id, i.product_id, i.groupbuy_id, i.qty, i.refunded_qty, i.amount, i.refund_amount, i.seller_margin_rate, o.paid_at,
         public.myr_line_left(i)
    from public.myr_order_items i
    join public.myr_orders o on o.id = i.order_id
   where o.paid_at is not null
     and o.status in ('PAID', 'PARTIAL_REFUNDED', 'REFUNDED')
$$;
revoke all on function public.myr_sales_lines() from public, anon, authenticated;

-- 0077 정의 + myr_line_left / myr_line_live
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
       and o.status in ('PAID','PARTIAL_REFUNDED')
    returning i.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from u;
  return jsonb_build_object('ok', true, 'count', cardinality(v_ids),
    'orders', coalesce((select jsonb_agg(distinct o.code) from public.myr_order_items i join public.myr_orders o on o.id = i.order_id where i.id = any (v_ids)), '[]'::jsonb));
end;
$$;
revoke all on function public.myr_app_admin_mark_prepared(uuid[], boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_mark_prepared(uuid[], boolean) to service_role;

-- 0077 정의 + myr_line_left / myr_line_live
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
     and o.status in ('PAID','PARTIAL_REFUNDED') and o.paid_at is not null and o.paid_at < p_cutoff
$$;
revoke all on function public.myr_app_admin_prepare_candidates(timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_admin_prepare_candidates(timestamptz) to service_role;

-- 0077 정의 + myr_line_left / myr_line_live
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
  if o.status not in ('PAID','PARTIAL_REFUNDED') then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if o.tracking_no = v_tracking and o.courier = v_courier
     and not exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_line_live(i) and i.ship_status in ('PAID','PREPARING')) then
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
     and (i.ship_status in ('PAID','PREPARING') or (v_old is not null and i.tracking_no = v_old));
  return jsonb_build_object('ok', true, 'already', false, 'order_id', o.id, 'order_code', o.code, 'status', o.status, 'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at);
end;
$$;
revoke all on function public.myr_app_admin_ship(text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship(text, text, text) to service_role;

-- 0077 정의 + myr_line_left / myr_line_live
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
  if o.status not in ('PAID','PARTIAL_REFUNDED') or not public.myr_line_live(i) then
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

-- 0077 정의 + myr_line_left / myr_line_live
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
           where o.status in ('PAID','PARTIAL_REFUNDED')
             and (case when p_shipped
                       then not exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_line_live(i) and i.ship_status in ('PAID','PREPARING'))
                            and exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_line_live(i))
                       else exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_line_live(i) and i.ship_status in ('PAID','PREPARING')) end)
           order by case when p_shipped then o.shipped_at else o.paid_at end desc
           limit greatest(coalesce(p_limit, 100), 1)) o
$$;
revoke all on function public.myr_app_admin_ship_pending(integer, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship_pending(integer, boolean) to service_role;

-- 0077 정의 + myr_line_left / myr_line_live
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
     and public.myr_line_live(i) and o.status in ('PAID','PARTIAL_REFUNDED')
$$;
revoke all on function public.myr_app_admin_ship_sync_candidates() from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship_sync_candidates() to service_role;

-- 0088 정의 + myr_line_left / myr_line_live
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
  if o.status not in ('PAID', 'PARTIAL_REFUNDED') then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
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

-- 0088 정의 + myr_line_left / myr_line_live
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
     and o.status in ('PAID', 'PARTIAL_REFUNDED')
     and i.shipped_at <= now() - make_interval(days => greatest(coalesce(p_days, 5), 0))
$$;
revoke all on function public.myr_app_admin_undelivered(integer) from public, anon, authenticated;
grant execute on function public.myr_app_admin_undelivered(integer) to service_role;

-- 0077 정의 + myr_line_left / myr_line_live
create or replace function public.myr_order_ship_status(p_order_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select case min(case i.ship_status when 'PAID' then 1 when 'PREPARING' then 2 when 'SHIPPING' then 3 else 4 end)
           when 1 then 'PAID' when 2 then 'PREPARING' when 3 then 'SHIPPING' when 4 then 'DELIVERED' end
    from public.myr_order_items i
   where i.order_id = p_order_id and public.myr_line_live(i)
$$;
revoke all on function public.myr_order_ship_status(uuid) from public, anon, authenticated;

-- 0089 정의 + myr_line_left / myr_line_live
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
    'undelivered', (select jsonb_build_object('lines', count(*), 'amount', coalesce(sum(i.amount - i.refund_amount), 0))
                      from public.myr_order_items i join public.myr_orders o on o.id = i.order_id
                     where i.seller_id = p_seller and o.paid_at is not null and o.status in ('PAID', 'PARTIAL_REFUNDED')
                       and public.myr_line_live(i) and i.delivered_at is null));
end;
$$;
revoke all on function public.myr_settlement_preview(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_settlement_preview(uuid, timestamptz) to service_role;

-- 0058 정의 + myr_line_left / myr_line_live
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
          and o.status in ('WAITING_DEPOSIT','PAID','PARTIAL_REFUNDED')
          and i.status <> 'CANCELED'), 0)
   where p.id = p_product_id
$$;
revoke all on function public.myr_recalc_product_sold_qty(uuid) from public, anon, authenticated;

-- 0086 정의 + myr_line_left / myr_line_live
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
    select l.order_id, l.qty, l.refunded_qty, l.left_qty, l.amount, l.refund_amount, l.seller_margin_rate,
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
    'units', coalesce((select sum(left_qty) from m), 0),
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

-- 0086 정의 + myr_line_left / myr_line_live
create or replace function public.myr_groupbuy_seller_json(g public.myr_groupbuys, p public.myr_products)
returns jsonb
language sql
stable
as $$
  select public.myr_groupbuy_product_json(g, p)
      || jsonb_build_object('planned_ends_at', g.ends_at, 'closed_at', g.closed_at, 'created_at', g.created_at,
                            'stats', (select jsonb_build_object('orders', count(distinct l.order_id),
                                                                'units', coalesce(sum(l.left_qty), 0),
                                                                'net', coalesce(sum(l.amount - l.refund_amount), 0))
                                        from public.myr_sales_lines() l where l.groupbuy_id = g.id))
$$;
revoke all on function public.myr_groupbuy_seller_json(public.myr_groupbuys, public.myr_products) from public, anon, authenticated;

-- 0086 정의 + myr_line_left / myr_line_live
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
                         'left_qty', public.myr_line_left(i), 'live', public.myr_line_live(i),
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

-- 0097 정의 + myr_line_left / myr_line_live
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

-- 0097 정의 + myr_line_left / myr_line_live
create or replace function public.myr_line_refund_path(o public.myr_orders, i public.myr_order_items)
returns text
language sql
stable
as $$
  select case
    when o.status not in ('PAID', 'PARTIAL_REFUNDED', 'WAITING_DEPOSIT') then null
    when not public.myr_line_live(i) then null
    when i.ship_status = 'PAID' then 'instant'
    when o.status = 'WAITING_DEPOSIT' then null
    else 'claim' end
$$;
revoke all on function public.myr_line_refund_path(public.myr_orders, public.myr_order_items) from public, anon, authenticated;
