-- pgTAP — 0063 MYR 고객 문의: 권한 · 접수(검증 · 주문 소유 증명 · 이 상품 줄만) · actor 별 스레드/목록 · 답변 상태 전이 · 종료 (docs/myr.md §7 S7 · §6.6)
begin;
select plan(78);

-- ---------- 권한 ----------
select function_privs_are('public', 'myr_app_cs_open', '{uuid,uuid,uuid,text,text,text,text,text}'::text[], 'anon', '{}'::text[], 'anon 은 cs_open 실행 불가');
select function_privs_are('public', 'myr_app_cs_open', '{uuid,uuid,uuid,text,text,text,text,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 도 cs_open 실행 불가');
select function_privs_are('public', 'myr_app_cs_thread', '{text,text,uuid,uuid}'::text[], 'anon', '{}'::text[], 'anon 은 cs_thread 실행 불가');
select function_privs_are('public', 'myr_app_cs_list', '{text,uuid,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 cs_list 실행 불가');
select function_privs_are('public', 'myr_app_cs_reply', '{text,text,uuid,uuid,uuid,text}'::text[], 'anon', '{}'::text[], 'anon 은 cs_reply 실행 불가');
select function_privs_are('public', 'myr_app_cs_close', '{text,text,uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 cs_close 실행 불가');
select function_privs_are('public', 'myr_app_cs_for_order', '{uuid}'::text[], 'anon', '{}'::text[], 'anon 은 cs_for_order 실행 불가');
select function_privs_are('public', 'myr_app_cs_reply', '{text,text,uuid,uuid,uuid,text}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 cs_reply 실행 가능');
select table_privs_are('public', 'myr_cs_conversations', 'anon', '{}'::text[], 'anon 은 myr_cs_conversations 직접 접근 불가');
select table_privs_are('public', 'myr_cs_messages', 'authenticated', '{}'::text[], 'authenticated 는 myr_cs_messages 직접 접근 불가');
select col_default_is('public', 'myr_cs_messages', 'created_at', 'clock_timestamp()', '0064 메시지 시각 = clock_timestamp (한 트랜잭션 안에서도 순서 보장)');

-- ---------- 픽스처 ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000c8', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-cs1@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-cs2@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active)
values ('00000000-0000-4000-8000-000000000a51', '민지 루틴', '@pgtap.cs1', 'instagram', true),
       ('00000000-0000-4000-8000-000000000a52', '하루 웰', '@pgtap.cs2', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, tile, icon)
values ('00000000-0000-4000-8000-000000000b51', 'pgtap-cs-a', '00000000-0000-4000-8000-000000000a51', 'diet', '상품 A', 20000, 9, 'listed', 'lg', 'grape'),
       ('00000000-0000-4000-8000-000000000b52', 'pgtap-cs-b', '00000000-0000-4000-8000-000000000a52', 'inner', '상품 B', 30000, 9, 'paused', null, 'pill');
-- 고객 행: 회원 c8 의 행 · 비회원 행(조회 토큰 해시 = sha256('aa…64'))
insert into public.customers (id, user_id, name, guest) values ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000c8', '홍길동', false);
insert into public.customers (id, user_id, name, guest, lookup_token_hash)
values ('00000000-0000-4000-8000-0000000000e6', null, '김비회원', true, encode(extensions.digest(repeat('a', 64), 'sha256'), 'hex'));
-- 주문: m1 = 회원 c8(A 2개 + B 1개) · g1 = 비회원(A 1개) · m2 = 회원 c9(B 만)
insert into public.myr_orders (id, code, user_id, customer_id, status, buyer_name, shipping, order_name, items_amount, shipping_fee, payment_key, payment_method, paid_at)
values ('00000000-0000-4000-8000-000000000d51', 'pgtap-cs-m1', '00000000-0000-4000-8000-0000000000c8', '00000000-0000-4000-8000-0000000000e5', 'PAID', '홍길동', '{}', '상품 A 외 1건', 70000, 0, 'pk_cs1', '카드', now()),
       ('00000000-0000-4000-8000-000000000d52', 'pgtap-cs-g1', null, '00000000-0000-4000-8000-0000000000e6', 'PAID', '김비회원', '{}', '상품 A', 20000, 3000, 'pk_cs2', '카드', now()),
       ('00000000-0000-4000-8000-000000000d53', 'pgtap-cs-m2', '00000000-0000-4000-8000-0000000000c9', null, 'PAID', '이회원', '{}', '상품 B', 30000, 0, 'pk_cs3', '카드', now());
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price)
values ('00000000-0000-4000-8000-000000000f51', '00000000-0000-4000-8000-000000000d51', '00000000-0000-4000-8000-000000000b51', '00000000-0000-4000-8000-000000000a51', '상품 A', '', 2, 20000),
       ('00000000-0000-4000-8000-000000000f52', '00000000-0000-4000-8000-000000000d51', '00000000-0000-4000-8000-000000000b52', '00000000-0000-4000-8000-000000000a52', '상품 B', '2개 세트', 1, 30000),
       ('00000000-0000-4000-8000-000000000f53', '00000000-0000-4000-8000-000000000d52', '00000000-0000-4000-8000-000000000b51', '00000000-0000-4000-8000-000000000a51', '상품 A', '', 1, 20000),
       ('00000000-0000-4000-8000-000000000f54', '00000000-0000-4000-8000-000000000d53', '00000000-0000-4000-8000-000000000b52', '00000000-0000-4000-8000-000000000a52', '상품 B', '', 1, 30000);

-- ---------- 접수 검증 ----------
select is(public.myr_app_cs_open('00000000-0000-4000-8000-0000000000ff', null, null, '', '상품 문의', '안녕') ->> 'code', 'NOT_FOUND', '없는 상품 NOT_FOUND');
select is(public.myr_app_cs_open('00000000-0000-4000-8000-000000000b51', null, null, '', '아무거나', '안녕') ->> 'code', 'BAD_TYPE', '유형 밖 BAD_TYPE');
select is(public.myr_app_cs_open('00000000-0000-4000-8000-000000000b51', null, null, '', '상품 문의', E'  \n\n ') ->> 'code', 'BAD_BODY', '빈 본문 BAD_BODY');
select is(public.myr_app_cs_open('00000000-0000-4000-8000-000000000b51', null, null, '', '상품 문의', repeat('가', 2001)) ->> 'code', 'BAD_BODY', '2001자 BAD_BODY');
select is((public.myr_app_cs_open('00000000-0000-4000-8000-000000000b51', null, null, '', '상품 문의', repeat('가', 2001)) ->> 'max')::int, 2000, 'BAD_BODY 는 max 를 돌려준다');

-- ---------- 접수 — 비회원 · 주문 없음 ----------
create temp table t_open as
  select public.myr_app_cs_open('00000000-0000-4000-8000-000000000b51', null, null, '  ', '상품 문의', E'첫 줄\r\n\n\n\n둘째 줄\x07 끝  ') as r;
select is((select r ->> 'ok' from t_open), 'true', '비회원 접수 ok');
select is((select r ->> 'seller_id' from t_open), '00000000-0000-4000-8000-000000000a51', 'seller_id 는 상품에서 파생');
select is((select r ->> 'seller_name' from t_open), '민지 루틴', 'seller_name');
select is((select r ->> 'order_matched' from t_open), 'false', '주문번호 없으면 order_matched false');
select ok((select (r ->> 'client_token')::uuid is not null from t_open), 'client_token 발급');
select is((select buyer_name from public.myr_cs_conversations where code = (select r ->> 'conversation_code' from t_open)), '고객', '빈 이름은 고객');
select is((select status from public.myr_cs_conversations where code = (select r ->> 'conversation_code' from t_open)), 'OPEN', '접수 = OPEN');
select is((select body from public.myr_cs_messages where conversation_id = (select (r ->> 'conversation_id')::uuid from t_open)), E'첫 줄\n\n둘째 줄 끝', '본문 정규화 — CR 제거 · 제어문자 제거 · 빈 줄 축소 · 앞뒤 공백');
select ok((select code ~ '^cs\d+$' from public.myr_cs_conversations where id = (select (r ->> 'conversation_id')::uuid from t_open)), '코드는 cs<번호>');

-- ---------- 접수 — 주문 소유 증명 ----------
-- ① 회원 본인 주문(m1) · 상품 A 줄 연결
create temp table t_m as select public.myr_app_cs_open('00000000-0000-4000-8000-000000000b51', null, '00000000-0000-4000-8000-0000000000c8', '홍길동', '배송 문의', '언제 오나요', 'PGTAP-CS-M1') as r;
select is((select r ->> 'order_matched' from t_m), 'true', '회원 본인 주문은 연결');
select is((select r ->> 'order_item_id' from t_m), '00000000-0000-4000-8000-000000000f51', '그 주문 안 이 상품의 줄(A) 연결');
-- 남의 주문번호(m2 는 c9 것) — 원문은 남고 연결 안 됨
create temp table t_o as select public.myr_app_cs_open('00000000-0000-4000-8000-000000000b52', null, '00000000-0000-4000-8000-0000000000c8', '홍길동', '배송 문의', '내 주문 아님', 'pgtap-cs-m2') as r;
select is((select r ->> 'order_matched' from t_o), 'false', '남의 주문은 연결 안 됨');
select is((select order_code from public.myr_cs_conversations where id = (select (r ->> 'conversation_id')::uuid from t_o)), 'pgtap-cs-m2', '주문번호 원문은 보관');
-- 증명된 주문(m2 = c9)이지만 상품 A 줄이 없음 → 연결 안 함
select is(public.myr_app_cs_open('00000000-0000-4000-8000-000000000b51', null, '00000000-0000-4000-8000-0000000000c9', '', '배송 문의', '줄 없음', 'pgtap-cs-m2') ->> 'order_matched', 'false', '본인 주문이라도 이 상품 줄이 없으면 연결 안 함');
-- ② 고객 행(customer_id) 증명
select is(public.myr_app_cs_open('00000000-0000-4000-8000-000000000b52', '00000000-0000-4000-8000-0000000000e5', null, '', '교환·반품', '고객행', 'pgtap-cs-m1') ->> 'order_item_id', '00000000-0000-4000-8000-000000000f52', 'customer_id 로 증명 · B 줄 연결');
-- ③ 비회원 조회 토큰
create temp table t_g as select public.myr_app_cs_open('00000000-0000-4000-8000-000000000b51', null, null, '김비회원', '배송 문의', '토큰으로', 'pgtap-cs-g1', repeat('a', 64)) as r;
select is((select r ->> 'order_item_id' from t_g), '00000000-0000-4000-8000-000000000f53', '비회원 토큰으로 증명 · A 줄 연결');
select is(public.myr_app_cs_open('00000000-0000-4000-8000-000000000b51', null, null, '', '배송 문의', '틀린 토큰', 'pgtap-cs-g1', repeat('b', 64)) ->> 'order_matched', 'false', '틀린 토큰은 연결 안 됨');
select is(public.myr_app_cs_open('00000000-0000-4000-8000-000000000b51', null, null, '', '배송 문의', '토큰 없음', 'pgtap-cs-g1') ->> 'order_matched', 'false', '토큰 없이 비회원 주문번호만으로는 연결 안 됨');

-- ---------- 스레드 — actor 가드 ----------
select ok(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_open), 'customer', null, (select (r ->> 'client_token')::uuid from t_open)) is not null, 'customer · client_token 으로 열림');
select is(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_open), 'customer', null, gen_random_uuid()), null, 'customer · 틀린 토큰 null');
select is(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_open), 'customer', '00000000-0000-4000-8000-0000000000c8', null), null, '비회원 문의는 회원 user_id 로 못 연다');
select ok(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_m), 'customer', '00000000-0000-4000-8000-0000000000c8', null) is not null, '회원 문의는 user_id 로 열림');
select is(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_m), 'customer', '00000000-0000-4000-8000-0000000000c9', null), null, '다른 회원은 null');
select ok(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_m), 'seller', '00000000-0000-4000-8000-000000000a51') is not null, 'seller · 내 상품 문의 열림');
select is(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_m), 'seller', '00000000-0000-4000-8000-000000000a52'), null, 'seller · 남의 상품 문의 null');
select ok(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_m), 'admin') is not null, 'admin 은 전부');
select is(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_m), 'hacker', null, (select (r ->> 'client_token')::uuid from t_open)), null, '모르는 actor 는 null');
select is(public.myr_app_cs_thread('cs0', 'admin'), null, '없는 코드 null');
-- JSON 모양
select ok(not (public.myr_app_cs_thread((select r ->> 'conversation_code' from t_m), 'admin') -> 'conversation' ? 'client_token'), '응답에 client_token 없음');
select is(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_m), 'admin') -> 'conversation' -> 'order' -> 'item' ->> 'name', '상품 A', '주문 줄은 이 상품(A)만');
select is(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_m), 'admin') -> 'conversation' -> 'product' ->> 'code', 'pgtap-cs-a', '상품 JSON');
select is(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_m), 'admin') -> 'conversation' -> 'seller' ->> 'name', '민지 루틴', '셀러 JSON');
select is(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_o), 'admin') -> 'conversation' -> 'order', 'null'::jsonb, '연결 안 된 주문은 null');
select is(jsonb_array_length(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_m), 'admin') -> 'messages'), 1, '메시지 1개');
select is(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_m), 'admin') -> 'conversation' ->> 'is_member', 'true', '회원 문의 is_member');
select is(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_m), 'admin') -> 'conversation' ->> 'first_body', '언제 오나요', '0064 first_body = 첫 질문');

-- ---------- 답변 · 상태 전이 ----------
select is(public.myr_app_cs_reply((select r ->> 'conversation_code' from t_m), 'hacker', null, null, null, 'x') ->> 'code', 'BAD_ACTOR', 'reply BAD_ACTOR');
select is(public.myr_app_cs_reply((select r ->> 'conversation_code' from t_m), 'seller', '00000000-0000-4000-8000-000000000a52', null, null, '남의 것') ->> 'code', 'NOT_FOUND', '남의 상품 문의 답변 NOT_FOUND');
select is(public.myr_app_cs_reply((select r ->> 'conversation_code' from t_m), 'seller', '00000000-0000-4000-8000-000000000a51', null, null, '   ') ->> 'code', 'BAD_BODY', '빈 답변 BAD_BODY');
create temp table t_r as select public.myr_app_cs_reply((select r ->> 'conversation_code' from t_m), 'seller', '00000000-0000-4000-8000-000000000a51', null, null, '내일 출발해요') as r;
select is((select r ->> 'status' from t_r), 'ANSWERED', '셀러 답변 → ANSWERED');
select is((select r -> 'message' ->> 'sender' from t_r), 'seller', '답변 sender = seller');
select ok((select replied_at is not null from public.myr_cs_conversations where code = (select r ->> 'conversation_code' from t_m)), 'replied_at 기록');
select is((select last_preview from public.myr_cs_conversations where code = (select r ->> 'conversation_code' from t_m)), '내일 출발해요', 'last_preview 갱신');
select is(public.myr_app_cs_reply((select r ->> 'conversation_code' from t_m), 'customer', '00000000-0000-4000-8000-0000000000c8', null, '00000000-0000-4000-8000-0000000000c8', '감사합니다 그런데요') ->> 'status', 'OPEN', '고객 추가 문의 → OPEN');
create temp table t_a as select public.myr_app_cs_reply((select r ->> 'conversation_code' from t_m), 'admin', null, null, null, '운영팀 대행 답변') as r;
select is((select r -> 'message' ->> 'sender' from t_a), 'seller', '관리자 대행 답변 표시는 seller');
select is((select r -> 'message' ->> 'actor_role' from t_a), 'admin', '실제 역할은 admin');
select is((select r ->> 'status' from t_a), 'ANSWERED', '대행 답변 → ANSWERED');
select is(jsonb_array_length(public.myr_app_cs_thread((select r ->> 'conversation_code' from t_m), 'admin') -> 'messages'), 4, '메시지 4개 시간순');
select is((select e ->> 'first_body' from jsonb_array_elements(public.myr_app_cs_list('customer', '00000000-0000-4000-8000-0000000000c8')) e where e ->> 'code' = (select r ->> 'conversation_code' from t_m)), '언제 오나요', '답변이 쌓여도 first_body 는 첫 질문 그대로');

-- ---------- 목록 ----------
select is(jsonb_array_length(public.myr_app_cs_list('seller', '00000000-0000-4000-8000-000000000a51')), 6, '셀러 A 의 문의 6건(상품 A)');
select is(jsonb_array_length(public.myr_app_cs_list('seller', '00000000-0000-4000-8000-000000000a52')), 2, '셀러 B 의 문의 2건(상품 B)');
select is(jsonb_array_length(public.myr_app_cs_list('customer', '00000000-0000-4000-8000-0000000000c8')), 2, '회원 c8 의 문의 2건(비회원 접수는 제외)');
select is(public.myr_app_cs_list('seller', '00000000-0000-4000-8000-000000000a51') -> 0 ->> 'status', 'OPEN', 'OPEN 이 먼저');
select is(jsonb_array_length(public.myr_app_cs_list('seller', '00000000-0000-4000-8000-000000000a51', 'ANSWERED')), 1, '상태 필터');
select is(public.myr_app_cs_list('customer', null), '[]'::jsonb, 'actor_id 없는 customer 는 빈 배열');
select is(public.myr_app_cs_list('hacker'), '[]'::jsonb, '모르는 actor 빈 배열');
select is(jsonb_array_length(public.myr_app_cs_for_order('00000000-0000-4000-8000-000000000d51')), 2, '주문 m1 에 연결된 문의 2건(A 줄 · B 줄)');

-- ---------- 종료 ----------
select is(public.myr_app_cs_close((select r ->> 'conversation_code' from t_m), 'customer', '00000000-0000-4000-8000-0000000000c8') ->> 'code', 'BAD_ACTOR', '고객은 종료 못 함');
select is(public.myr_app_cs_close((select r ->> 'conversation_code' from t_m), 'seller', '00000000-0000-4000-8000-000000000a52') ->> 'code', 'NOT_FOUND', '남의 셀러 종료 NOT_FOUND');
select is(public.myr_app_cs_close((select r ->> 'conversation_code' from t_m), 'seller', '00000000-0000-4000-8000-000000000a51') ->> 'already', 'false', '셀러 종료');
select is(public.myr_app_cs_close((select r ->> 'conversation_code' from t_m), 'admin') ->> 'already', 'true', '두 번째는 already');
select is(public.myr_app_cs_reply((select r ->> 'conversation_code' from t_m), 'customer', '00000000-0000-4000-8000-0000000000c8', null, null, '더요') ->> 'code', 'CLOSED', '종료 뒤 추가 문의 CLOSED');

select * from finish();
rollback;
