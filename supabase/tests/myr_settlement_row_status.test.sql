-- pgTAP — 0114 정산 줄 상태 함수(myr_settlement_row_confirmed · myr_settlement_row_held)를 상계 합 · 지급 건에 담을 줄 · 풀 수 있는 보류 줄 ·
--   원장 대기 보류 목록 · 정산 탭 보류 건수가 같이 쓴다. 두 함수는 상태 글자 비교와 모든 줄에서 같다(계산 결과 불변).
-- 2032년 회차를 쓴다(로컬 DB 의 실제 회차 · 다른 테스트와 겹치지 않게). 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(14);

select function_privs_are('public', 'myr_settlement_row_confirmed', '{myr_settlement_rows}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 row_confirmed 불가');
select function_privs_are('public', 'myr_settlement_row_held', '{myr_settlement_rows}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 row_held 불가');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000fd01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-rowstatus@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id) values ('00000000-0000-4000-8000-00000000fd11', '민지 루틴', '@pgtap.rowstatus', 'instagram', true, '00000000-0000-4000-8000-00000000fd01');
-- P: 보류 줄 둘(5월 · 6월) · Q: 보류 줄 하나(원장 없음 — 끝까지 보류)
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-00000000fd21', 'pgtap-rs-p', '00000000-0000-4000-8000-00000000fd11', 'diet', '보리 차', 10000, 100, 'listed', 'pill'),
       ('00000000-0000-4000-8000-00000000fd22', 'pgtap-rs-q', '00000000-0000-4000-8000-00000000fd11', 'diet', '옥수수 차', 10000, 100, 'listed', 'pill');
insert into public.myr_settlement_runs (id, month, cutoff_at, created_by)
values ('00000000-0000-4000-8000-00000000fd31', '2032-05-01', '2032-06-01 13:00+09', 'pgtap'),
       ('00000000-0000-4000-8000-00000000fd32', '2032-06-01', '2032-07-01 13:00+09', 'pgtap');
insert into public.myr_settlement_rows (id, run_id, product_id, seller_id, pct, sales, refund_adj, carry_in, base, carry_out, settle, status)
values ('00000000-0000-4000-8000-00000000fd41', '00000000-0000-4000-8000-00000000fd31', '00000000-0000-4000-8000-00000000fd21', '00000000-0000-4000-8000-00000000fd11', 60, 50000, 0, 0, 50000, 0, 30000, 'held'),
       ('00000000-0000-4000-8000-00000000fd42', '00000000-0000-4000-8000-00000000fd32', '00000000-0000-4000-8000-00000000fd21', '00000000-0000-4000-8000-00000000fd11', 60, 20000, 0, 0, 20000, 0, 12000, 'held'),
       ('00000000-0000-4000-8000-00000000fd43', '00000000-0000-4000-8000-00000000fd31', '00000000-0000-4000-8000-00000000fd22', '00000000-0000-4000-8000-00000000fd11', 60, 10000, 0, 0, 10000, 0, 6000, 'held');

-- 보류 줄 — 확정 아님 · 보류
select is((select jsonb_agg(jsonb_build_array(public.myr_settlement_row_confirmed(r), public.myr_settlement_row_held(r)) order by r.id) from public.myr_settlement_rows r where r.seller_id = '00000000-0000-4000-8000-00000000fd11'),
          '[[false, true], [false, true], [false, true]]'::jsonb, '보류 줄 셋 — row_confirmed false · row_held true');
select is(public.myr_mfg_offset_total('00000000-0000-4000-8000-00000000fd21'), 0, 'P 상계 합 0(확정 줄 없음)');
select is((select jsonb_object_agg(e #>> '{product,code}', jsonb_build_array(e -> 'months', (e ->> 'settle')::int)) from jsonb_array_elements(public.myr_mfg_pending() -> 'held') e where e #>> '{product,code}' like 'pgtap-rs-%'),
          '{"pgtap-rs-p": [["2032-05", "2032-06"], 42000], "pgtap-rs-q": [["2032-05"], 6000]}'::jsonb, '원장 대기 보류 목록 — P(5월 · 6월 4.2만) · Q(5월 6천)');
select is((select (m #>> '{total,held}')::int from jsonb_array_elements(public.myr_app_seller_settlements_of_user('00000000-0000-4000-8000-00000000fd01', '2032-07-02 10:00+09') -> 'months') m where m ->> 'month' = '2032-05'),
          2, '정산 탭 5월 카드 — 보류 2건(P · Q)');

-- P 원장 입력 → 운영 보류 확정 — 확정 줄이 되고 상계 합 · 지급 건에 담을 줄 · 보류 목록 · 보류 건수가 같이 바뀐다
select ok(public.myr_mfg_add('00000000-0000-4000-8000-00000000fd21', 10000, '1차', 'test') ->> 'ok' = 'true', 'P 원장 입력(1만)');
select is(public.myr_settlement_confirm_held('00000000-0000-4000-8000-00000000fd21', 'test') ->> 'confirmed', '2', 'P 보류 2개 확정');
select is((select jsonb_agg(jsonb_build_array(public.myr_settlement_row_confirmed(r), public.myr_settlement_row_held(r), public.myr_settlement_row_payable(r), public.myr_settlement_row_releasable(r)) order by r.id)
             from public.myr_settlement_rows r where r.product_id = '00000000-0000-4000-8000-00000000fd21'),
          '[[true, false, true, false], [true, false, true, false]]'::jsonb, 'P 확정 줄 — row_confirmed · 지급 건에 담을 줄 ○ / row_held · 풀 수 있는 보류 줄 ×');
select is(public.myr_mfg_offset_total('00000000-0000-4000-8000-00000000fd21'), 10000, 'P 상계 합 1만(확정 줄의 상계)');
select is(public.myr_mfg_offset_total('00000000-0000-4000-8000-00000000fd21'),
          (select coalesce(sum(r.offset_amount), 0)::int from public.myr_settlement_rows r where r.product_id = '00000000-0000-4000-8000-00000000fd21' and r.status = 'confirmed'),
          '상계 합 = 상태 글자로 고른 확정 줄의 상계 합(계산 결과 불변)');
select is((select jsonb_agg(e #>> '{product,code}') from jsonb_array_elements(public.myr_mfg_pending() -> 'held') e where e #>> '{product,code}' like 'pgtap-rs-%'),
          '["pgtap-rs-q"]'::jsonb, '원장 대기 보류 목록 — Q 만 남는다');
select is((select (m #>> '{total,held}')::int from jsonb_array_elements(public.myr_app_seller_settlements_of_user('00000000-0000-4000-8000-00000000fd01', '2032-07-02 10:00+09') -> 'months') m where m ->> 'month' = '2032-05'),
          1, '정산 탭 5월 카드 — 보류 1건(Q)');

-- 모든 정산 줄에서 두 함수 = 상태 글자 비교(로컬 DB 의 실제 줄 포함)
select is((select count(*)::int from public.myr_settlement_rows r
            where public.myr_settlement_row_confirmed(r) is distinct from (r.status = 'confirmed') or public.myr_settlement_row_held(r) is distinct from (r.status = 'held')), 0,
          '모든 정산 줄 — row_confirmed · row_held 가 상태 글자 비교와 같다');

select * from finish();
rollback;
