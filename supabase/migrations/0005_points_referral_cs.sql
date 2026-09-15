-- ============================================================
-- 0005 — 셀러리(🥬) 포인트 원장 · 유료 아이템 보유 · 데이터 열람 · 추천 보상 · 외부 판매 감지 · 고객 CS
--
-- 원본: celeryLedger (L1230-1239, celSpend L1482, topup L4037, admGrant L4440),
--       SHOP/celeryItems/passActive (L1433-1450, L1481, buyItem L4020-4036, buyDataPass L4044),
--       brandDataUnlocks/unlockedRefs/spendData (L1269-1270, L1387-1391, L3888-3917),
--       refEarnings/brandRefEarnings (L1284, L1227, runSettle L4262-4271),
--       external (L1271-1280), cs (L1318-1321, submitCS L4378, saveCSReply L4397, csClose L4404).
-- 실행: 0004 이후. 재실행 가능.
--
-- 잔액 모델: 프로토타입은 celBal = floor(m3Sales 또는 bGmv / CELERY_PER)(파생) + Σ ledger.delta (L1452-1456).
--   DB 는 획득분도 원장 행(reason='earned')으로 적재하는 것을 표준으로 한다(추정 설계 — 서버가 정산/GMV 갱신 시 기록).
--   잔액은 celery_balances 뷰(Σ delta). 차감 전 잔액 검사는 서버 RPC/트랜잭션에서 (glo 0009 use_points 패턴).
-- ============================================================

-- ============================================================
-- celery_ledger — 🥬 원장 (who 가 seller/brand 혼용 문자열이던 것을 seller_id/brand_id 로 분리)
-- ============================================================
create table if not exists public.celery_ledger (
  id          uuid primary key default gen_random_uuid(),
  owner_type  text not null check (owner_type in ('seller','brand')),
  seller_id   uuid references public.sellers (id) on delete cascade,
  brand_id    uuid references public.brands (id) on delete cascade,
  delta       integer not null check (delta <> 0),   -- +지급 / −차감
  -- 사유 (프로토타입 memo 패턴 §3.6 을 슬러그로; memo 에는 원문 표시 문자열)
  reason      text not null check (reason in (
                'earned',            -- 확정 매출 ₩500만당 1🥬 (celEarned — 서버 적재)
                'signup_bonus',      -- '가입 축하 지급' (platform_settings signup_bonus_cel)
                'onboarding_bonus',  -- '입점 이벤트 지급' (onboarding_bonus_cel)
                'admin_grant',       -- '관리자 이벤트 지급' (admGrant, admin_grant_cel)
                'topup',             -- '셀러리 충전 (₩n 결제)' — won 기록
                'shop_item',         -- '{item.name} 구매' / '매출 데이터 확인권 구매' (buyItem, buyDataPass)
                'data_unlock',       -- '데이터 확인 · {name} {handle} ({등급})' (unlockSellerData)
                'ref_unlock',        -- '익명 레퍼런스 열람 · ○○○ 인플루언서 ({등급})' (unlockRef)
                'sample_purchase',   -- '샘플 구매 · {p.name} (₩n 상당)' (confirmSampleBuy, method=cel)
                'sample_refund',     -- '샘플 구매 환급 · {p.name}' (runSettle)
                'invite',            -- '{다이아|블랙} 인플루언서 제안 · {p.name}' (confirmInvite, grade_tiers.invite_cost_cel)
                'auto_invite',       -- '{등급} 인플루언서 자동 제안 · {p.name}' (runAutoPropose)
                'invite_refund',     -- '제안 거절 환급 · {p.name}' (declineInvite)
                'adjust'             -- 운영 조정
              )),
  memo        text,
  won         integer check (won is null or won >= 0),   -- 충전 결제액 KRW (topup 만, L4041 — 충전 매출 집계 L3154)
  ref_type    text,                                   -- 'campaign' | 'product' | 'seller' | 'settlement' | 'purchase' …
  ref_id      uuid,
  created_at  timestamptz not null default now(),     -- e.at
  constraint celery_ledger_owner_matches_type
    check ((owner_type = 'seller' and seller_id is not null and brand_id is null)
        or (owner_type = 'brand'  and brand_id  is not null and seller_id is null))
);

create index if not exists celery_ledger_seller_idx on public.celery_ledger (seller_id, created_at desc);
create index if not exists celery_ledger_brand_idx  on public.celery_ledger (brand_id, created_at desc);
create index if not exists celery_ledger_reason_idx on public.celery_ledger (reason);
create index if not exists celery_ledger_topup_idx  on public.celery_ledger (created_at desc) where won is not null;

alter table public.celery_ledger enable row level security;
revoke all on public.celery_ledger from anon, authenticated;
-- 정책 없음 → 본인 잔액·내역도 서버 경유 (충전/차감/환급/지급 전부 서버).

-- 잔액 뷰 (celBal) — Σ delta. 소유자별 1행.
create or replace view public.celery_balances
with (security_invoker = true) as
  select owner_type,
         coalesce(seller_id, brand_id) as owner_id,
         seller_id,
         brand_id,
         sum(delta)::integer as balance,
         max(created_at)     as last_entry_at
    from public.celery_ledger
   group by owner_type, seller_id, brand_id;

revoke all on public.celery_balances from anon, authenticated;

-- ============================================================
-- celery_purchases — 유료 아이템 보유(엔타이틀먼트). 프로토타입 sellers/brands/products.celeryItems{id: 'YYYY-MM-DD'} 대체.
--   item_id = SHOP 카탈로그 id (L1433-1450, platform_settings 'shop_items'). expires_on null = 영구(datapass 인플루언서용).
--   기간형(featured/homefeature/boost 7일, datapass 브랜드 30일, regongu 30일)은 서버가 purchased_on + shop_items[].days 로 세팅.
--   'auto' 아이템(samplepay/diamond/ref/sdata)은 별도 행 없이 원장 reason 으로만 추적한다.
-- ============================================================
create table if not exists public.celery_purchases (
  id            uuid primary key default gen_random_uuid(),
  owner_type    text not null check (owner_type in ('seller','brand')),
  seller_id     uuid references public.sellers (id) on delete cascade,
  brand_id      uuid references public.brands (id) on delete cascade,
  item_id       text not null check (item_id in (
                  'datapass','featured','homefeature','regongu',        -- seller (L1434-1440)
                  'boost','fastreview'                                  -- brand  (L1441-1449; datapass/homefeature 공용)
                )),
  price_cel     integer not null check (price_cel >= 0),
  product_id    uuid references public.products (id) on delete set null,    -- boost 대상 상품
  ledger_id     uuid references public.celery_ledger (id) on delete set null,
  purchased_on  date not null default current_date,
  expires_on    date,                                 -- null = 영구
  created_at    timestamptz not null default now(),
  constraint celery_purchases_owner_matches_type
    check ((owner_type = 'seller' and seller_id is not null and brand_id is null)
        or (owner_type = 'brand'  and brand_id  is not null and seller_id is null)),
  constraint celery_purchases_expiry_valid
    check (expires_on is null or expires_on >= purchased_on)
);

create index if not exists celery_purchases_seller_idx  on public.celery_purchases (seller_id, item_id);
create index if not exists celery_purchases_brand_idx   on public.celery_purchases (brand_id, item_id);
create index if not exists celery_purchases_active_idx  on public.celery_purchases (item_id, expires_on);
create index if not exists celery_purchases_product_idx on public.celery_purchases (product_id);
create index if not exists celery_purchases_ledger_idx  on public.celery_purchases (ledger_id);

alter table public.celery_purchases enable row level security;
revoke all on public.celery_purchases from anon, authenticated;

-- ============================================================
-- data_views — 브랜드의 인플루언서 데이터 열람 기록
--   kind 'data' = brandDataUnlocks (성과 데이터, unlockSellerData L3888)
--   kind 'ref'  = unlockedRefs (비공개 인플루언서 레퍼런스, unlockRef L3895) — 프로토타입은 브랜드 스코프가 없는
--                 전역 배열이었으나 차감은 브랜드 잔액에서 하므로 (brand_id, seller_id) 로 정규화 (access §2.9).
--   free = 다이아·블랙 브랜드 월 5회 무료 (freeRefLeft L1386 → brands.free_ref_used 증가).
-- ============================================================
create table if not exists public.data_views (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references public.brands (id) on delete cascade,
  seller_id   uuid not null references public.sellers (id) on delete cascade,
  kind        text not null check (kind in ('data','ref')),
  price_cel   integer not null default 0 check (price_cel >= 0),   -- 등급별 1–5 (grade_tiers.data_price_cel), 무료면 0
  free        boolean not null default false,
  ledger_id   uuid references public.celery_ledger (id) on delete set null,
  viewed_at   timestamptz not null default now()
);

create unique index if not exists data_views_brand_seller_kind_uidx on public.data_views (brand_id, seller_id, kind);
create index if not exists data_views_seller_idx on public.data_views (seller_id);
create index if not exists data_views_ledger_idx on public.data_views (ledger_id);

alter table public.data_views enable row level security;
revoke all on public.data_views from anon, authenticated;

-- ============================================================
-- referral_earnings — 추천 보상 (refEarnings: 인플루언서 net×2% / brandRefEarnings: 브랜드 net×1%, runSettle L4262-4271)
--   추천 관계 자체는 sellers.referred_by / brands.referred_by. "첫 5회/3회" 판정은 정산 시 서버가 계산 (isRefBoost L1617)
--   — referred_* 인덱스가 그 조회 키.
--   campaign_id nullable — 시드의 '(지난 판매)' 플레이스홀더 (L1228, L1285) 는 null + memo.
-- ============================================================
create table if not exists public.referral_earnings (
  id                  uuid primary key default gen_random_uuid(),
  side                text not null check (side in ('seller','brand')),
  referrer_seller_id  uuid references public.sellers (id) on delete cascade,   -- 보상 받는 추천인
  referred_seller_id  uuid references public.sellers (id) on delete cascade,   -- fromSellerId
  referrer_brand_id   uuid references public.brands (id) on delete cascade,
  referred_brand_id   uuid references public.brands (id) on delete cascade,    -- fromBrandId
  campaign_id         uuid references public.campaigns (id) on delete set null,
  settlement_id       uuid references public.settlements (id) on delete set null,
  rate                numeric(5,4) not null check (rate >= 0 and rate <= 1),   -- 0.0200 / 0.0100
  amount              integer not null check (amount >= 0),                    -- amt KRW
  memo                text,
  earned_on           date not null default current_date,                      -- at
  created_at          timestamptz not null default now(),
  constraint referral_earnings_side_matches
    check ((side = 'seller' and referrer_seller_id is not null and referred_seller_id is not null
                            and referrer_brand_id is null and referred_brand_id is null)
        or (side = 'brand'  and referrer_brand_id is not null and referred_brand_id is not null
                            and referrer_seller_id is null and referred_seller_id is null))
);

create index if not exists referral_earnings_referrer_seller_idx on public.referral_earnings (referrer_seller_id);
create index if not exists referral_earnings_referred_seller_idx on public.referral_earnings (referred_seller_id);
create index if not exists referral_earnings_referrer_brand_idx  on public.referral_earnings (referrer_brand_id);
create index if not exists referral_earnings_referred_brand_idx  on public.referral_earnings (referred_brand_id);
create index if not exists referral_earnings_campaign_idx        on public.referral_earnings (campaign_id);
create index if not exists referral_earnings_settlement_idx      on public.referral_earnings (settlement_id);

alter table public.referral_earnings enable row level security;
revoke all on public.referral_earnings from anon, authenticated;

-- ============================================================
-- seller_external_sales — 외부 판매 감지(크롤링 시드, external L1271-1280; estExternal L1480 은 앱 계산)
-- ============================================================
create table if not exists public.seller_external_sales (
  id            uuid primary key default gen_random_uuid(),
  seller_id     uuid not null references public.sellers (id) on delete cascade,
  product_name  text not null,
  brand_name    text,
  source        text not null check (source in ('instagram','youtube','naver','tiktok')),   -- src
  price         integer not null default 0 check (price >= 0),
  seen_on       date not null default current_date,  -- at
  created_at    timestamptz not null default now()
);

create index if not exists seller_external_sales_seller_idx on public.seller_external_sales (seller_id, seen_on desc);

alter table public.seller_external_sales enable row level security;
revoke all on public.seller_external_sales from anon, authenticated;

-- ============================================================
-- cs_conversations / cs_messages — 고객 문의 (캠페인 단위, 브랜드로 직행. glo 0015 구조)
--   프로토타입 cs {id,cid,orderId,buyer,type,msg,status,at,reply,repliedAt} 를
--   대화(conversation: type/status/캠페인/주문) + 메시지(customer 최초 문의, brand 답변) 로 나눈다.
--   주문 참조: 프로토타입은 고객이 타이핑한 문자열을 그대로 보관한다(L4379, L4383 — 맞지 않아도 저장).
--     order_code = 원문 입력, order_id = 서버가 orders.code 를 대소문자 무시·같은 캠페인 범위로 해석해 채운 FK (못 찾으면 null).
--   관리자는 현황 열람만(L3066) 이나 답변 대행 가능성을 위해 sender 'admin' 허용. cs_messages 도 sender(표시)/actor(실제) 분리.
--   비회원 고객 식별은 glo 0015 의 client_token 방식 (브라우저 저장 비밀값).
-- ============================================================
create sequence if not exists public.cs_code_seq start 100;   -- 시드 cs1, cs2 와 겹치지 않게

create table if not exists public.cs_conversations (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique default ('cs' || nextval('public.cs_code_seq')),   -- 프로토타입 id ('cs1')
  campaign_id       uuid not null references public.campaigns (id) on delete cascade,
  brand_id          uuid not null references public.brands (id) on delete cascade,   -- csBrandId 파생값을 저장
  order_code        text,                              -- 고객 입력 원문 (x.orderId)
  order_id          uuid references public.orders (id) on delete set null,   -- order_code 해석 결과 (없으면 null)
  customer_id       uuid references public.customers (id) on delete set null,
  user_id           uuid references auth.users (id) on delete set null,
  client_token      uuid not null unique default gen_random_uuid(),
  buyer_name        text not null default '고객',      -- x.buyer
  type              text not null check (type in ('배송 문의','교환·반품','상품 문의','기타')),   -- CS_TYPES L1690
  status            text not null default 'OPEN'
                      check (status in ('OPEN','ANSWERED','CLOSED')),
  last_preview      text,
  last_message_at   timestamptz not null default now(),
  replied_at        timestamptz,                      -- x.repliedAt (최근 브랜드 답변)
  closed_at         timestamptz,
  created_at        timestamptz not null default now(),   -- x.at
  updated_at        timestamptz not null default now(),
  -- flows §10-15: ANSWERED ⇒ 답변 시각
  constraint cs_answered_has_reply
    check (status <> 'ANSWERED' or replied_at is not null)
);

create index if not exists cs_conversations_brand_idx    on public.cs_conversations (brand_id, status, created_at desc);
create index if not exists cs_conversations_campaign_idx on public.cs_conversations (campaign_id);
create index if not exists cs_conversations_order_idx    on public.cs_conversations (order_id);
create index if not exists cs_conversations_customer_idx on public.cs_conversations (customer_id);
create index if not exists cs_conversations_user_idx     on public.cs_conversations (user_id);
create index if not exists cs_conversations_status_idx   on public.cs_conversations (status);

drop trigger if exists cs_conversations_updated_at on public.cs_conversations;
create trigger cs_conversations_updated_at
  before update on public.cs_conversations
  for each row execute function public.set_updated_at();

create table if not exists public.cs_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.cs_conversations (id) on delete cascade,
  sender           text not null check (sender in ('customer','brand','admin')),        -- 표시 역할
  actor_role       text not null check (actor_role in ('customer','brand','admin')),    -- 실제 발신 역할 (관리자 대행: sender='brand', actor_role='admin')
  actor_user_id    uuid references auth.users (id) on delete set null,
  body             text not null,
  created_at       timestamptz not null default now()
);

create index if not exists cs_messages_conv_idx  on public.cs_messages (conversation_id, created_at);
create index if not exists cs_messages_actor_idx on public.cs_messages (actor_user_id);

alter table public.cs_conversations enable row level security;
alter table public.cs_messages enable row level security;
revoke all on public.cs_conversations from anon, authenticated;
revoke all on public.cs_messages from anon, authenticated;
-- 정책 없음 → anon/authenticated 직접 접근 차단, service role 만 통과 (glo 0015 와 동일).
