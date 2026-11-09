-- pgTAP — 0085 크리에이터 사업자 · 정산 정보: 권한 · 사업자번호 체크섬 · 저장 거부 코드 전부 · 가린 값 · 예금주 규칙 · 다시 확인 규칙 · 운영 확인/요청
begin;
select plan(47);

-- ---------- 권한 ----------
select function_privs_are('public', 'myr_app_seller_settle_info_of_user', '{uuid}'::text[], 'anon', '{}'::text[], 'anon 은 settle_info_of_user 불가');
select function_privs_are('public', 'myr_app_seller_settle_info_of_user', '{uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 settle_info_of_user 불가');
select function_privs_are('public', 'myr_app_seller_settle_info_save', '{uuid,text,text,text,text,text,text}'::text[], 'anon', '{}'::text[], 'anon 은 settle_info_save 불가');
select function_privs_are('public', 'myr_app_seller_settle_info_save', '{uuid,text,text,text,text,text,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 settle_info_save 불가');
select function_privs_are('public', 'myr_app_admin_settle_infos', '{text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 admin_settle_infos 불가');
select function_privs_are('public', 'myr_app_admin_settle_info_check', '{uuid,text,timestamptz,text,uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 admin_settle_info_check 불가');
select function_privs_are('public', 'myr_app_seller_settle_info_save', '{uuid,text,text,text,text,text,text}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 settle_info_save 가능');

-- ---------- 사업자번호 체크섬 ----------
select is(array[public.myr_biz_no_valid('124-81-00998'), public.myr_biz_no_valid('2208162517'), public.myr_biz_no_valid('1248100999'), public.myr_biz_no_valid('12481'), public.myr_biz_no_valid(null)],
          array[true, true, false, false, false], '사업자번호 체크섬 — 하이픈 무관 · 끝자리 틀림 · 자릿수 · null');

-- ---------- 픽스처 ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000e01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-settle@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, email, platform, active, user_id)
values ('00000000-0000-4000-8000-000000000e11', '민지 루틴', '@pgtap.settle', 'pgtap-settle@myr.test', 'instagram', true, '00000000-0000-4000-8000-000000000e01');
create temp table u as select '00000000-0000-4000-8000-000000000e01'::uuid as id;
-- 운영 확인 — 지금 제출 시각을 같이(운영이 목록에서 본 값)
create function pg_temp.chk(d text, note text default null) returns jsonb language sql as
  $$ select public.myr_app_admin_settle_info_check('00000000-0000-4000-8000-000000000e11', d, (select myr_settle_submitted_at from public.sellers where id = '00000000-0000-4000-8000-000000000e11'), note) $$;
create function pg_temp.save(c text, ceo text, biz text, bank text, acc text, holder text) returns jsonb language sql as
  $$ select public.myr_app_seller_settle_info_save((select id from u), c, ceo, biz, bank, acc, holder) $$;

select is(public.myr_app_seller_settle_info_of_user((select id from u)) ->> 'status', 'none', '처음은 미입력(none)');
select is(public.myr_app_seller_settle_info_of_user((select id from u)) ->> 'tax_email', 'pgtap-settle@myr.test', '세금계산서 이메일 = 초대 이메일');
select is(public.myr_app_seller_settle_info_of_user(null), null, '계정 없으면 null');

-- ---------- 저장 — 거부 ----------
select is(public.myr_app_seller_settle_info_save('00000000-0000-4000-8000-0000000000ff', '민지랩', '김민지', '124-81-00998', '신한', '110123456789', '김민지') ->> 'code', 'NOT_FOUND', '크리에이터가 아니면 NOT_FOUND');
select is(pg_temp.save('', '김민지', '124-81-00998', '신한', '110123456789', '김민지') ->> 'code', 'BAD_COMPANY', '상호 없음 BAD_COMPANY');
select is(pg_temp.save('민지랩', ' ', '124-81-00998', '신한', '110123456789', '김민지') ->> 'code', 'BAD_CEO', '대표자 없음 BAD_CEO');
select is(pg_temp.save('민지랩', '김민지', '124-81-00999', '신한', '110123456789', '김민지') ->> 'code', 'BAD_BIZ_NO', '체크섬 틀림 BAD_BIZ_NO');
select is(pg_temp.save('민지랩', '김민지', null, '신한', '110123456789', '김민지') ->> 'code', 'BAD_BIZ_NO', '저장된 번호가 없는데 null BAD_BIZ_NO');
select is(pg_temp.save('민지랩', '김민지', '124-81-00998', '', '110123456789', '김민지') ->> 'code', 'BAD_BANK', '은행 없음 BAD_BANK');
select is(pg_temp.save('민지랩', '김민지', '124-81-00998', '신한', '1234', '김민지') ->> 'code', 'BAD_ACCOUNT', '계좌 자릿수 BAD_ACCOUNT');
select is(pg_temp.save('민지랩', '김민지', '124-81-00998', '신한', '110123456789', '') ->> 'code', 'BAD_HOLDER', '예금주 없음 BAD_HOLDER');
select is(pg_temp.save('민지랩', '김민지', '124-81-00998', '신한', '110123456789', '박하루') ->> 'code', 'HOLDER_MISMATCH', '예금주가 상호 · 대표자 아님 HOLDER_MISMATCH');
select is((select myr_settle_status from public.sellers where id = '00000000-0000-4000-8000-000000000e11'), 'none', '거부되면 아무것도 저장 안 됨');

-- ---------- 저장 — 성공 ----------
select is((select jsonb_build_object('status', j #>> '{info,status}', 'biz', j #>> '{info,biz_no_masked}', 'acc', j #>> '{info,account_masked}', 'holder', j #>> '{info,holder}')
             from (select pg_temp.save('민지랩', '김민지', '124-81-00998', '신한은행', '110-123-456789', '김민지') as j) x),
  '{"status": "pending", "biz": "***-**-00998", "acc": "****6789", "holder": "김민지"}'::jsonb, '개인 계좌(예금주 = 대표자) 저장 → 확인 중 · 가린 값');
select is((select jsonb_build_object('biz', biz_no, 'type', settle_type, 'acc', bank_info ->> 'account') from public.sellers where id = '00000000-0000-4000-8000-000000000e11'),
  '{"biz": "1248100998", "acc": "110123456789", "type": "biz"}'::jsonb, '원문은 숫자만 저장 · settle_type biz');
select ok(not (public.myr_app_seller_settle_info_of_user((select id from u))::text ~ '110123456789|1248100998'), '크리에이터 응답에 계좌 · 사업자번호 원문 없음');
select is(pg_temp.save('(주) 민지 랩', '김민지', '124-81-00998', '국민', '987654321012', '민지랩') #>> '{info,holder}', '민지랩', '사업자 계좌(예금주 = 상호 · (주) · 공백 무시)');

-- ---------- 운영 확인 ----------
select is(pg_temp.chk('ok') ->> 'code', 'BAD_DECISION', 'BAD_DECISION');
select is(public.myr_app_admin_settle_info_check('00000000-0000-4000-8000-0000000000ff', 'verify', now()) ->> 'code', 'NOT_FOUND', '없는 크리에이터 NOT_FOUND');
select is(public.myr_app_admin_settle_info_check('00000000-0000-4000-8000-000000000e11', 'verify', now() - interval '1 hour') ->> 'code', 'STALE', '운영이 본 뒤 다시 저장됐으면 STALE(보지 않은 값을 확인하지 않게)');
select is(public.myr_app_admin_settle_info_check('00000000-0000-4000-8000-000000000e11', 'verify', null) ->> 'code', 'STALE', '제출 시각 없이 확인하면 STALE');
select is(pg_temp.chk('reject', '  ') ->> 'code', 'NOTE_REQUIRED', '다시 입력 요청은 사유 필수');
select is((select e ->> 'biz_no' from jsonb_array_elements(public.myr_app_admin_settle_infos('pending')) e where e ->> 'handle' = '@pgtap.settle'), '1248100998', '운영 목록은 원문(확인용)');
select is(public.myr_app_admin_settle_info_check('00000000-0000-4000-8000-000000000e11', 'verify', (select myr_settle_submitted_at from public.sellers where id = '00000000-0000-4000-8000-000000000e11'), null, '00000000-0000-4000-8000-000000000e01') ->> 'status', 'verified', '확인 완료(본 값 그대로)');
select is(pg_temp.chk('verify') ->> 'code', 'NOT_PENDING', '확인 중이 아니면 NOT_PENDING');

-- ---------- 다시 확인 규칙 ----------
select is((pg_temp.save('민지 랩 스튜디오', '김민지', null, '국민', null, '민지 랩 스튜디오') ->> 'recheck')::boolean, true, '예금주가 바뀌면 다시 확인');
select is(pg_temp.chk('verify') ->> 'status', 'verified', '(다시) 확인 완료');
select is((select jsonb_build_object('recheck', (j ->> 'recheck')::boolean, 'status', j #>> '{info,status}') from (select pg_temp.save('민지 랩 스튜디오2', '김민지', null, '국민', null, '김민지') as j) x),
  '{"recheck": true, "status": "pending"}'::jsonb, '상호 · 예금주가 같이 바뀌면 다시 확인');
select is(pg_temp.chk('verify') ->> 'status', 'verified', '확인 완료(예금주 = 대표자)');
select is((select jsonb_build_object('recheck', (j ->> 'recheck')::boolean, 'status', j #>> '{info,status}') from (select pg_temp.save('민지 랩 3', '김민지', null, '국민', null, '김민지') as j) x),
  '{"recheck": false, "status": "verified"}'::jsonb, '상호만 바꾸면 확인 완료 그대로(계좌 · 번호는 null = 그대로)');
select is(pg_temp.chk('reject', '예금주 확인이 안 돼요') ->> 'status', 'rejected', '다시 입력 요청');
select is(public.myr_app_seller_settle_info_of_user((select id from u)) ->> 'note', '예금주 확인이 안 돼요', '크리에이터가 다시 입력 요청 사유를 본다');

-- ---------- 프로필 사진 ----------
select function_privs_are('public', 'myr_app_seller_avatar_set', '{uuid,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 avatar_set 불가');
select is(public.myr_app_seller_avatar_set('00000000-0000-4000-8000-0000000000ff', null) ->> 'code', 'NOT_FOUND', '크리에이터가 아니면 NOT_FOUND');
select is(public.myr_app_seller_avatar_set((select id from u), 'https://x.supabase.co/storage/v1/object/public/myr-avatars/00000000-0000-4000-8000-000000000e99/abcdef12.jpg') ->> 'code', 'BAD_URL', '남의 폴더 BAD_URL');
select is(public.myr_app_seller_avatar_set((select id from u), 'https://x.supabase.co/storage/v1/object/public/myr-products/00000000-0000-4000-8000-000000000e11/abcdef12.jpg') ->> 'code', 'BAD_URL', '다른 버킷 BAD_URL');
select is(public.myr_app_seller_avatar_set((select id from u), 'https://x.supabase.co/storage/v1/object/public/myr-avatars/00000000-0000-4000-8000-000000000e11/abcdef12.jpg') ->> 'previous', null, '사진 저장 — 이전 사진 없음');
select is(public.myr_app_seller_avatar_set((select id from u), 'https://x.supabase.co/storage/v1/object/public/myr-avatars/00000000-0000-4000-8000-000000000e11/abcdef34.png') ->> 'previous',
  'https://x.supabase.co/storage/v1/object/public/myr-avatars/00000000-0000-4000-8000-000000000e11/abcdef12.jpg', '바꾸면 이전 사진 주소를 돌려준다(서버가 지운다)');
select is((select avatar_url from public.sellers where id = '00000000-0000-4000-8000-000000000e11'), 'https://x.supabase.co/storage/v1/object/public/myr-avatars/00000000-0000-4000-8000-000000000e11/abcdef34.png', 'avatar_url 저장');

select * from finish();
rollback;
