-- pgTAP — 0095 구매 수량 상한 없음: 장바구니 · 견적 · 체크아웃이 9개를 넘어도 받고, 한도는 재고 · 합계가 20억을 넘으면 오류 대신 AMOUNT_TOO_LARGE
begin;
select plan(15);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000a701', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-qty@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-00000000a711', '민지 루틴', '@pgtap.qty', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-00000000a721', 'pgtap-qty-a', '00000000-0000-4000-8000-00000000a711', 'diet', '레몬 스틱', 36000, 100, 'listed', 'pill'),
       ('00000000-0000-4000-8000-00000000a722', 'pgtap-qty-big', '00000000-0000-4000-8000-00000000a711', 'diet', '비싼 상품', 10000000, 1000, 'listed', 'pill');
-- 옵션 상품(재고 10 · 상품 하나에 걸림) — 0097
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon, options)
values ('00000000-0000-4000-8000-00000000a723', 'pgtap-qty-opt', '00000000-0000-4000-8000-00000000a711', 'diet', '옵션 상품', 10000, 10, 'listed', 'pill', '[{"n":"A","price":"10000"},{"n":"B","price":"12000"}]'),
       ('00000000-0000-4000-8000-00000000a724', 'pgtap-qty-c', '00000000-0000-4000-8000-00000000a711', 'diet', '주문용 상품', 36000, 1000, 'listed', 'pill', '[]');
-- 150개 산 주문(배송준비중 줄 · 결제완료 줄) — 0097 요청 · 바로 환불 수량
insert into public.myr_orders (id, code, status, paid_at, user_id, buyer_name, shipping, order_name, items_amount, payment_key)
values ('00000000-0000-4000-8000-00000000a731', 'pgtap-qty-o1', 'PAID', now(), '00000000-0000-4000-8000-00000000a701', '김지은', '{}', '레몬 외', 10800000, 'pk-qty');
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, ship_status)
values ('00000000-0000-4000-8000-00000000a741', '00000000-0000-4000-8000-00000000a731', '00000000-0000-4000-8000-00000000a724', '00000000-0000-4000-8000-00000000a711', '레몬', '', 150, 36000, 'PREPARING'),
       ('00000000-0000-4000-8000-00000000a742', '00000000-0000-4000-8000-00000000a731', '00000000-0000-4000-8000-00000000a724', '00000000-0000-4000-8000-00000000a711', '레몬', '', 150, 36000, 'PAID');
create temp table args as select '{"name":"김지은"}'::jsonb as buyer, '{"recipient":"김지은","address1":"서울"}'::jsonb as ship;

-- 장바구니
select is(public.myr_cart_set('00000000-0000-4000-8000-00000000a701', 'pgtap-qty-a', 0, 50) ->> 'qty', '50', '장바구니 50개 — 9개 상한 없음');
select is(public.myr_cart_set('00000000-0000-4000-8000-00000000a701', 'pgtap-qty-a', 0, 30, true) ->> 'qty', '80', '더하기도 그대로(50 + 30)');

-- 견적
select is(public.myr_app_cart_quote('[{"code":"pgtap-qty-a","qty":80}]') ->> 'items_amount', '2880000', '견적 80개 = 288만 원');
select is(public.myr_app_cart_quote('[{"code":"pgtap-qty-big","qty":300}]') ->> 'items_amount', '3000000000', '견적은 30억도 오류 없이 센다(bigint)');

-- 체크아웃
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-00000000a701', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-qty-a","qty":80}]', 'myr_t_qty_0001') ->> 'ok', 'true', '체크아웃 80개 — 재고(100) 안이면 된다');
select is((select ci.qty from public.myr_checkout_items ci join public.myr_checkouts c on c.id = ci.checkout_id where c.toss_order_id = 'myr_t_qty_0001'), 80, '결제 줄 수량 80');
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-00000000a701', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-qty-a","qty":150}]', 'myr_t_qty_0002') #>> '{items,0,reason}', 'SOLD_OUT', '재고(100)보다 많으면 SOLD_OUT — 한도는 재고');
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-00000000a701', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-qty-big","qty":201}]', 'myr_t_qty_0003') ->> 'code', 'AMOUNT_TOO_LARGE', '합계 20억 1천만 → AMOUNT_TOO_LARGE(DB 오류 아님)');
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-00000000a701', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-qty-big","qty":200}]', 'myr_t_qty_0004') ->> 'ok', 'true', '합계 20억 → 된다');

-- 0097 — 옵션을 합쳐 재고 확인(재고 10): A 6 + B 6 = 12 → 결제 생성에서 SOLD_OUT(전에는 통과 → 승인 때 품절 · 자동 취소)
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-00000000a701', null, (select buyer from args), (select ship from args),
          '[{"code":"pgtap-qty-opt","option_index":0,"qty":6},{"code":"pgtap-qty-opt","option_index":1,"qty":6}]', 'myr_t_qty_0005') #> '{items,0}',
          '{"code": "pgtap-qty-opt", "left": 4, "reason": "SOLD_OUT"}'::jsonb, '옵션 A 6 + B 6(재고 10) → SOLD_OUT · 남은 4(앞 옵션이 6 씀)');
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-00000000a701', null, (select buyer from args), (select ship from args),
          '[{"code":"pgtap-qty-opt","option_index":0,"qty":6},{"code":"pgtap-qty-opt","option_index":1,"qty":4}]', 'myr_t_qty_0006') ->> 'ok', 'true', '옵션 A 6 + B 4 = 10(재고 10) → 된다');

-- 0097 — 150개 요청 · 바로 환불
select is(public.myr_app_claim_open('00000000-0000-4000-8000-00000000a731', '00000000-0000-4000-8000-00000000a701', 'refund', '단순 변심', '[{"item_id":"00000000-0000-4000-8000-00000000a741","qty":150}]') ->> 'ok', 'true', '150개 교환·환불 요청 → 접수(전에는 99 · 표 제약 9)');
select is((select qty from public.myr_refund_requests where order_item_id = '00000000-0000-4000-8000-00000000a741'), 150, '요청 수량 150 저장');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-00000000a731', '[{"item_id":"00000000-0000-4000-8000-00000000a742","qty":150}]', 'system', null) ->> 'amount', '5400000', '바로 환불 150개 precheck → 540만 원(전에는 999 · 형식 검사)');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-00000000a731', '[{"item_id":"00000000-0000-4000-8000-00000000a742","qty":151}]', 'system', null) #>> '{items,0,reason}', 'TOO_MANY', '남은 수량(150) 초과 → TOO_MANY(실제 한도)');

select * from finish();
rollback;
