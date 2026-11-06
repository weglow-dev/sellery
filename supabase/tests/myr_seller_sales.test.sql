-- pgTAP — 0076 크리에이터 실적(홈 지표): 권한 · 내 줄만 · 결제된 주문만 · 이번 달(KST 경계) · 순매출 · 판매 수량 · 환불 주문 수 · 정산 예정(마진 없으면 null) · 최근 7일 · 계정으로 조회
begin;
select plan(17);

-- ---------- 권한 ----------
select function_privs_are('public', 'myr_app_seller_sales', '{uuid,timestamptz}'::text[], 'anon', '{}'::text[], 'anon 은 seller_sales 불가');
select function_privs_are('public', 'myr_app_seller_sales', '{uuid,timestamptz}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 seller_sales 불가');
select function_privs_are('public', 'myr_app_seller_sales', '{uuid,timestamptz}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 seller_sales 가능');
select function_privs_are('public', 'myr_app_seller_sales_of_user', '{uuid,timestamptz}'::text[], 'anon', '{}'::text[], 'anon 은 sales_of_user 불가');
select function_privs_are('public', 'myr_app_seller_sales_of_user', '{uuid,timestamptz}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 sales_of_user 불가');

-- ---------- 픽스처 — 기준 시각 2026-11-15 12:00 KST ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000f81', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-sales1@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-000000000f82', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-sales-none@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id)
values ('00000000-0000-4000-8000-000000000f91', '민지 루틴', '@pgtap.sales1', 'instagram', true, '00000000-0000-4000-8000-000000000f81'),
       ('00000000-0000-4000-8000-000000000f92', '하루 웰', '@pgtap.sales2', 'instagram', true, null);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-000000000fa1', 'pgtap-sales-p1', '00000000-0000-4000-8000-000000000f91', 'diet', '내 상품', 10000, 100, 'listed', 'pill'),
       ('00000000-0000-4000-8000-000000000fa2', 'pgtap-sales-p2', '00000000-0000-4000-8000-000000000f92', 'diet', '남의 상품', 9000, 100, 'listed', 'pill'),
       ('00000000-0000-4000-8000-000000000fa3', 'pgtap-sales-p3', '00000000-0000-4000-8000-000000000f91', 'diet', '내 상품 2', 15000, 100, 'listed', 'pill');
insert into public.myr_orders (id, status, paid_at, buyer_name, shipping, order_name, items_amount)
values ('00000000-0000-4000-8000-000000000fb1', 'PAID',             '2026-11-15 01:00:00+09', '고객1', '{}', 'o1', 29000),  -- 오늘 · 남의 줄도 섞임
       ('00000000-0000-4000-8000-000000000fb2', 'PARTIAL_REFUNDED', '2026-11-10 10:00:00+09', '고객2', '{}', 'o2', 30000),  -- 3개 중 1개 환불
       ('00000000-0000-4000-8000-000000000fb3', 'PAID',             '2026-10-31 23:30:00+09', '고객3', '{}', 'o3', 10000),  -- KST 10월(제외)
       ('00000000-0000-4000-8000-000000000fb4', 'PAID',             '2026-11-01 00:30:00+09', '고객4', '{}', 'o4', 10000),  -- KST 11월(UTC 로는 10월 31일)
       ('00000000-0000-4000-8000-000000000fb5', 'WAITING_DEPOSIT',  null,                     '고객5', '{}', 'o5', 10000),  -- 입금 대기(제외)
       ('00000000-0000-4000-8000-000000000fb6', 'REFUNDED',         '2026-11-12 09:00:00+09', '고객6', '{}', 'o6', 15000);  -- 전액 환불
insert into public.myr_order_items (order_id, product_id, seller_id, product_name, qty, unit_price, refunded_qty, refund_amount, status)
values ('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000fa1', '00000000-0000-4000-8000-000000000f91', '내 상품', 2, 10000, 0, 0, 'PAID'),
       ('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000fa2', '00000000-0000-4000-8000-000000000f92', '남의 상품', 1, 9000, 0, 0, 'PAID'),
       ('00000000-0000-4000-8000-000000000fb2', '00000000-0000-4000-8000-000000000fa1', '00000000-0000-4000-8000-000000000f91', '내 상품', 3, 10000, 1, 10000, 'PARTIAL_REFUNDED'),
       ('00000000-0000-4000-8000-000000000fb3', '00000000-0000-4000-8000-000000000fa1', '00000000-0000-4000-8000-000000000f91', '내 상품', 1, 10000, 0, 0, 'PAID'),
       ('00000000-0000-4000-8000-000000000fb4', '00000000-0000-4000-8000-000000000fa1', '00000000-0000-4000-8000-000000000f91', '내 상품', 1, 10000, 0, 0, 'PAID'),
       ('00000000-0000-4000-8000-000000000fb5', '00000000-0000-4000-8000-000000000fa1', '00000000-0000-4000-8000-000000000f91', '내 상품', 1, 10000, 0, 0, 'PAID'),
       ('00000000-0000-4000-8000-000000000fb6', '00000000-0000-4000-8000-000000000fa3', '00000000-0000-4000-8000-000000000f91', '내 상품 2', 1, 15000, 1, 15000, 'REFUNDED');
create temp table s as select public.myr_app_seller_sales('00000000-0000-4000-8000-000000000f91', '2026-11-15 12:00:00+09') as r;

-- ---------- 이번 달 ----------
select is((select r ->> 'month' from s), '2026-11', '달 = 기준 시각의 KST 달');
select is((select jsonb_build_object('gross', r -> 'gross', 'refunds', r -> 'refunds', 'net', r -> 'net') from s),
  '{"gross": 75000, "refunds": 25000, "net": 50000}'::jsonb, '매출 · 환불 · 순매출 — 내 줄 · 결제된 주문 · KST 11월만(10월 31일 23:30 KST 제외 · 11월 1일 00:30 KST 포함 · 입금 대기 제외)');
select is((select (r ->> 'orders')::int from s), 4, '주문 수 = 내 줄이 있는 결제 주문(남의 줄이 섞인 주문도 1건)');
select is((select (r ->> 'units')::int from s), 5, '판매 수량 = 수량 − 환불 수량(2 + 2 + 1 + 0)');
select is((select (r ->> 'refunded_orders')::int from s), 2, '환불 주문 수 = 부분 + 전액');
select is((select r -> 'payout' from s), 'null'::jsonb, '마진율이 비면 정산 예정은 null(정산 비율 미정)');

-- ---------- 최근 7일 ----------
select is((select jsonb_array_length(r -> 'week') from s), 7, '7일');
select is((select jsonb_agg(e ->> 'date') from s, jsonb_array_elements(r -> 'week') e), '["2026-11-09","2026-11-10","2026-11-11","2026-11-12","2026-11-13","2026-11-14","2026-11-15"]'::jsonb, '오늘 포함 7일 · 오래된 날부터');
select is((select jsonb_agg((e ->> 'orders')::int) from s, jsonb_array_elements(r -> 'week') e), '[0,1,0,1,0,0,1]'::jsonb, '날짜별 주문 수(10일 · 12일 · 15일)');

-- ---------- 마진율이 다 있으면 정산 예정 ----------
update public.myr_order_items set seller_margin_rate = 0.3 where seller_id = '00000000-0000-4000-8000-000000000f91';
select is((public.myr_app_seller_sales('00000000-0000-4000-8000-000000000f91', '2026-11-15 12:00:00+09') ->> 'payout')::int, 15000, '정산 예정 = Σ(줄 금액 − 환불) × 마진율 = 50000 × 0.3');

-- ---------- 계정으로 · 빈 크리에이터 ----------
select is(public.myr_app_seller_sales_of_user('00000000-0000-4000-8000-000000000f81', '2026-11-15 12:00:00+09'), public.myr_app_seller_sales('00000000-0000-4000-8000-000000000f91', '2026-11-15 12:00:00+09'), '계정으로 조회 = 크리에이터 조회');
select ok(public.myr_app_seller_sales_of_user('00000000-0000-4000-8000-000000000f82') is null, '크리에이터 연결 없는 계정은 null');

select * from finish();
rollback;
