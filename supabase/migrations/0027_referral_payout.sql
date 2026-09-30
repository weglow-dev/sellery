-- ============================================================
-- 0027 — 추천 보상 입금 (데려온 사람 몫)
--
-- 배경: 인플루언서 제안서 p.10 "추천하시면 그분의 첫 5회 판매 확정 매출의 2%를 받으시고,
--   추천받은 분은 첫 5회 수수료 +1%p". 두 약속 중 **하나만 지켜지고 있었다**.
--     들어온 사람(피추천인)  +1%p → `seller_fee_total = seller_fee + bonus + ref_boost` 에 포함돼 정상 지급
--     데려온 사람(추천인)    2%   → `settlements.ref_reward` 로 계산·기록되고 플랫폼 비용(`costs`)에서
--                                차감되지만 **`payouts` 행이 없어 실제 입금이 일어나지 않았다**
--   프로토타입도 같다 — `runSettle`(actions.ts:236)이 `refEarnings` 적재와 스레드 메시지까지만 하고
--   `refReward` 는 어느 지급액에도 들어가지 않는다(`sfTotal = sf + gBonus + boost`). 베낄 설계가 없어 새로 만든다.
--
-- 방식 (운영 확인 2026-09-29)
--   · 지급 대상 = `payouts` 에 `payee_type='referrer'` 행 1개 (추천인의 `sellers.id` → `seller_id` 칸)
--   · 금액      = `settlements.ref_reward` 전액
--   · 원천징수  = **하지 않는다**(`wht = 0`). 제안서·정책 문서에 추천 보상 원천징수를 요구하는 서술이 없다.
--                첫 실제 이체 전에 세무 확인이 필요하다 — 사업소득이면 의무 대상일 수 있고, 그때는
--                이 파일의 `wht` 계산과 `admin_payout_hold_reason` 의 referrer 분기만 바꾸면 된다.
--   · 시점      = 들어온 사람의 캠페인 정산과 **같은 트랜잭션**. 스레드 "추천 보상 지급" 메시지와 같은 시점.
--   · 계좌 없음  = `held`(`BANK_MISSING`). 등록되면 기존 `app_admin_payout_release` 가 풀어 준다.
--   · 브랜드 추천 보상(`brand_ref_reward`)은 **넣지 않는다** — 제안서에 없는 항목이다(코드에만 있음).
--                기록은 계속 남으므로 필요해지면 같은 방식으로 붙일 수 있다.
--
-- 구현: `app_admin_settle_run`(0020 · 219줄)을 복사해 재정의하지 않고 **`settlements` AFTER INSERT 트리거**로
--   붙인다. 0020 을 그대로 둬 두 벌 관리를 피하고, 정산 스냅샷과 같은 트랜잭션이라 원자성도 지켜진다.
--   선례: `orders_sync_sold_qty`(0004 · after insert 로 `campaigns.sold_qty` 갱신).
--   `settlements.campaign_id` 가 unique 라 캠페인당 한 번만 돈다 — 멱등성은 그 제약이 보장한다.
-- ============================================================

-- ------------------------------------------------------------
-- payouts.payee_type 에 'referrer' 추가
--   `payouts_settlement_payee_uidx`(0004 · UNIQUE (settlement_id, payee_type)) 는 그대로 둔다 —
--   정산 1건에 추천인은 최대 1명이므로 "정산당 추천인 1행" 이라는 올바른 제약이 된다.
-- ------------------------------------------------------------
alter table public.payouts drop constraint if exists payouts_payee_type_check;
alter table public.payouts
  add constraint payouts_payee_type_check
  check (payee_type in ('seller', 'brand', 'referrer'));

alter table public.payouts drop constraint if exists payouts_payee_matches_type;
alter table public.payouts
  add constraint payouts_payee_matches_type
  check ((payee_type in ('seller', 'referrer') and seller_id is not null and brand_id is null)
      or (payee_type = 'brand' and brand_id is not null and seller_id is null));

comment on column public.payouts.payee_type is
  'seller = 캠페인 인플루언서 · brand = 캠페인 브랜드 · referrer = 그 인플루언서를 데려온 추천인(0027 · settlements.ref_reward · 원천징수 없음)';

-- ------------------------------------------------------------
-- admin_payout_hold_reason — referrer 분기 추가 (0020 판을 재정의)
--   추천인은 **계좌만** 본다. 원천징수를 하지 않으므로 주민번호(RRN_MISSING)·사업자 정보
--   (TAX_INFO_MISSING)는 검사하지 않는다 — 검사하면 자기 판매가 없는 추천인이 영구 보류된다.
--   seller · brand 분기는 0020 과 같다.
-- ------------------------------------------------------------
create or replace function public.admin_payout_hold_reason(p_payee_type text, p_seller_id uuid, p_brand_id uuid)
returns text
language plpgsql stable
security definer set search_path = public
as $$
declare
  s public.sellers%rowtype;
  b public.brands%rowtype;
begin
  if p_payee_type = 'seller' then
    select * into s from public.sellers where id = p_seller_id;
    if not found then return 'BANK_MISSING'; end if;
    if s.bank_info is null or coalesce(s.bank_info ->> 'account', '') = '' then return 'BANK_MISSING'; end if;
    if s.settle_type = 'biz' then
      if coalesce(s.biz_no, '') = '' or s.tax_info is null or coalesce(s.tax_info ->> 'company', '') = '' then return 'TAX_INFO_MISSING'; end if;
    elsif s.rrn_set_at is null then
      return 'RRN_MISSING';
    end if;
    return null;
  elsif p_payee_type = 'referrer' then
    -- 추천 보상(0027): 계좌만 본다
    select * into s from public.sellers where id = p_seller_id;
    if not found then return 'BANK_MISSING'; end if;
    if s.bank_info is null or coalesce(s.bank_info ->> 'account', '') = '' then return 'BANK_MISSING'; end if;
    return null;
  elsif p_payee_type = 'brand' then
    select * into b from public.brands where id = p_brand_id;
    if not found then return 'SETTLE_INFO_INCOMPLETE'; end if;
    if not public.brand_settle_info_complete(b) then return 'SETTLE_INFO_INCOMPLETE'; end if;
    return null;
  end if;
  return null;
end;
$$;

revoke all on function public.admin_payout_hold_reason(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_payout_hold_reason(text, uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- settlements_pay_referrer() — 정산 스냅샷이 생기면 추천인 지급 행을 만든다
--   조건: ref_reward > 0 · 캠페인 인플루언서에게 referred_by 가 있고 그 추천인이 실재함
--   ("첫 5회" 판정은 0020 이 이미 했다 — 통과하지 못하면 ref_reward 가 0 이다)
-- ------------------------------------------------------------
create or replace function public.settlements_pay_referrer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_ref_id   uuid;
  v_bank     jsonb;
  v_hold     text;
  v_code     text;
begin
  if coalesce(new.ref_reward, 0) <= 0 then
    return new;
  end if;

  -- 캠페인 → 인플루언서 → 추천인
  select r.id, r.bank_info, c.code into v_ref_id, v_bank, v_code
    from public.campaigns c
    join public.sellers s on s.id = c.seller_id
    join public.sellers r on r.id = s.referred_by
   where c.id = new.campaign_id;

  if v_ref_id is null then
    -- 추천인이 지워졌거나 referred_by 가 비었다 — 금액은 스냅샷에 남고 지급 행은 만들지 않는다
    return new;
  end if;

  v_hold := public.admin_payout_hold_reason('referrer', v_ref_id, null);

  insert into public.payouts (
    settlement_id, payee_type, seller_id, amount, wht,
    status, hold_code, hold_reason, bank_snapshot, memo)
  values (
    new.id, 'referrer', v_ref_id, greatest(new.ref_reward, 0), 0,
    case when v_hold is null then 'pending' else 'held' end,
    v_hold,
    case when v_hold is null then null else public.admin_hold_label(v_hold) end,
    public.admin_bank_snapshot(v_bank),
    '추천 보상 · ' || coalesce(v_code, ''))
  on conflict (settlement_id, payee_type) do nothing;

  return new;
end;
$$;

revoke all on function public.settlements_pay_referrer() from public, anon, authenticated;

drop trigger if exists settlements_pay_referrer on public.settlements;
create trigger settlements_pay_referrer
  after insert on public.settlements
  for each row execute function public.settlements_pay_referrer();

-- ------------------------------------------------------------
-- admin_settlement_json — payouts.referrer · 추천인 프로필 추가 (0020 판을 재정의)
--   관리자 지급 목록(`/settle/payouts`)이 `payouts.seller`·`payouts.brand` 만 펼쳐 보여줬기 때문에
--   추천인 지급 행이 화면에 뜨지 않았다. 나머지 키는 0020 과 같다.
-- ------------------------------------------------------------
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
