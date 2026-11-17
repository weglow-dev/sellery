-- ============================================================
-- 0112 · MYR "배송 작업 대상 줄"을 함수 하나로 — 발주 후보 · 발주 처리 · 송장 입력 · 배송 완료 · 배송 완료 누락 · 송장 동기화 · 발송 대기가 같은 기준 (2026-11-17)
--
--   점검(백엔드 원칙 1 · 0110 에서 미룬 것): 배송 작업 쪽 여덟 곳이 "열린 주문 + 살아 있는 줄"을 각자 적었다.
--     줄마다 두 조건을 같이 보는 곳   발주 후보(prepare_candidates) · 발주 처리(mark_prepared) · 송장 입력 줄(ship_line) ·
--                                     배송 완료 누락(undelivered) · 송장 동기화 후보(ship_sync_candidates)
--     주문을 먼저 거르고 줄을 고르는 곳 송장 입력 주문(ship) · 배송 완료 처리(deliver) · 발송 대기(ship_pending)
--   고침:
--     myr_line_ship_work(o, i)   열린 주문의 살아 있는 줄 — myr_order_status_open · myr_line_live
--     여덟 곳의 줄 고르기가 이 함수 + 자기 조건(배송 상태 · 이벗 등록 · 시각)을 쓴다
--     주문 단위 거절(WRONG_STATUS — ship · deliver)은 그대로 myr_order_status_open
--     발주 후보의 o.paid_at is not null 은 뺀다 — 열린 주문이면 표 제약(myr_orders_paid_has_paid_at)으로 늘 있고 · 옆의 paid_at < p_cutoff 도 비면 거짓
--       → "결제된 줄" 검사 규칙의 발주 후보 예외를 지운다
--   그대로 둔 것: 환불 신청 길(myr_line_refund_path) · 요청 접수(myr_app_claim_open) · 주문 응답 요청 칩 · 결제 정보 갱신은 열린 주문을 다른 뜻으로 본다 ·
--     주문 배송 상태 요약(myr_order_ship_status)은 살아 있는 줄만 본다(주문 상태는 부르는 쪽이 확인)
--   계산 결과 불변 — 새 함수는 두 함수를 and 로 묶기만 한다 · 주문을 먼저 거른 곳은 이미 열린 주문이라 줄 조건이 같다 · 반환 모양 그대로
--   테스트: supabase/tests/myr_line_ship_work.test.sql · 기존 발주 · 송장 · 배송 완료 · 동기화 테스트
-- ============================================================

create or replace function public.myr_line_ship_work(o public.myr_orders, i public.myr_order_items)
returns boolean
language sql
stable
as $$
  select public.myr_order_status_open(o.status) and public.myr_line_live(i)
$$;
revoke all on function public.myr_line_ship_work(public.myr_orders, public.myr_order_items) from public, anon, authenticated;

-- 0099 정의 → myr_line_ship_work
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
       and i.ship_status = 'PAID' and public.myr_line_ship_work(o, i)
    returning i.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from u;
  return jsonb_build_object('ok', true, 'count', cardinality(v_ids),
    'orders', coalesce((select jsonb_agg(distinct o.code) from public.myr_order_items i join public.myr_orders o on o.id = i.order_id where i.id = any (v_ids)), '[]'::jsonb));
end;
$$;
revoke all on function public.myr_app_admin_mark_prepared(uuid[], boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_mark_prepared(uuid[], boolean) to service_role;

-- 0099 정의 → myr_line_ship_work(o.paid_at is not null 은 열린 주문이면 늘 참이라 뺀다)
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
   where i.ship_status = 'PAID' and public.myr_line_ship_work(o, i) and o.paid_at < p_cutoff
$$;
revoke all on function public.myr_app_admin_prepare_candidates(timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_admin_prepare_candidates(timestamptz) to service_role;

-- 0099 정의 → 줄 고르기만 myr_line_ship_work(주문 거절은 그대로 myr_order_status_open)
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
     and not exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_line_ship_work(o, i) and public.myr_ship_status_unshipped(i.ship_status)) then
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
   where i.order_id = o.id and public.myr_line_ship_work(o, i)
     and (public.myr_ship_status_unshipped(i.ship_status) or (v_old is not null and i.tracking_no = v_old));
  return jsonb_build_object('ok', true, 'already', false, 'order_id', o.id, 'order_code', o.code, 'status', o.status, 'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at);
end;
$$;
revoke all on function public.myr_app_admin_ship(text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship(text, text, text) to service_role;

-- 0099 정의 → myr_line_ship_work
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
  if not public.myr_line_ship_work(o, i) then
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

-- 0099 정의 → myr_line_ship_work(줄 수 · 배송준비중 수는 주문 행이 있는 안쪽에서 센다 · 반환 모양 그대로)
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
           'lines', o.n_lines,
           'ship_status', public.myr_order_ship_status(o.id),
           'preparing', o.n_preparing
         ) order by case when p_shipped then o.shipped_at else o.paid_at end desc), '[]'::jsonb)
    from (select o.*,
                 (select count(*) from public.myr_order_items i where i.order_id = o.id and public.myr_line_ship_work(o, i)) as n_lines,
                 (select count(*) from public.myr_order_items i where i.order_id = o.id and public.myr_line_ship_work(o, i) and i.ship_status = 'PREPARING') as n_preparing
            from public.myr_orders o
           where public.myr_order_status_open(o.status)
             and (case when p_shipped
                       then not exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_line_ship_work(o, i) and public.myr_ship_status_unshipped(i.ship_status))
                            and exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_line_ship_work(o, i))
                       else exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_line_ship_work(o, i) and public.myr_ship_status_unshipped(i.ship_status)) end)
           order by case when p_shipped then o.shipped_at else o.paid_at end desc
           limit greatest(coalesce(p_limit, 100), 1)) o
$$;
revoke all on function public.myr_app_admin_ship_pending(integer, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship_pending(integer, boolean) to service_role;

-- 0099 정의 → myr_line_ship_work
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
     and public.myr_line_ship_work(o, i)
$$;
revoke all on function public.myr_app_admin_ship_sync_candidates() from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship_sync_candidates() to service_role;

-- 0099 정의 → 줄 고르기만 myr_line_ship_work(주문 거절은 그대로 myr_order_status_open)
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
  if not exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.ship_status = 'SHIPPING' and public.myr_line_ship_work(o, i)) then
    if exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.ship_status = 'DELIVERED' and public.myr_line_ship_work(o, i)) then
      return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'delivered', 0);
    end if;
    return jsonb_build_object('ok', false, 'code', 'NOT_SHIPPED');
  end if;
  with u as (
    update public.myr_order_items
       set ship_status = 'DELIVERED', delivered_at = v_at, is_delayed = false
     where order_id = o.id and ship_status = 'SHIPPING' and public.myr_line_ship_work(o, myr_order_items)
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

-- 0099 정의 → myr_line_ship_work
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
   where i.ship_status = 'SHIPPING' and public.myr_line_ship_work(o, i)
     and i.shipped_at <= now() - make_interval(days => greatest(coalesce(p_days, 5), 0))
$$;
revoke all on function public.myr_app_admin_undelivered(integer) from public, anon, authenticated;
grant execute on function public.myr_app_admin_undelivered(integer) to service_role;
