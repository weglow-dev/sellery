-- ============================================================
-- 0001 — 셀러리(Sellery) 초기 스키마: 공통 헬퍼 · 계정/프로필 · 파트너(브랜드/인플루언서) · 정책 마스터
--
-- 대상: (주)위글로우 셀러리 — 건강·웰니스 브랜드 × 인플루언서 협업판매 플랫폼.
-- 원본: 프로토타입 OLD/index.html (localStorage 단일 파일) 의 seedData()/상수 (L1194-1609) 를
--       glo 프로젝트(Next.js + Supabase) 관례로 옮긴 것.
--
-- 실행: supabase CLI `supabase db push` (migrations 순서대로) 또는 Dashboard → SQL Editor.
--       모든 문장은 재실행 가능(if not exists / drop … if exists / create or replace).
--
-- 관례 (glo 0001/0012/0013/0015 와 동일):
--   · uuid PK default gen_random_uuid(). 프로토타입 id(s1/b1/p1/c1…)는 `code text unique` 로 보존 → 시드 1:1 매핑.
--   · 금액은 KRW integer (누적·정산 라인은 bigint), 비율은 numeric(5,4) (0.2000 = 20%).
--   · 상태는 text + check — 프로토타입 enum 값을 그대로 쓴다.
--   · created_at/updated_at timestamptz + set_updated_at 트리거.
--   · RLS 는 모든 테이블에서 ON. 민감 테이블은 `revoke all … from anon, authenticated` (service role 전용).
--     공개가 필요한 테이블만 컬럼 단위 grant select + select 정책. insert/update 정책은 어디에도 없다 —
--     상태 전이·포인트·정산 등 모든 쓰기는 서버(service role) 경유.
--   · 정책 식의 컬럼 권한: 정책이 **자기 테이블** 컬럼을 참조할 때는 grant 가 필요 없다(리라이터가 security qual 로
--     붙이며 컬럼 권한 표시를 하지 않음). 정책 안의 **서브쿼리가 읽는 다른 테이블** 컬럼은 질의자 권한으로 검사되므로
--     grant 목록에 있어야 한다 (campaigns.seller_id/product_id/brand_id/status 등). — 추정: 로컬 DB 가 없어
--     실행 검증 전. 적용 후 docs/data-model.md §8.4 의 `set role anon` 스모크 테스트로 확인한다.
--   · 서버 전용 함수·트리거 함수는 `revoke all on function … from public, anon, authenticated` (PostgREST RPC 노출 차단).
-- ============================================================

-- ------------------------------------------------------------
-- 공통 헬퍼: updated_at 자동 갱신 (glo 0001 과 동일 — 한 번만 정의)
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- ============================================================
-- profiles — auth.users 1:1. 역할의 단일 진실(source of truth).
--   role: customer(고객, 카카오 가입 기본) / seller(인플루언서) / brand / admin
--   승격(seller/brand/admin)은 서버(service role)만. 사용자는 full_name/phone 만 수정 가능.
--   파트너 연결: 이메일 일치 자동 연결은 하지 않는다 — 관리자가 심사 승인한 신청(glo 0013 seller_applications 패턴)을
--   서버가 처리하며 profiles.role 갱신 + sellers/brands.user_id 연결을 같은 트랜잭션에서 한다
--   (auth.users.email_confirmed_at is not null 인 계정만).
-- ============================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'customer'
                check (role in ('customer','seller','brand','admin')),
  email       text,
  full_name   text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 신규 auth 사용자 → profiles 자동 생성 (glo 0001 idiom)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 정책·서버 공용 역할 조회 헬퍼 (이름을 current_role 로 짓지 않는다 — Postgres 예약어)
create or replace function public.app_role()
returns text
language sql stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;
revoke all on function public.app_role() from public, anon;
grant execute on function public.app_role() to authenticated;

alter table public.profiles enable row level security;
-- Supabase 는 public 테이블에 anon/authenticated 전체 권한을 기본 부여하므로 먼저 회수한 뒤
-- 본인 행의 필요한 컬럼만 연다. role 컬럼은 update 권한 자체를 주지 않는다 (자기 승격 방지).
revoke all on public.profiles from anon, authenticated;
grant select (id, role, email, full_name, phone, created_at) on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================
-- platform_settings — 정책 상수 key/value (glo 0010 app_settings 패턴)
--   PG_RATE/PLAT_RATE/WHT/CLEAR_DAYS (L1212), CELERY_PER (L1376), SAMPLE_CEL_WON (L1462),
--   BREF_* (L1374), REF_* (L1541), OPEX_DEF (L1377), TOPUP (L1451), SHOP (L1433) 등.
--   값은 seed.sql 에서 넣는다.
--   운영비: 'opex_default' (OPEX_DEF, 불변) 와 'opex' (관리자 오버라이드 saveOpex L4428 — 기본엔 행 없음) 두 키.
--     서버는 프로토타입 L3160 처럼 {...opex_default, ...opex} 로 병합하고 resetOpex(L4429)는 'opex' 행을 삭제한다.
--   우선권 등급 하한(PRIORITY_TIER)은 여기 두지 않는다 — grade_tiers.is_priority 가 단일 소스.
--   다이아·블랙 제안권 10🥬 도 grade_tiers.invite_cost_cel 이 단일 소스 (L4061, L4453).
-- ============================================================
create table if not exists public.platform_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

drop trigger if exists platform_settings_updated_at on public.platform_settings;
create trigger platform_settings_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from anon, authenticated;
-- 서비스 롤(서버)만. 클라이언트 노출 없음.

-- ============================================================
-- grade_tiers — 인플루언서 등급 마스터 (GRADES L1488-1496, DATA_PRICE L1379, sampleQuota L1458)
--   sort_order = tierIdx (0 = 블랙 최상위). 등급 판정은 m3_sales >= min_m3_sales 중 sort_order 최소.
-- ============================================================
create table if not exists public.grade_tiers (
  name             text primary key,                 -- '블랙','다이아','플래티넘','골드','실버','브론즈','스타터'
  sort_order       integer not null unique,          -- tierIdx
  min_m3_sales     bigint not null check (min_m3_sales >= 0),    -- KRW, 최근 3개월 확정 매출 하한 (sellers.m3_sales 와 같은 폭)
  bonus_pp         numeric(4,2) not null default 0 check (bonus_pp >= 0),  -- 수수료 보너스 %p (플랫폼 부담)
  top_pct          integer not null,                 -- 표시용 '상위 n%'
  sample_quota     integer not null check (sample_quota >= 0),   -- 무상 샘플 월 한도
  data_price_cel   integer not null check (data_price_cel >= 0), -- 브랜드가 이 등급 인플루언서 데이터를 열람할 때 🥬
  is_priority      boolean not null default false,   -- 판매 기간 우선권 (PRIORITY_TIER='플래티넘' 이상, L1673-1679) — 단일 소스
  invite_cost_cel  integer not null default 0 check (invite_cost_cel >= 0),  -- 브랜드가 이 등급에 제안할 때 🥬 (다이아·블랙 10, L4061)
  perk             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists grade_tiers_updated_at on public.grade_tiers;
create trigger grade_tiers_updated_at
  before update on public.grade_tiers
  for each row execute function public.set_updated_at();

alter table public.grade_tiers enable row level security;
revoke all on public.grade_tiers from anon, authenticated;
-- 등급 표는 공개 정보(등급 안내 화면)이므로 읽기만 허용
grant select on public.grade_tiers to anon, authenticated;
drop policy if exists "grade_tiers_select_all" on public.grade_tiers;
create policy "grade_tiers_select_all"
  on public.grade_tiers for select
  using (true);

-- ============================================================
-- brand_grade_tiers — 브랜드 등급 마스터 (BGRADES L1520-1528, BG_DISC L1382, freeRefLeft L1386)
-- ============================================================
create table if not exists public.brand_grade_tiers (
  name                text primary key,
  sort_order          integer not null unique,
  min_gmv             bigint not null check (min_gmv >= 0),          -- KRW 누적 확정 GMV 하한
  fee_discount        numeric(5,4) not null default 0
                        check (fee_discount >= 0 and fee_discount <= 1), -- 플랫폼 수수료 할인 (0.0150 = 1.5%p)
  top_pct             integer not null,
  free_ref_per_month  integer not null default 0 check (free_ref_per_month >= 0), -- 월 무료 열람 횟수 (다이아·블랙 5)
  perk                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists brand_grade_tiers_updated_at on public.brand_grade_tiers;
create trigger brand_grade_tiers_updated_at
  before update on public.brand_grade_tiers
  for each row execute function public.set_updated_at();

alter table public.brand_grade_tiers enable row level security;
revoke all on public.brand_grade_tiers from anon, authenticated;
grant select on public.brand_grade_tiers to anon, authenticated;
drop policy if exists "brand_grade_tiers_select_all" on public.brand_grade_tiers;
create policy "brand_grade_tiers_select_all"
  on public.brand_grade_tiers for select
  using (true);

-- 등급 판정 함수 (gradeOf L1497 / bgradeOf L1535 와 동일한 내림차순 첫 매치) — 서버·트리거 전용
create or replace function public.grade_for_sales(p_m3_sales bigint)
returns text
language sql stable
set search_path = public
as $$
  select name from public.grade_tiers
  where min_m3_sales <= coalesce(p_m3_sales, 0)
  order by sort_order asc
  limit 1
$$;
revoke all on function public.grade_for_sales(bigint) from public, anon, authenticated;

create or replace function public.brand_grade_for_gmv(p_gmv bigint)
returns text
language sql stable
set search_path = public
as $$
  select name from public.brand_grade_tiers
  where min_gmv <= coalesce(p_gmv, 0)
  order by sort_order asc
  limit 1
$$;
revoke all on function public.brand_grade_for_gmv(bigint) from public, anon, authenticated;

-- ============================================================
-- categories — 상품/인플루언서 카테고리 7종 (CATS L1936, CAT_INFO L1937) + 상위 그룹 (CATMAP L1406)
--   group_name: '건강기능식품' | '이너뷰티' — 브랜드 카테고리(brands.category) 와 catFit(L1407) 기준.
-- ============================================================
create table if not exists public.categories (
  name        text primary key,                       -- '다이어트·체형' 등 (프로토타입 값 그대로)
  group_name  text not null check (group_name in ('건강기능식품','이너뷰티')),
  name_en     text,
  description text,
  examples    text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.categories enable row level security;
revoke all on public.categories from anon, authenticated;
grant select on public.categories to anon, authenticated;
drop policy if exists "categories_select_all" on public.categories;
create policy "categories_select_all"
  on public.categories for select
  using (true);

-- ============================================================
-- brands — 브랜드 (계좌·담당자 연락처 포함 → 공개 컬럼만 grant)
--   프로토타입 brands[] (L1224-1225) + saveBrandInfo (L3805-3808) + brandDocPick/logoPick (L3824, L3842)
--   + toggleAutoPropose (L4447) + freeRefUsed (L1389) + autoPO (L4163, 프로토타입은 전역이지만 브랜드별로 이관).
-- ============================================================
create table if not exists public.brands (
  id              uuid primary key default gen_random_uuid(),
  code            text unique,                        -- 프로토타입 id ('b1')
  -- 담당자 로그인 계정 (login.html ACCOUNTS 의 brand 이메일). 초기엔 브랜드당 1계정.
  user_id         uuid unique references auth.users (id) on delete set null,
  name            text not null,
  category        text not null default '건강기능식품'
                    check (category in ('건강기능식품','이너뷰티')),   -- CATMAP 키 (b.cat)
  manager_name    text,                               -- b.manager
  email           text,                               -- b.email (파트너에게 비공개) — lower(email) 유니크 (자연 키)
  logo_url        text,                               -- b.logo (data-URI → Storage URL 로 이관)
  -- 사업자 정보 — biz_no / mail_order_no 는 판매 인증 모달(L4414)에서 캠페인 단위로만 노출 → campaign_card() RPC (0003).
  --   직접 테이블 grant 에는 넣지 않는다 (미판매 브랜드의 사업자번호 열거 방지).
  biz_no          text,                               -- settleInfo.bizNo '000-00-00000' — 유니크 (자연 키)
  mail_order_no   text,                               -- settleInfo.mailOrder 통신판매업 신고번호
  biz_doc_url     text,                               -- settleInfo.bizDoc — Storage 'partner-docs' 버킷의 object path (0006). 공개 URL 금지
  bank_info       jsonb,                              -- { bank, account, holder } — settleInfo (service role 전용)
  gmv_base        bigint not null default 0 check (gmv_base >= 0),  -- b.gmvBase 이관 전 누적 GMV
  grade           text references public.brand_grade_tiers (name),  -- bgname 캐시 (서버가 주문/정산 시 재계산)
  ref_code        text unique,                        -- b.refCode
  referred_by     uuid references public.brands (id) on delete set null,  -- b.referredBy
  auto_propose    boolean not null default false,     -- b.autoPropose
  free_ref_used   jsonb not null default '{}'::jsonb, -- b.freeRefUsed { 'YYYY-MM': n }
  po_enabled      boolean not null default false,     -- autoPO.on  (프로토타입 전역 → 브랜드별)
  po_email        text,                               -- autoPO.email
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists brands_user_id_idx     on public.brands (user_id);
create index if not exists brands_referred_by_idx on public.brands (referred_by);
create index if not exists brands_grade_idx       on public.brands (grade);
create index if not exists brands_active_idx      on public.brands (active);
-- 자연 키 (analysis/data-model-extracted.md §4): 이메일(대소문자 무시)·사업자번호는 브랜드당 1개
create unique index if not exists brands_email_uidx  on public.brands (lower(email)) where email is not null;
create unique index if not exists brands_biz_no_uidx on public.brands (biz_no) where biz_no is not null;

drop trigger if exists brands_updated_at on public.brands;
create trigger brands_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();

alter table public.brands enable row level security;
revoke all on public.brands from anon, authenticated;
-- 고객 판매 카드가 필요로 하는 공개 필드만 (계좌·담당자·이메일·GMV·설정·사업자번호는 차단 — 사업자번호는 campaign_card RPC 로).
grant select (id, code, name, category, logo_url, grade, active)
  on public.brands to anon, authenticated;

-- 1차 정책: 닫아 둔다. 최종본("active 이고 공개 캠페인이 있는 브랜드")은 campaigns 가 생기는 0003 에서
-- 같은 이름으로 drop/create 한다 (정책 본문은 생성 시점에 참조 테이블 존재를 검사하므로).
drop policy if exists "brands_select_public" on public.brands;
create policy "brands_select_public"
  on public.brands for select
  using (false);

-- ============================================================
-- sellers — 인플루언서 (정산 정보·이메일·지표 포함 → 공개 컬럼만 grant)
--   프로토타입 sellers[] (L1241-1259) + saveSettleInfo (L3979) + avatarPick (L4010)
--   + admToggleHidden (L4439) + runSettle m3Sales 누적 (L4256).
-- ============================================================
create table if not exists public.sellers (
  id              uuid primary key default gen_random_uuid(),
  code            text unique,                        -- 프로토타입 id ('s1')
  user_id         uuid unique references auth.users (id) on delete set null,
  name            text not null,                      -- 활동명
  handle          text not null unique,               -- '@jiyu_beauty' (판매 링크 /s/{handle}/{code})
  email           text,                               -- 파트너에게 비공개 — lower(email) 유니크 (자연 키)
  platform        text not null default 'instagram'
                    check (platform in ('instagram','youtube','naver','tiktok')),  -- 메인 채널 플랫폼
  avatar_url      text,                               -- s.img
  followers       integer not null default 0 check (followers >= 0),   -- 메인 채널 팔로워 동기화 (L3963)
  category        text references public.categories (name),            -- s.cat (주력 카테고리)
  intro           text,
  likes_avg       integer not null default 0 check (likes_avg >= 0),
  recent_likes    integer[] not null default '{}',    -- s.recentLikes (growthOf L1405)
  m3_sales        bigint not null default 0 check (m3_sales >= 0),      -- 최근 3개월 확정 매출 (등급·🥬 기준)
  grade           text references public.grade_tiers (name),           -- gname 캐시 (트리거로 m3_sales 에서 재계산)
  ref_code        text unique,                        -- s.refCode
  referred_by     uuid references public.sellers (id) on delete set null,
  hidden          boolean not null default false,     -- 비공개 프로필 (관리자만 토글). 공개 grant 대상 아님
  -- 정산 정보 (settleInfo) — service role 전용
  --   settle_type null 은 "정산 정보 미등록" — 원천징수는 sellerWht(L1656) 대로 'biz' 만 0, 그 외(null 포함) 3.3%.
  settle_type     text check (settle_type in ('personal','biz')),       -- personal: 원천징수 3.3% / biz: 세금계산서
  bank_info       jsonb,                              -- { bank, account, holder }
  biz_no          text,                               -- settle_type='biz' 일 때 필수 (앱 검증 L3978)
  biz_doc_url     text,                               -- Storage 'partner-docs' object path (0006). 공개 URL 금지
  sample_extra    integer not null default 0 check (sample_extra >= 0), -- s.sampleExtra (월 한도 추가분)
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint sellers_biz_requires_bizno
    check (settle_type is distinct from 'biz' or biz_no is not null)
);

create index if not exists sellers_user_id_idx     on public.sellers (user_id);
create index if not exists sellers_referred_by_idx on public.sellers (referred_by);
create index if not exists sellers_category_idx    on public.sellers (category);
create index if not exists sellers_grade_idx       on public.sellers (grade);
create index if not exists sellers_hidden_idx      on public.sellers (hidden);
create index if not exists sellers_m3_sales_idx    on public.sellers (m3_sales desc);
-- 자연 키: 이메일(대소문자 무시)은 인플루언서당 1개
create unique index if not exists sellers_email_uidx on public.sellers (lower(email)) where email is not null;

drop trigger if exists sellers_updated_at on public.sellers;
create trigger sellers_updated_at
  before update on public.sellers
  for each row execute function public.set_updated_at();

-- 등급 캐시: m3_sales 가 바뀌면 grade 를 자동 재계산 (gname L1498)
create or replace function public.sellers_sync_grade()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.grade := public.grade_for_sales(new.m3_sales);
  return new;
end;
$$;
revoke all on function public.sellers_sync_grade() from public, anon, authenticated;

drop trigger if exists sellers_sync_grade on public.sellers;
create trigger sellers_sync_grade
  before insert or update of m3_sales on public.sellers
  for each row execute function public.sellers_sync_grade();

-- 공개 인플루언서 판정 — sellers 정책과 seller_channels 정책이 같은 술어를 쓰도록 한 곳에 둔다.
--   security definer: seller_channels 정책 안에서 sellers.hidden 을 읽어야 하지만 hidden 은 anon 에 grant 하지 않으므로
--   (grant 하면 sellers?hidden=eq.true 열거로 ○○○ 스카우트 카드와 실제 행을 짝지을 수 있다 — access §2.1.1)
--   소유자 권한으로 판정한다. 정책 평가자(anon/authenticated)가 호출하므로 execute 는 열어 둔다.
create or replace function public.seller_is_public(p_seller uuid)
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (select 1 from public.sellers s where s.id = p_seller and s.active and not s.hidden)
$$;
revoke all on function public.seller_is_public(uuid) from public;
grant execute on function public.seller_is_public(uuid) to anon, authenticated;

alter table public.sellers enable row level security;
revoke all on public.sellers from anon, authenticated;
-- 고객 화면·인플루언서 목록의 공개 필드만. 이메일·정산·지표(m3_sales, likes)·추천코드·user_id·hidden 은 차단.
-- hidden 인플루언서는 이 테이블에서 아예 보이지 않는다. 공개 캠페인(판매 카드·링크 페이지·인증 모달, L3269/L3510/L4412)에
-- 걸린 hidden 인플루언서의 이름·핸들·아바타·등급은 캠페인 1건 단위 RPC public.campaign_card(code) (0003) 로만 제공한다
-- — 열거(PostgREST 목록 조회)로 비공개 프로필·팔로워·소개를 긁어 가는 경로를 없애기 위해서다 (access §2.1.1, §2.9).
grant select (id, code, name, handle, platform, avatar_url, followers, category, intro, grade, active)
  on public.sellers to anon, authenticated;

-- seller_is_public(id) 를 그대로 재사용한다 (직접 `active and not hidden` 을 쓰지 않는 이유: 이 정책은 sellers 테이블
-- 자기 자신에 대한 정책이라도 리라이터가 hidden 컬럼에 대한 컬럼 단위 select 권한을 요구할 수 있고(§8.4 스모크 테스트로
-- 확인 전까지는 안전 가정), hidden 은 위에서 이미 공개 grant 목록에서 뺐다 — security definer 함수로 우회한다).
drop policy if exists "sellers_select_public" on public.sellers;
create policy "sellers_select_public"
  on public.sellers for select
  using (public.seller_is_public(id));

-- ============================================================
-- seller_channels — 인플루언서 채널 (sellers[].channels[] L1243, saveCh L3939-3948, confirmVerify L3971)
--   판매 인증 모달·고객 화면에는 verified 채널만 노출 (L4407, L2157).
--   "인증된 채널만 메인으로 설정" (L3961) 은 setPrimaryCh 서버 액션의 가드다 — DB check 로 두지 않는다:
--   메인 채널의 핸들/플랫폼을 수정하면 verified=false 로 떨어지되 primary 는 유지되고(L3944, 재인증 대기),
--   primary 는 삭제할 수 없으므로(L3954) check 가 있으면 채널 1개인 인플루언서는 메인 채널을 수정할 수 없다.
-- ============================================================
create table if not exists public.seller_channels (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,                            -- 프로토타입 id ('ch1')
  seller_id   uuid not null references public.sellers (id) on delete cascade,
  platform    text not null check (platform in ('instagram','youtube','naver','tiktok')),
  handle      text not null,
  url         text,
  followers   integer not null default 0 check (followers >= 0),
  verified    boolean not null default false,
  is_primary  boolean not null default false,         -- ch.primary (메인 채널) — 인플루언서당 1개 (부분 유니크)
  vcode       text,                                   -- 인증 대기 코드 'SLRY-XXXX' (인증 완료 시 null)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists seller_channels_seller_idx on public.seller_channels (seller_id);
create unique index if not exists seller_channels_primary_uidx
  on public.seller_channels (seller_id) where is_primary;
create unique index if not exists seller_channels_platform_handle_uidx
  on public.seller_channels (platform, handle);

drop trigger if exists seller_channels_updated_at on public.seller_channels;
create trigger seller_channels_updated_at
  before update on public.seller_channels
  for each row execute function public.set_updated_at();

alter table public.seller_channels enable row level security;
revoke all on public.seller_channels from anon, authenticated;
grant select (id, seller_id, platform, handle, url, followers, verified, is_primary)
  on public.seller_channels to anon, authenticated;

-- verified 이고 부모 인플루언서가 공개(active and not hidden)인 채널만. 부모 판정을 seller_is_public() 으로 명시해
-- sellers 정책이 바뀌어도 hidden 인플루언서의 채널(핸들·URL·팔로워 = 신원)이 새지 않게 한다.
drop policy if exists "seller_channels_select_verified" on public.seller_channels;
create policy "seller_channels_select_verified"
  on public.seller_channels for select
  using (verified and public.seller_is_public(seller_id));
