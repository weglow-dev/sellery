-- ============================================================
-- 0088 — MYR 배송 완료 수동 기록 · 배송 완료 없는 줄 목록(2026-11-10 · 정산 0087 의 선행 조건)
--
--   정산(0087)은 배송 완료일(myr_order_items.delivered_at)이 있는 줄만 잡는다. 배송 완료를 찍는 경로는 이벗 송장 수집 크론(0077 myr_app_admin_ship_line
--   delivered = true)뿐이고, 그 크론은 이벗에 등록된 줄만 본다 — 운영 명령으로 발송한 줄(myr_app_admin_ship)은 배송중에서 멈춰 정산에 들어가지 않는다.
--   자동으로 "발송 N일 뒤 배송 완료" 는 하지 않는다(대표 확인 2026-11-10 — 택배 조회 없이 완료로 바꾸면 분실 · 반송도 완료가 되고 정산이 나간다).
--   운영이 택배사 조회로 확인한 뒤 찍는다. 이벗을 켠 뒤에도 예외(이벗 미등록 · 택배사 신호 누락)를 같은 방법으로 처리한다.
--
--   myr_app_admin_deliver(order_code, delivered_at)   그 주문의 배송중 줄 전부 → 배송 완료(실제 배송일 · 기본 지금)
--     { ok, already, order_code, delivered, delivered_at } · NOT_FOUND | WRONG_STATUS | NOT_SHIPPED | BAD_DATE(미래 · 결제 전)
--     이미 배송 완료인 줄은 그대로(already) · 주문 칸 delivered_at 은 살아 있는 줄이 전부 배송 완료일 때(0077 과 같은 규칙)
--   myr_app_admin_undelivered(days)                  배송중으로 days 일 넘게 남은 줄(발송 오래된 순) — 이벗 등록 여부 표시 · 운영 스크립트 · 어드민 예외 목록
--
--   권한: service role 만(anon · authenticated EXECUTE 회수). 테스트: supabase/tests/myr_deliver.test.sql. 재실행 가능.
-- ============================================================

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
  if not exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.ship_status = 'SHIPPING' and i.status <> 'CANCELED' and i.qty - i.refunded_qty > 0) then
    if exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.ship_status = 'DELIVERED' and i.status <> 'CANCELED' and i.qty - i.refunded_qty > 0) then
      return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'delivered', 0);
    end if;
    return jsonb_build_object('ok', false, 'code', 'NOT_SHIPPED');
  end if;
  with u as (
    update public.myr_order_items
       set ship_status = 'DELIVERED', delivered_at = v_at, is_delayed = false
     where order_id = o.id and ship_status = 'SHIPPING' and status <> 'CANCELED' and qty - refunded_qty > 0
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

create or replace function public.myr_app_admin_undelivered(p_days integer default 5)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'order_code', o.code, 'item_id', i.id, 'product', i.product_name, 'option', i.option_name, 'qty', i.qty - i.refunded_qty,
           'seller', s.handle, 'courier', i.courier, 'tracking_no', i.tracking_no, 'shipped_at', i.shipped_at,
           'days', floor(extract(epoch from (now() - i.shipped_at)) / 86400)::integer, 'ebut', i.ebut_registered_at is not null)
         order by i.shipped_at, o.code), '[]'::jsonb)
    from public.myr_order_items i
    join public.myr_orders o on o.id = i.order_id
    join public.sellers s on s.id = i.seller_id
   where i.ship_status = 'SHIPPING' and i.status <> 'CANCELED' and i.qty - i.refunded_qty > 0
     and o.status in ('PAID', 'PARTIAL_REFUNDED')
     and i.shipped_at <= now() - make_interval(days => greatest(coalesce(p_days, 5), 0))
$$;
revoke all on function public.myr_app_admin_undelivered(integer) from public, anon, authenticated;
grant execute on function public.myr_app_admin_undelivered(integer) to service_role;
