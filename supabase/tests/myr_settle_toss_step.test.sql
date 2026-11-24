-- pgTAP — 0126 정산 "지급까지 할 일" ③ 토스 본인인증: 정보 응답 payout_toss = 지급 방식이 토스인가(myr_payout_toss_on) · 보류 이유 toss_auth 와 같은 기준
begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000f26c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-toss-step@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id, myr_settle_status)
values ('00000000-0000-4000-8000-0000000f2601', '토스 단계', '@pgtap.toss.step', 'instagram', true, '00000000-0000-4000-8000-0000000f26c1', 'verified');
create function pg_temp.info() returns jsonb language sql as
  $$ select public.myr_app_seller_settle_info_of_user('00000000-0000-4000-8000-0000000f26c1') $$;
create function pg_temp.mode(m text) returns void language sql as
  $$ update public.platform_settings set value = jsonb_set(value, '{mode}', to_jsonb(m)) where key = 'myr_payout' $$;
create function pg_temp.holds() returns jsonb language sql as
  $$ select coalesce(jsonb_agg(e ->> 'code'), '[]'::jsonb) from jsonb_array_elements(public.myr_seller_next_hold_json('00000000-0000-4000-8000-0000000f2601') -> 'all') e $$;

-- ---------- 수동 지급 — ③ 없음 ----------
select pg_temp.mode('manual');
select is(pg_temp.info() ->> 'payout_toss', 'false', '수동 지급 — payout_toss false(③ 을 보이지 않는다)');
select is(pg_temp.holds(), '[]'::jsonb, '수동 지급 — 토스 셀러가 없어도 보류 이유 없음(toss_auth 는 토스 방식에서만)');

-- ---------- 토스 지급 — ③ 있음 · 끝났는지는 보류 이유 toss_auth ----------
select pg_temp.mode('toss');
select is(pg_temp.info() ->> 'payout_toss', 'true', '토스 지급 — payout_toss true(③ 을 보인다)');
select is(pg_temp.holds(), '["toss_auth"]'::jsonb, '토스 지급 · 토스 셀러 없음 — 보류 이유 toss_auth(③ 아직)');
select is((pg_temp.info() ->> 'payout_toss')::boolean, public.myr_payout_toss_on(), 'payout_toss = myr_payout_toss_on()(같은 함수)');

select * from finish();
rollback;
