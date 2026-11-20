-- 0125 MYR 파트너팀 톡 — 권한 · 본문 형식 · 보내기 거부 · 방 요약 · 읽음 · 운영 목록 · 답하기
begin;
select plan(36);

-- ---------- 권한 ----------
select function_privs_are('public', f, a::text[], 'anon', '{}'::text[], 'anon 은 ' || f || ' 불가')
  from (values ('myr_app_partner_talk_of_user', '{uuid,boolean}'), ('myr_app_partner_unread_of_user', '{uuid}'), ('myr_app_partner_send_of_user', '{uuid,text}'),
               ('myr_app_admin_partner_threads', '{boolean}'), ('myr_app_admin_partner_talk', '{uuid,boolean}'), ('myr_app_admin_partner_reply', '{uuid,text,uuid}')) v(f, a);
select function_privs_are('public', f, a::text[], 'authenticated', '{}'::text[], 'authenticated 는 ' || f || ' 불가')
  from (values ('myr_app_partner_talk_of_user', '{uuid,boolean}'), ('myr_app_partner_unread_of_user', '{uuid}'), ('myr_app_partner_send_of_user', '{uuid,text}'),
               ('myr_app_admin_partner_threads', '{boolean}'), ('myr_app_admin_partner_talk', '{uuid,boolean}'), ('myr_app_admin_partner_reply', '{uuid,text,uuid}')) v(f, a);
select is(array[has_table_privilege('anon', 'public.myr_partner_messages', 'select'), has_table_privilege('authenticated', 'public.myr_partner_messages', 'select'),
                has_table_privilege('anon', 'public.myr_partner_threads', 'select'), has_table_privilege('authenticated', 'public.myr_partner_threads', 'select')],
          array[false, false, false, false], '표는 anon · authenticated 가 못 본다');
select is((select bool_and(relrowsecurity) from pg_class where oid in ('public.myr_partner_messages'::regclass, 'public.myr_partner_threads'::regclass)), true, '표 RLS 켜짐');

-- ---------- 픽스처 ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000f25c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-talk@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id) values ('00000000-0000-4000-8000-0000000f2501', '톡 크리에이터', '@pgtap.talk', 'instagram', true, '00000000-0000-4000-8000-0000000f25c1');
create function pg_temp.send(body text) returns jsonb language sql as
  $$ select public.myr_app_partner_send_of_user('00000000-0000-4000-8000-0000000f25c1', body) $$;
create function pg_temp.t() returns public.myr_partner_threads language sql as $$ select * from public.myr_partner_threads where seller_id = '00000000-0000-4000-8000-0000000f2501' $$;

-- ---------- 본문 형식 ----------
select is(array[public.myr_partner_body_ok('안녕하세요'), public.myr_partner_body_ok('   '), public.myr_partner_body_ok(null), public.myr_partner_body_ok(repeat('가', 2000)), public.myr_partner_body_ok(repeat('가', 2001))],
          array[true, false, false, true, false], '본문 — 앞뒤 공백 뺀 1~2000자');

-- ---------- 보내기 거부 ----------
select is(public.myr_app_partner_send_of_user('00000000-0000-4000-8000-0000000000ff', '안녕') ->> 'code', 'NOT_FOUND', '크리에이터 계정이 아니면 NOT_FOUND');
select is(pg_temp.send('  ') - 'max', '{"ok": false, "code": "BAD_BODY"}'::jsonb, '빈 본문 BAD_BODY');
select is(public.myr_app_partner_talk_of_user('00000000-0000-4000-8000-0000000000ff') ->> 'code', 'NOT_FOUND', '대화 — 크리에이터 계정이 아니면 NOT_FOUND');
select is(public.myr_app_partner_unread_of_user('00000000-0000-4000-8000-0000000000ff'), 0, '뱃지 — 크리에이터 계정이 아니면 0');

-- ---------- 보내기 → 방 요약 ----------
select is(pg_temp.send('  정산 정보를 잘못 넣었어요  ') #>> '{message,body}', '정산 정보를 잘못 넣었어요', '보내기 — 앞뒤 공백 정리');
select is(((pg_temp.t()).last_sender, (pg_temp.t()).last_preview)::text, '(seller,"정산 정보를 잘못 넣었어요")', '방 요약 — 마지막 보낸 쪽 · 미리보기');
select is(public.myr_partner_waiting(pg_temp.t()), true, '크리에이터가 마지막 — 운영이 답할 차례');
select is(array[public.myr_partner_seller_unread('00000000-0000-4000-8000-0000000f2501'), public.myr_partner_admin_unread('00000000-0000-4000-8000-0000000f2501')], array[0, 1], '안 읽음 — 크리에이터 0 · 운영 1');

-- ---------- 운영 ----------
select is((select e ->> 'handle' from jsonb_array_elements(public.myr_app_admin_partner_threads(true)) e where e ->> 'seller_id' = '00000000-0000-4000-8000-0000000f2501'), '@pgtap.talk', '운영 목록(답할 차례만)에 나온다');
select is(public.myr_app_admin_partner_reply('00000000-0000-4000-8000-0000000000ff', '답변', null) ->> 'code', 'NOT_FOUND', '답하기 — 없는 크리에이터 NOT_FOUND');
select is(public.myr_app_admin_partner_reply('00000000-0000-4000-8000-0000000f2501', '', null) ->> 'code', 'BAD_BODY', '답하기 — 빈 본문 BAD_BODY');
select is(public.myr_app_admin_partner_talk('00000000-0000-4000-8000-0000000f2501') ->> 'unread', '0', '운영이 대화를 열면 운영 안 읽음 0');
-- 테스트는 트랜잭션 하나라 now() 가 같다 — 크리에이터가 읽은 시각을 1분 앞으로(실제로는 요청마다 다르다)
update public.myr_partner_threads set seller_read_at = now() - interval '1 minute' where seller_id = '00000000-0000-4000-8000-0000000f2501';
select is(public.myr_app_admin_partner_reply('00000000-0000-4000-8000-0000000f2501', '다시 입력 요청을 보냈어요', null) #>> '{message,sender}', 'admin', '답하기');
select is(public.myr_partner_waiting(pg_temp.t()), false, '운영이 마지막 — 답할 차례 아님');
select is((select count(*)::int from jsonb_array_elements(public.myr_app_admin_partner_threads(true)) e where e ->> 'seller_id' = '00000000-0000-4000-8000-0000000f2501'), 0, '답한 뒤 — 답할 차례 목록에서 빠진다');
select is(public.myr_app_partner_unread_of_user('00000000-0000-4000-8000-0000000f25c1'), 1, '크리에이터 뱃지 1(안 읽은 답변)');

-- ---------- 크리에이터가 열기 ----------
select is((select jsonb_agg(e ->> 'sender') from jsonb_array_elements(public.myr_app_partner_talk_of_user('00000000-0000-4000-8000-0000000f25c1') -> 'messages') e), '["seller", "admin"]'::jsonb,
          '대화 — 오래된 것부터');
select is(public.myr_app_partner_unread_of_user('00000000-0000-4000-8000-0000000f25c1'), 0, '열면 읽음 — 뱃지 0');
select is(public.myr_app_partner_talk_of_user('00000000-0000-4000-8000-0000000f25c1', false) ->> 'ok', 'true', '읽음 표시 없이 읽기');

-- ---------- 너무 빠르게 ----------
select is((select count(*)::int from generate_series(1, 9) g where (pg_temp.send('메시지 ' || g) ->> 'ok') = 'true'), 9, '1분에 9개 더(모두 10개)');
select is(pg_temp.send('11번째') ->> 'code', 'TOO_FAST', '1분에 10개를 넘으면 TOO_FAST');

select * from finish();
rollback;
