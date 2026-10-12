-- ============================================================
-- 0053 수수료 모델 전환 — "플랫폼 이용 수수료 3% + 3% · 결제 수수료 5%" (대표 결정 2026-10-12)
--
--   전:  브랜드가 제안하는 총 요율 안에 플랫폼 10%p 가 들어 있고(commission_rate = 총 − 10%p), PG 1.9% 는 브랜드 정산에서 차감.
--   후:  브랜드가 제안하는 요율 = **전부 인플루언서 몫**(commission_rate 그대로 · 기존 저장값 의미 불변).
--        플랫폼은 확정 매출 기준으로 따로 받는다(전부 VAT 포함):
--          · 인플루언서 플랫폼 이용 수수료  seller_platform_rate 3%  — 기준액 = net − sample_net (본인 샘플 구매는 제외)
--          · 브랜드 플랫폼 이용 수수료      brand_platform_rate  3%  — net
--          · 브랜드 결제 수수료            payment_fee_rate     5%  — net
--        PG 1.9% 는 **플랫폼 비용**(브랜드 정산에서 빼지 않는다) → platform_net = platform_fee − vat − pg_fee.
--        등급 보너스 · 추천 보상 · 브랜드 등급/추천 할인은 전처럼 플랫폼 몫(costs)에서 낸다. 브랜드 할인은 브랜드가 내는 8% 에서 깎인다.
--
--   계산식(단일 정본 — TS packages/db/src/admin/settle-rules.ts calcSettlement 와 같다):
--     base  = net − sample_net
--     spf   = base × 3%            bpf = net × 3%          pay = net × 5%
--     pfGross = spf + bpf + pay    costs = gBonus + boost + refReward + bBoost + bReward + bDisc
--     pf = pfGross − costs         vat = pf − pf/1.1       platform_net = pf − vat − pg_fee
--     brand_payout  = net − sf − bpf − pay + bBoost + bDisc
--     seller_payout = (sf + gBonus + boost) − wht − spf + sample_refund_cash
--     샘플 환급 재원(0023): 브랜드 반환 = cash − cash×(3%+5%) + 할인분 · 플랫폼 포기 = cash×(3%+5%) − 할인분
--
--   platform_settings: seller_platform_rate · brand_platform_rate · payment_fee_rate 추가, platform_rate 는 합계(0.11)로 갱신(표시·호환용).
--   settlements: seller_platform_fee · brand_platform_fee · payment_fee 컬럼 추가. platform_fee_gross = 세 항목 합.
--   재정의: app_admin_settle_preview(0028) · admin_campaign_pnl(0022) · app_brand_sales · app_brand_settlements(0019)
--           · app_seller_sales · app_seller_settlements(0013) · app_admin_settle_run(0020) · app_admin_settle_sample(0024)
--           · admin_settlement_json(0027) · app_admin_revenue(0050) · app_brand_upsert_product(0015 — total_rate = 인플루언서 요율, 5~100)
--   기존 정산 스냅샷(settlements)은 옛 식 그대로 둔다(지급 계약). 새 컬럼은 0.
-- ============================================================

insert into public.platform_settings (key, value, description) values
  ('seller_platform_rate', '0.03', '인플루언서 플랫폼 이용 수수료율 — (net − sample_net) 기준 · VAT 포함 · 정산 시 차감 (0053)'),
  ('brand_platform_rate',  '0.03', '브랜드 플랫폼 이용 수수료율 — net 기준 · VAT 포함 (0053)'),
  ('payment_fee_rate',     '0.05', '브랜드 결제 수수료율 — net 기준 · VAT 포함 · PG 원가(pg_rate)는 플랫폼 비용 (0053)')
on conflict (key) do update set value = excluded.value, description = excluded.description;
update public.platform_settings
   set value = '0.11', description = '플랫폼 수수료 합계(3% + 3% + 5%) — 표시·호환용. 실제 계산은 seller_platform_rate · brand_platform_rate · payment_fee_rate (0053)'
 where key = 'platform_rate';

alter table public.settlements
  add column if not exists seller_platform_fee bigint not null default 0,
  add column if not exists brand_platform_fee  bigint not null default 0,
  add column if not exists payment_fee         bigint not null default 0;
comment on column public.settlements.seller_platform_fee is '인플루언서 플랫폼 이용 수수료 = (net − sample_net) × seller_platform_rate — seller_payout 에서 차감 (0053)';
comment on column public.settlements.brand_platform_fee  is '브랜드 플랫폼 이용 수수료 = net × brand_platform_rate — brand_payout 에서 차감 (0053)';
comment on column public.settlements.payment_fee         is '브랜드 결제 수수료 = net × payment_fee_rate — brand_payout 에서 차감 · PG 원가는 플랫폼 비용 (0053)';

-- ---------- app_admin_settle_preview (0028 본문 + 0053 수식) ----------
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
  v_platform   numeric := 0.11;
  v_srate      numeric := 0.03;   -- seller_platform_rate (0053)
  v_brate      numeric := 0.03;   -- brand_platform_rate
  v_pay_rate   numeric := 0.05;   -- payment_fee_rate
  v_spf numeric := 0; v_bpf numeric := 0; v_pay numeric := 0;
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
  v_srate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'seller_platform_rate'), v_srate);
  v_brate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'brand_platform_rate'), v_brate);
  v_pay_rate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'payment_fee_rate'), v_pay_rate);
  v_platform := v_srate + v_brate + v_pay_rate;   -- 합계(표시·스냅샷 platform_rate)
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
  -- 0053: 플랫폼 이용 수수료(인플 3% · 브랜드 3%) + 결제 수수료(5%). PG 는 플랫폼 비용이라 브랜드 몫에서 빼지 않는다
  v_spf     := v_base * v_srate;
  v_bpf     := v_net * v_brate;
  v_pay     := v_net * v_pay_rate;
  v_pfg     := v_spf + v_bpf + v_pay;
  v_costs   := v_gb + v_boost + v_reward + v_bboost + v_breward + v_bdisc;
  v_pf      := v_pfg - v_costs;
  v_sf_total := v_sf + v_gb + v_boost;
  v_wht_amt  := v_sf_total * v_wht_eff;
  v_brand_pay := v_net - v_sf - v_bpf - v_pay + v_bboost + v_bdisc;

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
    -- 0053: 샘플 대금에서 브랜드가 받은 몫 = cash − 브랜드 수수료(3%+5%) + 할인 · 플랫폼이 받은 몫 = 브랜드 수수료 − 할인 (PG 는 원래 플랫폼 비용)
    v_ref_plat  := v_ref_cash * (v_brate + v_pay_rate)
                   - (case when v_bref_applied then v_ref_cash * v_bref_disc else 0 end)
                   - v_ref_cash * v_bdisc_rate;
    v_ref_brand := v_ref_cash - v_ref_cash * (v_brate + v_pay_rate)
                   + (case when v_bref_applied then v_ref_cash * v_bref_disc else 0 end)
                   + v_ref_cash * v_bdisc_rate;
    -- 요율 조합이 바뀌어도 payouts.amount >= 0 (0004) 을 깨지 않게 방어한다
    v_brand_pay := greatest(v_brand_pay - v_ref_brand, 0);
    v_pf        := v_pf - v_ref_plat;
  end if;

  v_vat     := case when v_pf > 0 then v_pf - v_pf / 1.1 else 0 end;
  v_pfnet   := v_pf - v_vat - v_pgf;   -- 0053: PG 는 플랫폼 비용
  v_seller_pay := v_sf_total - v_wht_amt - v_spf + v_ref_cash;

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
    'seller_platform_rate', v_srate, 'brand_platform_rate', v_brate, 'payment_fee_rate', v_pay_rate,
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
    'seller_platform_fee', round(v_spf), 'brand_platform_fee', round(v_bpf), 'payment_fee', round(v_pay),
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

-- ---------- admin_campaign_pnl (0022 본문 + 0053 수식) ----------
create or replace function public.admin_campaign_pnl(p_campaign_id uuid)
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
  v_pg         numeric := 0.019;
  v_platform   numeric := 0.11;
  v_srate      numeric := 0.03;   -- seller_platform_rate (0053)
  v_brate      numeric := 0.03;   -- brand_platform_rate
  v_pay_rate   numeric := 0.05;   -- payment_fee_rate
  v_spf numeric := 0; v_bpf numeric := 0; v_pay numeric := 0;
  v_ref_boost  numeric := 0.01;
  v_ref_rate   numeric := 0.02;
  v_ref_times  integer := 5;
  v_bref_disc  numeric := 0.01;
  v_bref_rate  numeric := 0.01;
  v_bref_times integer := 3;
  v_cel_won    integer := 20000;
  v_rate       numeric;
  v_sgrade     text;
  v_bonus_pp   numeric := 0;
  v_bgrade     text;
  v_bdisc_rate numeric := 0;
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
  v_pfg numeric; v_costs numeric; v_pf numeric; v_vat numeric; v_pfnet numeric; v_sf_total numeric; v_brand_pay numeric;
begin
  select * into c from public.campaigns where id = p_campaign_id;
  if not found then
    return null;
  end if;

  select * into s from public.sellers  where id = c.seller_id;
  select * into b from public.brands   where id = c.brand_id;
  select * into p from public.products where id = c.product_id;

  -- 정산이 끝난 건은 스냅샷이 정답 (0020 admin_settlement_json 과 같은 열을 쓴다)
  if c.status = 'SETTLED' then
    select * into st from public.settlements where campaign_id = c.id;
    if not found then
      return jsonb_build_object(
        'campaign_id', c.id, 'campaign_code', c.code, 'campaign_status', c.status, 'source', 'none',
        'product_name', p.name, 'product_code', p.code, 'seller_handle', s.handle, 'seller_name', s.name,
        'brand_name', b.name, 'brand_code', b.code);
    end if;
    return jsonb_build_object(
      'campaign_id', c.id, 'campaign_code', c.code, 'campaign_status', c.status, 'source', 'snapshot',
      'product_name', p.name, 'product_code', p.code, 'seller_handle', s.handle, 'seller_name', s.name,
      'brand_name', b.name, 'brand_code', b.code,
      'paid_count', st.paid_count, 'refund_count', st.refund_count,
      'gross', st.gross, 'refunds', st.refunds, 'net', st.net, 'sample_net', st.sample_net,
      'pg_fee', st.pg_fee, 'seller_fee', st.seller_fee, 'seller_bonus', st.seller_bonus,
      'ref_boost', st.ref_boost, 'ref_reward', st.ref_reward,
      'brand_ref_boost', st.brand_ref_boost, 'brand_ref_reward', st.brand_ref_reward, 'brand_discount', st.brand_discount,
      'platform_fee_gross', st.platform_fee_gross,
      'seller_platform_fee', st.seller_platform_fee, 'brand_platform_fee', st.brand_platform_fee, 'payment_fee', st.payment_fee,
      -- settlements 에 costs 열은 없다(0004 헤더 — 비저장). 구성 항목 합으로 되살린다
      'costs', st.seller_bonus + st.ref_boost + st.ref_reward + st.brand_ref_boost + st.brand_ref_reward + st.brand_discount,
      'platform_fee', st.platform_fee,
      'vat', st.vat, 'platform_net', st.platform_net, 'seller_fee_total', st.seller_fee_total,
      'brand_payout', st.brand_payout,
      'sample_cel_cover', coalesce(c.sample_cel, 0)
        * coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'sample_cel_won'), 20000));
  end if;

  v_pg := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'pg_rate'), v_pg);
  v_srate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'seller_platform_rate'), v_srate);
  v_brate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'brand_platform_rate'), v_brate);
  v_pay_rate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'payment_fee_rate'), v_pay_rate);
  v_platform := v_srate + v_brate + v_pay_rate;   -- 합계(표시·스냅샷 platform_rate)
  v_ref_boost := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'ref_boost'), v_ref_boost);
  v_ref_rate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'ref_rate'), v_ref_rate);
  v_ref_times := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'ref_times'), v_ref_times);
  v_bref_disc := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'brand_ref_disc'), v_bref_disc);
  v_bref_rate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'brand_ref_rate'), v_bref_rate);
  v_bref_times := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'brand_ref_times'), v_bref_times);

  v_cel_won := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'sample_cel_won'), v_cel_won);

  v_rate   := coalesce(c.rate_locked, p.commission_rate, 0);
  v_sgrade := coalesce(s.grade, public.grade_for_sales(s.m3_sales));
  select coalesce(gt.bonus_pp, 0) into v_bonus_pp from public.grade_tiers gt where gt.name = v_sgrade;
  v_bonus_pp := coalesce(v_bonus_pp, 0);
  v_bgrade := public.brand_grade_for_gmv(public.brand_gmv(b.id));
  select coalesce(gt.fee_discount, 0) into v_bdisc_rate from public.brand_grade_tiers gt where gt.name = v_bgrade;
  v_bdisc_rate := coalesce(v_bdisc_rate, 0);

  -- 추천 부스트 창 — 0020:366-375 와 같다(생성일순 첫 N 회 · LIVE 이후 상태만 센다)
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
  -- 0053
  v_spf     := v_base * v_srate;
  v_bpf     := v_net * v_brate;
  v_pay     := v_net * v_pay_rate;
  v_pfg     := v_spf + v_bpf + v_pay;
  v_costs   := v_gb + v_boost + v_reward + v_bboost + v_breward + v_bdisc;
  v_pf      := v_pfg - v_costs;
  v_vat     := case when v_pf > 0 then v_pf - v_pf / 1.1 else 0 end;
  v_pfnet   := v_pf - v_vat - v_pgf;
  v_sf_total := v_sf + v_gb + v_boost;
  v_brand_pay := v_net - v_sf - v_bpf - v_pay + v_bboost + v_bdisc;

  return jsonb_build_object(
    'campaign_id', c.id, 'campaign_code', c.code, 'campaign_status', c.status, 'source', 'live',
    'product_name', p.name, 'product_code', p.code, 'seller_handle', s.handle, 'seller_name', s.name,
    'brand_name', b.name, 'brand_code', b.code,
    'paid_count', v_paid_count, 'refund_count', v_refund_count,
    'gross', round(v_gross), 'refunds', round(v_refunds), 'net', round(v_net), 'sample_net', round(v_sample_net),
    'pg_fee', round(v_pgf), 'seller_fee', round(v_sf), 'seller_bonus', round(v_gb),
    'ref_boost', round(v_boost), 'ref_reward', round(v_reward),
    'brand_ref_boost', round(v_bboost), 'brand_ref_reward', round(v_breward), 'brand_discount', round(v_bdisc),
    'seller_platform_fee', round(v_spf), 'brand_platform_fee', round(v_bpf), 'payment_fee', round(v_pay),
    'platform_fee_gross', round(v_pfg), 'costs', round(v_costs), 'platform_fee', round(v_pf),
    'vat', round(v_vat), 'platform_net', round(v_pfnet), 'seller_fee_total', round(v_sf_total),
    'brand_payout', round(v_brand_pay), 'sample_cel_cover', coalesce(c.sample_cel, 0) * v_cel_won);
end;
$$;
revoke all on function public.admin_campaign_pnl(uuid) from public, anon, authenticated;
grant execute on function public.admin_campaign_pnl(uuid) to service_role;

-- ---------- app_brand_sales (0019 본문 + 0053 수식) ----------
create or replace function public.app_brand_sales(p_brand_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  b              public.brands%rowtype;
  v_today        date := (now() at time zone 'Asia/Seoul')::date;
  v_pg           numeric := 0.019;
  v_platform     numeric := 0.11;
  v_srate      numeric := 0.03;   -- seller_platform_rate (0053)
  v_brate      numeric := 0.03;   -- brand_platform_rate
  v_pay_rate   numeric := 0.05;   -- payment_fee_rate
  v_spf numeric := 0; v_bpf numeric := 0; v_pay numeric := 0;
  v_ref_boost    numeric := 0.01;
  v_ref_times    integer := 5;
  v_bref_disc    numeric := 0.01;
  v_bref_times   integer := 3;
  v_clear_days   integer := 21;
  v_bgrade       text;
  v_bdisc_rate   numeric := 0;
  v_rows         jsonb := '[]'::jsonb;
  v_tot_net      numeric := 0;
  v_tot_pg       numeric := 0;
  v_tot_sf       numeric := 0;
  v_tot_ppg      numeric := 0;
  v_tot_pay      numeric := 0;
  v_tot_today    numeric := 0;
  v_tot_today_n  integer := 0;
  v_tot_paid     integer := 0;
  v_tot_ref      integer := 0;
  c              record;
  v_net          numeric;
  v_base         numeric;
  v_rate         numeric;
  v_pgf          numeric;
  v_sf           numeric;
  v_gb           numeric;
  v_boost        numeric;
  v_pfg          numeric;
  v_bdisc        numeric;
  v_bboost       numeric;
  v_ppg          numeric;
  v_payout       numeric;
  v_daily        jsonb;
  v_recent       jsonb;
begin
  select * into b from public.brands where id = p_brand_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select coalesce((value #>> '{}')::numeric, v_pg)         into v_pg         from public.platform_settings where key = 'pg_rate';
  v_srate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'seller_platform_rate'), v_srate);
  v_brate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'brand_platform_rate'), v_brate);
  v_pay_rate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'payment_fee_rate'), v_pay_rate);
  v_platform := v_srate + v_brate + v_pay_rate;   -- 합계(표시·스냅샷 platform_rate)
  select coalesce((value #>> '{}')::numeric, v_ref_boost)  into v_ref_boost  from public.platform_settings where key = 'ref_boost';
  select coalesce((value #>> '{}')::integer, v_ref_times)  into v_ref_times  from public.platform_settings where key = 'ref_times';
  select coalesce((value #>> '{}')::numeric, v_bref_disc)  into v_bref_disc  from public.platform_settings where key = 'brand_ref_disc';
  select coalesce((value #>> '{}')::integer, v_bref_times) into v_bref_times from public.platform_settings where key = 'brand_ref_times';
  v_clear_days := public.platform_clear_days();

  -- 브랜드 등급 할인 — 실시간 등급 (데모 bDiscOf(bgname(b)))
  v_bgrade := public.brand_grade_for_gmv(public.brand_gmv(b.id));
  select coalesce(gt.fee_discount, 0) into v_bdisc_rate from public.brand_grade_tiers gt where gt.name = v_bgrade;
  v_bdisc_rate := coalesce(v_bdisc_rate, 0);

  for c in
    with bdone as (
      -- isBrandRefBoost: 이 브랜드의 LIVE/CLEARING/SETTLED 캠페인을 생성일순으로 — 첫 brand_ref_times 건에만 −1%p
      select x.id, row_number() over (order by x.created_at, x.id) as rn
        from public.campaigns x
       where x.brand_id = b.id and x.status in ('LIVE','CLEARING','SETTLED')
    ), sdone as (
      -- isRefBoost(인플루언서 추천 부스트 · 플랫폼 부담 · 표시용): 인플루언서별 LIVE/CLEARING/SETTLED 순번
      select x.id, row_number() over (partition by x.seller_id order by x.created_at, x.id) as rn
        from public.campaigns x
       where x.status in ('LIVE','CLEARING','SETTLED')
         and x.seller_id in (select y.seller_id from public.campaigns y where y.brand_id = b.id and y.status in ('LIVE','CLEARING'))
    )
    select cp.id, cp.code, cp.status, cp.start_date, cp.end_date, cp.qty, cp.sold_qty,
           coalesce(cp.rate_locked, p.commission_rate) as rate,
           p.code as product_code, p.name as product_name, p.emoji, p.thumb_url, p.sale_price,
           s.id as seller_id, s.code as seller_code, s.name as seller_name, s.handle as seller_handle, s.platform as seller_platform, s.avatar_url as seller_avatar,
           coalesce(s.grade, public.grade_for_sales(s.m3_sales)) as seller_grade,
           (s.referred_by is not null and sd.rn is not null and sd.rn <= v_ref_times) as ref_applied,
           (b.referred_by is not null and bd.rn is not null and bd.rn <= v_bref_times) as bref_applied,
           coalesce((select count(*) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and not o.is_sample), 0)::integer as paid_count,
           coalesce((select count(*) from public.orders o where o.campaign_id = cp.id and o.status = 'REFUNDED'), 0)::integer as refund_count,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status <> 'CANCELED'), 0)::numeric as gross,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'CANCELED'), 0)::numeric as canceled,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'REFUNDED'), 0)::numeric as refunded,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and o.is_sample), 0)::numeric as sample_net,
           coalesce((select sum(o.qty) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and not o.is_sample), 0)::integer as qty_sold,
           coalesce((select count(*) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and not o.is_sample
                        and (o.paid_at at time zone 'Asia/Seoul')::date = v_today), 0)::integer as today_orders,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and not o.is_sample
                        and (o.paid_at at time zone 'Asia/Seoul')::date = v_today), 0)::numeric as today_gross
      from public.campaigns cp
      join public.products p on p.id = cp.product_id
      join public.sellers  s on s.id = cp.seller_id
      left join bdone bd on bd.id = cp.id
      left join sdone sd on sd.id = cp.id
     where cp.brand_id = b.id and cp.status in ('LIVE','CLEARING')
     order by cp.start_date desc nulls last, cp.created_at desc
  loop
    v_net    := c.gross - c.refunded;
    v_base   := v_net - c.sample_net;
    v_rate   := coalesce(c.rate, 0);
    v_pgf    := v_net * v_pg;
    v_sf     := v_base * v_rate;
    select coalesce(gt.bonus_pp, 0) into v_gb from public.grade_tiers gt where gt.name = c.seller_grade;
    v_gb     := v_base * coalesce(v_gb, 0) / 100;
    v_boost  := case when c.ref_applied then v_net * v_ref_boost else 0 end;
    -- 0053: 브랜드가 내는 플랫폼 몫 = 이용 수수료 3% + 결제 수수료 5% − 할인. PG 는 빼지 않는다
    v_bpf    := v_net * v_brate;
    v_pay    := v_net * v_pay_rate;
    v_pfg    := v_bpf + v_pay;
    v_bdisc  := v_net * v_bdisc_rate;
    v_bboost := case when c.bref_applied then v_net * v_bref_disc else 0 end;
    v_ppg    := v_bpf + v_pay - v_bboost - v_bdisc;
    v_payout := v_net - v_sf - v_bpf - v_pay + v_bboost + v_bdisc;

    select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g.d, 'YYYY-MM-DD'), 'gross', coalesce(x.gross, 0)) order by g.d), '[]'::jsonb)
      into v_daily
      from generate_series(v_today - 6, v_today, interval '1 day') as g(d)
      left join (
        select (o.paid_at at time zone 'Asia/Seoul')::date as d, sum(o.amount)::bigint as gross
          from public.orders o
         where o.campaign_id = c.id and o.status = 'PAID' and not o.is_sample
           and (o.paid_at at time zone 'Asia/Seoul')::date between v_today - 6 and v_today
         group by 1
      ) x on x.d = g.d::date;

    select coalesce(jsonb_agg(r order by r.paid_at desc), '[]'::jsonb) into v_recent
      from (
        select o.code, public.partner_mask_name(o.buyer_name) as buyer_masked, o.qty, o.amount, o.status, o.paid_at
          from public.orders o
         where o.campaign_id = c.id and not o.is_sample and o.status <> 'CANCELED'
         order by o.paid_at desc
         limit 8
      ) r;

    v_rows := v_rows || jsonb_build_object(
      'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
      'seller', jsonb_build_object('id', c.seller_id, 'code', c.seller_code, 'name', c.seller_name, 'handle', c.seller_handle,
                                   'platform', c.seller_platform, 'avatar_url', c.seller_avatar, 'grade', c.seller_grade),
      'product', jsonb_build_object('code', c.product_code, 'name', c.product_name, 'emoji', coalesce(c.emoji, '📦'), 'thumb_url', c.thumb_url, 'sale_price', c.sale_price),
      'start_date', c.start_date, 'end_date', c.end_date,
      'due_on', case when c.end_date is null then null else c.end_date + v_clear_days end,
      'qty', c.qty, 'sold_qty', c.sold_qty,
      'paid_count', c.paid_count, 'refund_count', c.refund_count,
      'gross', round(c.gross), 'canceled', round(c.canceled), 'refunded', round(c.refunded),
      'net', round(v_net), 'sample_net', round(c.sample_net), 'qty_sold', c.qty_sold,
      'today_orders', c.today_orders, 'today_gross', round(c.today_gross),
      'seller_rate', v_rate, 'seller_grade', c.seller_grade,
      'seller_bonus_pp', (select coalesce(gt.bonus_pp, 0) from public.grade_tiers gt where gt.name = c.seller_grade),
      'ref_boost_applied', c.ref_applied, 'brand_ref_applied', c.bref_applied,
      'pg_fee', round(v_pgf), 'seller_fee', round(v_sf), 'seller_bonus', round(v_gb), 'ref_boost', round(v_boost),
      'seller_fee_total', round(v_sf + v_gb + v_boost),
      'brand_platform_fee', round(v_bpf), 'payment_fee', round(v_pay),
      'platform_fee_gross', round(v_pfg), 'brand_discount', round(v_bdisc), 'brand_ref_boost', round(v_bboost),
      'platform_pg', round(v_ppg), 'brand_payout_est', round(v_payout),
      'daily', v_daily, 'recent', v_recent
    );

    v_tot_net     := v_tot_net + v_net;
    v_tot_pg      := v_tot_pg + v_pgf;
    v_tot_sf      := v_tot_sf + v_sf;
    v_tot_ppg     := v_tot_ppg + v_ppg;
    v_tot_pay     := v_tot_pay + v_payout;
    v_tot_today   := v_tot_today + c.today_gross;
    v_tot_today_n := v_tot_today_n + c.today_orders;
    v_tot_paid    := v_tot_paid + c.paid_count;
    v_tot_ref     := v_tot_ref + c.refund_count;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'brand_grade', v_bgrade,
    'brand_discount_rate', v_bdisc_rate,
    'settle_info_complete', public.brand_settle_info_complete(b),
    'rates', jsonb_build_object('pg_rate', v_pg, 'platform_rate', v_platform, 'brand_platform_rate', v_brate, 'payment_fee_rate', v_pay_rate, 'brand_ref_disc', v_bref_disc, 'brand_ref_times', v_bref_times, 'clear_days', v_clear_days),
    'campaigns', v_rows,
    'totals', jsonb_build_object(
      'net', round(v_tot_net), 'pg_fee', round(v_tot_pg), 'seller_fee', round(v_tot_sf), 'platform_pg', round(v_tot_ppg), 'brand_payout_est', round(v_tot_pay),
      'today_gross', round(v_tot_today), 'today_orders', v_tot_today_n, 'paid_count', v_tot_paid, 'refund_count', v_tot_ref)
  );
end;
$$;
revoke all on function public.app_brand_sales(uuid) from public, anon, authenticated;
grant execute on function public.app_brand_sales(uuid) to service_role;

-- ---------- app_brand_settlements (0019 본문 + 0053 수식) ----------
create or replace function public.app_brand_settlements(p_brand_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  b            public.brands%rowtype;
  v_pg         numeric := 0.019;
  v_platform   numeric := 0.11;
  v_srate      numeric := 0.03;   -- seller_platform_rate (0053)
  v_brate      numeric := 0.03;   -- brand_platform_rate
  v_pay_rate   numeric := 0.05;   -- payment_fee_rate
  v_spf numeric := 0; v_bpf numeric := 0; v_pay numeric := 0;
  v_ref_boost  numeric := 0.01;
  v_ref_times  integer := 5;
  v_bref_disc  numeric := 0.01;
  v_bref_times integer := 3;
  v_clear_days integer := 21;
  v_bgrade     text;
  v_bdisc_rate numeric := 0;
  v_complete   boolean;
  v_rows       jsonb := '[]'::jsonb;
  v_settled    numeric := 0;
  v_pending    numeric := 0;
  v_held       numeric := 0;
  c            record;
  v_net        numeric;
  v_base       numeric;
  v_rate       numeric;
  v_pgf        numeric;
  v_sf         numeric;
  v_gb         numeric;
  v_boost      numeric;
  v_pfg        numeric;
  v_bdisc      numeric;
  v_bboost     numeric;
  v_ppg        numeric;
  v_payout     numeric;
begin
  select * into b from public.brands where id = p_brand_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select coalesce((value #>> '{}')::numeric, v_pg)         into v_pg         from public.platform_settings where key = 'pg_rate';
  v_srate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'seller_platform_rate'), v_srate);
  v_brate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'brand_platform_rate'), v_brate);
  v_pay_rate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'payment_fee_rate'), v_pay_rate);
  v_platform := v_srate + v_brate + v_pay_rate;   -- 합계(표시·스냅샷 platform_rate)
  select coalesce((value #>> '{}')::numeric, v_ref_boost)  into v_ref_boost  from public.platform_settings where key = 'ref_boost';
  select coalesce((value #>> '{}')::integer, v_ref_times)  into v_ref_times  from public.platform_settings where key = 'ref_times';
  select coalesce((value #>> '{}')::numeric, v_bref_disc)  into v_bref_disc  from public.platform_settings where key = 'brand_ref_disc';
  select coalesce((value #>> '{}')::integer, v_bref_times) into v_bref_times from public.platform_settings where key = 'brand_ref_times';
  v_clear_days := public.platform_clear_days();
  v_bgrade := public.brand_grade_for_gmv(public.brand_gmv(b.id));
  select coalesce(gt.fee_discount, 0) into v_bdisc_rate from public.brand_grade_tiers gt where gt.name = v_bgrade;
  v_bdisc_rate := coalesce(v_bdisc_rate, 0);
  v_complete := public.brand_settle_info_complete(b);

  for c in
    with bdone as (
      select x.id, row_number() over (order by x.created_at, x.id) as rn
        from public.campaigns x
       where x.brand_id = b.id and x.status in ('LIVE','CLEARING','SETTLED')
    ), sdone as (
      select x.id, row_number() over (partition by x.seller_id order by x.created_at, x.id) as rn
        from public.campaigns x
       where x.status in ('LIVE','CLEARING','SETTLED')
         and x.seller_id in (select y.seller_id from public.campaigns y where y.brand_id = b.id and y.status in ('LIVE','CLEARING','SETTLED'))
    )
    select cp.id, cp.code, cp.status, cp.start_date, cp.end_date, cp.settled_at as c_settled_at,
           coalesce(cp.rate_locked, p.commission_rate) as rate,
           p.code as product_code, p.name as product_name, p.emoji, p.thumb_url,
           s.code as seller_code, s.name as seller_name, s.handle as seller_handle, s.platform as seller_platform,
           coalesce(s.grade, public.grade_for_sales(s.m3_sales)) as seller_grade,
           (select coalesce(gt.bonus_pp, 0) from public.grade_tiers gt where gt.name = coalesce(s.grade, public.grade_for_sales(s.m3_sales))) as seller_bonus_pp,
           (s.referred_by is not null and sd.rn is not null and sd.rn <= v_ref_times) as ref_applied,
           (b.referred_by is not null and bd.rn is not null and bd.rn <= v_bref_times) as bref_applied,
           st.id as settlement_id, st.net as st_net, st.sample_net as st_sample_net, st.seller_rate as st_seller_rate,
           st.pg_fee as st_pg_fee, st.seller_fee as st_seller_fee, st.seller_bonus as st_seller_bonus, st.ref_boost as st_ref_boost, st.seller_fee_total as st_seller_fee_total,
           st.platform_fee_gross as st_pfg, st.brand_platform_fee as st_bpf, st.payment_fee as st_pay, st.brand_grade as st_brand_grade, st.brand_discount_rate as st_bdisc_rate, st.brand_discount as st_bdisc,
           st.brand_ref_applied as st_bref_applied, st.brand_ref_boost as st_bboost, st.brand_payout as st_brand_payout,
           st.hold_brand as st_hold_brand, st.status as st_status, st.due_on as st_due_on, st.settled_at as st_settled_at, st.paid_at as st_paid_at,
           po.status as po_status, po.amount as po_amount, po.paid_at as po_paid_at, po.hold_reason as po_hold_reason,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status <> 'CANCELED'), 0)::numeric
             - coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'REFUNDED'), 0)::numeric as live_net,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and o.is_sample), 0)::numeric as live_sample_net
      from public.campaigns cp
      join public.products p on p.id = cp.product_id
      join public.sellers  s on s.id = cp.seller_id
      left join bdone bd on bd.id = cp.id
      left join sdone sd on sd.id = cp.id
      left join public.settlements st on st.campaign_id = cp.id
      left join public.payouts po on po.settlement_id = st.id and po.payee_type = 'brand'
     where cp.brand_id = b.id and cp.status in ('LIVE','CLEARING','SETTLED')
     order by coalesce(cp.end_date, cp.start_date) desc nulls last, cp.created_at desc
  loop
    if c.settlement_id is not null then
      v_rows := v_rows || jsonb_build_object(
        'kind', 'settled', 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
        'seller', jsonb_build_object('code', c.seller_code, 'name', c.seller_name, 'handle', c.seller_handle, 'platform', c.seller_platform, 'grade', c.seller_grade),
        'product', jsonb_build_object('code', c.product_code, 'name', c.product_name, 'emoji', coalesce(c.emoji, '📦'), 'thumb_url', c.thumb_url),
        'start_date', c.start_date, 'end_date', c.end_date,
        'net', c.st_net, 'sample_net', c.st_sample_net, 'seller_rate', c.st_seller_rate,
        'pg_fee', c.st_pg_fee, 'seller_fee', c.st_seller_fee, 'seller_bonus', c.st_seller_bonus, 'ref_boost', c.st_ref_boost, 'seller_fee_total', c.st_seller_fee_total,
        'platform_fee_gross', c.st_pfg, 'brand_grade', c.st_brand_grade, 'brand_discount_rate', c.st_bdisc_rate, 'brand_discount', c.st_bdisc,
        'brand_ref_applied', c.st_bref_applied, 'brand_ref_boost', c.st_bboost,
        'brand_platform_fee', c.st_bpf, 'payment_fee', c.st_pay,
        -- 0053 이전 스냅샷(새 컬럼 0)은 옛 식(플랫폼 10% + PG) 으로 보여준다
        'platform_pg', case when c.st_bpf + c.st_pay > 0 then c.st_bpf + c.st_pay - c.st_bboost - c.st_bdisc else c.st_pfg - c.st_bboost - c.st_bdisc + c.st_pg_fee end,
        'brand_payout', c.st_brand_payout,
        'hold_brand', c.st_hold_brand, 'settlement_status', c.st_status,
        'due_on', c.st_due_on, 'settled_at', c.st_settled_at, 'paid_at', c.st_paid_at,
        'payout', case when c.po_status is null then null else jsonb_build_object('status', c.po_status, 'amount', c.po_amount, 'paid_at', c.po_paid_at, 'hold_reason', c.po_hold_reason) end
      );
      v_settled := v_settled + coalesce(c.st_brand_payout, 0);
      if c.st_hold_brand or c.po_status = 'held' then v_held := v_held + coalesce(c.st_brand_payout, 0); end if;
    elsif c.status = 'SETTLED' then
      -- 스냅샷 없는 SETTLED (시드 c6 parity — 0004 헤더) : 금액 null
      v_rows := v_rows || jsonb_build_object(
        'kind', 'settled', 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
        'seller', jsonb_build_object('code', c.seller_code, 'name', c.seller_name, 'handle', c.seller_handle, 'platform', c.seller_platform, 'grade', c.seller_grade),
        'product', jsonb_build_object('code', c.product_code, 'name', c.product_name, 'emoji', coalesce(c.emoji, '📦'), 'thumb_url', c.thumb_url),
        'start_date', c.start_date, 'end_date', c.end_date,
        'net', null, 'sample_net', null, 'seller_rate', c.rate,
        'pg_fee', null, 'seller_fee', null, 'seller_bonus', null, 'ref_boost', null, 'seller_fee_total', null,
        'platform_fee_gross', null, 'brand_grade', null, 'brand_discount_rate', null, 'brand_discount', null,
        'brand_ref_applied', null, 'brand_ref_boost', null, 'brand_platform_fee', null, 'payment_fee', null, 'platform_pg', null, 'brand_payout', null,
        'hold_brand', null, 'settlement_status', null,
        'due_on', case when c.end_date is null then null else c.end_date + v_clear_days end, 'settled_at', c.c_settled_at, 'paid_at', null, 'payout', null
      );
    else
      v_net    := c.live_net;
      v_base   := c.live_net - c.live_sample_net;
      v_rate   := coalesce(c.rate, 0);
      v_pgf    := v_net * v_pg;
      v_sf     := v_base * v_rate;
      v_gb     := v_base * coalesce(c.seller_bonus_pp, 0) / 100;
      v_boost  := case when c.ref_applied then v_net * v_ref_boost else 0 end;
      -- 0053
      v_bpf    := v_net * v_brate;
      v_pay    := v_net * v_pay_rate;
      v_pfg    := v_bpf + v_pay;
      v_bdisc  := v_net * v_bdisc_rate;
      v_bboost := case when c.bref_applied then v_net * v_bref_disc else 0 end;
      v_ppg    := v_bpf + v_pay - v_bboost - v_bdisc;
      v_payout := v_net - v_sf - v_bpf - v_pay + v_bboost + v_bdisc;
      v_rows := v_rows || jsonb_build_object(
        'kind', 'pending', 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
        'seller', jsonb_build_object('code', c.seller_code, 'name', c.seller_name, 'handle', c.seller_handle, 'platform', c.seller_platform, 'grade', c.seller_grade),
        'product', jsonb_build_object('code', c.product_code, 'name', c.product_name, 'emoji', coalesce(c.emoji, '📦'), 'thumb_url', c.thumb_url),
        'start_date', c.start_date, 'end_date', c.end_date,
        'net', round(v_net), 'sample_net', round(c.live_sample_net), 'seller_rate', v_rate,
        'pg_fee', round(v_pgf), 'seller_fee', round(v_sf), 'seller_bonus', round(v_gb), 'ref_boost', round(v_boost), 'seller_fee_total', round(v_sf + v_gb + v_boost),
        'platform_fee_gross', round(v_pfg), 'brand_grade', v_bgrade, 'brand_discount_rate', v_bdisc_rate, 'brand_discount', round(v_bdisc),
        'brand_ref_applied', c.bref_applied, 'brand_ref_boost', round(v_bboost),
        'brand_platform_fee', round(v_bpf), 'payment_fee', round(v_pay),
        'platform_pg', round(v_ppg), 'brand_payout', round(v_payout),
        'hold_brand', not v_complete, 'settlement_status', null,
        'due_on', case when c.end_date is null then null else c.end_date + v_clear_days end, 'settled_at', null, 'paid_at', null, 'payout', null
      );
      v_pending := v_pending + v_payout;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'settle_info_complete', v_complete,
    'has_bank_info', (b.bank_info is not null and coalesce(b.bank_info ->> 'account', '') <> ''),
    'rows', v_rows,
    'totals', jsonb_build_object('settled_payout', round(v_settled), 'pending_payout', round(v_pending), 'held_payout', round(v_held))
  );
end;
$$;
revoke all on function public.app_brand_settlements(uuid) from public, anon, authenticated;
grant execute on function public.app_brand_settlements(uuid) to service_role;

-- ---------- app_seller_sales (0013 본문 + 0053 수식) ----------
create or replace function public.app_seller_sales(p_seller_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  s              public.sellers%rowtype;
  v_today        date := (now() at time zone 'Asia/Seoul')::date;
  v_wht          numeric := 0.033;
  v_wht_eff      numeric;
  v_platform     numeric := 0.11;
  v_srate        numeric := 0.03;   -- seller_platform_rate (0053)
  v_spf          numeric := 0;
  v_ref_boost    numeric := 0.01;
  v_ref_times    integer := 5;
  v_clear_days   integer := 21;
  v_grade        text;
  v_bonus_pp     numeric := 0;
  v_rows         jsonb := '[]'::jsonb;
  v_tot_net      numeric := 0;
  v_tot_fee      numeric := 0;
  v_tot_wht      numeric := 0;
  v_tot_spf      numeric := 0;
  v_tot_pay      numeric := 0;
  v_tot_today    numeric := 0;
  v_tot_today_n  integer := 0;
  v_tot_paid     integer := 0;
  v_tot_ref      integer := 0;
  c              record;
  v_rate         numeric;
  v_sf           numeric;
  v_gb           numeric;
  v_boost        numeric;
  v_fee_total    numeric;
  v_wht_amt      numeric;
  v_payout       numeric;
  v_daily        jsonb;
  v_recent       jsonb;
begin
  select * into s from public.sellers where id = p_seller_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select coalesce((value #>> '{}')::numeric, v_wht)      into v_wht        from public.platform_settings where key = 'wht_rate';
  select coalesce((value #>> '{}')::numeric, v_platform) into v_platform   from public.platform_settings where key = 'platform_rate';
  select coalesce((value #>> '{}')::numeric, v_srate) into v_srate from public.platform_settings where key = 'seller_platform_rate';
  select coalesce((value #>> '{}')::numeric, v_ref_boost) into v_ref_boost from public.platform_settings where key = 'ref_boost';
  select coalesce((value #>> '{}')::integer, v_ref_times) into v_ref_times from public.platform_settings where key = 'ref_times';
  select coalesce((value #>> '{}')::integer, v_clear_days) into v_clear_days from public.platform_settings where key = 'clear_days';
  v_wht_eff := case when s.settle_type = 'biz' then 0 else v_wht end;

  v_grade := coalesce(s.grade, public.grade_for_sales(s.m3_sales));
  select gt.bonus_pp into v_bonus_pp from public.grade_tiers gt where gt.name = v_grade;
  v_bonus_pp := coalesce(v_bonus_pp, 0);

  for c in
    with done as (
      -- isRefBoost: 본인의 LIVE/CLEARING/SETTLED 캠페인을 생성일순으로 — 첫 ref_times 건에만 +1%p
      select x.id, row_number() over (order by x.created_at, x.id) as rn
        from public.campaigns x
       where x.seller_id = s.id and x.status in ('LIVE','CLEARING','SETTLED')
    )
    select cp.id, cp.code, cp.status, cp.start_date, cp.end_date, cp.qty, cp.sold_qty,
           coalesce(cp.rate_locked, p.commission_rate) as rate,
           p.code as product_code, p.name as product_name, p.emoji, p.thumb_url, p.sale_price,
           b.code as brand_code, b.name as brand_name,
           (s.referred_by is not null and d.rn is not null and d.rn <= v_ref_times) as ref_applied,
           coalesce((select count(*) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and not o.is_sample), 0)::integer as paid_count,
           coalesce((select count(*) from public.orders o where o.campaign_id = cp.id and o.status = 'REFUNDED'), 0)::integer as refund_count,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status <> 'CANCELED'), 0)::numeric as gross,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'CANCELED'), 0)::numeric as canceled,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'REFUNDED'), 0)::numeric as refunded,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and o.is_sample), 0)::numeric as sample_net,
           coalesce((select sum(o.qty) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and not o.is_sample), 0)::integer as qty_sold,
           coalesce((select count(*) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and not o.is_sample
                        and (o.paid_at at time zone 'Asia/Seoul')::date = v_today), 0)::integer as today_orders,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and not o.is_sample
                        and (o.paid_at at time zone 'Asia/Seoul')::date = v_today), 0)::numeric as today_gross
      from public.campaigns cp
      join public.products p on p.id = cp.product_id
      join public.brands   b on b.id = cp.brand_id
      left join done d on d.id = cp.id
     where cp.seller_id = s.id and cp.status in ('LIVE','CLEARING')
     order by cp.start_date desc nulls last, cp.created_at desc
  loop
    v_rate      := coalesce(c.rate, 0);
    v_sf        := (c.gross - c.refunded - c.sample_net) * v_rate;
    v_gb        := (c.gross - c.refunded - c.sample_net) * v_bonus_pp / 100;
    v_boost     := case when c.ref_applied then (c.gross - c.refunded) * v_ref_boost else 0 end;
    v_fee_total := v_sf + v_gb + v_boost;
    v_wht_amt   := v_fee_total * v_wht_eff;
    v_spf       := (c.gross - c.refunded - c.sample_net) * v_srate;   -- 0053 플랫폼 이용 수수료 3%
    v_payout    := v_fee_total - v_wht_amt - v_spf;

    select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g.d, 'YYYY-MM-DD'), 'gross', coalesce(x.gross, 0)) order by g.d), '[]'::jsonb)
      into v_daily
      from generate_series(v_today - 6, v_today, interval '1 day') as g(d)
      left join (
        select (o.paid_at at time zone 'Asia/Seoul')::date as d, sum(o.amount)::bigint as gross
          from public.orders o
         where o.campaign_id = c.id and o.status = 'PAID' and not o.is_sample
           and (o.paid_at at time zone 'Asia/Seoul')::date between v_today - 6 and v_today
         group by 1
      ) x on x.d = g.d::date;

    select coalesce(jsonb_agg(r order by r.paid_at desc), '[]'::jsonb) into v_recent
      from (
        select o.code, public.partner_mask_name(o.buyer_name) as buyer_masked, o.qty, o.amount, o.status, o.paid_at
          from public.orders o
         where o.campaign_id = c.id and not o.is_sample and o.status <> 'CANCELED'
         order by o.paid_at desc
         limit 8
      ) r;

    v_rows := v_rows || jsonb_build_object(
      'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
      'product', jsonb_build_object('code', c.product_code, 'name', c.product_name, 'emoji', coalesce(c.emoji, '📦'), 'thumb_url', c.thumb_url, 'sale_price', c.sale_price),
      'brand', jsonb_build_object('code', c.brand_code, 'name', c.brand_name),
      'start_date', c.start_date, 'end_date', c.end_date,
      'due_on', case when c.end_date is null then null else c.end_date + v_clear_days end,
      'qty', c.qty, 'sold_qty', c.sold_qty,
      'paid_count', c.paid_count, 'refund_count', c.refund_count,
      'gross', round(c.gross), 'canceled', round(c.canceled), 'refunded', round(c.refunded),
      'net', round(c.gross - c.refunded), 'sample_net', round(c.sample_net), 'qty_sold', c.qty_sold,
      'today_orders', c.today_orders, 'today_gross', round(c.today_gross),
      'my_rate', v_rate, 'grade', v_grade, 'grade_bonus_pp', v_bonus_pp, 'ref_boost_applied', c.ref_applied,
      'my_fee', round(v_sf), 'grade_bonus', round(v_gb), 'ref_boost', round(v_boost),
      'my_fee_total', round(v_fee_total), 'wht', round(v_wht_amt), 'my_platform_fee', round(v_spf), 'my_payout_est', round(v_payout),
      'daily', v_daily, 'recent', v_recent
    );

    v_tot_net     := v_tot_net + (c.gross - c.refunded);
    v_tot_fee     := v_tot_fee + v_fee_total;
    v_tot_wht     := v_tot_wht + v_wht_amt;
    v_tot_spf     := v_tot_spf + v_spf;
    v_tot_pay     := v_tot_pay + v_payout;
    v_tot_today   := v_tot_today + c.today_gross;
    v_tot_today_n := v_tot_today_n + c.today_orders;
    v_tot_paid    := v_tot_paid + c.paid_count;
    v_tot_ref     := v_tot_ref + c.refund_count;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'settle_type', s.settle_type,
    'wht_rate', v_wht_eff,
    'grade', v_grade,
    'grade_bonus_pp', v_bonus_pp,
    'rates', jsonb_build_object('platform_rate', v_platform, 'seller_platform_rate', v_srate, 'ref_boost', v_ref_boost, 'ref_times', v_ref_times, 'clear_days', v_clear_days),
    'campaigns', v_rows,
    'totals', jsonb_build_object(
      'net', round(v_tot_net), 'my_fee_total', round(v_tot_fee), 'wht', round(v_tot_wht), 'my_platform_fee', round(v_tot_spf), 'my_payout_est', round(v_tot_pay),
      'today_gross', round(v_tot_today), 'today_orders', v_tot_today_n, 'paid_count', v_tot_paid, 'refund_count', v_tot_ref)
  );
end;
$$;
revoke all on function public.app_seller_sales(uuid) from public, anon, authenticated;
grant execute on function public.app_seller_sales(uuid) to service_role;

-- ---------- app_seller_settlements (0013 본문 + 0053 수식) ----------
create or replace function public.app_seller_settlements(p_seller_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  s            public.sellers%rowtype;
  v_wht        numeric := 0.033;
  v_wht_eff    numeric;
  v_clear_days integer := 21;
  v_ref_boost  numeric := 0.01;
  v_ref_times  integer := 5;
  v_srate      numeric := 0.03;   -- seller_platform_rate (0053)
  v_spf        numeric := 0;
  v_grade      text;
  v_bonus_pp   numeric := 0;
  v_rows       jsonb := '[]'::jsonb;
  v_settled    numeric := 0;
  v_pending    numeric := 0;
  c            record;
  v_net        numeric;
  v_base       numeric;
  v_rate       numeric;
  v_sf         numeric;
  v_gb         numeric;
  v_boost      numeric;
  v_fee_total  numeric;
  v_wht_amt    numeric;
  v_payout     numeric;
begin
  select * into s from public.sellers where id = p_seller_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select coalesce((value #>> '{}')::numeric, v_wht)        into v_wht        from public.platform_settings where key = 'wht_rate';
  select coalesce((value #>> '{}')::integer, v_clear_days) into v_clear_days from public.platform_settings where key = 'clear_days';
  select coalesce((value #>> '{}')::numeric, v_ref_boost)  into v_ref_boost  from public.platform_settings where key = 'ref_boost';
  select coalesce((value #>> '{}')::integer, v_ref_times)  into v_ref_times  from public.platform_settings where key = 'ref_times';
  select coalesce((value #>> '{}')::numeric, v_srate) into v_srate from public.platform_settings where key = 'seller_platform_rate';
  v_wht_eff := case when s.settle_type = 'biz' then 0 else v_wht end;
  v_grade := coalesce(s.grade, public.grade_for_sales(s.m3_sales));
  select gt.bonus_pp into v_bonus_pp from public.grade_tiers gt where gt.name = v_grade;
  v_bonus_pp := coalesce(v_bonus_pp, 0);

  for c in
    with done as (
      select x.id, row_number() over (order by x.created_at, x.id) as rn
        from public.campaigns x
       where x.seller_id = s.id and x.status in ('LIVE','CLEARING','SETTLED')
    )
    select cp.id, cp.code, cp.status, cp.start_date, cp.end_date, cp.settled_at as c_settled_at,
           coalesce(cp.rate_locked, p.commission_rate) as rate,
           p.code as product_code, p.name as product_name, p.emoji, p.thumb_url,
           b.code as brand_code, b.name as brand_name,
           (s.referred_by is not null and d.rn is not null and d.rn <= v_ref_times) as ref_applied,
           st.id as settlement_id, st.net as st_net, st.sample_net as st_sample_net, st.seller_rate, st.seller_grade, st.seller_bonus_pp,
           st.ref_boost_applied as st_ref_applied, st.wht_rate as st_wht_rate,
           st.seller_fee, st.seller_bonus, st.ref_boost as st_ref_boost, st.seller_fee_total, st.seller_wht, st.seller_platform_fee,
           st.sample_refund_cel, st.sample_refund_cash, st.seller_payout, st.hold_seller, st.status as st_status, st.due_on, st.settled_at,
           po.status as po_status, po.amount as po_amount, po.paid_at as po_paid_at, po.hold_reason as po_hold_reason,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status <> 'CANCELED'), 0)::numeric
             - coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'REFUNDED'), 0)::numeric as live_net,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and o.is_sample), 0)::numeric as live_sample_net
      from public.campaigns cp
      join public.products p on p.id = cp.product_id
      join public.brands   b on b.id = cp.brand_id
      left join done d on d.id = cp.id
      left join public.settlements st on st.campaign_id = cp.id
      left join public.payouts po on po.settlement_id = st.id and po.payee_type = 'seller'
     where cp.seller_id = s.id and cp.status in ('LIVE','CLEARING','SETTLED')
     order by coalesce(cp.end_date, cp.start_date) desc nulls last, cp.created_at desc
  loop
    if c.settlement_id is not null then
      v_rows := v_rows || jsonb_build_object(
        'kind', 'settled', 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
        'product', jsonb_build_object('code', c.product_code, 'name', c.product_name, 'emoji', coalesce(c.emoji, '📦'), 'thumb_url', c.thumb_url),
        'brand', jsonb_build_object('code', c.brand_code, 'name', c.brand_name),
        'start_date', c.start_date, 'end_date', c.end_date,
        'net', c.st_net, 'sample_net', c.st_sample_net, 'my_rate', c.seller_rate, 'grade', c.seller_grade, 'grade_bonus_pp', c.seller_bonus_pp,
        'ref_boost_applied', c.st_ref_applied,
        'my_fee', c.seller_fee, 'grade_bonus', c.seller_bonus, 'ref_boost', c.st_ref_boost, 'my_fee_total', c.seller_fee_total,
        'wht_rate', c.st_wht_rate, 'wht', c.seller_wht, 'my_platform_fee', c.seller_platform_fee,
        'sample_refund_cel', c.sample_refund_cel, 'sample_refund_cash', c.sample_refund_cash,
        'my_payout', c.seller_payout, 'hold_seller', c.hold_seller, 'settlement_status', c.st_status,
        'due_on', c.due_on, 'settled_at', c.settled_at,
        'payout', case when c.po_status is null then null else jsonb_build_object('status', c.po_status, 'amount', c.po_amount, 'paid_at', c.po_paid_at, 'hold_reason', c.po_hold_reason) end
      );
      v_settled := v_settled + coalesce(c.seller_payout, 0);
    elsif c.status = 'SETTLED' then
      -- 스냅샷 없는 SETTLED (시드 c6 parity — 0004 헤더) : 금액 null
      v_rows := v_rows || jsonb_build_object(
        'kind', 'settled', 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
        'product', jsonb_build_object('code', c.product_code, 'name', c.product_name, 'emoji', coalesce(c.emoji, '📦'), 'thumb_url', c.thumb_url),
        'brand', jsonb_build_object('code', c.brand_code, 'name', c.brand_name),
        'start_date', c.start_date, 'end_date', c.end_date,
        'net', null, 'sample_net', null, 'my_rate', c.rate, 'grade', null, 'grade_bonus_pp', null, 'ref_boost_applied', null,
        'my_fee', null, 'grade_bonus', null, 'ref_boost', null, 'my_fee_total', null, 'wht_rate', null, 'wht', null, 'my_platform_fee', null,
        'sample_refund_cel', null, 'sample_refund_cash', null, 'my_payout', null, 'hold_seller', null, 'settlement_status', null,
        'due_on', case when c.end_date is null then null else c.end_date + v_clear_days end, 'settled_at', c.c_settled_at, 'payout', null
      );
    else
      v_net       := c.live_net;
      v_base      := c.live_net - c.live_sample_net;
      v_rate      := coalesce(c.rate, 0);
      v_sf        := v_base * v_rate;
      v_gb        := v_base * v_bonus_pp / 100;
      v_boost     := case when c.ref_applied then v_net * v_ref_boost else 0 end;
      v_fee_total := v_sf + v_gb + v_boost;
      v_wht_amt   := v_fee_total * v_wht_eff;
      v_spf       := v_base * v_srate;   -- 0053
      v_payout    := v_fee_total - v_wht_amt - v_spf;
      v_rows := v_rows || jsonb_build_object(
        'kind', 'pending', 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
        'product', jsonb_build_object('code', c.product_code, 'name', c.product_name, 'emoji', coalesce(c.emoji, '📦'), 'thumb_url', c.thumb_url),
        'brand', jsonb_build_object('code', c.brand_code, 'name', c.brand_name),
        'start_date', c.start_date, 'end_date', c.end_date,
        'net', round(v_net), 'sample_net', round(c.live_sample_net), 'my_rate', v_rate, 'grade', v_grade, 'grade_bonus_pp', v_bonus_pp,
        'ref_boost_applied', c.ref_applied,
        'my_fee', round(v_sf), 'grade_bonus', round(v_gb), 'ref_boost', round(v_boost), 'my_fee_total', round(v_fee_total),
        'wht_rate', v_wht_eff, 'wht', round(v_wht_amt), 'my_platform_fee', round(v_spf),
        'sample_refund_cel', null, 'sample_refund_cash', null,
        'my_payout', round(v_payout), 'hold_seller', not (s.bank_info is not null and coalesce(s.bank_info ->> 'account', '') <> ''),
        'settlement_status', null,
        'due_on', case when c.end_date is null then null else c.end_date + v_clear_days end, 'settled_at', null, 'payout', null
      );
      v_pending := v_pending + v_payout;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'has_bank_info', (s.bank_info is not null and coalesce(s.bank_info ->> 'account', '') <> ''),
    'settle_type', s.settle_type,
    'wht_rate', v_wht_eff,
    'rows', v_rows,
    'totals', jsonb_build_object('settled_payout', round(v_settled), 'pending_payout', round(v_pending))
  );
end;
$$;
revoke all on function public.app_seller_settlements(uuid) from public, anon, authenticated;
grant execute on function public.app_seller_settlements(uuid) to service_role;

-- ---------- app_admin_settle_run (0020 본문 — 스냅샷에 새 컬럼 3개 저장) ----------
create or replace function public.app_admin_settle_run(p_campaign_id uuid, p_actor_user_id uuid default null, p_force boolean default false)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c          public.campaigns%rowtype;
  k          jsonb;
  v_now      timestamptz := now();
  v_today    date := (now() at time zone 'Asia/Seoul')::date;
  v_due      date;
  v_sid      uuid;
  v_seller_id uuid;
  v_brand_id  uuid;
  v_hold_s   text;
  v_hold_b   text;
  v_po_s     public.payouts%rowtype;
  v_po_b     public.payouts%rowtype;
  v_ref_cel  integer;
  v_ref_cash integer;
  v_per_won  bigint := 5000000;
  v_basis    bigint;
  v_have     integer;
  v_earn_s   integer := 0;
  v_earn_b   integer := 0;
  v_reward   bigint;
  v_breward  bigint;
  v_ref_name text;
  v_grade_s  jsonb;
  v_grade_b  jsonb;
  v_sf_total bigint;
  v_wht      bigint;
  v_wht_rate numeric;
  v_settled_body text;
begin
  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if c.status = 'SETTLED' then
    select id into v_sid from public.settlements where campaign_id = c.id;
    return jsonb_build_object('ok', true, 'already', true, 'settlement_id', v_sid, 'campaign_code', c.code);
  end if;
  if c.status <> 'CLEARING' then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;
  v_due := case when c.end_date is null then null else c.end_date + public.platform_clear_days() end;
  if not coalesce(p_force, false) and (v_due is null or v_due > v_today) then
    return jsonb_build_object('ok', false, 'code', 'NOT_DUE', 'due_on', v_due, 'today', v_today);
  end if;

  k := public.app_admin_settle_preview(c.id);
  if (k ->> 'ok')::boolean is distinct from true or (k ->> 'source') <> 'live' then
    return jsonb_build_object('ok', false, 'code', coalesce(k ->> 'code', 'BAD_STATE'));
  end if;
  v_seller_id := c.seller_id;
  v_brand_id  := c.brand_id;
  v_hold_s := k #>> '{holds,seller,code}';
  v_hold_b := k #>> '{holds,brand,code}';
  v_ref_cel  := (k ->> 'sample_refund_cel')::integer;
  v_ref_cash := (k ->> 'sample_refund_cash')::integer;
  v_sf_total := (k ->> 'seller_fee_total')::bigint;
  v_wht      := (k ->> 'seller_wht')::bigint;
  v_wht_rate := (k ->> 'wht_rate')::numeric;
  v_per_won := coalesce((select (value #>> '{}')::bigint from public.platform_settings where key = 'celery_per_won'), v_per_won);
  v_per_won := coalesce(v_per_won, 5000000);

  -- 1 스냅샷
  insert into public.settlements (
    campaign_id, title, paid_count, refund_count, gross, refunds, net, sample_net,
    pg_rate, platform_rate, seller_rate, seller_grade, seller_bonus_pp, brand_grade, brand_discount_rate, wht_rate,
    ref_boost_applied, brand_ref_applied, ref_boost_rate, ref_reward_rate, brand_ref_disc_rate, brand_ref_reward_rate,
    pg_fee, seller_fee, seller_bonus, ref_boost, ref_reward, brand_ref_boost, brand_ref_reward, brand_discount,
    platform_fee_gross, platform_fee, vat, platform_net, seller_fee_total, seller_wht,
    seller_platform_fee, brand_platform_fee, payment_fee,
    sample_refund_cel, sample_refund_cash, sample_cel_cover, brand_payout, seller_payout,
    hold_seller, hold_brand, status, due_on, settled_at, memo)
  values (
    c.id, k ->> 'title', (k ->> 'paid_count')::integer, (k ->> 'refund_count')::integer,
    (k ->> 'gross')::bigint, (k ->> 'refunds')::bigint, (k ->> 'net')::bigint, (k ->> 'sample_net')::bigint,
    (k ->> 'pg_rate')::numeric, (k ->> 'platform_rate')::numeric, (k ->> 'seller_rate')::numeric,
    k ->> 'seller_grade', (k ->> 'seller_bonus_pp')::numeric, k ->> 'brand_grade', (k ->> 'brand_discount_rate')::numeric, v_wht_rate,
    (k ->> 'ref_boost_applied')::boolean, (k ->> 'brand_ref_applied')::boolean,
    (k ->> 'ref_boost_rate')::numeric, (k ->> 'ref_reward_rate')::numeric, (k ->> 'brand_ref_disc_rate')::numeric, (k ->> 'brand_ref_reward_rate')::numeric,
    (k ->> 'pg_fee')::bigint, (k ->> 'seller_fee')::bigint, (k ->> 'seller_bonus')::bigint, (k ->> 'ref_boost')::bigint, (k ->> 'ref_reward')::bigint,
    (k ->> 'brand_ref_boost')::bigint, (k ->> 'brand_ref_reward')::bigint, (k ->> 'brand_discount')::bigint,
    (k ->> 'platform_fee_gross')::bigint, (k ->> 'platform_fee')::bigint, (k ->> 'vat')::bigint, (k ->> 'platform_net')::bigint,
    v_sf_total, v_wht,
    coalesce((k ->> 'seller_platform_fee')::bigint, 0), coalesce((k ->> 'brand_platform_fee')::bigint, 0), coalesce((k ->> 'payment_fee')::bigint, 0),
    v_ref_cel, v_ref_cash, (k ->> 'sample_cel_cover')::bigint, (k ->> 'brand_payout')::bigint, (k ->> 'seller_payout')::bigint,
    (v_hold_s is not null), (v_hold_b is not null),
    case when v_hold_s is not null or v_hold_b is not null then 'held' else 'pending' end,
    v_due, v_now,
    case when coalesce(p_force, false) then '기준일 전 강제 실행' else null end)
  returning id into v_sid;

  -- 2 지급 2행
  insert into public.payouts (settlement_id, payee_type, seller_id, amount, wht, status, hold_code, hold_reason, bank_snapshot)
  select v_sid, 'seller', s.id, greatest((k ->> 'seller_payout')::bigint, 0), v_wht,
         case when v_hold_s is null then 'pending' else 'held' end, v_hold_s,
         case when v_hold_s is null then null else public.admin_hold_label(v_hold_s) end,
         public.admin_bank_snapshot(s.bank_info)
    from public.sellers s where s.id = v_seller_id
  returning * into v_po_s;
  insert into public.payouts (settlement_id, payee_type, brand_id, amount, wht, status, hold_code, hold_reason, bank_snapshot)
  select v_sid, 'brand', b.id, greatest((k ->> 'brand_payout')::bigint, 0), 0,
         case when v_hold_b is null then 'pending' else 'held' end, v_hold_b,
         case when v_hold_b is null then null else public.admin_hold_label(v_hold_b) end,
         public.admin_bank_snapshot(b.bank_info)
    from public.brands b where b.id = v_brand_id
  returning * into v_po_b;

  -- 3 캠페인
  update public.campaigns
     set status = 'SETTLED', settled_at = v_now,
         sample_refunded = sample_refunded or (v_ref_cel > 0 or v_ref_cash > 0)
   where id = c.id;

  -- 4 🥬 — 샘플 환급 · 획득 차분
  if v_ref_cel > 0 then
    perform public.celery_spend('seller', v_seller_id, v_ref_cel, 'sample_refund', '샘플 구매 환급 · ' || (k #>> '{product,name}'), 'settlement', v_sid);
  end if;
  if v_ref_cel > 0 or v_ref_cash > 0 then
    insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
    values (c.id, 'system', 'system', 'admin', p_actor_user_id,
            '🎁 샘플 구매액 환급 — ' || concat_ws(' + ', case when v_ref_cel > 0 then '🥬 ' || v_ref_cel end,
                                                        case when v_ref_cash > 0 then '₩' || to_char(v_ref_cash, 'FM999,999,999,999') end)
              || ' (판매 확정 조건 충족)',
            'sample_refunded', jsonb_build_object('cel', v_ref_cel, 'cash', v_ref_cash, 'settlement_id', v_sid));
  end if;

  select s.m3_sales_base + public.seller_confirmed_sales(s.id, null) into v_basis from public.sellers s where s.id = v_seller_id;
  select coalesce(sum(delta), 0)::integer into v_have from public.celery_ledger where owner_type = 'seller' and seller_id = v_seller_id and reason = 'earned';
  v_earn_s := greatest(floor(v_basis / v_per_won::numeric)::integer - v_have, 0);
  if v_earn_s > 0 then
    perform public.celery_spend('seller', v_seller_id, v_earn_s, 'earned',
                                '매출 달성 획득 · ' || c.code || ' 정산 (확정 매출 ₩' || to_char(v_per_won, 'FM999,999,999,999') || '당 1🥬)', 'settlement', v_sid);
  end if;
  v_basis := public.brand_gmv(v_brand_id);
  select coalesce(sum(delta), 0)::integer into v_have from public.celery_ledger where owner_type = 'brand' and brand_id = v_brand_id and reason = 'earned';
  v_earn_b := greatest(floor(v_basis / v_per_won::numeric)::integer - v_have, 0);
  if v_earn_b > 0 then
    perform public.celery_spend('brand', v_brand_id, v_earn_b, 'earned',
                                '매출 달성 획득 · ' || c.code || ' 정산 (누적 확정 GMV ₩' || to_char(v_per_won, 'FM999,999,999,999') || '당 1🥬)', 'settlement', v_sid);
  end if;

  -- 5 추천 보상
  v_reward  := (k ->> 'ref_reward')::bigint;
  v_breward := (k ->> 'brand_ref_reward')::bigint;
  if v_reward > 0 and (k #>> '{seller,referred_by}') is not null then
    insert into public.referral_earnings (side, referrer_seller_id, referred_seller_id, campaign_id, settlement_id, rate, amount, memo, earned_on)
    values ('seller', (k #>> '{seller,referred_by}')::uuid, v_seller_id, c.id, v_sid, (k ->> 'ref_reward_rate')::numeric, v_reward::integer,
            '추천 보상 · ' || c.code, v_today);
    select name into v_ref_name from public.sellers where id = (k #>> '{seller,referred_by}')::uuid;
    insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
    values (c.id, 'system', 'system', 'admin', p_actor_user_id,
            '추천 보상 지급 — 추천인 ' || coalesce(v_ref_name, '') || '에게 확정 매출의 ' || round((k ->> 'ref_reward_rate')::numeric * 100) || '% ₩'
              || to_char(v_reward, 'FM999,999,999,999') || ' (플랫폼 부담)',
            'ref_reward', jsonb_build_object('referrer_seller_id', k #>> '{seller,referred_by}', 'amount', v_reward, 'settlement_id', v_sid));
  else
    v_reward := 0;
  end if;
  if v_breward > 0 and (k #>> '{brand,referred_by}') is not null then
    insert into public.referral_earnings (side, referrer_brand_id, referred_brand_id, campaign_id, settlement_id, rate, amount, memo, earned_on)
    values ('brand', (k #>> '{brand,referred_by}')::uuid, v_brand_id, c.id, v_sid, (k ->> 'brand_ref_reward_rate')::numeric, v_breward::integer,
            '브랜드 추천 보상 · ' || c.code, v_today);
    select name into v_ref_name from public.brands where id = (k #>> '{brand,referred_by}')::uuid;
    insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
    values (c.id, 'system', 'system', 'admin', p_actor_user_id,
            '브랜드 추천 보상 — 추천 브랜드 ' || coalesce(v_ref_name, '') || '에게 확정 매출의 ' || round((k ->> 'brand_ref_reward_rate')::numeric * 100) || '% ₩'
              || to_char(v_breward, 'FM999,999,999,999') || ' · 신규 브랜드 수수료 −' || round((k ->> 'brand_ref_disc_rate')::numeric * 100) || '%p 적용 (플랫폼 부담)',
            'brand_ref_reward', jsonb_build_object('referrer_brand_id', k #>> '{brand,referred_by}', 'amount', v_breward, 'settlement_id', v_sid));
  else
    v_breward := 0;
  end if;

  -- 6 등급
  v_grade_s := public.app_seller_grade_recalc(v_seller_id);
  v_grade_b := public.app_brand_grade_recalc(v_brand_id);

  -- 7 스레드
  if v_hold_s is not null or v_hold_b is not null then
    insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
    values (c.id, 'system', 'system', 'admin', p_actor_user_id,
            '⏸ 지급 보류 — ' || concat_ws(' · ', case when v_hold_s is not null then '인플루언서: ' || public.admin_hold_label(v_hold_s) end,
                                                case when v_hold_b is not null then '브랜드: ' || public.admin_hold_label(v_hold_b) end)
              || '. 정산 정보를 등록하면 다음 지급 배치에 포함됩니다.',
            'payout_held', jsonb_build_object('seller', v_hold_s, 'brand', v_hold_b, 'settlement_id', v_sid));
  end if;
  v_settled_body := '정산 완료 · 브랜드 ₩' || to_char((k ->> 'brand_payout')::bigint, 'FM999,999,999,999')
    || case when (k ->> 'brand_ref_applied')::boolean then ' (추천 할인 −' || round((k ->> 'brand_ref_disc_rate')::numeric * 100) || '%p 포함)' else '' end
    || case when (k ->> 'brand_discount')::bigint > 0 then ' (등급 할인 포함)' else '' end
    || ' · 인플루언서 ₩' || to_char(v_sf_total, 'FM999,999,999,999')
    || case when (k ->> 'seller_bonus')::bigint > 0 then ' (' || (k ->> 'seller_grade') || ' 보너스 포함)' else '' end
    || case when (k ->> 'ref_boost_applied')::boolean then ' (추천 부스트 +' || round((k ->> 'ref_boost_rate')::numeric * 100) || '%p 포함)' else '' end
    || ' → ' || case when v_wht_rate > 0 then '원천징수 ' || to_char(v_wht_rate * 100, 'FM990.9') || '% 공제 후 ₩' || to_char(v_sf_total - v_wht, 'FM999,999,999,999')
                     else '사업자 정산(세금계산서) ₩' || to_char(v_sf_total, 'FM999,999,999,999') end
    || ' · 명세 발행';
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
  values (c.id, 'system', 'system', 'admin', p_actor_user_id, v_settled_body, 'settled',
          jsonb_build_object('settlement_id', v_sid, 'net', (k ->> 'net')::bigint, 'brand_payout', (k ->> 'brand_payout')::bigint,
                             'seller_fee_total', v_sf_total, 'seller_wht', v_wht, 'seller_payout', (k ->> 'seller_payout')::bigint,
                             'hold_seller', (v_hold_s is not null), 'hold_brand', (v_hold_b is not null), 'forced', coalesce(p_force, false),
                             'due_on', v_due, 'settled_on', v_today));

  return jsonb_build_object(
    'ok', true, 'already', false, 'forced', coalesce(p_force, false),
    'settlement_id', v_sid, 'campaign_id', c.id, 'campaign_code', c.code,
    'net', (k ->> 'net')::bigint, 'seller_fee_total', v_sf_total, 'seller_wht', v_wht,
    'seller_payout', (k ->> 'seller_payout')::bigint, 'brand_payout', (k ->> 'brand_payout')::bigint,
    'platform_fee', (k ->> 'platform_fee')::bigint, 'platform_net', (k ->> 'platform_net')::bigint,
    'holds', k -> 'holds',
    'payouts', jsonb_build_object('seller', public.admin_payout_json(v_po_s), 'brand', public.admin_payout_json(v_po_b)),
    'celery', jsonb_build_object('sample_refund_cel', v_ref_cel, 'sample_refund_cash', v_ref_cash, 'seller_earned', v_earn_s, 'brand_earned', v_earn_b),
    'referral', jsonb_build_object('seller_reward', v_reward, 'brand_reward', v_breward),
    'grades', jsonb_build_object('seller', v_grade_s, 'brand', v_grade_b),
    'settled_at', v_now, 'due_on', v_due
  );
end;
$$;
revoke all on function public.app_admin_settle_run(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.app_admin_settle_run(uuid, uuid, boolean) to service_role;

-- ---------- app_admin_settle_sample (0024 본문 — 새 컬럼 저장) ----------
create or replace function public.app_admin_settle_sample(p_campaign_id uuid, p_actor_user_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c          public.campaigns%rowtype;
  s          public.sellers%rowtype;
  b          public.brands%rowtype;
  p          public.products%rowtype;
  k          jsonb;
  v_sid      uuid;
  v_hold_s   text;
  v_hold_b   text;
  v_canceled boolean;
  -- settlements 의 NOT NULL 요율·등급 (0020 settle_preview 와 같은 소스)
  v_pg       numeric := 0.019;
  v_platform numeric := 0.11;
  v_wht      numeric := 0.033;
  v_sgrade   text;
  v_bonus_pp numeric := 0;
  v_bgrade   text;
  v_bdisc    numeric := 0;
  v_wht_eff  numeric;
  v_rate     numeric;
begin
  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select id into v_sid from public.settlements where campaign_id = c.id;
  if v_sid is not null then
    return jsonb_build_object('ok', true, 'already', true, 'settlement_id', v_sid, 'campaign_code', c.code);
  end if;

  if not coalesce(c.purchased, false) then
    return jsonb_build_object('ok', false, 'code', 'NO_SAMPLE');
  end if;
  if c.tracking_no is null and c.sample_shipped_at is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_SHIPPED');
  end if;
  if c.status not in ('PASSED', 'DECLINED', 'REJECTED') then
    return jsonb_build_object('ok', false, 'code', 'NOT_TERMINAL', 'status', c.status);
  end if;
  -- 미발송 환불로 종결된 건은 제외한다(0012 가 주문을 CANCELED 로 바꾼다)
  select exists (select 1 from public.orders o where o.campaign_id = c.id and o.is_sample and o.status = 'CANCELED')
    into v_canceled;
  if v_canceled then
    return jsonb_build_object('ok', false, 'code', 'REFUNDED');
  end if;

  select * into s from public.sellers  where id = c.seller_id;
  select * into b from public.brands   where id = c.brand_id;
  select * into p from public.products where id = c.product_id;

  k := public.admin_campaign_pnl(c.id);
  if k is null or (k ->> 'source') <> 'live' then
    return jsonb_build_object('ok', false, 'code', 'CALC_FAILED');
  end if;

  -- 요율·등급 스냅샷 — 0020 settle_preview 와 같은 키·같은 함수를 쓴다
  v_pg       := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'pg_rate'), v_pg);
  v_platform := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'platform_rate'), v_platform);   -- 0053: 합계 0.11
  v_wht      := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'wht_rate'), v_wht);
  v_rate     := coalesce(c.rate_locked, p.commission_rate, 0);
  v_sgrade   := coalesce(s.grade, public.grade_for_sales(s.m3_sales));
  select coalesce(gt.bonus_pp, 0) into v_bonus_pp from public.grade_tiers gt where gt.name = v_sgrade;
  v_bonus_pp := coalesce(v_bonus_pp, 0);
  v_bgrade   := public.brand_grade_for_gmv(public.brand_gmv(b.id));
  select coalesce(gt.fee_discount, 0) into v_bdisc from public.brand_grade_tiers gt where gt.name = v_bgrade;
  v_bdisc    := coalesce(v_bdisc, 0);
  v_wht_eff  := case when s.settle_type = 'biz' then 0 else v_wht end;

  v_hold_s := public.admin_payout_hold_reason('seller', s.id, null);
  v_hold_b := public.admin_payout_hold_reason('brand', null, b.id);

  insert into public.settlements (
    campaign_id, title, paid_count, refund_count, gross, refunds, net, sample_net,
    pg_rate, platform_rate, seller_rate, seller_grade, seller_bonus_pp, brand_grade, brand_discount_rate, wht_rate,
    ref_boost_applied, brand_ref_applied, ref_boost_rate, ref_reward_rate, brand_ref_disc_rate, brand_ref_reward_rate,
    pg_fee, seller_fee, seller_bonus, ref_boost, ref_reward, brand_ref_boost, brand_ref_reward, brand_discount,
    platform_fee_gross, platform_fee, vat, platform_net, seller_fee_total, seller_wht,
    seller_platform_fee, brand_platform_fee, payment_fee,
    sample_refund_cel, sample_refund_cash, sample_cel_cover, brand_payout, seller_payout,
    status, settled_at, memo)
  values (
    c.id, p.name || ' · ' || s.handle || ' (샘플 대금)',
    (k ->> 'paid_count')::integer, (k ->> 'refund_count')::integer,
    (k ->> 'gross')::bigint, (k ->> 'refunds')::bigint, (k ->> 'net')::bigint, (k ->> 'sample_net')::bigint,
    v_pg, v_platform, v_rate,
    v_sgrade, v_bonus_pp, v_bgrade, v_bdisc,
    v_wht_eff,
    -- 추천 부스트는 금액(k)으로만 판정한다 — 샘플만 있는 캠페인이라 요율 재계산이 필요 없다
    coalesce((k ->> 'ref_boost')::bigint, 0) > 0, coalesce((k ->> 'brand_ref_boost')::bigint, 0) > 0,
    0, 0, 0, 0,
    (k ->> 'pg_fee')::bigint, (k ->> 'seller_fee')::bigint, (k ->> 'seller_bonus')::bigint,
    (k ->> 'ref_boost')::bigint, (k ->> 'ref_reward')::bigint,
    (k ->> 'brand_ref_boost')::bigint, (k ->> 'brand_ref_reward')::bigint, (k ->> 'brand_discount')::bigint,
    (k ->> 'platform_fee_gross')::bigint, (k ->> 'platform_fee')::bigint, (k ->> 'vat')::bigint,
    (k ->> 'platform_net')::bigint, (k ->> 'seller_fee_total')::bigint,
    round(coalesce((k ->> 'seller_fee_total')::numeric, 0) * v_wht_eff)::bigint,
    coalesce((k ->> 'seller_platform_fee')::bigint, 0), coalesce((k ->> 'brand_platform_fee')::bigint, 0), coalesce((k ->> 'payment_fee')::bigint, 0),
    -- 환급(sample_refund_*)은 0 이다 — 환급 조건은 "판매 확정 시" 이고 이 경로는 판매가 확정되지 않은 건이다.
    -- 그래서 샘플 대금은 브랜드에 간다(운영 결정: 발송 후 진행하지 않으면 브랜드 지급).
    0, 0, (k ->> 'sample_cel_cover')::bigint,
    (k ->> 'brand_payout')::bigint,
    -- 인플루언서 지급 = 수수료 합계 − 원천징수. 샘플만 있는 캠페인은 `base = net − sample_net = 0` 이라 0 이다
    greatest(round(coalesce((k ->> 'seller_fee_total')::numeric, 0) * (1 - v_wht_eff))::bigint, 0),
    'pending', now(), '샘플 대금 정산 — 발송 후 판매 미진행 (0024)')
  returning id into v_sid;

  insert into public.payouts (settlement_id, payee_type, brand_id, amount, wht, status, hold_code, hold_reason, bank_snapshot)
  values (v_sid, 'brand', b.id, greatest((k ->> 'brand_payout')::bigint, 0), 0,
          case when v_hold_b is null then 'pending' else 'held' end, v_hold_b,
          case when v_hold_b is null then null else public.admin_hold_label(v_hold_b) end,
          public.admin_bank_snapshot(b.bank_info));

  -- 인플루언서 지급은 0 이 보통이다(샘플만 있으면 수수료 0) — 환급 옵션이 켜져 있으면 0023 이 채워 준다
  if round(coalesce((k ->> 'seller_fee_total')::numeric, 0) * (1 - v_wht_eff)) > 0 then
    insert into public.payouts (settlement_id, payee_type, seller_id, amount, wht, status, hold_code, hold_reason, bank_snapshot)
    values (v_sid, 'seller', s.id, round(coalesce((k ->> 'seller_fee_total')::numeric, 0) * (1 - v_wht_eff))::bigint,
            round(coalesce((k ->> 'seller_fee_total')::numeric, 0) * v_wht_eff)::bigint,
            case when v_hold_s is null then 'pending' else 'held' end, v_hold_s,
            case when v_hold_s is null then null else public.admin_hold_label(v_hold_s) end,
            public.admin_bank_snapshot(s.bank_info));
  end if;

  insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
  values (c.id, 'system', 'system', 'admin', p_actor_user_id,
          '샘플 대금 정산 — 브랜드 ₩' || to_char((k ->> 'brand_payout')::bigint, 'FM999,999,999,999')
            || ' (발송 후 판매 미진행)',
          'sample_settled',
          jsonb_build_object('settlement_id', v_sid, 'brand_payout', (k ->> 'brand_payout')::bigint));

  return jsonb_build_object('ok', true, 'already', false, 'settlement_id', v_sid, 'campaign_code', c.code,
                            'brand_payout', (k ->> 'brand_payout')::bigint,
                            'platform_fee', (k ->> 'platform_fee')::bigint,
                            'seller_payout', greatest(round(coalesce((k ->> 'seller_fee_total')::numeric, 0) * (1 - v_wht_eff))::bigint, 0));
end;
$$;
revoke all on function public.app_admin_settle_sample(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_admin_settle_sample(uuid, uuid) to service_role;

-- ---------- admin_settlement_json (0027 본문 + 새 컬럼 노출) ----------
create or replace function public.admin_settlement_json(st public.settlements)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'source', 'snapshot',
    'settlement_id', st.id,
    'campaign_id', st.campaign_id,
    'campaign_code', c.code, 'campaign_status', c.status, 'title', st.title,
    'start_date', c.start_date, 'end_date', c.end_date, 'due_on', st.due_on,
    'seller', jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle, 'grade', s.grade, 'settle_type', s.settle_type),
    -- 추천인(0027) — 지급 목록의 "대상" 칸 표시용. referred_by 가 없으면 null
    'referrer', (select jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name, 'handle', r.handle, 'grade', r.grade, 'settle_type', r.settle_type)
                   from public.sellers r where r.id = s.referred_by),
    'brand', jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'grade', b.grade),
    'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'emoji', coalesce(p.emoji, '📦'), 'thumb_url', p.thumb_url),
    'paid_count', st.paid_count, 'refund_count', st.refund_count,
    'gross', st.gross, 'refunds', st.refunds, 'net', st.net, 'sample_net', st.sample_net,
    'pg_rate', st.pg_rate, 'platform_rate', st.platform_rate, 'seller_rate', st.seller_rate,
    'seller_grade', st.seller_grade, 'seller_bonus_pp', st.seller_bonus_pp, 'brand_grade', st.brand_grade, 'brand_discount_rate', st.brand_discount_rate,
    'wht_rate', st.wht_rate,
    'ref_boost_applied', st.ref_boost_applied, 'brand_ref_applied', st.brand_ref_applied,
    'ref_boost_rate', st.ref_boost_rate, 'ref_reward_rate', st.ref_reward_rate, 'brand_ref_disc_rate', st.brand_ref_disc_rate, 'brand_ref_reward_rate', st.brand_ref_reward_rate,
    'pg_fee', st.pg_fee, 'seller_fee', st.seller_fee, 'seller_bonus', st.seller_bonus, 'ref_boost', st.ref_boost, 'ref_reward', st.ref_reward,
    'brand_ref_boost', st.brand_ref_boost, 'brand_ref_reward', st.brand_ref_reward, 'brand_discount', st.brand_discount
  ) || jsonb_build_object(
    'platform_fee_gross', st.platform_fee_gross,
    'seller_platform_fee', st.seller_platform_fee, 'brand_platform_fee', st.brand_platform_fee, 'payment_fee', st.payment_fee,
    'costs', st.seller_bonus + st.ref_boost + st.ref_reward + st.brand_ref_boost + st.brand_ref_reward + st.brand_discount,
    'platform_fee', st.platform_fee, 'vat', st.vat, 'platform_net', st.platform_net,
    'seller_fee_total', st.seller_fee_total, 'seller_wht', st.seller_wht,
    'sample_refund_cel', st.sample_refund_cel, 'sample_refund_cash', st.sample_refund_cash, 'sample_cel_cover', st.sample_cel_cover,
    'brand_payout', st.brand_payout, 'seller_payout', st.seller_payout,
    'hold_seller', st.hold_seller, 'hold_brand', st.hold_brand,
    'holds', jsonb_build_object(
      'seller', (select case when po.hold_code is null and po.status <> 'held' then null
                             else jsonb_build_object('code', coalesce(po.hold_code, 'MANUAL'), 'label', coalesce(po.hold_reason, public.admin_hold_label(coalesce(po.hold_code, 'MANUAL')))) end
                   from public.payouts po where po.settlement_id = st.id and po.payee_type = 'seller'),
      'brand',  (select case when po.hold_code is null and po.status <> 'held' then null
                             else jsonb_build_object('code', coalesce(po.hold_code, 'MANUAL'), 'label', coalesce(po.hold_reason, public.admin_hold_label(coalesce(po.hold_code, 'MANUAL')))) end
                   from public.payouts po where po.settlement_id = st.id and po.payee_type = 'brand')),
    'settlement', jsonb_build_object('id', st.id, 'status', st.status, 'settled_at', st.settled_at, 'paid_at', st.paid_at, 'memo', st.memo),
    'payouts', jsonb_build_object(
      'seller', (select public.admin_payout_json(po) from public.payouts po where po.settlement_id = st.id and po.payee_type = 'seller'),
      'brand',  (select public.admin_payout_json(po) from public.payouts po where po.settlement_id = st.id and po.payee_type = 'brand'),
      -- 추천 보상(0027) — 캠페인 당사자가 아니라 인플루언서를 데려온 사람. 없으면 null
      'referrer', (select public.admin_payout_json(po) from public.payouts po where po.settlement_id = st.id and po.payee_type = 'referrer')),
    'eligible', false, 'reason', 'SETTLED'
  )
    from public.campaigns c
    join public.sellers  s on s.id = c.seller_id
    join public.brands   b on b.id = c.brand_id
    join public.products p on p.id = c.product_id
   where c.id = st.campaign_id
$$;

-- ---------- app_admin_revenue (0050 본문 + 새 합계 3개) ----------
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
  a_spf numeric := 0; a_bpf numeric := 0; a_pay numeric := 0;   -- 0053
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
    a_spf     := a_spf     + coalesce((j ->> 'seller_platform_fee')::numeric, 0);
    a_bpf     := a_bpf     + coalesce((j ->> 'brand_platform_fee')::numeric, 0);
    a_pay     := a_pay     + coalesce((j ->> 'payment_fee')::numeric, 0);
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
    'seller_platform_fee', round(a_spf), 'brand_platform_fee', round(a_bpf), 'payment_fee', round(a_pay),
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

-- ---------- app_brand_upsert_product (0015 본문 — 요율 의미 변경) ----------
create or replace function public.app_brand_upsert_product(p_brand_id uuid, p_product_id uuid, p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p              public.products%rowtype;
  v_create       boolean := p_product_id is null;
  v_name         text;
  v_desc         text;
  v_emoji        text;
  v_category     text;
  v_cp           integer;
  v_gp           integer;
  v_total        numeric;
  v_rate         numeric(5,4);
  v_min_rate     numeric := 0.05;
  v_stock        integer;
  v_sample_text  text;
  v_sp           jsonb;
  v_sp_grade     text;
  v_sp_mode      text;
  v_sp_fixed     integer;
  v_sp_refund    boolean;
  v_ex_grade     text;
  v_ex_label     text;
  v_opts         jsonb := '[]'::jsonb;
  v_opt          jsonb;
  v_opt_n        text;
  v_opt_price    integer;
  v_thumb        text;
  v_imgs         text[] := '{}';
  v_img          text;
  v_locked       boolean := false;
  v_allocated    integer := 0;
  v_status       text;
  v_rereview     boolean := false;
  v_id           uuid;
  v_code         text;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'input');
  end if;

  -- 0. 수정 대상 잠금 (동시 저장 직렬화) · 소유 확인
  if not v_create then
    select * into p from public.products
     where id = p_product_id and brand_id = p_brand_id and deleted_at is null
     for update;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;
    v_locked := public.product_is_locked(p.id);
  end if;

  -- 1. 검증 · 정규화 (순서 = 폼 필드 순서)
  v_name := left(regexp_replace(btrim(coalesce(p_input ->> 'name', '')), '\s+', ' ', 'g'), 81);
  if v_name = '' or length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'name');
  end if;

  v_desc := nullif(regexp_replace(btrim(coalesce(p_input ->> 'description', '')), '\s+', ' ', 'g'), '');
  if v_desc is not null and length(v_desc) > 300 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'description');
  end if;

  v_emoji := nullif(btrim(coalesce(p_input ->> 'emoji', '')), '');
  if v_emoji is not null and length(v_emoji) > 8 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'emoji');
  end if;
  v_emoji := coalesce(v_emoji, case when v_create then '📦' else p.emoji end, '📦');

  v_category := btrim(coalesce(p_input ->> 'category', ''));
  if v_category = '' or not exists (select 1 from public.categories ct where ct.name = v_category) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'category');
  end if;

  begin
    v_cp := (p_input ->> 'consumer_price')::integer;
    v_gp := (p_input ->> 'sale_price')::integer;
    v_total := (p_input ->> 'total_rate')::numeric;
    v_stock := coalesce((p_input ->> 'stock')::integer, 0);
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'number');
  end;
  if v_cp is null or v_cp < 0 or v_cp > 100000000 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'consumer_price');
  end if;
  if v_gp is null or v_gp <= 0 or v_gp > 100000000 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'sale_price');
  end if;
  -- 0053: total_rate(%) = **인플루언서 수수료율 그대로**(플랫폼 몫은 정산 시 따로 받는다). 하한 min_seller_rate(5%), 상한 100.
  if v_total is null or v_total < 5 or v_total > 100 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'total_rate');
  end if;
  select coalesce((ps.value #>> '{}')::numeric, 0.05) into v_min_rate from public.platform_settings ps where ps.key = 'min_seller_rate';
  v_min_rate := coalesce(v_min_rate, 0.05);
  v_rate := round(greatest(v_min_rate, v_total / 100), 4);
  if v_stock < 0 or v_stock > 10000000 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'stock');
  end if;

  v_sample_text := nullif(regexp_replace(btrim(coalesce(p_input ->> 'sample_text', '')), '\s+', ' ', 'g'), '');
  if v_sample_text is not null and length(v_sample_text) > 60 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'sample_text');
  end if;
  v_sample_text := coalesce(v_sample_text, '무상 1개');

  -- 샘플 정책 — 객체면 네 키 전부, 아니면 전부 null (0002 products_sample_policy_all_or_none)
  v_sp := p_input -> 'sample_policy';
  if v_sp is not null and jsonb_typeof(v_sp) = 'object' and coalesce(v_sp ->> 'free_grade', '') <> '' then
    v_sp_grade := v_sp ->> 'free_grade';
    v_sp_mode  := coalesce(v_sp ->> 'buy_mode', 'auto');
    begin
      v_sp_fixed := coalesce((v_sp ->> 'fixed_price')::integer, 0);
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'sample_policy');
    end;
    v_sp_refund := coalesce((v_sp ->> 'refund')::boolean, false);
    if not exists (select 1 from public.grade_tiers gt where gt.name = v_sp_grade)
       or v_sp_mode not in ('auto', 'fixed')
       or v_sp_fixed < 0 or v_sp_fixed > 100000000
       or (v_sp_mode = 'fixed' and v_sp_fixed <= 0) then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'sample_policy');
    end if;
  else
    v_sp_grade := null; v_sp_mode := null; v_sp_fixed := null; v_sp_refund := null;
  end if;

  -- 독점 오퍼 — 상위 4단계만 (0002 products_exclusive_grade_top4)
  v_ex_grade := nullif(btrim(coalesce(p_input ->> 'exclusive_grade', '')), '');
  if v_ex_grade is not null and v_ex_grade not in ('블랙', '다이아', '플래티넘', '골드') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'exclusive_grade');
  end if;
  v_ex_label := nullif(regexp_replace(btrim(coalesce(p_input ->> 'exclusive_label', '')), '\s+', ' ', 'g'), '');
  if v_ex_label is not null and length(v_ex_label) > 80 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'exclusive_label');
  end if;
  if v_ex_grade is not null then
    v_ex_label := coalesce(v_ex_label, v_ex_grade || ' 등급 독점권');
  else
    v_ex_label := null;
  end if;
  -- 독점 인플루언서가 확정된 상품은 오퍼를 해제하지 못한다 — 데모와 같이 기존 값을 유지한다
  if not v_create and p.exclusive_seller_id is not null and v_ex_grade is null then
    v_ex_grade := p.exclusive_grade;
    v_ex_label := p.exclusive_label;
  end if;

  -- 옵션 — [{n, price}] ≤ 20 · 비면 []
  if p_input ? 'options' and p_input -> 'options' is not null and jsonb_typeof(p_input -> 'options') <> 'null' then
    if jsonb_typeof(p_input -> 'options') <> 'array' or jsonb_array_length(p_input -> 'options') > 20 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'options');
    end if;
    for v_opt in select value from jsonb_array_elements(p_input -> 'options') loop
      if jsonb_typeof(v_opt) <> 'object' then
        return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'options');
      end if;
      v_opt_n := left(regexp_replace(btrim(coalesce(v_opt ->> 'n', '')), '\s+', ' ', 'g'), 61);
      begin
        v_opt_price := (v_opt ->> 'price')::integer;
      exception when others then
        return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'options');
      end;
      if v_opt_n = '' or length(v_opt_n) > 60 or v_opt_price is null or v_opt_price <= 0 or v_opt_price > 100000000 then
        return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'options');
      end if;
      v_opts := v_opts || jsonb_build_object('n', v_opt_n, 'price', v_opt_price);
    end loop;
  end if;

  -- 이미지 — URL 문자열만 (Storage 업로드는 서버가 먼저 한다) · 썸네일 ≤ 500 · 상세 ≤ 4장
  v_thumb := nullif(btrim(coalesce(p_input ->> 'thumb_url', '')), '');
  if v_thumb is not null and (length(v_thumb) > 500 or v_thumb ~ '\s') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'thumb_url');
  end if;
  if p_input ? 'image_urls' and jsonb_typeof(p_input -> 'image_urls') = 'array' then
    if jsonb_array_length(p_input -> 'image_urls') > 4 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'image_urls');
    end if;
    for v_img in select value #>> '{}' from jsonb_array_elements(p_input -> 'image_urls') loop
      v_img := btrim(coalesce(v_img, ''));
      if v_img = '' or length(v_img) > 500 or v_img ~ '\s' then
        return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'image_urls');
      end if;
      v_imgs := v_imgs || v_img;
    end loop;
  elsif p_input ? 'image_urls' and jsonb_typeof(p_input -> 'image_urls') not in ('null') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'image_urls');
  end if;

  -- 2. 등록
  if v_create then
    insert into public.products (brand_id, name, description, emoji, thumb_url, image_urls, category,
                                 consumer_price, sale_price, commission_rate, sample_text, stock, status,
                                 exclusive_grade, exclusive_label,
                                 sample_free_grade, sample_buy_mode, sample_fixed_price, sample_refund, options)
    values (p_brand_id, v_name, v_desc, v_emoji, v_thumb, v_imgs, v_category,
            v_cp, v_gp, v_rate, v_sample_text, v_stock, 'pending',
            v_ex_grade, v_ex_label,
            v_sp_grade, v_sp_mode, v_sp_fixed, v_sp_refund, v_opts)
    returning id, code into v_id, v_code;
    return jsonb_build_object('ok', true, 'product_id', v_id, 'code', v_code, 'status', 'pending', 'created', true);
  end if;

  -- 3. 수정 — 잠금 가드 (saveProduct locked) · 옵션은 §8 결정으로 전체 불변
  if v_locked then
    if v_cp <> p.consumer_price then
      return jsonb_build_object('ok', false, 'code', 'LOCKED_FIELD', 'field', 'consumer_price');
    end if;
    if v_gp <> p.sale_price then
      return jsonb_build_object('ok', false, 'code', 'LOCKED_FIELD', 'field', 'sale_price');
    end if;
    if v_rate <> p.commission_rate then
      return jsonb_build_object('ok', false, 'code', 'LOCKED_FIELD', 'field', 'total_rate');
    end if;
    if v_opts <> coalesce(p.options, '[]'::jsonb) then
      return jsonb_build_object('ok', false, 'code', 'LOCKED_FIELD', 'field', 'options');
    end if;
  end if;

  -- 재고 가드 (§8 STOCK_BELOW_ALLOCATED) — 잠금 여부와 무관
  v_allocated := public.product_allocated(p.id);
  if v_stock < v_allocated then
    return jsonb_build_object('ok', false, 'code', 'STOCK_BELOW_ALLOCATED', 'allocated', v_allocated, 'stock', v_stock);
  end if;

  -- 재검수 판정 (saveProduct: 미잠금 · listed · 판매가 또는 요율 변경) · rejected 는 저장하면 pending
  v_status := p.status;
  if p.status = 'listed' and not v_locked and (v_gp <> p.sale_price or v_rate <> p.commission_rate) then
    v_status := 'pending'; v_rereview := true;
  elsif p.status = 'rejected' then
    v_status := 'pending';
  end if;

  update public.products
     set name = v_name, description = v_desc, emoji = v_emoji, category = v_category,
         thumb_url = coalesce(v_thumb, p.thumb_url),                    -- 새 썸네일이 없으면 유지 (데모 `if (f.thumb)`)
         image_urls = case when array_length(v_imgs, 1) is null then p.image_urls else v_imgs end,   -- 빈 배열이면 유지 (데모 `if (f.imgs.length)`)
         consumer_price = v_cp, sale_price = v_gp, commission_rate = v_rate,
         sample_text = v_sample_text, stock = v_stock,
         sample_free_grade = v_sp_grade, sample_buy_mode = v_sp_mode, sample_fixed_price = v_sp_fixed, sample_refund = v_sp_refund,
         exclusive_grade = v_ex_grade, exclusive_label = v_ex_label,
         options = v_opts,
         status = v_status,
         reject_reason = case when v_status = 'pending' then null else p.reject_reason end
   where id = p.id;

  return jsonb_build_object('ok', true, 'product_id', p.id, 'code', p.code, 'status', v_status,
    'created', false, 'rereview', v_rereview, 'locked', v_locked);
end;
$$;
revoke all on function public.app_brand_upsert_product(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.app_brand_upsert_product(uuid, uuid, jsonb) to service_role;
