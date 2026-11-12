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
--   크리에이터 정산 탭(myr_app_seller_settlements_of_user)은 지급 건을 읽는다 — 달 지급액 = 그 회차 내 지급 건 금액(myr_payout_amount) · 줄이 다른 회차에서
--     나갔으면 released_in · 확정됐지만 아직 지급 건이 없으면 next_payout. 다음 정산 예상(myr_settlement_preview)에도 그 줄을 넣는다(다음 회차 지급 건에 들어가니까).
--   함께 모은 계산 — 정산 줄 지급액 myr_settlement_row_payout(정산금 − 상계 + 보증금 환급 · 확정 · 예상) · 정산 기준 매출 myr_settlement_net_sales(판매 − 정산 뒤 환불 ·
--     상품 계산 · 예상 · 정산 탭) · 정산 탭이 화면에서 더하던 남은 제조금액 합 · 돌려받을 보증금 · 보증금 전체 · 다음 정산 상환 예정을 서버 값으로.
--   지난 달 "지급 완료" 칩은 아직 그대로(대표 2026-11-10 — 미리 표시) — 지급 완료 기록(7-6 운영 스크립트) 뒤 payout_status 를 읽게 바꾼다.
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

-- 정산 줄의 판매 줄 수 — 보고 · 다음 정산 예상이 같이 쓴다
create or replace function public.myr_settlement_row_lines(r public.myr_settlement_rows)
returns integer
language sql
stable
as $$
  select count(*)::integer from public.myr_settlement_items t where t.row_id = r.id and t.kind = 'sale'
$$;
revoke all on function public.myr_settlement_row_lines(public.myr_settlement_rows) from public, anon, authenticated;

-- 다음 회차가 풀 보류 줄(보류 · 제조금액이 들어옴) — 회차 · 다음 정산 예상 · 예상 내역이 같이 쓴다
create or replace function public.myr_settlement_row_releasable(r public.myr_settlement_rows)
returns boolean
language sql
stable
as $$
  select coalesce(r.status = 'held' and public.myr_mfg_has_ledger(r.product_id), false)
$$;
revoke all on function public.myr_settlement_row_releasable(public.myr_settlement_rows) from public, anon, authenticated;

-- 정산 탭 달 카드(회차 하나)에 실릴 내 줄 — 정산 탭 · 달 상세 내역이 같이 쓴다
--   그 회차의 내 줄 전부 + 그 회차 지급 건에 담긴 지난 달 줄(origin)
--   counted = 그 회차 지급 건에 담김(달 합계에 들어간다) · paid_later_run = 그 회차 줄인데 다른(뒤) 회차 지급 건에서 나감
create or replace function public.myr_settlement_card_rows(p_seller uuid, p_run uuid)
returns table (row_id uuid, origin boolean, counted boolean, paid_later_run uuid)
language sql
stable
as $$
  select r.id, r.run_id <> p_run, coalesce(pr.run_id = p_run, false),
         case when r.run_id = p_run and pr.run_id <> p_run then pr.run_id end
    from public.myr_settlement_rows r
    left join public.myr_payouts pr on pr.id = r.payout_id
   where r.seller_id = p_seller and (r.run_id = p_run or pr.run_id = p_run)
$$;
revoke all on function public.myr_settlement_card_rows(uuid, uuid) from public, anon, authenticated;

-- 제조금액 합(무효 차수 제외) · 상계 합(확정 줄) — 남은 제조금액 · 원장 · 정산 탭 · 무효/정정 검사가 같이 쓴다
create or replace function public.myr_mfg_total(p_product_id uuid)
returns integer
language sql
stable
as $$
  select coalesce((select sum(b.amount) from public.myr_mfg_batches b where b.product_id = p_product_id and b.voided_at is null), 0)::integer
$$;
revoke all on function public.myr_mfg_total(uuid) from public, anon, authenticated;

create or replace function public.myr_mfg_offset_total(p_product_id uuid)
returns integer
language sql
stable
as $$
  select coalesce((select sum(r.offset_amount) from public.myr_settlement_rows r where r.product_id = p_product_id and r.status = 'confirmed'), 0)::integer
$$;
revoke all on function public.myr_mfg_offset_total(uuid) from public, anon, authenticated;

-- 맡긴 보증금 차수(입금 확인 · 무효 아님 · 아직 환급 전) — 환급액 계산 · 환급 표시 · 보증금 합이 같이 쓴다
create or replace function public.myr_mfg_batch_deposit_held(b public.myr_mfg_batches)
returns boolean
language sql
immutable
as $$
  select coalesce(b.voided_at is null and b.deposit_paid_at is not null and b.deposit_refund_row_id is null, false)
$$;
revoke all on function public.myr_mfg_batch_deposit_held(public.myr_mfg_batches) from public, anon, authenticated;

-- 상품 보증금 합 — 입금 확인 · 입금 전 · 환급 완료 · 맡김(환급 전) · 전체(환급 전 · 입금 전 포함). 원장 · 정산 탭 · 상계 계산이 같이 쓴다
create or replace function public.myr_mfg_deposits(p_product_id uuid)
returns table (paid integer, unpaid integer, refunded integer, held integer, total integer)
language sql
stable
as $$
  select coalesce(sum(b.deposit_amount) filter (where b.voided_at is null and b.deposit_paid_at is not null), 0)::integer,
         coalesce(sum(b.deposit_amount) filter (where b.voided_at is null and b.deposit_paid_at is null), 0)::integer,
         coalesce(sum(b.deposit_amount) filter (where b.deposit_refund_row_id is not null), 0)::integer,
         coalesce(sum(b.deposit_amount) filter (where public.myr_mfg_batch_deposit_held(b)), 0)::integer,
         coalesce(sum(b.deposit_amount) filter (where b.voided_at is null and b.deposit_refund_row_id is null), 0)::integer
    from public.myr_mfg_batches b where b.product_id = p_product_id
$$;
revoke all on function public.myr_mfg_deposits(uuid) from public, anon, authenticated;

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
     where public.myr_settlement_row_releasable(r)
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
               'lines', public.myr_settlement_row_lines(r),
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

-- ------------------------------------------------------------
-- 정산 탭이 지급 건을 읽게(2026-11-12) — 판정 하나에 함수 하나
-- ------------------------------------------------------------

-- 판매 − 정산 뒤 환불(정산 기준 매출) — 상품 계산 · 다음 정산 예상 · 정산 탭 합계가 같이 쓴다
create or replace function public.myr_settlement_net_sales(p_sales integer, p_refund_adj integer)
returns integer
language sql
immutable
as $$
  select coalesce(p_sales, 0) - coalesce(p_refund_adj, 0)
$$;
revoke all on function public.myr_settlement_net_sales(integer, integer) from public, anon, authenticated;

-- 정산 줄 지급액 = 정산금 − 상계 + 보증금 환급 — 확정(apply) · 다음 정산 예상이 같이 쓴다
create or replace function public.myr_settlement_row_payout(p_settle integer, p_offset integer, p_deposit_refund integer)
returns integer
language sql
immutable
as $$
  select p_settle - p_offset + p_deposit_refund
$$;
revoke all on function public.myr_settlement_row_payout(integer, integer, integer) from public, anon, authenticated;

-- 0092 정의 + myr_settlement_net_sales
create or replace function public.myr_settlement_product_calc(p_product_id uuid, p_sales integer, p_refund_adj integer)
returns table (pct integer, carry_in integer, base integer, carry_out integer, settle integer, held boolean)
language sql
stable
as $$
  with c as (
    select public.myr_settlement_pct() as pct,
           coalesce((select r.carry_out from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
                      where r.product_id = p_product_id order by u.month desc limit 1), 0) as carry_in
  )
  select c.pct, c.carry_in, public.myr_settlement_net_sales(p_sales, p_refund_adj) + c.carry_in, least(public.myr_settlement_net_sales(p_sales, p_refund_adj) + c.carry_in, 0),
         public.myr_settlement_amount(public.myr_settlement_net_sales(p_sales, p_refund_adj) + c.carry_in, c.pct),
         -- 원장이 없으면 보류. 원장이 있는 상품의 지난 보류는 회차 · 예상이 이 계산 전에 먼저 해제한다(보류가 원장 없이만 남는다)
         not public.myr_mfg_has_ledger(p_product_id)
    from c
$$;
revoke all on function public.myr_settlement_product_calc(uuid, integer, integer) from public, anon, authenticated;

-- 0089 정의 + myr_settlement_row_payout · 환급할 차수 = myr_mfg_batch_deposit_held
create or replace function public.myr_settlement_apply(p_row_id uuid, p_actor text, p_release_run uuid default null)
returns void
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  r public.myr_settlement_rows%rowtype;
  c record;
begin
  select * into r from public.myr_settlement_rows where id = p_row_id for update;
  perform 1 from public.myr_mfg_batches where product_id = r.product_id for update;
  select * into c from public.myr_settlement_offset_calc(r.product_id, r.settle);
  if c.mfg_after = 0 then
    update public.myr_mfg_batches m set deposit_refund_row_id = r.id
     where m.product_id = r.product_id and public.myr_mfg_batch_deposit_held(m);
  end if;
  update public.myr_settlement_rows
     set status = 'confirmed', mfg_before = c.mfg_before, offset_amount = c.offset_amount, mfg_after = c.mfg_after,
         deposit_refund = c.deposit_refund, payout = public.myr_settlement_row_payout(r.settle, c.offset_amount, c.deposit_refund), confirmed_at = now(), confirmed_by = coalesce(p_actor, 'script'),
         released_run_id = p_release_run
   where id = r.id;
end;
$$;
revoke all on function public.myr_settlement_apply(uuid, text, uuid) from public, anon, authenticated, service_role;

-- 0099 정의 + 확정됐지만 지급 건이 없는 줄 · myr_settlement_row_payout · net_sales
create or replace function public.myr_settlement_preview(p_seller uuid, p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_month  date;
  v_end    timestamptz;
  v_rows   jsonb := '[]'::jsonb;
  pr       record;
  pc       record;
  oc       record;
  hr       record;
  v_offset integer;
  v_refund integer;
  v_payout integer;
  v_prior  jsonb := '{}'::jsonb;   -- 상품 → { offset: 앞선 줄 상계 합, refunded: 보증금 환급 여부 } (회차가 실제로 확정하는 순서를 따라간다)
  v_po     integer;
  v_pr     boolean;
begin
  select n.month, n.end_at into v_month, v_end from public.myr_settlement_next(p_now) n;
  -- 0) 이미 확정됐지만 아직 지급 건에 안 들어간 줄(운영이 먼저 확정한 보류 등 · 0101) — 다음 회차 지급 건에 들어간다. 금액은 확정된 값 그대로
  for hr in
    select r.*, u.month as origin, public.myr_settlement_row_lines(r) as lines
      from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
     where r.seller_id = p_seller and public.myr_settlement_row_payable(r)
     order by u.month, r.product_id
  loop
    v_rows := v_rows || jsonb_build_object(
      'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = hr.product_id),
      'status', 'estimated', 'origin', to_char(hr.origin, 'YYYY-MM'), 'lines', hr.lines, 'pct', hr.pct,
      'sales', hr.sales, 'refund_adj', hr.refund_adj, 'carry_in', hr.carry_in, 'settle', hr.settle,
      'offset', hr.offset_amount, 'deposit_refund', hr.deposit_refund, 'payout', hr.payout);
  end loop;
  -- 1) 보류 해제 예정 — 제조금액이 들어온 지난 보류 줄(정산월 순서 · 다음 회차가 먼저 확정한다)
  for hr in
    select r.*, u.month as origin, public.myr_settlement_row_lines(r) as lines
      from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
     where r.seller_id = p_seller and public.myr_settlement_row_releasable(r)
     order by u.month, r.product_id
  loop
    v_po := coalesce((v_prior -> hr.product_id::text ->> 'offset')::int, 0);
    v_pr := coalesce((v_prior -> hr.product_id::text ->> 'refunded')::boolean, false);
    select * into oc from public.myr_settlement_offset_calc(hr.product_id, hr.settle, v_po, v_pr);
    v_prior := v_prior || jsonb_build_object(hr.product_id::text, jsonb_build_object('offset', v_po + oc.offset_amount, 'refunded', v_pr or oc.mfg_after = 0));
    v_rows := v_rows || jsonb_build_object(
      'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = hr.product_id),
      'status', 'estimated', 'origin', to_char(hr.origin, 'YYYY-MM'), 'lines', hr.lines, 'pct', hr.pct,
      'sales', hr.sales, 'refund_adj', hr.refund_adj, 'carry_in', hr.carry_in, 'settle', hr.settle,
      'offset', oc.offset_amount, 'deposit_refund', oc.deposit_refund, 'payout', public.myr_settlement_row_payout(hr.settle, oc.offset_amount, oc.deposit_refund));
  end loop;
  -- 2) 이번 회차 줄 — 같은 상품이면 앞선 줄의 상계 · 환급 뒤로 이어서
  for pr in
    select n.product_id,
           coalesce(sum(n.amount) filter (where n.kind = 'sale'), 0)::integer as sales,
           coalesce(sum(n.amount) filter (where n.kind = 'refund_adj'), 0)::integer as refund_adj,
           count(*) filter (where n.kind = 'sale') as lines
      from public.myr_settlement_candidates(v_end, p_seller) n group by n.product_id
  loop
    select * into pc from public.myr_settlement_product_calc(pr.product_id, pr.sales, pr.refund_adj);
    if pc.held then
      v_offset := null; v_refund := null; v_payout := null;
    else
      v_po := coalesce((v_prior -> pr.product_id::text ->> 'offset')::int, 0);
      v_pr := coalesce((v_prior -> pr.product_id::text ->> 'refunded')::boolean, false);
      select * into oc from public.myr_settlement_offset_calc(pr.product_id, pc.settle, v_po, v_pr);
      v_offset := oc.offset_amount; v_refund := oc.deposit_refund; v_payout := public.myr_settlement_row_payout(pc.settle, oc.offset_amount, oc.deposit_refund);
    end if;
    v_rows := v_rows || jsonb_build_object(
      'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = pr.product_id),
      'status', case when pc.held then 'held' else 'estimated' end, 'origin', null, 'lines', pr.lines, 'pct', pc.pct,
      'sales', pr.sales, 'refund_adj', pr.refund_adj, 'carry_in', pc.carry_in, 'settle', pc.settle,
      'offset', v_offset, 'deposit_refund', v_refund, 'payout', v_payout);
  end loop;
  return jsonb_build_object(
    'month', to_char(v_month, 'YYYY-MM'),
    'settle_at', public.myr_month_start((v_month + interval '1 month')::date) + interval '13 hours',
    'rows', v_rows,
    'total', jsonb_build_object(
      'sales', coalesce((select sum((e ->> 'sales')::int) from jsonb_array_elements(v_rows) e), 0),
      'refund_adj', coalesce((select sum((e ->> 'refund_adj')::int) from jsonb_array_elements(v_rows) e), 0),
      'net_sales', public.myr_settlement_net_sales(coalesce((select sum((e ->> 'sales')::int) from jsonb_array_elements(v_rows) e), 0)::int,
                                                   coalesce((select sum((e ->> 'refund_adj')::int) from jsonb_array_elements(v_rows) e), 0)::int),
      'settle', coalesce((select sum((e ->> 'settle')::int) from jsonb_array_elements(v_rows) e), 0),
      'offset', coalesce((select sum((e ->> 'offset')::int) from jsonb_array_elements(v_rows) e), 0),
      'deposit_refund', coalesce((select sum((e ->> 'deposit_refund')::int) from jsonb_array_elements(v_rows) e), 0),
      'payout', coalesce((select sum((e ->> 'payout')::int) from jsonb_array_elements(v_rows) e), 0),
      'held', (select count(*) from jsonb_array_elements(v_rows) e where e ->> 'status' = 'held')),
    -- 아직 배송 완료가 아닌 판매(결제됨 · 취소 아님 · 남은 수량) — 배송 완료되면 그 회차에 들어간다
    'undelivered', (select jsonb_build_object('lines', count(*), 'amount', coalesce(sum(public.myr_line_net(i)), 0))
                      from public.myr_order_items i join public.myr_orders o on o.id = i.order_id
                     where i.seller_id = p_seller and o.paid_at is not null and public.myr_order_status_open(o.status)
                       and public.myr_line_live(i) and i.delivered_at is null));
end;
$$;
revoke all on function public.myr_settlement_preview(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_settlement_preview(uuid, timestamptz) to service_role;

-- 0099 정의를 지급 건 기준으로
create or replace function public.myr_app_seller_settlements_of_user(p_user uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'settle_status', s.myr_settle_status,
    'preview', pv.v,
    'ledgers', lg.v,
    -- 제조금액 · 보증금 탭 머리 — 남은 제조금액 합 · 돌려받을 보증금 합(상품별 값의 합 · 화면이 더하지 않는다)
    'ledger_total', jsonb_build_object(
      'remaining', coalesce((select sum((e ->> 'remaining')::int) from jsonb_array_elements(lg.v) e), 0),
      'deposit_held', coalesce((select sum((e ->> 'deposit_held')::int) from jsonb_array_elements(lg.v) e), 0)),
    -- 월별 내역(최근 순) — 카드 하나 = 그 회차. 지급액은 그 회차 내 지급 건 금액(myr_payout_amount · 0101).
    --   카드 줄 = myr_settlement_card_rows. 내 줄이 다른 회차 지급 건에서 나갔으면 released_in(합계 제외),
    --   확정됐지만 아직 지급 건이 없으면 next_payout(다음 정산에서 지급 · 합계 제외). 합계는 이 회차 지급 건에 담긴 줄만(counted)
    'months', coalesce((select jsonb_agg(m.j order by m.month desc) from (
                 select u.month, jsonb_build_object(
                   'month', to_char(u.month, 'YYYY-MM'),
                   'settled_at', u.cutoff_at,
                   'payout_status', (select p.status from public.myr_payouts p where p.run_id = u.id and p.seller_id = s.id),
                   'total', jsonb_build_object(
                     'sales', coalesce(sum(x.sales) filter (where x.counted), 0), 'refund_adj', coalesce(sum(x.refund_adj) filter (where x.counted), 0),
                     'net_sales', public.myr_settlement_net_sales(coalesce(sum(x.sales) filter (where x.counted), 0)::int, coalesce(sum(x.refund_adj) filter (where x.counted), 0)::int),
                     'settle', coalesce(sum(x.settle) filter (where x.counted), 0),
                     'offset', coalesce(sum(x.offset_amount) filter (where x.counted), 0), 'deposit_refund', coalesce(sum(x.deposit_refund) filter (where x.counted), 0),
                     'payout', coalesce((select public.myr_payout_amount(p) from public.myr_payouts p where p.run_id = u.id and p.seller_id = s.id), 0),
                     'held', count(*) filter (where x.status = 'held')),
                   'rows', jsonb_agg(jsonb_build_object(
                     'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url),
                     'status', x.status, 'origin', to_char(x.origin, 'YYYY-MM'), 'released_in', to_char(x.released_in, 'YYYY-MM'), 'next_payout', x.next_payout,
                     'pct', x.pct, 'sales', x.sales, 'refund_adj', x.refund_adj, 'carry_in', x.carry_in, 'carry_out', x.carry_out,
                     'settle', x.settle, 'offset', x.offset_amount, 'mfg_after', x.mfg_after, 'deposit_refund', x.deposit_refund, 'payout', x.payout)
                     order by x.origin nulls first, p.name)) as j
                   from public.myr_settlement_runs u
                   cross join lateral (
                     -- 카드 줄 = myr_settlement_card_rows(그 회차의 내 줄 + 그 회차 지급 건에 담긴 지난 달 줄)
                     select r.product_id, r.status, case when c.origin then ro.month end as origin,
                            (select l.month from public.myr_settlement_runs l where l.id = c.paid_later_run) as released_in,
                            public.myr_settlement_row_payable(r) as next_payout, c.counted,
                            r.pct, r.sales, r.refund_adj, r.carry_in, r.carry_out, r.settle, r.offset_amount, r.mfg_after, r.deposit_refund, r.payout
                       from public.myr_settlement_card_rows(s.id, u.id) c
                       join public.myr_settlement_rows r on r.id = c.row_id
                       join public.myr_settlement_runs ro on ro.id = r.run_id
                   ) x
                   join public.myr_products p on p.id = x.product_id
                  group by u.id, u.month, u.cutoff_at) m), '[]'::jsonb))
    from public.sellers s
    cross join lateral (select public.myr_settlement_preview(s.id, p_now) as v) pv
    cross join lateral (
      -- 제조 원장 — 원장이 있거나 · 정산 줄이 있거나 · 팔린 적이 있는 내 상품(원장 없이 팔렸으면 "제조금액 확인 중"으로 보인다)
      select coalesce((select jsonb_agg(jsonb_build_object(
                 'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url),
                 'has_ledger', public.myr_mfg_has_ledger(p.id),
                 'batches', coalesce((select jsonb_agg(jsonb_build_object('seq', b.seq, 'amount', b.amount, 'deposit_amount', b.deposit_amount,
                                                                          'deposit_paid', b.deposit_paid_at is not null, 'deposit_refunded', b.deposit_refund_row_id is not null)
                                                       order by b.seq)
                                        from public.myr_mfg_batches b where b.product_id = p.id and b.voided_at is null), '[]'::jsonb),
                 'total', public.myr_mfg_total(p.id),
                 'offset', public.myr_mfg_offset_total(p.id),
                 'remaining', public.myr_mfg_remaining(p.id),
                 -- 보증금 합 — myr_mfg_deposits 하나(맡김 = 입금 확인 · 환급 전 · 전체 = 환급 전 · 입금 전 포함) · 화면이 빼고 더하지 않는다
                 'deposit_paid', d.paid, 'deposit_unpaid', d.unpaid, 'deposit_refunded', d.refunded, 'deposit_held', d.held, 'deposit_total', d.total,
                 -- 다음 정산 상환 예정 = 다음 정산 예상 줄(보류 해제분 포함)의 그 상품 상계 합
                 'next_offset', coalesce((select sum((e ->> 'offset')::int) from jsonb_array_elements(pv.v -> 'rows') e where e #>> '{product,id}' = p.id::text), 0))
               order by p.created_at)
               from public.myr_products p
               cross join lateral public.myr_mfg_deposits(p.id) d
              where p.seller_id = s.id and p.deleted_at is null
                and (public.myr_mfg_has_ledger(p.id) or exists (select 1 from public.myr_settlement_rows r where r.product_id = p.id)
                     or exists (select 1 from public.myr_order_items i join public.myr_orders o on o.id = i.order_id
                                 where i.product_id = p.id and o.paid_at is not null and public.myr_line_valid(i)))), '[]'::jsonb) as v
    ) lg
   where s.user_id = p_user and p_user is not null
$$;
revoke all on function public.myr_app_seller_settlements_of_user(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_settlements_of_user(uuid, timestamptz) to service_role;

-- ------------------------------------------------------------
-- 제조금액 · 보증금 합을 함수 하나씩으로(2026-11-12) — 계산 결과는 그대로
-- ------------------------------------------------------------

-- 0087 정의 — 합은 myr_mfg_total · myr_mfg_offset_total
create or replace function public.myr_mfg_remaining(p_product_id uuid)
returns integer
language sql
stable
as $$
  select greatest(public.myr_mfg_total(p_product_id) - public.myr_mfg_offset_total(p_product_id), 0)::integer
$$;
revoke all on function public.myr_mfg_remaining(uuid) from public, anon, authenticated;

-- 0087 정의 — 합은 myr_mfg_total · myr_mfg_offset_total · myr_mfg_deposits
create or replace function public.myr_mfg_ledger(p_product_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'seller_id', p.seller_id),
    'batches', coalesce((select jsonb_agg(public.myr_mfg_batch_json(b) order by b.seq) from public.myr_mfg_batches b where b.product_id = p.id), '[]'::jsonb),
    'total', public.myr_mfg_total(p.id),
    'offset', public.myr_mfg_offset_total(p.id),
    'remaining', public.myr_mfg_remaining(p.id),
    'deposit_paid', d.paid,
    'deposit_refunded', d.refunded)
    from public.myr_products p cross join lateral public.myr_mfg_deposits(p.id) d
   where p.id = p_product_id
$$;
revoke all on function public.myr_mfg_ledger(uuid) from public, anon, authenticated;
grant execute on function public.myr_mfg_ledger(uuid) to service_role;

-- 0089 정의 — 환급할 보증금 = myr_mfg_deposits 의 맡김(held)
create or replace function public.myr_settlement_offset_calc(p_product_id uuid, p_settle integer, p_prior_offset integer default 0, p_prior_refunded boolean default false)
returns table (mfg_before integer, offset_amount integer, mfg_after integer, deposit_refund integer)
language sql
stable
as $$
  with b as (select greatest(public.myr_mfg_remaining(p_product_id) - coalesce(p_prior_offset, 0), 0) as before)
  select b.before, least(p_settle, b.before), b.before - least(p_settle, b.before),
         case when b.before - least(p_settle, b.before) = 0 and not coalesce(p_prior_refunded, false)
              then (select d.held from public.myr_mfg_deposits(p_product_id) d)
              else 0 end
    from b
$$;
revoke all on function public.myr_settlement_offset_calc(uuid, integer, integer, boolean) from public, anon, authenticated;

-- 0087 정의 — 상계 합은 myr_mfg_offset_total
create or replace function public.myr_mfg_void(p_product_id uuid, p_seq integer, p_reason text, p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.myr_mfg_batches%rowtype;
  v_total integer;
  v_offset integer;
begin
  perform 1 from public.myr_products where id = p_product_id for update;
  select * into b from public.myr_mfg_batches where product_id = p_product_id and seq = p_seq for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if b.voided_at is not null then return jsonb_build_object('ok', false, 'code', 'ALREADY_VOIDED'); end if;
  if coalesce(btrim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;
  if b.deposit_refund_row_id is not null then return jsonb_build_object('ok', false, 'code', 'REFUNDED'); end if;
  select coalesce(sum(amount), 0) into v_total from public.myr_mfg_batches where product_id = p_product_id and voided_at is null and id <> b.id;
  v_offset := public.myr_mfg_offset_total(p_product_id);
  if v_total < v_offset then return jsonb_build_object('ok', false, 'code', 'USED', 'shortfall', v_offset - v_total); end if;
  update public.myr_mfg_batches set voided_at = now(), voided_by = coalesce(p_actor, 'script'), void_reason = btrim(p_reason) where id = b.id;
  return jsonb_build_object('ok', true, 'remaining', public.myr_mfg_remaining(p_product_id));
end;
$function$;
-- 0087 정의 — 상계 합은 myr_mfg_offset_total
create or replace function public.myr_mfg_fix(p_product_id uuid, p_seq integer, p_amount integer, p_reason text, p_actor text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b        public.myr_mfg_batches%rowtype;
  n        public.myr_mfg_batches%rowtype;
  v_total  integer;
  v_offset integer;
begin
  perform 1 from public.myr_products where id = p_product_id for update;
  select * into b from public.myr_mfg_batches where product_id = p_product_id and seq = p_seq for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if b.voided_at is not null then return jsonb_build_object('ok', false, 'code', 'ALREADY_VOIDED'); end if;
  if coalesce(btrim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;
  if p_amount is null or p_amount < 0 then return jsonb_build_object('ok', false, 'code', 'BAD_AMOUNT'); end if;
  if p_amount = b.amount then return jsonb_build_object('ok', false, 'code', 'SAME_AMOUNT'); end if;
  if b.deposit_refund_row_id is not null then return jsonb_build_object('ok', false, 'code', 'REFUNDED'); end if;
  select coalesce(sum(amount), 0) into v_total from public.myr_mfg_batches where product_id = p_product_id and voided_at is null and id <> b.id;
  v_offset := public.myr_mfg_offset_total(p_product_id);
  if v_total + p_amount < v_offset then return jsonb_build_object('ok', false, 'code', 'USED', 'shortfall', v_offset - (v_total + p_amount)); end if;
  insert into public.myr_mfg_batches (product_id, seller_id, seq, amount, deposit_amount, deposit_paid_at, note, created_by)
  values (b.product_id, b.seller_id, (select max(seq) from public.myr_mfg_batches where product_id = p_product_id) + 1,
          p_amount, public.myr_deposit_amount(p_amount), b.deposit_paid_at,
          format('%s차 정정 · %s', b.seq, btrim(p_reason)), coalesce(p_actor, 'script'))
  returning * into n;
  update public.myr_mfg_batches set voided_at = now(), voided_by = coalesce(p_actor, 'script'), void_reason = format('%s차로 정정 · %s', n.seq, btrim(p_reason))
   where id = b.id;
  return jsonb_build_object('ok', true, 'voided_seq', b.seq, 'batch', public.myr_mfg_batch_json(n), 'remaining', public.myr_mfg_remaining(p_product_id),
                            'deposit_diff', case when b.deposit_paid_at is not null then b.deposit_amount - n.deposit_amount else 0 end);
end;
$function$;
revoke all on function public.myr_mfg_void(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.myr_mfg_fix(uuid, integer, integer, text, text) from public, anon, authenticated;

-- 0089 정의 — 달 상세 내역도 정산 탭 카드와 같은 줄(myr_settlement_card_rows · 지급 건 기준)
create or replace function public.myr_app_seller_settlement_items_of_user(p_user uuid, p_month date)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  -- 그 회차 카드 줄(myr_settlement_card_rows) — 지난 달 줄은 origin = 원래 달 · 화면은 상품 · origin 으로 묶는다
  select coalesce(jsonb_agg(jsonb_build_object(
           'order_code', o.code, 'buyer', public.myr_mask_name(o.buyer_name), 'delivered_at', i.delivered_at,
           'product_code', p.code, 'product', i.product_name, 'option', i.option_name, 'qty', i.qty, 'unit_price', i.unit_price,
           'groupbuy', i.groupbuy_id is not null, 'kind', t.kind, 'amount', t.amount, 'refund_snapshot', t.refund_snapshot,
           'origin', case when c.origin then to_char(ro.month, 'YYYY-MM') end)
         order by t.kind desc, i.delivered_at, o.code), '[]'::jsonb)
    from public.sellers s
    join public.myr_settlement_runs u on u.month = date_trunc('month', p_month)::date
    cross join lateral public.myr_settlement_card_rows(s.id, u.id) c
    join public.myr_settlement_rows r on r.id = c.row_id
    join public.myr_settlement_runs ro on ro.id = r.run_id
    join public.myr_settlement_items t on t.row_id = r.id
    join public.myr_order_items i on i.id = t.order_item_id
    join public.myr_orders o on o.id = i.order_id
    join public.myr_products p on p.id = r.product_id
   where s.user_id = p_user and p_user is not null
$$;
revoke all on function public.myr_app_seller_settlement_items_of_user(uuid, date) from public, anon, authenticated;
grant execute on function public.myr_app_seller_settlement_items_of_user(uuid, date) to service_role;

-- 0099 정의 + 확정됐지만 지급 건이 없는 줄(다음 정산 예상 0번과 같은 줄) · 보류 해제 = myr_settlement_row_releasable
create or replace function public.myr_app_seller_settle_preview_items_of_user(p_user uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  with s as (select id from public.sellers where user_id = p_user and p_user is not null),
  x as (
    -- 다음 회차에 새로 들어올 줄
    select c.order_item_id, c.kind, c.amount, c.refund_snapshot, null::text as origin
      from s cross join lateral public.myr_settlement_next(p_now) n cross join lateral public.myr_settlement_candidates(n.end_at, s.id) c
    union all
    -- 다음 회차 지급 건에 들어갈 지난 줄 — 확정됐지만 지급 건이 없는 줄 · 다음 회차가 먼저 풀 보류 줄
    select t.order_item_id, t.kind, t.amount, t.refund_snapshot, to_char(u.month, 'YYYY-MM')
      from s
      join public.myr_settlement_rows r on r.seller_id = s.id and (public.myr_settlement_row_payable(r) or public.myr_settlement_row_releasable(r))
      join public.myr_settlement_runs u on u.id = r.run_id
      join public.myr_settlement_items t on t.row_id = r.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'order_code', o.code, 'buyer', public.myr_mask_name(o.buyer_name), 'delivered_at', i.delivered_at,
           'product_code', p.code, 'product', i.product_name, 'option', i.option_name, 'qty', i.qty, 'unit_price', i.unit_price,
           'groupbuy', i.groupbuy_id is not null, 'kind', x.kind, 'amount', x.amount, 'refund_snapshot', x.refund_snapshot, 'origin', x.origin)
         order by x.kind desc, i.delivered_at, o.code), '[]'::jsonb)
    from x
    join public.myr_order_items i on i.id = x.order_item_id
    join public.myr_orders o on o.id = i.order_id
    join public.myr_products p on p.id = i.product_id
$$;
revoke all on function public.myr_app_seller_settle_preview_items_of_user(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_settle_preview_items_of_user(uuid, timestamptz) to service_role;
