-- pgTAP — 0089 크리에이터 정산 탭: 권한 · 예상(preview)이 실제 회차와 같은지 · 내 것만 · 월 내역 · 줄 내역(이름 가림) · 홈 예상
-- 2030년을 쓴다(로컬 DB 의 실제 회차와 겹치지 않게). 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(23);

select function_privs_are('public', 'myr_app_seller_settlements_of_user', '{uuid,timestamptz}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 settlements_of_user 불가');
select function_privs_are('public', 'myr_app_seller_settlements_of_user', '{uuid,timestamptz}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 settlements_of_user 가능');
select function_privs_are('public', 'myr_app_seller_settle_preview_of_user', '{uuid,timestamptz}'::text[], 'anon', '{}'::text[], 'anon 은 preview_of_user 불가');
select function_privs_are('public', 'myr_app_seller_settlement_items_of_user', '{uuid,date}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 items_of_user 불가');
select function_privs_are('public', 'myr_settlement_preview', '{uuid,timestamptz}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 preview 불가');

-- ---------- 픽스처 — 민지(P: 원장 10만 · 보증금 2.5만 입금 / Q: 원장 없음) · 하루(R) ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000a9e01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-ss-a@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-0000000a9e02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-ss-b@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id)
values ('00000000-0000-4000-8000-0000000a9001', '민지 루틴', '@pgtap.ss1', 'instagram', true, '00000000-0000-4000-8000-0000000a9e01'),
       ('00000000-0000-4000-8000-0000000a9002', '하루 웰', '@pgtap.ss2', 'instagram', true, '00000000-0000-4000-8000-0000000a9e02');
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-0000000a9a01', 'pgtap-ss-p', '00000000-0000-4000-8000-0000000a9001', 'diet', '포도 젤리', 100000, 100, 'listed', 'grape'),
       ('00000000-0000-4000-8000-0000000a9a02', 'pgtap-ss-q', '00000000-0000-4000-8000-0000000a9001', 'diet', '레몬 스틱', 50000, 100, 'listed', 'lemon'),
       ('00000000-0000-4000-8000-0000000a9a03', 'pgtap-ss-r', '00000000-0000-4000-8000-0000000a9002', 'diet', '콜라겐', 30000, 100, 'listed', 'film');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000a9a01', 100000, '1차', 'test');
select public.myr_mfg_deposit('00000000-0000-4000-8000-0000000a9a01', 1, '2029-12-20');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000a9a03', 0, '없음', 'test');
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount)
values ('00000000-0000-4000-8000-0000000a9b01', 'pgtap-ss-1', 'PAID', '2030-01-02', '김지은', '{}', '주문1', 0),
       ('00000000-0000-4000-8000-0000000a9b02', 'pgtap-ss-2', 'PAID', '2030-01-25', '이현', '{}', '주문2', 0);
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, qty, unit_price, ship_status, delivered_at)
values ('00000000-0000-4000-8000-0000000a9c01', '00000000-0000-4000-8000-0000000a9b01', '00000000-0000-4000-8000-0000000a9a01', '00000000-0000-4000-8000-0000000a9001', '포도 젤리', 2, 100000, 'DELIVERED', '2030-01-10 12:00+09'),
       ('00000000-0000-4000-8000-0000000a9c02', '00000000-0000-4000-8000-0000000a9b01', '00000000-0000-4000-8000-0000000a9a02', '00000000-0000-4000-8000-0000000a9001', '레몬 스틱', 1, 50000, 'DELIVERED', '2030-01-10 12:00+09'),
       ('00000000-0000-4000-8000-0000000a9c03', '00000000-0000-4000-8000-0000000a9b01', '00000000-0000-4000-8000-0000000a9a03', '00000000-0000-4000-8000-0000000a9002', '콜라겐', 1, 30000, 'DELIVERED', '2030-01-10 12:00+09'),
       ('00000000-0000-4000-8000-0000000a9c04', '00000000-0000-4000-8000-0000000a9b02', '00000000-0000-4000-8000-0000000a9a01', '00000000-0000-4000-8000-0000000a9001', '포도 젤리', 1, 100000, 'SHIPPING', null);

-- ---------- 예상(1월 회차 전 · 2월 1일 10시) ----------
create temp table pv as select public.myr_settlement_preview('00000000-0000-4000-8000-0000000a9001', '2030-02-01 10:00+09') as v;
create temp table hp as select public.myr_app_seller_settle_preview_of_user('00000000-0000-4000-8000-0000000a9e01', '2030-02-01 10:00+09') as v;
select is((select v ->> 'month' from pv), '2030-01', '1일 13시 전 — 다음 회차는 지난달(1월)');
select is((select (v ->> 'settle_at')::timestamptz from pv), '2030-02-01 13:00+09'::timestamptz, '정산일 = 2월 1일 13:00(KST)');
select is((select array[(e ->> 'settle')::int, (e ->> 'offset')::int, (e ->> 'deposit_refund')::int, (e ->> 'payout')::int] from pv, jsonb_array_elements(v -> 'rows') e where e #>> '{product,code}' = 'pgtap-ss-p'),
          array[120000, 100000, 25000, 45000], 'P 예상 — 정산 12만 · 상계 10만(다 갚음) · 보증금 2.5만 · 지급 4.5만');
select is((select e ->> 'status' from pv, jsonb_array_elements(v -> 'rows') e where e #>> '{product,code}' = 'pgtap-ss-q'), 'held', 'Q 예상 — 원장 없음이면 보류');
select is((select v -> 'undelivered' from pv), '{"lines": 1, "amount": 100000}'::jsonb, '배송 완료 전 판매 1줄 · 10만');
select ok(not (select bool_or(e #>> '{product,code}' = 'pgtap-ss-r') from pv, jsonb_array_elements(v -> 'rows') e), '다른 크리에이터 상품(R)은 예상에 없다');

-- ---------- 실제 회차 = 예상 ----------
select is(public.myr_settlement_run('2030-01-01', 'test', '2030-02-01 13:00+09') ->> 'ok', 'true', '1월 회차');
select is((select array[r.settle, r.offset_amount, r.deposit_refund, r.payout] from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
            where u.month = '2030-01-01' and r.product_id = '00000000-0000-4000-8000-0000000a9a01'),
          (select array[(e ->> 'settle')::int, (e ->> 'offset')::int, (e ->> 'deposit_refund')::int, (e ->> 'payout')::int] from pv, jsonb_array_elements(v -> 'rows') e where e #>> '{product,code}' = 'pgtap-ss-p'),
          '실제 회차 금액 = 회차 전 예상(같은 계산 함수)');
select is(public.myr_settlement_preview('00000000-0000-4000-8000-0000000a9001', '2030-02-15 10:00+09') ->> 'month', '2030-02', '회차 뒤 — 다음 회차는 이번 달');
select is(jsonb_array_length(public.myr_settlement_preview('00000000-0000-4000-8000-0000000a9001', '2030-02-15 10:00+09') -> 'rows'), 0, '회차 뒤 — 새로 정산될 줄 없음');

-- ---------- 정산 탭 ----------
create temp table st as select public.myr_app_seller_settlements_of_user('00000000-0000-4000-8000-0000000a9e01', '2030-02-15 10:00+09') as v;
select is((select e #> '{total}' from st, jsonb_array_elements(v -> 'months') e where e ->> 'month' = '2030-01') - 'refund_adj' - 'sales' - 'settle',
          '{"held": 1, "offset": 100000, "payout": 45000, "deposit_refund": 25000}'::jsonb, '1월 합계 — 상계 10만 · 보증금 2.5만 · 지급 4.5만 · 보류 1');
select is((select array[(e ->> 'remaining')::int, (e ->> 'deposit_refunded')::int, (e ->> 'has_ledger')::boolean::int] from st, jsonb_array_elements(v -> 'ledgers') e where e #>> '{product,code}' = 'pgtap-ss-p'),
          array[0, 25000, 1], 'P 원장 — 남은 제조금액 0 · 보증금 환급 2.5만');
select is((select (e ->> 'has_ledger')::boolean from st, jsonb_array_elements(v -> 'ledgers') e where e #>> '{product,code}' = 'pgtap-ss-q'), false, 'Q 원장 — 없음(보류 안내용)');
select ok(not (select bool_or(e #>> '{product,code}' = 'pgtap-ss-r') from st, jsonb_array_elements(v -> 'ledgers') e), '다른 크리에이터 원장은 없다');
select is((select count(*)::int from jsonb_array_elements(public.myr_app_seller_settlement_items_of_user('00000000-0000-4000-8000-0000000a9e01', '2030-01-15'))), 2, '1월 줄 내역 2줄(P · Q)');
select is((select e ->> 'buyer' from jsonb_array_elements(public.myr_app_seller_settlement_items_of_user('00000000-0000-4000-8000-0000000a9e01', '2030-01-01')) e limit 1), '김*은', '줄 내역 — 고객 이름 가림');
select is(public.myr_app_seller_settlement_items_of_user('00000000-0000-4000-8000-0000000a9e02', '2030-01-01') @> '[{"product_code": "pgtap-ss-p"}]'::jsonb, false, '다른 크리에이터 계정은 내 줄을 못 본다');
select ok((select not (v ? 'rows') and v #>> '{total,payout}' = '45000' from hp), '홈 예상 — 합계만(회차 전 지급 4.5만)');

select * from finish();
rollback;
