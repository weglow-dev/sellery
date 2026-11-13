-- ============================================================
-- 0106 · MYR 정산할 달을 서버 한 곳에서 · 크론 실패 따라잡기 (2026-11-13)
--
--   문제: 정산 크론(샵 /api/cron/settle)이 정산할 달을 TS(previousSettlementMonth — KST 지난달)로 정했다.
--     크리에이터 "다음 정산" 미리보기는 DB myr_settlement_next 로 정했다 — 같은 판정이 두 곳.
--     크론은 매월 1일 한 번뿐이라 그날 실패하면 그 달 회차가 생기지 않고, 다음 달 회차가 먼저 생기면(OUT_OF_ORDER) 다시 돌릴 수도 없다.
--     (돈은 빠지지 않는다 — 대상은 "끝 전에 배송 완료 · 아직 정산 안 된 줄 전부"라 다음 회차에 섞인다. 지급이 한 달 늦고 회차 · 세금계산서 달이 어긋난다.)
--   고침:
--     myr_settlement_after_last() 마지막 회차 다음 달(회차가 없으면 null) — 아래 둘이 같이 쓴다
--     myr_settlement_due(now)   정산할 차례인 달 — 마지막 회차 다음 달(빠진 달 중 가장 오래된 달) · 회차가 없으면 KST 지난달 · 그 달이 아직 안 끝났으면 null
--     myr_settlement_next(now)  다음 회차(미리보기) — 정산할 차례인 달이 있으면 그 달 · 없으면 0089 와 같은 값(이번 달 · 마지막 회차 다음 달 중 늦은 달)
--                               0089 와 달라지는 것은 두 달 이상 빠졌을 때뿐 — 지난달 대신 가장 오래된 빠진 달(크론이 실제로 돌릴 달)
--     크론은 매일 13:00(KST) 돌고 myr_settlement_due 를 부른다 — 없으면 바로 끝 · 1일에 실패해도 다음 날 따라잡는다(한 번에 한 달)
--     크론 실패는 payment_events(source 'settlement' · handled=false)로 운영 할 일 목록에 — 이 표의 source 에 'settlement' 를 더한다
--   테스트: supabase/tests/myr_settlement_due.test.sql
-- ============================================================

-- 마지막 회차 다음 달 · 회차가 없으면 null
create or replace function public.myr_settlement_after_last()
returns date
language sql
stable
as $$
  select (max(u.month) + interval '1 month')::date from public.myr_settlement_runs u
$$;
revoke all on function public.myr_settlement_after_last() from public, anon, authenticated;

create or replace function public.myr_settlement_due(p_now timestamptz default now())
returns date
language sql
stable
as $$
  with c as (
    select coalesce(public.myr_settlement_after_last(), (date_trunc('month', p_now at time zone 'Asia/Seoul') - interval '1 month')::date) as month
  )
  select c.month from c where public.myr_settlement_month_end(c.month) <= p_now
$$;
revoke all on function public.myr_settlement_due(timestamptz) from public, anon, authenticated;
grant execute on function public.myr_settlement_due(timestamptz) to service_role;

-- 0089 정의 → myr_settlement_due 로. 정산할 차례인 달이 있으면 (그 달, 그 달 끝) · 없으면 (이번 달 · 마지막 회차 다음 달 중 늦은 달, 지금) — 0089 의 두 번째 갈래 그대로
create or replace function public.myr_settlement_next(p_now timestamptz default now())
returns table (month date, end_at timestamptz)
language sql
stable
as $$
  select coalesce(d.due, greatest(date_trunc('month', p_now at time zone 'Asia/Seoul')::date, public.myr_settlement_after_last())),
         case when d.due is not null then public.myr_settlement_month_end(d.due) else p_now end
    from (select public.myr_settlement_due(p_now) as due) d
$$;
revoke all on function public.myr_settlement_next(timestamptz) from public, anon, authenticated;

-- 정산 크론 실패를 운영 할 일 목록(payment_events · handled=false)에 — 셀러리와 같은 표 · 값만 더한다
alter table public.payment_events drop constraint if exists payment_events_source_check;
alter table public.payment_events add constraint payment_events_source_check
  check (source in ('webhook', 'deposit_callback', 'confirm', 'cancel', 'settlement'));
