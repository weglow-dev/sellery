-- ============================================================
-- 0050 — 매출·순수익에 정산 후 환불 반영
--
-- 배경: 정산이 끝난 캠페인에 환불이 들어오면 주문은 `CANCELED` + 이벤트 `refund_needs_adjust` 가
--   된다(0008:544-546 — `REFUNDED` 로 둘 수 없다. 정산 스냅샷이 확정이고 `orders_sample_not_refunded`
--   제약도 있다). 그런데 **관리자 매출·순수익이 그 환불을 전혀 모른다.**
--
--   `admin_campaign_pnl`(0022)은 `status = 'SETTLED'` 면 `settlements` 스냅샷을 그대로 돌려주고
--   (`source: 'snapshot'`), 스냅샷은 지급액의 **계약**이라 바뀌면 안 되는 값이다 — 그 설계는 맞다.
--   문제는 화면이 스냅샷만 보여줘서 고객에게 돌려준 돈이 순매출·순수익에 안 잡히는 것이다.
--
--   실측(정산 후 ₩24,900 환불): 주문은 `CANCELED` · `refund_amount=24,900` 인데
--   `admin_campaign_pnl` 의 `refunds` 는 473,100 그대로, `net` 도 13,221,900 그대로였다.
--
--   라이브 경로(`CLEARING` 등)는 **이미 올바르다** — `gross` 를 `status <> 'CANCELED'` 로 집계해
--   취소분을 애초에 뺀다(0022:110). 고칠 곳은 `SETTLED` 분기뿐이다.
--
-- 고치는 방식
--   `admin_campaign_pnl` 을 **건드리지 않는다.** 0024 샘플 정산이 그 함수의 `brand_payout` 으로
--   실제 지급액을 계산하므로(0024:191 · :299) 스냅샷 값이 그대로여야 한다. 돈 계산(0022 의 라이브
--   분기 ~80줄)을 복사하지도 않는다 — 두 곳이 갈라지면 그게 더 위험하다.
--
--   대신 ① 정산 후 환불만 집계하는 작은 함수를 새로 만들고 ② `app_admin_revenue` 가 캠페인별 손익에
--   그 값을 **덧붙여** 돌려주고 합계에도 반영한다. `net`·`platform_net` 은 그대로 두고 조정값을 따로 준다.
--
--     post_refunds            정산 후 환불 합계
--     post_refund_count       그 건수
--     net_adjusted            net − post_refunds            실제 순매출
--     platform_net_adjusted   platform_net − post_refunds   플랫폼이 흡수한 뒤
--
--   왜 플랫폼이 흡수하나: 스냅샷대로 브랜드·인플루언서 지급액이 확정돼 환불로 줄지 않는다.
--   고객에게 돌려준 돈은 결제 대금에서 나가므로 차액이 플랫폼 몫에서 빠진다.
--   (PG 수수료 환급분은 토스 정산에 따라 달라 1차 근사다 — 정확한 조정은 수동 처리.)
--
-- 조정 **처리**(과지급 회수·다음 정산 차감)는 여기 없다 — 회계 정책 결정이 필요한 별건이다
-- (docs/settlement-policy.md §8 "이미 보낸 뒤의 정정").
-- ============================================================

-- ------------------------------------------------------------
-- campaign_post_settle_refunds(p_campaign_id) — 정산 후 환불 집계
--   `CANCELED` 는 정산 후 환불이거나 샘플 환불이다(0008:544) — 둘 다 스냅샷에 반영될 수 없다.
--   반환: { amount, count }
-- ------------------------------------------------------------
create or replace function public.campaign_post_settle_refunds(p_campaign_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'amount', coalesce(sum(o.refund_amount), 0),
    'count', count(*))
    from public.orders o
   where o.campaign_id = p_campaign_id
     and o.status = 'CANCELED'
     and coalesce(o.refund_amount, 0) > 0
$$;
revoke all on function public.campaign_post_settle_refunds(uuid) from public, anon, authenticated;
grant execute on function public.campaign_post_settle_refunds(uuid) to service_role;

comment on function public.campaign_post_settle_refunds(uuid) is
  '정산 후 환불 합계 (0050) — CANCELED 주문의 refund_amount. 스냅샷에 반영될 수 없는 금액이라 매출 화면이 따로 더한다';

-- ------------------------------------------------------------
-- app_admin_revenue — 0022 본문 **그대로** + 정산 후 환불 조정 3곳만 삽입 (0050)
--   집계 로직(필드 30여 개)을 손으로 옮기지 않았다 — 0022 정의를 복사하고
--   ① 누적 변수 ② 캠페인별 조정 필드 ③ totals 조정 합계만 더했다.
-- ------------------------------------------------------------
create or replace function public.app_admin_revenue()
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_rows        jsonb := '[]'::jsonb;
  r             record;
  j             jsonb;
  v_no_snapshot integer := 0;
  v_scope       integer := 0;
  t             jsonb := jsonb_build_object();
  -- 합계 누산기
  a_gross numeric := 0; a_refunds numeric := 0; a_net numeric := 0; a_sample numeric := 0;
  a_pg numeric := 0; a_sf numeric := 0; a_gb numeric := 0; a_boost numeric := 0; a_reward numeric := 0;
  a_bboost numeric := 0; a_breward numeric := 0; a_bdisc numeric := 0;
  a_pfg numeric := 0; a_costs numeric := 0; a_pf numeric := 0; a_vat numeric := 0; a_pfnet numeric := 0;
  a_sftot numeric := 0; a_brand numeric := 0;
  a_paid integer := 0; a_refund_cnt integer := 0;
  -- 정산 후 환불 (0050) — 스냅샷에 들어갈 수 없는 금액
  a_post numeric := 0; a_post_cnt integer := 0; v_post jsonb;
  -- 셀러리
  v_cel_won   numeric := 0;
  v_cel_cnt   integer := 0;
  v_granted   integer := 0;
  v_earned    integer := 0;
  v_spent     integer := 0;
  v_balance   integer := 0;
  v_cel_cover numeric := 0;
  v_opex      jsonb;
begin
  for r in
    select c.id
      from public.campaigns c
     where c.status in ('LIVE','CLEARING','SETTLED')
        or exists (select 1 from public.orders o where o.campaign_id = c.id and o.status = 'PAID' and o.is_sample)
     order by c.created_at desc, c.id
  loop
    j := public.admin_campaign_pnl(r.id);
    if j is null then
      continue;
    end if;
    v_scope := v_scope + 1;
    -- 정산 후 환불(0050) — `CANCELED` 주문은 스냅샷에 반영될 수 없다(0008:544). 기존 필드는 그대로 두고 조정값만 덧붙인다.
    v_post := public.campaign_post_settle_refunds(r.id);
    if coalesce((v_post ->> 'amount')::numeric, 0) > 0 then
      j := j || jsonb_build_object(
        'post_refunds', (v_post ->> 'amount')::numeric,
        'post_refund_count', (v_post ->> 'count')::integer,
        'net_adjusted', coalesce((j ->> 'net')::numeric, 0) - (v_post ->> 'amount')::numeric,
        'platform_net_adjusted', coalesce((j ->> 'platform_net')::numeric, 0) - (v_post ->> 'amount')::numeric);
      a_post     := a_post     + (v_post ->> 'amount')::numeric;
      a_post_cnt := a_post_cnt + (v_post ->> 'count')::integer;
    end if;

    v_rows := v_rows || jsonb_build_array(j);
    if (j ->> 'source') = 'none' then
      v_no_snapshot := v_no_snapshot + 1;
      continue;
    end if;
    a_gross   := a_gross   + coalesce((j ->> 'gross')::numeric, 0);
    a_refunds := a_refunds + coalesce((j ->> 'refunds')::numeric, 0);
    a_net     := a_net     + coalesce((j ->> 'net')::numeric, 0);
    a_sample  := a_sample  + coalesce((j ->> 'sample_net')::numeric, 0);
    a_pg      := a_pg      + coalesce((j ->> 'pg_fee')::numeric, 0);
    a_sf      := a_sf      + coalesce((j ->> 'seller_fee')::numeric, 0);
    a_gb      := a_gb      + coalesce((j ->> 'seller_bonus')::numeric, 0);
    a_boost   := a_boost   + coalesce((j ->> 'ref_boost')::numeric, 0);
    a_reward  := a_reward  + coalesce((j ->> 'ref_reward')::numeric, 0);
    a_bboost  := a_bboost  + coalesce((j ->> 'brand_ref_boost')::numeric, 0);
    a_breward := a_breward + coalesce((j ->> 'brand_ref_reward')::numeric, 0);
    a_bdisc   := a_bdisc   + coalesce((j ->> 'brand_discount')::numeric, 0);
    a_pfg     := a_pfg     + coalesce((j ->> 'platform_fee_gross')::numeric, 0);
    a_costs   := a_costs   + coalesce((j ->> 'costs')::numeric, 0);
    a_pf      := a_pf      + coalesce((j ->> 'platform_fee')::numeric, 0);
    a_vat     := a_vat     + coalesce((j ->> 'vat')::numeric, 0);
    a_pfnet   := a_pfnet   + coalesce((j ->> 'platform_net')::numeric, 0);
    a_sftot   := a_sftot   + coalesce((j ->> 'seller_fee_total')::numeric, 0);
    a_brand   := a_brand   + coalesce((j ->> 'brand_payout')::numeric, 0);
    a_paid       := a_paid       + coalesce((j ->> 'paid_count')::integer, 0);
    a_refund_cnt := a_refund_cnt + coalesce((j ->> 'refund_count')::integer, 0);
  end loop;

  -- 셀러리 손익 (데모 revenue 8~12행)
  select coalesce(sum(won), 0), count(*) into v_cel_won, v_cel_cnt
    from public.celery_ledger where reason = 'topup' and won is not null;
  select coalesce(sum(delta), 0) into v_granted
    from public.celery_ledger where delta > 0 and reason in ('signup_bonus','onboarding_bonus','admin_grant');
  select coalesce(sum(delta), 0) into v_earned
    from public.celery_ledger where delta > 0 and reason = 'earned';
  select coalesce(-sum(delta), 0) into v_spent
    from public.celery_ledger where delta < 0;
  select coalesce(sum(balance), 0) into v_balance from public.celery_balances;

  -- 🥬 결제분 브랜드 원화 보전 — 전 캠페인(정산 여부 무관 · 데모 revenue 20행)
  select coalesce(sum(coalesce(sample_cel, 0)), 0)
           * coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'sample_cel_won'), 20000)
    into v_cel_cover from public.campaigns;

  select value into v_opex from public.platform_settings where key = 'opex_default';

  t := jsonb_build_object(
    'gross', round(a_gross), 'refunds', round(a_refunds), 'net', round(a_net), 'sample_net', round(a_sample),
    'pg_fee', round(a_pg), 'seller_fee', round(a_sf), 'seller_bonus', round(a_gb),
    'ref_boost', round(a_boost), 'ref_reward', round(a_reward),
    'brand_ref_boost', round(a_bboost), 'brand_ref_reward', round(a_breward), 'brand_discount', round(a_bdisc),
    'platform_fee_gross', round(a_pfg), 'costs', round(a_costs), 'platform_fee', round(a_pf),
    'vat', round(a_vat), 'platform_net', round(a_pfnet), 'seller_fee_total', round(a_sftot),
    'brand_payout', round(a_brand),
    'paid_count', a_paid, 'refund_count', a_refund_cnt,
    -- 정산 후 환불 조정 (0050) — net·platform_net 은 그대로. 플랫폼이 흡수한 뒤 금액을 따로 준다
    'post_refunds', a_post, 'post_refund_count', a_post_cnt,
    'net_adjusted', a_net - a_post, 'platform_net_adjusted', a_pfnet - a_post);

  return jsonb_build_object(
    'ok', true,
    'totals', t,
    'rows', v_rows,
    'counts', jsonb_build_object('campaigns', v_scope, 'no_snapshot', v_no_snapshot),
    'celery', jsonb_build_object(
      'topup_won', round(v_cel_won), 'topup_net', round(v_cel_won / 1.1), 'topup_count', v_cel_cnt,
      'granted', v_granted, 'earned', v_earned, 'spent', v_spent, 'balance', v_balance,
      'cel_won_unit', coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'sample_cel_won'), 20000)),
    'cel_cover', round(v_cel_cover),
    'opex', coalesce(v_opex, '{}'::jsonb));
end;
$$;
