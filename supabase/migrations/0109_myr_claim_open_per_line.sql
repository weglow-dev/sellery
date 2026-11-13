-- ============================================================
-- 0109 · MYR 열린 교환·환불 요청은 그 줄만 막는다 — 같은 주문의 다른 상품은 신청 · 바로 환불 가능 (2026-11-13 결정)
--
--   결정(2026-11-13): 처리 중인 교환·환불 요청이 있어도 같은 주문의 다른 상품은 환불할 수 있으면 환불할 수 있게 한다.
--     (2026-11-06 "주문에 열린 요청이 있으면 끝날 때까지 새 신청을 받지 않는다"를 바꾼다)
--   서버 처리는 이미 줄 단위였다 — 바로 환불(myr_app_refund_precheck)은 요청을 보지 않고, 요청 접수(myr_app_claim_open)는 같은 줄만 OPEN_EXISTS.
--     주문 단위로 막던 것은 샵 화면(TS customerCanRefund 의 claimStatus)뿐이었다.
--   고침:
--     myr_line_customer_path(o, i)   고객이 지금 신청할 수 있는 길 — 줄의 환불 길(myr_line_refund_path)인데 그 줄에 열린 요청(myr_line_open_claim)이 있으면 없음
--     주문 응답(myr_order_json)의 줄 refund_path 가 이 값 — 신청 페이지 · 바로 환불 · 요청 줄 목록 · [교환 · 환불 신청] 버튼이 같은 값을 읽는다
--     (바로 환불 precheck · 요청 접수의 길 판정은 그대로 myr_line_refund_path · 같은 줄 중복은 요청 접수가 OPEN_EXISTS 로 막는다)
--   테스트: supabase/tests/myr_claim_open_per_line.test.sql
-- ============================================================

create or replace function public.myr_line_customer_path(o public.myr_orders, i public.myr_order_items)
returns text
language sql
stable
as $$
  select case when public.myr_line_open_claim(i) is not null then null else public.myr_line_refund_path(o, i) end
$$;
revoke all on function public.myr_line_customer_path(public.myr_orders, public.myr_order_items) from public, anon, authenticated;

-- 0099 정의 + 줄 refund_path 를 myr_line_customer_path 로(열린 요청이 걸린 줄은 신청 길 없음)
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
    'items', coalesce((select jsonb_agg(public.myr_order_item_json(i) || jsonb_build_object('refund_path', public.myr_line_customer_path(o, i), 'left_qty', public.myr_line_left(i), 'left_amount', public.myr_line_amount(i.unit_price, public.myr_line_left(i)), 'live', public.myr_line_live(i),
                                                                                   'change_mind_until', public.myr_line_change_mind_until(i),
                                                                                   'change_mind_ok', public.myr_line_change_mind_ok(i)) order by i.created_at, i.id)
                         from public.myr_order_items i where i.order_id = o.id), '[]'::jsonb))
$$;
revoke all on function public.myr_order_json(public.myr_orders, boolean) from public, anon, authenticated;
