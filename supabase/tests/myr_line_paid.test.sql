-- pgTAP — 0110 "결제된 줄"(myr_line_paid) 하나를 실적 · 정산 대상 · 배송 전 판매 · 이벗 발주 후보가 같이 쓴다.
--   결제된 주문 안의 취소 줄은 어디에서도 세지 않는다(전에는 실적만 셌다).
begin;
select plan(8);

select function_privs_are('public', 'myr_line_paid', '{myr_orders,myr_order_items}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 line_paid 불가');

insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-00000000fa11', '민지 루틴', '@pgtap.paid', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-00000000fa21', 'pgtap-paid-a', '00000000-0000-4000-8000-00000000fa11', 'diet', '레몬 스틱', 10000, 100, 'listed', 'pill');
-- 주문: 결제완료(줄 셋 — 배송 완료 · 결제된 주문 안의 취소 줄 · 출고 전) · 입금 대기 · 전액 환불
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount, payment_key, refund_amount)
values ('00000000-0000-4000-8000-00000000fa31', 'pgtap-paid-1', 'PAID', now() - interval '3 days', '김지은', '{}', '레몬', 30000, 'pk-paid-1', 0),
       ('00000000-0000-4000-8000-00000000fa32', 'pgtap-paid-2', 'WAITING_DEPOSIT', null, '김지은', '{}', '레몬', 10000, null, 0),
       ('00000000-0000-4000-8000-00000000fa33', 'pgtap-paid-3', 'REFUNDED', now() - interval '3 days', '김지은', '{}', '레몬', 10000, 'pk-paid-3', 10000);
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, ship_status, refunded_qty, refund_amount, status, delivered_at)
values ('00000000-0000-4000-8000-00000000fa41', '00000000-0000-4000-8000-00000000fa31', '00000000-0000-4000-8000-00000000fa21', '00000000-0000-4000-8000-00000000fa11', '레몬 1', '', 1, 10000, 'DELIVERED', 0, 0, 'PAID', now() - interval '1 day'),
       ('00000000-0000-4000-8000-00000000fa42', '00000000-0000-4000-8000-00000000fa31', '00000000-0000-4000-8000-00000000fa21', '00000000-0000-4000-8000-00000000fa11', '레몬 2', '', 1, 10000, 'PAID', 0, 0, 'CANCELED', null),
       ('00000000-0000-4000-8000-00000000fa43', '00000000-0000-4000-8000-00000000fa31', '00000000-0000-4000-8000-00000000fa21', '00000000-0000-4000-8000-00000000fa11', '레몬 3', '', 1, 10000, 'PAID', 0, 0, 'PAID', null),
       ('00000000-0000-4000-8000-00000000fa44', '00000000-0000-4000-8000-00000000fa32', '00000000-0000-4000-8000-00000000fa21', '00000000-0000-4000-8000-00000000fa11', '레몬 4', '', 1, 10000, 'PAID', 0, 0, 'PAID', null),
       ('00000000-0000-4000-8000-00000000fa45', '00000000-0000-4000-8000-00000000fa33', '00000000-0000-4000-8000-00000000fa21', '00000000-0000-4000-8000-00000000fa11', '레몬 5', '', 1, 10000, 'DELIVERED', 1, 10000, 'REFUNDED', now() - interval '1 day');

-- 결제된 줄 = 결제 끝남(paid_at · 결제 상태) · 취소 아님
select is((select jsonb_object_agg(i.product_name, public.myr_line_paid(o, i)) from public.myr_order_items i join public.myr_orders o on o.id = i.order_id where i.seller_id = '00000000-0000-4000-8000-00000000fa11'),
          '{"레몬 1": true, "레몬 2": false, "레몬 3": true, "레몬 4": false, "레몬 5": true}'::jsonb,
          '결제된 줄 — 결제완료 줄 · 전액 환불 줄 ○ / 결제된 주문 안의 취소 줄 · 입금 대기 줄 ×');

-- 실적 = 결제된 줄 전부(1 · 3 · 5) — 취소 줄 2 는 세지 않는다(0110 전에는 셌다)
select is((select count(*)::int from public.myr_sales_lines() where seller_id = '00000000-0000-4000-8000-00000000fa11'), 3, '실적 줄 3개(취소 줄 제외)');
-- 정산 대상 = 결제된 줄 중 배송 완료(1 · 5) — 실적 줄 중 배송 완료와 같다
select is((select count(*)::int from public.myr_settlement_candidates(now(), '00000000-0000-4000-8000-00000000fa11') where kind = 'sale'), 2, '정산 대상 판매 줄 2개(배송 완료)');
select is((select jsonb_agg(c.order_item_id order by c.order_item_id) from public.myr_settlement_candidates(now(), '00000000-0000-4000-8000-00000000fa11') c where c.kind = 'sale'),
          '["00000000-0000-4000-8000-00000000fa41", "00000000-0000-4000-8000-00000000fa45"]'::jsonb, '정산 대상 = 결제된 줄(1 · 5) 중 배송 완료 — 취소 줄 2 · 배송 전 3 · 입금 대기 4 제외');
-- 배송 전 판매(미리보기) = 결제된 줄 중 남은 수량 · 배송 전(3)
select is((public.myr_settlement_preview('00000000-0000-4000-8000-00000000fa11') #>> '{undelivered,lines}')::int, 1, '배송 전 판매 1줄(취소 줄 · 입금 대기 줄 제외)');
-- 이벗 발주 후보 = 결제된 줄 중 남은 수량 · 출고 전(3)
select is((select jsonb_agg(e ->> 'item_id' order by e ->> 'item_id') from jsonb_array_elements(public.myr_app_admin_prepare_candidates(now())) e
            where e ->> 'order_id' in ('00000000-0000-4000-8000-00000000fa31', '00000000-0000-4000-8000-00000000fa32')),
          '["00000000-0000-4000-8000-00000000fa43"]'::jsonb, '발주 후보는 결제된 출고 전 줄만(취소 줄 · 입금 대기 줄 제외)');
-- 정산 탭 상품 목록 근거 — 결제된 줄이 있는 상품
select ok(exists (select 1 from public.myr_order_items i join public.myr_orders o on o.id = i.order_id where i.product_id = '00000000-0000-4000-8000-00000000fa21' and public.myr_line_paid(o, i)),
          '상품에 결제된 줄이 있다(정산 탭 상품 목록과 같은 조건)');

select * from finish();
rollback;
