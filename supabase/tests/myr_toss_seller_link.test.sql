-- pgTAP — 0124 토스 셀러 등록 연결: 새 refSellerId(myr_toss_ref_new) · 송금 중(myr_seller_toss_sending) · 시작(myr_app_seller_toss_begin — 최종 동작 ·
--   다시 등록 · 송금 중 막기 · 재료 · 열람 기록) · 결과 적기(myr_app_seller_toss_record) · 상태 반영(myr_app_seller_toss_status — 셀러 id · refSellerId ·
--   MYR 이 등록한 셀러만 · 오류 그대로) · 정보 응답 toss_ready. 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(41);

-- ---------- 권한 ----------
select function_privs_are('public', f, a::text[], 'authenticated', '{}'::text[], 'authenticated 는 ' || f || ' 불가')
  from (values ('myr_seller_toss_sending', '{uuid}'), ('myr_seller_tax_email', '{sellers}'), ('myr_toss_ref_new', '{}'), ('myr_app_seller_toss_begin', '{uuid,text}'),
               ('myr_app_seller_toss_record', '{uuid,text,text,jsonb}'), ('myr_app_seller_toss_status', '{text,text,text}')) v(f, a);
select function_privs_are('public', f, a::text[], 'anon', '{}'::text[], 'anon 은 ' || f || ' 불가')
  from (values ('myr_app_seller_toss_begin', '{uuid,text}'), ('myr_app_seller_toss_record', '{uuid,text,text,jsonb}'), ('myr_app_seller_toss_status', '{text,text,text}')) v(f, a);

-- 0121 상태 적기(myr_app_seller_toss_sync)는 지웠다 — 상태 적기는 myr_app_seller_toss_record(등록 · 수정 결과) · myr_app_seller_toss_status(다시 조회) 둘뿐
select hasnt_function('public', 'myr_app_seller_toss_sync', '{uuid,text,jsonb}'::text[], '옛 상태 적기 함수는 없다');

-- ---------- refSellerId ----------
select ok(public.myr_toss_ref_new() ~ '^m[0-9a-f]{19}$', '새 refSellerId — m + 16진수 19자 = 20자(토스 7~20자)');
select isnt(public.myr_toss_ref_new(), public.myr_toss_ref_new(), '부를 때마다 새 값');

-- ---------- 픽스처 ----------
-- K1: 개인사업자 · 정보 저장됨 · 토스 등록 전 / K2: 셀러리 쪽 토스 셀러만 있는 행(MYR 이 등록하지 않음)
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000f24c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-tl1@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id, myr_settle_status, biz_no, tax_info, bank_info, settle_phone)
values ('00000000-0000-4000-8000-0000000f2401', '토스 연결 1', '@pgtap.tl1', 'instagram', true, '00000000-0000-4000-8000-0000000f24c1', 'pending', '1230145670',
        '{"company": "민지랩", "ceo": "김민지"}', '{"bank": "신한은행", "account": "110123456789", "holder": "김민지"}', '01012345678');
insert into public.sellers (id, name, handle, platform, active, toss_seller_id, toss_seller_status)
values ('00000000-0000-4000-8000-0000000f2402', '셀러리 파트너', '@pgtap.tl2', 'instagram', true, 'seller_sellery_only', 'APPROVED');
create function pg_temp.k1() returns public.sellers language sql as $$ select * from public.sellers where id = '00000000-0000-4000-8000-0000000f2401' $$;

-- ---------- 시작 ----------
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
          '등록 재료 — 사업자 종류는 서버 판정(0121) · 이메일은 정보 응답과 같은 값 · 계좌 원문');
-- 이메일 — 크리에이터 이메일이 없으면 계정 이메일 · 정보 응답 · 운영 목록 · 등록 재료가 같은 함수(myr_seller_tax_email)
select is(array[public.myr_seller_tax_email(pg_temp.k1()), public.myr_settle_info_json(pg_temp.k1()) ->> 'tax_email',
                (select e ->> 'tax_email' from jsonb_array_elements(public.myr_app_admin_settle_infos('pending')) e where e ->> 'seller_id' = '00000000-0000-4000-8000-0000000f2401')],
          array['pgtap-tl1@myr.test', 'pgtap-tl1@myr.test', 'pgtap-tl1@myr.test'], '이메일 — 계정 이메일 · 세 곳이 같은 값');
update public.sellers set email = 'biz@minji.test' where id = '00000000-0000-4000-8000-0000000f2401';
select is(public.myr_settle_info_json(pg_temp.k1()) ->> 'tax_email', 'biz@minji.test', '크리에이터 이메일이 있으면 그 값');
update public.sellers set email = null where id = '00000000-0000-4000-8000-0000000f2401';
select is((select count(*)::int from public.sensitive_access_log where seller_id = '00000000-0000-4000-8000-0000000f2401' and field = 'bank_info' and actor = 'myr-toss'), 1, '계좌 원문 열람 기록');

-- ---------- 결과 적기 ----------
select is(public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f2401', 'seller_tl1', 'APPROVAL_REQUIRED', null) -> 'info' ->> 'toss_state', 'wait', '등록 성공 — 본인인증 전(카드 wait)');
select is(array[(pg_temp.k1()).toss_seller_id, (pg_temp.k1()).toss_seller_status], array['seller_tl1', 'APPROVAL_REQUIRED'], '셀러 id · 상태');
select is(array[public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f2401', 'seller_tl1', 'DONE', null) ->> 'code',
                public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f2401', 'seller_sellery_only', null, null) ->> 'code',
                public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f24ff', null, null, null) ->> 'code'],
          array['BAD_STATUS', 'DUPLICATE', 'NOT_FOUND'], '거부 — 모르는 상태 · 다른 크리에이터의 셀러 id · 없는 크리에이터');
select is((pg_temp.k1()).toss_seller_id, 'seller_tl1', '거부되면 그대로');

-- 수정 · 다시 등록
select is(public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2401', 'update') - 'input',
          jsonb_build_object('ok', true, 'action', 'update', 'ref', (pg_temp.k1()).myr_toss_ref, 'toss_id', 'seller_tl1', 'old_toss_id', null), '셀러 id 가 있으면 수정 — refSellerId 그대로');
select is((select r from (select public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2401', 'register') as r) x) ->> 'old_toss_id', 'seller_tl1', '다시 등록 — 이전 셀러 id(앱이 삭제한다)');
select isnt((pg_temp.k1()).myr_toss_ref, (select r ->> 'ref' from _b), '다시 등록마다 새 refSellerId');

-- 송금 중이면 다시 등록을 막는다(수정은 된다)
insert into public.myr_settlement_runs (id, month, cutoff_at, created_by) values ('00000000-0000-4000-8000-0000000f24a1', '2038-01-01', '2038-02-01 13:00+09', 'pgtap');
insert into public.myr_payouts (run_id, seller_id, status, transfer_state, transfer_at) values ('00000000-0000-4000-8000-0000000f24a1', '00000000-0000-4000-8000-0000000f2401', 'pending', 'sending', now());
select is(public.myr_seller_toss_sending('00000000-0000-4000-8000-0000000f2401'), true, '송금 중인 지급 건이 있다');
select is(public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2401', 'register') ->> 'code', 'SENDING', '송금 중이면 다시 등록 거부');
select is(public.myr_app_seller_toss_begin('00000000-0000-4000-8000-0000000f2401', 'update') ->> 'action', 'update', '송금 중이어도 수정은 된다');
update public.myr_payouts set transfer_state = null where seller_id = '00000000-0000-4000-8000-0000000f2401';
select is(public.myr_seller_toss_sending('00000000-0000-4000-8000-0000000f2401'), false, '송금이 끝나면 아님');

-- 거절 기록 → 카드 "정보 확인 필요" · 고칠 칸
select is(public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f2401', null, null, '{"code": "INVALID_ACCOUNT", "message": "계좌 오류", "field": "account"}') -> 'info' ->> 'toss_fix', 'account', '토스 거절 — 고칠 칸 account');
select is((public.myr_settle_info_json(pg_temp.k1())) ->> 'toss_state', 'rejected', '카드 정보 확인 필요');

-- ---------- 상태 반영(웹훅 · [인증을 마쳤어요]) ----------
select is(public.myr_app_seller_toss_status('seller_tl1_new', 'mzzzzzzzzzzzzzzzzzzz', 'APPROVAL_REQUIRED'), '{"ok": true, "found": false}'::jsonb, '모르는 셀러 · refSellerId — found false');
select is(public.myr_app_seller_toss_status('seller_sellery_only', null, 'KYC_REQUIRED'), '{"ok": true, "found": false}'::jsonb, 'MYR 이 등록하지 않은 셀러(셀러리 쪽)는 건드리지 않는다');
select is((select toss_seller_status from public.sellers where id = '00000000-0000-4000-8000-0000000f2402'), 'APPROVED', '셀러리 쪽 행 그대로');
-- 등록 응답을 못 받았던 셀러 — refSellerId 로 찾아 셀러 id 도 적는다 · 오류 칸은 그대로(정보를 고쳐야 풀린다)
select is(public.myr_app_seller_toss_status('seller_tl1_new', (pg_temp.k1()).myr_toss_ref, 'PARTIALLY_APPROVED') ->> 'found', 'true', 'refSellerId 로 찾는다');
select is(array[(pg_temp.k1()).toss_seller_id, (pg_temp.k1()).toss_seller_status, (pg_temp.k1()).toss_seller_error ->> 'code'], array['seller_tl1_new', 'PARTIALLY_APPROVED', 'INVALID_ACCOUNT'],
          '셀러 id · 상태를 적고 오류는 그대로');
select is(public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000f2401', 'seller_tl1_new', 'PARTIALLY_APPROVED', null) -> 'info' ->> 'toss_ready', 'true', '오류가 풀리면 — 토스로 지급 가능(정보 응답 toss_ready · 0122)');
select is(public.myr_app_seller_toss_status('seller_tl1_new', null, 'KYC_REQUIRED') -> 'info' ->> 'toss_state', 'kyc', '셀러 id 로 찾는다 — 추가 인증');
select is(public.myr_app_seller_toss_status('seller_tl1_new', null, 'DONE') ->> 'code', 'BAD_STATUS', '모르는 상태 거부');

select * from finish();
rollback;
