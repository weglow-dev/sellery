-- ============================================================
-- 0114 · MYR 정산 줄 상태(확정 · 보류)를 함수 둘로 — 상계 합 · 지급 건에 담을 줄 · 풀 수 있는 보류 줄 · 원장 대기 · 정산 탭 보류 건수 · 회차 결과가 같은 함수 (2026-11-17)
--
--   점검(백엔드 원칙 1 · 감사 "정산 줄 상태 'held' · 'confirmed' 를 직접 비교"): 정산 줄 상태를 글자로 직접 비교하는 곳이 여섯 곳이었다.
--     상계 합(myr_mfg_offset_total — 남은 제조금액 · 다음 상계 금액) · 지급 건에 담을 줄(myr_settlement_row_payable) · 풀 수 있는 보류 줄(myr_settlement_row_releasable) ·
--     원장 대기 보류 목록(myr_mfg_pending) · 정산 탭 보류 건수(myr_app_seller_settlements_of_user) · 회차 결과 개수(myr_settlement_run)
--   고침:
--     myr_settlement_row_confirmed(r)   확정된 정산 줄
--     myr_settlement_row_held(r)        보류 중인 정산 줄
--     여섯 곳이 이 두 함수를 쓴다(정산 탭은 안쪽 줄 쿼리에서 held 칸으로 싣고 센다)
--   그대로 둔 것: 상태를 쓰는 곳(myr_settlement_apply 의 set status = 'confirmed' · 회차의 insert 'held')은 판정이 아니다 ·
--     지급 건(myr_payouts)의 'held'(myr_payout_hold · myr_payout_fail_kind · myr_payout_manual_held)는 다른 표의 상태다
--   계산 결과 불변 — 두 함수는 r.status = 'confirmed' / 'held' 를 그대로 감싼다 · 상태는 표 제약으로 두 값뿐 · 반환 모양 그대로
--   테스트: supabase/tests/myr_settlement_row_status.test.sql · 기존 정산 · 상계 · 지급 · 정산 탭 테스트
-- ============================================================

create or replace function public.myr_settlement_row_confirmed(r public.myr_settlement_rows)
returns boolean
language sql
stable
as $$
  select r.status = 'confirmed'
$$;
revoke all on function public.myr_settlement_row_confirmed(public.myr_settlement_rows) from public, anon, authenticated;

create or replace function public.myr_settlement_row_held(r public.myr_settlement_rows)
returns boolean
language sql
stable
as $$
  select r.status = 'held'
$$;
revoke all on function public.myr_settlement_row_held(public.myr_settlement_rows) from public, anon, authenticated;

-- 0101 정의 → myr_settlement_row_confirmed
create or replace function public.myr_settlement_row_payable(r public.myr_settlement_rows)
returns boolean
language sql
stable
as $$
  select coalesce(public.myr_settlement_row_confirmed(r) and r.payout_id is null, false)
$$;
revoke all on function public.myr_settlement_row_payable(public.myr_settlement_rows) from public, anon, authenticated;

-- 0101 정의 → myr_settlement_row_held
create or replace function public.myr_settlement_row_releasable(r public.myr_settlement_rows)
returns boolean
language sql
stable
as $$
  select coalesce(public.myr_settlement_row_held(r) and public.myr_mfg_has_ledger(r.product_id), false)
$$;
revoke all on function public.myr_settlement_row_releasable(public.myr_settlement_rows) from public, anon, authenticated;

-- 0101 정의 → myr_settlement_row_confirmed(상계 합 · 계산 그대로)
create or replace function public.myr_mfg_offset_total(p_product_id uuid)
returns integer
language sql
stable
as $$
  select coalesce((select sum(r.offset_amount) from public.myr_settlement_rows r where r.product_id = p_product_id and public.myr_settlement_row_confirmed(r)), 0)::integer
$$;
revoke all on function public.myr_mfg_offset_total(uuid) from public, anon, authenticated;

-- 0099 정의 → myr_settlement_row_held
create or replace function public.myr_mfg_pending()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'held', coalesce((select jsonb_agg(jsonb_build_object('product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name),
                                                          'seller', jsonb_build_object('name', s.name, 'handle', s.handle),
                                                          'months', h.months, 'settle', h.settle) order by p.code)
                        from (select r.product_id, jsonb_agg(to_char(u.month, 'YYYY-MM') order by u.month) as months, sum(r.settle)::integer as settle
                                from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
                               where public.myr_settlement_row_held(r) group by r.product_id) h
                        join public.myr_products p on p.id = h.product_id
                        join public.sellers s on s.id = p.seller_id), '[]'::jsonb),
    'no_ledger', coalesce((select jsonb_agg(jsonb_build_object('product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name),
                                                               'seller', jsonb_build_object('name', s.name, 'handle', s.handle), 'status', p.status) order by p.code)
                             from public.myr_products p join public.sellers s on s.id = p.seller_id
                            where p.deleted_at is null and (public.myr_product_status_approved(p.status) or p.status = 'ended')
                              and not public.myr_mfg_has_ledger(p.id)), '[]'::jsonb))
$$;
revoke all on function public.myr_mfg_pending() from public, anon, authenticated;
grant execute on function public.myr_mfg_pending() to service_role;

-- 0111 정의 → 보류 건수를 안쪽 줄 쿼리의 held 칸(myr_settlement_row_held)으로 · 반환 모양 그대로
create or replace function public.myr_app_seller_settlements_of_user(p_user uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'settle_status', s.myr_settle_status,
    -- 다음 정산 보류 이유(크리에이터 쪽 · myr_seller_hold_reason) — 배너 · 다음 정산 상태
    'next_hold', case when public.myr_seller_hold_reason(s.id) is not null
                      then jsonb_build_object('code', public.myr_seller_hold_reason(s.id), 'label', public.myr_payout_hold_label(public.myr_seller_hold_reason(s.id))) end,
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
                   'pay_at', public.myr_settlement_pay_at(u.month),
                   'payout_status', (public.myr_payout_of(u.id, s.id)).status,
                   -- 이체한 날(지급 완료일 때 · 0103) — 화면은 이 날을 지급일로 보여 준다
                   'paid_on', (public.myr_payout_of(u.id, s.id)).paid_on,
                   -- 0111: 크리에이터에게 보이는 상태 문구(자동 이체 상태 포함 · myr_payout_creator_label) · 지급 예정 시각(지급할 수 있으면 다음 오후 1시) · 이체 상태(실패 종류는 크리에이터용으로 합친 값)
                   'payout_label', coalesce(public.myr_payout_creator_label(public.myr_payout_of(u.id, s.id)), public.myr_payout_status_label('none')),
                   'pay_due_at', public.myr_payout_pay_due_at(public.myr_payout_of(u.id, s.id), p_now),
                   'transfer', public.myr_payout_transfer_json(public.myr_payout_of(u.id, s.id)),
                   -- 보류 이유 전부(0104 · 사업자 정보와 세금계산서가 같이 걸리면 둘 다 · 크리에이터에게는 문구만 · 운영 메모는 싣지 않는다)
                   'holds', public.myr_payout_holds_json(public.myr_payout_of(u.id, s.id)),
                   -- 세금계산서(0104) — 합계 · 공급가액 · 세액 · 작성일자 · 발행 기한 · 상태 · 제출 가능
                   'invoice', public.myr_payout_invoice_json(public.myr_payout_of(u.id, s.id), p_now),
                   'total', jsonb_build_object(
                     'sales', coalesce(sum(x.sales) filter (where x.counted), 0), 'refund_adj', coalesce(sum(x.refund_adj) filter (where x.counted), 0),
                     'net_sales', public.myr_settlement_net_sales(coalesce(sum(x.sales) filter (where x.counted), 0)::int, coalesce(sum(x.refund_adj) filter (where x.counted), 0)::int),
                     'settle', coalesce(sum(x.settle) filter (where x.counted), 0),
                     'offset', coalesce(sum(x.offset_amount) filter (where x.counted), 0), 'deposit_refund', coalesce(sum(x.deposit_refund) filter (where x.counted), 0),
                     'payout', public.myr_payout_amount(public.myr_payout_of(u.id, s.id)),
                     'held', count(*) filter (where x.held)),
                   'rows', jsonb_agg(jsonb_build_object(
                     'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url),
                     'status', x.status, 'origin', to_char(x.origin, 'YYYY-MM'), 'released_in', to_char(x.released_in, 'YYYY-MM'), 'next_payout', x.next_payout,
                     'counted', x.counted, 'releasable', x.releasable,
                     'pct', x.pct, 'sales', x.sales, 'refund_adj', x.refund_adj, 'carry_in', x.carry_in, 'carry_out', x.carry_out,
                     'settle', x.settle, 'offset', x.offset_amount, 'mfg_after', x.mfg_after, 'deposit_refund', x.deposit_refund, 'payout', x.payout)
                     order by x.origin nulls first, p.name)) as j
                   from public.myr_settlement_runs u
                   cross join lateral (
                     -- 카드 줄 = myr_settlement_card_rows(그 회차의 내 줄 + 그 회차 지급 건에 담긴 지난 달 줄)
                     select r.product_id, r.status, case when c.origin then ro.month end as origin,
                            (select l.month from public.myr_settlement_runs l where l.id = c.paid_later_run) as released_in,
                            public.myr_settlement_row_payable(r) as next_payout, c.counted, public.myr_settlement_row_releasable(r) as releasable,
                            public.myr_settlement_row_held(r) as held,
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
                                                                          'deposit_paid', public.myr_mfg_batch_deposit_paid(b), 'deposit_refunded', public.myr_mfg_batch_deposit_refunded(b))
                                                       order by b.seq)
                                        from public.myr_mfg_batches b where b.product_id = p.id and public.myr_mfg_batch_live(b)), '[]'::jsonb),
                 'total', public.myr_mfg_total(p.id),
                 'offset', public.myr_mfg_offset_total(p.id),
                 'remaining', public.myr_mfg_remaining(p.id),
                 -- 갚은 비율(0103 · myr_mfg_repaid_pct) — 원장 카드 글자 · 막대
                 'repaid_pct', public.myr_mfg_repaid_pct(p.id),
                 -- 상환 완료 = 원장이 있고 남은 제조금액 0(myr_mfg_paid_off) — 화면이 remaining 을 비교하지 않는다
                 'paid_off', public.myr_mfg_has_ledger(p.id) and public.myr_mfg_paid_off(public.myr_mfg_remaining(p.id)),
                 -- 보증금 합 — myr_mfg_deposits 하나(맡김 = 입금 확인 · 환급 전 · 전체 = 환급 전 · 입금 전 포함) · 화면이 빼고 더하지 않는다
                 'deposit_paid', d.paid, 'deposit_unpaid', d.unpaid, 'deposit_refunded', d.refunded, 'deposit_held', d.held, 'deposit_total', d.total, 'deposit_state', d.state,
                 -- 다음 정산 상환 예정 = 다음 정산 예상 줄(보류 해제분 포함)의 그 상품 상계 합
                 'next_offset', coalesce((select sum((e ->> 'offset')::int) from jsonb_array_elements(pv.v -> 'rows') e where e #>> '{product,id}' = p.id::text), 0))
               order by p.created_at)
               from public.myr_products p
               cross join lateral public.myr_mfg_deposits(p.id) d
              where p.seller_id = s.id and p.deleted_at is null
                and (public.myr_mfg_has_ledger(p.id) or exists (select 1 from public.myr_settlement_rows r where r.product_id = p.id)
                     or exists (select 1 from public.myr_order_items i join public.myr_orders o on o.id = i.order_id
                                 where i.product_id = p.id and public.myr_line_paid(o, i)))), '[]'::jsonb) as v
    ) lg
   where s.user_id = p_user and p_user is not null
$$;
revoke all on function public.myr_app_seller_settlements_of_user(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_settlements_of_user(uuid, timestamptz) to service_role;

-- 0106 정의 → 결과 개수만 myr_settlement_row_confirmed · held
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
    'confirmed', (select count(*) from public.myr_settlement_rows r where r.run_id = v_run.id and public.myr_settlement_row_confirmed(r)),
    'held', (select count(*) from public.myr_settlement_rows r where r.run_id = v_run.id and public.myr_settlement_row_held(r)),
    'released', v_released,
    'payouts', (select count(*) from public.myr_payouts where run_id = v_run.id),
    'payout', coalesce((select sum(public.myr_payout_amount(p)) from public.myr_payouts p where p.run_id = v_run.id), 0));
end;
$$;
revoke all on function public.myr_settlement_run(date, text, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_settlement_run(date, text, timestamptz) to service_role;
