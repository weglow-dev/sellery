-- ============================================================
-- 0110 · MYR "결제된 줄"을 함수 하나로 — 실적 · 정산 대상 · 배송 전 판매 · 정산 탭 상품 목록이 같은 기준 (2026-11-13)
--
--   점검(백엔드 원칙 1): "결제된 줄"을 네 곳이 각자 적었다.
--     정산 대상(myr_settlement_candidates)        paid_at + 결제 상태 + 취소 아님
--     실적(myr_sales_lines)                        paid_at + 결제 상태 (취소 줄 확인 없음)
--     배송 전 판매(myr_settlement_preview)         paid_at + 열린 주문 상태 + 살아 있는 줄
--     정산 탭 상품 목록(myr_app_seller_settlements_of_user)  paid_at + 취소 아님 (결제 상태 확인 없음)
--   지금 데이터에서는 결과가 같다 — 결제 상태면 paid_at 이 있고(표 제약) · 줄 CANCELED 는 주문 전체 취소(입금 전 · 입금 기한)에서만 생기고 ·
--     전액 환불 주문의 줄은 남은 수량이 0 이라 살아 있는 줄이 아니다. 결제된 주문 안에서 줄만 취소하는 기능이 생기면 실적만 그 줄을 세어 정산과 어긋난다.
--   고침:
--     myr_line_paid(o, i)   결제가 끝났고 취소되지 않은 줄 — paid_at · myr_order_status_paid · myr_line_valid
--     네 곳이 이 함수 + 자기 조건(배송 완료 · 마감 · 남은 수량 · 배송 전)을 쓴다
--   그대로 둔 것: 배송 작업 쪽(발주 후보 · 발주 처리 · 송장 · 배송 완료 · 발송 대기 등)의 "열린 주문 + 살아 있는 줄" — "배송 작업 대상 줄"이라는
--     다른 판정이라 따로 묶는다(다음 정리). 발주 후보만 바꾸면 발주 처리(myr_app_admin_mark_prepared)와 식이 갈라진다.
--   계산 결과 — 지금 코드가 만드는 데이터에서는 같다. 바뀌는 것은 "결제된 주문 안의 취소 줄"뿐: 실적(myr_sales_lines)이 그 줄을 세지 않는다(정산과 같아진다).
--     그런 줄을 일부러 넣은 기존 테스트(myr_line_live · 판매 수량 5 → 4)만 기대값이 바뀐다.
--   테스트: supabase/tests/myr_line_paid.test.sql · 기존 실적 · 정산 · 미리보기 테스트
-- ============================================================

create or replace function public.myr_line_paid(o public.myr_orders, i public.myr_order_items)
returns boolean
language sql
stable
as $$
  select o.paid_at is not null and public.myr_order_status_paid(o.status) and public.myr_line_valid(i)
$$;
revoke all on function public.myr_line_paid(public.myr_orders, public.myr_order_items) from public, anon, authenticated;

-- 0100 정의 → myr_line_paid(취소 줄 제외가 더해진다 · 지금 데이터에서 결과 같음 · 반환 모양 그대로)
create or replace function public.myr_sales_lines()
returns table (order_id uuid, seller_id uuid, product_id uuid, groupbuy_id uuid, qty integer, refunded_qty integer, amount integer,
               refund_amount integer, paid_at timestamptz, left_qty integer, net integer, has_refund boolean)
language sql
stable
as $$
  select i.order_id, i.seller_id, i.product_id, i.groupbuy_id, i.qty, i.refunded_qty, i.amount, i.refund_amount, o.paid_at,
         public.myr_line_left(i), public.myr_line_net(i), public.myr_line_has_refund(i)
    from public.myr_order_items i
    join public.myr_orders o on o.id = i.order_id
   where public.myr_line_paid(o, i)
$$;
revoke all on function public.myr_sales_lines() from public, anon, authenticated;

-- 0099 정의 → myr_line_paid
create or replace function public.myr_settlement_candidates(p_end timestamptz, p_seller uuid default null)
returns table (order_item_id uuid, product_id uuid, seller_id uuid, kind text, amount integer, refund_snapshot integer)
language sql
stable
as $$
  select i.id, i.product_id, i.seller_id, 'sale'::text, public.myr_line_net(i), i.refund_amount
    from public.myr_order_items i
    join public.myr_orders o on o.id = i.order_id
   where public.myr_line_paid(o, i) and i.delivered_at is not null and i.delivered_at < p_end
     and (p_seller is null or i.seller_id = p_seller)
     and not exists (select 1 from public.myr_settlement_items s where s.order_item_id = i.id and s.kind = 'sale')
  union all
  -- 환불이 있는 줄만 보고(refund_amount > 0), 스냅샷은 줄마다 한 번 모은다(줄마다 하위 조회하면 정산한 줄이 쌓일수록 느려진다)
  select i.id, i.product_id, i.seller_id, 'refund_adj'::text, i.refund_amount - last.snap, i.refund_amount
    from public.myr_order_items i
    join (select s.order_item_id, max(s.refund_snapshot) as snap from public.myr_settlement_items s group by s.order_item_id) last on last.order_item_id = i.id
   where i.refund_amount > 0 and i.refund_amount > last.snap
     and (p_seller is null or i.seller_id = p_seller)
$$;
revoke all on function public.myr_settlement_candidates(timestamptz, uuid) from public, anon, authenticated;

-- 0106 정의 + 배송 전 판매를 myr_line_paid(열린 주문 상태 → 결제 상태 · 살아 있는 줄이라 같다)
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
                     where i.seller_id = p_seller and public.myr_line_paid(o, i)
                       and public.myr_line_live(i) and i.delivered_at is null));
end;
$$;
revoke all on function public.myr_settlement_preview(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_settlement_preview(uuid, timestamptz) to service_role;

-- 0104 정의 + 상품 목록의 결제된 줄을 myr_line_paid(결제 상태 확인이 더해진다 · 결과 같음)
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
