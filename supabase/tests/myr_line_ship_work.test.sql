-- pgTAP — 0112 "배송 작업 대상 줄"(myr_line_ship_work = 열린 주문 + 살아 있는 줄) 하나를 발주 후보 · 발주 처리 · 송장 입력(주문 · 줄) ·
--   배송 완료 처리 · 배송 완료 누락 · 송장 동기화 후보 · 발송 대기가 같이 쓴다. 전액 환불 줄 · 취소 줄 · 입금 대기 주문의 줄은 어디에서도 고르지 않는다.
begin;
select plan(16);

select function_privs_are('public', 'myr_line_ship_work', '{myr_orders,myr_order_items}'::text[], 'anon', '{}'::text[], 'anon 은 line_ship_work 불가');
select function_privs_are('public', 'myr_line_ship_work', '{myr_orders,myr_order_items}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 line_ship_work 불가');

insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-00000000fb11', '민지 루틴', '@pgtap.shipwork', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-00000000fb21', 'pgtap-sw-p', '00000000-0000-4000-8000-00000000fb11', 'diet', '자몽 스틱', 10000, 100, 'listed', 'pill');
-- 주문 A 일부 환불(열린 주문) · B 결제완료(열린 주문) · D 입금 대기(열린 주문 아님)
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount, payment_key, refund_amount)
values ('00000000-0000-4000-8000-00000000fb31', 'pgtap-sw-a', 'PARTIAL_REFUNDED', now() - interval '10 days', '김지은', '{"recipient":"김지은"}', '자몽', 50000, 'pk-sw-a', 10000),
       ('00000000-0000-4000-8000-00000000fb32', 'pgtap-sw-b', 'PAID', now() - interval '2 days', '김지은', '{"recipient":"김지은"}', '자몽', 20000, 'pk-sw-b', 0),
       ('00000000-0000-4000-8000-00000000fb33', 'pgtap-sw-d', 'WAITING_DEPOSIT', null, '김지은', '{"recipient":"김지은"}', '자몽', 20000, null, 0);
-- A: a1 출고 전 · a2 취소 줄 · a3 배송준비중(이벗 등록) · a4 배송중 8일째(이벗 등록) · a5 전액 환불 줄 / B: b1 출고 전 2개 / D: d1 출고 전 · d2 취소 줄
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, ship_status, refunded_qty, refund_amount, status, ebut_registered_at, courier, tracking_no, shipped_at)
values ('00000000-0000-4000-8000-00000000fb41', '00000000-0000-4000-8000-00000000fb31', '00000000-0000-4000-8000-00000000fb21', '00000000-0000-4000-8000-00000000fb11', 'a1', '', 1, 10000, 'PAID', 0, 0, 'PAID', null, null, null, null),
       ('00000000-0000-4000-8000-00000000fb42', '00000000-0000-4000-8000-00000000fb31', '00000000-0000-4000-8000-00000000fb21', '00000000-0000-4000-8000-00000000fb11', 'a2', '', 1, 10000, 'PAID', 0, 0, 'CANCELED', null, null, null, null),
       ('00000000-0000-4000-8000-00000000fb43', '00000000-0000-4000-8000-00000000fb31', '00000000-0000-4000-8000-00000000fb21', '00000000-0000-4000-8000-00000000fb11', 'a3', '', 1, 10000, 'PREPARING', 0, 0, 'PAID', now() - interval '9 days', null, null, null),
       ('00000000-0000-4000-8000-00000000fb44', '00000000-0000-4000-8000-00000000fb31', '00000000-0000-4000-8000-00000000fb21', '00000000-0000-4000-8000-00000000fb11', 'a4', '', 1, 10000, 'SHIPPING', 0, 0, 'PAID', now() - interval '9 days', 'CJ대한통운', '111122223333', now() - interval '8 days'),
       ('00000000-0000-4000-8000-00000000fb45', '00000000-0000-4000-8000-00000000fb31', '00000000-0000-4000-8000-00000000fb21', '00000000-0000-4000-8000-00000000fb11', 'a5', '', 1, 10000, 'PAID', 1, 10000, 'REFUNDED', null, null, null, null),
       ('00000000-0000-4000-8000-00000000fb46', '00000000-0000-4000-8000-00000000fb32', '00000000-0000-4000-8000-00000000fb21', '00000000-0000-4000-8000-00000000fb11', 'b1', '', 2, 10000, 'PAID', 0, 0, 'PAID', null, null, null, null),
       ('00000000-0000-4000-8000-00000000fb47', '00000000-0000-4000-8000-00000000fb33', '00000000-0000-4000-8000-00000000fb21', '00000000-0000-4000-8000-00000000fb11', 'd1', '', 1, 10000, 'PAID', 0, 0, 'PAID', null, null, null, null),
       ('00000000-0000-4000-8000-00000000fb48', '00000000-0000-4000-8000-00000000fb33', '00000000-0000-4000-8000-00000000fb21', '00000000-0000-4000-8000-00000000fb11', 'd2', '', 1, 10000, 'PAID', 0, 0, 'CANCELED', null, null, null, null);

-- 배송 작업 대상 줄 = 열린 주문 + 살아 있는 줄 — 네 조합(○○ a1 · ○× a5 · ×○ d1 · ×× d2)
select is((select jsonb_object_agg(i.product_name, public.myr_line_ship_work(o, i)) from public.myr_order_items i join public.myr_orders o on o.id = i.order_id where i.seller_id = '00000000-0000-4000-8000-00000000fb11'),
          '{"a1": true, "a2": false, "a3": true, "a4": true, "a5": false, "b1": true, "d1": false, "d2": false}'::jsonb,
          '배송 작업 대상 줄 — 열린 주문의 살아 있는 줄만(취소 줄 · 전액 환불 줄 · 입금 대기 주문 ×)');
select is((select count(*)::int from public.myr_order_items i join public.myr_orders o on o.id = i.order_id
            where i.seller_id = '00000000-0000-4000-8000-00000000fb11'
              and public.myr_line_ship_work(o, i) is distinct from (public.myr_order_status_open(o.status) and public.myr_line_live(i))), 0,
          '두 함수를 and 로 묶은 것과 모든 줄에서 같다(계산 결과 불변)');

-- 발주 후보 = 출고 전 대상 줄(a1 · b1) · 수량은 남은 수량
select is((select jsonb_object_agg(e ->> 'goods_name', (e ->> 'qty')::int) from jsonb_array_elements(public.myr_app_admin_prepare_candidates(now())) e where e ->> 'seller_id' = '00000000-0000-4000-8000-00000000fb11'),
          '{"a1": 1, "b1": 2}'::jsonb, '발주 후보 a1 · b1 — 취소 줄 · 전액 환불 줄 · 입금 대기 줄 제외');
-- 송장 동기화 후보 = 이벗 등록된 배송준비중 · 배송중 대상 줄(a3 · a4)
select is((select jsonb_agg(e ->> 'item_id' order by e ->> 'item_id') from jsonb_array_elements(public.myr_app_admin_ship_sync_candidates()) e where e ->> 'order_id' = '00000000-0000-4000-8000-00000000fb31'),
          '["00000000-0000-4000-8000-00000000fb43", "00000000-0000-4000-8000-00000000fb44"]'::jsonb, '송장 동기화 후보 a3 · a4');
-- 배송 완료 누락 = 5일 넘게 배송중인 대상 줄(a4)
select is((select jsonb_agg(e ->> 'item_id') from jsonb_array_elements(public.myr_app_admin_undelivered(5)) e where e ->> 'seller' = '@pgtap.shipwork'),
          '["00000000-0000-4000-8000-00000000fb44"]'::jsonb, '배송 완료 누락 a4');
-- 발송 대기 = 출고 전 대상 줄이 있는 열린 주문(A · B) · 줄 수 · 배송준비중 수는 대상 줄만(A: a1 · a3 · a4 / 배송준비중 a3)
select is((select jsonb_object_agg(e ->> 'code', jsonb_build_array((e ->> 'lines')::int, (e ->> 'preparing')::int)) from jsonb_array_elements(public.myr_app_admin_ship_pending(1000, false)) e where e ->> 'code' like 'pgtap-sw-%'),
          '{"pgtap-sw-a": [3, 1], "pgtap-sw-b": [1, 0]}'::jsonb, '발송 대기 A · B(D 제외) · 줄 수 · 배송준비중 수는 대상 줄만');

-- 발주 처리 — 대상 줄(a1)만 배송준비중
select is(public.myr_app_admin_mark_prepared(array['00000000-0000-4000-8000-00000000fb41', '00000000-0000-4000-8000-00000000fb42', '00000000-0000-4000-8000-00000000fb45', '00000000-0000-4000-8000-00000000fb47']::uuid[]) -> 'count',
          '1'::jsonb, '발주 처리 a1 만(a2 · a5 · d1 제외)');

-- 송장 입력(줄) — 대상 줄이 아니면 WRONG_STATUS
select is(public.myr_app_admin_ship_line('00000000-0000-4000-8000-00000000fb47', 'CJ대한통운', '999988887777') ->> 'code', 'WRONG_STATUS', '송장 입력(줄) d1 — 입금 대기 주문 WRONG_STATUS');
select is(public.myr_app_admin_ship_line('00000000-0000-4000-8000-00000000fb45', 'CJ대한통운', '999988887777') ->> 'code', 'WRONG_STATUS', '송장 입력(줄) a5 — 전액 환불 줄 WRONG_STATUS');

-- 송장 입력(주문) — 열린 주문이 아니면 WRONG_STATUS · 열린 주문은 대상 줄만 배송중
select is(public.myr_app_admin_ship('pgtap-sw-d', 'CJ대한통운', '999988887777') ->> 'code', 'WRONG_STATUS', '송장 입력(주문) D — WRONG_STATUS');
select is(public.myr_app_admin_ship('pgtap-sw-a', 'CJ대한통운', '999988887777') ->> 'ok', 'true', '송장 입력(주문) A');
select is((select jsonb_object_agg(i.product_name, i.ship_status) from public.myr_order_items i where i.order_id = '00000000-0000-4000-8000-00000000fb31'),
          '{"a1": "SHIPPING", "a2": "PAID", "a3": "SHIPPING", "a4": "SHIPPING", "a5": "PAID"}'::jsonb, '송장 입력(주문) — 대상 줄 a1 · a3 배송중 · 취소 줄 · 전액 환불 줄 그대로');

-- 배송 완료 처리 — 배송중인 대상 줄(a1 · a3 · a4)만
select is(public.myr_app_admin_deliver('pgtap-sw-a') -> 'delivered', '3'::jsonb, '배송 완료 처리 A — 대상 줄 3개');
select is((select jsonb_object_agg(i.product_name, i.ship_status) from public.myr_order_items i where i.order_id = '00000000-0000-4000-8000-00000000fb31'),
          '{"a1": "DELIVERED", "a2": "PAID", "a3": "DELIVERED", "a4": "DELIVERED", "a5": "PAID"}'::jsonb, '배송 완료 처리 — 취소 줄 · 전액 환불 줄 그대로');

select * from finish();
rollback;
