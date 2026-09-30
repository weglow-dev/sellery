-- ============================================================================================
-- 0028_sample_refund_promise.sql — 샘플 구매액 환급을 구매 시점 약속으로 판정
--
-- 배경: 환급 옵션(`products.sample_refund`)이 켜진 상품의 샘플을 사면 인플루언서에게
--   "판매 확정 시 구매액 환급" 이 안내되고 `sample_purchased` 이벤트 payload 에 `refund` 가 기록된다(0012:491).
--   그런데 정산(`app_admin_settle_preview` 0023:171)은 **정산하는 날의 상품 설정**을 읽었다.
--   샘플 정책은 잠금 대상이 아니라(0015 LOCKED_FIELD 는 가격·요율·옵션만) 브랜드가 구매 뒤에 옵션을 끄면
--   약속된 환급이 사라지고, 반대로 켜면 약속하지 않은 환급이 나갔다. 데모(`runSettle` spOf(p).refund)도 같다.
--
-- 변경: 환급 조건 한 곳만 — 구매 시점 약속(`sample_purchased` payload.refund · 시드는 refundable)을 보고,
--   이벤트가 없는 옛 데이터만 지금 상품 설정을 본다. 환급액 · 재원 배분(0023, 운영 결정 2026-09-28)은 그대로다.
--   나머지 본문은 0023 과 한 글자도 다르지 않다.
--
-- `app_admin_settle_run`(0020)이 이 함수를 호출하므로 미리보기 · 실행 · 매출·순수익(0022) 이 모두 따라온다.
-- security definer · service_role 전용 · `{ok, code}` 반환(0010~0023 관례).
-- ============================================================================================

create or replace function public.app_admin_settle_preview(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  c            public.campaigns%rowtype;
  s            public.sellers%rowtype;
  b            public.brands%rowtype;
  p            public.products%rowtype;
  st           public.settlements%rowtype;
  v_today      date := (now() at time zone 'Asia/Seoul')::date;
  v_pg         numeric := 0.019;
  v_platform   numeric := 0.10;
  v_wht        numeric := 0.033;
  v_ref_boost  numeric := 0.01;
  v_ref_rate   numeric := 0.02;
  v_ref_times  integer := 5;
  v_bref_disc  numeric := 0.01;
  v_bref_rate  numeric := 0.01;
  v_bref_times integer := 3;
  v_cel_won    integer := 20000;
  v_clear_days integer;
  v_rate       numeric;
  v_sgrade     text;
  v_bonus_pp   numeric := 0;
  v_bgrade     text;
  v_bdisc_rate numeric := 0;
  v_wht_eff    numeric;
  v_ref_applied  boolean;
  v_bref_applied boolean;
  v_paid_count   integer;
  v_refund_count integer;
  v_gross      numeric;
  v_refunds    numeric;
  v_partial    numeric;
  v_net        numeric;
  v_sample_net numeric;
  v_base       numeric;
  v_pgf numeric; v_sf numeric; v_gb numeric; v_boost numeric; v_reward numeric; v_bboost numeric; v_breward numeric; v_bdisc numeric;
  v_pfg numeric; v_costs numeric; v_pf numeric; v_vat numeric; v_pfnet numeric; v_sf_total numeric; v_wht_amt numeric; v_brand_pay numeric; v_seller_pay numeric;
  v_ref_cel    integer := 0;
  v_ref_cash   integer := 0;
  v_ref_brand  numeric := 0;   -- 환급 재원 중 브랜드가 반환하는 몫
  v_ref_plat   numeric := 0;   -- 환급 재원 중 플랫폼이 포기하는 수수료
  v_ref_pg     numeric := 0;   -- 회수 불가(카드사) — 플랫폼 부담. 차감하지 않고 기록만 한다
  v_refund_promised boolean;  -- 0028: 샘플 구매 시점에 약속된 환급 여부
  v_hold_s     text;
  v_hold_b     text;
  v_due        date;
  v_eligible   boolean;
  v_reason     text;
begin
  select * into c from public.campaigns where id = p_campaign_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if c.status = 'SETTLED' then
    select * into st from public.settlements where campaign_id = c.id;
    if not found then
      return jsonb_build_object('ok', true, 'source', 'none', 'campaign_id', c.id, 'campaign_code', c.code, 'campaign_status', c.status,
                                'settled_at', c.settled_at, 'eligible', false, 'reason', 'NO_SNAPSHOT');
    end if;
    return jsonb_build_object('ok', true) || public.admin_settlement_json(st);
  end if;
  if c.status not in ('LIVE', 'CLEARING') then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;

  select * into s from public.sellers  where id = c.seller_id;
  select * into b from public.brands   where id = c.brand_id;
  select * into p from public.products where id = c.product_id;

  v_pg := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'pg_rate'), v_pg);
  v_platform := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'platform_rate'), v_platform);
  v_wht := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'wht_rate'), v_wht);
  v_ref_boost := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'ref_boost'), v_ref_boost);
  v_ref_rate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'ref_rate'), v_ref_rate);
  v_ref_times := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'ref_times'), v_ref_times);
  v_bref_disc := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'brand_ref_disc'), v_bref_disc);
  v_bref_rate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'brand_ref_rate'), v_bref_rate);
  v_bref_times := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'brand_ref_times'), v_bref_times);
  v_cel_won := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'sample_cel_won'), v_cel_won);
  v_clear_days := public.platform_clear_days();

  v_rate   := coalesce(c.rate_locked, p.commission_rate, 0);
  v_sgrade := coalesce(s.grade, public.grade_for_sales(s.m3_sales));
  select coalesce(gt.bonus_pp, 0) into v_bonus_pp from public.grade_tiers gt where gt.name = v_sgrade;
  v_bonus_pp := coalesce(v_bonus_pp, 0);
  v_bgrade := public.brand_grade_for_gmv(public.brand_gmv(b.id));
  select coalesce(gt.fee_discount, 0) into v_bdisc_rate from public.brand_grade_tiers gt where gt.name = v_bgrade;
  v_bdisc_rate := coalesce(v_bdisc_rate, 0);
  v_wht_eff := case when s.settle_type = 'biz' then 0 else v_wht end;

  -- isRefBoost / isBrandRefBoost — 생성일순 첫 N 회 (0013 · 0019 와 같은 창)
  select (s.referred_by is not null and d.rn <= v_ref_times) into v_ref_applied
    from (select x.id, row_number() over (order by x.created_at, x.id) as rn
            from public.campaigns x where x.seller_id = s.id and x.status in ('LIVE','CLEARING','SETTLED')) d
   where d.id = c.id;
  v_ref_applied := coalesce(v_ref_applied, false);
  select (b.referred_by is not null and d.rn <= v_bref_times) into v_bref_applied
    from (select x.id, row_number() over (order by x.created_at, x.id) as rn
            from public.campaigns x where x.brand_id = b.id and x.status in ('LIVE','CLEARING','SETTLED')) d
   where d.id = c.id;
  v_bref_applied := coalesce(v_bref_applied, false);

  -- 주문 집계 (calc: gross = ≠CANCELED · refund = REFUNDED · + 토스 부분취소분(PAID & refund_amount>0))
  select count(*) filter (where o.status = 'PAID'),
         count(*) filter (where o.status = 'REFUNDED'),
         coalesce(sum(o.amount) filter (where o.status <> 'CANCELED'), 0),
         coalesce(sum(o.amount) filter (where o.status = 'REFUNDED'), 0),
         coalesce(sum(o.refund_amount) filter (where o.status = 'PAID' and coalesce(o.refund_amount, 0) > 0), 0),
         coalesce(sum(o.amount) filter (where o.status = 'PAID' and o.is_sample), 0)
    into v_paid_count, v_refund_count, v_gross, v_refunds, v_partial, v_sample_net
    from public.orders o where o.campaign_id = c.id;
  v_refunds := v_refunds + v_partial;
  v_net  := v_gross - v_refunds;
  v_base := v_net - v_sample_net;

  v_pgf     := v_net * v_pg;
  v_sf      := v_base * v_rate;
  v_gb      := v_base * v_bonus_pp / 100;
  v_boost   := case when v_ref_applied  then v_net * v_ref_boost else 0 end;
  v_reward  := case when v_ref_applied  then v_net * v_ref_rate  else 0 end;
  v_bboost  := case when v_bref_applied then v_net * v_bref_disc else 0 end;
  v_breward := case when v_bref_applied then v_net * v_bref_rate else 0 end;
  v_bdisc   := v_net * v_bdisc_rate;
  v_pfg     := v_net * v_platform;
  v_costs   := v_gb + v_boost + v_reward + v_bboost + v_breward + v_bdisc;
  v_pf      := v_pfg - v_costs;
  v_sf_total := v_sf + v_gb + v_boost;
  v_wht_amt  := v_sf_total * v_wht_eff;
  v_brand_pay := v_net - v_pgf - v_sf - v_pfg + v_bboost + v_bdisc;

  -- 샘플 구매 환급(§9 refund 옵션) — 실행 시 1회
  -- 0028: 환급 여부는 **구매 시점의 약속**으로 판정한다(지금 상품 설정이 아니다).
  --   구매 확정(0012 app_partner_payment_confirm)이 같은 트랜잭션에서 남긴 sample_purchased 이벤트의 payload.refund
  --   (시드는 payload.refundable). 이벤트가 없는 옛 데이터만 지금 상품 설정을 본다.
  select coalesce((e.payload ->> 'refund')::boolean, (e.payload ->> 'refundable')::boolean)
    into v_refund_promised
    from public.campaign_events e
   where e.campaign_id = c.id and e.event_type = 'sample_purchased'
   order by e.created_at desc
   limit 1;
  v_refund_promised := coalesce(v_refund_promised, p.sample_refund, false);
  if v_refund_promised and c.purchased and not c.sample_refunded then
    v_ref_cel  := coalesce(c.sample_cel, 0);
    v_ref_cash := coalesce(c.sample_cash, 0);
  end if;

  -- ── 0023: 환급 재원을 각자 몫에서 차감한다 (운영 결정 2026-09-28) ──
  -- 인플루언서에게는 낸 현금 전액(v_ref_cash)을 돌려준다. 그 재원은 같은 정산 안에서
  -- **지급 전에** 브랜드 몫과 플랫폼 수수료에서 뺀다(이미 받은 돈을 회수하는 것이 아니다 —
  -- 샘플 대금은 판매 정산 때 처음 지급된다). 카드 수수료는 카드사로 나가 회수할 수 없어 플랫폼이 안는다.
  -- 차감액은 **샘플 대금이 각자 몫에 기여한 금액과 같다**(gross 에 샘플 주문이 들어 있다) —
  -- 그래서 차감 후에도 음수가 되지 않는다. 결과는 무상 샘플을 준 것과 같다.
  if v_ref_cash > 0 then
    -- 환급액이 각자 몫에 기여한 만큼만 뺀다 — 위 `v_brand_pay` · `v_pf` 식에 환급액(v_ref_cash)을 대입한 것과 같다.
    --   브랜드 기여 = ref − pg(ref) − 플랫폼(ref) + 추천할인(ref) + 등급할인(ref)   ← bBoost · bDisc 둘 다 브랜드가 받는다
    --   플랫폼 기여 = 플랫폼(ref) − 등급할인(ref) − 추천할인(ref)                    ← costs 에서 이미 빠지는 두 항목
    -- 추천인 보상(bReward)·인플루언서 보너스(gBonus)·부스트는 **플랫폼 부담**이라 환급과 무관하다(차감하지 않는다).
    v_ref_pg    := v_ref_cash * v_pg;
    v_ref_plat  := v_ref_cash * v_platform
                   - (case when v_bref_applied then v_ref_cash * v_bref_disc else 0 end)
                   - v_ref_cash * v_bdisc_rate;
    v_ref_brand := v_ref_cash - v_ref_pg - v_ref_cash * v_platform
                   + (case when v_bref_applied then v_ref_cash * v_bref_disc else 0 end)
                   + v_ref_cash * v_bdisc_rate;
    -- 요율 조합이 바뀌어도 payouts.amount >= 0 (0004) 을 깨지 않게 방어한다
    v_brand_pay := greatest(v_brand_pay - v_ref_brand, 0);
    v_pf        := v_pf - v_ref_plat;
  end if;

  v_vat     := case when v_pf > 0 then v_pf - v_pf / 1.1 else 0 end;
  v_pfnet   := v_pf - v_vat;
  v_seller_pay := v_sf_total - v_wht_amt + v_ref_cash;

  v_hold_s := public.admin_payout_hold_reason('seller', s.id, null);
  v_hold_b := public.admin_payout_hold_reason('brand', null, b.id);
  v_due := case when c.end_date is null then null else c.end_date + v_clear_days end;
  v_eligible := (c.status = 'CLEARING' and v_due is not null and v_due <= v_today);
  v_reason := case when c.status <> 'CLEARING' then 'WRONG_STATUS' when not v_eligible then 'NOT_DUE' else null end;

  return jsonb_build_object(
    'ok', true, 'source', 'live',
    'settlement_id', null,
    'campaign_id', c.id, 'campaign_code', c.code, 'campaign_status', c.status,
    'title', p.name || ' · ' || s.handle,
    'start_date', c.start_date, 'end_date', c.end_date, 'due_on', v_due, 'today', v_today,
    'seller', jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle, 'grade', v_sgrade, 'settle_type', s.settle_type,
                                 'referred_by', s.referred_by, 'has_bank_info', (s.bank_info is not null and coalesce(s.bank_info ->> 'account', '') <> ''),
                                 'has_rrn', (s.rrn_set_at is not null)),
    'brand', jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'grade', v_bgrade, 'referred_by', b.referred_by,
                                'settle_info_complete', public.brand_settle_info_complete(b)),
    'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'emoji', coalesce(p.emoji, '📦'), 'thumb_url', p.thumb_url, 'sample_refund', coalesce(p.sample_refund, false)),
    'paid_count', v_paid_count, 'refund_count', v_refund_count,
    'gross', round(v_gross), 'refunds', round(v_refunds), 'partial_refunds', round(v_partial), 'net', round(v_net), 'sample_net', round(v_sample_net),
    'pg_rate', v_pg, 'platform_rate', v_platform, 'seller_rate', v_rate,
    'seller_grade', v_sgrade, 'seller_bonus_pp', v_bonus_pp, 'brand_grade', v_bgrade, 'brand_discount_rate', v_bdisc_rate,
    'wht_rate', v_wht_eff,
    'ref_boost_applied', v_ref_applied, 'brand_ref_applied', v_bref_applied,
    'ref_boost_rate', case when v_ref_applied then v_ref_boost else 0 end,
    'ref_reward_rate', case when v_ref_applied then v_ref_rate else 0 end,
    'brand_ref_disc_rate', case when v_bref_applied then v_bref_disc else 0 end,
    'brand_ref_reward_rate', case when v_bref_applied then v_bref_rate else 0 end
  ) || jsonb_build_object(
    'pg_fee', round(v_pgf), 'seller_fee', round(v_sf), 'seller_bonus', round(v_gb), 'ref_boost', round(v_boost), 'ref_reward', round(v_reward),
    'brand_ref_boost', round(v_bboost), 'brand_ref_reward', round(v_breward), 'brand_discount', round(v_bdisc),
    'platform_fee_gross', round(v_pfg), 'costs', round(v_costs), 'platform_fee', round(v_pf), 'vat', round(v_vat), 'platform_net', round(v_pfnet),
    'seller_fee_total', round(v_sf_total), 'seller_wht', round(v_wht_amt),
    'sample_refund_cel', v_ref_cel, 'sample_refund_cash', v_ref_cash, 'sample_cel_cover', coalesce(c.sample_cel, 0)::bigint * v_cel_won,
    -- 0023: 환급 재원 내역 (브랜드 반환 · 플랫폼 포기 · 플랫폼이 안는 카드 수수료)
    'sample_refund_brand', round(v_ref_brand), 'sample_refund_platform', round(v_ref_plat), 'sample_refund_pg', round(v_ref_pg),
    'brand_payout', round(v_brand_pay), 'seller_payout', round(v_seller_pay),
    'hold_seller', (v_hold_s is not null), 'hold_brand', (v_hold_b is not null),
    'holds', jsonb_build_object(
      'seller', case when v_hold_s is null then null else jsonb_build_object('code', v_hold_s, 'label', public.admin_hold_label(v_hold_s)) end,
      'brand',  case when v_hold_b is null then null else jsonb_build_object('code', v_hold_b, 'label', public.admin_hold_label(v_hold_b)) end),
    'settlement', null, 'payouts', jsonb_build_object('seller', null, 'brand', null),
    'eligible', v_eligible, 'reason', v_reason
  );
end;
$$;
revoke all on function public.app_admin_settle_preview(uuid) from public, anon, authenticated;
grant execute on function public.app_admin_settle_preview(uuid) to service_role;
