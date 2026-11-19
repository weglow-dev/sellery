-- pgTAP — 0121 토스 지급대행 준비: 휴대폰 형식(myr_mobile_ok) · 개인사업자/법인(myr_biz_kind) · 대표자 휴대폰 · 토스페이먼츠 제3자 제공 동의 · 응답 칸
--   · 내 정보 토스 카드 상태(myr_toss_card_state) · 토스 셀러 상태 적기(0121 myr_app_seller_toss_sync → 0124 에서 지우고 myr_app_seller_toss_record 하나로)
begin;
select plan(41);

-- ---------- 권한 ----------
select function_privs_are('public', f, a::text[], 'authenticated', '{}'::text[], 'authenticated 는 ' || f || ' 불가')
  from (values ('myr_digits', '{text}'), ('myr_mobile_ok', '{text}'), ('myr_biz_kind', '{text}'), ('myr_has_biz_no', '{text}'), ('myr_toss_card_state', '{sellers}'),
               ('myr_app_seller_settle_info_save', '{uuid,text,text,text,text,text,text,text,boolean}')) v(f, a);
select function_privs_are('public', 'myr_app_seller_settle_info_save', '{uuid,text,text,text,text,text,text,text,boolean}'::text[], 'anon', '{}'::text[], 'anon 은 settle_info_save 불가');

-- ---------- 형식 · 구분 ----------
select is(array[public.myr_digits('010-1234 5678'), public.myr_digits('124-81-00998'), public.myr_digits('１２３'), public.myr_digits(''), public.myr_digits(null)],
          array['01012345678', '1248100998', '', '', null], '숫자만 남기기 — 하이픈 · 공백 빼기 · ASCII 숫자만 · 빈 값 · null 은 null');
select is((select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'sellers_contact_phone_check'),
          'CHECK (((contact_phone IS NULL) OR myr_mobile_ok(contact_phone)))', '가입 연락처 표 제약도 myr_mobile_ok(정규식을 표에 따로 두지 않는다)');
-- 앞 5자리 + 4자리(0001)를 붙이고 체크섬 자리를 맞춘 사업자번호
create function pg_temp.bn(p5 text) returns text language sql as $$
  select d || ((10 - ((select sum(substr(d, i, 1)::int * (array[1,3,7,1,3,7,1,3,5])[i]) from generate_series(1, 9) i) + substr(d, 9, 1)::int * 5 / 10) % 10) % 10)::text
    from (select p5 || '0001' as d) x
$$;
select is(array[public.myr_mobile_ok('01012345678'), public.myr_mobile_ok('0111234567'), public.myr_mobile_ok('010-1234-5678'), public.myr_mobile_ok('0212345678'), public.myr_mobile_ok(null)],
          array[true, true, false, false, false], '휴대폰 형식 — 숫자만 01x + 7~8자리(하이픈은 저장 전에 뺀다) · 유선 · null');
-- 체크섬 맞는 번호: 123-01-45670(01) · 124-81-00998(81) · 220-81-62517(81) — 80 · 89 · 90 경계는 체크섬을 맞춰 만든다
select is(array[public.myr_biz_kind('1230145670'), public.myr_biz_kind('1248100998'), public.myr_biz_kind('124-81-00998'), public.myr_biz_kind(pg_temp.bn('12380')), public.myr_biz_kind(pg_temp.bn('12389')),
                public.myr_biz_kind(pg_temp.bn('12390')), public.myr_biz_kind(pg_temp.bn('12379')), public.myr_biz_kind('1248100999'), public.myr_biz_kind(null)],
          array['individual', 'corporate', 'corporate', 'corporate', 'corporate', 'individual', 'individual', null, null],
          '개인사업자 · 법인 — 가운데 두 자리 80~89 법인 · 하이픈 무관 · 체크섬이 틀리거나 비면 null(myr_biz_no_valid)');

select is(array[public.myr_has_biz_no('1230145670'), public.myr_has_biz_no('123-01-45670'), public.myr_has_biz_no(''), public.myr_has_biz_no(null)], array[true, false, false, false],
          '사업자번호가 들어 있나 — 숫자 10자리(저장 값은 숫자만) · 빈 값 · null');

-- ---------- 픽스처 ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000e02', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-toss@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, email, platform, active, user_id)
values ('00000000-0000-4000-8000-000000000e12', '민지 루틴', '@pgtap.toss', 'pgtap-toss@myr.test', 'instagram', true, '00000000-0000-4000-8000-000000000e02');
-- 개인사업자 번호(가운데 01) · 체크섬 맞는 값
create function pg_temp.save(phone text, agreed boolean, biz text default '1230145670', company text default '민지랩') returns jsonb language sql as
  $$ select public.myr_app_seller_settle_info_save('00000000-0000-4000-8000-000000000e02', company, '김민지', biz, '신한', '110123456789', '김민지', phone, agreed) $$;
select ok(public.myr_biz_no_valid('1230145670'), '픽스처 사업자번호 체크섬');

-- ---------- 거부 ----------
select is(pg_temp.save('', true) ->> 'code', 'BAD_CEO_PHONE', '대표자 휴대폰 없음 BAD_CEO_PHONE');
select is(pg_temp.save('02-123-4567', true) ->> 'code', 'BAD_CEO_PHONE', '유선 번호 BAD_CEO_PHONE');
select is(pg_temp.save('010-1234-5678', false) ->> 'code', 'TOSS_CONSENT_REQUIRED', '처음 저장인데 동의 없음 TOSS_CONSENT_REQUIRED');
select is((select myr_toss_agreed_at from public.sellers where id = '00000000-0000-4000-8000-000000000e12'), null, '거부되면 동의 시각을 남기지 않는다');

-- ---------- 저장 ----------
select is((pg_temp.save('010-1234-5678', true) #> '{info}') - array['hold', 'submitted_at', 'company', 'ceo', 'bank', 'holder', 'account_masked', 'has_account', 'tax_email', 'note', 'checked_at', 'biz_no_masked', 'has_biz_no', 'status'],
          '{"ceo_phone": "01012345678", "toss_agreed": true, "biz_kind": "individual", "toss_state": "none", "toss_fix": null, "toss_ready": false}'::jsonb, '저장 — 대표자 휴대폰(숫자만) · 동의 · 개인사업자 · 토스 등록 전(none) · 토스로 지급 가능 아님(0124 toss_ready)');
select is((select settle_phone from public.sellers where id = '00000000-0000-4000-8000-000000000e12'), '01012345678', '대표자 휴대폰은 settle_phone(셀러리 0042 토스 본인인증 번호 칸)');
select ok(pg_temp.save('010-1234-5678', false) ->> 'ok' = 'true', '이미 동의했으면 다시 묻지 않는다');

-- ---------- 저장 뒤 토스 셀러에 할 일(toss_action) · 운영 재확인(recheck) ----------
-- 토스 셀러 상태 적기 — 0124 myr_app_seller_toss_record(상태가 있으면 셀러 id 도 · 등록 전이면 비운다)
create function pg_temp.sync(st text, err jsonb default null) returns jsonb language sql as
  $$ select public.myr_app_seller_toss_record('00000000-0000-4000-8000-000000000e12', case when st is not null then 'seller_pgtap_e12' end, st, err) $$;
create function pg_temp.save2(ceo text, acct text, holder text, phone text, biz text default '1230145670') returns jsonb language sql as
  $$ select public.myr_app_seller_settle_info_save('00000000-0000-4000-8000-000000000e02', '민지랩', ceo, biz, '신한', acct, holder, phone, false) - array['info', 'ok'] $$;
update public.sellers set myr_settle_status = 'verified' where id = '00000000-0000-4000-8000-000000000e12';
select ok(pg_temp.sync('PARTIALLY_APPROVED') ->> 'ok' = 'true', '인증 완료 상태로');
select is(pg_temp.save2('김민지', '110123456789', '김민지', '010-9876-5432'), '{"recheck": false, "toss_action": "update"}'::jsonb, '인증 뒤 대표자 휴대폰만 → 셀러 수정(인증 유지) · 운영 재확인 없음');
select is(pg_temp.save2('김민지', '110123456789', '김민지', '010-9876-5432'), '{"recheck": false, "toss_action": null}'::jsonb, '같은 값 다시 저장 → 토스에 할 일 없음');
select is(pg_temp.save2('김민지', '110123456789', '김민지', '01098765432') ->> 'toss_action', null, '하이픈만 다른 같은 번호 → 할 일 없음(숫자만 비교)');
select is(pg_temp.save2('김민지', '220123456789', '김민지', '010-9876-5432'), '{"recheck": true, "toss_action": "update"}'::jsonb, '계좌만 → 셀러 수정(사람은 같다 — 인증 유지) · 운영 재확인');
select is(pg_temp.save2('박하루', '220123456789', '박하루', '010-9876-5432'), '{"recheck": true, "toss_action": "register"}'::jsonb, '대표자가 바뀜 → 다시 등록(인증받은 적 없는 사람 — 새로 본인인증)');
select is(pg_temp.save2('박하루', '220123456789', '박하루', '010-9876-5432', '1248100998') ->> 'toss_action', 'register', '사업자번호가 바뀜 → 다시 등록(다른 사업자)');
select is(pg_temp.save2('박하루', '220123456789', '박하루', '010-9876-5432', '1248100998') ->> 'toss_action', null, '같은 값 다시 저장 → 토스에 할 일 없음(운영 확인 중이라 recheck 는 그대로)');
select ok(pg_temp.sync('APPROVAL_REQUIRED') ->> 'ok' = 'true', '본인인증 전 상태로');
select is(pg_temp.save2('박하루', '220123456789', '박하루', '010-1111-2222', '1248100998') ->> 'toss_action', 'register', '본인인증 전에 휴대폰을 고침 → 다시 등록(새 번호로 문자)');
select ok(pg_temp.sync(null, '{"field": "account"}') ->> 'ok' = 'true', '토스가 거절한 상태로');
select is(pg_temp.save2('박하루', '220123456789', '박하루', '010-1111-2222', '1248100998') ->> 'toss_action', 'register', '토스가 거절했으면 같은 값이라도 다시 등록');
select ok(pg_temp.sync(null) ->> 'ok' = 'true', '토스 등록 전 상태로');
select is(pg_temp.save2('박하루', '220123456789', '박하루', '010-1111-2222', '1248100998') ->> 'toss_action', 'register', '토스 등록 전이면 등록');

-- ---------- 토스 카드 상태 · 셀러 상태 적기 ----------
select is(public.myr_app_seller_toss_record('00000000-0000-4000-8000-0000000000ff', null, 'APPROVED', null) ->> 'code', 'NOT_FOUND', '없는 크리에이터 NOT_FOUND');
select is(pg_temp.sync('WEIRD') ->> 'code', 'BAD_STATUS', '토스에 없는 상태 BAD_STATUS(셀러리 0042 check)');
-- 지금 픽스처는 법인 번호(1248100998) — 개인사업자로 되돌려 상태별로 본다(예금주 = 대표자 김민지)
select ok(pg_temp.save('010-9876-5432', false) ->> 'ok' = 'true', '개인사업자 번호로 저장');
select is((select jsonb_object_agg(coalesce(st, 'null'), pg_temp.sync(st) #>> '{info,toss_state}') from unnest(array[null, 'APPROVAL_REQUIRED', 'PARTIALLY_APPROVED', 'KYC_REQUIRED', 'APPROVED']) st),
          '{"null": "none", "APPROVAL_REQUIRED": "wait", "PARTIALLY_APPROVED": "partial", "KYC_REQUIRED": "kyc", "APPROVED": "approved"}'::jsonb,
          '카드 상태 — 등록 전 · 본인인증 전 · 인증 완료 · 추가 인증 · 한도 없음');
select is(pg_temp.sync(null, '{"field": "account", "code": "INVALID_ACCOUNT"}') #>> '{info,toss_state}', 'rejected', '토스가 거절하면 rejected');
select is(pg_temp.sync(null, '{"field": "account"}') #>> '{info,toss_fix}', 'account', '고칠 칸 — 거절 이유의 field');
select is((select pg_temp.save('010-9876-5432', false, '1248100998') is not null) and (pg_temp.sync('PARTIALLY_APPROVED') #>> '{info,toss_state}') = 'corporate', true, '법인 + 인증 완료(본인인증 없이 등록) = corporate');

select * from finish();
rollback;
