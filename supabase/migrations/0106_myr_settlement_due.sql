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
--     myr_settlement_run 은 정산할 차례인 달이 아니면 NOT_DUE(응답 due = 차례인 달) — 수동 실행 · 스크립트로 빠진 달을 건너뛸 수 없다
--     미리보기 정산 시각(settle_at)은 myr_settlement_settle_at — 원래 시각이 지났는데 회차가 없으면(따라잡는 중) 다음 크론 시각(myr_settlement_next_cron)
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

-- ------------------------------------------------------------
-- 회차는 정산할 차례인 달만(수동 실행 · 스크립트도) · 미리보기 정산 시각은 따라잡는 중이면 다음 크론 시각
-- ------------------------------------------------------------
-- 정산 시각 — 그날(KST) 13:00. 지급 시각(myr_settlement_pay_at · 정산월 다음 달 1일)과 매일 크론 시각(myr_settlement_next_cron)이 같이 쓴다
create or replace function public.myr_settlement_time_on(p_day date)
returns timestamptz
language sql
immutable
as $$
  select (p_day::timestamp at time zone 'Asia/Seoul') + interval '13 hours'
$$;
revoke all on function public.myr_settlement_time_on(date) from public, anon, authenticated;

-- 0087 정의 → myr_settlement_time_on 으로(같은 값 — 정산월 다음 달 1일 13:00 KST = 마감 + 13시간). "다음 달 1일"은 마감(myr_settlement_month_end) 한 곳에서
create or replace function public.myr_settlement_pay_at(p_month date)
returns timestamptz
language sql
stable
as $$
  select public.myr_settlement_time_on(public.myr_kst_date(public.myr_settlement_month_end(p_month)))
$$;
revoke all on function public.myr_settlement_pay_at(date) from public, anon, authenticated;

-- 다음 정산 크론 시각 — 매일 13:00(KST · vercel.json `0 4 * * *`) 중 지금 뒤 첫 번째
create or replace function public.myr_settlement_next_cron(p_now timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select case when p_now < public.myr_settlement_time_on(public.myr_kst_date(p_now)) then public.myr_settlement_time_on(public.myr_kst_date(p_now))
              else public.myr_settlement_time_on(public.myr_kst_date(p_now) + 1) end
$$;
revoke all on function public.myr_settlement_next_cron(timestamptz) from public, anon, authenticated;

-- 미리보기 정산 시각 — 원래 정산 시각(정산월 다음 달 1일 13:00) · 그 시각에서 1시간이 지났는데 아직 회차가 없으면(크론 실패 · 따라잡는 중) 다음 크론 시각.
--   1시간 = 크론이 도는 동안(최대 5분) 미리보기가 "내일"로 깜빡이지 않게
create or replace function public.myr_settlement_settle_at(p_month date, p_now timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select case when p_now < public.myr_settlement_pay_at(p_month) + interval '1 hour' then public.myr_settlement_pay_at(p_month)
              else greatest(public.myr_settlement_pay_at(p_month), public.myr_settlement_next_cron(p_now)) end
$$;
revoke all on function public.myr_settlement_settle_at(date, timestamptz) from public, anon, authenticated;

-- 0103 정의 + NOT_DUE(정산할 차례인 달이 아니면 거절 · 응답에 차례인 달)
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
  v_end := public.myr_settlement_month_end(v_month);
  if v_end > p_now then return jsonb_build_object('ok', false, 'code', 'NOT_CLOSED'); end if;
  perform pg_advisory_xact_lock(hashtext('myr_settlement_run'));
  v_run := public.myr_settlement_run_of(v_month);
  if v_run.id is not null then return jsonb_build_object('ok', true, 'already', true, 'month', to_char(v_month, 'YYYY-MM')); end if;
  if exists (select 1 from public.myr_settlement_runs where month > v_month) then return jsonb_build_object('ok', false, 'code', 'OUT_OF_ORDER'); end if;
  -- 0106: 정산할 차례인 달만 — 빠진 달을 건너뛰고 늦은 달을 먼저 돌리면 빠진 달은 OUT_OF_ORDER 로 영영 못 돈다(크론 · 수동 · 스크립트 모두 여기서 막는다)
  if v_month is distinct from public.myr_settlement_due(p_now) then
    return jsonb_build_object('ok', false, 'code', 'NOT_DUE', 'due', to_char(public.myr_settlement_due(p_now), 'YYYY-MM'));
  end if;

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

-- 0101 정의 + settle_at 을 myr_settlement_settle_at 으로(따라잡는 중이면 지난 시각 대신 다음 크론 시각)
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
      'offset', hr.offset_amount, 'deposit_refund', hr.deposit_refund, 'payout', hr.payout, 'counted', true, 'releasable', false);
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
    v_prior := v_prior || jsonb_build_object(hr.product_id::text, jsonb_build_object('offset', v_po + oc.offset_amount, 'refunded', v_pr or oc.paid_off));
    v_rows := v_rows || jsonb_build_object(
      'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = hr.product_id),
      'status', 'estimated', 'origin', to_char(hr.origin, 'YYYY-MM'), 'lines', hr.lines, 'pct', hr.pct,
      'sales', hr.sales, 'refund_adj', hr.refund_adj, 'carry_in', hr.carry_in, 'settle', hr.settle,
      'offset', oc.offset_amount, 'deposit_refund', oc.deposit_refund, 'payout', public.myr_settlement_row_payout(hr.settle, oc.offset_amount, oc.deposit_refund),
      'counted', true, 'releasable', false);
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
      'offset', v_offset, 'deposit_refund', v_refund, 'payout', v_payout, 'counted', not pc.held, 'releasable', false);
  end loop;
  return jsonb_build_object(
    'month', to_char(v_month, 'YYYY-MM'),
    'settle_at', public.myr_settlement_settle_at(v_month, p_now),
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

-- 정산 크론 실패를 운영 할 일 목록(payment_events · handled=false)에 — 셀러리와 같은 표 · 값만 더한다
alter table public.payment_events drop constraint if exists payment_events_source_check;
alter table public.payment_events add constraint payment_events_source_check
  check (source in ('webhook', 'deposit_callback', 'confirm', 'cancel', 'settlement'));
