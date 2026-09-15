-- ============================================================
-- 0003 — 캠페인(인플루언서 × 상품 협업판매 1건) · 캠페인 스레드(시스템 이벤트 + 채팅) · 공개 정책 최종본 · campaign_card RPC
--
-- 원본: campaigns[] (L1302-1316), 상태 머신 ST/FLOW (L1194-1211), transition (L3790),
--       생성 경로 reqSample/confirmSampleBuy/confirmInvite/regongu/runAutoPropose,
--       messages{cid:[]} (L1343-1368, pushSys/pushChat L1658-1665).
-- 실행: 0002 이후. 재실행 가능.
--
-- 상태(status) 는 프로토타입 ST 키 14개 그대로. 전이 규칙·가드는 서버(앱)가 강제한다 (flows §1.2).
-- 기간 정책(L1670-1685): 같은 상품·겹치는 기간은 기본 공유(배타 아님). 우선권 등급(grade_tiers.is_priority) 인플루언서가
--   확정·LIVE 중인 기간에는 비우선권 등급이 새로 진입할 수 없다 — 등급 조건부 규칙이라 DB 배타 제약
--   (exclusion constraint) 으로 표현하면 정책과 모순된다. 따라서 제약을 두지 않고 서버 RPC/가드에서 검사한다.
--   (조회용 인덱스만 둔다.)
-- 시뮬레이션 전용 액션은 이관하지 않는다: goLive(L4226, start 를 오늘로 당김)·endCamp(L4233, end 를 오늘로)·
--   ffwd(L4240, end = 오늘−21 → campaigns_period_valid 에 걸린다)·simOrders. 실서비스는 스케줄러(autoTick L1422)가 전이한다.
-- ============================================================

-- 판매 링크 식별자 /s/{handle}/{code} (L4411, L3502) — 신규 행도 반드시 code 를 가진다.
-- 프로토타입 단일 카운터 seq(L1324, 100 부터) 대신 테이블별 시퀀스. 시드 c1~c13 과 겹치지 않게 100 부터.
create sequence if not exists public.campaign_code_seq start 100;

create table if not exists public.campaigns (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique default ('c' || nextval('public.campaign_code_seq')),   -- 프로토타입 id ('c1')
  seller_id           uuid not null references public.sellers (id) on delete restrict,
  product_id          uuid not null references public.products (id) on delete restrict,
  -- 비정규화: 상품의 브랜드 (프로토타입은 항상 product 경유). 트리거가 product_id 에서 채운다.
  brand_id            uuid not null references public.brands (id) on delete restrict,
  status              text not null default 'SAMPLE_REQUESTED'
                        check (status in (
                          'SAMPLE_REQUESTED','INVITED','DECLINED','REJECTED',
                          'SAMPLE_APPROVED','SAMPLE_PURCHASED','SAMPLE_SHIPPED','TESTING','PASSED',
                          'SCHEDULE_PROPOSED','SCHEDULE_CONFIRMED','LIVE','CLEARING','SETTLED')),
  -- 생성 경로 플래그
  invited             boolean not null default false, -- c.invited 브랜드 직접 제안 (샘플 한도·무상 1회 규칙 우회)
  auto_proposed       boolean not null default false, -- c.auto 자동 제안 (runAutoPropose)
  regongu             boolean not null default false, -- c.regongu 재판매 (샘플 단계 생략, TESTING 부터)
  cel_used            integer not null default 0 check (cel_used >= 0),      -- c.celUsed 제안권 🥬 (grade_tiers.invite_cost_cel)
  cel_refunded        integer not null default 0 check (cel_refunded >= 0),  -- c.celRefunded 거절 시 환급
  -- 샘플 구매 (c.purchased + c.samplePaid) — sampleSplit L1465 / confirmSampleBuy L3880-3881
  purchased           boolean not null default false,
  sample_price        integer check (sample_price is null or sample_price >= 0),   -- samplePaid.price
  sample_cel          integer not null default 0 check (sample_cel >= 0),          -- samplePaid.cel
  sample_cash         integer not null default 0 check (sample_cash >= 0),         -- samplePaid.cash
  sample_method       text check (sample_method in ('cash','cel')),                -- samplePaid.method
  sample_refunded     boolean not null default false, -- c.sampleRefunded (정산 시 1회)
  -- 샘플 배송·테스트
  tracking_no         text,                           -- c.tracking 샘플 운송장
  received_at         timestamptz,                    -- 수령 시각 (receiveSample — 프로토타입은 testDue 만 저장)
  test_due            date,                           -- c.testDue = 수령일 + 14
  -- 일정 제안 (proposeSchedule L4206)
  proposed_start      date,
  proposed_end        date,
  proposed_qty        integer check (proposed_qty is null or proposed_qty > 0),
  -- 확정 판매 기간·배정 재고 (confirmSchedule L4221 / 우선권 즉시 확정 L4209)
  start_date          date,                           -- c.start
  end_date            date,                           -- c.end (inclusive)
  qty                 integer not null default 0 check (qty >= 0),   -- c.qty 배정 재고
  -- 확정 시점 가격·수수료 스냅샷 (추정 설계: 프로토타입은 잠금으로 대신함 L4282 — 서버가 SCHEDULE_CONFIRMED 시 기록)
  price_locked        integer check (price_locked is null or price_locked >= 0),
  rate_locked         numeric(5,4) check (rate_locked is null or (rate_locked >= 0 and rate_locked <= 1)),
  -- 판매 집계 캐시: PAID 주문 Σqty (soldQty L1403). orders 트리거(0004)가 유지 → anon 에 orders 를 열지 않아도 됨.
  sold_qty            integer not null default 0 check (sold_qty >= 0),
  -- 고객 홈 상단 노출 시작일 (c.homeFeatured, 7일 유효 isHomeFeat L3261 — platform_settings 'home_feature_days')
  home_featured_at    date,
  -- 종결 사유 (DECLINED/REJECTED/PASSED, 일정 반려) — 프로토타입은 사유를 저장하지 않는다(rejectSample L4185, declineInvite L4076 는
  --   입력 없음). 체크리스트 요구로 추가한 의도적 확장(추정). 같은 값을 campaign_events.payload->>'reason' 에도 남긴다.
  decision_reason     text,
  -- 정산
  settled_at          timestamptz,                    -- c.settledAt — settlements.settled_at 과 같은 트랜잭션에서 같은 값
  created_at          timestamptz not null default now(),   -- c.createdAt (월 샘플 한도 계산 기준 L1459) — 공개 grant 대상 아님
  updated_at          timestamptz not null default now(),
  constraint campaigns_period_valid
    check (start_date is null or end_date is null or end_date >= start_date),
  constraint campaigns_proposed_period_valid
    check (proposed_start is null or proposed_end is null or proposed_end >= proposed_start),
  -- flows §10-4
  constraint campaigns_proposed_when_proposed
    check (status <> 'SCHEDULE_PROPOSED'
        or (proposed_start is not null and proposed_end is not null and proposed_qty is not null)),
  constraint campaigns_period_when_confirmed
    check (status not in ('SCHEDULE_CONFIRMED','LIVE','CLEARING','SETTLED')
        or (start_date is not null and end_date is not null and qty > 0)),
  constraint campaigns_sample_method_when_purchased
    check (not purchased or (sample_price is not null and sample_method is not null)),
  -- sampleSplit(L1465)·confirmSampleBuy(L3880-3881): cash ⇒ cel 0 & cash = price / cel ⇒ cel×20,000 + cash = price.
  --   20,000 = SAMPLE_CEL_WON (L1462) — platform_settings 'sample_cel_won' 을 바꾸면 이 제약도 함께 바꾼다.
  constraint campaigns_sample_split_consistent
    check (not purchased
        or (sample_method = 'cash' and sample_cel = 0 and sample_cash = sample_price)
        or (sample_method = 'cel'  and sample_cel > 0 and sample_cel * 20000 + sample_cash = sample_price)),
  constraint campaigns_settled_has_time
    check (status <> 'SETTLED' or settled_at is not null)
);

create index if not exists campaigns_seller_idx   on public.campaigns (seller_id);
create index if not exists campaigns_product_idx  on public.campaigns (product_id);
create index if not exists campaigns_brand_idx    on public.campaigns (brand_id);
create index if not exists campaigns_status_idx   on public.campaigns (status);
create index if not exists campaigns_period_idx   on public.campaigns (product_id, start_date, end_date)
  where status in ('SCHEDULE_CONFIRMED','LIVE');   -- periodHolders / allocated (L1674, L1687)
create index if not exists campaigns_created_idx  on public.campaigns (seller_id, created_at);

-- 불변식 #2 (flows §10): 같은 (인플루언서, 상품) 에 진행 중 캠페인은 최대 1건
create unique index if not exists campaigns_active_pair_uidx
  on public.campaigns (seller_id, product_id)
  where status not in ('REJECTED','PASSED','DECLINED','SETTLED');

drop trigger if exists campaigns_updated_at on public.campaigns;
create trigger campaigns_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- brand_id 는 항상 product 의 브랜드와 같아야 한다 — insert/product 변경 시 자동 세팅.
-- security definer: 쓰기는 지금 전부 service role 이지만, 나중에 클라이언트 insert 정책이 생겨도 products 가 RLS 로
-- 가려져 'has no brand' 가 나지 않도록 소유자 권한으로 조회한다. 트리거 전용 — RPC 로는 호출 불가(revoke).
create or replace function public.campaigns_fill_brand()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  select p.brand_id into new.brand_id from public.products p where p.id = new.product_id;
  if new.brand_id is null then
    raise exception 'campaigns.product_id % has no brand', new.product_id;
  end if;
  return new;
end;
$$;
revoke all on function public.campaigns_fill_brand() from public, anon, authenticated;

drop trigger if exists campaigns_fill_brand on public.campaigns;
create trigger campaigns_fill_brand
  before insert or update of product_id on public.campaigns
  for each row execute function public.campaigns_fill_brand();

alter table public.campaigns enable row level security;
revoke all on public.campaigns from anon, authenticated;
-- 고객 홈/순위(L3285-3294)의 공개 필드. 협상 단계 필드(제안 일정·샘플 결제·초대·🥬·사유)와 created_at(협상 시작 시각)은 차단.
grant select (id, code, seller_id, product_id, brand_id, status, start_date, end_date, qty, sold_qty, home_featured_at)
  on public.campaigns to anon, authenticated;

-- 공개 = 진행·예정·환불 기간 (SCHEDULE_CONFIRMED 예정 / LIVE / CLEARING 순위 L3294). SETTLED 는 목록에 열지 않는다 —
-- 열면 `campaigns?status=eq.SETTLED&select=seller_id,product_id,sold_qty` 로 모든 인플루언서·브랜드의 판매 실적을
-- 익명 없이 긁어 갈 수 있다(프로토타입은 타 인플루언서 실적을 익명 집계로만 보여준다 L2120-2125, 고객에겐 플랫폼 합계만 L3304).
-- 종료된 링크 페이지("판매가 종료되었습니다" L3525)는 아래 campaign_card(code) 가 캠페인 1건 단위로 응답한다.
drop policy if exists "campaigns_select_public" on public.campaigns;
create policy "campaigns_select_public"
  on public.campaigns for select
  using (status in ('SCHEDULE_CONFIRMED','LIVE','CLEARING'));

-- ------------------------------------------------------------
-- 0001/0002 의 1차(닫힌) 공개 정책을 campaigns 기반 최종본으로 교체
--   sellers 정책은 0001 의 `active and not hidden` 이 최종본이다 (여기서 바꾸지 않는다).
-- ------------------------------------------------------------
-- products: 공개 캠페인이 걸린 상품만 (고객 화면엔 상품 카탈로그가 없다 L3285-3286; 미판매 상품의 가격·옵션·브랜드는 비공개).
--   paused 상품의 진행 중 판매(L2615)와 재검수 pending 상품의 진행 중 캠페인(L4293)은 캠페인 상태로 열린다.
drop policy if exists "products_select_public" on public.products;
create policy "products_select_public"
  on public.products for select
  using (
    deleted_at is null
    and exists (
      select 1 from public.campaigns c
      where c.product_id = products.id
        and c.status in ('SCHEDULE_CONFIRMED','LIVE','CLEARING')
    )
  );

-- brands: active 이고 공개 캠페인이 있는 브랜드만 (판매 카드의 브랜드명 L3271). 판매 이력 없는 브랜드는 열거 불가.
drop policy if exists "brands_select_public" on public.brands;
create policy "brands_select_public"
  on public.brands for select
  using (
    active
    and exists (
      select 1 from public.campaigns c
      where c.brand_id = brands.id
        and c.status in ('SCHEDULE_CONFIRMED','LIVE','CLEARING')
    )
  );

-- ------------------------------------------------------------
-- campaign_card(code) — 판매 링크 페이지·판매 카드·인증 모달용 캠페인 1건 응답 (anon 호출 가능, security definer)
--   L3491-3536 (링크 페이지), L3262-3275 (카드), L4405-4419 (인증 모달) 이 필요로 하는 것만 돌려준다:
--   · 캠페인: code/status/기간/(SETTLED 가 아니면) qty·sold_qty · 상품 공개 필드 · 인플루언서 카드 필드
--     (hidden 이어도 이름·핸들·아바타·등급·플랫폼 — 팔로워·소개는 제외) · 브랜드명·등급·사업자번호·통신판매업번호 · 인증 채널.
--   · SETTLED 도 응답한다(종료 안내 렌더링) — 단 qty/sold_qty 는 null (실적 비공개, design-notes 열린 결정 4).
--   · 없는 코드·비공개 상태·비활성 파트너·삭제 상품이면 null.
--   열거 불가(코드 1건 단위)이므로 hidden 인플루언서 신원이 목록 조회로 새지 않는다.
-- ------------------------------------------------------------
create or replace function public.campaign_card(p_code text)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id, 'code', c.code, 'status', c.status,
      'start_date', c.start_date, 'end_date', c.end_date,
      'qty',      case when c.status = 'SETTLED' then null else c.qty end,
      'sold_qty', case when c.status = 'SETTLED' then null else c.sold_qty end,
      'home_featured_at', c.home_featured_at),
    'product', jsonb_build_object(
      'id', p.id, 'code', p.code, 'name', p.name, 'description', p.description, 'emoji', p.emoji,
      'thumb_url', p.thumb_url, 'image_urls', to_jsonb(p.image_urls), 'category', p.category,
      'consumer_price', p.consumer_price, 'sale_price', p.sale_price, 'options', p.options, 'status', p.status),
    'seller', jsonb_build_object(
      'id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle, 'platform', s.platform,
      'avatar_url', s.avatar_url, 'grade', s.grade),
    'brand', jsonb_build_object(
      'id', b.id, 'code', b.code, 'name', b.name, 'logo_url', b.logo_url, 'grade', b.grade,
      'biz_no', b.biz_no, 'mail_order_no', b.mail_order_no),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object('platform', ch.platform, 'handle', ch.handle, 'url', ch.url)
                       order by ch.is_primary desc, ch.created_at)
        from public.seller_channels ch
       where ch.seller_id = s.id and ch.verified), '[]'::jsonb)
  )
  from public.campaigns c
  join public.products p on p.id = c.product_id
  join public.sellers  s on s.id = c.seller_id
  join public.brands   b on b.id = c.brand_id
  where c.code = p_code
    and c.status in ('SCHEDULE_CONFIRMED','LIVE','CLEARING','SETTLED')
    and s.active and b.active
    and p.deleted_at is null
$$;
revoke all on function public.campaign_card(text) from public;
grant execute on function public.campaign_card(text) to anon, authenticated;

-- ============================================================
-- campaign_events — 캠페인 스레드 (messages{cid} L1343: type sys|chat|warn, role seller|brand, txt, at)
--   kind: 'system' (프로토타입 'sys' — 상태 전이 이력 겸용) / 'chat'
--   sender: 표시 역할 'seller' | 'brand' | 'admin' | 'system' — 앱이 발신자명을 고르는 기준 (L3564: brand→브랜드명, admin→'셀러리 운영팀').
--   actor_role / actor_user_id: 실제로 쓴 사람(감사). 관리자 대행 발신(L4467 — 관리자는 브랜드로 발신, 사용자 결정)은
--     sender='brand', actor_role='admin', actor_user_id=관리자 로 저장한다. chat 행은 actor_role 필수.
--   프로토타입 'warn' 행(연락처/카톡 감지 L1662)은 별도 행이 아니라 감지된 chat 행의 leak_flag=true 로 표현하고
--   경고 문구는 앱이 렌더링한다. 시스템 이벤트의 '<b>' 포함 HTML 문자열은 body 에 그대로 두지 않고
--   event_type + payload(jsonb) 로 정규화한다 (body 는 평문 요약).
-- ============================================================
create table if not exists public.campaign_events (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns (id) on delete cascade,
  kind          text not null check (kind in ('chat','system')),
  sender        text not null default 'system'
                  check (sender in ('seller','brand','admin','system')),   -- 표시 역할
  actor_role    text check (actor_role in ('seller','brand','admin','system')),   -- 실제 발신 역할 (감사)
  actor_user_id uuid references auth.users (id) on delete set null,
  body          text not null,                        -- chat 본문(평문) / system 요약(평문)
  -- system 이벤트 종류 (flows §3.5 목록을 슬러그로): sample_requested, sample_purchased, invited, auto_invited,
  --   invite_accepted, invite_declined, sample_approved, sample_rejected, sample_shipped, sample_received(payload.test_due),
  --   passed, schedule_proposed, schedule_confirmed_priority, schedule_confirmed, schedule_rejected, went_live, ended,
  --   po_sent, refunded, sample_refunded, payout_held, ref_reward, brand_ref_reward, settled, cs_received,
  --   cs_replied, regongu_created  (앱이 관리 — DB 는 자유 텍스트. 종결 사유는 payload.reason)
  event_type    text,
  payload       jsonb not null default '{}'::jsonb,   -- 이벤트 파라미터 (금액·일정·운송장·상대 이름·사유 등)
  leak_flag     boolean not null default false,       -- 연락처/외부 메신저 공유 감지 (chat 만)
  created_at    timestamptz not null default now(),
  constraint campaign_events_sender_kind
    check ((kind = 'system' and sender = 'system') or (kind = 'chat' and sender <> 'system')),
  constraint campaign_events_chat_has_actor
    check (kind <> 'chat' or actor_role is not null),
  constraint campaign_events_leak_chat_only
    check (not leak_flag or kind = 'chat')
);

create index if not exists campaign_events_campaign_idx on public.campaign_events (campaign_id, created_at);
create index if not exists campaign_events_kind_idx     on public.campaign_events (kind, created_at desc);
create index if not exists campaign_events_actor_idx    on public.campaign_events (actor_user_id);

alter table public.campaign_events enable row level security;
revoke all on public.campaign_events from anon, authenticated;
-- 정책 없음 → 당사자(인플루언서·브랜드)·관리자 모두 서버 경유 (glo 0015 잠금 패턴).
-- 실시간은 Realtime Broadcast 로 서버가 발행. (2단계에서 당사자 select 정책 + postgres_changes 검토)
