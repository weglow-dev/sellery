-- pgTAP — 0089 크리에이터 정산 탭: 권한 · 예상(preview)이 실제 회차와 같은지 · 내 것만 · 월 내역 · 줄 내역(이름 가림) · 홈 예상
-- 2030년을 쓴다(로컬 DB 의 실제 회차와 겹치지 않게). 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(44);

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
-- 0106 — 정산할 달은 마지막 회차 다음 달(빠진 달 중 가장 오래된 달). 로컬 DB 에 예전 회차가 있어도 결과가 같게 직전 회차(2029-12)를 둔다
insert into public.myr_settlement_runs (month, cutoff_at, created_by) values ('2029-12-01', '2030-01-01 13:00+09', 'pgtap');
create temp table pv as select public.myr_settlement_preview('00000000-0000-4000-8000-0000000a9001', '2030-02-01 10:00+09') as v;
create temp table hp as select public.myr_app_seller_settle_preview_of_user('00000000-0000-4000-8000-0000000a9e01', '2030-02-01 10:00+09') as v;
select is((select count(*)::int from jsonb_array_elements(public.myr_app_seller_settle_preview_items_of_user('00000000-0000-4000-8000-0000000a9e01', '2030-02-01 10:00+09'))), 2, '예상 주문 줄 2줄(P · Q · 배송 전 줄 제외)');
select is((select e ->> 'buyer' from jsonb_array_elements(public.myr_app_seller_settle_preview_items_of_user('00000000-0000-4000-8000-0000000a9e01', '2030-02-01 10:00+09')) e limit 1), '김*은', '예상 주문 줄 — 고객 이름 가림');
select function_privs_are('public', 'myr_app_seller_settle_preview_items_of_user', '{uuid,timestamptz}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 preview_items 불가');
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
          '{"held": 1, "offset": 100000, "payout": 45000, "net_sales": 200000, "deposit_refund": 25000}'::jsonb, '1월 합계 — 상계 10만 · 보증금 2.5만 · 지급 4.5만(지급 건) · 보류 1 · 정산 기준 매출 20만(서버)');
select is((select array[(e ->> 'remaining')::int, (e ->> 'deposit_refunded')::int, (e ->> 'has_ledger')::boolean::int] from st, jsonb_array_elements(v -> 'ledgers') e where e #>> '{product,code}' = 'pgtap-ss-p'),
          array[0, 25000, 1], 'P 원장 — 남은 제조금액 0 · 보증금 환급 2.5만');
select is((select (e ->> 'has_ledger')::boolean from st, jsonb_array_elements(v -> 'ledgers') e where e #>> '{product,code}' = 'pgtap-ss-q'), false, 'Q 원장 — 없음(보류 안내용)');
select ok(not (select bool_or(e #>> '{product,code}' = 'pgtap-ss-r') from st, jsonb_array_elements(v -> 'ledgers') e), '다른 크리에이터 원장은 없다');
select is((select count(*)::int from jsonb_array_elements(public.myr_app_seller_settlement_items_of_user('00000000-0000-4000-8000-0000000a9e01', '2030-01-15'))), 2, '1월 줄 내역 2줄(P · Q)');
select is((select e ->> 'buyer' from jsonb_array_elements(public.myr_app_seller_settlement_items_of_user('00000000-0000-4000-8000-0000000a9e01', '2030-01-01')) e limit 1), '김*은', '줄 내역 — 고객 이름 가림');
select is(public.myr_app_seller_settlement_items_of_user('00000000-0000-4000-8000-0000000a9e02', '2030-01-01') @> '[{"product_code": "pgtap-ss-p"}]'::jsonb, false, '다른 크리에이터 계정은 내 줄을 못 본다');
select ok((select not (v ? 'rows') and v #>> '{total,payout}' = '45000' from hp), '홈 예상 — 합계만(회차 전 지급 4.5만)');

-- ---------- 보류 자동 해제(2026-11-10) — 2월에 보류된 줄이 3월 회차에서 먼저 확정되고, 같은 상품의 3월 줄은 줄어든 남은 제조금액으로 ----------
-- X: 2월 판매 10만(원장 없음 → 보류) · 원장 10만 · 보증금 2.5만 입금 · 3월 판매 10만
-- Y: 2월 판매 5만(보류) · 원장 2만 · 3월 판매 없음(그래도 해제)
-- Z: 2월 판매 3만(보류) · 원장 끝까지 없음(계속 보류)
-- W: 2월 판매 4만(보류) · 원장 입력 뒤 운영이 confirm_held 로 먼저 확정(회차가 다시 건드리지 않는다)
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-0000000a9a11', 'pgtap-ss-x', '00000000-0000-4000-8000-0000000a9001', 'diet', 'X 젤리', 100000, 100, 'listed', 'jelly'),
       ('00000000-0000-4000-8000-0000000a9a12', 'pgtap-ss-y', '00000000-0000-4000-8000-0000000a9001', 'diet', 'Y 스틱', 50000, 100, 'listed', 'stick'),
       ('00000000-0000-4000-8000-0000000a9a13', 'pgtap-ss-z', '00000000-0000-4000-8000-0000000a9001', 'diet', 'Z 캡슐', 30000, 100, 'listed', 'pill'),
       ('00000000-0000-4000-8000-0000000a9a14', 'pgtap-ss-w', '00000000-0000-4000-8000-0000000a9001', 'diet', 'W 필름', 40000, 100, 'listed', 'film');
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount)
values ('00000000-0000-4000-8000-0000000a9b11', 'pgtap-ss-11', 'PAID', '2030-02-02', '최유나', '{}', '주문', 0),
       ('00000000-0000-4000-8000-0000000a9b12', 'pgtap-ss-12', 'PAID', '2030-03-02', '박민', '{}', '주문', 0);
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, qty, unit_price, ship_status, delivered_at)
values ('00000000-0000-4000-8000-0000000a9c11', '00000000-0000-4000-8000-0000000a9b11', '00000000-0000-4000-8000-0000000a9a11', '00000000-0000-4000-8000-0000000a9001', 'X 젤리', 1, 100000, 'DELIVERED', '2030-02-10 12:00+09'),
       ('00000000-0000-4000-8000-0000000a9c12', '00000000-0000-4000-8000-0000000a9b11', '00000000-0000-4000-8000-0000000a9a12', '00000000-0000-4000-8000-0000000a9001', 'Y 스틱', 1, 50000, 'DELIVERED', '2030-02-10 12:00+09'),
       ('00000000-0000-4000-8000-0000000a9c13', '00000000-0000-4000-8000-0000000a9b11', '00000000-0000-4000-8000-0000000a9a13', '00000000-0000-4000-8000-0000000a9001', 'Z 캡슐', 1, 30000, 'DELIVERED', '2030-02-10 12:00+09'),
       ('00000000-0000-4000-8000-0000000a9c14', '00000000-0000-4000-8000-0000000a9b11', '00000000-0000-4000-8000-0000000a9a14', '00000000-0000-4000-8000-0000000a9001', 'W 필름', 1, 40000, 'DELIVERED', '2030-02-10 12:00+09'),
       ('00000000-0000-4000-8000-0000000a9c15', '00000000-0000-4000-8000-0000000a9b12', '00000000-0000-4000-8000-0000000a9a11', '00000000-0000-4000-8000-0000000a9001', 'X 젤리', 1, 100000, 'DELIVERED', '2030-03-10 12:00+09');
select is(public.myr_settlement_run('2030-02-01', 'test', '2030-03-01 13:00+09') ->> 'ok', 'true', '2월 회차 — X · Y · Z · W 보류');
select is((select count(*)::int from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
            where u.month = '2030-02-01' and r.status = 'held' and r.product_id in ('00000000-0000-4000-8000-0000000a9a11', '00000000-0000-4000-8000-0000000a9a12', '00000000-0000-4000-8000-0000000a9a13', '00000000-0000-4000-8000-0000000a9a14')),
          4, '2월 — 원장 없는 4개 보류');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000a9a11', 100000, '1차', 'test');
select public.myr_mfg_deposit('00000000-0000-4000-8000-0000000a9a11', 1, '2030-03-05');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000a9a12', 20000, '1차', 'test');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000a9a14', 0, '없음', 'test');
select is(public.myr_settlement_confirm_held('00000000-0000-4000-8000-0000000a9a14', 'test') ->> 'confirmed', '1', 'W — 운영이 회차 전에 먼저 확정');

-- 예상(3월 회차 전) — 보류 해제분이 먼저, 같은 상품의 3월 줄은 이어서
create temp table pv3 as select public.myr_settlement_preview('00000000-0000-4000-8000-0000000a9001', '2030-04-01 10:00+09') as v;
select is((select jsonb_agg(jsonb_build_array(e #>> '{product,code}', e ->> 'origin', (e ->> 'offset')::int, (e ->> 'deposit_refund')::int, (e ->> 'payout')::int) order by e ->> 'origin' nulls last, e #>> '{product,code}')
             from pv3, jsonb_array_elements(v -> 'rows') e),
          '[["pgtap-ss-w", "2030-02", 0, 0, 24000], ["pgtap-ss-x", "2030-02", 60000, 0, 0], ["pgtap-ss-y", "2030-02", 20000, 0, 10000], ["pgtap-ss-x", null, 40000, 25000, 45000]]'::jsonb,
          '예상 — W 2월분(운영이 먼저 확정 · 다음 회차 지급 건에 들어간다 · 0101) 2.4만 · X 2월분 6만 상계 → X 3월분 남은 4만 상계 · 보증금 2.5만 · Y 2월분 2만 상계 · Z 는 원장 없어 빠짐');
select is((select (v #>> '{total,payout}')::int from pv3), 79000, '예상 지급 합계 7.9만(W 2.4만 + X 0 + X 4.5만 + Y 1만)');

-- 실제 3월 회차 = 예상
select is(public.myr_settlement_run('2030-03-01', 'test', '2030-04-01 13:00+09') ->> 'released', '2', '3월 회차 — 보류 2개(X · Y) 자동 해제 · W(이미 확정) · Z(원장 없음)는 아님');
select is((select array[r.mfg_before, r.offset_amount, r.mfg_after, r.deposit_refund, r.payout] from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
            where u.month = '2030-02-01' and r.product_id = '00000000-0000-4000-8000-0000000a9a11'), array[100000, 60000, 40000, 0, 0], 'X 2월분 — 남은 10만 중 6만 상계(확정 때 남은 제조금액으로)');
select is((select array[r.mfg_before, r.offset_amount, r.mfg_after, r.deposit_refund, r.payout] from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
            where u.month = '2030-03-01' and r.product_id = '00000000-0000-4000-8000-0000000a9a11'), array[40000, 40000, 0, 25000, 45000], 'X 3월분 — 남은 4만 상계 · 다 갚아 보증금 2.5만 · 지급 4.5만(예상과 같다)');
select is((select ru.month from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id join public.myr_settlement_runs ru on ru.id = r.released_run_id
            where u.month = '2030-02-01' and r.product_id = '00000000-0000-4000-8000-0000000a9a12'), '2030-03-01'::date, 'Y 2월분 — 3월 판매가 없어도 3월 회차에서 해제');
select is((select r.status from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
            where u.month = '2030-02-01' and r.product_id = '00000000-0000-4000-8000-0000000a9a13'), 'held', 'Z — 원장이 없으면 계속 보류');
select is((select r.released_run_id from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
            where u.month = '2030-02-01' and r.product_id = '00000000-0000-4000-8000-0000000a9a14'), null, 'W — 운영이 먼저 확정한 줄은 회차가 다시 건드리지 않는다');
select is((select count(*)::int from public.myr_mfg_batches where product_id = '00000000-0000-4000-8000-0000000a9a11' and deposit_refund_row_id is not null), 1, 'X 보증금은 한 번만 환급');

-- 정산 탭 — 3월 카드에 2월분이 따로 줄로(같은 상품 두 줄) · 2월 카드는 "3월 정산에서 지급"으로 남고 합계에서 빠진다
create temp table st3 as select public.myr_app_seller_settlements_of_user('00000000-0000-4000-8000-0000000a9e01', '2030-04-02 10:00+09') as v;
select is((select jsonb_agg(jsonb_build_array(r #>> '{product,code}', r ->> 'origin') order by r ->> 'origin' nulls first, r #>> '{product,code}')
             from st3, jsonb_array_elements(v -> 'months') m, jsonb_array_elements(m -> 'rows') r where m ->> 'month' = '2030-03'),
          '[["pgtap-ss-x", null], ["pgtap-ss-w", "2030-02"], ["pgtap-ss-x", "2030-02"], ["pgtap-ss-y", "2030-02"]]'::jsonb, '3월 카드 — X 3월분 + 3월 지급 건에 담긴 2월분(W 먼저 확정 · X · Y 보류 해제)');
select is((select (m #>> '{total,payout}')::int from st3, jsonb_array_elements(v -> 'months') m where m ->> 'month' = '2030-03'), 79000, '3월 카드 지급 합계 = 3월 지급 건 7.9만(예상과 같다)');
select is((select jsonb_agg(jsonb_build_array(r #>> '{product,code}', r ->> 'released_in') order by r #>> '{product,code}')
             from st3, jsonb_array_elements(v -> 'months') m, jsonb_array_elements(m -> 'rows') r
            where m ->> 'month' = '2030-02' and r #>> '{product,code}' in ('pgtap-ss-w', 'pgtap-ss-x', 'pgtap-ss-y')),
          '[["pgtap-ss-w", "2030-03"], ["pgtap-ss-x", "2030-03"], ["pgtap-ss-y", "2030-03"]]'::jsonb, '2월 카드 — W · X · Y 는 "3월 정산에서 지급"으로 남는다');
select is((select (m #>> '{total,payout}')::int from st3, jsonb_array_elements(v -> 'months') m where m ->> 'month' = '2030-02'), 0, '2월 카드 합계 0 — 2월 회차 때 확정된 줄이 없어 2월 지급 건이 없다(같은 돈을 두 번 더하지 않게)');
select is((select count(*)::int from jsonb_array_elements(public.myr_app_seller_settlement_items_of_user('00000000-0000-4000-8000-0000000a9e01', '2030-03-01')) e where e ->> 'origin' = '2030-02'), 3,
          '3월 줄 내역 — 3월 지급 건에 담긴 2월분 주문 줄(운영이 먼저 확정한 W · 풀린 X · Y)도 origin 과 함께 — 카드와 같은 줄(myr_settlement_card_rows)');

select is((select month from public.myr_settlement_next('2030-03-20 10:00+09')), '2030-04-01'::date, '이번 달 회차가 이미 있으면(수동 실행) 다음 회차는 그 다음 달 — 이미 돈 달을 다시 예상하지 않는다');

select * from finish();
rollback;
