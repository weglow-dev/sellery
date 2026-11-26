-- pgTAP — 0128 아웃리치 메타 연결: 관리자(service_role) 전용 한 줄 표 · 토큰은 암호문 형식만. 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(10);

-- ---------- 표 · 권한 ----------
select has_table('public', 'outreach_meta_connection', '표가 있다');
select ok((select relrowsecurity from pg_class where oid = 'public.outreach_meta_connection'::regclass), 'RLS on');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'outreach_meta_connection'), 0, '정책 없음 — service_role 만 통과');
select table_privs_are('public', 'outreach_meta_connection', 'anon', '{}'::text[], 'anon 은 직접 권한 없음');
select table_privs_are('public', 'outreach_meta_connection', 'authenticated', '{}'::text[], 'authenticated 도 직접 권한 없음');
select ok(has_table_privilege('service_role', 'public.outreach_meta_connection', 'SELECT, INSERT, UPDATE, DELETE'), 'service_role 은 읽기·쓰기 가능');

-- ---------- 한 줄 · 암호문 형식 ----------
insert into public.outreach_meta_connection (page_id, page_name, ig_user_id, ig_username, token_enc, scopes, connected_by)
values ('1000', 'Make Your Recipe', '17841000000000001', 'makeyour.recipe', 'v1.aXZpdml2aXZpdml2.Y2lwaGVydGV4dHRhZw', array['instagram_basic', 'instagram_creator_marketplace_discovery'], 'pgtap@weglow.test');
select is((select slot from public.outreach_meta_connection), 'outreach', 'slot 기본값 = outreach');
select throws_ok(
  $$insert into public.outreach_meta_connection (slot, page_id, ig_user_id, token_enc) values ('second', '2000', '17841000000000002', 'v1.a.b.c')$$,
  '23514', null, '다른 slot 은 거부 — 한 줄만');
select throws_ok(
  $$insert into public.outreach_meta_connection (page_id, ig_user_id, token_enc) values ('2000', '17841000000000002', 'v1.a.b.c')$$,
  '23505', null, '같은 slot 두 번째 줄은 거부');
select throws_ok(
  $$update public.outreach_meta_connection set token_enc = 'EAAplaintexttoken'$$,
  '23514', null, '평문 토큰 모양은 거부 — v1. 암호문만');

select * from finish();
rollback;
