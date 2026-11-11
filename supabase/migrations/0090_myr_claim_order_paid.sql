-- ============================================================
-- 0090 — MYR 교환·환불 요청 JSON 에 주문 배송비(콘솔 요청 상세 "결제 금액 − 왕복 배송비 = 환불 금액" 표시 · 2026-11-11 대표 피드백)
--
--   myr_refund_request_json   0080 정의 + order.shipping_fee
--                             크리에이터 콘솔 "주문 · 배송" 칸이 상품 금액(그 줄) · 배송비(무료배송이면 0)를 보여 주고,
--                             처리 결과가 결제 금액(줄 + 함께 돌려줄 배송비)에서 왕복 배송비를 빼는 식으로 환불 금액을 보여 준다.
--                             금액 계산은 바뀌지 않는다(실제 환불 · 예상 금액 = refundQuote). 다른 줄 금액 · 주문 합계는 싣지 않는다(섞인 주문의 다른 크리에이터 상품).
--
--   권한: service role 만(그대로). 테스트: supabase/tests/myr_refund_quote.test.sql. 재실행 가능.
-- ============================================================

-- 0080 정의 + order.shipping_fee
create or replace function public.myr_refund_request_json(r public.myr_refund_requests)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id, 'code', r.code, 'status', r.status, 'step', public.myr_refund_request_step(r),
    'kind', r.kind, 'reason', r.reason, 'qty', r.qty, 'note', r.note, 'photos', to_jsonb(r.photos),
    'options', to_jsonb(public.myr_refund_request_options(r.kind, r.reason)),
    'resolution', r.resolution, 'message', r.message, 'decided_at', r.decided_at,
    'needs_collect', r.needs_collect, 'collected_at', r.collected_at,
    'needs_reship', r.needs_reship, 'reship_courier', r.reship_courier, 'reship_tracking_no', r.reship_tracking_no, 'reshipped_at', r.reshipped_at,
    'needs_refund', r.needs_refund, 'deduction', r.deduction, 'return_fee', public.myr_refund_request_fee_due(r),
    'refund_amount', r.refund_amount, 'refunded_at', r.refunded_at, 'done_at', r.done_at, 'created_at', r.created_at,
    'amount', i.unit_price * r.qty,
    'buyer_name', o.buyer_name,
    'buyer_phone', case when length(regexp_replace(coalesce(o.buyer_phone, o.shipping ->> 'phone', ''), '\D', '', 'g')) >= 10
                        then left(regexp_replace(coalesce(o.buyer_phone, o.shipping ->> 'phone'), '\D', '', 'g'), 3) || '-****-' || right(regexp_replace(coalesce(o.buyer_phone, o.shipping ->> 'phone'), '\D', '', 'g'), 4)
                        else null end,
    'order', jsonb_build_object('id', o.id, 'code', o.code, 'status', o.status, 'paid_at', o.paid_at, 'is_member', o.user_id is not null,
                                'shipping_fee', o.shipping_fee,
                                'item', jsonb_build_object('id', i.id, 'name', i.product_name, 'option', i.option_name, 'qty', i.qty, 'unit_price', i.unit_price,
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
