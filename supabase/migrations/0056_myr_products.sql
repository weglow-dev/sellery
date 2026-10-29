-- ============================================================
-- 0056 MYR 샵 상품 — docs/myr.md §3 · §7 S1 (2026-10-29)
--
-- MYR(Make Your Recipe) 고객 샵(apps/myr-shop)이 읽는 상품 표 1개 + 공개 RPC 2개 + 운영 검수 RPC 1개.
--   · 판매 단위 = 상품(캠페인 없음 · docs/myr.md 결정 2). `seller_id`(인플루언서 = 기존 sellers 행) 가 주인이고 not null.
--   · 상품 등록은 인플루언서 콘솔(M2 · `myr_app_upsert_product`)이 하지만 콘솔 전까지는 운영 스크립트
--     `packages/db/scripts/myr-products.mjs` 가 service role 로 넣는다(docs/myr.md §7 S1 · S8).
--   · 상세페이지 섹션(story · points · ingredient_rows · howto_steps · faq)은 인플루언서가 등록 폼에서 채우는 템플릿 —
--     apps/myr-shop `lib/data.ts` 의 `Detail` 타입과 1:1 (디자인 "MYR Shop PC" 2026-10-29).
--   · 비주얼은 아직 아이콘 타일(`tile` 그라데이션 + `icon`) — 실제 제품 사진이 생기면 `thumb_url` 을 쓴다.
--   · 셀러리 표(campaigns · orders · products …)는 건드리지 않는다. 함수 접두 `myr_`.
--
-- 권한(docs/myr.md §3.1 규칙 2): 표는 service role 만(RLS on · 정책 없음 · anon/authenticated grant 없음).
--   공개 읽기는 `myr_home_products()` · `myr_product_card(code)` (security definer · anon 실행) 로만 —
--   재고 · 마진율 · 반려 사유 · 검수 정보는 응답에 넣지 않는다. 검수 RPC 는 service_role 만.
-- 실행: 0055 이후. 재실행 가능(if not exists / create or replace).
-- ============================================================

create sequence if not exists public.myr_product_code_seq start 100;

create table if not exists public.myr_products (
  id                  uuid primary key default gen_random_uuid(),
  -- URL slug `/p/<code>` — 소문자·숫자·하이픈 1~48. 등록 때 비우면 'm' || 시퀀스
  code                text not null unique default ('m' || nextval('public.myr_product_code_seq')),
  seller_id           uuid not null references public.sellers (id) on delete restrict,
  -- MYR 카테고리(디자인 · docs/myr.md §9-5) — 셀러리 categories 표와 별개
  category            text not null check (category in ('diet','inner','derma','hair','mental','mens')),
  name                text not null,
  sub                 text not null default '',                 -- 한 줄 설명 ('가르시니아 · 하루 한 포')
  unit                text not null default '',                 -- 구성 ('14포 / 2주분')
  price               integer not null check (price >= 0),      -- 대표가(KRW) — options 가 비면 이 값 하나
  options             jsonb not null default '[]'::jsonb,       -- [{ n, price }] — M4 체크아웃이 가격의 단일 소스로 쓴다
  tile                text,                                     -- 타일 배경(CSS gradient) — 사진 전까지
  thumb_url           text,                                     -- 제품 사진(Storage URL) — 있으면 타일 대신
  icon                text not null default 'pill',             -- 제형 아이콘 id (apps/myr-shop lib/icons.ts)
  form                text not null default '',                 -- 제형 ('젤리')
  pack                text not null default '',                 -- 포장 ('스틱포')
  flavor              text not null default '',
  tag                 text not null default '' check (tag in ('', 'BEST', 'NEW')),
  chips               text[] not null default '{}',             -- 타일 위 칩 3개
  ingredients         text[] not null default '{}',             -- 주요 성분 이름
  note                text not null default '',                 -- 레시피 노트(크리에이터 한마디)
  howto               text not null default '',                 -- 한 줄 섭취법
  specs               jsonb not null default '[]'::jsonb,       -- [{ ic, k, v }] 3개
  -- 상세페이지 섹션(템플릿)
  story_title         text not null default '',
  story               text not null default '',
  points              jsonb not null default '[]'::jsonb,       -- [{ big, t, d }]
  ingredient_rows     jsonb not null default '[]'::jsonb,       -- [{ name, why, amount }]
  howto_title         text not null default '',
  howto_steps         jsonb not null default '[]'::jsonb,       -- [{ t, d }]
  faq                 jsonb not null default '[]'::jsonb,       -- [{ q, a }]
  -- 재고 · 상태 · 검수 (docs/myr.md §6.1)
  stock               integer not null default 0 check (stock >= 0),
  sold_qty            integer not null default 0 check (sold_qty >= 0),   -- M4 에서 myr_order_items 트리거가 유지
  status              text not null default 'pending' check (status in ('pending','listed','paused','rejected')),
  reject_reason       text,
  submitted_at        timestamptz not null default now(),
  reviewed_at         timestamptz,
  reviewed_by         uuid references auth.users (id) on delete set null,
  -- 정산 스냅샷용(docs/myr.md 결정 10 · §9-6) — 주문 줄이 복사한다
  seller_margin_rate  numeric(5,4) check (seller_margin_rate is null or (seller_margin_rate >= 0 and seller_margin_rate <= 1)),
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint myr_products_code_format check (code ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  constraint myr_products_reject_reason_when_rejected check (status <> 'rejected' or reject_reason is not null)
);

create index if not exists myr_products_seller_idx   on public.myr_products (seller_id);
create index if not exists myr_products_status_idx   on public.myr_products (status) where deleted_at is null;
create index if not exists myr_products_category_idx on public.myr_products (category);

drop trigger if exists myr_products_updated_at on public.myr_products;
create trigger myr_products_updated_at
  before update on public.myr_products
  for each row execute function public.set_updated_at();

alter table public.myr_products enable row level security;
revoke all on public.myr_products from anon, authenticated;
-- 정책 없음 → service role 만.

-- ------------------------------------------------------------
-- 공개 응답 조립(내부) — 샵이 보는 필드만. 재고·마진·검수·options 는 뺀다(options 는 M4 체크아웃이 서버에서 읽는다).
-- ------------------------------------------------------------
create or replace function public.myr_product_public_json(p public.myr_products, s public.sellers)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p.id, 'code', p.code, 'category', p.category, 'name', p.name, 'sub', p.sub, 'unit', p.unit, 'price', p.price,
    'tile', p.tile, 'thumb_url', p.thumb_url, 'icon', p.icon, 'form', p.form, 'pack', p.pack, 'flavor', p.flavor, 'tag', p.tag,
    'chips', to_jsonb(p.chips), 'ingredients', to_jsonb(p.ingredients), 'note', p.note, 'howto', p.howto, 'specs', p.specs,
    'story_title', p.story_title, 'story', p.story, 'points', p.points, 'ingredient_rows', p.ingredient_rows,
    'howto_title', p.howto_title, 'howto_steps', p.howto_steps, 'faq', p.faq,
    'sold_out', (p.stock - p.sold_qty) <= 0,
    'creator', jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'avatar_url', s.avatar_url),
    'created_at', p.created_at
  )
$$;
revoke all on function public.myr_product_public_json(public.myr_products, public.sellers) from public, anon, authenticated;

-- ------------------------------------------------------------
-- myr_home_products() — 샵 홈·카테고리 목록: listed · 미삭제 · 셀러 active. 최신 등록순. anon 호출.
-- ------------------------------------------------------------
create or replace function public.myr_home_products()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(public.myr_product_public_json(p, s) order by p.created_at desc), '[]'::jsonb)
    from public.myr_products p
    join public.sellers s on s.id = p.seller_id
   where p.status = 'listed' and p.deleted_at is null and s.active
$$;
revoke all on function public.myr_home_products() from public;
grant execute on function public.myr_home_products() to anon, authenticated;

-- ------------------------------------------------------------
-- myr_product_card(code) — 상품 페이지 1건 + 함께 보면 좋은 레시피(같은 카테고리 또는 같은 크리에이터 · ≤4).
--   listed 가 아니거나 삭제·셀러 비활성이면 null (라우트 404). paused 도 404 — 링크를 들고 와도 안 보인다.
-- ------------------------------------------------------------
create or replace function public.myr_product_card(p_code text)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  p public.myr_products%rowtype;
  s public.sellers%rowtype;
  v_related jsonb;
begin
  select * into p from public.myr_products where code = lower(btrim(coalesce(p_code, ''))) and deleted_at is null and status = 'listed';
  if not found then return null; end if;
  select * into s from public.sellers where id = p.seller_id and active;
  if not found then return null; end if;
  -- 후보 id 를 먼저 고르고 실제 행으로 다시 조인한다 — 함수 인자가 myr_products 행 타입이라 파생 테이블의 r 을 그대로 넘길 수 없다
  select coalesce(jsonb_agg(public.myr_product_public_json(r, rs) order by (r.seller_id = p.seller_id) desc, r.created_at desc), '[]'::jsonb)
    into v_related
    from (
      select c.id from public.myr_products c
        join public.sellers cs on cs.id = c.seller_id and cs.active
       where c.id <> p.id and c.status = 'listed' and c.deleted_at is null
         and (c.category = p.category or c.seller_id = p.seller_id)
       order by (c.seller_id = p.seller_id) desc, c.created_at desc
       limit 4
    ) x
    join public.myr_products r on r.id = x.id
    join public.sellers rs on rs.id = r.seller_id;
  return public.myr_product_public_json(p, s) || jsonb_build_object('related', v_related);
end;
$$;
revoke all on function public.myr_product_card(text) from public;
grant execute on function public.myr_product_card(text) to anon, authenticated;

-- ------------------------------------------------------------
-- myr_app_admin_review_product(id, decision, reason) — 운영 검수 (docs/myr.md §6.1 · 결정 4). service_role 만.
--   approve: pending/rejected/paused → listed · reject: → rejected(사유 필수) · pause: listed → paused
--   반환 { ok, code, status } — { ok:false, code: NOT_FOUND | BAD_DECISION | REASON_REQUIRED | WRONG_STATUS }
--   actor 는 운영자(service role) 뿐이라 p_actor 없음 — myr-admin 콘솔이 생기면 reviewed_by 에 user id 를 넣는 인자를 더한다.
-- ------------------------------------------------------------
create or replace function public.myr_app_admin_review_product(p_product_id uuid, p_decision text, p_reason text default null, p_reviewer uuid default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p          public.myr_products%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_reason   text := nullif(left(regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g'), 200), '');
begin
  select * into p from public.myr_products where id = p_product_id and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_decision not in ('approve', 'reject', 'pause') then return jsonb_build_object('ok', false, 'code', 'BAD_DECISION'); end if;
  if v_decision = 'reject' and v_reason is null then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;
  if v_decision = 'pause' and p.status <> 'listed' then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', p.status); end if;
  update public.myr_products
     set status = case v_decision when 'approve' then 'listed' when 'reject' then 'rejected' else 'paused' end,
         reject_reason = case v_decision when 'reject' then v_reason else null end,
         reviewed_at = now(),
         reviewed_by = p_reviewer
   where id = p.id;
  return jsonb_build_object('ok', true, 'code', p.code, 'status', case v_decision when 'approve' then 'listed' when 'reject' then 'rejected' else 'paused' end);
end;
$$;
revoke all on function public.myr_app_admin_review_product(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_admin_review_product(uuid, text, text, uuid) to service_role;

comment on table public.myr_products is 'MYR 샵 상품 — 인플루언서(sellers) 1명이 주인인 판매 단위 (docs/myr.md §3 · 0056)';
