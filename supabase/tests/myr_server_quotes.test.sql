-- pgTAP — 0092 화면이 서버 판정을 다시 계산하지 않게: 배송비 설정 · 줄 단가(공구) · 장바구니 견적 · 정산금 · 공구 미리보기 · 줄 환불 길.
--   견적(화면)과 실제 처리(체크아웃 · 정산 · 환불 가드)가 같은 함수를 부르는지, 설정을 바꾸면 둘 다 따라가는지 고정한다.
begin;
select plan(50);

-- ---------- 권한 ----------
select function_privs_are('public', 'myr_app_cart_quote', '{jsonb}'::text[], 'anon', '{}'::text[], 'anon 은 cart_quote 불가');
select function_privs_are('public', 'myr_app_cart_quote', '{jsonb}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 cart_quote 불가');
select function_privs_are('public', 'myr_app_cart_quote', '{jsonb}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 cart_quote 가능');
select function_privs_are('public', 'myr_app_settlement_unit', '{integer}'::text[], 'anon', '{}'::text[], 'anon 은 settlement_unit 불가');
select function_privs_are('public', 'myr_app_settlement_unit', '{integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 settlement_unit 불가');
select function_privs_are('public', 'myr_app_groupbuy_preview', '{uuid,uuid,integer}'::text[], 'anon', '{}'::text[], 'anon 은 groupbuy_preview 불가');
select function_privs_are('public', 'myr_app_groupbuy_preview', '{uuid,uuid,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 groupbuy_preview 불가');
select function_privs_are('public', 'myr_shipping_rule', '{}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 shipping_rule 불가');
select function_privs_are('public', 'myr_line_price', '{myr_products,integer,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 line_price 불가');
select function_privs_are('public', 'myr_line_refund_path', '{myr_orders,myr_order_items}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 line_refund_path 불가');

-- ---------- 픽스처 ----------
insert into public.sellers (id, name, handle, platform, active)
values ('00000000-0000-4000-8000-00000000d011', '민지 루틴', '@pgtap.sq', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon, options)
values ('00000000-0000-4000-8000-00000000d021', 'pgtap-sq-lemon', '00000000-0000-4000-8000-00000000d011', 'diet', '레몬 스틱', 36000, 50, 'listed', 'pill', '[]'::jsonb),
       ('00000000-0000-4000-8000-00000000d022', 'pgtap-sq-opt', '00000000-0000-4000-8000-00000000d011', 'diet', '옵션 젤리', 20000, 50, 'listed', 'pill',
        '[{"n":"1개","price":"20000"},{"n":"2개 세트","price":"38000"}]'::jsonb),
       ('00000000-0000-4000-8000-00000000d023', 'pgtap-sq-draft', '00000000-0000-4000-8000-00000000d011', 'diet', '심사 중', 10000, 50, 'pending', 'pill', '[]'::jsonb);
insert into public.myr_groupbuys (id, code, product_id, seller_id, discount_pct, starts_at, ends_at, closed_at)
values ('00000000-0000-4000-8000-00000000d031', 'sqactive1', '00000000-0000-4000-8000-00000000d021', '00000000-0000-4000-8000-00000000d011', 20, now() - interval '1 day', now() + interval '1 day', null),
       ('00000000-0000-4000-8000-00000000d032', 'sqsched01', '00000000-0000-4000-8000-00000000d021', '00000000-0000-4000-8000-00000000d011', 30, now() + interval '1 day', now() + interval '2 days', null),
       ('00000000-0000-4000-8000-00000000d033', 'sqended01', '00000000-0000-4000-8000-00000000d021', '00000000-0000-4000-8000-00000000d011', 40, now() - interval '3 days', now() + interval '1 day', now() - interval '1 hour'),
       ('00000000-0000-4000-8000-00000000d034', 'sqother01', '00000000-0000-4000-8000-00000000d022', '00000000-0000-4000-8000-00000000d011', 50, now() - interval '1 day', now() + interval '1 day', null);

-- ---------- 배송비 — 설정 한 곳 ----------
select is(public.myr_shipping_rule(), '{"free_over": 50000, "fee": 3000}'::jsonb, '배송비 설정 기본값');
select is(array[public.myr_shipping_fee(0), public.myr_shipping_fee(49999), public.myr_shipping_fee(50000)], array[0, 3000, 0], '배송비 — 0원 · 기준 미만 · 기준 이상(0058 과 같은 결과)');

-- ---------- 줄 단가(공구) ----------
select is((select public.myr_line_price(p, 0, null) from public.myr_products p where p.code = 'pgtap-sq-lemon') ->> 'unit_price', '36000', '공구 없음 → 기본가');
select is((select public.myr_line_price(p, 0, 'sqactive1') from public.myr_products p where p.code = 'pgtap-sq-lemon') - 'groupbuy_id',
  '{"base_price": 36000, "unit_price": 28800, "groupbuy_code": "sqactive1", "groupbuy_state": "active"}'::jsonb, '진행 중 공구 → 공구가 28,800(20%)');
select ok((select public.myr_line_price(p, 0, 'sqactive1') from public.myr_products p where p.code = 'pgtap-sq-lemon') ->> 'groupbuy_id' = '00000000-0000-4000-8000-00000000d031', '진행 중이면 groupbuy_id');
select is((select public.myr_line_price(p, 0, 'sqsched01') from public.myr_products p where p.code = 'pgtap-sq-lemon') - 'groupbuy_id',
  '{"base_price": 36000, "unit_price": 36000, "groupbuy_code": "sqsched01", "groupbuy_state": "scheduled"}'::jsonb, '예정 공구 → 기본가 · 상태 scheduled');
select is((select public.myr_line_price(p, 0, 'sqended01') from public.myr_products p where p.code = 'pgtap-sq-lemon') ->> 'unit_price', '36000', '[지금 종료]한 공구 → 기본가');
select is((select public.myr_line_price(p, 0, 'sqother01') from public.myr_products p where p.code = 'pgtap-sq-lemon') ->> 'groupbuy_state', null, '다른 상품의 공구 코드 → 무시');
select is((select public.myr_line_price(p, 1, null) from public.myr_products p where p.code = 'pgtap-sq-opt') ->> 'unit_price', '38000', '옵션 단가');
select is((select public.myr_line_price(p, 5, null) from public.myr_products p where p.code = 'pgtap-sq-opt') ->> 'unit_price', null, '없는 옵션 → null');

-- ---------- 장바구니 견적 ----------
select is(public.myr_app_cart_quote('[{"code":"pgtap-sq-lemon","qty":1,"gb":"sqactive1"}]') - 'lines',
  '{"ok": true, "items_amount": 28800, "shipping_fee": 3000, "free_over": 50000, "free_shipping_left": 21200}'::jsonb, '공구 1개 → 28,800 + 배송비 3,000 · 무료배송까지 21,200');
select is(public.myr_app_cart_quote('[{"code":"pgtap-sq-lemon","qty":2}]') - 'lines',
  '{"ok": true, "items_amount": 72000, "shipping_fee": 0, "free_over": 50000, "free_shipping_left": 0}'::jsonb, '기본가 2개 → 72,000 · 무료배송');
select is(public.myr_app_cart_quote('[{"code":"pgtap-sq-lemon","qty":1},{"code":"pgtap-sq-draft","qty":1},{"code":"no-such","qty":1}]') ->> 'items_amount', '36000', '샵에 없는 상품 · 심사 중 상품은 합계에서 뺀다');
select is(public.myr_app_cart_quote('[{"code":"pgtap-sq-draft","qty":1}]') -> 'lines' -> 0 ->> 'unit_price', null, '살 수 없는 줄 → unit_price null');
select is(public.myr_app_cart_quote('[{"code":"pgtap-sq-lemon","qty":1,"gb":"sqsched01"}]') -> 'lines' -> 0 ->> 'groupbuy_state', 'scheduled', '줄에 공구 상태');
select is(public.myr_app_cart_quote('[]') - 'lines', '{"ok": true, "items_amount": 0, "shipping_fee": 0, "free_over": 50000, "free_shipping_left": 0}'::jsonb, '빈 장바구니 → 0원 · 배송비 0');
select is(public.myr_app_cart_quote('[{"code":"pgtap-sq-lemon","qty":0}]') ->> 'code', 'BAD_LINES', '수량 0 → BAD_LINES');
select is(public.myr_app_cart_quote('"x"') ->> 'code', 'BAD_LINES', '배열 아님 → BAD_LINES');

-- 견적 = 체크아웃(같은 줄이면 같은 금액)
create temp table co as select public.myr_app_create_checkout(null, null, '{"name":"김지은"}', '{"recipient":"김지은","address1":"서울"}',
  '[{"code":"pgtap-sq-lemon","qty":1,"gb":"sqactive1"},{"code":"pgtap-sq-opt","option_index":1,"qty":1}]', 'pgtapsq0001', null) as r;
select is((select jsonb_build_object('items', (r #>> '{checkout,items_amount}')::int, 'fee', (r #>> '{checkout,shipping_fee}')::int) from co),
  (select jsonb_build_object('items', (q ->> 'items_amount')::int, 'fee', (q ->> 'shipping_fee')::int)
     from (select public.myr_app_cart_quote('[{"code":"pgtap-sq-lemon","qty":1,"gb":"sqactive1"},{"code":"pgtap-sq-opt","option_index":1,"qty":1}]') as q) x),
  '견적 = 체크아웃 상품 합계 · 배송비');
select is((select ci.unit_price from public.myr_checkout_items ci join public.myr_checkouts c on c.id = ci.checkout_id where c.toss_order_id = 'pgtapsq0001' and ci.product_name = '레몬 스틱'),
  28800, '체크아웃 줄 단가 = 견적 공구가');

-- 설정을 바꾸면 견적 · 체크아웃 · 배송비가 같이 따라간다
update public.platform_settings set value = '{"free_over": 30000, "fee": 2500}'::jsonb where key = 'myr_shipping';
select is(public.myr_app_cart_quote('[{"code":"pgtap-sq-lemon","qty":1,"gb":"sqactive1"}]') - 'lines',
  '{"ok": true, "items_amount": 28800, "shipping_fee": 2500, "free_over": 30000, "free_shipping_left": 1200}'::jsonb, '설정 변경 → 견적이 새 배송비 · 기준');
select is(public.myr_shipping_fee(28800), 2500, '설정 변경 → 체크아웃 배송비도 같은 값');

-- ---------- 정산금 ----------
select is(array[public.myr_settlement_amount(0, 60), public.myr_settlement_amount(-5000, 60), public.myr_settlement_amount(36000, 60), public.myr_settlement_amount(33333, 60)],
  array[0, 0, 21600, 19999], '정산금 — 0 · 음수 0 · 36,000 → 21,600 · 33,333 → 19,999(버림)');
select is(public.myr_app_settlement_unit(33333), '{"pct": 60, "amount": 19999}'::jsonb, '콘솔 미리보기 = 회차와 같은 식(버림)');
select is(public.myr_app_settlement_unit(0), '{"pct": 60, "amount": 0}'::jsonb, '가격 없음 → 0');
select is((select settle from public.myr_settlement_product_calc('00000000-0000-4000-8000-00000000d021', 33333, 0)), 19999, '정산 계산(product_calc)도 같은 함수 → 19,999');
update public.platform_settings set value = jsonb_set(value, '{pct}', '55') where key = 'myr_settlement';
select is(public.myr_app_settlement_unit(36000), '{"pct": 55, "amount": 19800}'::jsonb, '비율 설정 변경 → 콘솔 미리보기도 따라간다');
select is((select pct from public.myr_settlement_product_calc('00000000-0000-4000-8000-00000000d021', 36000, 0)), 55, '정산 계산 비율도 같은 설정');

-- ---------- 공구 미리보기 ----------
select is(public.myr_app_groupbuy_preview('00000000-0000-4000-8000-00000000d011', '00000000-0000-4000-8000-00000000d021', 20), '{"ok": true, "base_price": 36000, "price": 28800}'::jsonb, '미리보기 = myr_groupbuy_price(대표가 상품)');
select is(public.myr_app_groupbuy_preview('00000000-0000-4000-8000-00000000d011', '00000000-0000-4000-8000-00000000d022', 15),
  (select jsonb_build_object('ok', true, 'base_price', 20000, 'price', (g ->> 'price')::int) from (select public.myr_groupbuy_product_json(g1, p) as g from public.myr_groupbuys g1, public.myr_products p where g1.code = 'sqother01' and p.id = g1.product_id) x) - 'price'
    || jsonb_build_object('price', public.myr_groupbuy_price(20000, 15)), '옵션 상품 → 옵션 0번 단가 기준(실제 공구와 같은 단가)');
select is(public.myr_app_groupbuy_preview('00000000-0000-4000-8000-00000000d011', '00000000-0000-4000-8000-00000000d021', 100) ->> 'code', 'BAD_PCT', '범위 밖 → BAD_PCT');
select is(public.myr_app_groupbuy_preview('00000000-0000-4000-8000-00000000d099', '00000000-0000-4000-8000-00000000d021', 20) ->> 'code', 'NOT_FOUND', '남의 상품 → NOT_FOUND');

-- ---------- 줄 환불 길 ----------
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount, shipping_fee, payment_key)
values ('00000000-0000-4000-8000-00000000d041', 'pgtap-sq-o1', 'PAID', now(), '홍길동', '{}', '레몬', 108000, 0, 'pk-sq'),
       ('00000000-0000-4000-8000-00000000d042', 'pgtap-sq-o2', 'WAITING_DEPOSIT', null, '홍길동', '{}', '레몬', 36000, 3000, null),
       ('00000000-0000-4000-8000-00000000d043', 'pgtap-sq-o3', 'REFUNDED', now(), '홍길동', '{}', '레몬', 36000, 3000, 'pk-sq3');
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, ship_status, refunded_qty, status)
values ('00000000-0000-4000-8000-00000000d051', '00000000-0000-4000-8000-00000000d041', '00000000-0000-4000-8000-00000000d021', '00000000-0000-4000-8000-00000000d011', '레몬', '', 1, 36000, 'PAID', 0, 'PAID'),
       ('00000000-0000-4000-8000-00000000d052', '00000000-0000-4000-8000-00000000d041', '00000000-0000-4000-8000-00000000d021', '00000000-0000-4000-8000-00000000d011', '레몬', '', 1, 36000, 'PREPARING', 0, 'PAID'),
       ('00000000-0000-4000-8000-00000000d053', '00000000-0000-4000-8000-00000000d041', '00000000-0000-4000-8000-00000000d021', '00000000-0000-4000-8000-00000000d011', '레몬', '', 1, 36000, 'DELIVERED', 1, 'REFUNDED'),
       ('00000000-0000-4000-8000-00000000d054', '00000000-0000-4000-8000-00000000d042', '00000000-0000-4000-8000-00000000d021', '00000000-0000-4000-8000-00000000d011', '레몬', '', 1, 36000, 'PAID', 0, 'PAID'),
       ('00000000-0000-4000-8000-00000000d055', '00000000-0000-4000-8000-00000000d043', '00000000-0000-4000-8000-00000000d021', '00000000-0000-4000-8000-00000000d011', '레몬', '', 1, 36000, 'PREPARING', 0, 'PAID');
select is((select public.myr_line_refund_path(o, i) from public.myr_orders o, public.myr_order_items i where o.code = 'pgtap-sq-o1' and i.id = '00000000-0000-4000-8000-00000000d051'), 'instant', '결제완료 줄 → 바로 환불');
select is((select public.myr_line_refund_path(o, i) from public.myr_orders o, public.myr_order_items i where o.code = 'pgtap-sq-o1' and i.id = '00000000-0000-4000-8000-00000000d052'), 'claim', '배송준비중 줄 → 요청');
select is((select public.myr_line_refund_path(o, i) from public.myr_orders o, public.myr_order_items i where o.code = 'pgtap-sq-o1' and i.id = '00000000-0000-4000-8000-00000000d053'), null, '다 환불된 줄 → 없음');
select is((select public.myr_line_refund_path(o, i) from public.myr_orders o, public.myr_order_items i where o.code = 'pgtap-sq-o2' and i.id = '00000000-0000-4000-8000-00000000d054'), 'instant', '입금 전 주문 → 바로 취소');
select is((select public.myr_line_refund_path(o, i) from public.myr_orders o, public.myr_order_items i where o.code = 'pgtap-sq-o3' and i.id = '00000000-0000-4000-8000-00000000d055'), null, '환불 완료 주문 → 없음');
select is((select jsonb_agg(e ->> 'refund_path' order by e ->> 'ship_status') from jsonb_array_elements((select public.myr_order_json(o, false) from public.myr_orders o where o.code = 'pgtap-sq-o1') -> 'items') e),
  '[null, "instant", "claim"]'::jsonb, '주문 JSON 줄마다 refund_path(배송완료+환불 · 결제완료 · 배송준비중 — ship_status 순)');
-- 가드가 같은 판정을 쓴다: 고객 셀프 환불은 요청 줄을 막고(SHIPPED), 요청은 바로 환불 줄을 막는다(NOT_PREPARED · myr_refund_requests.test.sql)
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-00000000d041', '[{"item_id":"00000000-0000-4000-8000-00000000d052","qty":1}]', 'customer', null) ->> 'code', 'NOT_FOUND',
  '고객 actor 는 본인 주문만(소유 확인이 먼저)');
update public.myr_orders set user_id = null, customer_id = null where code = 'pgtap-sq-o1';
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-00000000d041', '[{"item_id":"00000000-0000-4000-8000-00000000d051","qty":1}]', 'system', null) ->> 'ok', 'true', '바로 환불 줄 → precheck 통과');

select * from finish();
rollback;
