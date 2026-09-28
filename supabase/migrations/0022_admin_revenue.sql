-- ============================================================================================
-- 0022_admin_revenue.sql — 관리자 "매출·순수익" (프로토타입 vAdminRevenue 이식)
--
-- 데모 원본: apps/admin/src/routes/(demo)/revenue/+page.svelte (js/50-admin.js vAdminRevenue).
-- 문서: docs/settlement-policy.md §9 · §11.4 · §413 · docs/points-policy.md §318 ·
--       docs/sample-policy.md §169 §172 §295 · docs/admin-console-plan.md §파트너 관리.
--
-- 왜 새 함수가 필요한가 — 0020 `app_admin_settle_preview` 는 **정산 실행 대상**을 보는 함수라
-- `status not in ('LIVE','CLEARING')` 에서 `WRONG_STATUS` 로 막는다(0020:336). 매출·순수익은 실행이 아니라
-- **집계**이고, 데모는 샘플 구매만 있는 캠페인(`SAMPLE_PURCHASED`)도 GMV 에 넣는다(sample-policy §169:
--   `['LIVE','CLEARING','SETTLED'].includes(status) || c.samplePaid`).
-- 샘플 구매는 실제 `orders` 행(`is_sample=true` · PAID)이라 돈이 들어온 것이 맞고, 정산 규칙도 이미 그 경우를
-- 다룬다 — `base = net − sample_net` 이라 인플루언서 수수료는 0, PG 1.9% 와 플랫폼 10% 는 그대로 적용된다
-- (settle-rules.ts:74 · :78 · 0020:390).
--
-- | 규칙 | 코어 원본 | 0020 대응 | 여기서 |
-- |---|---|---|---|
-- | 캠페인 손익 한 건 = calc(c) 전체 | `packages/core/src/helpers.ts` calc · `packages/db/src/admin/settle-rules.ts` calcSettlement | app_admin_settle_preview 본문(0020:336-420) | `admin_campaign_pnl(uuid)` — **상태 게이트 없음**. 그 밖은 0020 과 같은 식·같은 `platform_settings` 키 |
-- | 매출 화면 캠페인 집합 | `cs = campaigns.filter(LIVE|CLEARING|SETTLED || c.samplePaid)` (데모 revenue 4행) | (없음) | `app_admin_revenue()` 의 `v_in_scope` |
-- | 대시보드 캠페인 집합 | `done = filter(LIVE|CLEARING|SETTLED)` (데모 home 6행) | (없음) | 화면이 `revenue_scope` 플래그로 구분 — 두 화면 숫자가 다른 이유를 표에 적는다(sample-policy §172) |
-- | 셀러리 충전 매출 · 무상 발행 · 획득 · 소진 · 잔액 | celWon/celNet/granted/earned/spent/bal (데모 revenue 8~12행) | (없음) | `app_admin_revenue()` 의 `celery` 블록 |
-- | 🥬 결제분 브랜드 원화 보전 celCover | `campaigns.sample_cel × SAMPLE_CEL_WON` (데모 revenue 20행) | settlements.sample_cel_cover(0013 열) | `app_admin_revenue()` 의 `cel_cover` — **전 캠페인** 합(정산 여부 무관) |
-- | 운영 비용 기본값 | OPEX_DEF | (없음) | `platform_settings.opex_default`(0001 시드 · 이미 있다) 를 읽고 `app_admin_save_opex` 가 같은 키에 쓴다 |
--
-- **정산 스냅샷이 있으면 스냅샷을 쓴다** — `SETTLED` 캠페인은 `settlements` 행의 확정 금액이 정답이다.
-- 스냅샷이 없는 `SETTLED`(시드 결함 · `NO_SNAPSHOT`)는 금액을 **0 으로 합산하지 않고** 건수만 센다.
--
-- 전부 security definer · service_role 전용 · `{ok, ...}` 반환(0010~0021 관례).
-- ============================================================================================

-- ------------------------------------------------------------
-- admin_campaign_pnl(p_campaign_id) — 캠페인 1건 손익. **상태 게이트 없음**.
--   0020 app_admin_settle_preview 의 계산부와 같은 식이다(같은 platform_settings 키 · 같은 순서).
--   정산 규칙을 바꿀 때는 0020:336-420 · 이 함수 · `packages/db/src/admin/settle-rules.ts` calcSettlement 를 함께 고친다.
--   반환: { campaign_id, campaign_code, campaign_status, source:'live'|'snapshot', ... 금액 19항목 }
--         source='snapshot' 이면 settlements 행의 확정 금액. 스냅샷 없는 SETTLED 는 null 을 반환한다.
-- ------------------------------------------------------------
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
  v_platform   numeric := 0.10;
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
      -- settlements 에 costs 열은 없다(0004 헤더 — 비저장). 구성 항목 합으로 되살린다
      'costs', st.seller_bonus + st.ref_boost + st.ref_reward + st.brand_ref_boost + st.brand_ref_reward + st.brand_discount,
      'platform_fee', st.platform_fee,
      'vat', st.vat, 'platform_net', st.platform_net, 'seller_fee_total', st.seller_fee_total,
      'brand_payout', st.brand_payout,
      'sample_cel_cover', coalesce(c.sample_cel, 0)
        * coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'sample_cel_won'), 20000));
  end if;

  v_pg := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'pg_rate'), v_pg);
  v_platform := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'platform_rate'), v_platform);
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
  v_pfg     := v_net * v_platform;
  v_costs   := v_gb + v_boost + v_reward + v_bboost + v_breward + v_bdisc;
  v_pf      := v_pfg - v_costs;
  v_vat     := case when v_pf > 0 then v_pf - v_pf / 1.1 else 0 end;
  v_pfnet   := v_pf - v_vat;
  v_sf_total := v_sf + v_gb + v_boost;
  v_brand_pay := v_net - v_pgf - v_sf - v_pfg + v_bboost + v_bdisc;

  return jsonb_build_object(
    'campaign_id', c.id, 'campaign_code', c.code, 'campaign_status', c.status, 'source', 'live',
    'product_name', p.name, 'product_code', p.code, 'seller_handle', s.handle, 'seller_name', s.name,
    'brand_name', b.name, 'brand_code', b.code,
    'paid_count', v_paid_count, 'refund_count', v_refund_count,
    'gross', round(v_gross), 'refunds', round(v_refunds), 'net', round(v_net), 'sample_net', round(v_sample_net),
    'pg_fee', round(v_pgf), 'seller_fee', round(v_sf), 'seller_bonus', round(v_gb),
    'ref_boost', round(v_boost), 'ref_reward', round(v_reward),
    'brand_ref_boost', round(v_bboost), 'brand_ref_reward', round(v_breward), 'brand_discount', round(v_bdisc),
    'platform_fee_gross', round(v_pfg), 'costs', round(v_costs), 'platform_fee', round(v_pf),
    'vat', round(v_vat), 'platform_net', round(v_pfnet), 'seller_fee_total', round(v_sf_total),
    'brand_payout', round(v_brand_pay), 'sample_cel_cover', coalesce(c.sample_cel, 0) * v_cel_won);
end;
$$;
revoke all on function public.admin_campaign_pnl(uuid) from public, anon, authenticated;
grant execute on function public.admin_campaign_pnl(uuid) to service_role;

-- ------------------------------------------------------------
-- app_admin_revenue() — 매출·순수익 화면 전체.
--   캠페인 집합 = LIVE · CLEARING · SETTLED **또는** 샘플 구매 주문(is_sample · PAID)이 있는 캠페인
--                 (데모 revenue 4행 · sample-policy §169). 대시보드(LIVE·CLEARING·SETTLED)와 다르다 — §172.
--   반환: { ok:true, totals{}, rows[], celery{}, cel_cover, opex{}, counts{} }
--     totals  손익 요약 19항목 합계. 스냅샷 없는 SETTLED 는 금액에서 빠지고 `no_snapshot` 으로 센다
--     rows    판매별 손익 (최근 생성순)
--     celery  충전 매출 · 무상 발행 · 획득 · 소진 · 미사용 잔액
--     opex    platform_settings.opex_default (운영 비용 입력 기본값)
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
    'paid_count', a_paid, 'refund_count', a_refund_cnt);

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
revoke all on function public.app_admin_revenue() from public, anon, authenticated;
grant execute on function public.app_admin_revenue() to service_role;

-- ------------------------------------------------------------
-- app_admin_save_opex(p_opex) — 운영 비용 입력 저장 (데모 act.saveOpex).
--   `platform_settings.opex_default` 한 행을 덮어쓴다. 값은 **0 이상 정수**만 받고, 아는 키만 남긴다
--   (모르는 키가 섞여 화면 계산이 어긋나지 않게).
--   반환: { ok:true, opex } · { ok:false, code:'BAD_INPUT' }
-- ------------------------------------------------------------
create or replace function public.app_admin_save_opex(p_opex jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_keys  text[] := array['server','db','cs','domain','misc','pgFixed','kakaoPer','claudePerCrawl','claudePerMatch'];
  v_out   jsonb := '{}'::jsonb;
  k       text;
  v_num   numeric;
begin
  if p_opex is null or jsonb_typeof(p_opex) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'BAD_INPUT');
  end if;
  foreach k in array v_keys loop
    begin
      v_num := (p_opex ->> k)::numeric;
    exception when others then
      v_num := null;
    end;
    if v_num is null or v_num < 0 then
      v_num := 0;
    end if;
    v_out := v_out || jsonb_build_object(k, round(v_num));
  end loop;

  insert into public.platform_settings (key, value) values ('opex_default', v_out)
    on conflict (key) do update set value = excluded.value;

  return jsonb_build_object('ok', true, 'opex', v_out);
end;
$$;
revoke all on function public.app_admin_save_opex(jsonb) from public, anon, authenticated;
grant execute on function public.app_admin_save_opex(jsonb) to service_role;
