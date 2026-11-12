-- pgTAP — 0103 운영 지급 완료 기록: 권한 · 지급 목록(지급 가능만 · 계좌 원문) · 지급 완료(지급 가능 · 금액 일치 · 이체한 날 검사 · 그때 금액 · 가린 계좌 · 이력) ·
--   지급 완료 취소(사유 필수 · 자동 상태로 · 이력 남김) · 보고 · 정산 탭 이체한 날 · 한국 날짜 · 계좌 가리기
-- 2033년 회차를 쓴다(다른 정산 테스트와 겹치지 않게). 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(45);

-- ---------- 권한 ----------
select function_privs_are('public', 'myr_payout_to_pay', '{date}'::text[], 'anon', '{}'::text[], 'anon 은 payout_to_pay 불가');
select function_privs_are('public', 'myr_payout_to_pay', '{date}'::text[], 'authenticated', '{}'::text[], 'authenticated 도 payout_to_pay 불가');
select function_privs_are('public', 'myr_payout_to_pay', '{date}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 payout_to_pay 가능');
select function_privs_are('public', 'myr_payout_mark_paid', '{date,text,integer,date,text,text,"timestamp with time zone"}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 mark_paid 불가');
select function_privs_are('public', 'myr_payout_mark_paid', '{date,text,integer,date,text,text,"timestamp with time zone"}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 mark_paid 가능');
select function_privs_are('public', 'myr_payout_unmark_paid', '{date,text,text,text}'::text[], 'anon', '{}'::text[], 'anon 은 unmark_paid 불가');
select function_privs_are('public', 'myr_payout_unmark_paid', '{date,text,text,text}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 unmark_paid 가능');
select function_privs_are('public', 'myr_payout_bank_snapshot', '{uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 bank_snapshot 불가');
select table_privs_are('public', 'myr_payout_logs', 'authenticated', '{}'::text[], 'authenticated 는 지급 이력 표 권한 없음');
select ok((select relrowsecurity from pg_class where oid = 'public.myr_payout_logs'::regclass), 'myr_payout_logs RLS on');

-- ---------- 픽스처 ----------
-- Q1: 사업자 정보 확인 완료 · 계좌 있음 · 콘솔 계정 / Q2: 확인 전
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000d70c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-pp1@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id, myr_settle_status, bank_info)
values ('00000000-0000-4000-8000-0000000d7001', '지급 1', '@pgtap.pp1', 'instagram', true, '00000000-0000-4000-8000-0000000d70c1', 'verified', '{"bank": "국민", "account": "12345678", "holder": "지급 1"}'),
       ('00000000-0000-4000-8000-0000000d7002', '지급 2', '@pgtap.pp2', 'instagram', true, null, 'pending', '{"bank": "신한", "account": "99990000", "holder": "지급 2"}');
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-0000000d7a01', 'pgtap-pp-1', '00000000-0000-4000-8000-0000000d7001', 'diet', 'Q1', 10000, 1000, 'listed', 'grape'),
       ('00000000-0000-4000-8000-0000000d7a02', 'pgtap-pp-2', '00000000-0000-4000-8000-0000000d7002', 'diet', 'Q2', 10000, 1000, 'listed', 'lemon');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000d7a01', 0, '제조금액 없음', 'test');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000d7a02', 0, '제조금액 없음', 'test');
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount)
values ('00000000-0000-4000-8000-0000000d7b01', 'pgtap-pp-1', 'PAID', '2033-01-02', '김지은', '{}', '주문', 0);
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, qty, unit_price, ship_status, delivered_at)
values ('00000000-0000-4000-8000-0000000d7d01', '00000000-0000-4000-8000-0000000d7b01', '00000000-0000-4000-8000-0000000d7a01', '00000000-0000-4000-8000-0000000d7001', '줄', 5, 10000, 'DELIVERED', '2033-01-10 12:00+09'),
       ('00000000-0000-4000-8000-0000000d7d02', '00000000-0000-4000-8000-0000000d7b01', '00000000-0000-4000-8000-0000000d7a02', '00000000-0000-4000-8000-0000000d7002', '줄', 2, 10000, 'DELIVERED', '2033-01-11 12:00+09');
select is(public.myr_settlement_run('2033-01-01', 'test', '2033-02-01 13:00+09') ->> 'ok', 'true', '1월 회차(2월 1일 13시)');

create function pg_temp.pay(p_handle text, p_amount integer, p_on date, p_note text default '1월분 이체') returns jsonb language sql as $$
  select public.myr_payout_mark_paid('2033-01-01', p_handle, p_amount, p_on, p_note, 'test', '2033-02-05 10:00+09')
$$;
create function pg_temp.po(p_handle text) returns public.myr_payouts language sql as $$ select public.myr_payout_find('2033-01-01', p_handle) $$;

-- ---------- 한국 날짜 · 계좌 가리기 ----------
select is(jsonb_build_array(public.myr_kst_date('2033-01-31 16:00+00'), public.myr_kst_date('2033-01-31 14:59+00')), '["2033-02-01", "2033-01-31"]'::jsonb, '한국 날짜 — UTC 15시부터 다음 날');
select is(jsonb_build_array(public.myr_mask_account('1234567890'), public.myr_mask_account(''), public.myr_mask_account(null)), '["****7890", null, null]'::jsonb, '계좌 가리기 — 뒤 4자리 · 없으면 null');

-- ---------- 제조금액 갚은 비율(내림) ----------
-- Q3: 제조금액 15만 · 확정 줄 상계로 갚은 금액을 바꿔 가며 본다(1월 회차 줄에 붙인다)
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-0000000d7a03', 'pgtap-pp-3', '00000000-0000-4000-8000-0000000d7001', 'diet', 'Q3', 10000, 1000, 'listed', 'jelly');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000d7a03', 150000, '1차', 'test');
insert into public.myr_settlement_rows (id, run_id, product_id, seller_id, pct, sales, refund_adj, carry_in, base, carry_out, settle, status,
                                        mfg_before, offset_amount, mfg_after, deposit_refund, payout, confirmed_at)
values ('00000000-0000-4000-8000-0000000d7e03', (public.myr_settlement_run_of('2033-01-01')).id, '00000000-0000-4000-8000-0000000d7a03', '00000000-0000-4000-8000-0000000d7001',
        60, 0, 0, 0, 0, 0, 0, 'confirmed', 150000, 108000, 42000, 0, 0, now());
select is(public.myr_mfg_repaid_pct('00000000-0000-4000-8000-0000000d7a03'), 72, '갚은 비율 — 10.8만 / 15만 = 72%');
update public.myr_settlement_rows set offset_amount = 149400, mfg_after = 600 where id = '00000000-0000-4000-8000-0000000d7e03';
select is(jsonb_build_array(public.myr_mfg_repaid_pct('00000000-0000-4000-8000-0000000d7a03'), public.myr_mfg_paid_off(public.myr_mfg_remaining('00000000-0000-4000-8000-0000000d7a03'))),
          '[99, false]'::jsonb, '99.6% 는 내림으로 99 — 상환 중인데 100% 로 보이지 않는다');
update public.myr_settlement_rows set offset_amount = 150000, mfg_after = 0 where id = '00000000-0000-4000-8000-0000000d7e03';
select is(jsonb_build_array(public.myr_mfg_repaid_pct('00000000-0000-4000-8000-0000000d7a03'), public.myr_mfg_paid_off(public.myr_mfg_remaining('00000000-0000-4000-8000-0000000d7a03'))),
          '[100, true]'::jsonb, '100% 는 다 갚았을 때만(상환 완료와 같이)');
select is(public.myr_mfg_repaid_pct('00000000-0000-4000-8000-0000000d7a01'), 100, '제조금액 0원 원장 → 100');
delete from public.myr_settlement_rows where id = '00000000-0000-4000-8000-0000000d7e03';

-- ---------- 지급 목록 ----------
select is((select jsonb_agg(jsonb_build_array(e #>> '{seller,handle}', (e ->> 'amount')::int, e #>> '{bank,account}')) from jsonb_array_elements(public.myr_payout_to_pay('2033-01-01')) e where e #>> '{seller,handle}' like '@pgtap.pp%'),
          '[["@pgtap.pp1", 30000, "12345678"]]'::jsonb, '지급 목록 — 지급 가능한 Q1 만(Q2 는 사업자 정보 확인 전) · 이체용 계좌 원문');

-- ---------- 지급 완료 — 거절 ----------
select is(public.myr_payout_mark_paid('2033-01-01', '@pgtap.nobody', 1, '2033-02-03', null, 'test') ->> 'code', 'NOT_FOUND', '없는 지급 건');
select is(pg_temp.pay('@pgtap.pp2', 12000, '2033-02-03') - 'ok', '{"code": "NOT_PAYABLE", "status": "held", "hold_reason": "settle_info", "hold_label": "사업자 · 정산 정보 확인 전"}'::jsonb, '지급 보류 지급 건은 거절 · 이유를 같이');
select is(pg_temp.pay('@pgtap.pp1', 29000, '2033-02-03') - 'ok', '{"code": "AMOUNT_MISMATCH", "amount": 30000}'::jsonb, '적은 금액이 지급 건 금액과 다르면 거절 · 맞는 금액을 같이');
select is(pg_temp.pay('@pgtap.pp1', 30000, null) ->> 'code', 'BAD_DATE', '이체한 날 필수');
select is(pg_temp.pay('@pgtap.pp1', 30000, '2033-02-06') ->> 'code', 'FUTURE_DATE', '오늘(한국 2월 5일) 뒤 날짜는 거절');
select is(pg_temp.pay('@pgtap.pp1', 30000, '2033-01-31') - 'ok', '{"code": "BEFORE_RUN", "run_on": "2033-02-01"}'::jsonb, '회차 계산일(2월 1일) 전 날짜는 거절');
select is((pg_temp.po('@pgtap.pp1')).status, 'pending', '거절된 동안 지급 건은 그대로 지급 대기');

-- ---------- 지급 완료 ----------
select is(pg_temp.pay('@pgtap.pp1', 30000, '2033-02-03') - 'ok', '{"amount": 30000, "paid_on": "2033-02-03", "bank": {"bank": "국민", "account_masked": "****5678", "holder": "지급 1"}}'::jsonb, 'Q1 지급 완료 기록');
select is((select jsonb_build_array(p.status, p.paid_on, p.paid_amount, p.paid_note, p.paid_by, p.paid_bank ->> 'account_masked', p.hold_reason) from public.myr_payouts p where p.id = (pg_temp.po('@pgtap.pp1')).id),
          '["paid", "2033-02-03", 30000, "1월분 이체", "test", "****5678", null]'::jsonb, '지급 완료 — 이체한 날 · 그때 금액 · 메모 · 가린 계좌');
select is((select paid_bank ? 'account' from public.myr_payouts where id = (pg_temp.po('@pgtap.pp1')).id), false, '계좌 원문은 남기지 않는다');
select is(pg_temp.pay('@pgtap.pp1', 30000, '2033-02-03') - 'ok', '{"code": "ALREADY_PAID", "paid_on": "2033-02-03"}'::jsonb, '다시 기록하면 ALREADY_PAID');
select is(public.myr_payout_payable(pg_temp.po('@pgtap.pp1')), false, '지급 완료는 지급 가능 아님');
select is((select count(*)::int from jsonb_array_elements(public.myr_payout_to_pay('2033-01-01')) e where e #>> '{seller,handle}' like '@pgtap.pp%'), 0, '지급 목록에서 빠진다');
select is((select jsonb_agg(jsonb_build_array(action, amount, paid_on, note) order by created_at) from public.myr_payout_logs where payout_id = (pg_temp.po('@pgtap.pp1')).id),
          '[["paid", 30000, "2033-02-03", "1월분 이체"]]'::jsonb, '이력 — 지급 완료 1건');
-- 지급 완료 뒤 사업자 정보가 바뀌어도 그대로(0102 자동 대상 아님)
update public.sellers set myr_settle_status = 'pending' where id = '00000000-0000-4000-8000-0000000d7001';
select is((pg_temp.po('@pgtap.pp1')).status, 'paid', '사업자 정보가 바뀌어도 지급 완료는 그대로');
update public.sellers set myr_settle_status = 'verified' where id = '00000000-0000-4000-8000-0000000d7001';

-- ---------- 보고 · 정산 탭 ----------
select is((select jsonb_build_array(e ->> 'status', e ->> 'paid_on', (e ->> 'paid_amount')::int, e ->> 'paid_note') from jsonb_array_elements(public.myr_settlement_report('2033-01-01') -> 'payouts') e where e #>> '{seller,handle}' = '@pgtap.pp1'),
          '["paid", "2033-02-03", 30000, "1월분 이체"]'::jsonb, '보고 — 지급 완료 · 이체한 날 · 금액 · 메모');
select is((select jsonb_build_array(m ->> 'payout_status', m ->> 'payout_label', m ->> 'paid_on') from jsonb_array_elements(public.myr_app_seller_settlements_of_user('00000000-0000-4000-8000-0000000d70c1', '2033-02-10 10:00+09') -> 'months') m where m ->> 'month' = '2033-01'),
          '["paid", "지급 완료", "2033-02-03"]'::jsonb, '정산 탭 — 지급 완료 칩 · 이체한 날');

-- ---------- 지급 완료 취소 ----------
select is(public.myr_payout_unmark_paid('2033-01-01', '@pgtap.pp1', '  ', 'test') ->> 'code', 'REASON_REQUIRED', '취소는 사유 필수');
select is(public.myr_payout_unmark_paid('2033-01-01', '@pgtap.pp2', '잘못', 'test') ->> 'code', 'NOT_PAID', '지급 완료가 아니면 취소할 것이 없다');
select is(public.myr_payout_unmark_paid('2033-01-01', '@pgtap.pp1', '다른 크리에이터 건에 잘못 기록', 'test') - 'ok', '{"status": "pending", "hold_reason": null}'::jsonb, '취소 → 자동 상태(지급 대기)');
select is((select jsonb_build_array(p.paid_on, p.paid_amount, p.paid_bank, p.paid_note, p.paid_at) from public.myr_payouts p where p.id = (pg_temp.po('@pgtap.pp1')).id),
          '[null, null, null, null, null]'::jsonb, '지급 완료 칸을 비운다');
select is((select jsonb_agg(jsonb_build_array(action, amount, note) order by created_at, action) from public.myr_payout_logs where payout_id = (pg_temp.po('@pgtap.pp1')).id),
          '[["paid", 30000, "1월분 이체"], ["unpaid", 30000, "다른 크리에이터 건에 잘못 기록"]]'::jsonb, '이력은 지우지 않는다 — 지급 완료 · 취소(사유)');
select is(public.myr_payout_payable(pg_temp.po('@pgtap.pp1')), true, '취소 뒤 다시 지급 가능');

-- ---------- 운영 보류 중이면 지급 완료 불가 ----------
select is(public.myr_payout_hold('2033-01-01', '@pgtap.pp1', '계좌 재확인', 'test') ->> 'ok', 'true', 'Q1 운영 보류');
select is(pg_temp.pay('@pgtap.pp1', 30000, '2033-02-03') ->> 'hold_reason', 'manual', '운영 보류 중이면 NOT_PAYABLE(manual)');

-- ---------- 표 제약 ----------
select throws_ok($$update public.myr_payouts set status = 'paid', paid_at = now(), paid_amount = 1, hold_reason = null where id = (pg_temp.po('@pgtap.pp2')).id$$,
                 '23514', null, '지급 완료인데 이체한 날이 없으면 막는다');
select throws_ok($$insert into public.myr_payout_logs (payout_id, action, actor) values ((pg_temp.po('@pgtap.pp1')).id, 'oops', 'test')$$, '23514', null, '이력 동작은 paid · unpaid 만');

select * from finish();
rollback;
