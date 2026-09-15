-- ============================================================
-- 0002 — 상품 · 독점권 신청 · 상품 조회 기록
--
-- 원본: 프로토타입 products[] (L1287-1301), createProduct/saveProduct (L4279-4319),
--       approve/reject/toggleListing (L4275-4308), deleteProduct (L4297-4303),
--       exclusiveReqs (L1281, L3920-3932), productViews (L1261).
-- 실행: 0001 이후. 재실행 가능.
--
-- 가격·수수료 규칙(앱 강제, 참고): 저장된 commission_rate 는 인플루언서 몫만(플랫폼 10%p 별도),
--   최소 0.05 (L4291). 확정·LIVE·CLEARING 캠페인이 있으면 consumer_price/sale_price/commission_rate 잠금 (L4282).
--   미잠금 상태에서 sale_price/commission_rate 변경 시 listed → pending 재검수 (L4293).
-- 삭제(deleteProduct L4299-4302): 종결 캠페인(REJECTED/PASSED/DECLINED)만 있는 상품은 삭제 가능. campaigns.product_id 가
--   on delete restrict 이고 이력을 남겨야 하므로 DB 는 하드 삭제 대신 deleted_at 소프트 삭제 — 서버 RPC 가 L4299 가드를
--   통과하면 deleted_at = now() 로 세팅하고, 공개 정책·앱 목록은 deleted_at is null 만 본다.
-- ============================================================

create table if not exists public.products (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique,                    -- 프로토타입 id ('p1')
  brand_id            uuid not null references public.brands (id) on delete cascade,
  name                text not null,
  description         text,                           -- p.desc 한 줄 설명
  emoji               text not null default '📦',      -- p.em (썸네일 대체)
  thumb_url           text,                           -- p.thumb (상대경로 또는 data-URI → Storage 'public-assets' URL)
  image_urls          text[] not null default '{}',   -- p.imgs (최대 4장, 앱 검증)
  category            text not null references public.categories (name),   -- p.cat
  consumer_price      integer not null check (consumer_price >= 0),         -- p.cp 소비자가 KRW
  sale_price          integer not null check (sale_price >= 0),             -- p.gp 판매가 KRW
  commission_rate     numeric(5,4) not null
                        check (commission_rate >= 0 and commission_rate <= 1), -- p.rate 인플루언서 수수료율 (0.2000)
  sample_text         text,                           -- p.sample '무상 1박스'
  stock               integer not null default 0 check (stock >= 0),        -- p.stock (주문으로 차감되지 않음 — 캠페인 배정 기준)
  status              text not null default 'pending'
                        check (status in ('pending','listed','paused','rejected')),
  reject_reason       text,                           -- p.rejectReason (rejected 일 때)
  -- 트렌드 배지 (p.t {g:'+240%', note}) — 표시용
  trend               jsonb,
  -- 독점권 오퍼 (p.exclusive {grade,label}) · 확정 인플루언서 (p.exclusiveSellerId)
  --   오퍼 등급은 상위 4단계만 (GRADES.slice(0,4) L3759 — grade-policy §4)
  exclusive_grade     text references public.grade_tiers (name),   -- FK 인덱스 없음: grade_tiers 는 7행 (의도)
  exclusive_label     text,
  exclusive_seller_id uuid references public.sellers (id) on delete set null,
  -- 샘플 정책 (p.samplePolicy). 네 컬럼이 모두 null 이면 앱이 spOf() 기본값(sale_price 기준, platform_settings
  --   'sample_default_free_grade')을 쓴다 (L1463). 프로토타입은 항상 네 키를 함께 쓰므로(L4289, L4315) 전부-또는-없음 체크.
  sample_free_grade   text references public.grade_tiers (name),   -- 이 등급 이상 무상 1회 (FK 인덱스 없음: 7행)
  sample_buy_mode     text check (sample_buy_mode in ('auto','fixed')),
  sample_fixed_price  integer check (sample_fixed_price is null or sample_fixed_price >= 0),
  sample_refund       boolean,                        -- 판매 확정(SETTLED) 시 구매액 환급
  -- 옵션 [{ n, price }] — 비어 있으면 앱이 1/2/3개 세트 기본 옵션 생성 (optsOf L1398, platform_settings 'option_bundle_defaults')
  options             jsonb not null default '[]'::jsonb,
  -- 상단 부스트 (p.boosted + p.celeryItems.boost) — 구매일. 7일 유효 (passActive L1481, L1921)
  boosted_at          date,
  -- 소프트 삭제 (deleteProduct L4302) — null 이 아니면 어디에도 노출되지 않는다
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint products_reject_reason_when_rejected
    check (status <> 'rejected' or reject_reason is not null),
  constraint products_exclusive_grade_top4
    check (exclusive_grade is null or exclusive_grade in ('블랙','다이아','플래티넘','골드')),
  constraint products_sample_policy_all_or_none
    check ((sample_free_grade is null and sample_buy_mode is null and sample_fixed_price is null and sample_refund is null)
        or (sample_free_grade is not null and sample_buy_mode is not null and sample_fixed_price is not null and sample_refund is not null))
);

create index if not exists products_brand_idx     on public.products (brand_id);
create index if not exists products_status_idx    on public.products (status);
create index if not exists products_category_idx  on public.products (category);
create index if not exists products_exclusive_seller_idx on public.products (exclusive_seller_id);
create index if not exists products_deleted_idx   on public.products (deleted_at) where deleted_at is not null;

drop trigger if exists products_updated_at on public.products;
create trigger products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;
revoke all on public.products from anon, authenticated;
-- 고객 판매 카드·판매 링크 페이지의 공개 필드. 수수료율·재고·샘플 정책·독점·반려 사유·부스트는 차단.
--   deleted_at 은 여기 포함한다 — 0003 의 products_select_public 최종본이 자기 테이블 컬럼으로 USING 절에서
--   읽는다(소프트 삭제된 상품 숨김). 값 자체는 민감하지 않고(삭제 여부는 그 상품을 이미 아는 사람에게만 의미가 있다),
--   이 컬럼을 grant 하지 않았을 때 정책 평가가 전체 SELECT 를 거부하는지 로컬 DB 없이 검증할 수 없어 안전한 쪽으로 연다
--   (sellers.hidden 과 달리 신원 비식별화 문제가 없다 — review/semantic.js 재검사 결과 참고).
grant select (id, code, brand_id, name, description, emoji, thumb_url, image_urls, category,
              consumer_price, sale_price, options, status, deleted_at)
  on public.products to anon, authenticated;

-- 1차 정책: 닫아 둔다. 고객 화면에는 상품 카탈로그가 없고(홈·순위·링크 전부 캠페인 경유 L3285-3294), 인플루언서 상품
-- 갤러리(L1949)는 서버 경유이므로 anon 이 상품을 직접 읽는 유일한 경로는 "공개 캠페인이 걸린 상품" 이다.
-- 최종본은 campaigns 가 생기는 0003 에서 같은 이름으로 교체한다.
drop policy if exists "products_select_public" on public.products;
create policy "products_select_public"
  on public.products for select
  using (false);

-- ============================================================
-- exclusive_requests — 독점권 신청 (exclusiveReqs L1281; reqExclusive L3920, approveExcl L3924, rejectExcl L3929)
--   승인 시 서버가 products.exclusive_seller_id = seller_id 로 세팅. (product, seller) 당 PENDING 1건.
-- ============================================================
create table if not exists public.exclusive_requests (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,                            -- 프로토타입 id ('x1')
  product_id  uuid not null references public.products (id) on delete cascade,
  seller_id   uuid not null references public.sellers (id) on delete cascade,
  status      text not null default 'PENDING'
                check (status in ('PENDING','APPROVED','REJECTED')),
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists exclusive_requests_product_idx on public.exclusive_requests (product_id);
create index if not exists exclusive_requests_seller_idx  on public.exclusive_requests (seller_id);
create index if not exists exclusive_requests_status_idx  on public.exclusive_requests (status);
create unique index if not exists exclusive_requests_pending_uidx
  on public.exclusive_requests (product_id, seller_id) where status = 'PENDING';

drop trigger if exists exclusive_requests_updated_at on public.exclusive_requests;
create trigger exclusive_requests_updated_at
  before update on public.exclusive_requests
  for each row execute function public.set_updated_at();

alter table public.exclusive_requests enable row level security;
revoke all on public.exclusive_requests from anon, authenticated;
-- 정책 없음 → 신청 인플루언서·브랜드·관리자 모두 서버 경유.

-- ============================================================
-- product_views — 인플루언서의 상품 조회 기록 (productViews L1261-1268, 브랜드 홈 "최근 조회" L2453)
--   프로토타입은 표시 문자열('2시간 전')만 있었다 → 실제 타임스탬프로 대체.
-- ============================================================
create table if not exists public.product_views (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  seller_id   uuid not null references public.sellers (id) on delete cascade,
  viewed_at   timestamptz not null default now()
);

create index if not exists product_views_product_idx on public.product_views (product_id, viewed_at desc);
create index if not exists product_views_seller_idx  on public.product_views (seller_id, viewed_at desc);

alter table public.product_views enable row level security;
revoke all on public.product_views from anon, authenticated;
