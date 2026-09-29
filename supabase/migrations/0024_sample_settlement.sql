-- ============================================================================================
-- 0024_sample_settlement.sql — 판매로 이어지지 않은 샘플 구매 대금 (운영 결정 2026-09-28)
--
-- 배경: 샘플 구매 대금은 **판매 정산에 함께 실려** 지급된다(0020 — `gross` 에 `is_sample` 주문 포함).
--   그래서 판매까지 가지 않은 캠페인(테스트 후 패스 등)은 정산이 돌지 않아 **받은 돈이 아무에게도 가지 않고
--   남는다**(`0019:45` 열린 결정 · 데모도 같다 — `runSettleAll()` 이 `CLEARING` 만 고른다).
--
-- 결정(2026-09-28):
--   · **발송 후** 인플루언서가 진행하지 않은 경우(패스) → 브랜드에 지급. 실물을 이미 보냈고,
--     무상 샘플 경로(등급·월 한도 조건)를 우회하는 통로가 되지 않게 한다.
--   · **결제 후 영업일 5일** 안에 발송하지 않은 경우 → 인플루언서에게 전액 환불.
--     샘플 구매는 브랜드 승인 없이 결제 즉시 발송 단계로 가므로(`sample-policy:14`) 브랜드가 방치할 수 있다.
--
-- | 규칙 | 코어 원본 | 여기서 |
-- |---|---|---|
-- | 발송 후 패스 → 브랜드 지급 | (없음 — 데모는 미지급으로 남긴다) | `app_admin_settle_sample(campaign)` — `settlements` 1행 + `payouts` 2행. 판매 정산과 같은 테이블이라 지급 화면이 그대로 동작한다 |
-- | 5영업일 미발송 → 전액 환불 | (없음) | `sample_refund_due_on(paid_at)` + `app_admin_sample_refund_due()` — 대상만 골라준다. 실제 환불은 `app_partner_payment_refund`(0012) |
--
-- **금액은 0023 `app_admin_settle_preview` 가 계산한다** — 샘플만 있는 캠페인의 `brand_payout` ·
-- `platform_fee` 가 그대로 샘플 대금의 배분이다(인플루언서 수수료는 `base = net − sample_net = 0` 이라 0).
-- 환급 옵션이 켜진 상품이면 0023 의 차감이 함께 적용돼 브랜드 몫이 인플루언서에게 간다.
-- 계산을 다시 구현하지 않는다.
--
-- **`settlements.campaign_id` 가 unique 지만 충돌하지 않는다** — 종결(PASSED · DECLINED · REJECTED) 캠페인은
-- 판매 정산이 돌지 않는다. 그래도 이미 행이 있으면 `already:true` 로 멱등 처리한다.
--
-- 전부 security definer · service_role 전용 · `{ok, code}` 반환(0010~0023 관례).
-- ============================================================================================

-- ------------------------------------------------------------
-- business_days_after(p_from, p_days) — 영업일 n 일 뒤 (주말만 제외 · **공휴일 미반영**)
--   공휴일 표가 없어 토·일만 건너뛴다. 실제보다 이르게 판정될 수 있어 환불 기한은 운영이 여유를 두고 본다.
--   공휴일을 넣으려면 별도 표(holidays)와 함께 이 함수를 교체한다.
-- ------------------------------------------------------------
create or replace function public.business_days_after(p_from date, p_days integer)
returns date
language plpgsql
immutable
set search_path = public
as $$
declare
  d    date := p_from;
  left_ integer := greatest(coalesce(p_days, 0), 0);
begin
  while left_ > 0 loop
    d := d + 1;
    -- ISO: 6=토 · 7=일
    if extract(isodow from d) < 6 then
      left_ := left_ - 1;
    end if;
  end loop;
  return d;
end;
$$;
revoke all on function public.business_days_after(date, integer) from public, anon, authenticated;
grant execute on function public.business_days_after(date, integer) to service_role;

-- ------------------------------------------------------------
-- platform_sample_ship_days() — 미발송 환불 기한(영업일). `platform_settings.sample_ship_days`(기본 5)
-- ------------------------------------------------------------
create or replace function public.platform_sample_ship_days()
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'sample_ship_days'), 5)
$$;
revoke all on function public.platform_sample_ship_days() from public, anon, authenticated;
grant execute on function public.platform_sample_ship_days() to service_role;

insert into public.platform_settings (key, value) values ('sample_ship_days', '5'::jsonb)
  on conflict (key) do nothing;

-- ------------------------------------------------------------
-- app_admin_sample_refund_due() — 5영업일 지나도 미발송인 샘플 구매 (환불 대상 목록)
--   **환불을 실행하지 않는다** — 토스 현금 취소가 먼저여서(0012 §5.7) 운영 스크립트/화면이 순서를 지킨다:
--     1) 토스 취소(현금분)  2) app_partner_payment_refund(payment_id)
--   반환: { ok:true, today, rows:[{ campaign_id, campaign_code, payment_id, seller, brand, product,
--                                   amount_total, amount_cash, amount_cel, paid_on, due_on, days_over }] }
-- ------------------------------------------------------------
create or replace function public.app_admin_sample_refund_due()
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_days  integer := public.platform_sample_ship_days();
  v_rows  jsonb;
begin
  select coalesce(jsonb_agg(x order by (x ->> 'due_on')), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
               'campaign_id', c.id, 'campaign_code', c.code,
               'payment_id', pp.id,
               'seller', jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle),
               'brand', jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name),
               'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name),
               'amount_total', pp.amount_total, 'amount_cash', pp.amount_cash, 'amount_cel', pp.amount_cel,
               'paid_on', (pp.created_at at time zone 'Asia/Seoul')::date,
               'due_on', public.business_days_after((pp.created_at at time zone 'Asia/Seoul')::date, v_days),
               'days_over', v_today - public.business_days_after((pp.created_at at time zone 'Asia/Seoul')::date, v_days)) as x
        from public.partner_payments pp
        join public.campaigns c on c.id = pp.campaign_id
        join public.sellers   s on s.id = c.seller_id
        join public.brands    b on b.id = c.brand_id
        join public.products  p on p.id = c.product_id
       where pp.kind = 'sample'
         and pp.status = 'CONFIRMED'
         -- 아직 발송 전 (0012 app_partner_payment_refund 와 같은 조건)
         and c.status = 'SAMPLE_PURCHASED'
         and c.tracking_no is null
         and c.sample_shipped_at is null
         and public.business_days_after((pp.created_at at time zone 'Asia/Seoul')::date, v_days) <= v_today) t;

  return jsonb_build_object('ok', true, 'today', v_today, 'ship_days', v_days, 'rows', v_rows);
end;
$$;
revoke all on function public.app_admin_sample_refund_due() from public, anon, authenticated;
grant execute on function public.app_admin_sample_refund_due() to service_role;

-- ------------------------------------------------------------
-- app_admin_settle_sample(p_campaign_id, p_actor_user_id) — 발송 후 종결된 캠페인의 샘플 대금 정산
--   조건: 샘플 구매 있음(purchased) · **발송됨**(tracking_no) · 종결(PASSED · DECLINED · REJECTED) ·
--         환불 안 됨(주문이 CANCELED 가 아니다) · 아직 정산 안 됨
--   금액: **`admin_campaign_pnl`(0022)** 을 쓴다 — 상태 게이트가 없고 계산식이 0020/0023 과 같다.
--         `settlements` 의 NOT NULL 요율·등급 컬럼은 그 함수가 반환하지 않으므로(손익 집계용) 여기서 직접 읽는다 —
--         `platform_settings` · `grade_tiers` · `brand_grade_tiers` 로 0020 과 같은 순서·같은 소스다.
--   반환: { ok:true, already, settlement_id, brand_payout, platform_fee, seller_payout }
--         { ok:false, code:'NOT_FOUND' | 'NO_SAMPLE' | 'NOT_SHIPPED' | 'NOT_TERMINAL'{status} | 'REFUNDED' | 'CALC_FAILED' }
-- ------------------------------------------------------------
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
  v_platform numeric := 0.10;
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
  v_platform := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'platform_rate'), v_platform);
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

-- ------------------------------------------------------------
-- app_admin_sample_settle_due() — 샘플 대금 정산 대기 목록 (관리자 화면 큐)
--   조건은 app_admin_settle_sample 과 같다. 금액은 admin_campaign_pnl(0022).
-- ------------------------------------------------------------
create or replace function public.app_admin_sample_settle_due()
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(x order by (x ->> 'campaign_code')), '[]'::jsonb) into v_rows
    from (
      select jsonb_build_object(
               'campaign_id', c.id, 'campaign_code', c.code, 'campaign_status', c.status,
               'seller', jsonb_build_object('code', s.code, 'name', s.name, 'handle', s.handle),
               'brand', jsonb_build_object('code', b.code, 'name', b.name),
               'product', jsonb_build_object('code', p.code, 'name', p.name, 'sample_refund', coalesce(p.sample_refund, false)),
               'sample_price', c.sample_price, 'sample_cash', c.sample_cash, 'sample_cel', c.sample_cel,
               'shipped_on', (c.sample_shipped_at at time zone 'Asia/Seoul')::date,
               'brand_payout', (public.admin_campaign_pnl(c.id) ->> 'brand_payout')::bigint,
               'seller_payout', 0) as x   -- 샘플만 있는 캠페인은 인플루언서 수수료가 0 이다
        from public.campaigns c
        join public.sellers  s on s.id = c.seller_id
        join public.brands   b on b.id = c.brand_id
        join public.products p on p.id = c.product_id
       where coalesce(c.purchased, false)
         and (c.tracking_no is not null or c.sample_shipped_at is not null)
         and c.status in ('PASSED', 'DECLINED', 'REJECTED')
         and not exists (select 1 from public.settlements st where st.campaign_id = c.id)
         and not exists (select 1 from public.orders o where o.campaign_id = c.id and o.is_sample and o.status = 'CANCELED')) t;

  return jsonb_build_object('ok', true, 'rows', v_rows);
end;
$$;
revoke all on function public.app_admin_sample_settle_due() from public, anon, authenticated;
grant execute on function public.app_admin_sample_settle_due() to service_role;
