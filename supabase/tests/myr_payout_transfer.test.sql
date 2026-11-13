-- pgTAP — 0111 자동 이체 기준: 지급 예정 시각(myr_payout_pay_due_at) · 크리에이터 상태 문구(myr_payout_creator_label) · 이체 상태(myr_payout_transfer_json) ·
--   크리에이터에게 보이는 실패 종류(myr_payout_fail_kind — 운영 쪽은 ops 로 합친다) · 칸 제약 · 크리에이터 정산 응답.
-- 2036년 회차를 쓴다(다른 정산 테스트와 겹치지 않게). 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(27);

select function_privs_are('public', 'myr_payout_fail_kind', '{myr_payouts}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 fail_kind 불가');
select function_privs_are('public', 'myr_payout_pay_due_at', '{myr_payouts,"timestamp with time zone"}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 pay_due_at 불가');
select function_privs_are('public', 'myr_payout_creator_label', '{myr_payouts}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 creator_label 불가');
select function_privs_are('public', 'myr_payout_transfer_json', '{myr_payouts}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 transfer_json 불가');

-- ---------- 픽스처 ----------
-- Q1: 사업자 정보 확인 완료 · 계좌 있음 · 콘솔 계정 / Q2: 확인 전
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000e70c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-pt1@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id, myr_settle_status, bank_info)
values ('00000000-0000-4000-8000-0000000e7001', '지급 1', '@pgtap.pt1', 'instagram', true, '00000000-0000-4000-8000-0000000e70c1', 'verified', '{"bank": "국민", "account": "12345678", "holder": "지급 1"}'),
       ('00000000-0000-4000-8000-0000000e7002', '지급 2', '@pgtap.pt2', 'instagram', true, null, 'pending', '{"bank": "신한", "account": "99990000", "holder": "지급 2"}');
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-0000000e7a01', 'pgtap-pt-1', '00000000-0000-4000-8000-0000000e7001', 'diet', 'Q1', 10000, 1000, 'listed', 'grape'),
       ('00000000-0000-4000-8000-0000000e7a02', 'pgtap-pt-2', '00000000-0000-4000-8000-0000000e7002', 'diet', 'Q2', 10000, 1000, 'listed', 'lemon');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000e7a01', 0, '제조금액 없음', 'test');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000e7a02', 0, '제조금액 없음', 'test');
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount)
values ('00000000-0000-4000-8000-0000000e7b01', 'pgtap-pt-1', 'PAID', '2036-01-02', '김지은', '{}', '주문', 0);
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, qty, unit_price, ship_status, delivered_at)
values ('00000000-0000-4000-8000-0000000e7d01', '00000000-0000-4000-8000-0000000e7b01', '00000000-0000-4000-8000-0000000e7a01', '00000000-0000-4000-8000-0000000e7001', '줄', 5, 10000, 'DELIVERED', '2036-01-10 12:00+09'),
       ('00000000-0000-4000-8000-0000000e7d02', '00000000-0000-4000-8000-0000000e7b01', '00000000-0000-4000-8000-0000000e7a02', '00000000-0000-4000-8000-0000000e7002', '줄', 2, 10000, 'DELIVERED', '2036-01-11 12:00+09');
-- 0106 — 회차는 정산할 차례인 달만(myr_settlement_due = 마지막 회차 다음 달). 로컬 DB 에 예전 회차가 있어도 결과가 같게 직전 회차(2032-12)를 둔다
insert into public.myr_settlement_runs (month, cutoff_at, created_by) values ('2035-12-01', '2036-01-01 13:00+09', 'pgtap');
select is(public.myr_settlement_run('2036-01-01', 'test', '2036-02-01 13:00+09') ->> 'ok', 'true', '1월 회차');

-- 세금계산서 확인 완료(0104) — 이 파일은 지급 목록 · 지급 완료을 보므로 세금계산서는 먼저 확인해 둔다(세금계산서 자체는 myr_tax_invoice.test.sql)
create function pg_temp.invoice_ok(p_month date, p_handle text) returns void language sql as $$
  insert into public.myr_tax_invoices (payout_id, approval_no, total, status, checked_at, checked_by)
  select p.id, public.myr_tax_invoice_no(to_char(p_month, 'YYYYMMDD') || left(md5(p.id::text), 16)), public.myr_payout_invoice_total(p), 'accepted', now(), 'test'
    from public.myr_payout_find(p_month, p_handle) p;
  select public.myr_payout_refresh((public.myr_payout_find(p_month, p_handle)).id);
$$;
select pg_temp.invoice_ok('2036-01-01', '@pgtap.pt1');
select pg_temp.invoice_ok('2036-01-01', '@pgtap.pt2');

create function pg_temp.po(p_handle text) returns public.myr_payouts language sql as $$ select public.myr_payout_find('2036-01-01', p_handle) $$;
create function pg_temp.tr(p_handle text, p_state text, p_fail text) returns void language sql as $$
  update public.myr_payouts set transfer_state = p_state, transfer_fail = p_fail, transfer_tries = transfer_tries + 1, transfer_at = now() where id = (pg_temp.po(p_handle)).id
$$;

-- 칸 제약 — 실패일 때만 실패 종류 · 지급 완료면 이체 상태 없음
select throws_ok($$update public.myr_payouts set transfer_state = 'failed', transfer_fail = null where id = (pg_temp.po('@pgtap.pt1')).id$$, '23514', null, '실패인데 실패 종류가 없으면 거절');
select throws_ok($$update public.myr_payouts set transfer_state = null, transfer_fail = 'retry' where id = (pg_temp.po('@pgtap.pt1')).id$$, '23514', null, '실패가 아닌데 실패 종류가 있으면 거절');
select throws_ok($$update public.myr_payouts set transfer_fail = 'bank' , transfer_state = 'failed' where id = (pg_temp.po('@pgtap.pt1')).id$$, '23514', null, '모르는 실패 종류 거절');

-- 지급할 수 있는 지급 건(Q1 · 사업자 정보 · 세금계산서 확인) — 다음 오후 1시 · 상태 "지급 예정"
select is(public.myr_payout_pay_due_at(pg_temp.po('@pgtap.pt1'), '2036-02-05 10:00+09'), '2036-02-05 13:00+09'::timestamptz, '지급할 수 있으면 다음 오후 1시(오전 → 그날 1시)');
select is(public.myr_payout_pay_due_at(pg_temp.po('@pgtap.pt1'), '2036-02-05 14:00+09'), '2036-02-06 13:00+09'::timestamptz, '오후 1시가 지났으면 다음 날 1시');
select is(public.myr_payout_creator_label(pg_temp.po('@pgtap.pt1')), '지급 예정', '크리에이터 상태 — 지급 예정');
select is(public.myr_payout_transfer_json(pg_temp.po('@pgtap.pt1')), null, '이체 상태가 없으면 null');
-- 지급 보류(Q2 · 사업자 정보 확인 전) — 지급 예정 시각 없음
select is(public.myr_payout_pay_due_at(pg_temp.po('@pgtap.pt2'), '2036-02-05 10:00+09'), null, '지급 보류면 지급 예정 시각 없음');
select is(public.myr_payout_creator_label(pg_temp.po('@pgtap.pt2')), '지급 보류', '크리에이터 상태 — 지급 보류');

-- 송금 중
select pg_temp.tr('@pgtap.pt1', 'sending', null);
select is(public.myr_payout_creator_label(pg_temp.po('@pgtap.pt1')), '지급 중', '송금 중 — 지급 중');
select is(public.myr_payout_pay_due_at(pg_temp.po('@pgtap.pt1'), '2036-02-05 10:00+09'), null, '송금 중이면 예정 시각 없음');
select is(public.myr_payout_transfer_json(pg_temp.po('@pgtap.pt1')), '{"state": "sending", "kind": null, "tries": 1}'::jsonb, '이체 상태 — 송금 중');
-- 실패 · 잠깐 안 됨 — 다음 오후 1시 재시도
select pg_temp.tr('@pgtap.pt1', 'failed', 'retry');
select is(public.myr_payout_creator_label(pg_temp.po('@pgtap.pt1')), '지급 지연', '재시도 — 지급 지연');
select is(public.myr_payout_pay_due_at(pg_temp.po('@pgtap.pt1'), '2036-02-05 14:00+09'), '2036-02-06 13:00+09'::timestamptz, '재시도면 다음 오후 1시');
select is(public.myr_payout_transfer_json(pg_temp.po('@pgtap.pt1')) ->> 'kind', 'retry', '실패 종류 — retry');
-- 실패 · 계좌 문제 — 크리에이터가 다시 입력
select pg_temp.tr('@pgtap.pt1', 'failed', 'account');
select is(public.myr_payout_creator_label(pg_temp.po('@pgtap.pt1')), '지급 실패', '계좌 문제 — 지급 실패');
select is(public.myr_payout_pay_due_at(pg_temp.po('@pgtap.pt1'), '2036-02-05 10:00+09'), null, '계좌 문제면 예정 시각 없음(다시 입력 · 확인 뒤)');
-- 실패 · 운영 쪽(잔액 · 한도) · 결과 불명 — 크리에이터에게는 이유 없이 "확인 중"
select pg_temp.tr('@pgtap.pt1', 'failed', 'ops');
select is(jsonb_build_array(public.myr_payout_creator_label(pg_temp.po('@pgtap.pt1')), public.myr_payout_fail_kind(pg_temp.po('@pgtap.pt1'))), '["지급 확인 중", "ops"]'::jsonb, '운영 쪽 — 지급 확인 중 · ops');
select pg_temp.tr('@pgtap.pt1', 'failed', 'check');
select is(jsonb_build_array(public.myr_payout_creator_label(pg_temp.po('@pgtap.pt1')), public.myr_payout_fail_kind(pg_temp.po('@pgtap.pt1'))), '["지급 확인 중", "ops"]'::jsonb, '결과 불명도 크리에이터에게는 ops(이유를 싣지 않는다)');
select is(public.myr_payout_pay_due_at(pg_temp.po('@pgtap.pt1'), '2036-02-05 10:00+09'), null, '운영 확인 중이면 예정 시각 없음');

-- 지급 완료면 이체 상태가 남을 수 없다
select throws_ok($$update public.myr_payouts set status = 'paid', paid_at = now(), paid_amount = 1, paid_on = '2036-02-06' where id = (pg_temp.po('@pgtap.pt1')).id$$, '23514', null, '이체 상태가 남은 채 지급 완료 거절');

-- 크리에이터 정산 응답 — 달마다 payout_label · pay_due_at · transfer
select pg_temp.tr('@pgtap.pt1', 'failed', 'retry');
select is((select jsonb_build_object('label', e ->> 'payout_label', 'kind', e #>> '{transfer,kind}', 'due', (e ->> 'pay_due_at')::timestamptz)
             from jsonb_array_elements(public.myr_app_seller_settlements_of_user('00000000-0000-4000-8000-0000000e70c1', '2036-02-05 10:00+09') -> 'months') e where e ->> 'month' = '2036-01'),
          jsonb_build_object('label', '지급 지연', 'kind', 'retry', 'due', '2036-02-05 13:00+09'::timestamptz), '정산 응답 — 지급 지연 · retry · 다음 오후 1시');

select * from finish();
rollback;
