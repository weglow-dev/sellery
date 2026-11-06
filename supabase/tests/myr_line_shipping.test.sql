-- pgTAP — 0077 줄 단위 배송: 권한 · 주문 배송 상태(가장 덜 진행된 줄) · 발주 대상 · 배송준비중 전환 · 고객 셀프 환불(발주 전 줄만) ·
--         운송장(주문 → 남은 줄 전부) · 줄 송장 · 배송완료 · 송장 수집 대상 · 지연 표시 · 문의 JSON 송장(줄 기준) (docs/myr.md §6.8 E1-b · E2 · E3)
begin;
select plan(48);

-- ---------- 권한 ----------
select function_privs_are('public', 'myr_app_admin_prepare_candidates', '{timestamptz}'::text[], 'anon', '{}'::text[], 'anon 은 prepare_candidates 불가');
select function_privs_are('public', 'myr_app_admin_prepare_candidates', '{timestamptz}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 prepare_candidates 불가');
select function_privs_are('public', 'myr_app_admin_mark_prepared', '{uuid[],boolean}'::text[], 'anon', '{}'::text[], 'anon 은 mark_prepared 불가');
select function_privs_are('public', 'myr_app_admin_mark_prepared', '{uuid[],boolean}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 mark_prepared 불가');
select function_privs_are('public', 'myr_app_admin_ship_line', '{uuid,text,text,boolean}'::text[], 'anon', '{}'::text[], 'anon 은 ship_line 불가');
select function_privs_are('public', 'myr_app_admin_ship_line', '{uuid,text,text,boolean}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 ship_line 불가');
select function_privs_are('public', 'myr_app_admin_ship_sync_candidates', '{}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 sync_candidates 불가');
select function_privs_are('public', 'myr_app_admin_mark_delayed', '{}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 mark_delayed 불가');
select function_privs_are('public', 'myr_app_admin_mark_prepared', '{uuid[],boolean}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 mark_prepared 가능');

-- ---------- 픽스처 ----------
insert into public.sellers (id, name, handle, platform, active)
values ('00000000-0000-4000-8000-000000000c71', '민지 루틴', '@pgtap.line1', 'instagram', true),
       ('00000000-0000-4000-8000-000000000c72', '하루 웰', '@pgtap.line2', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon, ebut_goods_code)
values ('00000000-0000-4000-8000-000000000c81', 'pgtap-line-a', '00000000-0000-4000-8000-000000000c71', 'diet', '상품 A', 10000, 100, 'listed', 'pill', 'EB-A01'),
       ('00000000-0000-4000-8000-000000000c82', 'pgtap-line-b', '00000000-0000-4000-8000-000000000c72', 'diet', '상품 B', 20000, 100, 'listed', 'pill', null);
insert into public.customers (id, name, phone) values ('00000000-0000-4000-8000-000000000c99', '고객', '01000000000');
insert into public.myr_orders (id, code, status, paid_at, customer_id, buyer_name, shipping, order_name, items_amount, payment_key)
values ('00000000-0000-4000-8000-000000000c91', 'pgtap-ln-1', 'PAID',            '2026-11-16 10:30:00+09', '00000000-0000-4000-8000-000000000c99', '홍길동', '{"recipient":"홍길동","phone":"01012345678","postcode":"06100","address1":"서울 강남구","address2":"101호","memo":"문 앞"}', 'A 외 1', 40000, 'pk1'),
       ('00000000-0000-4000-8000-000000000c92', 'pgtap-ln-2', 'PAID',            '2026-11-16 11:30:00+09', null, '김영희', '{"recipient":"김영희"}', 'A', 10000, 'pk2'),  -- 11시 뒤 결제
       ('00000000-0000-4000-8000-000000000c93', 'pgtap-ln-3', 'WAITING_DEPOSIT', null, null, '박입금', '{"recipient":"박입금"}', 'A', 10000, null);
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, refunded_qty, refund_amount, status)
values ('00000000-0000-4000-8000-000000000ca1', '00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000c81', '00000000-0000-4000-8000-000000000c71', '상품 A', '레몬', 2, 10000, 0, 0, 'PAID'),
       ('00000000-0000-4000-8000-000000000ca2', '00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000c82', '00000000-0000-4000-8000-000000000c72', '상품 B', '', 1, 20000, 0, 0, 'PAID'),
       ('00000000-0000-4000-8000-000000000ca3', '00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000c81', '00000000-0000-4000-8000-000000000c71', '상품 A', '', 1, 10000, 1, 10000, 'REFUNDED'),
       ('00000000-0000-4000-8000-000000000ca4', '00000000-0000-4000-8000-000000000c92', '00000000-0000-4000-8000-000000000c81', '00000000-0000-4000-8000-000000000c71', '상품 A', '', 1, 10000, 0, 0, 'PAID'),
       ('00000000-0000-4000-8000-000000000ca5', '00000000-0000-4000-8000-000000000c93', '00000000-0000-4000-8000-000000000c81', '00000000-0000-4000-8000-000000000c71', '상품 A', '', 1, 10000, 0, 0, 'PAID');

-- ---------- 발주 대상 ----------
create temp table c as select public.myr_app_admin_prepare_candidates('2026-11-16 11:00:00+09') as r;
select is((select jsonb_agg(e ->> 'item_id' order by e ->> 'item_id') from c, jsonb_array_elements(r) e where e ->> 'order_code' like 'pgtap-ln-%'),
  '["00000000-0000-4000-8000-000000000ca1","00000000-0000-4000-8000-000000000ca2"]'::jsonb, '발주 대상 = 11시 전 결제 · 결제완료 줄(전액 환불 줄 · 11시 뒤 결제 · 입금 대기 제외)');
select is((select jsonb_build_object('goods_code', e ->> 'goods_code', 'goods_option', e ->> 'goods_option', 'qty', (e ->> 'qty')::int, 'recipient', e #>> '{shipping,recipient}')
             from c, jsonb_array_elements(r) e where e ->> 'item_id' = '00000000-0000-4000-8000-000000000ca1'),
  '{"goods_code": "EB-A01", "goods_option": "레몬", "qty": 2, "recipient": "홍길동"}'::jsonb, '이벗 상품코드 · 옵션 · 남은 수량 · 수취인');
select is((select e ->> 'goods_code' from c, jsonb_array_elements(r) e where e ->> 'item_id' = '00000000-0000-4000-8000-000000000ca2'), 'pgtap-line-b', '이벗 상품코드가 없으면 상품 code');

-- ---------- 주문 배송 상태 ----------
select is(public.myr_order_ship_status('00000000-0000-4000-8000-000000000c91'), 'PAID', '전부 결제완료 → PAID(전액 환불 줄은 셈하지 않음)');

-- ---------- 고객 셀프 환불 — 발주 전 줄만 ----------
select ok((public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000c91', '[{"item_id":"00000000-0000-4000-8000-000000000ca1","qty":1}]', 'customer', '00000000-0000-4000-8000-000000000c99') ->> 'ok')::boolean, '결제완료 줄은 고객 셀프 환불 가능');

-- ---------- 배송준비중 전환 ----------
select is(public.myr_app_admin_mark_prepared(array['00000000-0000-4000-8000-000000000ca1'::uuid, '00000000-0000-4000-8000-000000000ca3'::uuid, '00000000-0000-4000-8000-000000000ca5'::uuid], true),
  '{"ok": true, "count": 1, "orders": ["pgtap-ln-1"]}'::jsonb, '배송준비중 — 결제완료 줄만(전액 환불 줄 · 입금 대기 주문 줄 제외)');
select ok((select ship_status = 'PREPARING' and ebut_registered_at is not null from public.myr_order_items where id = '00000000-0000-4000-8000-000000000ca1'), '이벗 등록 성공 → 배송준비중 + 등록 시각');
select is(public.myr_order_ship_status('00000000-0000-4000-8000-000000000c91'), 'PAID', '줄 하나만 배송준비중이면 주문은 가장 덜 진행된 PAID');
select is((public.myr_app_admin_mark_prepared(array['00000000-0000-4000-8000-000000000ca1'::uuid], true) ->> 'count')::int, 0, '이미 배송준비중이면 다시 바꾸지 않는다(멱등)');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000c91', '[{"item_id":"00000000-0000-4000-8000-000000000ca1","qty":1}]', 'customer', '00000000-0000-4000-8000-000000000c99') ->> 'code', 'SHIPPED', '배송준비중 줄은 고객 셀프 환불 불가 SHIPPED');
select ok((public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000c91', '[{"item_id":"00000000-0000-4000-8000-000000000ca2","qty":1}]', 'customer', '00000000-0000-4000-8000-000000000c99') ->> 'ok')::boolean, '같은 주문의 결제완료 줄은 여전히 셀프 환불 가능');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000c91', '[]', 'customer', '00000000-0000-4000-8000-000000000c99') ->> 'code', 'SHIPPED', '전체 환불은 배송준비중 줄이 있으면 SHIPPED');
select ok((public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000c91', '[{"item_id":"00000000-0000-4000-8000-000000000ca1","qty":1}]', 'seller', '00000000-0000-4000-8000-000000000c71') ->> 'ok')::boolean, '셀러는 배송준비중 줄도 환불 가능(그대로)');
select is((select jsonb_agg(e ->> 'item_id') from jsonb_array_elements(public.myr_app_admin_ship_sync_candidates()) e where e ->> 'order_id' = '00000000-0000-4000-8000-000000000c91'),
  '["00000000-0000-4000-8000-000000000ca1"]'::jsonb, '송장 수집 대상 = 이벗에 등록된 배송준비중 · 배송중 줄');
select is((public.myr_app_admin_mark_prepared(array['00000000-0000-4000-8000-000000000ca4'::uuid], false) ->> 'count')::int, 1, '운영 수동 전환(ebut=false)');
select ok((select ebut_registered_at is null from public.myr_order_items where id = '00000000-0000-4000-8000-000000000ca4'), '수동 전환은 이벗 등록 시각 없음 → 송장 수집 대상 아님');

-- ---------- 지연 ----------
select ok(public.myr_app_admin_mark_delayed() >= 2, '배송준비중 줄 지연 표시');
select ok((select is_delayed from public.myr_order_items where id = '00000000-0000-4000-8000-000000000ca1'), 'ca1 지연');

-- ---------- 줄 송장 ----------
select is(public.myr_app_admin_ship_line('00000000-0000-4000-8000-000000000ca1', null, '1234', false) ->> 'code', 'BAD_TRACKING', '운송장 형식 BAD_TRACKING');
select is(public.myr_app_admin_ship_line('00000000-0000-4000-8000-000000000ca1', '택배', '123456789012', false) ->> 'code', 'BAD_COURIER', '택배사 목록 밖 BAD_COURIER');
select is(public.myr_app_admin_ship_line('00000000-0000-4000-8000-0000000000ff', null, '123456789012', false) ->> 'code', 'NOT_FOUND', '없는 줄 NOT_FOUND');
select is(public.myr_app_admin_ship_line('00000000-0000-4000-8000-000000000ca3', null, '123456789012', false) ->> 'code', 'WRONG_STATUS', '전액 환불 줄 WRONG_STATUS');
select is(public.myr_app_admin_ship_line('00000000-0000-4000-8000-000000000ca1', null, '6123-4567-8901', false) - 'order_id' - 'item_id' - 'shipped_at',
  '{"ok": true, "newly_shipped": true, "order_code": "pgtap-ln-1", "ship_status": "SHIPPING", "courier": null, "tracking_no": "612345678901"}'::jsonb, '줄 송장 — 배송중 · 처음이면 newly_shipped');
select ok((select not is_delayed and shipped_at is not null from public.myr_order_items where id = '00000000-0000-4000-8000-000000000ca1'), '송장이 오면 지연 해제 · 발송 시각');
select is((select tracking_no from public.myr_orders where id = '00000000-0000-4000-8000-000000000c91'), '612345678901', '주문 칸이 비었으면 같이 채운다(옛 화면 · 메일)');
select is((public.myr_app_admin_ship_line('00000000-0000-4000-8000-000000000ca1', null, '612345678901', false) ->> 'newly_shipped')::boolean, false, '같은 운송장 다시 → newly_shipped false');
select is(public.myr_order_ship_status('00000000-0000-4000-8000-000000000c91'), 'PAID', '다른 줄(ca2)이 결제완료면 주문은 아직 PAID');

-- ---------- 문의 JSON — 송장 칸은 문의가 걸린 줄의 값(다른 크리에이터 박스 송장이 섞이지 않게) ----------
insert into public.myr_cs_conversations (id, product_id, seller_id, order_code, order_id, order_item_id, type)
values ('00000000-0000-4000-8000-000000000cc1', '00000000-0000-4000-8000-000000000c81', '00000000-0000-4000-8000-000000000c71', 'pgtap-ln-1', '00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000ca1', '배송 문의'),
       ('00000000-0000-4000-8000-000000000cc2', '00000000-0000-4000-8000-000000000c82', '00000000-0000-4000-8000-000000000c72', 'pgtap-ln-1', '00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000ca2', '배송 문의'),
       ('00000000-0000-4000-8000-000000000cc3', '00000000-0000-4000-8000-000000000c82', '00000000-0000-4000-8000-000000000c72', 'pgtap-ln-1', '00000000-0000-4000-8000-000000000c91', null, '기타');
select is((select public.myr_cs_conversation_json(x) #>> '{order,tracking_no}' from public.myr_cs_conversations x where x.id = '00000000-0000-4000-8000-000000000cc1'), '612345678901', '출고된 줄의 문의 → 그 줄 송장');
select is((select jsonb_build_object('tracking_no', public.myr_cs_conversation_json(x) #> '{order,tracking_no}', 'ship', public.myr_cs_conversation_json(x) #>> '{order,item,ship_status}')
             from public.myr_cs_conversations x where x.id = '00000000-0000-4000-8000-000000000cc2'),
  '{"tracking_no": null, "ship": "PAID"}'::jsonb, '같은 주문 · 아직 안 나간 다른 크리에이터 줄의 문의 → 주문 칸(먼저 나간 박스) 송장이 보이지 않는다');
select is((select (public.myr_cs_conversation_json(x) -> 'order') - 'paid_at'::text from public.myr_cs_conversations x where x.id = '00000000-0000-4000-8000-000000000cc3'),
  '{"code": "pgtap-ln-1", "item": null, "status": "PAID", "courier": null, "shipped_at": null, "tracking_no": null, "delivered_at": null}'::jsonb, '줄이 없는 문의 → 송장 칸 없음 · item null');

-- ---------- 운송장(주문 · 0069 재정의) — 남은 줄 전부 ----------
select is(public.myr_app_admin_ship('pgtap-ln-1', '한진택배', '998877665544') ->> 'already', 'false', '주문 운송장 기록');
select is((select jsonb_object_agg(id, ship_status || '/' || coalesce(tracking_no, '-')) from public.myr_order_items where order_id = '00000000-0000-4000-8000-000000000c91'),
  '{"00000000-0000-4000-8000-000000000ca1": "SHIPPING/998877665544", "00000000-0000-4000-8000-000000000ca2": "SHIPPING/998877665544", "00000000-0000-4000-8000-000000000ca3": "PAID/-"}'::jsonb,
  '남은 줄 · 예전 송장 줄 전부 같은 송장(한 박스) · 전액 환불 줄은 그대로');
select is(public.myr_order_ship_status('00000000-0000-4000-8000-000000000c91'), 'SHIPPING', '주문 배송중');
select is(public.myr_app_admin_ship('pgtap-ln-1', '한진택배', '998877665544') ->> 'already', 'true', '같은 운송장 · 남은 줄 없음 → already');
select is(public.myr_order_json(o, false) ->> 'ship_status', 'SHIPPING', '주문 JSON 에 ship_status') from public.myr_orders o where o.id = '00000000-0000-4000-8000-000000000c91';

-- ---------- 배송완료 ----------
select is(public.myr_app_admin_ship_line('00000000-0000-4000-8000-000000000ca1', null, '998877665544', true) ->> 'ship_status', 'DELIVERED', '줄 배송완료');
select ok((select delivered_at is null from public.myr_orders where id = '00000000-0000-4000-8000-000000000c91'), '줄 하나만 완료면 주문 배송완료 시각 없음');
select is(public.myr_app_admin_ship_line('00000000-0000-4000-8000-000000000ca2', null, '998877665544', true) ->> 'ship_status', 'DELIVERED', '나머지 줄도 배송완료');
select ok((select delivered_at is not null from public.myr_orders where id = '00000000-0000-4000-8000-000000000c91') and public.myr_order_ship_status('00000000-0000-4000-8000-000000000c91') = 'DELIVERED', '살아 있는 줄이 전부 배송완료 → 주문 배송완료');

select * from finish();
rollback;
