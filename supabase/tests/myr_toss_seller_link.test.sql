-- pgTAP — 0124 토스 셀러 등록 연결: 처음 등록은 크리에이터가 직접 · 등록된 크리에이터의 정보 변경은 운영 승인 때 토스에 한 번(2026-11-19 결정)
--   새 refSellerId(myr_toss_ref_new) · 송금 중(myr_seller_toss_sending) · 이메일(myr_seller_tax_email) · 할 일 합치기 · 시작(myr_app_seller_toss_begin) ·
--   결과 적기(myr_app_seller_toss_record) · 상태 반영(myr_app_seller_toss_status — MYR 셀러만 · refSellerId · 마지막 등록 시도 확인이면 register → update) ·
--   forget(이전 셀러일 때만) · 저장 RPC(지금 바로 / 승인 때) · 운영 확인(TOSS_PENDING). 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(157);

-- ---------- 권한 · 지운 함수 ----------
select function_privs_are('public', f, a::text[], 'authenticated', '{}'::text[], 'authenticated 는 ' || f || ' 불가')
  from (values ('myr_seller_toss_sending', '{uuid}'), ('myr_toss_ref_new', '{}'), ('myr_seller_tax_email', '{sellers}'), ('myr_toss_todo_merge', '{text,text}'),
               ('myr_seller_toss_todo_open', '{sellers}'), ('myr_toss_register_confirmed', '{sellers,text}'), ('myr_app_seller_toss_begin', '{uuid,text}'),
               ('myr_app_seller_toss_record', '{uuid,text,text,jsonb,boolean}'), ('myr_app_seller_toss_status', '{text,text,text}'), ('myr_app_seller_toss_forget', '{uuid,text}'),
               ('myr_app_seller_toss_abort', '{uuid,text}')) v(f, a);
select function_privs_are('public', f, a::text[], 'anon', '{}'::text[], 'anon 은 ' || f || ' 불가')
  from (values ('myr_app_seller_toss_begin', '{uuid,text}'), ('myr_app_seller_toss_record', '{uuid,text,text,jsonb,boolean}'), ('myr_app_seller_toss_status', '{text,text,text}'),
               ('myr_app_seller_toss_forget', '{uuid,text}'), ('myr_app_seller_toss_abort', '{uuid,text}')) v(f, a);
-- 0121 상태 적기(myr_app_seller_toss_sync)는 지웠다 — 상태 적기는 record(등록 · 수정 결과) · status(다시 조회) 둘뿐
select hasnt_function('public', 'myr_app_seller_toss_sync', '{uuid,text,jsonb}'::text[], '옛 상태 적기 함수는 없다');

-- ---------- refSellerId · 할 일 합치기 ----------
select ok(public.myr_toss_ref_new() ~ '^m[0-9a-f]{19}$', '새 refSellerId — m + 16진수 19자 = 20자(토스 7~20자)');
select isnt(public.myr_toss_ref_new(), public.myr_toss_ref_new(), '부를 때마다 새 값');
select is(array[public.myr_toss_todo_merge(null, null), public.myr_toss_todo_merge('update', null), public.myr_toss_todo_merge(null, 'update'),
                public.myr_toss_todo_merge('update', 'register'), public.myr_toss_todo_merge('register', 'update')],
          array[null, 'update', 'update', 'register', 'register'], '할 일 합치기 — 등록이 우선');

-- ---------- 픽스처 ----------
-- K1: 개인사업자 · 정보 저장됨 · 토스 등록 전 / K2: 셀러리 쪽 토스 셀러만 있는 행(MYR 이 등록하지 않음) / K5: 저장 RPC 로 흐름을 보는 계정
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000f24c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-tl1@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-0000000f24c5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-tl5@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id, myr_settle_status, biz_no, tax_info, bank_info, settle_phone)
values ('00000000-0000-4000-8000-0000000f2401', '토스 연결 1', '@pgtap.tl1', 'instagram', true, '00000000-0000-4000-8000-0000000f24c1', 'pending', '1230145670',
        '{"company": "민지랩", "ceo": "김민지"}', '{"bank": "신한은행", "account": "110123456789", "holder": "김민지"}', '01012345678');
insert into public.sellers (id, name, handle, platform, active, toss_seller_id, toss_seller_status)
values ('00000000-0000-4000-8000-0000000f2402', '셀러리 파트너', '@pgtap.tl2', 'instagram', true, 'seller_sellery_only', 'APPROVED');
insert into public.sellers (id, name, handle, platform, active, user_id) values ('00000000-0000-4000-8000-0000000f2405', '토스 연결 5', '@pgtap.tl5', 'instagram', true, '00000000-0000-4000-8000-0000000f24c5');
create function pg_temp.k1() returns public.sellers language sql as $$ select * from public.sellers where id = '00000000-0000-4000-8000-0000000f2401' $$;
create function pg_temp.k5() returns public.sellers language sql as $$ select * from public.sellers where id = '00000000-0000-4000-8000-0000000f2405' $$;

-- ---------- 시작(begin) ----------
select is(array[public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2401', 'delete') ->> 'code', public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2401', null) ->> 'code',
                public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f24ff', 'register') ->> 'code'],
          array['BAD_ACTION', 'BAD_ACTION', 'NOT_FOUND'], '거부 — 모르는 동작 · 없는 크리에이터');
create temp table _b as select public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2401', 'update') as r;
select is((select r ->> 'action' from _b), 'register', '수정인데 토스 셀러 id 가 없으면 등록');
select is((select r ->> 'ref' from _b), (pg_temp.k1()).myr_toss_ref, '등록이면 새 refSellerId 를 먼저 적는다(응답을 못 받아도 웹훅이 찾는다)');
select is((select r -> 'old_toss_id' from _b), 'null'::jsonb, '이전 셀러가 없으면 old_toss_id 없음');
select is((select r -> 'input' from _b),
          jsonb_build_object('company', '민지랩', 'ceo', '김민지', 'biz_no', '1230145670', 'biz_kind', 'individual', 'email', 'pgtap-tl1@myr.test', 'phone', '01012345678',
                             'bank', jsonb_build_object('bank', '신한은행', 'account', '110123456789', 'holder', '김민지')),
          '등록 재료 — 사업자 종류는 서버 판정(0121) · 이메일 · 계좌 원문');
select is((select count(*)::int from public.sensitive_access_log where seller_id = '00000000-0000-4000-8000-0000000f2401' and field = 'bank_info' and actor = 'myr-toss'), 1, '계좌 원문 열람 기록');
-- 이메일 — 크리에이터 이메일이 없으면 계정 이메일 · 정보 응답 · 운영 목록 · 등록 재료가 같은 함수(myr_seller_tax_email)
select is(array[public.myr_seller_tax_email(pg_temp.k1()), public.myr_settle_info_json(pg_temp.k1()) ->> 'tax_email',
                (select e ->> 'tax_email' from jsonb_array_elements(public.myr_app_admin_settle_infos('pending')) e where e ->> 'seller_id' = '00000000-0000-4000-8000-0000000f2401')],
          array['pgtap-tl1@myr.test', 'pgtap-tl1@myr.test', 'pgtap-tl1@myr.test'], '이메일 — 계정 이메일 · 세 곳이 같은 값');
update public.sellers set email = 'biz@minji.test' where id = '00000000-0000-4000-8000-0000000f2401';
select is(public.myr_settle_info_json(pg_temp.k1()) ->> 'tax_email', 'biz@minji.test', '크리에이터 이메일이 있으면 그 값');
update public.sellers set email = null where id = '00000000-0000-4000-8000-0000000f2401';

-- ---------- 결과 적기(record) ----------
select is(public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f2401', 'seller_tl1', 'APPROVAL_REQUIRED', null, true) -> 'info' ->> 'toss_state', 'wait', '등록 성공 — 본인인증 전(카드 wait)');
select is(array[(pg_temp.k1()).toss_seller_id, (pg_temp.k1()).toss_seller_status], array['seller_tl1', 'APPROVAL_REQUIRED'], '셀러 id · 상태');
select is(array[public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f2401', 'seller_tl1', 'DONE', null, true) ->> 'code',
                public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f2401', 'seller_sellery_only', null, null, true) ->> 'code',
                public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f24ff', null, null, null, true) ->> 'code'],
          array['BAD_STATUS', 'DUPLICATE', 'NOT_FOUND'], '거부 — 모르는 상태 · 다른 크리에이터의 셀러 id · 없는 크리에이터');
select is((pg_temp.k1()).toss_seller_id, 'seller_tl1', '거부되면 그대로');
-- 확정(done)이면 승인 때 할 일을 지운다 · 아니면 남긴다
update public.sellers set myr_toss_todo = 'update', myr_toss_todo_at = now() where id = '00000000-0000-4000-8000-0000000f2401';
select is(public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f2401', 'seller_tl1', 'APPROVAL_REQUIRED', null, false) ->> 'done', 'false', '확정 아님(결과 불명 · 우리 쪽 거절) — 할 일이 남는다');
select is(public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f2401', 'seller_tl1', 'APPROVAL_REQUIRED', null, true) ->> 'done', 'true', '확정 — 할 일을 지운다');
select is(array[(pg_temp.k1()).myr_toss_todo, (pg_temp.k1()).myr_toss_todo_at::text], array[null, null]::text[], '할 일 · 시각 비움');

-- 수정 · 다시 등록 · 송금 중
select is(public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2401', 'update') - 'input',
          jsonb_build_object('ok', true, 'action', 'update', 'ref', (pg_temp.k1()).myr_toss_ref, 'toss_id', 'seller_tl1', 'old_toss_id', null), '셀러 id 가 있으면 수정 — refSellerId 그대로');
select is((select r from (select public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2401', 'register') as r) x) ->> 'old_toss_id', 'seller_tl1', '다시 등록 — 이전 셀러 id(앱이 삭제한다)');
select isnt((pg_temp.k1()).myr_toss_ref, (select r ->> 'ref' from _b), '다시 등록마다 새 refSellerId');
update public.sellers set myr_toss_todo = 'register', myr_toss_ref_at = null where id = '00000000-0000-4000-8000-0000000f2401';  -- 위 다시 등록의 결과가 적혔다고 치자(등록 진행 중 끝)
select is(public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2401', 'update') ->> 'action', 'register', '남은 할 일이 등록이면 수정으로 낮추지 않는다');
update public.sellers set myr_toss_todo = null where id = '00000000-0000-4000-8000-0000000f2401';
insert into public.myr_settlement_runs (id, month, cutoff_at, created_by) values ('00000000-0000-4000-8000-0000000f24a1', '2038-01-01', '2038-02-01 13:00+09', 'pgtap');
insert into public.myr_payouts (run_id, seller_id, status, transfer_state, transfer_at) values ('00000000-0000-4000-8000-0000000f24a1', '00000000-0000-4000-8000-0000000f2401', 'pending', 'sending', now());
select is(public.myr_seller_toss_sending('00000000-0000-4000-8000-0000000f2401'), true, '송금 중인 지급 건이 있다');
select is(public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2401', 'register') ->> 'code', 'SENDING', '송금 중이면 다시 등록 거부');
select is(public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2401', 'update') ->> 'action', 'update', '송금 중이어도 수정은 된다');
update public.myr_payouts set transfer_state = null where seller_id = '00000000-0000-4000-8000-0000000f2401';
select is(public.myr_seller_toss_sending('00000000-0000-4000-8000-0000000f2401'), false, '송금이 끝나면 아님');
-- 거절 기록 → 카드 "정보 확인 필요" · 고칠 칸
select is(public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f2401', null, null, '{"code": "INVALID_ACCOUNT", "message": "계좌 오류", "field": "account"}', true) -> 'info' ->> 'toss_fix', 'account', '토스 거절 — 고칠 칸 account');
select is((public.myr_settle_info_json(pg_temp.k1())) ->> 'toss_state', 'rejected', '카드 정보 확인 필요');

-- ---------- 상태 반영(웹훅 · [인증을 마쳤어요]) ----------
select is(public.myr_app_seller_toss_status('seller_tl1_new', 'mzzzzzzzzzzzzzzzzzzz', 'APPROVAL_REQUIRED'), '{"ok": true, "found": false}'::jsonb, '모르는 셀러 · refSellerId — found false');
select is(public.myr_app_seller_toss_status('seller_sellery_only', null, 'KYC_REQUIRED'), '{"ok": true, "found": false}'::jsonb, 'MYR 이 등록하지 않은 셀러(셀러리 쪽)는 건드리지 않는다');
select is((select toss_seller_status from public.sellers where id = '00000000-0000-4000-8000-0000000f2402'), 'APPROVED', '셀러리 쪽 행 그대로');
select is(public.myr_app_seller_toss_status('seller_tl1_new', (pg_temp.k1()).myr_toss_ref, 'PARTIALLY_APPROVED') ->> 'found', 'true', 'refSellerId 로 찾는다');
select is(array[(pg_temp.k1()).toss_seller_id, (pg_temp.k1()).toss_seller_status, (pg_temp.k1()).toss_seller_error ->> 'code'], array['seller_tl1_new', 'PARTIALLY_APPROVED', 'INVALID_ACCOUNT'],
          '셀러 id · 상태를 적고 오류는 그대로');
select is(public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f2401', 'seller_tl1_new', 'PARTIALLY_APPROVED', null, true) -> 'info' ->> 'toss_ready', 'true', '오류가 풀리면 — 토스로 지급 가능(정보 응답 toss_ready · 0122)');
select is(public.myr_app_seller_toss_status('seller_tl1_new', null, 'KYC_REQUIRED') -> 'info' ->> 'toss_state', 'kyc', '셀러 id 로 찾는다 — 추가 인증');
select is(public.myr_app_seller_toss_status('seller_tl1_new', null, 'DONE') ->> 'code', 'BAD_STATUS', '모르는 상태 거부');

-- ---------- 저장 RPC — 처음 등록은 지금 바로 · 등록된 크리에이터의 변경은 운영 승인 때(2026-11-19 결정) ----------
create function pg_temp.save5(acct text, biz text, phone text default '01055556666') returns jsonb language sql as
  $$ select public.myr_app_seller_settle_info_save('00000000-0000-4000-8000-0000000f24c5', '테스트랩', '김연결', biz, '신한은행', acct, '김연결', phone, true) - array['info', 'ok'] $$;
create function pg_temp.begin5(a text) returns jsonb language sql as $$ select public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2405', a) $$;
create function pg_temp.check5(d text, note text default null) returns jsonb language sql as
  $$ select public.myr_app_admin_settle_info_check('00000000-0000-4000-8000-0000000f2405', d, (pg_temp.k5()).myr_settle_submitted_at, note, null) $$;
select is(pg_temp.save5('110555000001', '1230145670'), '{"recheck": false, "toss_action": "register", "toss_todo": null}'::jsonb, '처음 저장(토스 등록 전) — 지금 바로 등록 · 운영 재확인 없음 · 승인 때 할 일 없음');
select is((pg_temp.k5()).myr_settle_status, 'toss', '본인인증 전 — 토스 인증 대기(운영 확인 목록에 안 잡힌다)');
create temp table _r1 as select pg_temp.begin5('register') as b;  -- 처음 등록 → 응답 결과 불명(첫 등록이라 forget 없음 · 아무것도 적지 않음)
select is(public.myr_app_seller_toss_status('seller_k5_a', (select b ->> 'ref' from _r1), 'APPROVAL_REQUIRED') ->> 'found', 'true', '웹훅이 refSellerId 로 찾는다');
select is(array[(pg_temp.k5()).toss_seller_id, (pg_temp.k5()).myr_toss_todo], array['seller_k5_a', null], '처음 등록 확인 — 셀러 id · 할 일 없음');
select is(public.myr_settle_info_json(pg_temp.k5()) -> 'review_on_change', 'false'::jsonb, '본인인증 전 — 변경은 지금 바로(확인 시트 없음)');
select is(public.myr_settle_info_json(pg_temp.k5()) -> 'edit_locked', 'false'::jsonb, '본인인증 전에는 확인 중이어도 잠기지 않는다');
select is(pg_temp.save5('110555000001', null, '01055557777') - 'recheck', '{"toss_action": "register", "toss_todo": null}'::jsonb, '본인인증 전 휴대폰 변경 — 지금 바로 다시 등록(새 번호로 문자)');
update public.sellers set toss_seller_status = 'PARTIALLY_APPROVED', myr_settle_status = 'verified' where id = '00000000-0000-4000-8000-0000000f2405';
select is(pg_temp.save5('110555000002', null, '01055557777'), '{"recheck": true, "toss_action": null, "toss_todo": "update"}'::jsonb, '인증 뒤 계좌 변경 — 지금은 안 부름 · 승인 때 수정 · 운영 재확인');
select is(public.myr_settle_info_json(pg_temp.k5()) - array['company','ceo','biz_no_masked','has_biz_no','bank','holder','account_masked','has_account','tax_email','note','submitted_at','checked_at','hold','ceo_phone','status','biz_kind','toss_fix','toss_ready','toss_state','toss_agreed','payout_toss'],
          '{"review_on_change": true, "toss_after_review": true, "edit_locked": true, "reauth_after_review": false, "toss_ask": null}'::jsonb, '본인인증 뒤 — 변경은 승인 때 · 승인 때 토스에 반영할 할 일 있음 · 확인 중이라 잠김 · 계좌 변경은 재인증 없음');
select is(pg_temp.save5('110555000002', null, '01055558888'), '{"code": "REVIEW_PENDING"}'::jsonb, '확인 중(토스 등록됨)에는 고칠 수 없다 — 인증 뒤 휴대폰도');
select is(pg_temp.check5('verify') - 'toss_todo', '{"ok": false, "code": "TOSS_PENDING"}'::jsonb, '토스 반영 전에는 확인 완료가 안 된다(TOSS_PENDING)');
select is((pg_temp.k5()).myr_settle_status, 'pending', '확인 중 그대로(사업자 정보 보류로 지급 멈춤)');
select is(pg_temp.check5('reject', '계좌를 다시 확인해 주세요') ->> 'status', 'rejected', '다시 입력 요청은 된다(토스에 보내지 않는다)');
select is((pg_temp.k5()).myr_toss_todo, 'update', '할 일은 남는다 — 다시 저장 · 승인 때 함께 반영');
select is(pg_temp.save5('110555000003', '2208162517', '01055557777') ->> 'toss_todo', 'register', '다시 입력 요청 뒤(잠금 풀림) 사업자번호를 바꾸면 승인 때 다시 등록(남은 수정과 합치면 등록)');
-- 2026-11-20: 사업자번호 · 대표자 변경 = 확인이 끝나면 토스 본인인증을 다시 한다(법인 제외) — 정보 응답 · 운영 목록이 같은 함수
select is(public.myr_toss_reauth_pending(jsonb_populate_record(null::public.sellers, to_jsonb(pg_temp.k5()) || '{"biz_no": "1230145670"}')), true, '개인사업자 · 승인 때 다시 등록 — 확인이 끝나면 토스 본인인증을 다시 해야 한다(정보 응답 reauth_after_review · 운영 목록 reauth)');
select is(public.myr_toss_reauth_pending(jsonb_populate_record(null::public.sellers, to_jsonb(pg_temp.k5()) || '{"biz_no": "1248100998"}')), false, '법인은 다시 등록해도 본인인증이 없다(재인증 아님)');
select is(public.myr_settle_info_json(pg_temp.k5()) -> 'reauth_after_review', 'false'::jsonb, '지금 바꾼 번호(220-81-…)는 법인 — 정보 응답도 재인증 아님');
select is(pg_temp.begin5((pg_temp.k5()).myr_toss_todo) - array['input', 'ref'], '{"ok": true, "action": "register", "toss_id": null, "old_toss_id": "seller_k5_a"}'::jsonb, '승인 — 다시 등록(이전 셀러 삭제)');
select is(public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f2405', 'seller_k5_b', 'APPROVAL_REQUIRED', null, true) ->> 'done', 'true', '토스 반영 성공 — 할 일 비움');
select is(pg_temp.check5('verify') ->> 'status', 'toss', '반영 뒤 — 새 셀러가 본인인증 전이라 토스 인증 대기(재인증 = 가입 직후와 같은 상태 · myr_settle_verify_status)');
select is(array[(pg_temp.k5()).myr_settle_status, public.myr_settle_info_json(pg_temp.k5()) ->> 'review_on_change', public.myr_settle_info_json(pg_temp.k5()) ->> 'reauth_after_review'],
          array['toss', 'false', 'false'], '재인증 전 — 다시 자유롭게 고친다(번호가 틀렸으면 지금 바로 다시 등록) · 재인증 안내는 끝(할 일 없음)');
-- 2026-11-20: 사업자번호는 있는데 토스 셀러가 없으면 register(다시 등록) · 사업자번호도 없으면 null · 가짜 토스(id 없이 상태만)는 인증 아님
select is(array[public.myr_toss_creator_ask(jsonb_populate_record(null::public.sellers, to_jsonb(pg_temp.k5()) || '{"toss_seller_id": null, "toss_seller_status": null, "toss_seller_error": null, "myr_toss_ref_at": null}')),
                public.myr_toss_creator_ask(jsonb_populate_record(null::public.sellers, to_jsonb(pg_temp.k5()) || '{"toss_seller_id": null, "toss_seller_status": null, "toss_seller_error": null, "myr_toss_ref_at": null, "biz_no": null}'))],
          array['register', null], '토스 셀러 없음 + 사업자번호 있음 → register · 사업자번호 없음 → null');
select is(public.myr_toss_verified(jsonb_populate_record(null::public.sellers, to_jsonb(pg_temp.k5()) || '{"toss_seller_id": null, "toss_seller_status": "PARTIALLY_APPROVED"}')), false, '셀러 id 없이 상태만 있으면(개발용 가짜 토스) 본인인증으로 보지 않는다');
select is(array(select public.myr_toss_creator_ask(jsonb_populate_record(null::public.sellers, to_jsonb(pg_temp.k5()) || jsonb_build_object('toss_seller_status', st, 'toss_seller_error', er::jsonb))) from (values ('APPROVAL_REQUIRED', null), ('KYC_REQUIRED', null), ('PARTIALLY_APPROVED', null), ('APPROVED', null), ('APPROVAL_REQUIRED', '{"code":"X"}')) v(st, er)),
          array['auth', 'kyc', null, null, 'fix'], '크리에이터가 토스에서 할 일 — 본인인증 전 auth · 추가 인증 kyc · 인증 완료 · 한도 없음 없음 · 거절 fix(홈 배너 toss_ask)');
select is(public.myr_settle_verify_status(jsonb_populate_record(null::public.sellers, to_jsonb(pg_temp.k5()) || '{"myr_settle_status": "toss"}')), 'verified', '토스 인증 대기를 운영이 직접 확인하면 확인 완료(시범운영 · 테스트 키 개인사업자)');
select is(public.myr_settle_verify_status(jsonb_populate_record(null::public.sellers, to_jsonb(pg_temp.k5()) || '{"myr_settle_status": "pending", "toss_seller_status": "PARTIALLY_APPROVED"}')), 'verified', '확인 중 + 본인인증을 마친 셀러(수정만) → 확인 완료');
select is(public.myr_settle_verify_status(jsonb_populate_record(null::public.sellers, to_jsonb(pg_temp.k5()) || '{"myr_settle_status": "pending", "toss_seller_status": null, "toss_seller_id": null}')), 'verified', '확인 중 + 토스 미연결 → 확인 완료');
update public.sellers set toss_seller_status = 'PARTIALLY_APPROVED' where id = '00000000-0000-4000-8000-0000000f2405';  -- 크리에이터가 새 셀러로 문자 인증을 마쳤다
select is((pg_temp.k5()).myr_settle_status, 'verified', '새 대표자가 본인인증을 마치면 확인 완료(트리거 · 운영 확인 없이)');
select is((pg_temp.k5()).contact_phone, '01055557777', '확인 완료가 되면 요약 카드 연락처 = 대표자 휴대폰(myr_seller_contact_phone)');
select is(pg_temp.save5('110555000003', null, '01055559999') ->> 'toss_todo', 'update', '인증 뒤 휴대폰 변경 — 승인 때 셀러 수정');
select is(array[(pg_temp.k5()).settle_phone, (pg_temp.k5()).contact_phone], array['01055559999', '01055557777'], '확인 중에는 요약 카드 연락처가 이전 번호 그대로');
update public.sellers set myr_toss_todo = null, myr_toss_todo_at = null where id = '00000000-0000-4000-8000-0000000f2405';  -- 승인 때 토스 반영을 마쳤다고 치자
select is(pg_temp.check5('verify') ->> 'status', 'verified', '운영 확인(휴대폰 변경 · 셀러 수정 · 인증 유지) → 확인 완료');
select is((pg_temp.k5()).contact_phone, '01055559999', '운영 확인이 끝나면 요약 카드 연락처도 새 번호');

-- ---------- 결과 불명이던 다시 등록이 사실은 성공 — 확인되면 할 일 register → update(확인된 셀러를 지우지 않는다) ----------
select is(pg_temp.save5('110555000003', '1230145670', '01055557777') ->> 'toss_todo', 'register', '사업자번호를 또 바꿈 → 승인 때 다시 등록');
create temp table _r2 as select pg_temp.begin5('register') as b;  -- 승인 → 이전 셀러(seller_k5_b) 삭제 → 새 등록 응답 결과 불명
select is((select b ->> 'old_toss_id' from _r2), 'seller_k5_b', '다시 등록 — 이전 셀러 삭제 대상');
-- 옛 셀러(이전 refSellerId)의 웹훅은 할 일을 바꾸지 않는다
select is(public.myr_app_seller_toss_status('seller_k5_b', 'm0000000000000000000', 'APPROVED') ->> 'found', 'true', '옛 셀러 웹훅 — 셀러 id 로 찾는다');
select is((pg_temp.k5()).myr_toss_todo, 'register', '옛 셀러 웹훅은 할 일을 바꾸지 않는다');
-- 새 셀러 웹훅이 결과 불명 응답보다 먼저 → 할 일 update 로 낮춤 · 그 뒤 forget 은 새 셀러를 지우지 않는다
select is(public.myr_app_seller_toss_status('seller_k5_c', (select b ->> 'ref' from _r2), 'APPROVAL_REQUIRED') ->> 'found', 'true', '새 셀러 웹훅 — refSellerId 로 찾는다');
select is(array[(pg_temp.k5()).toss_seller_id, (pg_temp.k5()).myr_toss_todo], array['seller_k5_c', 'update'], '마지막 등록 시도 확인 → 할 일 update(다시 승인하면 수정만 · 재인증 없음)');
select is(public.myr_app_seller_toss_forget('00000000-0000-4000-8000-0000000f2405', 'seller_k5_b') ->> 'changed', 'false', 'forget — id 가 이미 새 셀러면 아무것도 안 한다');
select is(pg_temp.begin5((pg_temp.k5()).myr_toss_todo) - array['input', 'ref'], '{"ok": true, "action": "update", "toss_id": "seller_k5_c", "old_toss_id": null}'::jsonb,
          '다시 승인하면 수정 — 확인된 셀러를 지우지 않는다');
-- forget 은 id 가 방금 지운 이전 셀러일 때만 비운다(할 일은 그대로)
select is(public.myr_app_seller_toss_forget('00000000-0000-4000-8000-0000000f2405', 'seller_k5_c') ->> 'changed', 'true', 'forget — 이전 셀러면 비운다');
select is(array[(pg_temp.k5()).toss_seller_id, (pg_temp.k5()).toss_seller_status, (pg_temp.k5()).myr_toss_todo], array[null, null, 'update'], 'id · 상태만 비우고 할 일은 건드리지 않는다');

-- ---------- 운영 목록 ----------
select is((select e ->> 'toss_todo' from jsonb_array_elements(public.myr_app_admin_settle_infos(null)) e where e ->> 'seller_id' = '00000000-0000-4000-8000-0000000f2405'), 'update', '운영 목록에 승인 때 토스에 반영할 할 일');

-- ---------- 2026-11-20: 인증 뒤 수정을 토스가 거절 — 인증은 그대로 · 잠금 유지 · 운영 확인 완료는 TOSS_REJECTED · 다시 입력 요청 → 고치면 셀러 수정 ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000f24c6', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-tl6@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id, biz_no, tax_info, bank_info, settle_type, settle_phone, myr_toss_agreed_at, myr_settle_status, myr_settle_submitted_at, toss_seller_id, toss_seller_status, myr_toss_ref)
values ('00000000-0000-4000-8000-0000000f2406', '토스 연결 6', '@pgtap.tl6', 'instagram', true, '00000000-0000-4000-8000-0000000f24c6', '1230145670', '{"company": "육랩", "ceo": "김육"}',
        '{"bank": "신한은행", "account": "110666000001", "holder": "김육"}', 'biz', '01066660000', now(), 'verified', now(), 'seller_k6', 'PARTIALLY_APPROVED', 'mk6000000000000000000');
create function pg_temp.k6() returns public.sellers language sql as $$ select * from public.sellers where id = '00000000-0000-4000-8000-0000000f2406' $$;
create function pg_temp.save6(acct text) returns jsonb language sql as
  $$ select public.myr_app_seller_settle_info_save('00000000-0000-4000-8000-0000000f24c6', '육랩', '김육', null, '신한은행', acct, '김육', '01066660000', true) - array['info', 'ok'] $$;
create function pg_temp.check6(d text, note text default null) returns jsonb language sql as
  $$ select public.myr_app_admin_settle_info_check('00000000-0000-4000-8000-0000000f2406', d, (pg_temp.k6()).myr_settle_submitted_at, note, null) $$;
select is(pg_temp.save6('110666000002'), '{"recheck": true, "toss_action": null, "toss_todo": "update"}'::jsonb, 'K6 인증 뒤 계좌 변경 — 승인 때 셀러 수정');
select is(public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2406', 'update') ->> 'action', 'update', 'K6 승인 — 셀러 수정');
select is(public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f2406', 'seller_k6', null, '{"code": "INVALID_ACCOUNT", "field": "account"}'::jsonb, true) ->> 'done', 'true', 'K6 토스가 계좌를 거절 — 크리에이터 정보 오류라 할 일은 비움');
select is(array[(pg_temp.k6()).toss_seller_id, (pg_temp.k6()).toss_seller_status, public.myr_toss_card_state(pg_temp.k6()), public.myr_toss_creator_ask(pg_temp.k6())],
          array['seller_k6', 'PARTIALLY_APPROVED', 'rejected', 'fix'], '수정 거절 — 토스 상태는 그대로(인증 유지) · 카드 정보 확인 필요 · 할 일 fix');
select is(array[public.myr_toss_registered(pg_temp.k6()), public.myr_toss_verified(pg_temp.k6()), public.myr_settle_edit_locked(pg_temp.k6()), public.myr_toss_ready(pg_temp.k6())],
          array[true, true, true, false], '셀러 있음 · 인증 그대로 · 확인 중 잠금 유지 · 토스로 지급 가능 아님');
select is(pg_temp.check6('verify'), '{"ok": false, "code": "TOSS_REJECTED", "toss_error": "INVALID_ACCOUNT"}'::jsonb, '토스가 거절한 정보는 운영이 다시 눌러도 확인 완료가 안 된다(TOSS_REJECTED)');
select is((pg_temp.k6()).myr_settle_status, 'pending', '확인 중 그대로');
select is(pg_temp.check6('reject', '계좌번호를 다시 확인해 주세요') ->> 'status', 'rejected', '다시 입력 요청');
select is(pg_temp.save6('110666000003'), '{"recheck": true, "toss_action": null, "toss_todo": "update"}'::jsonb, '고쳐 저장 — 지금 바로 다시 등록이 아니라 승인 때 셀러 수정(인증된 셀러를 지우지 않는다)');
select is(public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2406', 'update') ->> 'action', 'update', '승인 — 셀러 수정');
select is(public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f2406', 'seller_k6', 'PARTIALLY_APPROVED', null, true) ->> 'done', 'true', '토스 수정 성공 — 오류 지움');
select is(pg_temp.check6('verify') ->> 'status', 'verified', '확인 완료(인증 그대로)');
-- 본인인증 전 등록이 거절된 토스 인증 대기도 운영이 직접 확인 완료할 수 없다
update public.sellers set myr_settle_status = 'toss', toss_seller_id = null, toss_seller_status = null, toss_seller_error = '{"code": "INVALID_BUSINESS_NUMBER", "field": "bizNo"}' where id = '00000000-0000-4000-8000-0000000f2406';
select is(pg_temp.check6('verify') ->> 'code', 'TOSS_REJECTED', '토스 인증 대기 + 토스 거절 → 운영 직접 확인도 TOSS_REJECTED');
-- 본인인증 전 수정 거절 뒤 크리에이터가 인증을 마쳐도 정보 오류가 남았으면 확인 완료로 넘기지 않는다(myr_settle_toss_done)
update public.sellers set toss_seller_id = 'seller_k6', toss_seller_status = 'APPROVAL_REQUIRED', toss_seller_error = '{"code": "INVALID_ACCOUNT", "field": "account"}' where id = '00000000-0000-4000-8000-0000000f2406';
update public.sellers set toss_seller_status = 'PARTIALLY_APPROVED' where id = '00000000-0000-4000-8000-0000000f2406';
select is((pg_temp.k6()).myr_settle_status, 'toss', '인증을 마쳐도 토스가 거절한 정보가 남았으면 토스 인증 대기 그대로');

-- ---------- 2026-11-20: 0124 전에 확인 완료된 크리에이터(토스 미등록 · 수동 지급) — 재확인 칸이 그대로면 확인 완료 그대로 · 토스 등록은 한다 ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000f24c7', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-tl7@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id, biz_no, tax_info, bank_info, settle_type, settle_phone, myr_toss_agreed_at, myr_settle_status, myr_settle_submitted_at, myr_settle_checked_at)
values ('00000000-0000-4000-8000-0000000f2407', '토스 연결 7', '@pgtap.tl7', 'instagram', true, '00000000-0000-4000-8000-0000000f24c7', '1230145670', '{"company": "칠랩", "ceo": "김칠"}',
        '{"bank": "신한은행", "account": "110777000001", "holder": "김칠"}', 'biz', '01077770000', now(), 'verified', now() - interval '1 day', now() - interval '1 day');
create function pg_temp.k7() returns public.sellers language sql as $$ select * from public.sellers where id = '00000000-0000-4000-8000-0000000f2407' $$;
create function pg_temp.save7(company text, acct text, phone text) returns jsonb language sql as
  $$ select public.myr_app_seller_settle_info_save('00000000-0000-4000-8000-0000000f24c7', company, '김칠', null, '신한은행', acct, '김칠', phone, true) - array['info', 'ok'] $$;
create function pg_temp.st7() returns jsonb language sql as
  $$ select jsonb_build_object('status', (pg_temp.k7()).myr_settle_status, 'hold', to_jsonb(public.myr_seller_hold_reasons('00000000-0000-4000-8000-0000000f2407'))) $$;
select is(pg_temp.save7('칠랩', null, '01077770000'), '{"recheck": false, "toss_action": "register", "toss_todo": null}'::jsonb, 'K7 그대로 저장 — 토스 등록은 한다');
select is(pg_temp.st7(), '{"status": "verified", "hold": []}'::jsonb, '그대로 저장 — 확인 완료 그대로 · 지급 보류 없음');
select is(pg_temp.save7('칠랩 스튜디오', null, '01077770000') ->> 'toss_action', 'register', '상호만 변경 — 토스 등록');
select is(pg_temp.st7(), '{"status": "verified", "hold": []}'::jsonb, '상호만 변경 — 확인 완료 그대로(0122 와 같다)');
select is(pg_temp.save7('칠랩 스튜디오', null, '01077771111') ->> 'toss_action', 'register', '휴대폰만 변경 — 토스 등록(새 번호)');
select is(pg_temp.st7(), '{"status": "verified", "hold": []}'::jsonb, '휴대폰만 변경 — 확인 완료 그대로');
select is(pg_temp.save7('칠랩 스튜디오', '110777000002', '01077771111') ->> 'recheck', 'false', '계좌 변경 — 본인인증 전이라 운영 확인은 없다');
select is(pg_temp.st7(), '{"status": "toss", "hold": ["settle_info"]}'::jsonb, '계좌 변경(0085 재확인 칸) — 토스 인증 대기 · 지급 보류');

-- ---------- 2026-11-20: 결과 불명 등록 뒤 5분 동안은 다시 등록을 막는다(주인 없는 셀러 방지) ----------
update public.sellers set myr_settle_status = 'toss', toss_seller_id = null, toss_seller_status = null, toss_seller_error = null, myr_toss_ref = null, myr_toss_ref_at = null, myr_toss_todo = null where id = '00000000-0000-4000-8000-0000000f2407';
select is(public.myr_toss_creator_ask(pg_temp.k7()), 'register', 'K7 토스 셀러 없음 · 시도 없음 → register');
select is(public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2407', 'register') ->> 'action', 'register', '등록 시도(결과 불명이라 아무것도 적지 않았다고 치자)');
select ok((pg_temp.k7()).myr_toss_ref_at is not null, '등록 시도 시각을 적는다');
select is(array[public.myr_toss_creator_ask(pg_temp.k7()), public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2407', 'register') ->> 'code'], array['waiting', 'WAITING'],
          '5분 안 — 버튼 대신 응답 대기(waiting) · 다시 등록은 WAITING');
select is(public.myr_app_seller_toss_status('seller_k7_late', (pg_temp.k7()).myr_toss_ref, 'APPROVAL_REQUIRED') ->> 'found', 'true', '웹훅이 오면(실제로 성공) 셀러를 적는다');
select is(public.myr_toss_creator_ask(pg_temp.k7()), 'auth', '웹훅 뒤 — 본인인증 안내(응답 대기 끝)');
update public.sellers set toss_seller_id = null, toss_seller_status = null, myr_toss_ref_at = now() - interval '6 minutes' where id = '00000000-0000-4000-8000-0000000f2407';
select is(array[public.myr_toss_creator_ask(pg_temp.k7()), public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2407', 'register') ->> 'action'], array['register', 'register'],
          '5분이 지나도 웹훅이 없으면(실제로 실패) 다시 등록할 수 있다');
update public.sellers set toss_seller_error = '{"code": "INVALID_BUSINESS_NUMBER", "field": "bizNo"}' where id = '00000000-0000-4000-8000-0000000f2407';
select is(public.myr_toss_reply_waiting(pg_temp.k7()), false, '토스가 거절했으면(확정) 기다리지 않는다 — 고쳐 저장하면 바로 다시 등록');

-- ---------- 2026-11-20: 요약 카드 연락처 맞추기 — 덮어쓰기 전 값은 백업 표에(되돌리기) · 백업 표는 anon · authenticated 가 못 본다 ----------
insert into public.sellers (id, name, handle, platform, active, settle_phone, contact_phone, myr_settle_status)
values ('00000000-0000-4000-8000-0000000f2408', '토스 연결 8', '@pgtap.tl8', 'instagram', true, '01088880000', '01088881111', 'verified');
select is(public.myr_contact_phone_backfill_0124() >= 1, true, '확인 완료 + 연락처 ≠ 대표자 휴대폰 → 연락처를 맞춘다');
select is((select contact_phone from public.sellers where id = '00000000-0000-4000-8000-0000000f2408'), '01088880000', '연락처 = 대표자 휴대폰');
select is((select array[contact_phone, settle_phone] from public.myr_contact_phone_before_0124 where seller_id = '00000000-0000-4000-8000-0000000f2408'), array['01088881111', '01088880000'], '덮어쓰기 전 연락처가 백업에 남는다');
update public.sellers set contact_phone = '01088882222' where id = '00000000-0000-4000-8000-0000000f2408';
select is(public.myr_contact_phone_backfill_0124() >= 1, true, '다시 돌려도 맞춘다');
select is((select contact_phone from public.myr_contact_phone_before_0124 where seller_id = '00000000-0000-4000-8000-0000000f2408'), '01088881111', '이미 백업이 있으면 처음 값 그대로');
select is(array[has_table_privilege('anon', 'public.myr_contact_phone_before_0124', 'select'), has_table_privilege('authenticated', 'public.myr_contact_phone_before_0124', 'select')], array[false, false], '백업 표 — anon · authenticated 는 못 본다');
select is((select relrowsecurity from pg_class where oid = 'public.myr_contact_phone_before_0124'::regclass), true, '백업 표 RLS 켜짐');
select is(array[has_function_privilege('anon', 'public.myr_contact_phone_backfill_0124()', 'execute'), has_function_privilege('authenticated', 'public.myr_contact_phone_backfill_0124()', 'execute')], array[false, false], '맞추기 함수 — anon · authenticated EXECUTE 없음');

-- ---------- 2026-11-20: 동시에 도는 다시 등록 — 등록 진행 중이면 두 번째는 WAITING(셀러가 있어도) · 결과가 적히면 다시 된다 ----------
update public.sellers set toss_seller_id = 'seller_k7_old', toss_seller_status = 'PARTIALLY_APPROVED', toss_seller_error = null, myr_toss_ref_at = null, myr_toss_todo = 'register' where id = '00000000-0000-4000-8000-0000000f2407';
select is(public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2407', 'update') ->> 'action', 'register', '승인 1 — 다시 등록 시작(이전 셀러 삭제 예정)');
select is(public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2407', 'update') ->> 'code', 'WAITING', '동시에 돈 승인 2 — 셀러가 아직 있어도 등록 진행 중이라 WAITING');
select is(public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f2407', 'seller_k7_new', 'APPROVAL_REQUIRED', null, true) ->> 'done', 'true', '승인 1 결과 적기');
select ok((pg_temp.k7()).myr_toss_ref_at is null, '결과가 적히면 등록 진행 중이 끝난다');
select is(public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2407', 'register') ->> 'action', 'register', '끝난 뒤에는 다시 등록할 수 있다');
select is(public.myr_app_seller_toss_status('seller_k7_hook', (pg_temp.k7()).myr_toss_ref, 'APPROVAL_REQUIRED') ->> 'found', 'true', '결과 불명이던 등록 — 웹훅이 지금 refSellerId 로 찾는다');
select ok((pg_temp.k7()).myr_toss_ref_at is null, '웹훅이 마지막 시도의 셀러를 찾으면 등록 진행 중이 끝난다');

-- ---------- 2026-11-20: 토스가 계좌를 거절한 뒤 계좌만 고치면 — 셀러가 있으면 셀러 수정(인증 · 알림톡 그대로) · 셀러가 없으면(첫 등록 거절) 새로 등록 ----------
update public.sellers set myr_settle_status = 'toss', toss_seller_id = 'seller_k7_wait', toss_seller_status = 'APPROVAL_REQUIRED', toss_seller_error = '{"code": "INVALID_ACCOUNT", "field": "account"}', myr_toss_ref_at = null, myr_toss_todo = null
 where id = '00000000-0000-4000-8000-0000000f2407';
select is(pg_temp.save7('칠랩 스튜디오', '110777000009', '01077771111') - 'recheck', '{"toss_action": "update", "toss_todo": null}'::jsonb, '본인인증 전 · 수정 거절 뒤 계좌만 고침 → 바로 셀러 수정(다시 등록 · 알림톡 없음)');
update public.sellers set toss_seller_id = null, toss_seller_status = null, toss_seller_error = '{"code": "INVALID_ACCOUNT", "field": "account"}' where id = '00000000-0000-4000-8000-0000000f2407';
select is(pg_temp.save7('칠랩 스튜디오', '110777000010', '01077771111') ->> 'toss_action', 'register', '첫 등록이 거절돼 셀러가 없음 → 계좌만 고쳐도 새로 등록(지울 셀러 없음)');

-- ---------- 2026-11-20: 토스 등록이 진행 중일 때 다시 저장 — 받지 않는다(REGISTER_WAITING · DB 와 토스가 어긋나지 않게) ----------
update public.sellers set myr_settle_status = 'toss', toss_seller_id = null, toss_seller_status = null, toss_seller_error = null, myr_toss_ref_at = null, myr_toss_todo = null,
       bank_info = '{"bank": "신한은행", "account": "110000000001", "holder": "김칠"}'
 where id = '00000000-0000-4000-8000-0000000f2407';
select is(public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2407', 'register') ->> 'action', 'register', '저장 A1 → 토스로 A1 전송(응답 전)');
select is(pg_temp.save7('칠랩 스튜디오', '110000000002', '01077771111'), '{"code": "REGISTER_WAITING"}'::jsonb, '그사이 계좌 A2 로 다시 저장 → REGISTER_WAITING');
select is((pg_temp.k7()).bank_info ->> 'account', '110000000001', 'DB 계좌는 A1 그대로(토스와 같다)');
select is(public.myr_app_seller_toss_status('seller_k7_a1', (pg_temp.k7()).myr_toss_ref, 'APPROVAL_REQUIRED') ->> 'found', 'true', '첫 등록 응답(웹훅) — 등록 진행 중 끝');
select is(pg_temp.save7('칠랩 스튜디오', '110000000002', '01077771111') ->> 'toss_action', 'update', '끝난 뒤 다시 저장 → 셀러 수정(A2 가 토스에도 간다)');

-- ---------- 2026-11-20: 토스 상태 → 상태 이름은 한 곳(myr_toss_status_state) — 카드 상태 · 본인인증 판정이 같은 값을 본다 ----------
select is(array(select coalesce(public.myr_toss_status_state(st, b), 'null') from (values ('APPROVAL_REQUIRED', '1230145670'), ('KYC_REQUIRED', '1230145670'), ('APPROVED', '1230145670'),
                ('PARTIALLY_APPROVED', '1230145670'), ('PARTIALLY_APPROVED', '1248100998'), ('NEW_STATUS', '1230145670'), (null, '1230145670')) v(st, b)),
          array['wait', 'kyc', 'approved', 'partial', 'corporate', 'null', 'null'], '토스 상태 → 상태 이름 · 모르는 상태는 null(인증 아님)');
select is(array(select public.myr_toss_card_state(jsonb_populate_record(null::public.sellers, to_jsonb(pg_temp.k7()) || jsonb_build_object('toss_seller_id', 'x', 'toss_seller_status', st, 'toss_seller_error', null, 'biz_no', '1230145670')))
                  || '/' || public.myr_toss_verified(jsonb_populate_record(null::public.sellers, to_jsonb(pg_temp.k7()) || jsonb_build_object('toss_seller_id', 'x', 'toss_seller_status', st, 'toss_seller_error', null, 'biz_no', '1230145670')))
                from unnest(array['APPROVAL_REQUIRED', 'KYC_REQUIRED', 'APPROVED', 'PARTIALLY_APPROVED', 'NEW_STATUS']) st),
          array['wait/false', 'kyc/true', 'approved/true', 'partial/true', 'none/false'], '카드 상태와 본인인증 판정이 같은 매핑을 쓴다(갈라지지 않는다)');

-- ---------- 2026-11-20: 확실한 실패는 기다리지 않는다(abort) — 이번 시도일 때만 · 결과 불명은 5분 ----------
update public.sellers set myr_settle_status = 'toss', toss_seller_id = null, toss_seller_status = null, toss_seller_error = null, myr_toss_ref_at = null, myr_toss_todo = null where id = '00000000-0000-4000-8000-0000000f2407';
create temp table _ab as select public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2407', 'register') ->> 'ref' as ref;
select is(public.myr_toss_creator_ask(pg_temp.k7()), 'waiting', '등록 시도 직후 — 응답 대기');
select is(public.myr_app_seller_toss_abort('00000000-0000-4000-8000-0000000f2407', 'm_other_attempt') -> 'info' ->> 'toss_ask', 'waiting', '다른 시도의 ref 면 그대로(그사이 새 시도)');
select is(public.myr_app_seller_toss_abort('00000000-0000-4000-8000-0000000f2407', (select ref from _ab)) -> 'info' ->> 'toss_ask', 'register', '이번 시도가 우리 쪽 거절로 끝남 → 바로 다시 등록 가능');
select is(pg_temp.save7('칠랩 스튜디오', '110000000003', '01077771111') ->> 'toss_action', 'register', '저장도 바로 된다(REGISTER_WAITING 아님)');
select is(public.myr_app_seller_toss_abort('00000000-0000-4000-8000-0000000000ff', 'x') ->> 'code', 'NOT_FOUND', '없는 크리에이터 NOT_FOUND');

select * from finish();
rollback;
