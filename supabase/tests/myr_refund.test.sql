-- pgTAP — 0061 환불: 권한 · precheck 가드(actor 표) · 금액(부분/전액+배송비) · record(줄·주문 상태 파생 · sold_qty 반환 · 멱등) · 입금 대기 취소 (docs/myr.md §6.3)
begin;
select plan(50);

select function_privs_are('public', 'myr_app_refund_precheck', '{uuid,jsonb,text,uuid}'::text[], 'anon', '{}'::text[], 'anon 은 precheck 실행 불가');
select function_privs_are('public', 'myr_app_refund_precheck', '{uuid,jsonb,text,uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 도 precheck 실행 불가');
select function_privs_are('public', 'myr_app_refund_record', '{uuid,jsonb,text,uuid,text,integer,jsonb}'::text[], 'anon', '{}'::text[], 'anon 은 record 실행 불가');
select function_privs_are('public', 'myr_app_refund_record', '{uuid,jsonb,text,uuid,text,integer,jsonb}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 record 실행 가능');

select has_column('public', 'payment_events', 'order_code', 'payment_events.order_code (0062) 가 있다');
select col_type_is('public', 'payment_events', 'order_code', 'text', 'order_code 는 text');

-- 픽스처: 회원 주문(줄 2개 · 셀러 2명 · 배송비 3,000) · 비회원 주문 · 입금 대기 주문
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000c7', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-rf1@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-0000000000c8', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-rf2@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active)
values ('00000000-0000-4000-8000-000000000a41', '셀러 A', '@pgtap.rf.a', 'instagram', true),
       ('00000000-0000-4000-8000-000000000a42', '셀러 B', '@pgtap.rf.b', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status)
values ('00000000-0000-4000-8000-000000000b41', 'pgtap-rf-a', '00000000-0000-4000-8000-000000000a41', 'diet', '상품 A', 10000, 9, 'listed'),
       ('00000000-0000-4000-8000-000000000b42', 'pgtap-rf-b', '00000000-0000-4000-8000-000000000a42', 'inner', '상품 B', 20000, 9, 'listed');
insert into public.customers (id, guest, name, phone, phone_norm) values ('00000000-0000-4000-8000-0000000000e1', true, '김비회원', '01099998888', '01099998888');
insert into public.myr_orders (id, code, user_id, customer_id, status, buyer_name, shipping, order_name, items_amount, shipping_fee, payment_key, payment_method, paid_at)
values ('00000000-0000-4000-8000-000000000d41', 'pgtap-rf-m', '00000000-0000-4000-8000-0000000000c7', null, 'PAID', '홍길동', '{}', '상품 A 외 1건', 40000, 3000, 'pk_rf1', '카드', now()),
       ('00000000-0000-4000-8000-000000000d42', 'pgtap-rf-g', null, '00000000-0000-4000-8000-0000000000e1', 'PAID', '김비회원', '{}', '상품 A', 10000, 3000, 'pk_rf2', '카드', now()),
       ('00000000-0000-4000-8000-000000000d43', 'pgtap-rf-d', '00000000-0000-4000-8000-0000000000c7', null, 'WAITING_DEPOSIT', '홍길동', '{}', '상품 B', 20000, 3000, 'pk_rf3', '가상계좌', null);
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, qty, unit_price)
values ('00000000-0000-4000-8000-000000000f41', '00000000-0000-4000-8000-000000000d41', '00000000-0000-4000-8000-000000000b41', '00000000-0000-4000-8000-000000000a41', '상품 A', 2, 10000),
       ('00000000-0000-4000-8000-000000000f42', '00000000-0000-4000-8000-000000000d41', '00000000-0000-4000-8000-000000000b42', '00000000-0000-4000-8000-000000000a42', '상품 B', 1, 20000),
       ('00000000-0000-4000-8000-000000000f43', '00000000-0000-4000-8000-000000000d42', '00000000-0000-4000-8000-000000000b41', '00000000-0000-4000-8000-000000000a41', '상품 A', 1, 10000),
       ('00000000-0000-4000-8000-000000000f44', '00000000-0000-4000-8000-000000000d43', '00000000-0000-4000-8000-000000000b42', '00000000-0000-4000-8000-000000000a42', '상품 B', 1, 20000);
select is((select sold_qty from public.myr_products where code = 'pgtap-rf-a'), 3, '픽스처 — A sold 3 (2 + 비회원 1)');

-- ---------- precheck 가드 ----------
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000d41', '[]', 'hacker', null) ->> 'code', 'BAD_ACTOR', 'BAD_ACTOR');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000000', '[]', 'admin', null) ->> 'code', 'NOT_FOUND', 'NOT_FOUND');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000d41', '[]', 'customer', '00000000-0000-4000-8000-0000000000c8') ->> 'code', 'NOT_FOUND', '남의 주문은 customer 에게 NOT_FOUND(존재 미노출)');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000d41', '[{"item_id":"00000000-0000-4000-8000-000000000f41","qty":1}]', 'seller', '00000000-0000-4000-8000-000000000a42') ->> 'code', 'FORBIDDEN', '셀러는 남의 줄 FORBIDDEN');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000d41', '[{"item_id":"00000000-0000-4000-8000-000000000f41","qty":3}]', 'admin', null),
  '{"ok": false, "code": "BAD_ITEMS", "items": [{"item_id": "00000000-0000-4000-8000-000000000f41", "reason": "TOO_MANY", "left": 2}]}'::jsonb, '남은 수량 초과 BAD_ITEMS(left)');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000d41', '[{"item_id":"00000000-0000-4000-8000-000000000f43","qty":1}]', 'admin', null) -> 'items' -> 0 ->> 'reason', 'NOT_IN_ORDER', '다른 주문의 줄은 NOT_IN_ORDER');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000d41', '[{"item_id":"x","qty":1}]', 'admin', null) ->> 'code', 'BAD_ITEMS', '형식 오류 BAD_ITEMS');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000d41', '[{"item_id":"00000000-0000-4000-8000-000000000f41","qty":0}]', 'admin', null) -> 'items' -> 0 ->> 'reason', 'BAD_QTY', 'qty 0 은 BAD_QTY');
update public.myr_order_items set ship_status = 'PREPARING' where order_id = '00000000-0000-4000-8000-000000000d41'; -- 0077: 줄 배송 상태 기준
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000d41', '[]', 'customer', '00000000-0000-4000-8000-0000000000c7') ->> 'code', 'SHIPPED', '고객은 발주(배송준비중) 뒤 SHIPPED');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000d41', '[{"item_id":"00000000-0000-4000-8000-000000000f41","qty":1}]', 'seller', '00000000-0000-4000-8000-000000000a41') ->> 'ok', 'true', '셀러는 발송 뒤에도 자기 줄 ok');
update public.myr_order_items set ship_status = 'PAID' where order_id = '00000000-0000-4000-8000-000000000d41';

-- ---------- precheck 금액 ----------
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000d41', '[{"item_id":"00000000-0000-4000-8000-000000000f41","qty":1}]', 'customer', '00000000-0000-4000-8000-0000000000c7') - 'items',
  '{"ok": true, "order_code": "pgtap-rf-m", "order_status": "PAID", "payment_key": "pk_rf1", "amount": 10000, "deposit": false, "full": false}'::jsonb, '부분 환불 — 단가 × qty · 배송비 없음');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000d41', '[{"item_id":"00000000-0000-4000-8000-000000000f41","qty":1},{"item_id":"00000000-0000-4000-8000-000000000f41","qty":1}]', 'admin', null) ->> 'amount', '20000', '같은 줄 두 번은 합쳐진다');
-- 줄 순서는 정해져 있지 않다(전체 = 남은 줄 전부) — items 는 item_id 순으로 다시 묶어 비교
select is((select (j - 'items') || jsonb_build_object('items', (select jsonb_agg(e order by e ->> 'item_id') from jsonb_array_elements(j -> 'items') e))
             from (select public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000d41', '[]', 'customer', '00000000-0000-4000-8000-0000000000c7') as j) s),
  '{"ok": true, "order_code": "pgtap-rf-m", "order_status": "PAID", "payment_key": "pk_rf1", "amount": 43000, "deposit": false, "full": true, "items": [{"item_id": "00000000-0000-4000-8000-000000000f41", "qty": 2, "amount": 20000, "seller_id": "00000000-0000-4000-8000-000000000a41"}, {"item_id": "00000000-0000-4000-8000-000000000f42", "qty": 1, "amount": 20000, "seller_id": "00000000-0000-4000-8000-000000000a42"}]}'::jsonb,
  '빈 items = 전체 → 모든 줄 남은 수량 · full · 배송비 포함 43,000');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000d42', '[]', 'customer', '00000000-0000-4000-8000-0000000000e1') ->> 'amount', '13000', '비회원은 customer_id 로 본인 확인 · 전액 13,000');

-- ---------- record — 부분 → 나머지 ----------
-- 0068 — 사진: 버킷 · 다른 주문/줄 경로는 BAD_PHOTOS · 이 줄 경로는 줄에 남는다
select is((select public || '/' || file_size_limit from storage.buckets where id = 'myr-refunds'), 'false/5242880', '0068 버킷 myr-refunds 비공개 · 5MB');
select is(public.myr_app_refund_record('00000000-0000-4000-8000-000000000d41', '[{"item_id":"00000000-0000-4000-8000-000000000f41","qty":1,"photos":["00000000-0000-4000-8000-000000000d42/00000000-0000-4000-8000-000000000f41/00000000-0000-4000-8000-0000000000aa.jpg"]}]', 'customer', '00000000-0000-4000-8000-0000000000c7', 'x', 10000) -> 'items' -> 0 ->> 'reason', 'BAD_PHOTOS', '0068 다른 주문 아래 사진 경로는 BAD_PHOTOS(기록 없음)');
select is((select refunded_qty from public.myr_order_items where id = '00000000-0000-4000-8000-000000000f41'), 0, '0068 BAD_PHOTOS 면 줄이 그대로');
select is(public.myr_app_refund_record('00000000-0000-4000-8000-000000000d41', '[{"item_id":"00000000-0000-4000-8000-000000000f41","qty":1,"note":"  포장이 찢어졌어요  ","photos":["00000000-0000-4000-8000-000000000d41/00000000-0000-4000-8000-000000000f41/00000000-0000-4000-8000-0000000000aa.jpg","00000000-0000-4000-8000-000000000d41/00000000-0000-4000-8000-000000000f41/00000000-0000-4000-8000-0000000000ab.png"]}]', 'customer', '00000000-0000-4000-8000-0000000000c7', '단순 변심', 10000),
  '{"ok": true, "already": false, "order_code": "pgtap-rf-m", "status": "PARTIAL_REFUNDED", "amount": 10000}'::jsonb, '부분 환불 기록 → 주문 PARTIAL_REFUNDED');
select is((select refund_reason from public.myr_order_items where id = '00000000-0000-4000-8000-000000000f41'), '단순 변심 — 포장이 찢어졌어요', '0067 줄 refund_reason = 사유 — 상세(공백 정리)');
select is((select refund_reason from public.myr_orders where id = '00000000-0000-4000-8000-000000000d41'), '단순 변심', '0067 주문 refund_reason 은 사유만');
select is((select array_length(refund_photos, 1) || '/' || refund_photos[2] from public.myr_order_items where id = '00000000-0000-4000-8000-000000000f41'), '2/00000000-0000-4000-8000-000000000d41/00000000-0000-4000-8000-000000000f41/00000000-0000-4000-8000-0000000000ab.png', '0068 줄 refund_photos 에 경로 2개');
-- 0068 — 고아 사진: 줄에 실린 경로는 제외 · 24시간 안 된 것 제외 · 오래된 미참조만
select function_privs_are('public', 'myr_refund_photo_orphans', '{interval,integer}'::text[], 'anon', '{}'::text[], 'anon 은 orphans 실행 불가');
insert into storage.objects (bucket_id, name, created_at)
values ('myr-refunds', '00000000-0000-4000-8000-000000000d41/00000000-0000-4000-8000-000000000f41/00000000-0000-4000-8000-0000000000aa.jpg', now() - interval '3 days'),
       ('myr-refunds', '00000000-0000-4000-8000-000000000d41/00000000-0000-4000-8000-000000000f41/00000000-0000-4000-8000-0000000000ff.jpg', now() - interval '3 days'),
       ('myr-refunds', '00000000-0000-4000-8000-000000000d41/00000000-0000-4000-8000-000000000f41/00000000-0000-4000-8000-0000000000fe.jpg', now() - interval '1 hour');
select is((select array_agg(p) from public.myr_refund_photo_orphans() p), array['00000000-0000-4000-8000-000000000d41/00000000-0000-4000-8000-000000000f41/00000000-0000-4000-8000-0000000000ff.jpg'], '0068 고아 = 줄에 없고 24시간 지난 것만');
select is((select count(*) from public.myr_refund_photo_orphans(interval '0', 100)), 2::bigint, '0068 age 0 이면 최근 것도 고아');
select is((select count(*) from public.myr_refund_photo_orphans(interval '0', 1)), 1::bigint, '0068 limit');
select is((select status || '/' || refunded_qty || '/' || refund_amount || '/' || refund_actor from public.myr_order_items where id = '00000000-0000-4000-8000-000000000f41'), 'PARTIAL_REFUNDED/1/10000/customer', '줄 — 1개 환불 · PARTIAL_REFUNDED');
select is((select sold_qty from public.myr_products where code = 'pgtap-rf-a'), 2, 'sold_qty 반환 (3 → 2)');
select is((select refund_amount || '/' || status from public.myr_orders where id = '00000000-0000-4000-8000-000000000d41'), '10000/PARTIAL_REFUNDED', '주문 refund_amount 누적');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000d41', '[]', 'customer', '00000000-0000-4000-8000-0000000000c7') ->> 'amount', '33000', '나머지 전액 = 10,000 + 20,000 + 배송비 3,000');
select is(public.myr_app_refund_record('00000000-0000-4000-8000-000000000d41', '[]', 'customer', '00000000-0000-4000-8000-0000000000c7', '나머지', 33000) ->> 'status', 'REFUNDED', '나머지 환불 → 주문 REFUNDED');
select is((select bool_and(status = 'REFUNDED') from public.myr_order_items where order_id = '00000000-0000-4000-8000-000000000d41'), true, '줄 전부 REFUNDED');
select is((select sold_qty from public.myr_products where code = 'pgtap-rf-a'), 1, 'A sold 1 (비회원 주문만 남음)');
select is((select sold_qty from public.myr_products where code = 'pgtap-rf-b'), 1, 'B sold 1 (입금 대기 예약만 남음)');
select is((select refund_amount from public.myr_orders where id = '00000000-0000-4000-8000-000000000d41'), 43000, '주문 환불 합 43,000 = 결제액');
select is(public.myr_app_refund_record('00000000-0000-4000-8000-000000000d41', '[]', 'customer', '00000000-0000-4000-8000-0000000000c7', 'x', 0) ->> 'already', 'true', '다 환불된 주문은 already');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000d41', '[]', 'admin', null) ->> 'code', 'WRONG_STATUS', 'REFUNDED 주문 precheck 는 WRONG_STATUS');

-- ---------- record 가드 ----------
select is(public.myr_app_refund_record('00000000-0000-4000-8000-000000000d42', '[{"item_id":"00000000-0000-4000-8000-000000000f43","qty":5}]', 'admin', null, 'x', 0) ->> 'code', 'BAD_ITEMS', 'record 도 남은 수량 초과는 BAD_ITEMS');
select is(public.myr_app_refund_record('00000000-0000-4000-8000-000000000d42', '[]', 'nope', null, 'x', 0) ->> 'code', 'BAD_ACTOR', 'record BAD_ACTOR');

-- ---------- 입금 대기 취소 ----------
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000d43', '[]', 'customer', '00000000-0000-4000-8000-0000000000c7') ->> 'deposit', 'true', 'WAITING_DEPOSIT 은 deposit:true (토스 호출 없이 취소)');
select is(public.myr_app_refund_record('00000000-0000-4000-8000-000000000d43', '[]', 'customer', '00000000-0000-4000-8000-0000000000c7', '입금 전 취소', 0),
  '{"ok": true, "already": false, "order_code": "pgtap-rf-d", "status": "CANCELED", "amount": 0}'::jsonb, '입금 대기 취소 → CANCELED · 금액 0');
select is((select status || '/' || refund_actor from public.myr_order_items where id = '00000000-0000-4000-8000-000000000f44'), 'CANCELED/customer', '줄 CANCELED · actor 기록');
select is((select sold_qty from public.myr_products where code = 'pgtap-rf-b'), 0, 'B 예약 반환 (sold 0)');
select is(public.myr_app_refund_record('00000000-0000-4000-8000-000000000d43', '[]', 'customer', '00000000-0000-4000-8000-0000000000c7', 'x', 0) ->> 'already', 'true', '취소된 주문 재기록은 already');

select * from finish();
rollback;
