-- pgTAP — 0108 주문 전체 환불 · 주문 상태 · 줄 상태를 남은 수량 하나로: myr_order_left_qty · myr_order_refund_full · myr_order_refund_status · myr_line_refund_status.
--   precheck 의 "주문이 끝나는지"(배송비 · 토스 전액 취소)와 record 의 주문 상태가 같은 기준 — 계산 결과는 0105 와 같다.
begin;
select plan(17);

select function_privs_are('public', 'myr_order_left_qty', '{myr_orders}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 order_left_qty 불가');
select function_privs_are('public', 'myr_order_refund_full', '{myr_orders,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 order_refund_full 불가');
select function_privs_are('public', 'myr_order_refund_status', '{myr_orders}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 order_refund_status 불가');
select function_privs_are('public', 'myr_line_refund_status', '{myr_order_items,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 line_refund_status 불가');

-- 픽스처: 주문 하나 · 줄 셋(A 2개 · B 1개 이미 환불 · C 3개 취소) · 배송비 3,000
insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-00000000f811', '셀러', '@pgtap.full', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status)
values ('00000000-0000-4000-8000-00000000f821', 'pgtap-full-a', '00000000-0000-4000-8000-00000000f811', 'diet', '상품 A', 10000, 9, 'listed');
insert into public.myr_orders (id, code, user_id, customer_id, status, buyer_name, shipping, order_name, items_amount, shipping_fee, payment_key, payment_method, paid_at, refund_amount)
values ('00000000-0000-4000-8000-00000000f831', 'pgtap-full-1', null, null, 'PARTIAL_REFUNDED', '홍길동', '{}', '상품 A 외 2건', 60000, 3000, 'pk_full1', '카드', now(), 10000);
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, qty, unit_price, refunded_qty, refund_amount, status)
values ('00000000-0000-4000-8000-00000000f841', '00000000-0000-4000-8000-00000000f831', '00000000-0000-4000-8000-00000000f821', '00000000-0000-4000-8000-00000000f811', '상품 A', 2, 10000, 0, 0, 'PAID'),
       ('00000000-0000-4000-8000-00000000f842', '00000000-0000-4000-8000-00000000f831', '00000000-0000-4000-8000-00000000f821', '00000000-0000-4000-8000-00000000f811', '상품 B', 1, 10000, 1, 10000, 'REFUNDED'),
       ('00000000-0000-4000-8000-00000000f843', '00000000-0000-4000-8000-00000000f831', '00000000-0000-4000-8000-00000000f821', '00000000-0000-4000-8000-00000000f811', '상품 C', 3, 10000, 0, 0, 'CANCELED');

-- 남은 수량 — 살아 있는 줄만(B 는 다 환불 · C 는 취소) → A 2개
select is((select public.myr_order_left_qty(o) from public.myr_orders o where o.code = 'pgtap-full-1'), 2, '주문에 남은 수량 = 살아 있는 줄의 남은 수량 합(환불 끝난 줄 · 취소 줄 제외)');
select is((select public.myr_order_refund_full(o, 1) from public.myr_orders o where o.code = 'pgtap-full-1'), false, '1개 환불은 주문을 끝내지 않는다');
select is((select public.myr_order_refund_full(o, 2) from public.myr_orders o where o.code = 'pgtap-full-1'), true, '남은 2개를 다 환불하면 주문이 끝난다');
select is((select public.myr_order_refund_status(o) from public.myr_orders o where o.code = 'pgtap-full-1'), 'PARTIAL_REFUNDED', '남은 수량이 있으면 PARTIAL_REFUNDED');

-- 줄 상태 — 이번 환불 뒤 남은 수량이 0 이하면 REFUNDED
select is((select jsonb_agg(public.myr_line_refund_status(i, q) order by q) from public.myr_order_items i, unnest(array[0, 1, 2, 3]) q where i.id = '00000000-0000-4000-8000-00000000f841'),
          '["PARTIAL_REFUNDED", "PARTIAL_REFUNDED", "REFUNDED", "REFUNDED"]'::jsonb, '줄 상태 — 2개 중 0 · 1개면 일부 · 2개 이상이면 끝');
select is((select public.myr_line_refund_status(i, 0) from public.myr_order_items i where i.id = '00000000-0000-4000-8000-00000000f842'), 'REFUNDED', '이미 다 환불한 줄은 REFUNDED');

-- 처음부터 끝까지 — precheck 의 full · 배송비와 record 의 줄 · 주문 상태가 같은 기준
select is((select jsonb_build_object('full', (j ->> 'full')::boolean, 'shipping_back', (j ->> 'shipping_back')::int)
             from (select public.myr_app_refund_precheck('00000000-0000-4000-8000-00000000f831', '[{"item_id":"00000000-0000-4000-8000-00000000f841","qty":1}]', 'admin', null) as j) s),
          '{"full": false, "shipping_back": 0}'::jsonb, 'A 1개 — 주문이 안 끝나 배송비 없음');
select is(public.myr_app_refund_record('00000000-0000-4000-8000-00000000f831', '[{"item_id":"00000000-0000-4000-8000-00000000f841","qty":1}]', 'admin', null, '테스트', 10000) ->> 'status',
          'PARTIAL_REFUNDED', 'A 1개 기록 → 주문 PARTIAL_REFUNDED');
select is((select status from public.myr_order_items where id = '00000000-0000-4000-8000-00000000f841'), 'PARTIAL_REFUNDED', 'A 줄 PARTIAL_REFUNDED(1개 남음)');
select is((select jsonb_build_object('full', (j ->> 'full')::boolean, 'shipping_back', (j ->> 'shipping_back')::int)
             from (select public.myr_app_refund_precheck('00000000-0000-4000-8000-00000000f831', '[{"item_id":"00000000-0000-4000-8000-00000000f841","qty":1}]', 'admin', null) as j) s),
          '{"full": true, "shipping_back": 3000}'::jsonb, 'A 마지막 1개 — 주문이 끝나 배송비 3,000 함께');
select is((public.myr_app_refund_record('00000000-0000-4000-8000-00000000f831', '[{"item_id":"00000000-0000-4000-8000-00000000f841","qty":1}]', 'admin', null, '테스트', 13000) - 'order_code' - 'amount'),
          '{"ok": true, "already": false, "status": "REFUNDED", "mismatch": false}'::jsonb, 'A 마지막 1개 기록 → 주문 REFUNDED · 금액 어긋남 없음(배송비 포함 13,000)');
select is((select status from public.myr_order_items where id = '00000000-0000-4000-8000-00000000f841'), 'REFUNDED', 'A 줄 REFUNDED');
select is((select public.myr_order_left_qty(o) from public.myr_orders o where o.code = 'pgtap-full-1'), 0, '남은 수량 0');

select * from finish();
rollback;
