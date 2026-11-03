-- pgTAP — 0060 주문 조회: 권한 · 목록(줄 포함 · 배송지 없음) · 상세(회원/비회원 소유 판정 · 배송지 · 입금 정보) (docs/myr.md §7 S6)
begin;
select plan(28);

select function_privs_are('public', 'myr_app_my_orders', '{uuid,integer}'::text[], 'anon', '{}'::text[], 'anon 은 my_orders 실행 불가');
select function_privs_are('public', 'myr_app_my_orders', '{uuid,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 도 my_orders 실행 불가');
select function_privs_are('public', 'myr_app_order_view', '{text,uuid}'::text[], 'anon', '{}'::text[], 'anon 은 order_view 실행 불가');
select function_privs_are('public', 'myr_app_order_view', '{text,uuid}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 order_view 실행 가능');

-- 픽스처
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-ov1@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-0000000000c6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-ov2@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-000000000a31', '민지 루틴', '@pgtap.ov', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, tile, icon)
values ('00000000-0000-4000-8000-000000000b31', 'pgtap-ov-a', '00000000-0000-4000-8000-000000000a31', 'diet', '상품 A', 20000, 9, 'listed', 'lg', 'grape'),
       ('00000000-0000-4000-8000-000000000b32', 'pgtap-ov-b', '00000000-0000-4000-8000-000000000a31', 'inner', '상품 B', 30000, 9, 'listed', null, 'pill');
insert into public.myr_orders (id, code, user_id, status, buyer_name, shipping, order_name, items_amount, shipping_fee, payment_key, payment_method, paid_at, created_at)
values ('00000000-0000-4000-8000-000000000d31', 'pgtap-ov-m1', '00000000-0000-4000-8000-0000000000c5', 'PAID', '홍길동', '{"recipient":"홍길동","phone":"01012345678","address1":"서울"}', '상품 A 외 1건', 70000, 0, 'pk_ov1', '카드', now(), now() - interval '2 days'),
       ('00000000-0000-4000-8000-000000000d32', 'pgtap-ov-m2', '00000000-0000-4000-8000-0000000000c5', 'WAITING_DEPOSIT', '홍길동', '{"recipient":"홍길동","phone":"01012345678","address1":"서울"}', '상품 B', 30000, 3000, 'pk_ov2', '가상계좌', null, now() - interval '1 day'),
       ('00000000-0000-4000-8000-000000000d33', 'pgtap-ov-g1', null, 'PAID', '김비회원', '{"recipient":"김비회원","phone":"01099998888","address1":"부산"}', '상품 A', 20000, 3000, 'pk_ov3', '카드', now(), now());
update public.myr_orders set raw_payment = '{"virtualAccount":{"bankCode":"20","accountNumber":"1234","customerName":"홍길동","dueDate":"2026-11-03T23:59:59+09:00"}}'::jsonb where code = 'pgtap-ov-m2';
insert into public.myr_order_items (order_id, product_id, seller_id, product_name, option_name, qty, unit_price)
values ('00000000-0000-4000-8000-000000000d31', '00000000-0000-4000-8000-000000000b31', '00000000-0000-4000-8000-000000000a31', '상품 A', '', 2, 20000),
       ('00000000-0000-4000-8000-000000000d31', '00000000-0000-4000-8000-000000000b32', '00000000-0000-4000-8000-000000000a31', '상품 B', '2개 세트', 1, 30000),
       ('00000000-0000-4000-8000-000000000d32', '00000000-0000-4000-8000-000000000b32', '00000000-0000-4000-8000-000000000a31', '상품 B', '', 1, 30000),
       ('00000000-0000-4000-8000-000000000d33', '00000000-0000-4000-8000-000000000b31', '00000000-0000-4000-8000-000000000a31', '상품 A', '', 1, 20000);

-- 목록
select is(public.myr_app_my_orders(null), '[]'::jsonb, 'user 없으면 빈 배열');
select is(public.myr_app_my_orders('00000000-0000-4000-8000-0000000000c6'), '[]'::jsonb, '주문 없는 사용자는 빈 배열');
select is(jsonb_array_length(public.myr_app_my_orders('00000000-0000-4000-8000-0000000000c5')), 2, '내 주문 2건');
select is(public.myr_app_my_orders('00000000-0000-4000-8000-0000000000c5') -> 0 ->> 'code', 'pgtap-ov-m2', '최신순');
select is(jsonb_array_length(public.myr_app_my_orders('00000000-0000-4000-8000-0000000000c5', 1)), 1, 'limit');
select is(public.myr_app_my_orders('00000000-0000-4000-8000-0000000000c5') -> 1 -> 'shipping', 'null'::jsonb, '목록에는 배송지 없음');
select is(jsonb_array_length(public.myr_app_my_orders('00000000-0000-4000-8000-0000000000c5') -> 1 -> 'items'), 2, '목록 줄 포함');
-- 같은 문장으로 넣은 줄은 created_at 이 같아 순서가 id(난수)에 따라 바뀐다 — product_code 로 고른다
select is((select e - 'id' from jsonb_array_elements(public.myr_app_my_orders('00000000-0000-4000-8000-0000000000c5') -> 1 -> 'items') e where e ->> 'product_code' = 'pgtap-ov-b'), '{"id": null, "qty": 1, "name": "상품 B", "tile": null, "icon": "pill", "amount": 30000, "option": "2개 세트", "status": "PAID", "creator": "민지 루틴", "creator_handle": "@pgtap.ov", "thumb_url": null, "unit_price": 30000, "product_code": "pgtap-ov-b", "refunded_qty": 0}'::jsonb - 'id', '줄 JSON — 상품 코드·타일·아이콘·크리에이터 이름');
select ok(not (public.myr_app_my_orders('00000000-0000-4000-8000-0000000000c5') -> 0 ? 'raw_payment'), '결제 원문은 응답에 없다');
select is(public.myr_app_my_orders('00000000-0000-4000-8000-0000000000c5') -> 0 -> 'deposit', '{"bank": "20", "account": "1234", "holder": "홍길동", "due": "2026-11-03T23:59:59+09:00"}'::jsonb, '입금 대기면 가상계좌 정보');
select is(public.myr_app_my_orders('00000000-0000-4000-8000-0000000000c5') -> 1 -> 'deposit', 'null'::jsonb, 'PAID 는 deposit null');

-- 상세
select is(public.myr_app_order_view('PGTAP-OV-M1', '00000000-0000-4000-8000-0000000000c5') -> 'shipping' ->> 'recipient', '홍길동', '회원 상세 — 대소문자 무시 · 배송지 포함');
select is(public.myr_app_order_view('pgtap-ov-m1', '00000000-0000-4000-8000-0000000000c6'), null, '남의 주문은 null');
select is(public.myr_app_order_view('pgtap-ov-m1', null), null, '비회원 경로로 회원 주문은 null');
select is(public.myr_app_order_view('pgtap-ov-g1', null) ->> 'guest', 'true', '비회원 주문은 user null 경로로 열린다');
select is(public.myr_app_order_view('pgtap-ov-g1', '00000000-0000-4000-8000-0000000000c5'), null, '회원 경로로 비회원 주문은 null');
select is(public.myr_app_order_view('nope', null), null, '없는 주문 null');
select is((public.myr_app_order_view('pgtap-ov-m1', '00000000-0000-4000-8000-0000000000c5') ->> 'amount')::int, 70000, 'amount = 합계 + 배송비');

-- 0065 — 상세에만 buyer_email · 줄에 creator_handle
update public.myr_orders set buyer_email = 'pgtap-ov@myr.test' where code = 'pgtap-ov-m1';
select is(public.myr_app_order_view('pgtap-ov-m1', '00000000-0000-4000-8000-0000000000c5') ->> 'buyer_email', 'pgtap-ov@myr.test', '0065 상세에는 buyer_email');
select ok(public.myr_app_my_orders('00000000-0000-4000-8000-0000000000c5') -> 1 -> 'buyer_email' = 'null'::jsonb, '0065 목록에는 buyer_email 없음(null)');
select is(public.myr_app_order_view('pgtap-ov-m1', '00000000-0000-4000-8000-0000000000c5') -> 'items' -> 0 ->> 'creator_handle', '@pgtap.ov', '0065 줄 JSON 에 creator_handle');

-- 0066 — 환불 사유·시각(상세에만 · 환불이 있을 때만)
select ok(public.myr_app_order_view('pgtap-ov-m1', '00000000-0000-4000-8000-0000000000c5') -> 'refund_reason' = 'null'::jsonb and public.myr_app_order_view('pgtap-ov-m1', '00000000-0000-4000-8000-0000000000c5') -> 'refunded_at' = 'null'::jsonb, '0066 환불이 없으면 refund_reason·refunded_at 은 null');
update public.myr_orders set refund_amount = 20000, refund_reason = '상품 불량·파손', refunded_at = '2026-11-03T01:02:03Z' where code = 'pgtap-ov-m1';
select is(public.myr_app_order_view('pgtap-ov-m1', '00000000-0000-4000-8000-0000000000c5') ->> 'refund_reason', '상품 불량·파손', '0066 상세에 환불 사유');
select ok((public.myr_app_order_view('pgtap-ov-m1', '00000000-0000-4000-8000-0000000000c5') ->> 'refunded_at')::timestamptz = '2026-11-03T01:02:03Z'::timestamptz and public.myr_app_my_orders('00000000-0000-4000-8000-0000000000c5') -> 1 -> 'refund_reason' = 'null'::jsonb, '0066 상세에 환불 시각 · 목록에는 없음(null)');

select * from finish();
rollback;
