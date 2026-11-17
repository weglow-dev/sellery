-- ============================================================
-- 0111 · MYR 자동 이체 기준 — 지급 예정 시각 · 이체 상태(송금 중 · 실패 종류)를 크리에이터 정산 응답에 (2026-11-13 결정)
--
--   결정(2026-11-13): 지급은 자동 이체 — 매일 오후 1시(정산 크론 0106 바로 뒤) · 세금계산서까지 확인된 지급 건부터. 첫 기회는 매월 1일 오후 1시.
--     용어: 정산 확정 = 매월 1일 오후 1시 정산금이 정해진다 · 지급 = 세금계산서가 확인된 다음 오후 1시에 입금된다(확인되지 않으면 지급되지 않는다).
--   자동 이체 연동(지급대행 · 송금 API · 실패 코드)은 지급 방식이 정해진 뒤 — 이 마이그레이션은 화면이 읽을 값과 칸만 먼저 둔다(지금은 늘 비어 있다).
--   칸(myr_payouts):
--     transfer_state  null · sending(송금 중) · failed(실패)
--     transfer_fail   실패 종류 — retry(잠깐 안 됨 · 다음 오후 1시 재시도) · account(계좌 문제 · 크리에이터가 다시 입력) · ops(잔액 · 한도 등 운영 쪽) · check(결과 불명 · 조회 먼저)
--     transfer_tries · transfer_at  시도 횟수 · 마지막 시도 시각
--   함수:
--     myr_payout_sending(p)          송금 중인지(transfer_state = 'sending') — 지급 예정 시각 · 상태 문구가 같이 쓴다
--     myr_payout_fail_kind(p)        크리에이터에게 보이는 실패 종류 — 운영 쪽(ops · check)은 이유 없이 ops 로 합친다(운영 확인 중) ·
--                                    지급 보류면 비운다(보류가 먼저 — 계좌를 다시 입력해 정산 정보 확인 중 · 세금계산서 반려 · 운영 보류가 실패 기록 뒤에 걸려도
--                                    "지급 보류"로 보인다. 이체 기록 칸은 지우지 않고 운영용으로 남긴다)
--     myr_payout_pay_due_at(p, now)  지급 예정 시각 — 지급할 수 있고(myr_payout_payable) 송금 중 · 계좌 · 운영 실패가 아니면 다음 오후 1시(myr_settlement_next_cron)
--     myr_payout_creator_label(p)    크리에이터 상태 문구 — 지급 중 · 지급 실패(계좌) · 지급 지연(재시도) · 지급 확인 중(운영) · 지급 예정(대기) · 그 밖은 myr_payout_status_label
--     myr_payout_transfer_json(p)    { state, kind, tries } · 송금 중도 아니고 보이는 실패 종류도 없으면(이체 상태 없음 · 보류 중 실패) null
--   크리에이터 정산 응답(myr_app_seller_settlements_of_user) 달마다 payout_label · pay_due_at · transfer
--   테스트: supabase/tests/myr_payout_transfer.test.sql
-- ============================================================

alter table public.myr_payouts
  add column if not exists transfer_state text,
  add column if not exists transfer_fail text,
  add column if not exists transfer_tries integer not null default 0,
  add column if not exists transfer_at timestamptz;
alter table public.myr_payouts drop constraint if exists myr_payouts_transfer_state;
alter table public.myr_payouts add constraint myr_payouts_transfer_state check (transfer_state is null or transfer_state in ('sending', 'failed'));
alter table public.myr_payouts drop constraint if exists myr_payouts_transfer_fail;
alter table public.myr_payouts add constraint myr_payouts_transfer_fail check (transfer_fail is null or transfer_fail in ('retry', 'account', 'ops', 'check'));
-- 실패일 때만 실패 종류가 있다 · 지급 완료면 이체 상태가 없다
alter table public.myr_payouts drop constraint if exists myr_payouts_transfer_failed;
alter table public.myr_payouts add constraint myr_payouts_transfer_failed check ((coalesce(transfer_state, '') = 'failed') = (transfer_fail is not null));
alter table public.myr_payouts drop constraint if exists myr_payouts_transfer_paid;
alter table public.myr_payouts add constraint myr_payouts_transfer_paid check (status <> 'paid' or transfer_state is null);
alter table public.myr_payouts drop constraint if exists myr_payouts_transfer_tries;
alter table public.myr_payouts add constraint myr_payouts_transfer_tries check (transfer_tries >= 0);

create or replace function public.myr_payout_sending(p public.myr_payouts)
returns boolean
language sql
immutable
as $$
  select coalesce(p.transfer_state = 'sending', false)
$$;
revoke all on function public.myr_payout_sending(public.myr_payouts) from public, anon, authenticated;

create or replace function public.myr_payout_fail_kind(p public.myr_payouts)
returns text
language sql
immutable
as $$
  select case when p.transfer_state is distinct from 'failed' then null
              when p.status = 'held' then null
              when p.transfer_fail in ('ops', 'check') then 'ops'
              else p.transfer_fail end
$$;
revoke all on function public.myr_payout_fail_kind(public.myr_payouts) from public, anon, authenticated;

create or replace function public.myr_payout_pay_due_at(p public.myr_payouts, p_now timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select case when not coalesce(public.myr_payout_payable(p), false) then null
              when public.myr_payout_sending(p) then null
              when public.myr_payout_fail_kind(p) in ('account', 'ops') then null
              else public.myr_settlement_next_cron(p_now) end
$$;
revoke all on function public.myr_payout_pay_due_at(public.myr_payouts, timestamptz) from public, anon, authenticated;

create or replace function public.myr_payout_creator_label(p public.myr_payouts)
returns text
language sql
immutable
as $$
  select case when public.myr_payout_sending(p) then '지급 중'
              when public.myr_payout_fail_kind(p) = 'account' then '지급 실패'
              when public.myr_payout_fail_kind(p) = 'retry' then '지급 지연'
              when public.myr_payout_fail_kind(p) = 'ops' then '지급 확인 중'
              when p.status = 'pending' then '지급 예정'
              else public.myr_payout_status_label(p.status) end
$$;
revoke all on function public.myr_payout_creator_label(public.myr_payouts) from public, anon, authenticated;

create or replace function public.myr_payout_transfer_json(p public.myr_payouts)
returns jsonb
language sql
immutable
as $$
  select case when not public.myr_payout_sending(p) and public.myr_payout_fail_kind(p) is null then null
              else jsonb_build_object('state', p.transfer_state, 'kind', public.myr_payout_fail_kind(p), 'tries', p.transfer_tries) end
$$;
revoke all on function public.myr_payout_transfer_json(public.myr_payouts) from public, anon, authenticated;

-- 0110 정의 + 달마다 payout_label(myr_payout_creator_label) · pay_due_at · transfer
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
