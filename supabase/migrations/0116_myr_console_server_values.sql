-- ============================================================
-- 0116 · MYR 크리에이터 콘솔 화면 값을 서버에서 — 정산 비율 · 홈 정산 보류 배너 · 답변 기한 · 처리 대기 · 주문 탭 · 상품 탭 · 메뉴 · CS 비율 (2026-11-17)
--
--   점검(백엔드 원칙 1 · 크리에이터 콘솔):
--     정산 비율               "정산금 (60%)" 고정 → 미리보기 pct(myr_settlement_pct) · 달 카드 pct(myr_settlement_card_pct) · 줄 pct(그대로)
--     홈 사업자 정보 배너     입력 상태 none · rejected 로 판정 → 정산 탭과 같은 보류 이유(myr_seller_next_hold_json — 확인 중이면 "확인 중")
--     답변 기한               TS 2일 → 설정 myr_claim_answer { days } · myr_claim_due_json(기한 · 남은 날 · 지남 · 급함)
--     처리 대기               목록에서 status 로 다시 셈 → myr_claim_waiting(r) · myr_cs_waiting(c) — 대기 수 · 목록 순서 · 응답 waiting · 결정 가능(NOT_PENDING) · 단계(decide)가 같은 함수
--     주문 탭 · 상태 칩       TS 가 줄을 훑어 순위 → myr_order_claim_status(주문, 크리에이터) · myr_seller_order_state · myr_seller_order_tab
--     상품 탭 · 홈 개수 · 메뉴 · 수정 화면   TS 가 상태 묶음으로 → myr_seller_product_console(상태, 수정본 상태)
--     CS 비율                 TS 나눗셈 → myr_cs_rate(환불 주문, 주문)
--   계산 결과 불변 — 새 함수는 지금 TS 식 · SQL 식을 그대로 옮긴다(답변 기한 2일 · 정산 비율 60 · 탭 우선순위 · 메뉴 그대로). 응답에 칸만 더한다
--   myr_order_claim_status 는 크리에이터 범위 인자를 더해(기본 null = 주문 전체) 새 함수가 된다 — 예전 (uuid) 는 지운다
--   테스트: supabase/tests/myr_console_server_values.test.sql · 기존 정산 · 요청 · 문의 · 주문 · 상품 · 실적 테스트
-- ============================================================

-- ── 1. 새 판정 함수 ─────────────────────────────────────────────

-- 정산 비율 — 달 카드 합계에 들어간 줄의 비율이 하나면 그 값(정산 비율 설정이 바뀐 달이 섞이면 null)
create or replace function public.myr_settlement_card_pct(p_pcts integer[])
returns integer
language sql
immutable
as $$
  select case when (select count(distinct x) from unnest(p_pcts) x) = 1 then (select min(x) from unnest(p_pcts) x) end
$$;
revoke all on function public.myr_settlement_card_pct(integer[]) from public, anon, authenticated;

-- 다음 정산 보류 이유 { code, label } — 정산 탭 next_hold · 홈 배너(정산 정보 hold)가 같이 쓴다
create or replace function public.myr_seller_next_hold_json(p_seller uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select case when public.myr_seller_hold_reason(p_seller) is not null
              then jsonb_build_object('code', public.myr_seller_hold_reason(p_seller), 'label', public.myr_payout_hold_label(public.myr_seller_hold_reason(p_seller))) end
$$;
revoke all on function public.myr_seller_next_hold_json(uuid) from public, anon, authenticated;

-- 크리에이터 답변을 기다리는 교환 · 환불 요청(처리 대기)
create or replace function public.myr_claim_waiting(r public.myr_refund_requests)
returns boolean
language sql
immutable
as $$
  select r.status = 'pending'
$$;
revoke all on function public.myr_claim_waiting(public.myr_refund_requests) from public, anon, authenticated;

-- 답변을 기다리는 고객 문의(답변 대기)
create or replace function public.myr_cs_waiting(c public.myr_cs_conversations)
returns boolean
language sql
immutable
as $$
  select c.status = 'OPEN'
$$;
revoke all on function public.myr_cs_waiting(public.myr_cs_conversations) from public, anon, authenticated;

-- 답변 기한(접수 뒤 N일) — 운영 설정 · 기본 2일(시안 "2일 안에 답변" · 지금 화면과 같은 값)
insert into public.platform_settings (key, value, description)
values ('myr_claim_answer', '{"days": 2}', 'MYR 교환 · 환불 요청 답변 기한 — 접수 뒤 days 일(크리에이터 콘솔 안내 · 운영은 언제든 승인 · 반려)')
on conflict (key) do nothing;

create or replace function public.myr_claim_answer_days()
returns integer
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select (ps.value ->> 'days')::int from public.platform_settings ps where ps.key = 'myr_claim_answer'), 2)
$$;
revoke all on function public.myr_claim_answer_days() from public, anon, authenticated;

-- 답변 기한 { at, days(남은 날 · 오늘 안 = 1 · 지나면 0), overdue, urgent(하루 이하) } — 기다리는 요청만(아니면 null)
create or replace function public.myr_claim_due_json(r public.myr_refund_requests, p_now timestamptz)
returns jsonb
language sql
stable
set search_path = public
as $$
  select case when public.myr_claim_waiting(r) then
           jsonb_build_object('at', d.at, 'days', d.days, 'overdue', d.days = 0, 'urgent', d.days <= 1) end
    from (select r.created_at + make_interval(days => public.myr_claim_answer_days()) as at) a
    cross join lateral (select a.at, greatest(ceil(extract(epoch from (a.at - p_now)) / 86400), 0)::int as days) d
$$;
revoke all on function public.myr_claim_due_json(public.myr_refund_requests, timestamptz) from public, anon, authenticated;

-- 주문의 열린 요청 상태(처리 대기 > 진행 중) — 크리에이터를 주면 그 크리에이터 줄만(콘솔 주문 탭) · 없으면 주문 전체(샵 주문 칩)
drop function if exists public.myr_order_claim_status(uuid);
create or replace function public.myr_order_claim_status(p_order_id uuid, p_seller_id uuid default null)
returns text
language sql
stable
set search_path = public
as $$
  select case when bool_or(public.myr_claim_waiting(r)) then 'pending' when bool_or(r.status = 'progress') then 'progress' end
    from public.myr_refund_requests r
   where r.order_id = p_order_id and (p_seller_id is null or r.seller_id = p_seller_id) and public.myr_claim_status_open(r.status)
$$;
revoke all on function public.myr_order_claim_status(uuid, uuid) from public, anon, authenticated;

-- 콘솔 주문 상태(칩) — 우선순위 요청(claim_pending · claim_progress) → 환불(남은 줄 없음 refunded · 있음 partial_refunded) → 배송 상태(PAID · PREPARING · SHIPPING · DELIVERED)
create or replace function public.myr_seller_order_state(p_claim text, p_has_refund boolean, p_ship text)
returns text
language sql
immutable
as $$
  select case when p_claim is not null then 'claim_' || p_claim
              when p_ship is null then 'refunded'
              when coalesce(p_has_refund, false) then 'partial_refunded'
              else p_ship end
$$;
revoke all on function public.myr_seller_order_state(text, boolean, text) from public, anon, authenticated;

-- 콘솔 주문 탭 — 한 주문은 한 탭에만(2026-11-09) · 교환·환불 → 환불 완료(부분 포함) → 배송 준비 · 배송 중 · 배송 완료
create or replace function public.myr_seller_order_tab(p_state text)
returns text
language sql
immutable
as $$
  select case when p_state like 'claim\_%' then 'claim'
              when p_state in ('refunded', 'partial_refunded') then 'refunded'
              when p_state = 'SHIPPING' then 'shipping'
              when p_state = 'DELIVERED' then 'delivered'
              else 'prep' end
$$;
revoke all on function public.myr_seller_order_tab(text) from public, anon, authenticated;

-- 콘솔 상품 — 탭(판매 중 · 심사 중 · 임시저장 · 종료 · 수정 심사 중인 판매 상품은 판매 중과 심사 중 둘 다) · 홈 개수 · 메뉴 · 바로 심사 결과 · 수정 화면
--   메뉴: draft 이어서 작성 · 삭제 / rejected 심사 결과 / listed (수정 · 수정 반려면 심사 결과 · 수정 심사 중이면 없음) + 공구 링크 / paused 수정(같은 규칙)
--   수정 화면: draft new · rejected fix_new · 판매 중 · 일시중지(심사 통과) — 수정본 없음 edit · 수정 반려 fix_rev · 그 밖 null(목록으로)
create or replace function public.myr_seller_product_console(p public.myr_products, p_rev_status text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'tabs', to_jsonb(array_remove(array[
              case when public.myr_product_status_approved(p.status) then 'live' end,
              case when p.status in ('pending', 'rejected') or p_rev_status is not null then 'review' end,
              case when p.status = 'draft' then 'draft' end,
              case when p.status = 'ended' then 'ended' end], null)),
    'home_live', public.myr_product_listed(p),
    'home_pending', p.status in ('pending', 'rejected', 'draft') or p_rev_status is not null,
    'actions', to_jsonb(case
              when p.status = 'draft' then array['continue', 'delete']
              when p.status = 'rejected' then array['review']
              when public.myr_product_status_approved(p.status) then
                (case p_rev_status when 'pending' then array[]::text[] when 'rejected' then array['review'] else array['revise'] end)
                || case when public.myr_product_listed(p) then array['groupbuy'] else array[]::text[] end
              else array[]::text[] end),
    'opens_review', p.status = 'rejected' or (coalesce(p_rev_status = 'rejected', false) and not public.myr_product_listed(p)),
    'edit_mode', case
              when p.status = 'draft' then 'new'
              when p.status = 'rejected' then 'fix_new'
              when public.myr_product_status_approved(p.status) and p_rev_status = 'rejected' then 'fix_rev'
              when public.myr_product_status_approved(p.status) and p_rev_status is null then 'edit' end)
$$;
revoke all on function public.myr_seller_product_console(public.myr_products, text) from public, anon, authenticated;

-- CS 비율(%) — 환불이 생긴 주문 ÷ 주문 × 100 · 소수 첫째 자리 · 주문이 없으면 null(2026-11-06 대표 결정 · 환불 기준)
create or replace function public.myr_cs_rate(p_refunded integer, p_orders integer)
returns numeric
language sql
immutable
as $$
  select case when coalesce(p_orders, 0) > 0 then round(coalesce(p_refunded, 0) * 100.0 / p_orders, 1) end
$$;
revoke all on function public.myr_cs_rate(integer, integer) from public, anon, authenticated;

-- ── 2. 판정을 쓰던 함수 — 식만 위 함수로 · 응답에 칸만 더함 ───────────────

-- 0103 정의 + hold(myr_seller_next_hold_json)
create or replace function public.myr_settle_info_json(s public.sellers)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
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
    'checked_at', s.myr_settle_checked_at,
    -- 0116: 다음 정산 보류 이유(정산 탭 next_hold 와 같은 함수) — 홈 배너가 입력 상태로 다시 판정하지 않는다
    'hold', public.myr_seller_next_hold_json(s.id))
$$;
revoke all on function public.myr_settle_info_json(public.sellers) from public, anon, authenticated;
grant execute on function public.myr_settle_info_json(public.sellers) to service_role;

-- 0114 정의 → next_hold myr_seller_next_hold_json · 달 카드 pct
create or replace function public.myr_app_seller_settlements_of_user(p_user uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'settle_status', s.myr_settle_status,
    -- 다음 정산 보류 이유(크리에이터 쪽 · myr_seller_hold_reason) — 배너 · 다음 정산 상태
    'next_hold', public.myr_seller_next_hold_json(s.id),
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
                   -- 0116: 이 달 합계의 정산 비율 — 합계에 들어간 줄의 비율이 하나면 그 값(설정이 바뀐 달이 섞이면 null · 화면은 "정산금"만)
                   'pct', public.myr_settlement_card_pct(array_agg(x.pct) filter (where x.counted)),
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

-- 0110 정의 + pct(myr_settlement_pct)
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
    -- 0116: 지금 정산 비율(platform_settings myr_settlement · 예상 줄과 같은 값) — 화면 "정산금 (N%)"
    'pct', public.myr_settlement_pct(),
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
                     where i.seller_id = p_seller and public.myr_line_paid(o, i)
                       and public.myr_line_live(i) and i.delivered_at is null));
end;
$$;
revoke all on function public.myr_settlement_preview(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_settlement_preview(uuid, timestamptz) to service_role;

-- 0078 정의 → myr_claim_waiting
create or replace function public.myr_refund_request_step(r public.myr_refund_requests)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when public.myr_claim_waiting(r) then 'decide'
    when r.status <> 'progress' then null
    when r.needs_collect and r.collected_at is null then 'collect'
    when r.needs_refund and r.refunded_at is null then 'refund'
    when r.needs_reship and r.reshipped_at is null then 'reship'
    else null end
$$;
revoke all on function public.myr_refund_request_step(public.myr_refund_requests) from public, anon, authenticated;

-- 0105 정의 → 결정할 수 있는 요청 myr_claim_waiting(NOT_PENDING 그대로)
create or replace function public.myr_app_claim_decide(p_code text, p_user uuid, p_decision text, p_resolution text, p_message text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  r      public.myr_refund_requests%rowtype;
  v_msg  text := nullif(btrim(coalesce(p_message, '')), '');
begin
  select r2.* into r from public.myr_refund_requests r2 join public.sellers s on s.id = r2.seller_id
   where s.user_id = p_user and r2.code = lower(btrim(coalesce(p_code, ''))) for update of r2;
  if not found or p_user is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not public.myr_claim_waiting(r) then return jsonb_build_object('ok', false, 'code', 'NOT_PENDING', 'status', r.status); end if;
  -- 같은 묶음의 다른 요청을 동시에 승인해도 배송비가 두 번 빠지지 않게 묶음을 잠근다
  perform 1 from public.myr_refund_requests q where q.batch = r.batch for update;
  if p_decision is null or p_decision not in ('approve','reject') then return jsonb_build_object('ok', false, 'code', 'BAD_DECISION'); end if;
  -- 승인은 메시지 선택(비우면 null · 메일은 결과 · 다음 단계만) · 반려는 사유를 고객에게 알려야 하니 필수 · 둘 다 1000자까지
  if (p_decision = 'reject' and v_msg is null) or length(coalesce(v_msg, '')) > 1000 then return jsonb_build_object('ok', false, 'code', 'BAD_MESSAGE'); end if;

  if p_decision = 'reject' then
    update public.myr_refund_requests set status = 'rejected', message = v_msg, decided_at = now(), decided_by = p_user, done_at = now() where id = r.id
      returning * into r;
    return jsonb_build_object('ok', true, 'request', public.myr_refund_request_json(r), 'refund_now', false);
  end if;

  if p_resolution is null or not (p_resolution = any (public.myr_refund_request_options(r.kind, r.reason))) then
    return jsonb_build_object('ok', false, 'code', 'BAD_RESOLUTION');
  end if;
  -- 차감 뒤 0원 이하가 되면 부분 환불은 안 된다 — 콘솔 선택지(option_deductions null)와 같은 함수
  if public.myr_claim_option_blocked(r, p_resolution) then return jsonb_build_object('ok', false, 'code', 'BAD_RESOLUTION'); end if;

  update public.myr_refund_requests
     set status = 'progress', resolution = p_resolution, message = v_msg, decided_at = now(), decided_by = p_user,
         needs_refund  = public.myr_claim_resolution_refunds(p_resolution),
         needs_reship  = p_resolution in ('reship','reship_collect'),
         -- 파손 · 누액은 회수 없이(사진으로 확인) · 단순 변심 · 오배송 환불과 회수 후 재발송은 회수
         needs_collect = public.myr_claim_resolution_collects(p_resolution, r.reason),
         deduction     = public.myr_claim_option_deduction(r, p_resolution)
   where id = r.id
   returning * into r;
  return jsonb_build_object('ok', true, 'request', public.myr_refund_request_json(r), 'refund_now', public.myr_refund_request_step(r) = 'refund');
end;
$$;
revoke all on function public.myr_app_claim_decide(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_claim_decide(text, uuid, text, text, text) to service_role;

-- 0078 정의 → 순서 myr_claim_waiting
create or replace function public.myr_app_seller_claims_of_user(p_user uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select jsonb_agg(public.myr_refund_request_json(r) order by public.myr_claim_waiting(r) desc, (r.status = 'progress') desc, r.created_at desc)
      from (select r.* from public.myr_refund_requests r join public.sellers s on s.id = r.seller_id
             where s.user_id = p_user order by public.myr_claim_waiting(r) desc, (r.status = 'progress') desc, r.created_at desc limit 200) r
  ), '[]'::jsonb)
$$;
revoke all on function public.myr_app_seller_claims_of_user(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_claims_of_user(uuid) to service_role;

-- 0078 정의 → myr_claim_waiting
create or replace function public.myr_app_seller_claims_waiting_of_user(p_user uuid)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select count(*)::int from public.myr_refund_requests r join public.sellers s on s.id = r.seller_id
   where s.user_id = p_user and public.myr_claim_waiting(r)
$$;
revoke all on function public.myr_app_seller_claims_waiting_of_user(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_claims_waiting_of_user(uuid) to service_role;

-- 0105 정의 + waiting · due
create or replace function public.myr_refund_request_json(r public.myr_refund_requests)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id, 'code', r.code, 'status', r.status, 'open', public.myr_claim_status_open(r.status), 'step', public.myr_refund_request_step(r),
    -- 0116: 크리에이터 답변을 기다리는지 · 답변 기한(설정 myr_claim_answer · 기다릴 때만) — 콘솔 탭 · 대기 수 · 기한 문구가 상태 · 날짜로 다시 판정하지 않는다
    'waiting', public.myr_claim_waiting(r), 'due', public.myr_claim_due_json(r, now()),
    'kind', r.kind, 'reason', r.reason, 'qty', r.qty, 'note', r.note, 'photos', to_jsonb(r.photos),
    'options', to_jsonb(public.myr_refund_request_options(r.kind, r.reason)),
    -- 처리 방법마다 회수가 필요한가(승인과 같은 함수) — 콘솔 처리 방법 안내가 사유로 다시 판정하지 않는다
    'option_collects', coalesce((select jsonb_object_agg(x, public.myr_claim_resolution_collects(x, r.reason)) from unnest(public.myr_refund_request_options(r.kind, r.reason)) x), '{}'::jsonb),
    -- 0105: 환불이 나가는 처리마다 뺄 왕복 배송비(승인과 같은 함수) · 차감 뒤 0원 이하라 고를 수 없으면 null — 콘솔 예상 금액 · 선택지가 처리 방법으로 다시 판정하지 않는다
    'option_deductions', coalesce((select jsonb_object_agg(x, case when public.myr_claim_option_blocked(r, x) then null else public.myr_claim_option_deduction(r, x) end)
                                     from unnest(public.myr_refund_request_options(r.kind, r.reason)) x where public.myr_claim_resolution_refunds(x)), '{}'::jsonb),
    'resolution', r.resolution, 'message', r.message, 'decided_at', r.decided_at,
    'needs_collect', r.needs_collect, 'collected_at', r.collected_at,
    'needs_reship', r.needs_reship, 'reship_courier', r.reship_courier, 'reship_tracking_no', r.reship_tracking_no, 'reshipped_at', r.reshipped_at,
    'needs_refund', r.needs_refund, 'deduction', r.deduction, 'return_fee', public.myr_refund_request_fee_due(r),
    'refund_amount', r.refund_amount, 'refunded_at', r.refunded_at, 'done_at', r.done_at, 'created_at', r.created_at,
    'amount', public.myr_line_amount(i.unit_price, r.qty),
    -- 환불이 끝난 요청을 결제 기준으로 — 결제 금액(상품 + 함께 돌려준 처음 배송비) = 환불액 + 차감 · 환불 전이면 refund_paid null · shipping_back 0
    'refund_paid', public.myr_claim_refund_paid(r),
    'shipping_back', greatest(public.myr_claim_refund_paid(r) - public.myr_line_amount(i.unit_price, r.qty), 0),
    'buyer_name', o.buyer_name,
    'buyer_phone', case when length(regexp_replace(coalesce(o.buyer_phone, o.shipping ->> 'phone', ''), '\D', '', 'g')) >= 10
                        then left(regexp_replace(coalesce(o.buyer_phone, o.shipping ->> 'phone'), '\D', '', 'g'), 3) || '-****-' || right(regexp_replace(coalesce(o.buyer_phone, o.shipping ->> 'phone'), '\D', '', 'g'), 4)
                        else null end,
    'order', jsonb_build_object('id', o.id, 'code', o.code, 'status', o.status, 'paid_at', o.paid_at, 'is_member', o.user_id is not null,
                                'shipping_fee', o.shipping_fee,
                                'item', jsonb_build_object('id', i.id, 'name', i.product_name, 'option', i.option_name, 'qty', i.qty, 'unit_price', i.unit_price, 'amount', i.amount,
                                                           'refunded_qty', i.refunded_qty, 'status', i.status, 'ship_status', i.ship_status,
                                                           'courier', i.courier, 'tracking_no', i.tracking_no,
                                                           'shipped_at', i.shipped_at, 'delivered_at', i.delivered_at),
                                -- 같은 주문에서 같은 크리에이터의 다른 줄(요청이 걸리지 않은 상품 포함) — 콘솔 "주문 · 배송" 칸의 "함께 주문한 상품".
                                --   다른 크리에이터 줄은 싣지 않는다(콘솔 주문 탭과 같은 범위) · 남은 수량 · 살아 있는 줄 · 열린 요청은 기존 판정 함수 값
                                'others', coalesce((select jsonb_agg(jsonb_build_object(
                                                     'id', x.id, 'name', x.product_name, 'option', x.option_name, 'qty', x.qty, 'amount', x.amount,
                                                     'refunded_qty', x.refunded_qty, 'has_refund', public.myr_line_has_refund(x), 'status', x.status, 'ship_status', x.ship_status,
                                                     'left_qty', public.myr_line_left(x), 'live', public.myr_line_live(x), 'delivered_at', x.delivered_at,
                                                     'claim', public.myr_line_open_claim(x))
                                                   order by x.created_at, x.id)
                                                     from public.myr_order_items x
                                                    where x.order_id = o.id and x.seller_id = r.seller_id and x.id <> r.order_item_id), '[]'::jsonb)),
    'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = r.product_id),
    'seller', (select jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle) from public.sellers s where s.id = r.seller_id))
    from public.myr_orders o
    join public.myr_order_items i on i.id = r.order_item_id
   where o.id = r.order_id
$$;
revoke all on function public.myr_refund_request_json(public.myr_refund_requests) from public, anon, authenticated;
grant execute on function public.myr_refund_request_json(public.myr_refund_requests) to service_role;

-- 0063 정의 → 순서 myr_cs_waiting
create or replace function public.myr_app_cs_list(p_actor text, p_actor_id uuid default null, p_status text default null)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select coalesce((select jsonb_agg(public.myr_cs_conversation_json(x) order by public.myr_cs_waiting(x) desc, (x.status = 'ANSWERED') desc, x.last_message_at desc)
                     from (select * from public.myr_cs_conversations c
                            where (p_status is null or c.status = p_status)
                              and case p_actor
                                    when 'customer' then (p_actor_id is not null and c.user_id = p_actor_id)
                                    when 'seller'   then (p_actor_id is not null and c.seller_id = p_actor_id)
                                    when 'admin'    then true
                                    else false
                                  end
                            order by public.myr_cs_waiting(c) desc, (c.status = 'ANSWERED') desc, c.last_message_at desc
                            limit 200) x), '[]'::jsonb)
$$;
revoke all on function public.myr_app_cs_list(text, uuid, text) from public, anon, authenticated;
grant execute on function public.myr_app_cs_list(text, uuid, text) to service_role;

-- 0075 정의 → myr_cs_waiting
create or replace function public.myr_app_seller_cs_waiting_of_user(p_user uuid)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select count(*)::integer
    from public.myr_cs_conversations c
    join public.sellers s on s.id = c.seller_id
   where s.user_id = p_user and public.myr_cs_waiting(c)
$$;
revoke all on function public.myr_app_seller_cs_waiting_of_user(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_cs_waiting_of_user(uuid) to service_role;

-- 0077 정의 + waiting
create or replace function public.myr_cs_conversation_json(x public.myr_cs_conversations)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', x.id, 'code', x.code, 'status', x.status, 'type', x.type,
    -- 0116: 답변을 기다리는지(대기 수 myr_app_seller_cs_waiting_of_user 와 같은 함수)
    'waiting', public.myr_cs_waiting(x),
    'buyer_name', x.buyer_name, 'order_code', x.order_code, 'order_id', x.order_id,
    'order', (select jsonb_build_object('code', o.code, 'status', o.status, 'courier', i.courier, 'tracking_no', i.tracking_no,
                                        'shipped_at', i.shipped_at, 'delivered_at', i.delivered_at, 'paid_at', o.paid_at,
                                        'item', case when i.id is null then null
                                                     else jsonb_build_object('id', i.id, 'name', i.product_name, 'option', i.option_name, 'qty', i.qty,
                                                                             'amount', i.amount, 'status', i.status, 'refunded_qty', i.refunded_qty,
                                                                             'ship_status', i.ship_status, 'courier', i.courier, 'tracking_no', i.tracking_no,
                                                                             'shipped_at', i.shipped_at, 'delivered_at', i.delivered_at) end)
                from public.myr_orders o
                left join public.myr_order_items i on i.id = x.order_item_id and i.order_id = o.id
               where o.id = x.order_id),
    'is_member', x.user_id is not null,
    'last_preview', x.last_preview, 'last_message_at', x.last_message_at,
    'replied_at', x.replied_at, 'closed_at', x.closed_at, 'created_at', x.created_at,
    'message_count', (select count(*) from public.myr_cs_messages m where m.conversation_id = x.id),
    'first_body', (select left(m.body, 200) from public.myr_cs_messages m where m.conversation_id = x.id order by m.created_at, m.id limit 1),
    'answer', (select jsonb_build_object('id', m.id, 'body', left(m.body, 300), 'created_at', m.created_at)
                 from public.myr_cs_messages m where m.conversation_id = x.id and m.sender = 'seller' order by m.created_at desc, m.id desc limit 1),
    'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url, 'status', p.status)
                  from public.myr_products p where p.id = x.product_id),
    'seller', (select jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle) from public.sellers s where s.id = x.seller_id))
$$;
revoke all on function public.myr_cs_conversation_json(public.myr_cs_conversations) from public, anon, authenticated;
grant execute on function public.myr_cs_conversation_json(public.myr_cs_conversations) to service_role;

-- 0100 정의 + claim_status · state · tab
create or replace function public.myr_app_seller_orders(p_seller uuid, p_limit integer default 200)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', o.id, 'code', o.code, 'status', o.status, 'paid_at', o.paid_at,
             'buyer', public.myr_mask_name(o.buyer_name),
             -- 내 줄의 배송 상태 · 금액 — 화면이 줄을 다시 훑어 계산하지 않는다
             'ship_status', public.myr_order_ship_status(o.id, p_seller),
             -- 0116: 내 줄의 열린 요청 상태 · 주문 상태(칩) · 탭 — 화면이 줄을 훑어 순위를 다시 정하지 않는다(우선순위 요청 → 환불 → 배송)
             'claim_status', public.myr_order_claim_status(o.id, p_seller),
             'state', st.v, 'tab', public.myr_seller_order_tab(st.v),
             'amounts', (select jsonb_build_object('paid', coalesce(sum(i.amount), 0), 'refunded', coalesce(sum(i.refund_amount), 0),
                                                  'net', coalesce(sum(public.myr_line_net(i)), 0))
                           from public.myr_order_items i where i.order_id = o.id and i.seller_id = p_seller),
             'items', (select jsonb_agg(jsonb_build_object(
                         'id', i.id, 'name', i.product_name, 'option', i.option_name, 'qty', i.qty, 'unit_price', i.unit_price, 'amount', i.amount,
                         'status', i.status, 'refunded_qty', i.refunded_qty, 'refund_amount', i.refund_amount, 'has_refund', public.myr_line_has_refund(i),
                         'left_qty', public.myr_line_left(i), 'live', public.myr_line_live(i),
                         'ship_status', i.ship_status, 'courier', i.courier, 'tracking_no', i.tracking_no, 'shipped_at', i.shipped_at, 'delivered_at', i.delivered_at,
                         'groupbuy', i.groupbuy_id is not null,
                         'product', (select jsonb_build_object('code', p.code, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = i.product_id),
                         'claim', public.myr_line_open_claim(i))
                       order by i.created_at, i.id)
                       from public.myr_order_items i where i.order_id = o.id and i.seller_id = p_seller))
           order by o.paid_at desc, o.code desc)
      from (select o.* from public.myr_orders o
             where public.myr_order_status_paid(o.status)
               and exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.seller_id = p_seller)
             order by o.paid_at desc, o.code desc
             limit least(greatest(coalesce(p_limit, 200), 1), 500)) o
      cross join lateral (select public.myr_seller_order_state(public.myr_order_claim_status(o.id, p_seller),
                                                               exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.seller_id = p_seller and public.myr_line_has_refund(i)),
                                                               public.myr_order_ship_status(o.id, p_seller)) as v) st
  ), '[]'::jsonb)
$$;
revoke all on function public.myr_app_seller_orders(uuid, integer) from public, anon, authenticated;
grant execute on function public.myr_app_seller_orders(uuid, integer) to service_role;

-- 0099 정의 + console
create or replace function public.myr_app_seller_products(p_seller uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'code', p.code, 'name', p.name, 'status', p.status, 'reject_reason', p.reject_reason, 'reject_items', p.reject_items,
           'category', p.category, 'price', p.price, 'option_count', jsonb_array_length(p.options),
           'stock', p.stock, 'sold_qty', p.sold_qty, 'stock_left', public.myr_product_left(p), 'sold_out', public.myr_product_sold_out(p),
           'editable', public.myr_product_status_editable(p.status), 'approved', public.myr_product_status_approved(p.status),
           -- 0116: 콘솔 탭 · 홈 개수 · 메뉴 · 바로 심사 결과 · 수정 화면 — 상태 · 수정본 상태로 한 곳에서
           'console', public.myr_seller_product_console(p, rv.status),
           'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url,
           'submitted_at', p.submitted_at, 'reviewed_at', p.reviewed_at, 'created_at', p.created_at, 'updated_at', p.updated_at,
           'revision', case when rv.id is null then null
                            else jsonb_build_object('status', rv.status, 'reject_reason', rv.reject_reason, 'reject_items', rv.reject_items, 'submitted_at', rv.submitted_at, 'reviewed_at', rv.reviewed_at) end
         ) order by p.updated_at desc, p.created_at desc), '[]'::jsonb)
    from public.myr_products p
    left join lateral public.myr_product_open_revision(p.id) rv on true
   where p.seller_id = p_seller
     and p.deleted_at is null
$$;
revoke all on function public.myr_app_seller_products(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_products(uuid) to service_role;

-- 0099 정의 + console
create or replace function public.myr_app_seller_product(p_seller uuid, p_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  p  public.myr_products%rowtype;
  rv public.myr_product_revisions%rowtype;
begin
  select * into p from public.myr_products where id = p_id and seller_id = p_seller and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  rv := public.myr_product_open_revision(p.id);
  return jsonb_build_object('ok', true, 'product', public.myr_seller_product_json(p),
    -- 0116: 수정 화면(새로 · 반려 고치기 · 수정 · 수정 반려 고치기)은 목록과 같은 함수
    'console', public.myr_seller_product_console(p, rv.status),
    'revision', case when rv.id is null then null
                     else jsonb_build_object('id', rv.id, 'status', rv.status, 'reject_reason', rv.reject_reason, 'reject_items', rv.reject_items, 'submitted_at', rv.submitted_at, 'reviewed_at', rv.reviewed_at, 'fields', rv.fields) end);
end;
$$;
revoke all on function public.myr_app_seller_product(uuid, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_product(uuid, uuid) to service_role;

-- 0100 정의 + cs_rate
create or replace function public.myr_app_seller_sales(p_seller uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  with b as (
    select date_trunc('month', p_now at time zone 'Asia/Seoul') as m0,
           date_trunc('day', p_now at time zone 'Asia/Seoul') as d0
  ),
  lines as (
    select l.order_id, l.qty, l.refunded_qty, l.left_qty, l.amount, l.refund_amount, l.net, l.has_refund,
           (l.paid_at at time zone 'Asia/Seoul') as paid_kst
      from public.myr_sales_lines() l
     where l.seller_id = p_seller
  ),
  m as (select l.* from lines l, b where l.paid_kst >= b.m0 and l.paid_kst < b.m0 + interval '1 month'),
  w as (select l.* from lines l, b where l.paid_kst >= b.d0 - interval '6 days' and l.paid_kst < b.d0 + interval '1 day')
  select jsonb_build_object(
    'month', to_char(b.m0, 'YYYY-MM'),
    'gross', coalesce((select sum(amount) from m), 0),
    'refunds', coalesce((select sum(refund_amount) from m), 0),
    'net', coalesce((select sum(net) from m), 0),
    'orders', (select count(distinct order_id) from m),
    'units', coalesce((select sum(left_qty) from m), 0),
    'refunded_orders', (select count(distinct order_id) from m where has_refund),
    -- 0116: CS 비율(환불이 생긴 주문 ÷ 주문 · 소수 첫째 자리 · 주문이 없으면 null)
    'cs_rate', public.myr_cs_rate((select count(distinct order_id) from m where has_refund)::int, (select count(distinct order_id) from m)::int),
    'week', (select jsonb_agg(jsonb_build_object('date', to_char(d, 'YYYY-MM-DD'),
                                                 'orders', (select count(distinct w.order_id) from w where date_trunc('day', w.paid_kst) = d))
                              order by d)
               from generate_series(b.d0 - interval '6 days', b.d0, interval '1 day') d)
  )
  from b
$$;
revoke all on function public.myr_app_seller_sales(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_sales(uuid, timestamptz) to service_role;
