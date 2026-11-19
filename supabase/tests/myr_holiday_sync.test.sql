-- pgTAP — 0123 공휴일 자동 동기화: 올해 · 동기화할 연도(myr_holiday_this_year · myr_holiday_sync_years) · 그해 날짜(myr_holiday_in_year) · 개수(myr_holiday_count) ·
--   이름 형식(myr_holiday_name_ok — 표 제약과 같은 함수) · 동기화(myr_holidays_sync — 넣기 · 이름 맞추기 · manual → api · api 지우기 · manual 그대로 ·
--   빈 목록은 올해 실패 · 내년 건너뜀 · 거부 코드) · 올해 비었나(myr_holidays_missing) · payment_events source.
-- 2040 · 2041년을 쓴다(시작 값 2026-12 · 2027 과 겹치지 않게). 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(34);

-- ---------- 권한 ----------
select function_privs_are('public', f, a::text[], 'authenticated', '{}'::text[], 'authenticated 는 ' || f || ' 불가')
  from (values ('myr_holiday_this_year', '{"timestamp with time zone"}'), ('myr_holiday_sync_years', '{"timestamp with time zone"}'), ('myr_holiday_in_year', '{date,integer}'),
               ('myr_holiday_count', '{integer}'), ('myr_holiday_name_ok', '{text}'), ('myr_holidays_sync', '{integer,jsonb,"timestamp with time zone"}'),
               ('myr_holidays_missing', '{"timestamp with time zone"}')) v(f, a);
select function_privs_are('public', 'myr_holidays_sync', '{integer,jsonb,"timestamp with time zone"}'::text[], 'anon', '{}'::text[], 'anon 은 sync 불가');
select function_privs_are('public', 'myr_holidays_sync', '{integer,jsonb,"timestamp with time zone"}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 sync 가능');
select hasnt_function('public', 'myr_holidays_sync', '{integer,jsonb}'::text[], '인자 둘짜리 옛 sync 는 없다');

-- ---------- 이름 형식 — 표 제약 · 동기화 검사가 같은 함수(숫자를 두 곳에 두지 않는다) ----------
select is(array[public.myr_holiday_name_ok('설날'), public.myr_holiday_name_ok(repeat('가', 40)), public.myr_holiday_name_ok(repeat('가', 41)), public.myr_holiday_name_ok(''), public.myr_holiday_name_ok(null)],
          array[true, true, false, false, false], '이름 1~40자');
select is((select pg_get_constraintdef(c.oid) from pg_constraint c where c.conname = 'myr_holidays_name_check'), 'CHECK (myr_holiday_name_ok(name))', '표 제약도 myr_holiday_name_ok');
select is((select count(*)::int from pg_constraint c where c.conrelid = 'public.myr_holidays'::regclass and pg_get_constraintdef(c.oid) ~ 'char_length'), 0, '표 제약에 글자 수 숫자가 따로 없다');
select throws_ok($$insert into public.myr_holidays (day, name) values ('2040-12-30', repeat('가', 41))$$, '23514', null, '표에 41자 이름은 거절(같은 함수)');

-- ---------- 연도 ----------
select is(array[public.myr_holiday_sync_years('2040-12-31 23:30+09'), public.myr_holiday_sync_years('2040-12-31 15:30+00'), public.myr_holiday_sync_years('2041-01-01 00:10+09')],
          array[array[2040, 2041], array[2041, 2042], array[2041, 2042]], '동기화할 연도 — KST 올해 · 내년(UTC 로 아직 12월 31일이어도 KST 1월 1일이면 새해)');
select is(array[public.myr_holiday_in_year('2040-12-31', 2040), public.myr_holiday_in_year('2041-01-01', 2040), public.myr_holiday_in_year(null, 2040)], array[true, false, false], '그해 날짜인가');

-- ---------- 거부 ----------
select is(array[public.myr_holidays_sync(null, '[]') ->> 'code', public.myr_holidays_sync(1999, '[]') ->> 'code', public.myr_holidays_sync(2040, '{}') ->> 'code', public.myr_holidays_sync(2040, null) ->> 'code'],
          array['BAD_YEAR', 'BAD_YEAR', 'BAD_DAYS', 'BAD_DAYS'], 'BAD_YEAR · 배열이 아니면 BAD_DAYS');
select is(public.myr_holiday_this_year('2040-12-31 15:30+00'), 2041, '올해 — KST(UTC 12월 31일 15:30 = KST 1월 1일)');
-- 빈 목록 — 올해면 실패(API 이상 · 운영 알림) · 내년이면 건너뜀(아직 발표 전) — 판정은 DB(크론은 ok 만 본다)
select is(public.myr_holidays_sync(2040, '[]', '2040-06-01 12:00+09'), '{"ok": false, "code": "EMPTY", "year": 2040, "total": 0}'::jsonb, '올해 빈 목록 — EMPTY 실패 · 지우지 않는다 · 지금 개수');
select is(public.myr_holidays_sync(2041, '[]', '2040-06-01 12:00+09'), '{"ok": true, "year": 2041, "skipped": "NOT_PUBLISHED", "total": 0}'::jsonb, '내년 빈 목록 — 건너뜀(실패 아님)');
select is(array[public.myr_holidays_sync(2040, '[{"day": "2040-02-30", "name": "없는 날"}]') ->> 'code',
                public.myr_holidays_sync(2040, '[{"day": "20400101", "name": "형식"}]') ->> 'code',
                public.myr_holidays_sync(2040, '[{"day": "2040-01-01", "name": " "}]') ->> 'code',
                public.myr_holidays_sync(2040, '[{"day": "2041-01-01", "name": "다른 해"}]') ->> 'code',
                public.myr_holidays_sync(2040, '[{"day": "2040-01-01", "name": "a"}, {"day": "2040-01-01", "name": "b"}]') ->> 'code',
                public.myr_holidays_sync(2040, '["2040-01-01"]') ->> 'code'],
          array['BAD_DAYS', 'BAD_DAYS', 'BAD_DAYS', 'BAD_DAYS', 'BAD_DAYS', 'BAD_DAYS'], 'BAD_DAYS — 없는 날짜 · 형식 · 빈 이름 · 다른 해 · 같은 날 두 번 · 객체 아님');
select is(public.myr_holiday_count(2040), 0, '거부되면 아무것도 바꾸지 않는다');

-- ---------- 동기화 ----------
-- 운영이 넣은 날(manual) 둘 — 하나는 API 에도 있고(→ api 로) 하나는 API 에 없다(그대로)
insert into public.myr_holidays (day, name) values ('2040-01-01', '신정(운영)'), ('2040-04-11', '임시공휴일(운영)');
-- 시작 값(manual)이 남아 있는데 API 가 올해를 0건으로 주면 — 올해 비었나(missing)는 거짓이어도 동기화가 실패(EMPTY)라 크론이 알린다 · 지우지 않는다
select is(array[public.myr_holidays_sync(2040, '[]', '2040-06-01 12:00+09') ->> 'code', public.myr_holiday_count(2040)::text, public.myr_holidays_missing('2040-06-01 12:00+09')::text],
          array['EMPTY', '2', 'false'], '올해 0건 응답 + 운영 입력 남음 — 동기화 실패(알림) · 2건 그대로 · missing 은 거짓');
select is(public.myr_holidays_sync(2040, '[{"day": "2040-01-01", "name": "1월 1일"}, {"day": "2040-03-01", "name": "3·1절"}, {"day": "2040-05-05", "name": "어린이날"}]'),
          '{"ok": true, "year": 2040, "added": 2, "updated": 1, "removed": 0, "total": 4}'::jsonb, '첫 동기화 — 새 날 2 · 운영이 넣은 같은 날은 이름을 맞추고 api 로 · 운영만 넣은 날 그대로');
select is((select array_agg(day || ' ' || name || ' ' || source order by day) from public.myr_holidays where public.myr_holiday_in_year(day, 2040)),
          array['2040-01-01 1월 1일 api', '2040-03-01 3·1절 api', '2040-04-11 임시공휴일(운영) manual', '2040-05-05 어린이날 api'], '표 — 출처 api · manual');
select is(public.myr_holidays_sync(2040, '[{"day": "2040-01-01", "name": "1월 1일"}, {"day": "2040-03-01", "name": "3·1절"}, {"day": "2040-05-05", "name": "어린이날"}]'),
          '{"ok": true, "year": 2040, "added": 0, "updated": 0, "removed": 0, "total": 4}'::jsonb, '같은 목록 다시 — 바뀌는 것 없음(매일 돌아도 된다)');
-- API 에서 3·1절이 빠지고(취소) 이름이 바뀌고 새 날이 생기면
select is(public.myr_holidays_sync(2040, '[{"day": "2040-01-01", "name": "1월 1일"}, {"day": "2040-05-05", "name": "어린이날 · 부처님오신날"}, {"day": "2040-06-03", "name": "선거일"}]'),
          '{"ok": true, "year": 2040, "added": 1, "updated": 1, "removed": 1, "total": 4}'::jsonb, '빠진 api 날 지움 · 이름 맞춤 · 새 날');
select is((select array_agg(day || ' ' || source order by day) from public.myr_holidays where public.myr_holiday_in_year(day, 2040)),
          array['2040-01-01 api', '2040-04-11 manual', '2040-05-05 api', '2040-06-03 api'], '운영이 넣은 날은 API 에 없어도 지우지 않는다');
select is(public.myr_is_business_day('2040-06-04'), true, '동기화한 표를 영업일 판정(0122)이 그대로 읽는다 — 월요일');
select is(public.myr_is_business_day('2040-06-03'), false, '선거일(api)은 영업일이 아니다');
select is(public.myr_holidays_sync(2041, '[{"day": "2041-01-01", "name": "1월 1일"}]') ->> 'total', '1', '다른 해는 따로 — 2040 은 그대로');
select is(public.myr_holiday_count(2040), 4, '2040 개수 그대로');

-- ---------- 올해 비었나 ----------
select is(array[public.myr_holidays_missing('2040-06-01 12:00+09'), public.myr_holidays_missing('2042-06-01 12:00+09')], array[false, true], '올해 공휴일이 있으면 false · 없으면 true(알림)');

-- ---------- 운영 할 일 출처 ----------
select lives_ok($$insert into public.payment_events (source, event_type, payload, handled, result) values ('holidays', 'holiday_sync', '{}'::jsonb, false, 'error: test')$$, 'payment_events 출처 holidays');

select * from finish();
rollback;
