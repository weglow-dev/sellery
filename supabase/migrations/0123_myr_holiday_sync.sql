-- ============================================================
-- 0123 · MYR 공휴일 자동 동기화 — 공공데이터포털 "한국천문연구원 특일 정보" API → myr_holidays(0122) (2026-11-19)
--
--   0122 의 공휴일 표는 출처 api(동기화가 넣고 지운다) · manual(운영이 넣은 임시공휴일 등 — 동기화가 지우지 않는다)로 나뉜다.
--   샵 크론 /api/cron/holidays 가 하루 한 번 올해 · 내년을 받아 이 함수들로 적는다(키 DATA_GO_KR_SERVICE_KEY · 공용 계정).
--   다음 해 공휴일은 보통 전 해 6월쯤(월력요항 발표) API 에 올라온다 — 그 전에는 내년이 0건이라 건너뛴다(오류 아님).
--
--   myr_holiday_this_year(now)      KST 올해 — 동기화할 연도 · 올해 빈 목록 · 올해 비었나가 같이 쓴다
--   myr_holiday_sync_years(now)     동기화할 연도 [올해, 내년]
--   myr_holiday_in_year(day, year)  그해 날짜인가 — 개수 · 받은 목록 검사 · 지우기가 같이 쓴다
--   myr_holiday_count(year)         그해 공휴일 수
--   myr_holiday_name_ok(name)       공휴일 이름 형식(1~40자) — 표 제약(0122 의 숫자 제약을 이 함수로 바꾼다) · 동기화 검사 · 화면 상수(HOLIDAY_NAME_MAX · check-boundaries (j))가 같은 값
--   myr_holidays_sync(year, days, now)  그해 api 날짜를 받은 목록으로 바꾼다 — days = [{ day: 'YYYY-MM-DD', name }]
--       넣기: 새 날 → api · 이미 있는 날(manual 시작 값 포함)은 이름을 맞추고 api 로(같은 날을 API 가 확인했다)
--       지우기: 그해 api 날짜 중 목록에 없는 날(취소된 임시공휴일 등) · manual 은 지우지 않는다
--       빈 목록: 올해면 실패 EMPTY(API 이상 — 운영 알림 · 지우지 않는다) · 내년이면 건너뜀 { ok: true, skipped: 'NOT_PUBLISHED' }(아직 발표 전)
--         — 올해 · 내년 판정은 여기서 한다(크론 TS 는 ok 만 본다)
--       거부: BAD_YEAR · BAD_DAYS(배열 아님 · 날짜 · 이름 형식 · 그해 밖 · 같은 날 두 번) · EMPTY
--       통과: { ok, year, added, updated, removed, total }
--   myr_holidays_missing(now)       올해 공휴일이 하나도 없나 — 크론이 운영 할 일(payment_events source 'holidays')로 알린다
--   payment_events.source 에 'holidays' — 동기화 실패(키 만료 · API 오류 · 올해 빈 목록) · 올해 비어 있음
--   권한: 전부 service role 만. 테스트: supabase/tests/myr_holiday_sync.test.sql
-- ============================================================

alter table public.payment_events drop constraint if exists payment_events_source_check;
alter table public.payment_events add constraint payment_events_source_check
  check (source in ('webhook', 'deposit_callback', 'confirm', 'cancel', 'settlement', 'holidays'));

create or replace function public.myr_holiday_this_year(p_now timestamptz default now())
returns integer
language sql
stable
as $$
  select extract(year from public.myr_kst_date(p_now))::int
$$;
revoke all on function public.myr_holiday_this_year(timestamptz) from public, anon, authenticated;

create or replace function public.myr_holiday_sync_years(p_now timestamptz default now())
returns integer[]
language sql
stable
as $$
  select array[y, y + 1] from (select public.myr_holiday_this_year(p_now) as y) x
$$;
revoke all on function public.myr_holiday_sync_years(timestamptz) from public, anon, authenticated;
grant execute on function public.myr_holiday_sync_years(timestamptz) to service_role;

create or replace function public.myr_holiday_in_year(p_day date, p_year integer)
returns boolean
language sql
immutable
as $$
  select coalesce(extract(year from p_day)::int = p_year, false)
$$;
revoke all on function public.myr_holiday_in_year(date, integer) from public, anon, authenticated;

create or replace function public.myr_holiday_count(p_year integer)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*)::int from public.myr_holidays h where public.myr_holiday_in_year(h.day, p_year)
$$;
revoke all on function public.myr_holiday_count(integer) from public, anon, authenticated;
grant execute on function public.myr_holiday_count(integer) to service_role;

-- 이름 형식 — 표 제약도 이 함수(숫자를 두 곳에 두지 않는다)
create or replace function public.myr_holiday_name_ok(p text)
returns boolean
language sql
immutable
as $$
  select coalesce(char_length(p) between 1 and 40, false)
$$;
revoke all on function public.myr_holiday_name_ok(text) from public, anon, authenticated;
alter table public.myr_holidays drop constraint if exists myr_holidays_name_check;
alter table public.myr_holidays add constraint myr_holidays_name_check check (public.myr_holiday_name_ok(name));

drop function if exists public.myr_holidays_sync(integer, jsonb);
create or replace function public.myr_holidays_sync(p_year integer, p_days jsonb, p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_days    date[];
  v_names   text[];
  v_added   integer;
  v_updated integer;
  v_removed integer;
begin
  if p_year is null or p_year not between 2000 and 2100 then return jsonb_build_object('ok', false, 'code', 'BAD_YEAR'); end if;
  if p_days is null or jsonb_typeof(p_days) <> 'array' then return jsonb_build_object('ok', false, 'code', 'BAD_DAYS'); end if;
  -- 빈 목록 — 한 해를 비우지 않는다. 올해면 API 이상(실패 · 운영 알림) · 아니면 아직 발표 전(건너뜀)
  if jsonb_array_length(p_days) = 0 then
    if p_year = public.myr_holiday_this_year(p_now) then
      return jsonb_build_object('ok', false, 'code', 'EMPTY', 'year', p_year, 'total', public.myr_holiday_count(p_year));
    end if;
    return jsonb_build_object('ok', true, 'year', p_year, 'skipped', 'NOT_PUBLISHED', 'total', public.myr_holiday_count(p_year));
  end if;
  -- 형식 — 원소마다 객체 · day(YYYY-MM-DD · 있는 날짜) · name(myr_holiday_name_ok)
  if exists (select 1 from jsonb_array_elements(p_days) e
              where not (jsonb_typeof(e) = 'object'
                         and coalesce(e ->> 'day', '') ~ '^\d{4}-\d{2}-\d{2}$'
                         and public.myr_holiday_name_ok(btrim(coalesce(e ->> 'name', ''))))) then
    return jsonb_build_object('ok', false, 'code', 'BAD_DAYS');
  end if;
  begin
    select array_agg((e ->> 'day')::date order by o), array_agg(btrim(e ->> 'name') order by o)
      into v_days, v_names from jsonb_array_elements(p_days) with ordinality x(e, o);
  exception when invalid_datetime_format or datetime_field_overflow then
    return jsonb_build_object('ok', false, 'code', 'BAD_DAYS');
  end;
  -- 그해 안 · 같은 날 두 번 없음(이름을 합치는 것은 받는 쪽 — holiday-rules.ts)
  if exists (select 1 from unnest(v_days) d where not public.myr_holiday_in_year(d, p_year))
     or cardinality(v_days) <> (select count(distinct d) from unnest(v_days) d) then
    return jsonb_build_object('ok', false, 'code', 'BAD_DAYS');
  end if;

  select count(*) into v_added from unnest(v_days) d where not exists (select 1 from public.myr_holidays h where h.day = d);
  select count(*) into v_updated from unnest(v_days, v_names) i(day, name) join public.myr_holidays h on h.day = i.day
   where h.name is distinct from i.name or h.source <> 'api';
  insert into public.myr_holidays (day, name, source)
  select i.day, i.name, 'api' from unnest(v_days, v_names) i(day, name)
  on conflict (day) do update set name = excluded.name, source = 'api'
   where public.myr_holidays.name is distinct from excluded.name or public.myr_holidays.source <> 'api';
  with d as (
    delete from public.myr_holidays h
     where public.myr_holiday_in_year(h.day, p_year) and h.source = 'api' and not (h.day = any (v_days))
    returning 1)
  select count(*) into v_removed from d;

  return jsonb_build_object('ok', true, 'year', p_year, 'added', v_added, 'updated', v_updated, 'removed', v_removed,
                            'total', public.myr_holiday_count(p_year));
end;
$$;
revoke all on function public.myr_holidays_sync(integer, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_holidays_sync(integer, jsonb, timestamptz) to service_role;

create or replace function public.myr_holidays_missing(p_now timestamptz default now())
returns boolean
language sql
stable
as $$
  select public.myr_holiday_count(public.myr_holiday_this_year(p_now)) = 0
$$;
revoke all on function public.myr_holidays_missing(timestamptz) from public, anon, authenticated;
grant execute on function public.myr_holidays_missing(timestamptz) to service_role;
