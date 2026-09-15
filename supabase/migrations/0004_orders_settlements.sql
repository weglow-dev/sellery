-- ============================================================
-- 0004 — 고객 · 주문 · 정산(스냅샷) · 지급
--
-- 원본: orders[] (mkOrders L1327-1341, buyNow L4355-4376, refund L4245-4252, saveTrackOne L4105, CSV L4119-4144),
--       calc() L1634-1655 정산 수식, runSettle L4253-4274, settlements[] L4260, sellerWht L1656, settleDue L1657.
-- 실행: 0003 이후. 재실행 가능.
--
-- 정산 규칙(앱 계산, DB 는 스냅샷 보관) — calc() L1634-1655 그대로:
--   gross = Σ unit×qty (status≠CANCELED) · refunds = Σ REFUNDED · net = gross − refunds
--   sample_net = Σ (is_sample & PAID) — 인플루언서 수수료·보너스 계산에서만 제외
--   pg_fee = net×pg_rate · seller_fee = (net−sample_net)×seller_rate · seller_bonus = (net−sample_net)×seller_bonus_pp/100
--   추천 4라인의 기준은 net (sample_net 을 빼지 않는다 — L1644-1645):
--     ref_boost = net×ref_boost_rate · ref_reward = net×ref_reward_rate            (피추천 인플루언서 첫 5회 판매, isRefBoost L1617)
--     brand_ref_boost = net×brand_ref_disc_rate · brand_ref_reward = net×brand_ref_reward_rate (피추천 브랜드 첫 3회, L1625)
--     적용되지 않으면 네 rate 는 0 으로 저장 (applied 플래그 ⇔ rate > 0).
--   brand_discount = net×brand_discount_rate(브랜드 등급 fee_discount) · platform_fee_gross = net×platform_rate
--   costs(파생, 비저장) = seller_bonus+ref_boost+ref_reward+brand_ref_boost+brand_ref_reward+brand_discount
--   platform_fee = platform_fee_gross − costs
--   vat = platform_fee − platform_fee/1.1 (platform_fee>0, 아니면 0) · platform_net = platform_fee − vat
--   seller_fee_total = seller_fee + seller_bonus + ref_boost
--   brand_payout = net − pg_fee − seller_fee − platform_fee_gross + brand_ref_boost + brand_discount
--   seller_wht = seller_fee_total×wht_rate · seller_payout = seller_fee_total − seller_wht + sample_refund_cash
--   wht_rate: sellers.settle_type = 'biz' 일 때만 0, 'personal' 과 null(정산 정보 미등록) 은 platform_settings.wht_rate(0.033)
--     (sellerWht L1656 — biz 가 아니면 전부 3.3%).
--   due_on = end_date + clear_days(21). 결제 건수(파생, 비저장) = paid_count + refund_count.
-- 반올림 계약 (프로토타입은 sellerPay/platFee/pfNet 을 float 로 보관 L4260 — DB 는 KRW 정수):
--   서버는 모든 라인을 double 로 calc() 와 똑같이 계산한 뒤, 저장하는 각 라인을 **독립적으로** 원 단위 반올림한다
--   (JS Math.round 와 같은 floor(x+0.5)). 저장된 라인에서 다른 라인을 다시 계산하지 않는다 — 그래서 저장값끼리는
--   ±수 원 정도 맞지 않을 수 있다 (예: platform_fee ≠ platform_fee_gross − Σcosts 저장값). 지급액(seller_payout/brand_payout/
--   payouts.amount)은 반올림된 저장값이 계약 금액이다.
-- ============================================================

-- ============================================================
-- customers — 구매 고객 (프로토타입에는 계정 모델 없음: buyer 마스킹 문자열만. 실서비스 카카오 로그인 → user_id)
-- ============================================================
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users (id) on delete set null,   -- null = 비회원
  name        text,
  phone       text,
  email       text,
  address     jsonb,                                  -- 기본 배송지 { postcode, address1, address2, recipient, phone }
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists customers_user_id_idx on public.customers (user_id);

drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.customers enable row level security;
revoke all on public.customers from anon, authenticated;
grant select (id, user_id, name, phone, email, address) on public.customers to authenticated;
drop policy if exists "customers_select_own" on public.customers;
create policy "customers_select_own"
  on public.customers for select
  using (auth.uid() = user_id);

-- ============================================================
-- orders — 캠페인(판매 링크) 주문. 인플루언서 샘플 구매도 주문 1건 (is_sample, L3884).
--   배송 상태는 별도 컬럼 없이 status='PAID' && tracking_no 로 판정 (L3051, L2797).
--   status 'CANCELED' 는 프로토타입에서 읽기(calc L1636)만 있고 쓰기가 없으나 enum 에 포함한다.
-- ============================================================
-- 주문번호 (PG 전달·CS 입력용). 시드 o100~o1151 과 겹치지 않게 2000 부터.
create sequence if not exists public.order_code_seq start 2000;

create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique default ('o' || nextval('public.order_code_seq')),   -- 프로토타입 id ('o101')
  campaign_id     uuid not null references public.campaigns (id) on delete restrict,
  customer_id     uuid references public.customers (id) on delete set null,
  user_id         uuid references auth.users (id) on delete set null,   -- 구매자 본인 조회용 (nullable: 비회원)
  status          text not null default 'PAID'
                    check (status in ('PAID','REFUNDED','CANCELED')),
  buyer_name      text not null,                      -- o.buyer 표시명 (인플루언서 화면엔 마스킹 '김*은' 규칙 적용 — 앱)
  qty             integer not null check (qty > 0),   -- 고객 1..10 (앱)
  unit_price      integer not null check (unit_price >= 0),   -- o.unit 옵션가 스냅샷
  amount          integer generated always as (qty * unit_price) stored,
  option_name     text,                               -- o.opt 옵션명 (옵션 id 없음 — 프로토타입 동일)
  is_sample       boolean not null default false,     -- o.sample 인플루언서 샘플 구매분 (환불 불가 L4248)
  -- 배송 (브랜드 직배송). 수취인 실명·연락처·주소는 브랜드만 — 인플루언서 응답에서 제거 (access §2.6)
  shipping        jsonb,                              -- { recipient, phone, postcode, address1, address2, memo }
  courier         text check (courier is null or courier in ('CJ대한통운','우체국택배','한진택배','롯데택배','로젠택배')),
  tracking_no     text,                               -- o.tracking
  shipped_at      timestamptz,
  -- 결제 (PG 연동 시 — glo 0001 orders 와 동일 필드)
  payment_key     text,
  payment_method  text,
  paid_at         timestamptz not null default now(), -- o.at (주문일)
  refunded_at     timestamptz,
  refund_reason   text,
  raw_payment     jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint orders_refunded_has_time
    check (status <> 'REFUNDED' or refunded_at is not null),
  -- flows §10-7: 샘플 구매분은 환불 불가 (L4248)
  constraint orders_sample_not_refunded
    check (not is_sample or status <> 'REFUNDED')
);

create index if not exists orders_campaign_idx  on public.orders (campaign_id, status);
create index if not exists orders_customer_idx  on public.orders (customer_id);
create index if not exists orders_user_id_idx   on public.orders (user_id);
create index if not exists orders_status_idx    on public.orders (status);
create index if not exists orders_paid_at_idx   on public.orders (paid_at desc);
create index if not exists orders_unshipped_idx on public.orders (campaign_id) where status = 'PAID' and tracking_no is null;

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- campaigns.sold_qty 유지 (soldQty L1403 = PAID 주문 Σqty). 주문 생성·환불·삭제 시 같은 트랜잭션에서 재계산.
create or replace function public.recalc_campaign_sold_qty(p_campaign uuid)
returns void
language sql
set search_path = public
as $$
  update public.campaigns c
     set sold_qty = coalesce((select sum(o.qty) from public.orders o
                              where o.campaign_id = p_campaign and o.status = 'PAID'), 0)
   where c.id = p_campaign;
$$;

-- security definer: 캐시 갱신은 쓰는 쪽의 역할과 무관하게 동작해야 한다 — 나중에 고객 결제 insert 정책이 생겨도
-- campaigns 가 RLS 로 가려져 update 가 0행이 되거나 recalc 의 execute 가 없어 실패하지 않도록 소유자 권한으로 돈다.
create or replace function public.orders_sync_sold_qty()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recalc_campaign_sold_qty(new.campaign_id);
  elsif tg_op = 'DELETE' then
    perform public.recalc_campaign_sold_qty(old.campaign_id);
  else
    perform public.recalc_campaign_sold_qty(old.campaign_id);
    if new.campaign_id is distinct from old.campaign_id then
      perform public.recalc_campaign_sold_qty(new.campaign_id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists orders_sync_sold_qty on public.orders;
create trigger orders_sync_sold_qty
  after insert or update or delete on public.orders
  for each row execute function public.orders_sync_sold_qty();

alter table public.orders enable row level security;
revoke all on public.orders from anon, authenticated;
-- 구매자 본인만 자기 주문의 요약 컬럼 (결제 원문·배송지 원문은 서버 응답으로만). 브랜드·인플루언서·관리자는 서버 경유.
-- user_id 는 정책이 참조하는 자기 컬럼이라 grant 없이도 동작하지만(추정) 본인 행이라 새는 것이 없으므로 포함한다.
grant select (id, code, campaign_id, user_id, status, qty, unit_price, amount, option_name, courier, tracking_no,
              shipped_at, paid_at, refunded_at)
  on public.orders to authenticated;

drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own"
  on public.orders for select
  using (auth.uid() = user_id);

-- 브랜드 누적 GMV = gmv_base + Σ PAID 주문금액(전 상태 캠페인, 샘플 포함) — bGmv L1529-1532 / netOf L1534
create or replace function public.brand_gmv(p_brand uuid)
returns bigint
language sql stable
set search_path = public
as $$
  select coalesce(b.gmv_base, 0)
       + coalesce((select sum(o.amount)::bigint
                     from public.orders o
                     join public.campaigns c on c.id = o.campaign_id
                    where c.brand_id = p_brand and o.status = 'PAID'), 0)
    from public.brands b where b.id = p_brand
$$;

-- ============================================================
-- settlements — 정산 실행 스냅샷 (캠페인당 1행 — runSettle 재실행 방지 유니크)
--   금액 라인은 bigint (sellers.m3_sales / brands.gmv_base / brand_gmv() 와 같은 폭 — net 이 m3_sales 증분의 원천).
--   SETTLED 캠페인 ⇔ settlements 1행 은 서버 트랜잭션 불변식이다 (DB 제약 아님). 시드 c6 은 프로토타입 parity 로
--   settlements 없이 SETTLED 다 — 서버 코드는 "SETTLED ⇒ 스냅샷 존재" 를 가정하지 말고 left join 한다.
-- ============================================================
create table if not exists public.settlements (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null unique references public.campaigns (id) on delete restrict,
  title               text,                           -- '{p.name} · {s.handle}' (L4260)
  -- 주문 집계
  paid_count          integer not null default 0,
  refund_count        integer not null default 0,
  gross               bigint not null default 0,
  refunds             bigint not null default 0,
  net                 bigint not null default 0,
  sample_net          bigint not null default 0,
  -- 수수료율 스냅샷 (정산 시점 platform_settings / 등급 / 상품 rate)
  pg_rate             numeric(5,4) not null check (pg_rate >= 0 and pg_rate <= 1),
  platform_rate       numeric(5,4) not null check (platform_rate >= 0 and platform_rate <= 1),
  seller_rate         numeric(5,4) not null check (seller_rate >= 0 and seller_rate <= 1),
  seller_grade        text,                           -- 정산 시점 등급
  seller_bonus_pp     numeric(4,2) not null default 0,
  brand_grade         text,
  brand_discount_rate numeric(5,4) not null default 0,
  wht_rate            numeric(5,4) not null default 0 check (wht_rate >= 0 and wht_rate <= 1),   -- 0.0330 / 0
  ref_boost_applied   boolean not null default false, -- isRefBoost
  brand_ref_applied   boolean not null default false, -- isBrandRefBoost
  ref_boost_rate        numeric(5,4) not null default 0 check (ref_boost_rate >= 0),        -- REF_BOOST 0.01 (미적용 0)
  ref_reward_rate       numeric(5,4) not null default 0 check (ref_reward_rate >= 0),       -- REF_RATE 0.02
  brand_ref_disc_rate   numeric(5,4) not null default 0 check (brand_ref_disc_rate >= 0),   -- BREF_DISC 0.01
  brand_ref_reward_rate numeric(5,4) not null default 0 check (brand_ref_reward_rate >= 0), -- BREF_RATE 0.01
  -- 금액 라인 (KRW 정수 — 각 라인 독립 반올림, 헤더의 계약 참고)
  pg_fee              bigint not null default 0,
  seller_fee          bigint not null default 0,      -- sf
  seller_bonus        bigint not null default 0,      -- gBonus
  ref_boost           bigint not null default 0,      -- boost (+1%p 피추천 인플루언서)
  ref_reward          bigint not null default 0,      -- refReward (2% 추천인)
  brand_ref_boost     bigint not null default 0,      -- bBoost (−1%p 피추천 브랜드)
  brand_ref_reward    bigint not null default 0,      -- bReward (1% 추천 브랜드)
  brand_discount      bigint not null default 0,      -- bDisc (등급 할인)
  platform_fee_gross  bigint not null default 0,      -- pfGross
  platform_fee        bigint not null default 0,      -- pf (admin 전용 노출)
  vat                 bigint not null default 0,
  platform_net        bigint not null default 0,      -- pfNet (admin 전용 노출)
  seller_fee_total    bigint not null default 0,      -- sfTotal (세전)
  seller_wht          bigint not null default 0,      -- 원천징수액
  sample_refund_cel   integer not null default 0,     -- 샘플 구매 🥬 환급
  sample_refund_cash  bigint not null default 0,      -- 샘플 구매 현금 환급
  brand_payout        bigint not null default 0,      -- brandPay
  seller_payout       bigint not null default 0,      -- sellerPay = sfTotal − seller_wht + sample_refund_cash
  -- 지급 상태
  hold_seller         boolean not null default false, -- holdS 인플루언서 계좌 미등록
  hold_brand          boolean not null default false, -- holdB 브랜드 계좌 미등록
  status              text not null default 'pending'
                        check (status in ('pending','held','paid')),
  due_on              date,                           -- settleDue = end_date + CLEAR_DAYS
  settled_at          timestamptz not null default now(),   -- 실행 시각 (at) — campaigns.settled_at 과 같은 값
  paid_at             timestamptz,                    -- 양측 지급 완료 시각
  memo                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists settlements_status_idx     on public.settlements (status);
create index if not exists settlements_settled_at_idx on public.settlements (settled_at desc);

drop trigger if exists settlements_updated_at on public.settlements;
create trigger settlements_updated_at
  before update on public.settlements
  for each row execute function public.set_updated_at();

alter table public.settlements enable row level security;
revoke all on public.settlements from anon, authenticated;
-- 정책 없음. 인플루언서는 net/seller_payout/hold_seller, 브랜드는 net/brand_payout/hold_brand,
-- platform_fee/platform_net 는 관리자만 — 모두 서버 응답 조립에서 컬럼을 고른다 (access §2.10).

-- ============================================================
-- payouts — 정산 1건당 인플루언서/브랜드 지급 2행. 보류·지급 배치 추적.
-- ============================================================
create table if not exists public.payouts (
  id              uuid primary key default gen_random_uuid(),
  settlement_id   uuid not null references public.settlements (id) on delete cascade,
  payee_type      text not null check (payee_type in ('seller','brand')),
  seller_id       uuid references public.sellers (id) on delete restrict,
  brand_id        uuid references public.brands (id) on delete restrict,
  amount          bigint not null check (amount >= 0),
  wht             bigint not null default 0 check (wht >= 0),   -- 원천징수 (인플루언서 개인)
  status          text not null default 'pending'
                    check (status in ('pending','held','paid')),
  hold_reason     text,                               -- '정산 계좌 미등록' 등
  bank_snapshot   jsonb,                              -- 지급 시점 계좌 { bank, account, holder }
  paid_at         timestamptz,
  memo            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint payouts_payee_matches_type
    check ((payee_type = 'seller' and seller_id is not null and brand_id is null)
        or (payee_type = 'brand'  and brand_id  is not null and seller_id is null))
);

create unique index if not exists payouts_settlement_payee_uidx on public.payouts (settlement_id, payee_type);
create index if not exists payouts_seller_idx on public.payouts (seller_id);
create index if not exists payouts_brand_idx  on public.payouts (brand_id);
create index if not exists payouts_status_idx on public.payouts (status);

drop trigger if exists payouts_updated_at on public.payouts;
create trigger payouts_updated_at
  before update on public.payouts
  for each row execute function public.set_updated_at();

alter table public.payouts enable row level security;
revoke all on public.payouts from anon, authenticated;

-- 서버 전용 함수 실행 권한 정리 (Supabase 는 public 함수에 execute 를 기본 부여)
revoke all on function public.recalc_campaign_sold_qty(uuid) from public, anon, authenticated;
revoke all on function public.orders_sync_sold_qty() from public, anon, authenticated;
revoke all on function public.brand_gmv(uuid) from public, anon, authenticated;
