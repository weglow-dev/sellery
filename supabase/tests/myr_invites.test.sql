-- pgTAP — 0070 크리에이터 초대 가입: 권한 · 발급/재발급/취소 · 초대 화면 · 핸들 확인 · 가입 · 새 초대 요청 · 목록 (docs/myr.md §4.2.1 10번)
begin;
select plan(69);

-- ---------- 권한 ----------
select table_privs_are('public', 'myr_invites', 'anon', '{}'::text[], 'anon 은 myr_invites 직접 접근 불가');
select table_privs_are('public', 'myr_invites', 'authenticated', '{}'::text[], 'authenticated 도 myr_invites 직접 접근 불가');
select ok((select relrowsecurity from pg_class where oid = 'public.myr_invites'::regclass), 'myr_invites RLS on');
select function_privs_are('public', 'myr_app_admin_invite_create', '{text,text,integer}'::text[], 'anon', '{}'::text[], 'anon 은 invite_create 불가');
select function_privs_are('public', 'myr_app_admin_invite_create', '{text,text,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 invite_create 불가');
select function_privs_are('public', 'myr_app_admin_invite_create', '{text,text,integer}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 invite_create 가능');
select function_privs_are('public', 'myr_app_admin_invite_revoke', '{text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 invite_revoke 불가');
select function_privs_are('public', 'myr_app_admin_invite_list', '{text,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 invite_list 불가');
select function_privs_are('public', 'myr_app_invite_view', '{text}'::text[], 'anon', '{}'::text[], 'anon 은 invite_view 불가');
select function_privs_are('public', 'myr_app_invite_view', '{text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 invite_view 불가');
select function_privs_are('public', 'myr_app_invite_handle_check', '{text,text}'::text[], 'anon', '{}'::text[], 'anon 은 handle_check 불가');
select function_privs_are('public', 'myr_app_invite_handle_check', '{text,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 handle_check 불가');
select function_privs_are('public', 'myr_app_invite_accept', '{text,uuid,text,text,text,text,timestamptz}'::text[], 'anon', '{}'::text[], 'anon 은 invite_accept 불가');
select function_privs_are('public', 'myr_app_invite_accept', '{text,uuid,text,text,text,text,timestamptz}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 invite_accept 불가');
select function_privs_are('public', 'myr_app_invite_request', '{text}'::text[], 'anon', '{}'::text[], 'anon 은 invite_request 불가');
select function_privs_are('public', 'myr_app_invite_request', '{text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 invite_request 불가');
select function_privs_are('public', 'myr_handle_problem', '{text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 내부 핸들 판정 불가');

-- ---------- 픽스처 ----------
-- 계정: 새 크리에이터(초대 이메일과 같음) · 다른 이메일 · 초대 전부터 있던 계정
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000c71', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-inv1@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-000000000c72', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-inv-other@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-000000000c73', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-inv-has@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
-- 이미 있는 크리에이터(핸들 pgtap.taken · 이메일 pgtap-creator@)
insert into public.sellers (id, name, handle, email, platform, active)
values ('00000000-0000-4000-8000-000000000a71', '하루 웰', '@pgtap.taken', 'pgtap-creator@myr.test', 'instagram', true);

-- ---------- 발급 ----------
select is(public.myr_app_admin_invite_create('not-an-email') ->> 'code', 'BAD_EMAIL', '이메일 형식이 아니면 BAD_EMAIL');
select is(public.myr_app_admin_invite_create('PGTAP-Creator@myr.test') ->> 'code', 'ALREADY_CREATOR', '이미 크리에이터 이메일(대소문자 무시)이면 ALREADY_CREATOR');
select is(public.myr_app_admin_invite_create('pgtap-inv-has@myr.test') ->> 'code', 'EMAIL_HAS_ACCOUNT', '같은 이메일 로그인 계정이 있으면 EMAIL_HAS_ACCOUNT');

-- 이 테스트에서는 c71 계정을 "가입 때 서버가 만든 계정" 으로 쓴다 — 발급은 계정이 없을 때만 되므로 이메일을 잠깐 비켜 둔다
update auth.users set email = 'pgtap-inv1-later@myr.test' where id = '00000000-0000-4000-8000-000000000c71';
create temp table t_first as select public.myr_app_admin_invite_create(' PGTAP-Inv1@myr.test ', '운영 소윤', 7) as r;
select ok((select (r ->> 'ok')::boolean and r ->> 'token' ~ '^[0-9a-f]{64}$' and r ->> 'email' = 'pgtap-inv1@myr.test' and (r ->> 'reissued')::boolean = false from t_first),
  '발급 — 토큰 64 hex · 이메일 소문자 · 첫 초대');
select is((select token_hash from public.myr_invites where id = (select (r ->> 'invite_id')::uuid from t_first)),
  encode(extensions.digest((select r ->> 'token' from t_first), 'sha256'), 'hex'), '저장은 토큰 sha256 해시만');
select ok((select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour' from public.myr_invites where id = (select (r ->> 'invite_id')::uuid from t_first)), '만료 = 7일 뒤');

-- 재발급 — 이전 링크는 REVOKED(reissued)
create temp table t_inv as select public.myr_app_admin_invite_create('pgtap-inv1@myr.test', null, 7) as r;
select is((select (r ->> 'reissued')::boolean from t_inv), true, '같은 이메일 다시 초대 → reissued');
select is(public.myr_app_invite_view((select r ->> 'token' from t_first)) ->> 'code', 'REVOKED', '이전 링크는 REVOKED');
select is((select revoked_reason from public.myr_invites where id = (select (r ->> 'invite_id')::uuid from t_first)), 'reissued', '이전 초대 취소 사유 reissued');
select is((select count(*)::integer from public.myr_invites where email = 'pgtap-inv1@myr.test' and used_at is null and revoked_at is null), 1, '대기 중인 초대는 이메일당 하나');

-- ---------- 초대 화면 ----------
select is(public.myr_app_invite_view('zz') ->> 'code', 'NOT_FOUND', '토큰 형식이 아니면 NOT_FOUND');
select is(public.myr_app_invite_view(repeat('ab', 32)) ->> 'code', 'NOT_FOUND', '없는 토큰 NOT_FOUND');
select is(public.myr_app_invite_view((select r ->> 'token' from t_inv)) - 'invite_id' - 'expires_at', '{"ok": true, "email": "pgtap-inv1@myr.test"}'::jsonb, '유효한 초대 → 이메일');
create temp table t_old as select public.myr_app_admin_invite_create('pgtap-inv-old@myr.test') as r;
update public.myr_invites set expires_at = now() - interval '1 minute' where id = (select (r ->> 'invite_id')::uuid from t_old);
select is(public.myr_app_invite_view((select r ->> 'token' from t_old)) ->> 'code', 'EXPIRED', '7일 지난 초대 EXPIRED');

-- ---------- 핸들 확인 ----------
select is(public.myr_app_invite_handle_check((select r ->> 'token' from t_old), 'minji.new') ->> 'code', 'EXPIRED', '만료된 초대로는 핸들을 못 묻는다');
select is(public.myr_app_invite_handle_check(repeat('ab', 32), 'minji.new') ->> 'code', 'NOT_FOUND', '없는 초대로는 핸들을 못 묻는다');
select is(public.myr_app_invite_handle_check((select r ->> 'token' from t_inv), 'a') ->> 'code', 'BAD_HANDLE', '1자 BAD_HANDLE');
select is(public.myr_app_invite_handle_check((select r ->> 'token' from t_inv), '민지') ->> 'code', 'BAD_HANDLE', '한글 BAD_HANDLE');
select is(public.myr_app_invite_handle_check((select r ->> 'token' from t_inv), 'Admin') ->> 'code', 'RESERVED', '예약어(대소문자 무시) RESERVED');
select is(public.myr_app_invite_handle_check((select r ->> 'token' from t_inv), 'myr.minji') ->> 'code', 'RESERVED', 'myr. 로 시작 RESERVED');
select is(public.myr_app_invite_handle_check((select r ->> 'token' from t_inv), '@PGTAP.Taken') ->> 'code', 'TAKEN', '이미 쓰는 핸들(@ · 대문자 정리) TAKEN');
select is(public.myr_app_invite_handle_check((select r ->> 'token' from t_inv), '@pgtap.new'), '{"ok": true, "available": true, "handle": "pgtap.new"}'::jsonb, '사용 가능 → available · 정리된 핸들');

-- ---------- 가입 ----------
update auth.users set email = 'pgtap-inv1@myr.test' where id = '00000000-0000-4000-8000-000000000c71';
select is(public.myr_app_invite_accept((select r ->> 'token' from t_old), '00000000-0000-4000-8000-000000000c71', '민지', 'pgtap.new', 'instagram', '010-1234-5678', now()) ->> 'code', 'EXPIRED', '만료된 초대로 가입 EXPIRED');
select is(public.myr_app_invite_accept((select r ->> 'token' from t_first), '00000000-0000-4000-8000-000000000c71', '민지', 'pgtap.new', 'instagram', '010-1234-5678', now()) ->> 'code', 'REVOKED', '취소된 초대로 가입 REVOKED');
select is(public.myr_app_invite_accept(repeat('ab', 32), '00000000-0000-4000-8000-000000000c71', '민지', 'pgtap.new', 'instagram', '010-1234-5678', now()) ->> 'code', 'NOT_FOUND', '없는 초대 NOT_FOUND');
select is(public.myr_app_invite_accept((select r ->> 'token' from t_inv), '00000000-0000-4000-8000-000000000c72', '민지', 'pgtap.new', 'instagram', '010-1234-5678', now()) ->> 'code', 'EMAIL_MISMATCH', '초대와 다른 이메일 계정 EMAIL_MISMATCH');
select is(public.myr_app_invite_accept((select r ->> 'token' from t_inv), '00000000-0000-4000-8000-000000000c71', ' ', 'pgtap.new', 'instagram', '010-1234-5678', now()), '{"ok": false, "code": "INVALID_INPUT", "field": "name"}'::jsonb, '활동명 비면 INVALID_INPUT name');
select is(public.myr_app_invite_accept((select r ->> 'token' from t_inv), '00000000-0000-4000-8000-000000000c71', '민지', 'pgtap.new', 'naver', '010-1234-5678', now()) ->> 'field', 'platform', '대표 채널 3개 밖 INVALID_INPUT platform');
select is(public.myr_app_invite_accept((select r ->> 'token' from t_inv), '00000000-0000-4000-8000-000000000c71', '민지', 'pgtap.new', 'instagram', '02-123-4567', now()) ->> 'field', 'phone', '휴대폰이 아니면 INVALID_INPUT phone');
select is(public.myr_app_invite_accept((select r ->> 'token' from t_inv), '00000000-0000-4000-8000-000000000c71', '민지', 'pgtap.new', 'instagram', '010-1234-5678', null) ->> 'field', 'terms', '약관 동의 시각 없으면 INVALID_INPUT terms');
select is(public.myr_app_invite_accept((select r ->> 'token' from t_inv), '00000000-0000-4000-8000-000000000c71', '민지', 'p', 'instagram', '010-1234-5678', now()) ->> 'field', 'handle', '핸들 형식 INVALID_INPUT handle');
select is(public.myr_app_invite_accept((select r ->> 'token' from t_inv), '00000000-0000-4000-8000-000000000c71', '민지', 'official', 'instagram', '010-1234-5678', now()) ->> 'code', 'RESERVED_HANDLE', '예약어 RESERVED_HANDLE');
select is(public.myr_app_invite_accept((select r ->> 'token' from t_inv), '00000000-0000-4000-8000-000000000c71', '민지', 'pgtap.taken', 'instagram', '010-1234-5678', now()) ->> 'code', 'HANDLE_TAKEN', '쓰는 핸들 HANDLE_TAKEN');

select is(public.myr_app_invite_accept((select r ->> 'token' from t_inv), '00000000-0000-4000-8000-000000000c71', ' 민지 루틴 ', '@PGTAP.New', 'youtube', '010-1234-5678', '2026-11-04T01:00:00Z') - 'seller_id',
  '{"ok": true, "handle": "@pgtap.new"}'::jsonb, '가입 성공 → 새 핸들');
select is((select jsonb_build_object('name', name, 'handle', handle, 'email', email, 'platform', platform, 'active', active, 'phone', contact_phone, 'terms', terms_agreed_at)
             from public.sellers where user_id = '00000000-0000-4000-8000-000000000c71'),
  jsonb_build_object('name', '민지 루틴', 'handle', '@pgtap.new', 'email', 'pgtap-inv1@myr.test', 'platform', 'youtube', 'active', true, 'phone', '01012345678', 'terms', '2026-11-04T01:00:00Z'::timestamptz),
  'sellers 행 — 활동명 정리 · 핸들 @소문자 · 초대 이메일 · 연락처 숫자만 · 약관 시각 · 계정 연결');
select ok((select used_at is not null and seller_id = (select id from public.sellers where user_id = '00000000-0000-4000-8000-000000000c71') from public.myr_invites where id = (select (r ->> 'invite_id')::uuid from t_inv)), '초대 사용 처리 · 크리에이터 연결');
select is((select role from public.profiles where id = '00000000-0000-4000-8000-000000000c71'), 'seller', 'profiles.role = seller');
select is(public.myr_app_invite_accept((select r ->> 'token' from t_inv), '00000000-0000-4000-8000-000000000c71', '민지', 'pgtap.again', 'instagram', '010-1234-5678', now()) ->> 'code', 'USED', '같은 링크 두 번째 가입 USED');
select is(public.myr_app_invite_view((select r ->> 'token' from t_inv)) ->> 'code', 'USED', '쓴 링크 화면 USED');
select is(public.myr_app_admin_invite_create('pgtap-inv1@myr.test') ->> 'code', 'ALREADY_CREATOR', '가입한 크리에이터는 다시 초대 불가');

-- 다른 초대로 이미 연결된 계정 · 다른 크리에이터 이메일
create temp table t_two as select public.myr_app_admin_invite_create('pgtap-inv-other@myr.test') as r;
select is((select r ->> 'code' from t_two), 'EMAIL_HAS_ACCOUNT', '계정이 이미 있는 이메일은 발급 거절');
update auth.users set email = 'pgtap-inv-other-tmp@myr.test' where id = '00000000-0000-4000-8000-000000000c72';
create temp table t_three as select public.myr_app_admin_invite_create('pgtap-inv-other@myr.test') as r;
update auth.users set email = 'pgtap-inv-other@myr.test' where id = '00000000-0000-4000-8000-000000000c72';
update public.sellers set user_id = '00000000-0000-4000-8000-000000000c72' where id = '00000000-0000-4000-8000-000000000a71';
select is(public.myr_app_invite_accept((select r ->> 'token' from t_three), '00000000-0000-4000-8000-000000000c72', '민지', 'pgtap.three', 'instagram', '010-1234-5678', now()) ->> 'code', 'ALREADY_LINKED', '이미 다른 크리에이터에 연결된 계정 ALREADY_LINKED');

-- ---------- 새 초대 요청 · 취소 · 목록 ----------
select is(public.myr_app_invite_request(repeat('ab', 32)) ->> 'code', 'NOT_FOUND', '없는 링크 요청 NOT_FOUND');
select is(public.myr_app_invite_request((select r ->> 'token' from t_inv)) ->> 'code', 'USED', '이미 가입한 링크 요청 USED');
select is(public.myr_app_invite_request((select r ->> 'token' from t_old)), '{"ok": true, "email": "pgtap-inv-old@myr.test"}'::jsonb, '만료된 링크 요청 → 기록');
select is((select request_count from public.myr_invites where id = (select (r ->> 'invite_id')::uuid from t_old)), 1, '요청 횟수 1');
select is((select jsonb_agg(e ->> 'email') from jsonb_array_elements(public.myr_app_admin_invite_list('requested', 50)) e where e ->> 'email' like 'pgtap-%'), '["pgtap-inv-old@myr.test"]'::jsonb, '목록 requested = 요청 뒤 다시 초대 안 한 것');
select is((select e ->> 'state' from jsonb_array_elements(public.myr_app_admin_invite_list(null, 50)) e where e ->> 'id' = (select r ->> 'invite_id' from t_inv)), 'used', '목록 상태 used');
select is((select e -> 'seller' ->> 'handle' from jsonb_array_elements(public.myr_app_admin_invite_list('used', 50)) e where e ->> 'id' = (select r ->> 'invite_id' from t_inv)), '@pgtap.new', '목록에 가입한 크리에이터');

select is(public.myr_app_admin_invite_revoke('pgtap-inv-other@myr.test'), '{"ok": true, "revoked": 1}'::jsonb, '대기 중 초대 취소');
select is(public.myr_app_invite_view((select r ->> 'token' from t_three)) ->> 'code', 'REVOKED', '취소된 링크 REVOKED');
select is(public.myr_app_admin_invite_revoke(' ') ->> 'code', 'BAD_EMAIL', '빈 이메일 취소 BAD_EMAIL');

select * from finish();
rollback;
