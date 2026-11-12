-- ============================================================
-- 0103 · MYR 운영 지급 완료 기록 (작업 순서 7-5 · 2026-11-12)
--
--   운영이 직접 이체한 뒤 "지급 완료"를 기록한다(송금 방식 — 토스 지급대행 · 이체 파일 — 은 대표 결정 뒤).
--   · 지급 목록(myr_payout_to_pay) — 그 달 지급 가능(0102 myr_payout_payable) 지급 건 · 금액 · 계좌(원문 · 이체용 · service_role 만)
--   · 지급 완료(myr_payout_mark_paid) — 지급 가능일 때만 · 운영이 적은 금액이 지급 건 금액(myr_payout_amount)과 같아야 · 이체한 날(paid_on · KST)
--     은 오늘 이후 · 회차 계산일 전이면 거절. 그때 금액(paid_amount) · 가린 계좌(paid_bank — 셀러리 0020 처럼 원문은 sellers 에만) · 메모를 남긴다
--   · 지급 완료 취소(myr_payout_unmark_paid) — 잘못 기록했을 때 · 사유 필수 · 자동 상태로 돌린다(0102 myr_payout_auto_state)
--   · 기록 · 취소는 myr_payout_logs 에 남는다(취소해도 이력은 지우지 않는다)
--   · 크리에이터 정산 탭 — 지급 완료면 이체한 날(paid_on)을 지급일로 보여 준다
--   운영 스크립트: packages/db/scripts/myr-settle.mjs to-pay · paid · unpaid
--   세금계산서 수취(7-4)는 아직 — 그 전까지 운영이 받았는지 직접 확인하고 기록한다. 7-4 가 myr_seller_hold_reason 에 이유를 더하면 지급 가능이 자동으로 막는다.
--   테스트: supabase/tests/myr_payout_paid.test.sql
-- ============================================================

alter table public.myr_payouts add column if not exists paid_on   date;     -- 이체한 날(KST) · paid_at 은 기록한 시각
alter table public.myr_payouts add column if not exists paid_bank jsonb;    -- 지급 때 계좌(가린 값 { bank, account_masked, holder })
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'myr_payouts_paid_on') then
    alter table public.myr_payouts add constraint myr_payouts_paid_on check ((status = 'paid') = (paid_on is not null));
  end if;
end;
$$;
comment on column public.myr_payouts.paid_at is '지급 완료를 기록한 시각 — 이체한 날은 paid_on(0103)';

create table if not exists public.myr_payout_logs (
  id         uuid primary key default gen_random_uuid(),
  payout_id  uuid not null references public.myr_payouts (id) on delete restrict,
  action     text not null check (action in ('paid', 'unpaid')),   -- 지급 완료 기록 · 지급 완료 취소
  amount     integer,
  paid_on    date,
  bank       jsonb,
  note       text,
  actor      text not null,
  created_at timestamptz not null default now()
);
create index if not exists myr_payout_logs_payout_idx on public.myr_payout_logs (payout_id, created_at);
alter table public.myr_payout_logs enable row level security;
revoke all on public.myr_payout_logs from anon, authenticated;

-- ---------- 판정 함수 ----------

-- 한국 날짜 — 지급 완료(이체한 날 검사) · 단순 변심 기한이 같이 쓴다
create or replace function public.myr_kst_date(p_at timestamptz)
returns date
language sql
immutable
as $$
  select (p_at at time zone 'Asia/Seoul')::date
$$;
revoke all on function public.myr_kst_date(timestamptz) from public, anon, authenticated;

-- 계좌번호 가리기(뒤 4자리) · 없으면 null — 정산 정보 화면 · 지급 때 계좌 기록이 같이 쓴다
create or replace function public.myr_mask_account(p_account text)
returns text
language sql
immutable
as $$
  select case when coalesce(p_account, '') <> '' then '****' || right(p_account, 4) end
$$;
revoke all on function public.myr_mask_account(text) from public, anon, authenticated;

-- 지급 때 계좌(가린 값) — 지급 완료 기록에 남긴다(원문은 sellers.bank_info 에만)
create or replace function public.myr_payout_bank_snapshot(p_seller_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('bank', s.bank_info ->> 'bank', 'account_masked', public.myr_mask_account(s.bank_info ->> 'account'), 'holder', s.bank_info ->> 'holder')
    from public.sellers s where s.id = p_seller_id
$$;
revoke all on function public.myr_payout_bank_snapshot(uuid) from public, anon, authenticated;

-- ---------- 같은 식을 쓰던 함수 ----------
-- 0085 정의 — 계좌 가리기 · 계좌 있음은 myr_mask_account
create or replace function public.myr_settle_info_json(s sellers)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'company', s.tax_info ->> 'company',
    'ceo', s.tax_info ->> 'ceo',
    'biz_no_masked', case when s.biz_no ~ '^\d{10}$' then '***-**-' || right(s.biz_no, 5) end,
    'has_biz_no', coalesce(s.biz_no ~ '^\d{10}$', false),
    'bank', s.bank_info ->> 'bank',
    'holder', s.bank_info ->> 'holder',
    'account_masked', public.myr_mask_account(s.bank_info ->> 'account'),
    'has_account', public.myr_mask_account(s.bank_info ->> 'account') is not null,
    'tax_email', coalesce(s.email, (select u.email from auth.users u where u.id = s.user_id)),
    'status', s.myr_settle_status,
    'note', case when s.myr_settle_status = 'rejected' then s.myr_settle_note end,
    'submitted_at', s.myr_settle_submitted_at,
    'checked_at', s.myr_settle_checked_at)
$function$;
revoke all on function public.myr_settle_info_json(public.sellers) from public, anon, authenticated;

-- 0093 정의 — 한국 날짜는 myr_kst_date(결과 그대로)
create or replace function public.myr_line_change_mind_until(i myr_order_items)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
AS $function$
  select case when i.delivered_at is null then null
              else (((public.myr_kst_date(i.delivered_at) + 8)::timestamp) at time zone 'Asia/Seoul') - interval '1 second' end
$function$;
revoke all on function public.myr_line_change_mind_until(public.myr_order_items) from public, anon, authenticated;

-- ---------- 지급 목록 · 지급 완료 · 취소(운영 스크립트 myr-settle.mjs to-pay · paid · unpaid) ----------

-- 그 달 지급 가능 지급 건 — 이체용이라 계좌 원문을 싣는다(service_role 만)
create or replace function public.myr_payout_to_pay(p_month date)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'seller', jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle),
           'amount', public.myr_payout_amount(p),
           'bank', jsonb_build_object('bank', s.bank_info ->> 'bank', 'account', s.bank_info ->> 'account', 'holder', s.bank_info ->> 'holder'))
         order by s.handle), '[]'::jsonb)
    from public.myr_payouts p
    join public.myr_settlement_runs u on u.id = p.run_id
    join public.sellers s on s.id = p.seller_id
   where u.month = date_trunc('month', p_month)::date and public.myr_payout_payable(p)
$$;
revoke all on function public.myr_payout_to_pay(date) from public, anon, authenticated;
grant execute on function public.myr_payout_to_pay(date) to service_role;

create or replace function public.myr_payout_mark_paid(p_month date, p_handle text, p_amount integer, p_paid_on date, p_note text, p_actor text, p_now timestamptz default now())
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v      public.myr_payouts%rowtype;
  v_run  public.myr_settlement_runs%rowtype;
  v_amt  integer;
  v_bank jsonb;
begin
  v := public.myr_payout_find(p_month, p_handle);
  if v.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select * into v from public.myr_payouts where id = v.id for update;
  if public.myr_payout_is_paid(v) then return jsonb_build_object('ok', false, 'code', 'ALREADY_PAID', 'paid_on', v.paid_on); end if;
  if not public.myr_payout_payable(v) then
    return jsonb_build_object('ok', false, 'code', 'NOT_PAYABLE', 'status', v.status, 'hold_reason', v.hold_reason, 'hold_label', public.myr_payout_hold_label(v.hold_reason));
  end if;
  v_amt := public.myr_payout_amount(v);
  if p_amount is distinct from v_amt then return jsonb_build_object('ok', false, 'code', 'AMOUNT_MISMATCH', 'amount', v_amt); end if;
  select * into v_run from public.myr_settlement_runs where id = v.run_id;
  if p_paid_on is null then return jsonb_build_object('ok', false, 'code', 'BAD_DATE'); end if;
  if p_paid_on > public.myr_kst_date(p_now) then return jsonb_build_object('ok', false, 'code', 'FUTURE_DATE'); end if;
  if p_paid_on < public.myr_kst_date(v_run.cutoff_at) then return jsonb_build_object('ok', false, 'code', 'BEFORE_RUN', 'run_on', public.myr_kst_date(v_run.cutoff_at)); end if;
  v_bank := public.myr_payout_bank_snapshot(v.seller_id);
  update public.myr_payouts
     set status = 'paid', hold_reason = null, hold_note = null, held_by = null, held_at = null,
         paid_at = p_now, paid_on = p_paid_on, paid_amount = v_amt, paid_bank = v_bank,
         paid_note = nullif(btrim(coalesce(p_note, '')), ''), paid_by = coalesce(p_actor, 'script'), updated_at = now()
   where id = v.id returning * into v;
  insert into public.myr_payout_logs (payout_id, action, amount, paid_on, bank, note, actor)
  values (v.id, 'paid', v_amt, p_paid_on, v_bank, v.paid_note, coalesce(p_actor, 'script'));
  return jsonb_build_object('ok', true, 'amount', v_amt, 'paid_on', v.paid_on, 'bank', v_bank);
end;
$$;
revoke all on function public.myr_payout_mark_paid(date, text, integer, date, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_payout_mark_paid(date, text, integer, date, text, text, timestamptz) to service_role;

create or replace function public.myr_payout_unmark_paid(p_month date, p_handle text, p_reason text, p_actor text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v        public.myr_payouts%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  v := public.myr_payout_find(p_month, p_handle);
  if v.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_reason = '' then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;
  select * into v from public.myr_payouts where id = v.id for update;
  if not public.myr_payout_is_paid(v) then return jsonb_build_object('ok', false, 'code', 'NOT_PAID'); end if;
  insert into public.myr_payout_logs (payout_id, action, amount, paid_on, bank, note, actor)
  values (v.id, 'unpaid', v.paid_amount, v.paid_on, v.paid_bank, v_reason, coalesce(p_actor, 'script'));
  -- 지급 완료를 지우고 자동 상태로(사업자 정보 확인 전이면 지급 보류)
  update public.myr_payouts p
     set (status, hold_reason) = (select a.status, a.hold_reason from public.myr_payout_auto_state(v) a),
         paid_at = null, paid_on = null, paid_amount = null, paid_bank = null, paid_note = null, paid_by = null, updated_at = now()
   where p.id = v.id returning * into v;
  return jsonb_build_object('ok', true, 'status', v.status, 'hold_reason', v.hold_reason);
end;
$$;
revoke all on function public.myr_payout_unmark_paid(date, text, text, text) from public, anon, authenticated;
grant execute on function public.myr_payout_unmark_paid(date, text, text, text) to service_role;

-- 0102 정의 + 지급 완료(이체한 날 · 그때 금액 · 메모 · 가린 계좌)
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
               'paid_on', p.paid_on, 'paid_amount', p.paid_amount, 'paid_note', p.paid_note, 'paid_bank', p.paid_bank,
               'rows', (select count(*) from public.myr_settlement_rows r where r.payout_id = p.id))
             order by s.handle)
             from public.myr_payouts p join public.sellers s on s.id = p.seller_id where p.run_id = u.id), '[]'::jsonb),
    'payout_total', coalesce((select sum(public.myr_payout_amount(p)) from public.myr_payouts p where p.run_id = u.id), 0))
    from public.myr_settlement_runs u
   where u.month = date_trunc('month', p_month)::date
$$;
revoke all on function public.myr_settlement_report(date) from public, anon, authenticated;
grant execute on function public.myr_settlement_report(date) to service_role;

-- 0102 정의 + 이체한 날(paid_on)
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
