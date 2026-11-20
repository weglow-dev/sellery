-- pgTAP — 0122 토스 지급대행 판정: 지급 방식 설정(myr_payout_toss_on · myr_payout_daily_cap) · 토스로 지급 가능(myr_toss_ready) ·
--   보류 이유 "토스 본인인증 전"(myr_seller_hold_reason · 순서 사업자 정보 → 토스 → 세금계산서 · 트리거) · 영업일(myr_holidays · myr_is_business_day ·
--   myr_business_day_from · myr_payout_next_run · pay_due_at) · 지금 보낼 지급 건(myr_payout_sendable) · 그날 요청(myr_payout_requested_on) ·
--   공유 잔액 가드 + 하루 한도(myr_payout_guard) · 계좌 8~14자리(myr_account_ok · 저장 RPC).
-- 2037년 회차를 쓴다(다른 정산 테스트와 겹치지 않게). 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(72);

-- ---------- 권한 ----------
select function_privs_are('public', f, a::text[], 'authenticated', '{}'::text[], 'authenticated 는 ' || f || ' 불가')
  from (values ('myr_payout_toss_on', '{}'), ('myr_payout_daily_cap', '{}'), ('myr_toss_ready', '{sellers}'), ('myr_is_business_day', '{date}'),
               ('myr_business_day_from', '{date}'), ('myr_payout_next_run', '{"timestamp with time zone"}'), ('myr_payout_sendable', '{myr_payouts}'),
               ('myr_payout_requested_on', '{myr_payouts,date}'), ('myr_payout_guard', '{bigint,uuid[],"timestamp with time zone"}'),
               ('myr_account_ok', '{text}'), ('myr_payout_refresh_all', '{}')) v(f, a);
select function_privs_are('public', 'myr_payout_guard', '{bigint,uuid[],"timestamp with time zone"}'::text[], 'anon', '{}'::text[], 'anon 은 guard 불가');
select function_privs_are('public', 'myr_payout_guard', '{bigint,uuid[],"timestamp with time zone"}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 guard 가능');
select table_privs_are('public', 'myr_holidays', 'anon', '{}'::text[], 'anon 은 공휴일 표 불가');
select table_privs_are('public', 'myr_holidays', 'authenticated', '{}'::text[], 'authenticated 도 공휴일 표 불가');

-- ---------- 지급 방식 설정 ----------
select is(array[public.myr_payout_toss_on()::text, public.myr_payout_daily_cap()::text], array['false', '5000000'], '기본 — 수동 지급 · 하루 한도 500만 원');
select throws_ok($$update public.platform_settings set value = '{"mode": "auto", "daily_cap": 1}' where key = 'myr_payout'$$, '23514', null, '모르는 지급 방식 거절');
select throws_ok($$update public.platform_settings set value = '{"mode": "toss", "daily_cap": "많이"}' where key = 'myr_payout'$$, '23514', null, '한도가 숫자가 아니면 거절');

-- ---------- 토스로 지급 가능 ----------
create function pg_temp.ready(j jsonb) returns boolean language sql as $$ select public.myr_toss_ready(jsonb_populate_record(null::public.sellers, j)) $$;
select is(array[pg_temp.ready('{"biz_no": "1230145670"}'),
                pg_temp.ready('{"biz_no": "1230145670", "toss_seller_status": "APPROVAL_REQUIRED"}'),
                pg_temp.ready('{"biz_no": "1230145670", "toss_seller_status": "PARTIALLY_APPROVED"}'),
                pg_temp.ready('{"biz_no": "1230145670", "toss_seller_status": "KYC_REQUIRED"}'),
                pg_temp.ready('{"biz_no": "1230145670", "toss_seller_status": "APPROVED"}'),
                pg_temp.ready('{"biz_no": "1248100998", "toss_seller_status": "PARTIALLY_APPROVED"}'),
                pg_temp.ready('{"biz_no": "1230145670", "toss_seller_status": "APPROVED", "toss_seller_error": {"field": "account"}}'),
                pg_temp.ready('{"toss_seller_status": "APPROVED"}')],
          array[false, false, true, false, true, true, false, false],
          '토스로 지급 가능 — 인증 완료 · 한도 없음 · 법인만(등록 전 · 본인인증 전 · 추가 인증 · 토스 거절 · 사업자번호 없음은 아니다)');

-- ---------- 픽스처 ----------
-- T1: 개인사업자 · 사업자 정보 확인 완료 · 토스 등록 전 / T2: 법인 · 토스 인증 완료(PARTIALLY_APPROVED) / T3: 정산 정보 저장용 계정
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000f22c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-tr3@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id, myr_settle_status, biz_no, toss_seller_status, bank_info)
values ('00000000-0000-4000-8000-0000000f2201', '토스 1', '@pgtap.tr1', 'instagram', true, null, 'verified', '1230145670', null, '{"bank": "국민", "account": "12345678", "holder": "토스 1"}'),
       ('00000000-0000-4000-8000-0000000f2202', '토스 2', '@pgtap.tr2', 'instagram', true, null, 'verified', '1248100998', 'PARTIALLY_APPROVED', '{"bank": "신한", "account": "99990000", "holder": "토스 2"}');
insert into public.sellers (id, name, handle, platform, active, user_id)
values ('00000000-0000-4000-8000-0000000f2203', '토스 3', '@pgtap.tr3', 'instagram', true, '00000000-0000-4000-8000-0000000f22c3');
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-0000000f2a01', 'pgtap-tr-1', '00000000-0000-4000-8000-0000000f2201', 'diet', 'R1', 10000, 1000, 'listed', 'grape'),
       ('00000000-0000-4000-8000-0000000f2a02', 'pgtap-tr-2', '00000000-0000-4000-8000-0000000f2202', 'diet', 'R2', 10000, 1000, 'listed', 'lemon');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000f2a01', 0, '제조금액 없음', 'test');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000f2a02', 0, '제조금액 없음', 'test');
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount)
values ('00000000-0000-4000-8000-0000000f2b01', 'pgtap-tr-1', 'PAID', '2037-01-02', '김지은', '{}', '주문', 0);
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, qty, unit_price, ship_status, delivered_at)
values ('00000000-0000-4000-8000-0000000f2d01', '00000000-0000-4000-8000-0000000f2b01', '00000000-0000-4000-8000-0000000f2a01', '00000000-0000-4000-8000-0000000f2201', '줄', 5, 10000, 'DELIVERED', '2037-01-10 12:00+09'),
       ('00000000-0000-4000-8000-0000000f2d02', '00000000-0000-4000-8000-0000000f2b01', '00000000-0000-4000-8000-0000000f2a02', '00000000-0000-4000-8000-0000000f2202', '줄', 2, 10000, 'DELIVERED', '2037-01-11 12:00+09');
-- 0106 — 회차는 정산할 차례인 달만. 로컬 DB 에 예전 회차가 있어도 결과가 같게 직전 회차를 둔다
insert into public.myr_settlement_runs (month, cutoff_at, created_by) values ('2036-12-01', '2037-01-01 13:00+09', 'pgtap');
select is(public.myr_settlement_run('2037-01-01', 'test', '2037-02-01 13:00+09') ->> 'ok', 'true', '1월 회차');

create function pg_temp.po(p_handle text) returns public.myr_payouts language sql as $$ select public.myr_payout_find('2037-01-01', p_handle) $$;
create function pg_temp.invoice_ok(p_handle text) returns void language sql as $$
  insert into public.myr_tax_invoices (payout_id, approval_no, total, status, checked_at, checked_by)
  select p.id, public.myr_tax_invoice_no('20370101' || left(md5(p.id::text), 16)), public.myr_payout_invoice_total(p), 'accepted', now(), 'test'
    from pg_temp.po(p_handle) p;
  select public.myr_payout_refresh((pg_temp.po(p_handle)).id);
$$;
create function pg_temp.mode(p_mode text, p_cap bigint default 5000000) returns void language sql as $$
  update public.platform_settings set value = jsonb_build_object('mode', p_mode, 'daily_cap', p_cap) where key = 'myr_payout'
$$;
create function pg_temp.hold(p_handle text) returns text[] language sql as $$
  select array[p.status, p.hold_reason] from public.myr_payouts p where p.id = (pg_temp.po(p_handle)).id
$$;
select pg_temp.invoice_ok('@pgtap.tr2');

-- ---------- 보류 이유 — 수동 지급이면 토스를 보지 않는다 ----------
select is(pg_temp.hold('@pgtap.tr1'), array['held', 'tax_invoice'], '수동 지급 — 토스 등록 전이어도 토스 보류 없음(세금계산서만)');
select is(pg_temp.hold('@pgtap.tr2'), array['pending', null], '수동 지급 — T2 지급 대기');

-- 토스 지급으로 바꾸면 지급 건 전부 다시 정한다(트리거)
select pg_temp.mode('toss');
select is(public.myr_payout_toss_on(), true, '지급 방식 토스');
select is(pg_temp.hold('@pgtap.tr1'), array['held', 'toss_auth'], '토스 지급 — 토스 등록 전이면 보류 이유 토스 본인인증 전(세금계산서보다 먼저)');
select is(public.myr_payout_hold_reasons(pg_temp.po('@pgtap.tr1')), array['toss_auth', 'tax_invoice'], '보류 이유 순서 — 토스 → 세금계산서');
select is(public.myr_payout_holds_json(pg_temp.po('@pgtap.tr1')),
          '[{"code": "toss_auth", "label": "토스 본인인증 전"}, {"code": "tax_invoice", "label": "세금계산서 확인 전"}]'::jsonb, '보류 이유 목록 · 문구');
select is(public.myr_seller_next_hold_json('00000000-0000-4000-8000-0000000f2201'),
          '{"code": "toss_auth", "label": "토스 본인인증 전", "all": [{"code": "toss_auth", "label": "토스 본인인증 전"}]}'::jsonb, '다음 정산 보류 이유 — 토스 본인인증 전(첫 이유 + 전부)');
select is(pg_temp.hold('@pgtap.tr2'), array['pending', null], '토스 지급 — 법인 인증 완료면 지급 대기');
-- 사업자 정보가 먼저
update public.sellers set myr_settle_status = 'pending' where id = '00000000-0000-4000-8000-0000000f2201';
select is(public.myr_payout_hold_reasons(pg_temp.po('@pgtap.tr1')), array['settle_info', 'toss_auth', 'tax_invoice'], '사업자 정보 확인 전이 먼저 · 토스 본인인증 전도 같이(가려지지 않게) · 세금계산서');
select is(pg_temp.hold('@pgtap.tr1'), array['held', 'settle_info'], '지급 건 칸은 첫 이유 하나 — 사업자 정보');
select is(public.myr_seller_next_hold_json('00000000-0000-4000-8000-0000000f2201'),
          '{"code": "settle_info", "label": "사업자 · 정산 정보 확인 전", "all": [{"code": "settle_info", "label": "사업자 · 정산 정보 확인 전"}, {"code": "toss_auth", "label": "토스 본인인증 전"}]}'::jsonb,
          '다음 정산 — 첫 이유(배너 · 칩) + 이유 전부(정산 상세)');
select is(public.myr_payout_holds_json(pg_temp.po('@pgtap.tr1')) -> 1 ->> 'code', 'toss_auth', '지급 건 보류 목록에도 토스 본인인증 전');
select is(public.myr_seller_next_hold_json('00000000-0000-4000-8000-0000000f2202'), null, '이유가 없으면 다음 정산 보류 이유 null');
select is(public.myr_payout_hold_list_json(null), '[]'::jsonb, '빈 목록');
update public.sellers set myr_settle_status = 'verified' where id = '00000000-0000-4000-8000-0000000f2201';
select pg_temp.invoice_ok('@pgtap.tr1');
select is(pg_temp.hold('@pgtap.tr1'), array['held', 'toss_auth'], '세금계산서 확인 뒤에도 토스 본인인증 전이면 보류');

-- 토스 셀러 상태가 바뀌면 지급 건을 다시 정한다(트리거 — 0124 myr_app_seller_toss_record · myr_app_seller_toss_status 가 쓰는 칸)
update public.sellers set toss_seller_status = 'APPROVAL_REQUIRED' where id = '00000000-0000-4000-8000-0000000f2201';
select is(pg_temp.hold('@pgtap.tr1'), array['held', 'toss_auth'], '본인인증 전 — 보류');
update public.sellers set toss_seller_status = 'PARTIALLY_APPROVED' where id = '00000000-0000-4000-8000-0000000f2201';
select is(pg_temp.hold('@pgtap.tr1'), array['pending', null], '본인인증 완료 — 지급 대기');
update public.sellers set toss_seller_status = 'KYC_REQUIRED' where id = '00000000-0000-4000-8000-0000000f2201';
select is(pg_temp.hold('@pgtap.tr1'), array['held', 'toss_auth'], '추가 인증 필요 — 다시 보류');
update public.sellers set toss_seller_status = 'APPROVED', toss_seller_error = '{"field": "account"}' where id = '00000000-0000-4000-8000-0000000f2201';
select is(pg_temp.hold('@pgtap.tr1'), array['held', 'toss_auth'], '토스가 계좌를 거절 — 보류');
update public.sellers set toss_seller_error = null where id = '00000000-0000-4000-8000-0000000f2201';
select is(pg_temp.hold('@pgtap.tr1'), array['pending', null], '오류가 풀리면 지급 대기');
-- 운영 보류 · 지급 완료는 자동으로 바꾸지 않는다 — 다시 수동으로 돌리면 토스 상태와 무관
update public.sellers set toss_seller_status = 'KYC_REQUIRED' where id = '00000000-0000-4000-8000-0000000f2201';
select pg_temp.mode('manual');
select is(pg_temp.hold('@pgtap.tr1'), array['pending', null], '수동 지급으로 돌리면 토스 보류가 풀린다');
select ok(public.myr_payout_refresh_all() >= 2, '자동 상태 지급 건 다시 정하기 — 개수를 돌려준다');
select pg_temp.mode('toss');
update public.sellers set toss_seller_status = 'APPROVED' where id = '00000000-0000-4000-8000-0000000f2201';

-- ---------- 영업일 ----------
select is(array[public.myr_is_business_day('2027-02-05'), public.myr_is_business_day('2027-02-06'), public.myr_is_business_day('2027-02-07'),
                public.myr_is_business_day('2027-02-08'), public.myr_is_business_day('2027-02-09'), public.myr_is_business_day('2027-02-10')],
          array[true, false, false, false, false, true], '영업일 — 금 · 토 · 일(설) · 월(설) · 화(대체공휴일) · 수');
select is(array[public.myr_business_day_from('2027-02-06'), public.myr_business_day_from('2027-02-10'), public.myr_business_day_from('2026-12-25')],
          array['2027-02-10', '2027-02-10', '2026-12-28']::date[], '첫 영업일 — 설 연휴 뒤 · 그날이 영업일이면 그날 · 성탄절(금) 뒤 월요일');
insert into public.myr_holidays (day, name) values ('2037-02-03', '테스트 휴일');
select is(public.myr_is_business_day('2037-02-03'), false, '운영이 넣은 공휴일도 영업일이 아니다');
select is((select source from public.myr_holidays where day = '2037-02-03'), 'manual', '출처를 안 적으면 manual(동기화가 지우지 않는다)');
select throws_ok($$insert into public.myr_holidays (day, name, source) values ('2037-02-04', '틀린 출처', 'csv')$$, '23514', null, '출처는 api · manual 만');
delete from public.myr_holidays where day = '2037-02-03';
select is(public.myr_payout_next_run('2027-02-05 10:00+09'), '2027-02-05 13:00+09'::timestamptz, '영업일 오전 — 그날 오후 1시');
select is(public.myr_payout_next_run('2027-02-05 14:00+09'), '2027-02-10 13:00+09'::timestamptz, '금요일 오후 1시가 지났으면 — 설 연휴 뒤 첫 영업일 오후 1시');
select is(public.myr_payout_next_run('2026-12-25 09:00+09'), '2026-12-28 13:00+09'::timestamptz, '공휴일 아침 — 다음 영업일 오후 1시');
select is(public.myr_payout_pay_due_at(pg_temp.po('@pgtap.tr2'), '2027-02-05 14:00+09'), '2027-02-10 13:00+09'::timestamptz, '지급 예정 시각도 영업일 오후 1시');
select is(public.myr_settlement_next_cron('2027-02-05 14:00+09'), '2027-02-06 13:00+09'::timestamptz, '정산 계산 크론 시각(매일 오후 1시)은 그대로');

-- ---------- 지금 보낼 지급 건 · 그날 요청 ----------
create function pg_temp.tr(p_handle text, p_state text, p_fail text, p_at timestamptz) returns void language sql as $$
  update public.myr_payouts set transfer_state = p_state, transfer_fail = p_fail, transfer_tries = transfer_tries + 1, transfer_at = p_at where id = (pg_temp.po(p_handle)).id
$$;
select is(array[public.myr_payout_sendable(pg_temp.po('@pgtap.tr1')), public.myr_payout_sendable(pg_temp.po('@pgtap.tr2'))], array[true, true], '지급 대기 — 보낼 수 있다');
select pg_temp.tr('@pgtap.tr1', 'sending', null, '2037-02-03 13:00+09');
select is(array[public.myr_payout_sendable(pg_temp.po('@pgtap.tr1')), public.myr_payout_requested_on(pg_temp.po('@pgtap.tr1'), '2037-02-03'), public.myr_payout_requested_on(pg_temp.po('@pgtap.tr1'), '2037-02-04')],
          array[false, true, false], '송금 중 — 보내지 않는다 · 그날 요청한 건 · 다른 날은 아님');
select pg_temp.tr('@pgtap.tr1', 'failed', 'retry', '2037-02-03 13:00+09');
select is(array[public.myr_payout_sendable(pg_temp.po('@pgtap.tr1')), public.myr_payout_requested_on(pg_temp.po('@pgtap.tr1'), '2037-02-03')], array[true, false], '잠깐 실패(retry) — 다시 보낸다 · 그날 요청에서 뺀다');
select pg_temp.tr('@pgtap.tr1', 'failed', 'account', '2037-02-03 13:00+09');
select is(array[public.myr_payout_sendable(pg_temp.po('@pgtap.tr1')), public.myr_payout_requested_on(pg_temp.po('@pgtap.tr1'), '2037-02-03')], array[false, false], '계좌 실패 — 보내지 않는다 · 요청에서 뺀다');
select pg_temp.tr('@pgtap.tr1', 'failed', 'check', '2037-02-03 13:00+09');
select is(array[public.myr_payout_sendable(pg_temp.po('@pgtap.tr1')), public.myr_payout_requested_on(pg_temp.po('@pgtap.tr1'), '2037-02-03')], array[false, true], '결과 불명(check) — 보내지 않는다 · 나갔을 수 있어 요청에 센다');
select is(public.myr_payout_requested_on(pg_temp.po('@pgtap.tr2'), '2037-02-03'), false, '시도한 적 없으면 요청 아님');

-- ---------- 공유 잔액 가드 + 하루 한도 ----------
create function pg_temp.amt(p_handle text) returns bigint language sql as $$ select public.myr_payout_amount(pg_temp.po(p_handle))::bigint $$;
create function pg_temp.id(p_handle text) returns uuid language sql as $$ select (pg_temp.po(p_handle)).id $$;
select is(array[public.myr_payout_guard(1000000, '{}'::uuid[]) ->> 'code', public.myr_payout_guard(1000000, null) ->> 'code',
                public.myr_payout_guard(1000000, array[pg_temp.id('@pgtap.tr2'), pg_temp.id('@pgtap.tr2')]) ->> 'code'],
          array['BAD_BATCH', 'BAD_BATCH', 'BAD_BATCH'], 'BAD_BATCH — 빈 목록 · null · 중복');
select is(public.myr_payout_guard(1000000, array[pg_temp.id('@pgtap.tr1'), pg_temp.id('@pgtap.tr2'), '00000000-0000-4000-8000-0000000f2fff'], '2037-02-03 14:00+09'),
          jsonb_build_object('ok', false, 'code', 'NOT_SENDABLE', 'ids', (select to_jsonb(array_agg(x order by x)) from unnest(array[pg_temp.id('@pgtap.tr1'), '00000000-0000-4000-8000-0000000f2fff'::uuid]) x)),
          'NOT_SENDABLE — 지금 보낼 지급 건이 아니거나(결과 불명) 없는 id');
select is(public.myr_payout_guard(null, array[pg_temp.id('@pgtap.tr2')], '2037-02-03 14:00+09'),
          jsonb_build_object('ok', false, 'code', 'BALANCE_UNKNOWN', 'batch', pg_temp.amt('@pgtap.tr2')), 'BALANCE_UNKNOWN — 잔액을 모르면 보내지 않는다');
select is(public.myr_payout_guard(pg_temp.amt('@pgtap.tr2') - 1, array[pg_temp.id('@pgtap.tr2')], '2037-02-03 14:00+09'),
          jsonb_build_object('ok', false, 'code', 'BALANCE_EXCEEDED', 'batch', pg_temp.amt('@pgtap.tr2'), 'available', pg_temp.amt('@pgtap.tr2') - 1), 'BALANCE_EXCEEDED — 합이 잔액보다 크면');
select is(public.myr_payout_guard(pg_temp.amt('@pgtap.tr2'), array[pg_temp.id('@pgtap.tr2')], '2037-02-03 14:00+09'),
          jsonb_build_object('ok', true, 'batch', pg_temp.amt('@pgtap.tr2'), 'available', pg_temp.amt('@pgtap.tr2'), 'requested_today', pg_temp.amt('@pgtap.tr1'), 'cap', 5000000),
          '통과 — 합 = 잔액이면 보낸다 · 오늘 요청한 금액(결과 불명 T1) · 한도');
-- 하루 한도 — 오늘 요청(T1 결과 불명) + 이번 합(T2) > 한도
select pg_temp.mode('toss', pg_temp.amt('@pgtap.tr1') + pg_temp.amt('@pgtap.tr2') - 1);
select is(public.myr_payout_guard(10000000, array[pg_temp.id('@pgtap.tr2')], '2037-02-03 14:00+09'),
          jsonb_build_object('ok', false, 'code', 'DAILY_CAP_EXCEEDED', 'batch', pg_temp.amt('@pgtap.tr2'), 'requested_today', pg_temp.amt('@pgtap.tr1'),
                             'cap', pg_temp.amt('@pgtap.tr1') + pg_temp.amt('@pgtap.tr2') - 1), 'DAILY_CAP_EXCEEDED — 오늘 요청 + 이번 합이 한도를 넘으면');
select is(public.myr_payout_guard(10000000, array[pg_temp.id('@pgtap.tr2')], '2037-02-04 14:00+09') ->> 'ok', 'true', '다음 날이면 오늘 요청이 0 — 통과');

-- ---------- 계좌번호 8~14자리 ----------
select is(array[public.myr_account_ok('12345678'), public.myr_account_ok('12345678901234'), public.myr_account_ok('123456789012345'), public.myr_account_ok('1234567'),
                public.myr_account_ok('1234-5678'), public.myr_account_ok(''), public.myr_account_ok(null)],
          array[true, true, false, false, false, false, false], '계좌 형식 — 숫자 8~14자리(토스 최대 14) · 하이픈은 저장 전에 뺀다 · 빈 값 · null');
create function pg_temp.save(acc text) returns jsonb language sql as
  $$ select public.myr_app_seller_settle_info_save('00000000-0000-4000-8000-0000000f22c3', '민지랩', '김민지', '1230145670', '신한', acc, '김민지', '01012345678', true) $$;
select is(array[pg_temp.save('123456789012345') ->> 'code', pg_temp.save('1234567890123456') ->> 'code'], array['BAD_ACCOUNT', 'BAD_ACCOUNT'], '저장 — 15 · 16자리 계좌 거절(전에는 16자리까지)');
select is(pg_temp.save('1234-5678-901234') ->> 'ok', 'true', '저장 — 하이픈을 빼면 14자리 통과');
select is((select bank_info ->> 'account' from public.sellers where id = '00000000-0000-4000-8000-0000000f2203'), '12345678901234', '숫자만 저장');
-- 0122 전에 저장한 16자리 계좌 — 계좌 칸을 비우고(저장된 값 그대로) 다른 칸만 고치면 ACCOUNT_REENTER · 새로 입력하면 통과
update public.sellers set bank_info = jsonb_set(bank_info, '{account}', '"1234567890123456"') where id = '00000000-0000-4000-8000-0000000f2203';
select is(pg_temp.save(null) ->> 'code', 'ACCOUNT_REENTER', '저장된 계좌가 14자리를 넘으면 — 다시 입력 안내(ACCOUNT_REENTER)');
select is(pg_temp.save('123456789012345') ->> 'code', 'BAD_ACCOUNT', '직접 입력한 계좌가 틀리면 — BAD_ACCOUNT');
select is(pg_temp.save('11012345678901') ->> 'ok', 'true', '새 계좌를 입력하면 통과');

select * from finish();
rollback;
