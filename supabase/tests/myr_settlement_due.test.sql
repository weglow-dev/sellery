-- pgTAP — 정산할 차례인 달(0106 myr_settlement_due) · 다음 회차 미리보기(myr_settlement_next) · 정산 크론 실패 운영 할 일(payment_events source 'settlement').
--   로컬 DB 에 회차가 있어도 결과가 같게 먼 미래 회차(2030-01)를 넣고 본다 — 마지막 회차 = 2030-01.
begin;
select plan(25);

select function_privs_are('public', 'myr_settlement_due', '{timestamptz}'::text[], 'anon', '{}'::text[], 'anon 은 settlement_due 불가');
select function_privs_are('public', 'myr_settlement_due', '{timestamptz}'::text[], 'authenticated', '{}'::text[], 'authenticated 도 settlement_due 불가');
select function_privs_are('public', 'myr_settlement_due', '{timestamptz}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 settlement_due 가능(크론)');

-- 회차가 하나도 없으면 KST 지난달 — 빈 DB(CI)에서만 볼 수 있다(로컬에 회차가 있으면 이 검사는 건너뛴다)
select ok(case when exists (select 1 from public.myr_settlement_runs) then true
               else public.myr_settlement_due('2026-12-01 13:00+09') = '2026-11-01'::date end,
          '회차가 없으면 KST 지난달(빈 DB 에서만 확인)');

insert into public.myr_settlement_runs (month, cutoff_at, created_by) values ('2030-01-01', '2030-02-01 13:00+09', 'pgtap');
select is(public.myr_settlement_after_last(), '2030-02-01'::date, '마지막 회차 다음 달');

-- 정상 — 다음 달(2월)이 끝난 3월 1일 13시 → 2월
select is(public.myr_settlement_due('2030-02-15 13:00+09'), null, '2월이 아직 안 끝났으면 차례인 달 없음(크론은 바로 끝)');
select is(public.myr_settlement_due('2030-02-28 23:59+09'), null, '2월 말일 밤에도 없음');
select is(public.myr_settlement_due('2030-03-01 00:00+09'), '2030-02-01'::date, '3월 1일 0시(KST) — 2월이 끝나면 2월');
select is(public.myr_settlement_due('2030-02-28 15:00+00'), '2030-02-01'::date, 'UTC 로는 2월 28일이지만 KST 3월 1일 0시 → 2월');
select is(public.myr_settlement_due('2030-03-01 13:00+09'), '2030-02-01'::date, '정산일(3월 1일 13시) → 2월');

-- 실패 따라잡기 — 3월 1일 크론이 실패해 2월 회차가 없으면 다음 날도 2월 · 두 달이 빠져도 가장 오래된 달부터
select is(public.myr_settlement_due('2030-03-02 13:00+09'), '2030-02-01'::date, '1일에 실패하면 다음 날도 2월');
select is(public.myr_settlement_due('2030-04-02 13:00+09'), '2030-02-01'::date, '두 달 빠지면 가장 오래된 2월부터(지난달 3월이 아니다)');

-- 다음 회차 미리보기 — 차례인 달이 있으면 (그 달, 그 달 끝) · 없으면 (이번 달, 지금)
select is((select row(n.month, n.end_at)::text from public.myr_settlement_next('2030-04-02 13:00+09') n),
          row('2030-02-01'::date, '2030-03-01 00:00+09'::timestamptz)::text, '미리보기도 크론이 돌릴 달(2월 · 대상 끝 3월 1일 0시)');
select is((select row(n.month, n.end_at)::text from public.myr_settlement_next('2030-02-15 13:00+09') n),
          row('2030-02-01'::date, '2030-02-15 13:00+09'::timestamptz)::text, '차례인 달이 없으면 이번 달 · 지금까지(0089 와 같다)');

-- 회차는 정산할 차례인 달만 — 2월이 빠진 채로 3월을 돌리면 NOT_DUE(차례인 달 2월을 알려 준다) · 3월이 먼저 생겨 2월이 영영 막히는 일을 DB 가 막는다
select is(public.myr_settlement_run('2030-03-01', 'pgtap', '2030-04-02 13:00+09') - 'ok', '{"code": "NOT_DUE", "due": "2030-02"}'::jsonb, '차례가 아닌 늦은 달은 NOT_DUE(수동 실행 · 스크립트도)');

select is((select array_agg(public.myr_settlement_pay_at(m) order by m) from unnest(array['2030-02-01', '2030-12-15']::date[]) m),
          array['2030-03-01 13:00+09', '2031-01-01 13:00+09']::timestamptz[], '지급 시각 = 마감 날(다음 달 1일) 13시 · 연말도(마감 · 13시 함수 하나씩)');

-- 미리보기 정산 시각 — 따라잡는 중이면 지난 시각 대신 다음 크론 시각(매일 13:00 KST)
select is(public.myr_settlement_next_cron('2030-03-01 12:59+09'), '2030-03-01 13:00+09'::timestamptz, '다음 크론 — 13시 전이면 오늘 13시');
select is(public.myr_settlement_next_cron('2030-03-01 13:00+09'), '2030-03-02 13:00+09'::timestamptz, '다음 크론 — 13시부터는 내일 13시');
select is(public.myr_settlement_settle_at('2030-02-01', '2030-02-15 10:00+09'), '2030-03-01 13:00+09'::timestamptz, '정산 시각 — 평소엔 원래 시각(3월 1일 13시)');
select is(public.myr_settlement_settle_at('2030-02-01', '2030-03-01 13:30+09'), '2030-03-01 13:00+09'::timestamptz, '크론이 도는 동안(1시간 안)은 원래 시각 그대로');
select is(public.myr_settlement_settle_at('2030-02-01', '2030-03-01 14:30+09'), '2030-03-02 13:00+09'::timestamptz, '1일 크론이 실패하면 그날 오후부터 다음 날 13시');
select is(public.myr_settlement_settle_at('2030-02-01', '2030-04-02 10:00+09'), '2030-04-02 13:00+09'::timestamptz, '두 달 늦어도 지난 시각이 아니라 다음 크론 시각');
select is((public.myr_settlement_preview('00000000-0000-4000-8000-00000000dead', '2030-04-02 10:00+09') ->> 'settle_at')::timestamptz, '2030-04-02 13:00+09'::timestamptz,
          '미리보기 settle_at 도 같은 함수(따라잡는 중 → 다음 크론 시각)');

-- 회차가 생기면 다음 달로
insert into public.myr_settlement_runs (month, cutoff_at, created_by) values ('2030-02-01', '2030-04-02 13:00+09', 'pgtap');
select is(public.myr_settlement_due('2030-04-02 13:00+09'), '2030-03-01'::date, '2월이 돌면 다음 날은 3월');

-- 정산 크론 실패 — 운영 할 일 목록(payment_events)에 source 'settlement' 로 남길 수 있다
select lives_ok($$insert into public.payment_events (source, event_type, payload, handled, result) values ('settlement', 'settlement_run', '{"month": "2030-02-01", "code": "DB_ERROR"}', false, 'error: settlement DB_ERROR')$$,
                'payment_events source settlement 허용');

select * from finish();
rollback;
