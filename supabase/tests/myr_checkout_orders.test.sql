-- pgTAP — 0058 결제·주문: 권한 · 배송비 · 체크아웃 생성(검증·합치기·소프트 예약·supersede) · 선점 · 승인 확정(잠금 재검사·주문/줄·sold_qty)
--   · 가상계좌(WAITING_DEPOSIT → 입금/만료) · 만료·고착 · 비회원 토큰 · purge 가 MYR 주문 있는 비회원 행을 지우지 않는지 (docs/myr.md §6.2 · §6.7)
-- 실행: npm run test:db — 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(101);

-- ---------- 표 · 권한 ----------
select has_table('public', 'myr_checkouts', 'myr_checkouts 표');
select has_table('public', 'myr_checkout_items', 'myr_checkout_items 표');
select has_table('public', 'myr_orders', 'myr_orders 표');
select has_table('public', 'myr_order_items', 'myr_order_items 표');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.myr_checkouts'::regclass, 'public.myr_checkout_items'::regclass, 'public.myr_orders'::regclass, 'public.myr_order_items'::regclass)), '표 4개 RLS on');
select table_privs_are('public', 'myr_checkouts', 'anon', '{}'::text[], 'anon 은 myr_checkouts 직접 권한 없음');
select table_privs_are('public', 'myr_orders', 'authenticated', '{}'::text[], 'authenticated 는 myr_orders 직접 권한 없음');
select table_privs_are('public', 'myr_order_items', 'authenticated', '{}'::text[], 'authenticated 는 myr_order_items 직접 권한 없음');
select function_privs_are('public', 'myr_app_create_checkout', '{uuid,uuid,jsonb,jsonb,jsonb,text,uuid}'::text[], 'anon', '{}'::text[], 'anon 은 create_checkout 실행 불가');
select function_privs_are('public', 'myr_app_create_checkout', '{uuid,uuid,jsonb,jsonb,jsonb,text,uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 도 create_checkout 실행 불가');
select function_privs_are('public', 'myr_app_claim_checkout', '{text,text,interval}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 claim 실행 불가');
select function_privs_are('public', 'myr_app_confirm_checkout', '{uuid,text,jsonb,boolean}'::text[], 'anon', '{}'::text[], 'anon 은 confirm 실행 불가');
select function_privs_are('public', 'myr_app_deposit_done', '{uuid,jsonb}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 deposit_done 실행 불가');
select function_privs_are('public', 'myr_app_guest_order_lookup', '{text,text}'::text[], 'anon', '{}'::text[], 'anon 은 guest lookup 실행 불가');
select function_privs_are('public', 'myr_app_confirm_checkout', '{uuid,text,jsonb,boolean}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 confirm 실행 가능');

-- ---------- 배송비 ----------
select is(public.myr_shipping_fee(0), 0, '배송비 — 0원이면 0');
select is(public.myr_shipping_fee(49999), 3000, '배송비 — 기준 미만 3,000');
select is(public.myr_shipping_fee(50000), 0, '배송비 — 50,000 이상 무료(경계 포함)');

-- ---------- 픽스처 ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-co1@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-co2@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active)
values ('00000000-0000-4000-8000-000000000a21', '셀러 A', '@pgtap.co.a', 'instagram', true),
       ('00000000-0000-4000-8000-000000000a22', '셀러 B', '@pgtap.co.b', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, options, stock, sold_qty, status, seller_margin_rate)
values ('00000000-0000-4000-8000-000000000b21', 'pgtap-co-a',       '00000000-0000-4000-8000-000000000a21', 'diet',  '상품 A', 10000, '[]', 5, 0, 'listed', 0.3),
       ('00000000-0000-4000-8000-000000000b22', 'pgtap-co-b',       '00000000-0000-4000-8000-000000000a22', 'inner', '상품 B', 20000, '[{"n":"1개","price":20000},{"n":"2개 세트","price":38000}]', 2, 0, 'listed', 0.25),
       ('00000000-0000-4000-8000-000000000b23', 'pgtap-co-pending', '00000000-0000-4000-8000-000000000a21', 'diet',  '상품 C', 30000, '[]', 5, 0, 'pending', null),
       ('00000000-0000-4000-8000-000000000b24', 'pgtap-co-low',     '00000000-0000-4000-8000-000000000a22', 'diet',  '상품 D', 40000, '[]', 1, 0, 'listed', null),
       ('00000000-0000-4000-8000-000000000b25', 'pgtap-co-cheap',   '00000000-0000-4000-8000-000000000a21', 'diet',  '상품 E', 50,    '[]', 9, 0, 'listed', null);

create temp table t (k text primary key, v text);
-- 공통 인자
create temp table args as select
  '{"name":"홍길동","phone":"01012345678","email":"a@b.co"}'::jsonb as buyer,
  '{"recipient":"홍길동","phone":"01012345678","address1":"서울시 어딘가 1-2"}'::jsonb as ship;

-- ---------- myr_app_create_checkout — 거부 ----------
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-0000000000c3', null, '{"name":""}'::jsonb, (select ship from args), '[{"code":"pgtap-co-a","qty":1}]', 'myr_t_000001') ->> 'code', 'NO_BUYER', '주문자 이름 없으면 NO_BUYER');
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-0000000000c3', null, (select buyer from args), (select ship from args), '[]', 'myr_t_000001') ->> 'code', 'BAD_LINES', '빈 줄은 BAD_LINES');
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-0000000000c3', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-co-a","qty":0}]', 'myr_t_000001') ->> 'code', 'BAD_LINES', 'qty 0 은 BAD_LINES');
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-0000000000c3', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-co-a","qty":5},{"code":"pgtap-co-a","qty":5}]', 'myr_t_000001') ->> 'code', 'BAD_LINES', '합쳐서 9 넘으면 BAD_LINES');
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-0000000000c3', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-co-a","qty":1}]', 'bad id') ->> 'code', 'BAD_ORDER_ID', 'toss_order_id 형식');
select is(
  public.myr_app_create_checkout('00000000-0000-4000-8000-0000000000c3', null, (select buyer from args), (select ship from args),
    '[{"code":"nope","qty":1},{"code":"pgtap-co-pending","qty":1},{"code":"pgtap-co-a","qty":9},{"code":"pgtap-co-b","qty":1,"option_index":5}]', 'myr_t_000001'),
  '{"ok": false, "code": "LINES_REJECTED", "items": [{"code": "nope", "reason": "NOT_FOUND"}, {"code": "pgtap-co-a", "reason": "SOLD_OUT", "left": 5}, {"code": "pgtap-co-b", "reason": "BAD_OPTION"}, {"code": "pgtap-co-pending", "reason": "NOT_AVAILABLE"}]}'::jsonb,
  '한 줄이라도 미달이면 아무것도 안 만들고 줄마다 이유를 돌려준다'
);
select is((select count(*) from public.myr_checkouts where toss_order_id = 'myr_t_000001'), 0::bigint, '거절됐으면 세션 없음');
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-0000000000c3', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-co-cheap","qty":1}]', 'myr_t_000001') ->> 'code', 'AMOUNT_TOO_SMALL', '100원 미만은 AMOUNT_TOO_SMALL');

-- ---------- 생성 성공 — 합치기 · 옵션 단가 · 배송비 · order_name ----------
insert into t select 'c1', public.myr_app_create_checkout('00000000-0000-4000-8000-0000000000c3', null, (select buyer from args), (select ship from args),
  '[{"code":"pgtap-co-a","qty":2},{"code":"pgtap-co-a","qty":1},{"code":"pgtap-co-b","qty":1,"option_index":1}]', 'myr_t_000001')::text;
select is(((select v from t where k = 'c1')::jsonb) ->> 'ok', 'true', '생성 ok');
select is(((select v from t where k = 'c1')::jsonb) -> 'checkout' ->> 'items_amount', '68000', '합계 = A 10,000×3 + B 옵션1 38,000');
select is(((select v from t where k = 'c1')::jsonb) -> 'checkout' ->> 'shipping_fee', '0', '68,000 ≥ 50,000 → 배송비 0');
select is(((select v from t where k = 'c1')::jsonb) -> 'checkout' ->> 'amount', '68000', 'amount = 합계 + 배송비');
select is(((select v from t where k = 'c1')::jsonb) -> 'checkout' ->> 'order_name', '상품 A 외 1건', 'order_name');
select is((select jsonb_agg(jsonb_build_object('code', p.code, 'qty', ci.qty, 'unit', ci.unit_price, 'opt', ci.option_name) order by p.code)
             from public.myr_checkout_items ci join public.myr_products p on p.id = ci.product_id
            where ci.checkout_id = (((select v from t where k = 'c1')::jsonb) -> 'checkout' ->> 'id')::uuid),
  '[{"code": "pgtap-co-a", "qty": 3, "unit": 10000, "opt": ""}, {"code": "pgtap-co-b", "qty": 1, "unit": 38000, "opt": "2개 세트"}]'::jsonb,
  '줄 2개 — 같은 상품은 합쳐지고 옵션 단가·이름이 스냅샷으로');
select is(public.myr_app_checkout_reserved('00000000-0000-4000-8000-000000000b21'), 3, '소프트 예약 — A 3개');

-- ---------- 소프트 예약 · supersede ----------
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-0000000000c4', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-co-a","qty":3}]', 'myr_t_000002'),
  '{"ok": false, "code": "LINES_REJECTED", "items": [{"code": "pgtap-co-a", "reason": "SOLD_OUT", "left": 2}]}'::jsonb,
  '다른 사용자는 예약분을 뺀 잔여(5−3=2)만 담을 수 있다');
insert into t select 'c2', public.myr_app_create_checkout('00000000-0000-4000-8000-0000000000c3', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-co-a","qty":4}]', 'myr_t_000003')::text;
select is(((select v from t where k = 'c2')::jsonb) ->> 'ok', 'true', '본인 PENDING 예약분은 되돌려 계산 — 4개 가능');
select is((select status || '/' || fail_code from public.myr_checkouts where toss_order_id = 'myr_t_000001'), 'EXPIRED/SUPERSEDED', '이전 PENDING 은 SUPERSEDED');
select is(public.myr_app_checkout_reserved('00000000-0000-4000-8000-000000000b21'), 4, '예약은 새 세션의 4개만');
select is(((select v from t where k = 'c2')::jsonb) -> 'checkout' ->> 'shipping_fee', '3000', '40,000 < 50,000 → 배송비 3,000');

-- ---------- myr_app_claim_checkout ----------
select is(public.myr_app_claim_checkout('myr_t_nope', 'pk_1') ->> 'code', 'NOT_FOUND', 'claim NOT_FOUND');
select is(public.myr_app_claim_checkout('myr_t_000001', 'pk_1') ->> 'code', 'SUPERSEDED', '종결(SUPERSEDED) 세션은 fail_code 로 거부');
insert into t select 'claim', public.myr_app_claim_checkout('myr_t_000003', 'pk_c2')::text;
select is(((select v from t where k = 'claim')::jsonb) ->> 'claimed', 'true', 'PENDING → 선점');
select is((select status || '/' || payment_key from public.myr_checkouts where toss_order_id = 'myr_t_000003'), 'CONFIRMING/pk_c2', 'CONFIRMING + payment_key');
select is(public.myr_app_claim_checkout('myr_t_000003', 'pk_other') ->> 'code', 'CONFIRMING', '신선한 CONFIRMING 은 다른 요청을 거부');

-- ---------- myr_app_confirm_checkout — 즉시 결제 ----------
select is(public.myr_app_confirm_checkout((((select v from t where k = 'c2')::jsonb) -> 'checkout' ->> 'id')::uuid, 'pk_c2',
  '{"status":"DONE","orderId":"myr_t_000003","totalAmount":99,"paymentKey":"pk_c2","method":"카드","virtualAccount":null}'::jsonb) ->> 'code', 'PAYMENT_MISMATCH', '금액 불일치는 PAYMENT_MISMATCH');
select is(public.myr_app_confirm_checkout((((select v from t where k = 'c2')::jsonb) -> 'checkout' ->> 'id')::uuid, 'pk_c2',
  '{"status":"DONE","orderId":"myr_t_000003","totalAmount":43000,"paymentKey":"pk_other","method":"카드"}'::jsonb) ->> 'code', 'PAYMENT_MISMATCH', 'paymentKey 불일치도 PAYMENT_MISMATCH');
insert into t select 'o1', public.myr_app_confirm_checkout((((select v from t where k = 'c2')::jsonb) -> 'checkout' ->> 'id')::uuid, 'pk_c2',
  '{"status":"DONE","orderId":"myr_t_000003","totalAmount":43000,"paymentKey":"pk_c2","method":"카드","approvedAt":"2026-10-30T10:00:00+09:00","virtualAccount":null}'::jsonb)::text;
select is(((select v from t where k = 'o1')::jsonb) ->> 'ok', 'true', '승인 확정 ok');
select is(((select v from t where k = 'o1')::jsonb) ->> 'status', 'PAID', '카드 → PAID');
select ok(((select v from t where k = 'o1')::jsonb) ->> 'order_code' ~ '^myr[0-9]+$', '주문번호 myr<번호>');
select is((select status || '/' || coalesce(paid_at::text, 'null') || '/' || amount from public.myr_orders where id = (((select v from t where k = 'o1')::jsonb) ->> 'order_id')::uuid),
  'PAID/2026-10-30 01:00:00+00/43000', '주문 PAID · paid_at = approvedAt · amount');
select is((select jsonb_agg(jsonb_build_object('qty', qty, 'unit', unit_price, 'margin', seller_margin_rate, 'seller', seller_id)) from public.myr_order_items where order_id = (((select v from t where k = 'o1')::jsonb) ->> 'order_id')::uuid),
  '[{"qty": 4, "unit": 10000, "margin": 0.3000, "seller": "00000000-0000-4000-8000-000000000a21"}]'::jsonb, '줄 — 수량·단가·마진율 스냅샷·셀러');
select is((select sold_qty from public.myr_products where code = 'pgtap-co-a'), 4, 'sold_qty 트리거 — A 4');
select is((select status from public.myr_checkouts where toss_order_id = 'myr_t_000003'), 'CONFIRMED', '세션 CONFIRMED');
select is(public.myr_app_checkout_reserved('00000000-0000-4000-8000-000000000b21'), 0, 'CONFIRMED 는 예약에서 빠진다');
select is(public.myr_app_confirm_checkout((((select v from t where k = 'c2')::jsonb) -> 'checkout' ->> 'id')::uuid, 'pk_c2', '{}'::jsonb) ->> 'already', 'true', '재호출은 already(멱등)');
select is(public.myr_app_claim_checkout('myr_t_000003', 'pk_c2') ->> 'claimed', 'false', 'CONFIRMED 세션 claim 은 claimed:false');

-- ---------- confirm 잠금 재검사 — SOLD_OUT ----------
insert into t select 'c3', public.myr_app_create_checkout('00000000-0000-4000-8000-0000000000c4', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-co-low","qty":1}]', 'myr_t_000004')::text;
update public.myr_products set stock = 0 where code = 'pgtap-co-low';   -- 결제창이 열린 사이 재고가 사라짐
select is(public.myr_app_claim_checkout('myr_t_000004', 'pk_c3') ->> 'ok', 'true', '선점');
select is(public.myr_app_confirm_checkout((((select v from t where k = 'c3')::jsonb) -> 'checkout' ->> 'id')::uuid, 'pk_c3',
  '{"status":"DONE","orderId":"myr_t_000004","totalAmount":43000,"paymentKey":"pk_c3","method":"카드"}'::jsonb),
  '{"ok": false, "code": "SOLD_OUT", "items": [{"code": "pgtap-co-low", "reason": "SOLD_OUT", "left": 0}]}'::jsonb, '승인 뒤 재검사에서 품절이면 SOLD_OUT(호출자가 토스 취소)');
select is((select count(*) from public.myr_orders o join public.myr_checkouts c on c.id = o.checkout_id where c.toss_order_id = 'myr_t_000004'), 0::bigint, '주문 안 생김');
update public.myr_products set stock = 1 where code = 'pgtap-co-low';

-- ---------- 가상계좌 — WAITING_DEPOSIT → 입금 ----------
insert into t select 'c4', public.myr_app_create_checkout('00000000-0000-4000-8000-0000000000c3', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-co-a","qty":1}]', 'myr_t_000005')::text;
select is(public.myr_app_claim_checkout('myr_t_000005', 'pk_c4') ->> 'ok', 'true', 'VA 선점');
select is(public.myr_app_confirm_checkout((((select v from t where k = 'c4')::jsonb) -> 'checkout' ->> 'id')::uuid, 'pk_c4',
  '{"status":"WAITING_FOR_DEPOSIT","orderId":"myr_t_000005","totalAmount":13000,"paymentKey":"pk_c4","method":"카드","virtualAccount":null}'::jsonb) ->> 'code', 'PAYMENT_MISMATCH', 'WAITING_FOR_DEPOSIT 인데 가상계좌가 아니면 PAYMENT_MISMATCH');
insert into t select 'o2', public.myr_app_confirm_checkout((((select v from t where k = 'c4')::jsonb) -> 'checkout' ->> 'id')::uuid, 'pk_c4',
  '{"status":"WAITING_FOR_DEPOSIT","orderId":"myr_t_000005","totalAmount":13000,"paymentKey":"pk_c4","method":"가상계좌","requestedAt":"2026-10-30T10:00:00+09:00","virtualAccount":{"bankCode":"20","accountNumber":"X","dueDate":"2026-10-31T23:59:59+09:00"}}'::jsonb)::text;
select is(((select v from t where k = 'o2')::jsonb) ->> 'status', 'WAITING_DEPOSIT', '가상계좌 → 주문 WAITING_DEPOSIT');
select is((select coalesce(paid_at::text, 'null') || '/' || deposit_due_at::text from public.myr_orders where id = (((select v from t where k = 'o2')::jsonb) ->> 'order_id')::uuid),
  'null/2026-10-31 14:59:59+00', 'paid_at 없음 · deposit_due_at = dueDate');
select is((select sold_qty from public.myr_products where code = 'pgtap-co-a'), 5, '입금 대기도 재고 예약(sold_qty 5)');
select is(public.myr_app_deposit_done((((select v from t where k = 'o2')::jsonb) ->> 'order_id')::uuid, '{"status":"DONE","paymentKey":"pk_wrong","totalAmount":13000}'::jsonb) ->> 'code', 'PAYMENT_MISMATCH', 'deposit_done — 키 불일치');
select is(public.myr_app_deposit_done((((select v from t where k = 'o2')::jsonb) ->> 'order_id')::uuid, '{"status":"DONE","paymentKey":"pk_c4","totalAmount":13000,"approvedAt":"2026-10-31T09:00:00+09:00","method":"가상계좌"}'::jsonb) ->> 'status', 'PAID', 'deposit_done → PAID');
select is((select paid_at::text from public.myr_orders where id = (((select v from t where k = 'o2')::jsonb) ->> 'order_id')::uuid), '2026-10-31 00:00:00+00', 'paid_at = 입금 approvedAt');
select is(public.myr_app_deposit_done((((select v from t where k = 'o2')::jsonb) ->> 'order_id')::uuid, '{"status":"DONE","paymentKey":"pk_c4","totalAmount":13000}'::jsonb) ->> 'already', 'true', '두 번 입금 처리는 already');
select is(public.myr_app_deposit_expire((((select v from t where k = 'o2')::jsonb) ->> 'order_id')::uuid) ->> 'code', 'WRONG_STATUS', 'PAID 는 만료 처리 불가');

-- ---------- 가상계좌 — 기한 만료 → CANCELED · 재고 반환 ----------
insert into t select 'c5', public.myr_app_create_checkout('00000000-0000-4000-8000-0000000000c4', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-co-b","qty":1}]', 'myr_t_000006')::text;
select is(public.myr_app_claim_checkout('myr_t_000006', 'pk_c5') ->> 'ok', 'true', 'VA2 선점');
insert into t select 'o3', public.myr_app_confirm_checkout((((select v from t where k = 'c5')::jsonb) -> 'checkout' ->> 'id')::uuid, 'pk_c5',
  '{"status":"WAITING_FOR_DEPOSIT","orderId":"myr_t_000006","totalAmount":23000,"paymentKey":"pk_c5","method":"가상계좌","virtualAccount":{"dueDate":"2026-10-31T23:59:59+09:00"}}'::jsonb)::text;
select is((select sold_qty from public.myr_products where code = 'pgtap-co-b'), 1, 'B 예약 1');
select is((select count(*) from public.myr_app_deposit_due(10)), 0::bigint, '기한 전이면 due 목록에 없음');
update public.myr_orders set deposit_due_at = now() - interval '1 hour' where id = (((select v from t where k = 'o3')::jsonb) ->> 'order_id')::uuid;
select is((select count(*) from public.myr_app_deposit_due(10) d where (d ->> 'id')::uuid = (((select v from t where k = 'o3')::jsonb) ->> 'order_id')::uuid), 1::bigint, '기한 지나면 due 목록에');
select is(public.myr_app_deposit_expire((((select v from t where k = 'o3')::jsonb) ->> 'order_id')::uuid, '{"status":"CANCELED"}'::jsonb) ->> 'status', 'CANCELED', '만료 → CANCELED');
select is((select bool_and(status = 'CANCELED') from public.myr_order_items where order_id = (((select v from t where k = 'o3')::jsonb) ->> 'order_id')::uuid), true, '줄도 CANCELED');
select is((select sold_qty from public.myr_products where code = 'pgtap-co-b'), 0, '재고 반환(sold_qty 0)');
select is(public.myr_app_deposit_expire((((select v from t where k = 'o3')::jsonb) ->> 'order_id')::uuid) ->> 'already', 'true', '만료 재호출 already');

-- ---------- 만료 · 고착 · recover ----------
insert into t select 'c6', public.myr_app_create_checkout('00000000-0000-4000-8000-0000000000c4', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-co-b","qty":1}]', 'myr_t_000007')::text;
update public.myr_checkouts set expires_at = now() - interval '2 hours' where toss_order_id = 'myr_t_000007';
select is(public.myr_app_claim_checkout('myr_t_000007', 'pk_c6') ->> 'code', 'EXPIRED', '만료된 PENDING 은 claim 때 EXPIRED 로');
insert into t select 'c7', public.myr_app_create_checkout('00000000-0000-4000-8000-0000000000c4', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-co-b","qty":1}]', 'myr_t_000008')::text;
update public.myr_checkouts set expires_at = now() - interval '2 hours' where toss_order_id = 'myr_t_000008';
select is(public.myr_expire_checkouts(interval '1 hour'), 1, 'myr_expire_checkouts — 유예 지난 PENDING 1건');
select is((select status from public.myr_checkouts where toss_order_id = 'myr_t_000008'), 'EXPIRED', '→ EXPIRED');
insert into t select 'c8', public.myr_app_create_checkout('00000000-0000-4000-8000-0000000000c4', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-co-b","qty":1}]', 'myr_t_000009')::text;
select is(public.myr_app_claim_checkout('myr_t_000009', 'pk_c8') ->> 'ok', 'true', '선점');
-- updated_at 은 트리거가 now() 로 덮으므로 "오래된 CONFIRMING" 을 만들려면 잠시 끈다
alter table public.myr_checkouts disable trigger myr_checkouts_updated_at;
update public.myr_checkouts set updated_at = now() - interval '5 minutes' where toss_order_id = 'myr_t_000009';
alter table public.myr_checkouts enable trigger myr_checkouts_updated_at;
select is((select count(*) from public.myr_stale_checkouts(interval '2 minutes', 10) s where s ->> 'toss_order_id' = 'myr_t_000009'), 1::bigint, '고착 CONFIRMING 은 stale 목록에');
select is(public.myr_app_claim_checkout('myr_t_000009', 'pk_c8') ->> 'claimed', 'true', '20초 지난 CONFIRMING 은 같은 키로 재선점');
-- recover: 종결(EXPIRED) 됐지만 돈은 DONE 인 세션 → recover=true 로 주문 생성
select is(public.myr_app_confirm_checkout((((select v from t where k = 'c7')::jsonb) -> 'checkout' ->> 'id')::uuid, 'pk_c7',
  '{"status":"DONE","orderId":"myr_t_000008","totalAmount":23000,"paymentKey":"pk_c7","method":"카드"}'::jsonb, false) ->> 'code', 'EXPIRED', 'recover=false 면 종결 세션은 거부');
select is(public.myr_app_confirm_checkout((((select v from t where k = 'c7')::jsonb) -> 'checkout' ->> 'id')::uuid, 'pk_c7',
  '{"status":"DONE","orderId":"myr_t_000008","totalAmount":23000,"paymentKey":"pk_c7","method":"카드"}'::jsonb, true) ->> 'status', 'PAID', 'recover=true 면 주문을 만든다');
select is((select sold_qty from public.myr_products where code = 'pgtap-co-b'), 1, 'B sold_qty 1');

-- ---------- 비회원 — customers 행 · 토큰 발급/검증/조회(회전) · purge 보호 ----------
insert into t select 'guest_cid', public.app_guest_customer_upsert('김비회원', '01099998888', null)::text;
insert into t select 'c9', public.myr_app_create_checkout(null, (select v from t where k = 'guest_cid')::uuid, '{"name":"김비회원","phone":"01099998888"}'::jsonb, (select ship from args), '[{"code":"pgtap-co-a","qty":0}]', 'myr_t_000010')::text;
select is(((select v from t where k = 'c9')::jsonb) ->> 'code', 'BAD_LINES', '비회원도 같은 검증');
delete from t where k = 'c9';
-- pgtap-co-low 는 위 CONFIRMING 세션(myr_t_000004)이 아직 예약 중이라 다른 상품으로 (cheap 50원 × 2 = 100원 + 배송비 3,000)
insert into t select 'c9', public.myr_app_create_checkout(null, (select v from t where k = 'guest_cid')::uuid, '{"name":"김비회원","phone":"01099998888"}'::jsonb, (select ship from args), '[{"code":"pgtap-co-cheap","qty":2}]', 'myr_t_000010')::text;
select is(((select v from t where k = 'c9')::jsonb) -> 'checkout' ->> 'user_id', null, '비회원 세션 user_id null');
select is(public.myr_app_claim_checkout('myr_t_000010', 'pk_c9') ->> 'ok', 'true', '비회원 선점');
insert into t select 'o4', public.myr_app_confirm_checkout((((select v from t where k = 'c9')::jsonb) -> 'checkout' ->> 'id')::uuid, 'pk_c9',
  '{"status":"DONE","orderId":"myr_t_000010","totalAmount":3100,"paymentKey":"pk_c9","method":"카드"}'::jsonb)::text;
select is(((select v from t where k = 'o4')::jsonb) ->> 'status', 'PAID', '비회원 주문 PAID');
insert into t select 'tok1', public.myr_app_guest_token_issue(((select v from t where k = 'o4')::jsonb) ->> 'order_code');
select ok((select v from t where k = 'tok1') ~ '^[0-9a-f]{64}$', '토큰 발급 — 64 hex');
select is(public.myr_app_guest_token_issue(((select v from t where k = 'o1')::jsonb) ->> 'order_code'), null, '회원 주문엔 토큰 없음');
select is(public.myr_app_guest_order_verify(upper(((select v from t where k = 'o4')::jsonb) ->> 'order_code'), (select v from t where k = 'tok1')), (((select v from t where k = 'o4')::jsonb) ->> 'order_id')::uuid, '검증 — 대소문자 무시 · 주문 id');
select is(public.myr_app_guest_order_verify(((select v from t where k = 'o4')::jsonb) ->> 'order_code', repeat('0', 64)), null, '틀린 토큰 null');
select is(public.myr_app_guest_order_lookup(((select v from t where k = 'o4')::jsonb) ->> 'order_code', '01000000000') ->> 'code', 'NOT_FOUND', '연락처 불일치 NOT_FOUND');
insert into t select 'look', public.myr_app_guest_order_lookup(((select v from t where k = 'o4')::jsonb) ->> 'order_code', '01099998888')::text;
select is(((select v from t where k = 'look')::jsonb) ->> 'ok', 'true', '주문번호+연락처 조회 ok');
select is(public.myr_app_guest_order_verify(((select v from t where k = 'o4')::jsonb) ->> 'order_code', (select v from t where k = 'tok1')), null, '조회로 토큰이 회전돼 옛 토큰은 무효');
select is(public.myr_app_guest_order_verify(((select v from t where k = 'o4')::jsonb) ->> 'order_code', ((select v from t where k = 'look')::jsonb) ->> 'token'), (((select v from t where k = 'o4')::jsonb) ->> 'order_id')::uuid, '새 토큰은 유효');
update public.customers set created_at = now() - interval '100 days' where id = (select v from t where k = 'guest_cid')::uuid;
select ok(public.purge_checkout_pii(interval '30 days') >= 0, 'purge 실행');
select is((select count(*) from public.customers where id = (select v from t where k = 'guest_cid')::uuid), 1::bigint, 'MYR 주문이 있는 비회원 행은 purge 가 지우지 않는다');

-- ---------- PII 파기 ----------
alter table public.myr_checkouts disable trigger myr_checkouts_updated_at;
update public.myr_checkouts set updated_at = now() - interval '40 days' where toss_order_id in ('myr_t_000001', 'myr_t_000008');
alter table public.myr_checkouts enable trigger myr_checkouts_updated_at;
select is(public.myr_purge_checkout_pii(interval '30 days'), 1, 'FAILED/EXPIRED 세션 중 30일 지난 것만 익명화(myr_t_000008 은 recover 로 CONFIRMED)');
select is((select buyer_name from public.myr_checkouts where toss_order_id = 'myr_t_000001'), '(삭제)', '익명화 확인');

select * from finish();
rollback;
