-- ============================================================
-- 0101 — MYR 지급 기록(docs/myr.md §9-6 작업 순서 7-1 · 2026-11-12)
--   지금까지 "어느 달에 얼마 나갔나"는 기록이 없고 화면이 정산 줄(run_id · released_run_id)에서 그때그때 셌다.
--   운영이 보류를 먼저 푼 줄(confirm-held)은 이미 지난 달에 붙어 언제 지급할지 정해진 곳이 없었다.
--
--   표 myr_payouts     회차 × 크리에이터 지급 건(1건) — 상태 · 보류 이유 · 지급 기록 칸(상태 전이는 작업 순서 7-2 ~ 7-6)
--   칸 myr_settlement_rows.payout_id   이 줄이 어느 지급 건에서 나가나 — 지급 건이 줄을 담을 때 한 번 정해진다
--   함수(판정 하나에 함수 하나 — 백엔드 원칙 1)
--     myr_settlement_row_payable(줄)      지급 건에 담을 줄 = 확정됐고 아직 지급 건이 없다
--     myr_settlement_row_pay_run(줄)      이 줄이 (지급 건 이전 기록으로) 지급된 회차 = 풀린 회차, 없으면 자기 회차 — 이미 돈 회차를 채울 때만 쓴다
--     myr_payout_amount(지급 건)          금액 = 담긴 줄 payout 합 — 표에 숫자를 따로 두지 않는다(지급 완료 때만 paid_amount 로 그때 금액을 남긴다)
--     myr_payout_has_amount(지급 건)      0원보다 큰가(지급 대기 · 지급 없음을 가른다 · 작업 순서 7-3 지급 가능 판정도 이것을 쓴다)
--     myr_payout_status_auto(지급 건)     상태를 금액으로 다시 정해도 되는 지급 건(지급 대기 · 지급 없음 — 보류 · 완료는 손대지 않는다)
--     myr_payout_collect(run, 지난 회차?)  크리에이터마다 지급 건 1건 + 지급 건에 담을 줄 전부(크론) · 지난 회차를 채울 때는 그 회차에 지급된 줄만
--                                (이번 달 줄 · 이번에 풀린 보류 줄 · 운영이 먼저 확정한 보류 줄이 한 규칙으로 들어간다 · 결정 2026-11-12)
--   0원 지급 건(정산금이 전부 상계로 빠진 달)도 만든다 — 상태 none("지급 없음" · 결정 2026-11-12). 0원보다 크면 pending(지급 대기).
--   myr_settlement_run 은 끝에 myr_payout_collect 를 부르고, 돌려주는 payout 합계는 이 회차 지급 건 금액 합(myr_payout_amount)이다.
--   이미 돈 회차는 달 순서로 myr_payout_collect(run, true) — 그 회차에 지급된 줄(myr_settlement_row_pay_run)만 담는다.
--   myr_settlement_report 는 지급 건(크리에이터 · 상태 · 금액)과 지급 합계를 같이 돌려준다 — 운영 스크립트가 줄을 직접 더하지 않게.
--   크리에이터 정산 탭(작업 순서 7-6)은 아직 run_id · released_run_id 로 달 합계를 센다 — 7-6 에서 지급 건을 읽게 바꾸고 "지급액 합" 을 검사 표에 넣는다.
--   권한: 표 RLS · anon · authenticated 권한 없음 · 새 함수는 EXECUTE 회수(service role 만 · 크론 안에서 부른다).
--   테스트: supabase/tests/myr_payouts.test.sql + 기존 정산 테스트 그대로.
-- ============================================================

create table if not exists public.myr_payouts (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references public.myr_settlement_runs (id) on delete restrict,
  seller_id    uuid not null references public.sellers (id) on delete restrict,
  status       text not null check (status in ('pending', 'held', 'paid', 'none')),   -- 지급 대기 · 지급 보류 · 지급 완료 · 지급 없음(0원)
  hold_reason  text,                                                                    -- 보류 이유(작업 순서 7-2)
  paid_at      timestamptz,                                                             -- 이체한 날(작업 순서 7-6)
  paid_amount  integer check (paid_amount is null or paid_amount >= 0),                 -- 지급 완료 때 그때 금액
  paid_note    text,
  paid_by      text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (run_id, seller_id),
  constraint myr_payouts_paid check ((status = 'paid') = (paid_at is not null and paid_amount is not null))
);
alter table public.myr_payouts enable row level security;
revoke all on public.myr_payouts from anon, authenticated;
create index if not exists myr_payouts_seller_idx on public.myr_payouts (seller_id, run_id);

alter table public.myr_settlement_rows add column if not exists payout_id uuid references public.myr_payouts (id) on delete restrict;
create index if not exists myr_settlement_rows_payout_idx on public.myr_settlement_rows (payout_id);

-- 지급 건에 담을 줄 — 확정됐고 아직 지급 건이 없다
create or replace function public.myr_settlement_row_payable(r public.myr_settlement_rows)
returns boolean
language sql
stable
as $$
  select coalesce(r.status = 'confirmed' and r.payout_id is null, false)
$$;
revoke all on function public.myr_settlement_row_payable(public.myr_settlement_rows) from public, anon, authenticated;

-- 이 줄이 지급된 회차(지급 건 이전 기록) — 보류가 풀렸으면 풀린 회차, 아니면 자기 회차. 이미 돈 회차를 채울 때만 쓴다
create or replace function public.myr_settlement_row_pay_run(r public.myr_settlement_rows)
returns uuid
language sql
stable
as $$
  select coalesce(r.released_run_id, r.run_id)
$$;
revoke all on function public.myr_settlement_row_pay_run(public.myr_settlement_rows) from public, anon, authenticated;

-- 지급 건 금액 = 담긴 정산 줄 지급액 합
create or replace function public.myr_payout_amount(p public.myr_payouts)
returns integer
language sql
stable
as $$
  select coalesce(sum(r.payout), 0)::integer from public.myr_settlement_rows r where r.payout_id = p.id
$$;
revoke all on function public.myr_payout_amount(public.myr_payouts) from public, anon, authenticated;

-- 0원보다 큰가 — 지급 대기 · 지급 없음을 가른다(지급 가능 판정 7-3 도 이것)
create or replace function public.myr_payout_has_amount(p public.myr_payouts)
returns boolean
language sql
stable
as $$
  select public.myr_payout_amount(p) > 0
$$;
revoke all on function public.myr_payout_has_amount(public.myr_payouts) from public, anon, authenticated;

-- 상태를 금액으로 다시 정해도 되는 지급 건 — 지급 대기 · 지급 없음(보류 · 완료는 손대지 않는다)
create or replace function public.myr_payout_status_auto(p public.myr_payouts)
returns boolean
language sql
immutable
as $$
  select coalesce(p.status in ('pending', 'none'), false)
$$;
revoke all on function public.myr_payout_status_auto(public.myr_payouts) from public, anon, authenticated;

-- 회차 지급 건 만들기 — 크리에이터마다 1건 · 지급 건에 담을 줄을 담는다 · 금액으로 지급 대기 / 지급 없음 · 멱등
--   p_past_run = true 면 그 회차에 지급된 줄(myr_settlement_row_pay_run)만 — 이미 돈 회차를 채울 때(마이그레이션)
create or replace function public.myr_payout_collect(p_run_id uuid, p_past_run boolean default false)
returns integer
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  sr  record;
  v_p public.myr_payouts%rowtype;
  v_n integer := 0;
begin
  for sr in
    select distinct r.seller_id from public.myr_settlement_rows r
     where public.myr_settlement_row_payable(r) and (not p_past_run or public.myr_settlement_row_pay_run(r) = p_run_id)
     order by r.seller_id
  loop
    insert into public.myr_payouts (run_id, seller_id, status)
    values (p_run_id, sr.seller_id, 'pending')
    on conflict (run_id, seller_id) do nothing;
    select * into v_p from public.myr_payouts where run_id = p_run_id and seller_id = sr.seller_id for update;
    update public.myr_settlement_rows r set payout_id = v_p.id
     where r.seller_id = sr.seller_id and public.myr_settlement_row_payable(r)
       and (not p_past_run or public.myr_settlement_row_pay_run(r) = p_run_id);
    if public.myr_payout_status_auto(v_p) then
      update public.myr_payouts p
         set status = case when public.myr_payout_has_amount(p) then 'pending' else 'none' end, updated_at = now()
       where p.id = v_p.id;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.myr_payout_collect(uuid, boolean) from public, anon, authenticated;

-- 0089 정의 + 끝에 지급 건 만들기 · 돌려주는 payout = 이 회차 지급 건 금액 합
create or replace function public.myr_settlement_run(p_month date, p_actor text default 'cron', p_now timestamptz default now())
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_month   date := date_trunc('month', p_month)::date;
  v_end     timestamptz;
  v_run     public.myr_settlement_runs%rowtype;
  pr        record;
  pc        record;
  hr        record;
  v_row_id  uuid;
  v_released integer := 0;
begin
  if p_month is null then return jsonb_build_object('ok', false, 'code', 'BAD_MONTH'); end if;
  v_end := public.myr_month_start((v_month + interval '1 month')::date);
  if v_end > p_now then return jsonb_build_object('ok', false, 'code', 'NOT_CLOSED'); end if;
  perform pg_advisory_xact_lock(hashtext('myr_settlement_run'));
  select * into v_run from public.myr_settlement_runs where month = v_month;
  if found then return jsonb_build_object('ok', true, 'already', true, 'month', to_char(v_month, 'YYYY-MM')); end if;
  if exists (select 1 from public.myr_settlement_runs where month > v_month) then return jsonb_build_object('ok', false, 'code', 'OUT_OF_ORDER'); end if;

  insert into public.myr_settlement_runs (month, cutoff_at, created_by) values (v_month, p_now, coalesce(p_actor, 'cron')) returning * into v_run;

  -- 1) 보류 자동 해제 — 제조금액이 들어온 보류 줄을 정산월 순서로 확정 · 이 회차에서 지급
  for hr in
    select r.id from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
     where r.status = 'held' and public.myr_mfg_has_ledger(r.product_id)
     order by u.month, r.product_id
  loop
    perform public.myr_settlement_apply(hr.id, coalesce(p_actor, 'cron'), v_run.id);
    v_released := v_released + 1;
  end loop;

  -- 2) 이번 달 줄
  create temp table if not exists _myr_settle_new (order_item_id uuid, product_id uuid, seller_id uuid, kind text, amount integer, refund_snapshot integer) on commit drop;
  truncate _myr_settle_new;
  insert into _myr_settle_new select * from public.myr_settlement_candidates(v_end, null);

  for pr in
    select n.product_id, min(n.seller_id::text)::uuid as seller_id,
           coalesce(sum(n.amount) filter (where n.kind = 'sale'), 0)::integer as sales,
           coalesce(sum(n.amount) filter (where n.kind = 'refund_adj'), 0)::integer as refund_adj
      from _myr_settle_new n group by n.product_id order by n.product_id
  loop
    select * into pc from public.myr_settlement_product_calc(pr.product_id, pr.sales, pr.refund_adj);
    insert into public.myr_settlement_rows (run_id, product_id, seller_id, pct, sales, refund_adj, carry_in, base, carry_out, settle, status)
    values (v_run.id, pr.product_id, pr.seller_id, pc.pct, pr.sales, pr.refund_adj, pc.carry_in, pc.base, pc.carry_out, pc.settle, 'held')
    returning id into v_row_id;
    insert into public.myr_settlement_items (row_id, order_item_id, kind, amount, refund_snapshot)
    select v_row_id, n.order_item_id, n.kind, n.amount, n.refund_snapshot from _myr_settle_new n where n.product_id = pr.product_id;
    if not pc.held then perform public.myr_settlement_apply(v_row_id, coalesce(p_actor, 'cron')); end if;
  end loop;

  -- 3) 지급 건 — 크리에이터마다 1건 · 확정됐지만 아직 지급 건에 안 들어간 줄 전부(이번 달 줄 · 이번에 풀린 보류 줄 · 운영이 먼저 확정한 보류 줄)
  perform public.myr_payout_collect(v_run.id);

  return jsonb_build_object('ok', true, 'already', false, 'month', to_char(v_month, 'YYYY-MM'),
    'rows', (select count(*) from public.myr_settlement_rows where run_id = v_run.id),
    'confirmed', (select count(*) from public.myr_settlement_rows where run_id = v_run.id and status = 'confirmed'),
    'held', (select count(*) from public.myr_settlement_rows where run_id = v_run.id and status = 'held'),
    'released', v_released,
    'payouts', (select count(*) from public.myr_payouts where run_id = v_run.id),
    'payout', coalesce((select sum(public.myr_payout_amount(p)) from public.myr_payouts p where p.run_id = v_run.id), 0));
end;
$$;
revoke all on function public.myr_settlement_run(date, text, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_settlement_run(date, text, timestamptz) to service_role;

-- 이미 돈 회차 — 달 순서로 지급 건(그 회차에 지급된 줄만 · myr_settlement_row_pay_run)
do $$
declare
  u record;
begin
  for u in select id from public.myr_settlement_runs order by month loop
    perform public.myr_payout_collect(u.id, true);
  end loop;
end;
$$;

-- 0087 정의 + 지급 건 · 지급 합계
create or replace function public.myr_settlement_report(p_month date)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'month', to_char(u.month, 'YYYY-MM'), 'cutoff_at', u.cutoff_at, 'created_by', u.created_by,
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
               'seller', jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'settle_status', s.myr_settle_status),
               'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name),
               'status', r.status, 'pct', r.pct, 'sales', r.sales, 'refund_adj', r.refund_adj, 'carry_in', r.carry_in, 'base', r.base,
               'carry_out', r.carry_out, 'settle', r.settle, 'mfg_before', r.mfg_before, 'offset', r.offset_amount, 'mfg_after', r.mfg_after,
               'deposit_refund', r.deposit_refund, 'payout', r.payout, 'confirmed_at', r.confirmed_at,
               'lines', (select count(*) from public.myr_settlement_items i where i.row_id = r.id and i.kind = 'sale'),
               'refund_lines', (select count(*) from public.myr_settlement_items i where i.row_id = r.id and i.kind = 'refund_adj'))
             order by s.handle, p.code)
             from public.myr_settlement_rows r
             join public.sellers s on s.id = r.seller_id
             join public.myr_products p on p.id = r.product_id
            where r.run_id = u.id), '[]'::jsonb),
    -- 지급 건(0101) — 이 회차에서 나가는 크리에이터별 금액 · 상태 · 합계는 myr_payout_amount 로만 센다(스크립트가 줄을 직접 더하지 않게)
    'payouts', coalesce((select jsonb_agg(jsonb_build_object(
               'seller', jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'settle_status', s.myr_settle_status),
               'status', p.status, 'amount', public.myr_payout_amount(p),
               'rows', (select count(*) from public.myr_settlement_rows r where r.payout_id = p.id))
             order by s.handle)
             from public.myr_payouts p join public.sellers s on s.id = p.seller_id where p.run_id = u.id), '[]'::jsonb),
    'payout_total', coalesce((select sum(public.myr_payout_amount(p)) from public.myr_payouts p where p.run_id = u.id), 0))
    from public.myr_settlement_runs u
   where u.month = date_trunc('month', p_month)::date
$$;
revoke all on function public.myr_settlement_report(date) from public, anon, authenticated;
grant execute on function public.myr_settlement_report(date) to service_role;
