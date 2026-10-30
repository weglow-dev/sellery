-- ============================================================
-- 0057 MYR 장바구니 · 찜 — 계정 보관 (docs/myr.md §6.2 · §9-12 · 2026-10-30)
--
-- 로그인한 고객의 장바구니와 찜은 **계정(auth.users)** 에 둔다 — 폰에서 담고 PC 에서 보고, 앱을 지워도 남는다(보통의 커머스 흐름).
-- 비회원은 브라우저(localStorage)에 두고, 로그인하는 순간 `myr_cart_merge` · `myr_likes_merge` 로 계정에 합친다.
--   · 장바구니 줄 = (user, product, option_index) 하나 · qty 1~9 (샵 `MAX_QTY` 와 같은 값 — 바꾸면 둘 다).
--   · 가격은 저장하지 않는다 — 읽을 때(`myr_cart_get`) 상품 표에서 다시 가져오므로 가격 변경·품절·판매중지가 바로 반영된다.
--     살 수 없게 된 줄(paused · 삭제 · 셀러 비활성 · 품절)은 `available:false` 로 돌려주고 지우지 않는다 — 고객이 보고 지운다.
--   · 체크아웃(0058~)은 장바구니를 믿지 않고 줄마다 다시 검증한다(§6.2).
--
-- 권한(docs/myr.md §3.1 규칙 2): 표는 service role 만(RLS on · 정책 없음 · anon/authenticated grant 없음). 함수 전부 security definer ·
--   `revoke … from public, anon, authenticated` · `grant … to service_role` — 앱 서버(`apps/myr-shop/src/lib/server/cart.ts`)가 세션에서 꺼낸
--   user id 를 `p_user_id` 로 넘긴다(규칙 1 · 요청 본문의 id 는 쓰지 않는다). 반환은 `{ ok, code }` — 실패 code:
--   NO_USER · NOT_FOUND · NOT_AVAILABLE · BAD_QTY · BAD_OPTION · BAD_LINES.
-- 테스트: supabase/tests/myr_cart_likes.test.sql (npm run test:db). 실행: 0056 이후. 재실행 가능.
-- ============================================================

create table if not exists public.myr_cart_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  product_id    uuid not null references public.myr_products (id) on delete cascade,
  option_index  integer not null default 0 check (option_index >= 0),   -- myr_products.options 의 index (옵션 없는 상품은 0)
  qty           integer not null check (qty between 1 and 9),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_id, product_id, option_index)
);
create index if not exists myr_cart_items_user_idx on public.myr_cart_items (user_id, created_at);

drop trigger if exists myr_cart_items_updated_at on public.myr_cart_items;
create trigger myr_cart_items_updated_at
  before update on public.myr_cart_items
  for each row execute function public.set_updated_at();

alter table public.myr_cart_items enable row level security;
revoke all on public.myr_cart_items from anon, authenticated;

create table if not exists public.myr_likes (
  user_id       uuid not null references auth.users (id) on delete cascade,
  product_id    uuid not null references public.myr_products (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, product_id)
);
alter table public.myr_likes enable row level security;
revoke all on public.myr_likes from anon, authenticated;

-- ------------------------------------------------------------
-- 살 수 있는 상품인가(내부) — 샵 노출 조건(myr_home_products) + 재고. 장바구니·찜 응답의 `available` 와 담기 허용 판정이 이 한 곳.
-- ------------------------------------------------------------
create or replace function public.myr_product_available(p public.myr_products, s public.sellers)
returns boolean
language sql
immutable
as $$
  select p.status = 'listed' and p.deleted_at is null and coalesce(s.active, false) and (p.stock - p.sold_qty) > 0
$$;
revoke all on function public.myr_product_available(public.myr_products, public.sellers) from public, anon, authenticated;

-- ------------------------------------------------------------
-- myr_cart_get(user) — 담은 순서. 줄 = 상품 공개 JSON + qty · option_index · available
-- ------------------------------------------------------------
create or replace function public.myr_cart_get(p_user_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(
           public.myr_product_public_json(p, s)
             || jsonb_build_object('qty', c.qty, 'option_index', c.option_index, 'available', public.myr_product_available(p, s))
           order by c.created_at, c.id), '[]'::jsonb)
    from public.myr_cart_items c
    join public.myr_products p on p.id = c.product_id
    join public.sellers s on s.id = p.seller_id
   where c.user_id = p_user_id
$$;
revoke all on function public.myr_cart_get(uuid) from public, anon, authenticated;
grant execute on function public.myr_cart_get(uuid) to service_role;

-- ------------------------------------------------------------
-- myr_cart_set(user, code, option_index, qty, add) — 줄 하나를 qty 로 맞춘다(add=true 면 더한다 · 상한 9). qty 0 = 삭제(살 수 없는 줄도 지울 수 있다).
--   { ok:true, code, qty } · 실패 { ok:false, code: NO_USER | BAD_QTY | BAD_OPTION | NOT_FOUND | NOT_AVAILABLE }
-- ------------------------------------------------------------
create or replace function public.myr_cart_set(p_user_id uuid, p_code text, p_option_index integer default 0, p_qty integer default 1, p_add boolean default false)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c_max_qty    constant integer := 9;
  v_code       text := lower(btrim(coalesce(p_code, '')));
  v_product_id uuid;
  v_available  boolean;
  v_qty        integer;
begin
  if p_user_id is null then return jsonb_build_object('ok', false, 'code', 'NO_USER'); end if;
  if p_qty is null or p_qty < 0 or p_qty > c_max_qty then return jsonb_build_object('ok', false, 'code', 'BAD_QTY'); end if;
  if p_option_index is null or p_option_index < 0 then return jsonb_build_object('ok', false, 'code', 'BAD_OPTION'); end if;

  select p.id, public.myr_product_available(p, s) into v_product_id, v_available
    from public.myr_products p
    left join public.sellers s on s.id = p.seller_id
   where p.code = v_code and p.deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;

  if p_qty = 0 then
    delete from public.myr_cart_items where user_id = p_user_id and product_id = v_product_id and option_index = p_option_index;
    return jsonb_build_object('ok', true, 'code', v_code, 'qty', 0);
  end if;
  if not v_available then return jsonb_build_object('ok', false, 'code', 'NOT_AVAILABLE'); end if;

  insert into public.myr_cart_items (user_id, product_id, option_index, qty)
  values (p_user_id, v_product_id, p_option_index, p_qty)
  on conflict (user_id, product_id, option_index) do update
    set qty = case when p_add then least(c_max_qty, public.myr_cart_items.qty + excluded.qty) else excluded.qty end
  returning qty into v_qty;
  return jsonb_build_object('ok', true, 'code', v_code, 'qty', v_qty);
end;
$$;
revoke all on function public.myr_cart_set(uuid, text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.myr_cart_set(uuid, text, integer, integer, boolean) to service_role;

-- ------------------------------------------------------------
-- myr_cart_merge(user, lines) — 비회원 장바구니를 로그인 계정에 합친다. lines = [{ code, option_index?, qty }] ≤ 50 · 줄마다 myr_cart_set(add).
--   살 수 없는 줄·잘못된 줄은 건너뛴다. { ok:true, merged, skipped } · { ok:false, code: NO_USER | BAD_LINES }
-- ------------------------------------------------------------
create or replace function public.myr_cart_merge(p_user_id uuid, p_lines jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  l        jsonb;
  r        jsonb;
  v_qty    integer;
  v_opt    integer;
  v_merged integer := 0;
  v_skip   integer := 0;
begin
  if p_user_id is null then return jsonb_build_object('ok', false, 'code', 'NO_USER'); end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 50 then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    v_qty := case when (l->>'qty') ~ '^\d{1,3}$' then (l->>'qty')::integer else -1 end;
    v_opt := case when (l->>'option_index') is null then 0 when (l->>'option_index') ~ '^\d{1,3}$' then (l->>'option_index')::integer else -1 end;
    r := public.myr_cart_set(p_user_id, l->>'code', v_opt, v_qty, true);
    if (r->>'ok')::boolean and v_qty > 0 then v_merged := v_merged + 1; else v_skip := v_skip + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'merged', v_merged, 'skipped', v_skip);
end;
$$;
revoke all on function public.myr_cart_merge(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_cart_merge(uuid, jsonb) to service_role;

-- myr_cart_clear(user) — 주문 완료 뒤 비우기. { ok:true, removed }
create or replace function public.myr_cart_clear(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_n integer;
begin
  if p_user_id is null then return jsonb_build_object('ok', false, 'code', 'NO_USER'); end if;
  delete from public.myr_cart_items where user_id = p_user_id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'removed', v_n);
end;
$$;
revoke all on function public.myr_cart_clear(uuid) from public, anon, authenticated;
grant execute on function public.myr_cart_clear(uuid) to service_role;

-- ------------------------------------------------------------
-- 찜 — myr_like_set(user, code, liked) · myr_likes_merge(user, codes ≤100) · myr_likes_get(user) (최근 찜 순 · 살 수 없는 상품은 뺀다)
-- ------------------------------------------------------------
create or replace function public.myr_like_set(p_user_id uuid, p_code text, p_liked boolean)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_code       text := lower(btrim(coalesce(p_code, '')));
  v_product_id uuid;
begin
  if p_user_id is null then return jsonb_build_object('ok', false, 'code', 'NO_USER'); end if;
  select id into v_product_id from public.myr_products where code = v_code and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if coalesce(p_liked, false) then
    insert into public.myr_likes (user_id, product_id) values (p_user_id, v_product_id) on conflict do nothing;
  else
    delete from public.myr_likes where user_id = p_user_id and product_id = v_product_id;
  end if;
  return jsonb_build_object('ok', true, 'code', v_code, 'liked', coalesce(p_liked, false));
end;
$$;
revoke all on function public.myr_like_set(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.myr_like_set(uuid, text, boolean) to service_role;

create or replace function public.myr_likes_merge(p_user_id uuid, p_codes jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c        jsonb;
  v_merged integer := 0;
  v_skip   integer := 0;
begin
  if p_user_id is null then return jsonb_build_object('ok', false, 'code', 'NO_USER'); end if;
  if p_codes is null or jsonb_typeof(p_codes) <> 'array' or jsonb_array_length(p_codes) > 100 then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
  for c in select * from jsonb_array_elements(p_codes) loop
    if jsonb_typeof(c) = 'string' and (public.myr_like_set(p_user_id, c #>> '{}', true)->>'ok')::boolean then v_merged := v_merged + 1; else v_skip := v_skip + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'merged', v_merged, 'skipped', v_skip);
end;
$$;
revoke all on function public.myr_likes_merge(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_likes_merge(uuid, jsonb) to service_role;

create or replace function public.myr_likes_get(p_user_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(public.myr_product_public_json(p, s) order by l.created_at desc), '[]'::jsonb)
    from public.myr_likes l
    join public.myr_products p on p.id = l.product_id
    join public.sellers s on s.id = p.seller_id
   where l.user_id = p_user_id and public.myr_product_available(p, s)
$$;
revoke all on function public.myr_likes_get(uuid) from public, anon, authenticated;
grant execute on function public.myr_likes_get(uuid) to service_role;

comment on table public.myr_cart_items is 'MYR 샵 장바구니 — 로그인 고객의 계정 보관 (가격 없음 · 읽을 때 상품 표에서) (docs/myr.md §6.2 · 0057)';
comment on table public.myr_likes is 'MYR 샵 찜 — 로그인 고객의 계정 보관 (docs/myr.md §9-12 · 0057)';
