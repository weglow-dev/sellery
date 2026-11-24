-- pgTAP — 0127 토스 지급대행 자동 이체: 지급 방식 토스만 · 판정(토스 상태 → 결과 · 오류 코드 → 실패 종류 · 요청 시간) ·
--   보낼 목록 · 송금 시작(잠금 · 가드 · 참조 번호 · 멱등 키) · 결과 기록(완료 · 송금 중 · 실패 · 모름) · 매시간 확인 목록 ·
--   계좌 실패 자동 재시도 · 운영 다시 보내기 · 운영 예외 기록이 이체 상태를 비운다 · 수동 이체 목록 지움.
-- 2039년 회차를 쓴다(다른 정산 테스트와 겹치지 않게). 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(74);

-- ---------- 권한 ----------
select function_privs_are('public', 'myr_payout_send_list', '{"timestamp with time zone"}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 send_list 불가');
select function_privs_are('public', 'myr_payout_send_begin', '{uuid,bigint,"timestamp with time zone"}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 send_begin 불가');
select function_privs_are('public', 'myr_payout_send_result', '{text,text,text,text,jsonb,"timestamp with time zone"}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 send_result 불가');
select function_privs_are('public', 'myr_payout_check_list', '{"timestamp with time zone"}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 check_list 불가');
select function_privs_are('public', 'myr_payout_send_retry', '{date,text,text,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 send_retry 불가');
select function_privs_are('public', 'myr_payout_send_begin', '{uuid,bigint,"timestamp with time zone"}'::text[], 'anon', '{}'::text[], 'anon 은 send_begin 불가');
select function_privs_are('public', 'myr_payout_send_result', '{text,text,text,text,jsonb,"timestamp with time zone"}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 send_result 가능');
select function_privs_are('public', 'myr_payout_send_list', '{"timestamp with time zone"}'::text[], 'anon', '{}'::text[], 'anon 은 send_list 불가');
select function_privs_are('public', 'myr_payout_check_list', '{"timestamp with time zone"}'::text[], 'anon', '{}'::text[], 'anon 은 check_list 불가');
select function_privs_are('public', 'myr_payout_send_result', '{text,text,text,text,jsonb,"timestamp with time zone"}'::text[], 'anon', '{}'::text[], 'anon 은 send_result 불가');
select function_privs_are('public', 'myr_payout_send_retry', '{date,text,text,text}'::text[], 'anon', '{}'::text[], 'anon 은 send_retry 불가');
select hasnt_function('public', 'myr_payout_to_pay', array['date'], '수동 이체 목록(계좌 원문)은 지웠다');

-- ---------- 지급 방식: 토스만 ----------
select is(public.myr_payout_toss_on(), true, '지급 방식은 토스');
select throws_ok($$update public.platform_settings set value = jsonb_set(value, '{mode}', '"manual"') where key = 'myr_payout'$$, '23514', null, '수동 지급으로 되돌릴 수 없다');

-- ---------- 판정 ----------
select is(array[public.myr_payout_toss_outcome('COMPLETED'), public.myr_payout_toss_outcome('REQUESTED'), public.myr_payout_toss_outcome('IN_PROGRESS'),
                public.myr_payout_toss_outcome('FAILED'), public.myr_payout_toss_outcome('REJECTED'), public.myr_payout_toss_outcome('CANCELED'), public.myr_payout_toss_outcome('???')],
          array['paid', 'sending', 'sending', 'failed', 'failed', 'failed', 'check'], '토스 지급 상태 → 결과 — 완료 · 요청/진행 중 · 실패(반려 · 취소 포함) · 모름');
select is(array[public.myr_payout_toss_fail_kind('UNCERTAIN', 1), public.myr_payout_toss_fail_kind('COMMON_ERROR', 1), public.myr_payout_toss_fail_kind('INVALID_ACCOUNT_INFO', 1),
                public.myr_payout_toss_fail_kind('EXCEEDED_PAYOUT_BALANCE_AMOUNT', 5), public.myr_payout_toss_fail_kind('FORBIDDEN_SELLER_PAYOUT', 1), public.myr_payout_toss_fail_kind('BANK_DOWN', 1),
                public.myr_payout_toss_fail_kind('BANK_DOWN', 3), public.myr_payout_toss_fail_kind(null, 1),
                public.myr_payout_toss_fail_kind('TRANSFER_FAILED', 1), public.myr_payout_toss_fail_kind('TRANSFER_FAILED', 3)],
          array['check', 'check', 'account', 'retry', 'ops', 'retry', 'ops', 'check', 'retry', 'ops'],
          '오류 코드 → 실패 종류 — 모름 · 5xx 는 check · 계좌 account · 잔액 부족은 몇 번이든 retry · 셀러 · 키 문제 ops · 그 밖 retry · 3번째부터 ops · 실측 TRANSFER_FAILED 는 retry(결정 B)');
select is(array[public.myr_payout_send_window('2039-02-03 10:00+09'), public.myr_payout_send_window('2039-02-03 07:59+09'), public.myr_payout_send_window('2039-02-03 15:00+09'),
                public.myr_payout_send_window('2039-02-05 10:00+09')],
          array[true, false, false, false], '바로지급 요청 시간 — 영업일 08:00~15:00 만(토요일 · 15시 이후 · 8시 전 아님)');

-- ---------- 픽스처 ----------
-- A1 · A3: 사업자 정보 확인 완료 · 토스 인증 완료(법인) / A2: 확인 전
insert into public.sellers (id, name, handle, platform, active, myr_settle_status, myr_settle_checked_at, bank_info, biz_no, toss_seller_id, toss_seller_status)
values ('00000000-0000-4000-8000-00000027a001', '자동 1', '@pgtap.au1', 'instagram', true, 'verified', '2039-01-15 10:00+09', '{"bank": "국민", "account": "12345678", "holder": "자동 1"}', '1248100998', 'pgtapau1seller', 'PARTIALLY_APPROVED'),
       ('00000000-0000-4000-8000-00000027a002', '자동 2', '@pgtap.au2', 'instagram', true, 'pending', null, '{"bank": "신한", "account": "99990000", "holder": "자동 2"}', '1248100998', 'pgtapau2seller', 'PARTIALLY_APPROVED'),
       ('00000000-0000-4000-8000-00000027a003', '자동 3', '@pgtap.au3', 'instagram', true, 'verified', '2039-01-15 10:00+09', '{"bank": "우리", "account": "55556666", "holder": "자동 3"}', '1248100998', 'pgtapau3seller', 'PARTIALLY_APPROVED');
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-00000027b001', 'pgtap-au-1', '00000000-0000-4000-8000-00000027a001', 'diet', 'A1', 10000, 1000, 'listed', 'grape'),
       ('00000000-0000-4000-8000-00000027b002', 'pgtap-au-2', '00000000-0000-4000-8000-00000027a002', 'diet', 'A2', 10000, 1000, 'listed', 'lemon'),
       ('00000000-0000-4000-8000-00000027b003', 'pgtap-au-3', '00000000-0000-4000-8000-00000027a003', 'diet', 'A3', 10000, 1000, 'listed', 'peach');
select public.myr_mfg_add('00000000-0000-4000-8000-00000027b001', 0, '제조금액 없음', 'test');
select public.myr_mfg_add('00000000-0000-4000-8000-00000027b002', 0, '제조금액 없음', 'test');
select public.myr_mfg_add('00000000-0000-4000-8000-00000027b003', 0, '제조금액 없음', 'test');
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount)
values ('00000000-0000-4000-8000-00000027c001', 'pgtap-au-1', 'PAID', '2039-01-02', '김지은', '{}', '주문', 0);
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, qty, unit_price, ship_status, delivered_at)
values ('00000000-0000-4000-8000-00000027d001', '00000000-0000-4000-8000-00000027c001', '00000000-0000-4000-8000-00000027b001', '00000000-0000-4000-8000-00000027a001', '줄', 5, 10000, 'DELIVERED', '2039-01-10 12:00+09'),
       ('00000000-0000-4000-8000-00000027d002', '00000000-0000-4000-8000-00000027c001', '00000000-0000-4000-8000-00000027b002', '00000000-0000-4000-8000-00000027a002', '줄', 2, 10000, 'DELIVERED', '2039-01-11 12:00+09'),
       ('00000000-0000-4000-8000-00000027d003', '00000000-0000-4000-8000-00000027c001', '00000000-0000-4000-8000-00000027b003', '00000000-0000-4000-8000-00000027a003', '줄', 3, 10000, 'DELIVERED', '2039-01-12 12:00+09');
-- 정산할 차례인 달만 계산한다(0106) — 직전 회차를 둔다
insert into public.myr_settlement_runs (month, cutoff_at, created_by) values ('2038-12-01', '2039-01-01 13:00+09', 'pgtap');
select is(public.myr_settlement_run('2039-01-01', 'test', '2039-02-01 13:00+09') ->> 'ok', 'true', '1월 회차');
create function pg_temp.invoice_ok(p_handle text) returns void language sql as $$
  insert into public.myr_tax_invoices (payout_id, approval_no, total, status, checked_at, checked_by)
  select p.id, public.myr_tax_invoice_no('20390131' || left(md5(p.id::text), 16)), public.myr_payout_invoice_total(p), 'accepted', now(), 'test'
    from public.myr_payout_find('2039-01-01', p_handle) p;
  select public.myr_payout_refresh((public.myr_payout_find('2039-01-01', p_handle)).id);
$$;
select pg_temp.invoice_ok('@pgtap.au1');
select pg_temp.invoice_ok('@pgtap.au2');
select pg_temp.invoice_ok('@pgtap.au3');
create function pg_temp.po(p_handle text) returns public.myr_payouts language sql as $$ select public.myr_payout_find('2039-01-01', p_handle) $$;
create function pg_temp.list(p_now timestamptz) returns jsonb language sql as $$
  select coalesce(jsonb_agg(s.handle order by s.handle), '[]'::jsonb)
    from jsonb_array_elements(public.myr_payout_send_list(p_now)) e join public.myr_payouts p on p.id = (e ->> 'id')::uuid join public.sellers s on s.id = p.seller_id
   where s.handle like '@pgtap.au%'
$$;
create function pg_temp.st(p_handle text) returns jsonb language sql as $$
  select jsonb_build_object('status', p.status, 'state', p.transfer_state, 'fail', p.transfer_fail, 'tries', p.transfer_tries) from pg_temp.po(p_handle) p
$$;

-- ---------- 보낼 목록 ----------
select is(pg_temp.list('2039-02-03 10:00+09'), '["@pgtap.au1", "@pgtap.au3"]'::jsonb, '보낼 지급 건 — 확인 완료 · 토스 인증 완료(A2 는 사업자 정보 확인 전)');
select is(pg_temp.list('2039-02-03 16:00+09'), '[]'::jsonb, '요청할 수 있는 시간이 아니면 빈 목록');
select is((public.myr_payout_send_list('2039-02-03 10:00+09') -> 0) ? 'amount', true, '목록 줄에 금액(계좌 원문은 없다)');

-- ---------- 송금 시작 — 가드에 걸리면 그대로 ----------
select is(public.myr_payout_send_begin((pg_temp.po('@pgtap.au1')).id, 100, '2039-02-03 13:05+09') ->> 'code', 'BALANCE_EXCEEDED', '토스 잔액이 모자라면 BALANCE_EXCEEDED');
select is(public.myr_payout_send_begin((pg_temp.po('@pgtap.au1')).id, null, '2039-02-03 13:05+09') ->> 'code', 'BALANCE_UNKNOWN', '잔액을 모르면 BALANCE_UNKNOWN');
select is(public.myr_payout_send_begin((pg_temp.po('@pgtap.au2')).id, 10000000, '2039-02-03 13:05+09') ->> 'code', 'NOT_SENDABLE', '보류 중이면 NOT_SENDABLE');
select is(public.myr_payout_send_begin((pg_temp.po('@pgtap.au1')).id, 10000000, '2039-02-03 16:00+09') ->> 'code', 'OUT_OF_WINDOW', '요청 시간이 아니면 OUT_OF_WINDOW');
select is(pg_temp.st('@pgtap.au1'), '{"status": "pending", "state": null, "fail": null, "tries": 0}'::jsonb, '거절되면 지급 건은 그대로(다음 영업일에 다시)');

-- ---------- A1: 송금 시작 → 요청됨 → 완료 ----------
create temp table _b1 as select public.myr_payout_send_begin((pg_temp.po('@pgtap.au1')).id, 10000000, '2039-02-03 13:05+09') as b;
select is((select b - array['id', 'toss_seller_id', 'amount', 'available_after'] from _b1),
          jsonb_build_object('ok', true, 'ref', (pg_temp.po('@pgtap.au1')).id || '-1', 'key', 'myr-po-' || (pg_temp.po('@pgtap.au1')).id || '-1'), '송금 시작 — 참조 번호 <id>-1 · 멱등 키 myr-po-<참조 번호>');
select is((select array[b ->> 'toss_seller_id', b ->> 'amount'] from _b1), array['pgtapau1seller', (public.myr_payout_amount(pg_temp.po('@pgtap.au1')))::text], '토스 셀러 id · 금액');
select is((select (b ->> 'available_after')::bigint from _b1), (10000000 - public.myr_payout_amount(pg_temp.po('@pgtap.au1')))::bigint, '토스가 받아 주면 남는 지급 가능 금액(서버가 계산 — 크론은 빼기를 하지 않는다)');
select is(pg_temp.st('@pgtap.au1'), '{"status": "pending", "state": "sending", "fail": null, "tries": 1}'::jsonb, '송금 중 · 시도 1');
select is(pg_temp.list('2039-02-03 13:30+09'), '["@pgtap.au3"]'::jsonb, '송금 중이면 보낼 목록에서 빠진다');
select is(public.myr_payout_creator_label(pg_temp.po('@pgtap.au1')), '지급 중', '크리에이터 — 지급 중');
select is(public.myr_payout_send_result((select b ->> 'ref' from _b1), 'REQUESTED', 'tp_au1', null, null, '2039-02-03 13:05+09') ->> 'result', 'sending', '토스가 요청을 받음 — 송금 중 · 토스 id');
select is((select jsonb_agg(e ->> 'action') from jsonb_array_elements(public.myr_payout_check_list('2039-02-03 20:00+09')) e where e ->> 'id' = (pg_temp.po('@pgtap.au1')).id::text),
          '["get"]'::jsonb, '매시간 확인 — 토스 id 가 있으면 조회(요청 시간과 무관)');
select is(public.myr_payout_send_result('없는-참조-1', 'COMPLETED', 'tp_x', null, null) ->> 'code', 'NOT_FOUND', '모르는 참조 번호 NOT_FOUND');
select is(public.myr_payout_send_result((select b ->> 'ref' from _b1), 'COMPLETED', 'tp_au1', null, null, '2039-02-03 13:20+09') - 'paid_on', '{"ok": true, "result": "paid", "accepted": true}'::jsonb, '토스 완료 — 지급 완료(토스가 받아 줌)');
select is((select jsonb_build_array(status, paid_on, paid_by, transfer_state, toss_payout_id) from pg_temp.po('@pgtap.au1')), '["paid", "2039-02-03", "toss", null, "tp_au1"]'::jsonb,
          '지급 완료 · 이체한 날 · 처리 = toss · 이체 상태 비움');
select is((select jsonb_agg(action order by created_at, action desc) from public.myr_payout_logs where payout_id = (pg_temp.po('@pgtap.au1')).id), '["toss_request", "paid"]'::jsonb, '기록 — 토스 요청 · 지급 완료');
select is(public.myr_payout_send_result((select b ->> 'ref' from _b1), 'COMPLETED', 'tp_au1', null, null) - array['paid_on'], '{"ok": true, "result": "paid", "already": true}'::jsonb, '웹훅이 다시 와도 한 번만(이미 지급 완료)');
-- 리뷰(2026-11-24): 토스가 완료한 건을 취소하면 다음 13:05 에 다시 나간다(두 번 지급) — 거절
select is(public.myr_payout_unmark_paid('2039-01-01', '@pgtap.au1', '잘못 기록', null) - 'paid_on', '{"ok": false, "code": "PAID_BY_TOSS"}'::jsonb, '토스가 완료한 지급 건은 취소할 수 없다(PAID_BY_TOSS)');
select is(array[(pg_temp.po('@pgtap.au1')).status, public.myr_payout_paid_by_toss(pg_temp.po('@pgtap.au1'))::text], array['paid', 'true'], '그대로 지급 완료 · 토스 완료');

-- ---------- A3: 계좌 오류 → 사업자 정보 다시 확인 → 재시도 ----------
create temp table _b3 as select public.myr_payout_send_begin((pg_temp.po('@pgtap.au3')).id, 10000000, '2039-02-03 13:05+09') as b;
select is(public.myr_payout_send_result((select b ->> 'ref' from _b3), 'FAILED', 'tp_au3a', 'INVALID_ACCOUNT_INFO', '{"code": "INVALID_ACCOUNT_INFO", "message": "계좌"}', '2039-02-03 13:20+09') ->> 'kind', 'account', '계좌 오류 — account');
select is(array[public.myr_payout_creator_label(pg_temp.po('@pgtap.au3')), public.myr_payout_fail_kind(pg_temp.po('@pgtap.au3'))], array['지급 실패', 'account'], '크리에이터 — 지급 실패(계좌)');
select is(pg_temp.list('2039-02-04 13:05+09'), '[]'::jsonb, '계좌 실패는 다시 보내지 않는다(크리에이터가 고칠 때까지)');
-- 크리에이터가 계좌를 고치고 운영이 다시 확인 → 트리거가 재시도로
update public.sellers set myr_settle_status = 'pending' where id = '00000000-0000-4000-8000-00000027a003';
update public.sellers set myr_settle_status = 'verified', myr_settle_checked_at = '2039-02-04 10:00+09' where id = '00000000-0000-4000-8000-00000027a003';
select is(pg_temp.st('@pgtap.au3'), '{"status": "pending", "state": "failed", "fail": "retry", "tries": 1}'::jsonb, '사업자 정보가 다시 확인되면 재시도(트리거)');
select is(pg_temp.list('2039-02-07 13:05+09'), '["@pgtap.au3"]'::jsonb, '다음 영업일 자동 이체에 다시');

-- ---------- A3: 잔액 부족(요청 거절) → retry · 결과 모름 → check ----------
create temp table _b3b as select public.myr_payout_send_begin((pg_temp.po('@pgtap.au3')).id, 10000000, '2039-02-07 13:05+09') as b;
select is((select b ->> 'ref' from _b3b), (pg_temp.po('@pgtap.au3')).id || '-2', '두 번째 시도 — 참조 번호 <id>-2(토스는 같은 참조 번호를 다시 받지 않는다)');
select is(public.myr_payout_send_result((select b ->> 'ref' from _b3b), null, null, 'EXCEEDED_PAYOUT_BALANCE_AMOUNT', null, '2039-02-07 13:06+09') ->> 'kind', 'retry', '토스 잔액 부족 — retry(다음 영업일 자동)');
create temp table _b3c as select public.myr_payout_send_begin((pg_temp.po('@pgtap.au3')).id, 10000000, '2039-02-08 13:05+09') as b;
select is(public.myr_payout_send_result((select b ->> 'ref' from _b3c), null, null, 'UNCERTAIN', null, '2039-02-08 13:06+09') ->> 'result', 'check', '응답 없음 — 결과 모름(check)');
select is(array[public.myr_payout_creator_label(pg_temp.po('@pgtap.au3')), public.myr_payout_fail_kind(pg_temp.po('@pgtap.au3'))], array['지급 확인 중', 'ops'], '크리에이터 — 지급 확인 중(이유는 싣지 않는다)');
select is(pg_temp.list('2039-02-09 13:05+09'), '[]'::jsonb, '결과 모름은 새로 보내지 않는다(두 번 나갈 수 있다)');
select is((select jsonb_agg(jsonb_build_array(e ->> 'action', e ->> 'key')) from jsonb_array_elements(public.myr_payout_check_list('2039-02-08 14:00+09')) e where e ->> 'id' = (pg_temp.po('@pgtap.au3')).id::text),
          jsonb_build_array(jsonb_build_array('resend', 'myr-po-' || (pg_temp.po('@pgtap.au3')).id || '-3')), '매시간 확인 — 같은 키로 다시 요청(토스가 같은 결과를 돌려준다)');
select is((select count(*)::int from jsonb_array_elements(public.myr_payout_check_list('2039-02-08 20:00+09')) e where e ->> 'id' = (pg_temp.po('@pgtap.au3')).id::text), 0, '요청 시간이 아니면 다시 요청하지 않는다');

-- ---------- 운영 다시 보내기 · 예외 기록 ----------
select is(public.myr_payout_send_retry('2039-01-01', '@pgtap.au3', '', null) ->> 'code', 'NOTE_REQUIRED', '다시 보내기 — 메모 필수');
select is(public.myr_payout_send_retry('2039-01-01', '@pgtap.au1', '확인', null) ->> 'code', 'ALREADY_PAID', '지급 완료는 다시 보낼 수 없다');
-- 운영이 토스에서 "실제로 나갔다"를 확인 → 예외 기록(0127: 이체 상태를 비운다 — 0103 은 칸 제약에 걸렸다)
select is(public.myr_payout_mark_paid('2039-01-01', '@pgtap.au3', public.myr_payout_amount(pg_temp.po('@pgtap.au3')), '2039-02-08', '토스 대시보드 확인', 'admin:test', '2039-02-09 10:00+09') ->> 'ok', 'true',
          '결과 확인 필요 → 운영 예외 기록');
select is(pg_temp.st('@pgtap.au3'), '{"status": "paid", "state": null, "fail": null, "tries": 3}'::jsonb, '예외 기록 — 지급 완료 · 이체 상태 비움');
-- 운영 예외 기록(paid)으로 적은 건은 취소할 수 있다 — 잘못 적었으면 다시 보내는 게 맞다
select is(public.myr_payout_paid_by_toss(pg_temp.po('@pgtap.au3')), false, '운영 예외 기록은 토스 완료가 아니다');
select is(public.myr_payout_unmark_paid('2039-01-01', '@pgtap.au3', '토스 대시보드 재확인 — 안 나갔다', null) ->> 'ok', 'true', '운영 예외 기록은 취소할 수 있다');
select is(pg_temp.list('2039-02-10 13:05+09'), '["@pgtap.au3"]'::jsonb, '취소한 예외 기록 건은 다음 자동 이체에 다시(새 시도)');
-- 리뷰(2026-11-24): 예외 기록 뒤 토스가 같은 시도를 COMPLETED 로 알려 오면 토스 완료로 — 그 뒤 취소는 PAID_BY_TOSS(두 번 지급 막기)
create temp table _b3d as select public.myr_payout_send_begin((pg_temp.po('@pgtap.au3')).id, 10000000, '2039-02-10 13:05+09') as b;
select is(public.myr_payout_send_result((select b ->> 'ref' from _b3d), null, null, 'UNCERTAIN', null, '2039-02-10 13:06+09') ->> 'result', 'check', '네 번째 시도 — 결과 모름');
select is(public.myr_payout_mark_paid('2039-01-01', '@pgtap.au3', public.myr_payout_amount(pg_temp.po('@pgtap.au3')), '2039-02-10', '토스 대시보드 확인', 'admin:test', '2039-02-11 10:00+09') ->> 'ok', 'true',
          '운영이 예외 기록으로 마무리');
select is(public.myr_payout_send_result((select b ->> 'ref' from _b3d), 'COMPLETED', 'tp_au3d', null, null, '2039-02-11 11:00+09') - 'paid_on', '{"ok": true, "result": "paid", "already": true, "confirmed": true}'::jsonb,
          '뒤늦게 토스 COMPLETED — 토스 완료로 바꾼다(confirmed)');
select is((select jsonb_build_array(paid_by, toss_payout_id, public.myr_payout_paid_by_toss(p)) from pg_temp.po('@pgtap.au3') p), '["toss", "tp_au3d", true]'::jsonb, '처리 = toss · 토스 지급 id');
select is(public.myr_payout_unmark_paid('2039-01-01', '@pgtap.au3', '잘못 기록', null) ->> 'code', 'PAID_BY_TOSS', '그 뒤 취소는 PAID_BY_TOSS(다시 나가지 않는다)');
select is((select count(*)::int from public.myr_payout_logs where payout_id = (pg_temp.po('@pgtap.au3')).id and action = 'toss_confirmed'), 1, '기록 — 토스 완료 확인 한 줄');

-- ---------- 거절 코드 · 갈래(리뷰 2026-11-24 — 백엔드 원칙 7) ----------
select is(public.myr_payout_send_begin('00000000-0000-4000-8000-0000000000ff', 10000000, '2039-02-03 13:05+09') ->> 'code', 'NOT_FOUND', '송금 시작 — 없는 지급 건 NOT_FOUND');
select is(public.myr_payout_send_retry('2039-01-01', '@pgtap.nobody', '메모', null) ->> 'code', 'NOT_FOUND', '다시 보내기 — 없는 지급 건 NOT_FOUND');
select is(public.myr_payout_send_retry('2039-01-01', '@pgtap.au2', '메모', null) ->> 'code', 'NOT_FAILED', '다시 보내기 — 실패한 지급 건이 아니면 NOT_FAILED');
-- A2 지급 건에 시도를 맞춰 두고 결과 RPC 를 직접 부른다(갈래만 본다 — 시작은 위에서 고정)
update public.myr_payouts set transfer_state = 'sending', transfer_fail = null, transfer_tries = 1, transfer_ref = 'pgtap-au2-1', transfer_at = '2039-02-03 13:05+09' where id = (pg_temp.po('@pgtap.au2')).id;
select is(public.myr_payout_send_result('pgtap-au2-1', 'FAILED', 'tp_au2a', 'COMMON_ERROR', null, '2039-02-03 13:20+09') ->> 'kind', 'retry',
          '토스가 FAILED 로 끝냈는데 코드가 "모름" 쪽(COMMON_ERROR) — 돈이 나가지 않았으니 결과 확인 필요가 아니라 retry');
update public.myr_payouts set transfer_state = 'sending', transfer_fail = null, transfer_tries = 3, transfer_ref = 'pgtap-au2-3' where id = (pg_temp.po('@pgtap.au2')).id;
select is(public.myr_payout_send_result('pgtap-au2-3', 'FAILED', 'tp_au2b', null, null, '2039-02-05 13:20+09') ->> 'kind', 'ops', '코드 없는 실패가 3번째면 ops(운영 조치 필요)');
select is(public.myr_payout_send_retry('2039-01-01', '@pgtap.au2', '토스 확인 · 다시', null) - 'ok', '{"was": "ops"}'::jsonb, '운영 다시 보내기 — ops → retry');

-- ---------- 리뷰 재현(2026-11-24): 토스 상태는 있는데 셀러 id 가 없으면 — 화면은 지급 대기인데 크론은 못 보내던 것 ----------
insert into public.sellers (id, name, handle, platform, active, myr_settle_status, biz_no, toss_seller_status)
values ('00000000-0000-4000-8000-00000027a005', '자동 5', '@pgtap.au5', 'instagram', true, 'verified', '1248100998', 'PARTIALLY_APPROVED');
select is(array[public.myr_toss_ready(s)::text, public.myr_seller_hold_reasons(s.id)::text, public.myr_settle_info_json(s) ->> 'toss_ready'], array['false', '{toss_auth}', 'false'],
          '셀러 id 가 없으면 지급 가능 아님 — 보류 이유 토스 본인인증 전 · 정보 응답도 같은 판정(myr_toss_ready 하나)')
  from public.sellers s where s.id = '00000000-0000-4000-8000-00000027a005';
update public.sellers set toss_seller_id = 'pgtapau5seller' where id = '00000000-0000-4000-8000-00000027a005';
select is((select public.myr_seller_hold_reasons(id) from public.sellers where id = '00000000-0000-4000-8000-00000027a005'), '{}'::text[], '셀러 id 가 생기면 보류가 풀린다');

select * from finish();
rollback;
