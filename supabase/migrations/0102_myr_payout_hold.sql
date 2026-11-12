-- ============================================================
-- 0102 · MYR 지급 상태 · 보류 이유 · 지급 가능 판정 (작업 순서 7-2 · 7-3 · 2026-11-12)
--
--   지급 건(0101 myr_payouts) 상태: 지급 대기(pending) · 지급 보류(held) · 지급 완료(paid) · 지급 없음(none · 0원).
--   보류 이유(hold_reason): settle_info(사업자 · 정산 정보 확인 전) · manual(운영 보류 · 메모 hold_note).
--     세금계산서 미수취(tax_invoice)는 세금계산서 기록(7-4)을 만들 때 myr_seller_hold_reason · 이 표 제약에 더한다.
--   자동 상태(myr_payout_auto_state) — 0원이면 지급 없음 · 크리에이터 쪽 보류 이유가 있으면 지급 보류(+이유) · 아니면 지급 대기.
--     지급 건 만들기 · 사업자 정보 확인 상태가 바뀔 때(트리거) · 운영 보류 해제 때 이 함수 하나로 다시 정한다(myr_payout_refresh).
--   운영 보류(manual) · 지급 완료(paid)는 자동으로 바꾸지 않는다 — 사람이 건 보류는 사람이 푼다(셀러리 0029 와 같은 원칙 · 코드는 복사하지 않음).
--   지급 가능(myr_payout_payable · 7-3) — 지급 완료 · 운영 보류가 아니고 자동 상태가 지급 대기. 운영 지급 완료 기록(7-5)이 이 판정을 부른다.
--   운영 스크립트: packages/db/scripts/myr-settle.mjs hold · release (보류 걸기 · 풀기) · report 에 상태 · 이유 · 지급 가능.
--   테스트: supabase/tests/myr_payout_hold.test.sql
-- ============================================================

alter table public.myr_payouts add column if not exists hold_note text;          -- 운영 보류 메모(운영만 본다)
alter table public.myr_payouts add column if not exists held_by   text;
alter table public.myr_payouts add column if not exists held_at   timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'myr_payouts_hold_reason_check') then
    alter table public.myr_payouts add constraint myr_payouts_hold_reason_check check (hold_reason is null or hold_reason in ('settle_info', 'manual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'myr_payouts_held') then
    alter table public.myr_payouts add constraint myr_payouts_held check ((status = 'held') = (hold_reason is not null));
  end if;
end;
$$;

-- ---------- 판정 함수 ----------

-- 사업자 · 정산 정보 운영 확인 완료(0085 myr_settle_status) — 보류 이유 · 정산 정보 저장(다시 확인 필요)이 같이 쓴다
create or replace function public.myr_seller_settle_verified(p_status text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_status = 'verified', false)
$$;
revoke all on function public.myr_seller_settle_verified(text) from public, anon, authenticated;

-- 크리에이터 쪽 지급 보류 이유(없으면 null) — 지급 건 자동 상태 · 다음 정산 예상 · 정산 탭 배너가 같이 쓴다
--   지금은 사업자 · 정산 정보 확인 전(settle_info) 하나. 세금계산서 미수취는 7-4 에서 여기에 더한다
create or replace function public.myr_seller_hold_reason(p_seller_id uuid)
returns text
language sql
stable
as $$
  select case when not public.myr_seller_settle_verified((select s.myr_settle_status from public.sellers s where s.id = p_seller_id)) then 'settle_info' end
$$;
revoke all on function public.myr_seller_hold_reason(uuid) from public, anon, authenticated;

-- 보류 이유 · 지급 상태 문구 — 크리에이터 화면 · 운영 보고가 같이 쓴다
create or replace function public.myr_payout_hold_label(p_code text)
returns text
language sql
immutable
as $$
  select case p_code when 'settle_info' then '사업자 · 정산 정보 확인 전' when 'manual' then '운영팀 확인 중' end
$$;
revoke all on function public.myr_payout_hold_label(text) from public, anon, authenticated;

create or replace function public.myr_payout_status_label(p_status text)
returns text
language sql
immutable
as $$
  select case p_status when 'pending' then '지급 대기' when 'held' then '지급 보류' when 'paid' then '지급 완료' when 'none' then '지급 없음' end
$$;
revoke all on function public.myr_payout_status_label(text) from public, anon, authenticated;

-- 지급 완료 · 운영 보류 — 자동으로 바꾸지 않는 지급 건
create or replace function public.myr_payout_is_paid(p public.myr_payouts)
returns boolean
language sql
immutable
as $$
  select coalesce(p.status = 'paid', false)
$$;
revoke all on function public.myr_payout_is_paid(public.myr_payouts) from public, anon, authenticated;

create or replace function public.myr_payout_manual_held(p public.myr_payouts)
returns boolean
language sql
immutable
as $$
  select coalesce(p.status = 'held' and p.hold_reason = 'manual', false)
$$;
revoke all on function public.myr_payout_manual_held(public.myr_payouts) from public, anon, authenticated;

-- 0101 정의를 바꾼다 — 자동으로 다시 정해도 되는 지급 건 = 지급 완료도 운영 보류도 아님
create or replace function public.myr_payout_status_auto(p public.myr_payouts)
returns boolean
language sql
immutable
as $$
  select not public.myr_payout_is_paid(p) and not public.myr_payout_manual_held(p)
$$;
revoke all on function public.myr_payout_status_auto(public.myr_payouts) from public, anon, authenticated;

-- 자동 상태 — 0원이면 지급 없음 · 크리에이터 쪽 보류 이유가 있으면 지급 보류(+이유) · 아니면 지급 대기
create or replace function public.myr_payout_auto_state(p public.myr_payouts)
returns table (status text, hold_reason text)
language sql
stable
as $$
  with x as (select public.myr_payout_has_amount(p) as amt, public.myr_seller_hold_reason(p.seller_id) as why)
  select case when not x.amt then 'none' when x.why is not null then 'held' else 'pending' end,
         case when x.amt then x.why end
    from x
$$;
revoke all on function public.myr_payout_auto_state(public.myr_payouts) from public, anon, authenticated;

-- 지급 가능(7-3) — 자동으로 정하는 지급 건이고 자동 상태가 지급 대기(0원 아님 · 보류 이유 없음). 운영 지급 완료 기록(7-5)이 부른다
create or replace function public.myr_payout_payable(p public.myr_payouts)
returns boolean
language sql
stable
as $$
  select public.myr_payout_status_auto(p) and (select a.status from public.myr_payout_auto_state(p) a) = 'pending'
$$;
revoke all on function public.myr_payout_payable(public.myr_payouts) from public, anon, authenticated;

-- 지급 건 하나를 자동 상태로 다시 정한다(자동 대상만) — 지급 건 만들기 · 사업자 정보 확인 트리거 · 운영 보류 해제가 부른다
create or replace function public.myr_payout_refresh(p_payout_id uuid)
returns void
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v public.myr_payouts%rowtype;
begin
  select * into v from public.myr_payouts where id = p_payout_id for update;
  if not found or not public.myr_payout_status_auto(v) then return; end if;
  update public.myr_payouts p
     set (status, hold_reason) = (select a.status, a.hold_reason from public.myr_payout_auto_state(v) a), updated_at = now()
   where p.id = v.id;
end;
$$;
revoke all on function public.myr_payout_refresh(uuid) from public, anon, authenticated;

-- 운영 스크립트가 찾는 지급 건 — 정산월 · 크리에이터 핸들
create or replace function public.myr_payout_find(p_month date, p_handle text)
returns public.myr_payouts
language sql
stable
as $$
  select p.* from public.myr_payouts p
    join public.myr_settlement_runs u on u.id = p.run_id
    join public.sellers s on s.id = p.seller_id
   where u.month = date_trunc('month', p_month)::date and s.handle = p_handle
$$;
revoke all on function public.myr_payout_find(date, text) from public, anon, authenticated;

-- ---------- 지급 건 만들기 — 상태는 myr_payout_refresh 하나로 ----------
-- 0101 정의 — 지급 대기 / 지급 없음 대신 자동 상태(myr_payout_refresh · 사업자 정보 확인 전이면 지급 보류)
create or replace function public.myr_payout_collect(p_run_id uuid, p_past_run boolean default false)
returns integer
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_ids uuid[];
  sr    record;
  v_p   public.myr_payouts;
  v_n   integer := 0;
begin
  -- 담을 줄 — 한 번만 고른다(지난 회차를 채울 때는 그 회차에 지급된 줄만)
  select coalesce(array_agg(r.id), '{}') into v_ids from public.myr_settlement_rows r
   where public.myr_settlement_row_payable(r) and (not p_past_run or public.myr_settlement_row_pay_run(r) = p_run_id);
  for sr in select distinct r.seller_id from public.myr_settlement_rows r where r.id = any (v_ids) order by r.seller_id
  loop
    insert into public.myr_payouts (run_id, seller_id, status)
    values (p_run_id, sr.seller_id, 'pending')
    on conflict (run_id, seller_id) do nothing;
    perform 1 from public.myr_payouts p where p.id = (public.myr_payout_of(p_run_id, sr.seller_id)).id for update;
    v_p := public.myr_payout_of(p_run_id, sr.seller_id);
    update public.myr_settlement_rows r set payout_id = v_p.id where r.id = any (v_ids) and r.seller_id = sr.seller_id;
    perform public.myr_payout_refresh(v_p.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.myr_payout_collect(uuid, boolean) from public, anon, authenticated;

-- 이미 있는 지급 건도 자동 상태로(사업자 · 정산 정보 확인 전이면 지급 보류 · 이유 settle_info)
do $$
declare
  v record;
begin
  for v in select id from public.myr_payouts loop
    perform public.myr_payout_refresh(v.id);
  end loop;
end;
$$;

-- ---------- 사업자 · 정산 정보 확인 상태가 바뀌면 그 크리에이터의 지급 건을 다시 정한다 ----------
create or replace function public.sellers_myr_payout_refresh()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v record;
begin
  for v in select p.id from public.myr_payouts p where p.seller_id = new.id loop
    perform public.myr_payout_refresh(v.id);
  end loop;
  return null;
end;
$$;
revoke all on function public.sellers_myr_payout_refresh() from public, anon, authenticated;
drop trigger if exists sellers_myr_payout_refresh on public.sellers;
create trigger sellers_myr_payout_refresh
  after update of myr_settle_status on public.sellers
  for each row when (old.myr_settle_status is distinct from new.myr_settle_status)
  execute function public.sellers_myr_payout_refresh();

-- ---------- 운영 보류 · 해제(스크립트 myr-settle.mjs hold · release) ----------
create or replace function public.myr_payout_hold(p_month date, p_handle text, p_note text, p_actor text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v public.myr_payouts%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
begin
  v := public.myr_payout_find(p_month, p_handle);
  if v.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_note = '' then return jsonb_build_object('ok', false, 'code', 'NOTE_REQUIRED'); end if;
  select * into v from public.myr_payouts where id = v.id for update;
  if public.myr_payout_is_paid(v) then return jsonb_build_object('ok', false, 'code', 'ALREADY_PAID'); end if;
  if public.myr_payout_manual_held(v) then return jsonb_build_object('ok', false, 'code', 'ALREADY_HELD'); end if;
  if not public.myr_payout_has_amount(v) then return jsonb_build_object('ok', false, 'code', 'NOTHING_TO_PAY'); end if;
  update public.myr_payouts
     set status = 'held', hold_reason = 'manual', hold_note = v_note, held_by = coalesce(p_actor, 'script'), held_at = now(), updated_at = now()
   where id = v.id returning * into v;
  return jsonb_build_object('ok', true, 'status', v.status, 'hold_reason', v.hold_reason);
end;
$$;
revoke all on function public.myr_payout_hold(date, text, text, text) from public, anon, authenticated;
grant execute on function public.myr_payout_hold(date, text, text, text) to service_role;

create or replace function public.myr_payout_release(p_month date, p_handle text, p_actor text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v public.myr_payouts%rowtype;
begin
  v := public.myr_payout_find(p_month, p_handle);
  if v.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select * into v from public.myr_payouts where id = v.id for update;
  if not public.myr_payout_manual_held(v) then return jsonb_build_object('ok', false, 'code', 'NOT_MANUAL'); end if;
  -- 운영 보류를 풀면 자동 상태로(사업자 정보 확인 전이면 다시 지급 보류 · 이유 settle_info)
  update public.myr_payouts p
     set (status, hold_reason) = (select a.status, a.hold_reason from public.myr_payout_auto_state(v) a),
         hold_note = null, held_by = null, held_at = null, updated_at = now()
   where p.id = v.id returning * into v;
  return jsonb_build_object('ok', true, 'status', v.status, 'hold_reason', v.hold_reason, 'by', coalesce(p_actor, 'script'));
end;
$$;
revoke all on function public.myr_payout_release(date, text, text) from public, anon, authenticated;
grant execute on function public.myr_payout_release(date, text, text) to service_role;

-- 0101 정의 + 지급 건 상태 문구 · 보류 이유 · 메모 · 지급 가능(myr_payout_payable)
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
               'status', p.status, 'status_label', public.myr_payout_status_label(p.status),
               'hold_reason', p.hold_reason, 'hold_label', public.myr_payout_hold_label(p.hold_reason), 'hold_note', p.hold_note,
               'payable', public.myr_payout_payable(p), 'amount', public.myr_payout_amount(p),
               'rows', (select count(*) from public.myr_settlement_rows r where r.payout_id = p.id))
             order by s.handle)
             from public.myr_payouts p join public.sellers s on s.id = p.seller_id where p.run_id = u.id), '[]'::jsonb),
    'payout_total', coalesce((select sum(public.myr_payout_amount(p)) from public.myr_payouts p where p.run_id = u.id), 0))
    from public.myr_settlement_runs u
   where u.month = date_trunc('month', p_month)::date
$$;
revoke all on function public.myr_settlement_report(date) from public, anon, authenticated;
grant execute on function public.myr_settlement_report(date) to service_role;

-- 0101 정의 + 다음 정산 보류 이유(next_hold) · 달 지급 상태 문구(payout_label) · 보류 이유(hold)
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
                   'payout_label', coalesce(public.myr_payout_status_label((public.myr_payout_of(u.id, s.id)).status), public.myr_payout_status_label('none')),
                   -- 보류 이유(크리에이터에게는 문구만 · 운영 메모는 싣지 않는다)
                   'hold', case when (public.myr_payout_of(u.id, s.id)).hold_reason is not null
                                then jsonb_build_object('code', (public.myr_payout_of(u.id, s.id)).hold_reason, 'label', public.myr_payout_hold_label((public.myr_payout_of(u.id, s.id)).hold_reason)) end,
                   'total', jsonb_build_object(
                     'sales', coalesce(sum(x.sales) filter (where x.counted), 0), 'refund_adj', coalesce(sum(x.refund_adj) filter (where x.counted), 0),
                     'net_sales', public.myr_settlement_net_sales(coalesce(sum(x.sales) filter (where x.counted), 0)::int, coalesce(sum(x.refund_adj) filter (where x.counted), 0)::int),
                     'settle', coalesce(sum(x.settle) filter (where x.counted), 0),
                     'offset', coalesce(sum(x.offset_amount) filter (where x.counted), 0), 'deposit_refund', coalesce(sum(x.deposit_refund) filter (where x.counted), 0),
                     'payout', public.myr_payout_amount(public.myr_payout_of(u.id, s.id)),
                     'held', count(*) filter (where x.status = 'held')),
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
                                 where i.product_id = p.id and o.paid_at is not null and public.myr_line_valid(i)))), '[]'::jsonb) as v
    ) lg
   where s.user_id = p_user and p_user is not null
$$;
revoke all on function public.myr_app_seller_settlements_of_user(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_settlements_of_user(uuid, timestamptz) to service_role;

-- 0085 정의 — 확인 완료 판정은 myr_seller_settle_verified
create or replace function public.myr_app_seller_settle_info_save(p_user uuid, p_company text, p_ceo text, p_biz_no text, p_bank text, p_account text, p_holder text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s         public.sellers%rowtype;
  v_company text := btrim(coalesce(p_company, ''));
  v_ceo     text := btrim(coalesce(p_ceo, ''));
  v_bank    text := btrim(coalesce(p_bank, ''));
  v_holder  text := btrim(coalesce(p_holder, ''));
  v_biz     text;
  v_account text;
  v_status  text;
  v_recheck boolean;
begin
  select * into s from public.sellers where user_id = p_user and p_user is not null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  -- null 이면 저장된 값(가린 값만 가진 화면이 다시 입력하지 않아도 되게)
  v_biz := case when p_biz_no is null then s.biz_no else regexp_replace(p_biz_no, '[^0-9]', '', 'g') end;
  v_account := case when p_account is null then s.bank_info ->> 'account' else regexp_replace(p_account, '[^0-9]', '', 'g') end;

  if char_length(v_company) not between 1 and 50 then return jsonb_build_object('ok', false, 'code', 'BAD_COMPANY'); end if;
  if char_length(v_ceo) not between 1 and 30 then return jsonb_build_object('ok', false, 'code', 'BAD_CEO'); end if;
  if not public.myr_biz_no_valid(v_biz) then return jsonb_build_object('ok', false, 'code', 'BAD_BIZ_NO'); end if;
  if char_length(v_bank) not between 1 and 20 then return jsonb_build_object('ok', false, 'code', 'BAD_BANK'); end if;
  if coalesce(v_account, '') !~ '^\d{8,16}$' then return jsonb_build_object('ok', false, 'code', 'BAD_ACCOUNT'); end if;
  if char_length(v_holder) not between 1 and 50 then return jsonb_build_object('ok', false, 'code', 'BAD_HOLDER'); end if;
  if public.myr_holder_key(v_holder) not in (public.myr_holder_key(v_company), public.myr_holder_key(v_ceo)) then
    return jsonb_build_object('ok', false, 'code', 'HOLDER_MISMATCH');
  end if;

  -- 다시 확인: 계좌 · 사업자번호 · 대표자가 바뀌면. 상호만 바뀌면 확인 완료 그대로
  v_recheck := not public.myr_seller_settle_verified(s.myr_settle_status)
            or v_biz is distinct from s.biz_no
            or v_ceo is distinct from (s.tax_info ->> 'ceo')
            or v_bank is distinct from (s.bank_info ->> 'bank')
            or v_account is distinct from (s.bank_info ->> 'account')
            or v_holder is distinct from (s.bank_info ->> 'holder');
  v_status := case when v_recheck then 'pending' else s.myr_settle_status end;

  update public.sellers
     set biz_no = v_biz,
         tax_info = coalesce(tax_info, '{}'::jsonb) || jsonb_build_object('company', v_company, 'ceo', v_ceo),
         bank_info = jsonb_build_object('bank', v_bank, 'account', v_account, 'holder', v_holder),
         settle_type = 'biz',
         myr_settle_status = v_status,
         myr_settle_note = case when v_recheck then null else myr_settle_note end,
         myr_settle_submitted_at = case when v_recheck then now() else myr_settle_submitted_at end,
         myr_settle_checked_at = case when v_recheck then null else myr_settle_checked_at end,
         myr_settle_checked_by = case when v_recheck then null else myr_settle_checked_by end
   where id = s.id
  returning * into s;
  return jsonb_build_object('ok', true, 'recheck', v_recheck, 'info', public.myr_settle_info_json(s));
end;
$function$;
revoke all on function public.myr_app_seller_settle_info_save(uuid, text, text, text, text, text, text) from public, anon, authenticated;
