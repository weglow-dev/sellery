-- ============================================================
-- 0073 — MYR 크리에이터 상품 등록 저장(docs/myr.md §4.2.1 4번 중 4-1 · 2026-11-05)
--
--   myr_products 컬럼
--     image_urls      text[]  상품 이미지(최대 6장 · 첫 장이 대표 = thumb_url 에도 복사) — Storage 공개 버킷 myr-products 의 <seller id>/<uuid>.<ext>
--     shelf_life      text    유통기한(예 "제조일로부터 24개월") — 샵 "04 · 제품 정보"(비면 샵이 기본 문구)
--     storage_method  text    보관(예 "직사광선을 피해 서늘한 곳")
--     category        임시저장(draft)일 때만 비워둘 수 있다(1단계를 다 채우기 전에도 저장) — 그 밖의 상태는 필수
--   Storage 버킷 myr-products — 공개 읽기(샵 이미지) · 올리기는 콘솔 서버(service role)만 · jpg/png/webp · 4MB(Vercel 요청 4.5MB 한도)
--
--   myr_app_seller_product(seller, id)                     에디터로 다시 열 상품 1건(내 상품 · 삭제 제외) → { ok, product } · { ok:false, code: NOT_FOUND }
--   myr_app_seller_save_product(seller, id, payload, submit)
--       id 없음 = 새 상품 · 있음 = 내 상품 중 draft · rejected 만(판매 중 수정은 4-2 수정 심사)
--       submit=false 임시저장 — 새 상품 · draft 는 draft, rejected 는 rejected 그대로(사유 유지)
--       submit=true  심사 요청 — pending · submitted_at 갱신 · 반려 사유 · 검수 시각 비움
--       → { ok, id, code, status } · { ok:false, code: NOT_FOUND | NOT_EDITABLE(status) | INVALID_INPUT(field) | BAD_IMAGE }
--       필수: 임시저장 = 제품명 · 심사 요청 = 제품명 · 가격 > 0 · 카테고리 · 레시피 노트(콘솔 에디터 stepValid 와 같은 규칙 — 서버의 정답은 여기)
--       이미지는 그 크리에이터 폴더(<seller id>/)의 공개 URL 만 받는다(BAD_IMAGE) · 문자열은 길이 상한으로 자른다
--   myr_app_seller_set_status(seller, id, action)
--       pause listed→paused · resume paused→listed · end listed|paused→ended(되돌릴 수 없음) · delete draft→삭제(deleted_at)
--       → { ok, status } · { ok:false, code: NOT_FOUND | BAD_ACTION | WRONG_STATUS(status) }
--   myr_product_public_json 에 shelf_life · storage_method · image_urls 추가(샵 상세)
--   myr_product_image_orphans(age, limit)  버려진 상품 이미지(24시간 지난 미참조) — 샵 크론이 지운다
--
--   권한: 위 세 RPC 는 service role 만 — 크리에이터 id 는 콘솔 서버가 세션(requireSeller)에서 정해 넘긴다(결정 3).
--   테스트: supabase/tests/myr_seller_product_save.test.sql. 재실행 가능.
-- ============================================================

alter table public.myr_products add column if not exists image_urls text[] not null default '{}';
alter table public.myr_products add column if not exists shelf_life text not null default '';
alter table public.myr_products add column if not exists storage_method text not null default '';
comment on column public.myr_products.image_urls is '상품 이미지(최대 6 · 첫 장 = thumb_url) — Storage myr-products <seller id>/<uuid>.<ext> 공개 URL (0073)';

alter table public.myr_products alter column category drop not null;
alter table public.myr_products drop constraint if exists myr_products_category_required;
alter table public.myr_products add constraint myr_products_category_required check (status = 'draft' or category is not null);
alter table public.myr_products drop constraint if exists myr_products_image_urls_max;
alter table public.myr_products add constraint myr_products_image_urls_max check (cardinality(image_urls) <= 6);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('myr-products', 'myr-products', true, 4194304, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- 샵 공개 응답 — 0059 정의 + shelf_life · storage_method · image_urls
-- ------------------------------------------------------------
create or replace function public.myr_product_public_json(p public.myr_products, s public.sellers)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p.id, 'code', p.code, 'category', p.category, 'name', p.name, 'unit', p.unit, 'price', p.price,
    'tile', p.tile, 'thumb_url', p.thumb_url, 'image_urls', to_jsonb(p.image_urls), 'icon', p.icon, 'form', p.form, 'pack', p.pack, 'flavor', p.flavor, 'tag', p.tag,
    'chips', to_jsonb(p.chips), 'ingredients', to_jsonb(p.ingredients), 'note', p.note, 'howto', p.howto,
    'story_title', p.story_title, 'story', p.story, 'ingredient_rows', p.ingredient_rows,
    'howto_steps', p.howto_steps, 'faq', p.faq, 'shelf_life', p.shelf_life, 'storage_method', p.storage_method,
    'sold_out', (p.stock - p.sold_qty) <= 0,
    'creator', jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'avatar_url', s.avatar_url),
    'created_at', p.created_at
  )
$$;
revoke all on function public.myr_product_public_json(public.myr_products, public.sellers) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 에디터용 상품 1건(내 상품)
-- ------------------------------------------------------------
create or replace function public.myr_seller_product_json(p public.myr_products)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p.id, 'code', p.code, 'status', p.status, 'reject_reason', p.reject_reason,
    'name', p.name, 'price', p.price, 'unit', p.unit, 'category', p.category,
    'tile', p.tile, 'icon', p.icon, 'image_urls', to_jsonb(p.image_urls), 'chips', to_jsonb(p.chips), 'note', p.note,
    'story_title', p.story_title, 'story', p.story, 'ingredient_rows', p.ingredient_rows, 'howto_steps', p.howto_steps, 'faq', p.faq,
    'form', p.form, 'pack', p.pack, 'shelf_life', p.shelf_life, 'storage_method', p.storage_method,
    'submitted_at', p.submitted_at, 'updated_at', p.updated_at
  )
$$;
revoke all on function public.myr_seller_product_json(public.myr_products) from public, anon, authenticated;

create or replace function public.myr_app_seller_product(p_seller uuid, p_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  p public.myr_products%rowtype;
begin
  select * into p from public.myr_products where id = p_id and seller_id = p_seller and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  return jsonb_build_object('ok', true, 'product', public.myr_seller_product_json(p));
end;
$$;
revoke all on function public.myr_app_seller_product(uuid, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_product(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- 저장(임시저장 · 심사 요청)
-- ------------------------------------------------------------
-- 문자열 정리: 앞뒤 공백 제거 · 상한으로 자르기
create or replace function public.myr_clip(v jsonb, n integer)
returns text
language sql
immutable
set search_path = public
as $$ select left(btrim(case when jsonb_typeof(v) = 'string' then v #>> '{}' else '' end), n) $$;
revoke all on function public.myr_clip(jsonb, integer) from public, anon, authenticated;

create or replace function public.myr_app_seller_save_product(p_seller uuid, p_id uuid, p_payload jsonb, p_submit boolean)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p          public.myr_products%rowtype;
  j          jsonb := coalesce(p_payload, '{}'::jsonb);
  v_name     text := public.myr_clip(j -> 'name', 60);
  v_price    integer;
  v_category text := nullif(public.myr_clip(j -> 'category', 20), '');
  v_note     text := public.myr_clip(j -> 'note', 1000);
  v_images   text[];
  v_chips    text[];
  v_ing      jsonb;
  v_steps    jsonb;
  v_faq      jsonb;
  v_tile     text := nullif(public.myr_clip(j -> 'tile', 200), '');
  v_icon     text := public.myr_clip(j -> 'icon', 20);
  v_status   text;
  v_img_re   text := '^https?://[^/]+/storage/v1/object/public/myr-products/' || p_seller::text || '/[A-Za-z0-9-]{8,64}\.(jpg|png|webp)$';
begin
  -- 대상 — 새 상품이거나 내 상품 중 draft · rejected
  if p_id is not null then
    select * into p from public.myr_products where id = p_id and seller_id = p_seller and deleted_at is null for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
    if p.status not in ('draft', 'rejected') then return jsonb_build_object('ok', false, 'code', 'NOT_EDITABLE', 'status', p.status); end if;
  elsif not exists (select 1 from public.sellers s where s.id = p_seller and s.active) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- 값 정리
  v_price := case when jsonb_typeof(j -> 'price') = 'number' then (j ->> 'price')::numeric::integer else 0 end;
  if v_price < 0 or v_price > 10000000 then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'price'); end if;
  if v_category is not null and v_category not in ('diet','inner','derma','hair','mental','mens') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'category');
  end if;
  if jsonb_typeof(j -> 'image_urls') = 'array' and jsonb_array_length(j -> 'image_urls') > 6 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'images');
  end if;
  select coalesce(array_agg(u order by o), '{}') into v_images
    from jsonb_array_elements_text(case when jsonb_typeof(j -> 'image_urls') = 'array' then j -> 'image_urls' else '[]'::jsonb end) with ordinality as t(u, o);
  if exists (select 1 from unnest(v_images) u where u !~ v_img_re) then return jsonb_build_object('ok', false, 'code', 'BAD_IMAGE'); end if;
  select coalesce(array_agg(c order by o), '{}') into v_chips
    from (select left(btrim(c), 20) c, o from jsonb_array_elements_text(case when jsonb_typeof(j -> 'chips') = 'array' then j -> 'chips' else '[]'::jsonb end) with ordinality as t(c, o)) x
   where c <> '' and o <= 3;
  select coalesce(jsonb_agg(jsonb_build_object('name', public.myr_clip(e -> 'name', 40), 'why', public.myr_clip(e -> 'why', 200), 'amount', public.myr_clip(e -> 'amount', 40)) order by o), '[]'::jsonb) into v_ing
    from jsonb_array_elements(case when jsonb_typeof(j -> 'ingredient_rows') = 'array' then j -> 'ingredient_rows' else '[]'::jsonb end) with ordinality as t(e, o)
   where o <= 12 and public.myr_clip(e -> 'name', 40) <> '';
  select coalesce(jsonb_agg(jsonb_build_object('t', public.myr_clip(e -> 't', 40), 'd', public.myr_clip(e -> 'd', 300)) order by o), '[]'::jsonb) into v_steps
    from jsonb_array_elements(case when jsonb_typeof(j -> 'howto_steps') = 'array' then j -> 'howto_steps' else '[]'::jsonb end) with ordinality as t(e, o)
   where o <= 6 and public.myr_clip(e -> 't', 40) <> '';
  select coalesce(jsonb_agg(jsonb_build_object('q', public.myr_clip(e -> 'q', 120), 'a', public.myr_clip(e -> 'a', 600)) order by o), '[]'::jsonb) into v_faq
    from jsonb_array_elements(case when jsonb_typeof(j -> 'faq') = 'array' then j -> 'faq' else '[]'::jsonb end) with ordinality as t(e, o)
   where o <= 10 and public.myr_clip(e -> 'q', 120) <> '' and public.myr_clip(e -> 'a', 600) <> '';
  -- 비주얼 — 그라데이션 · 아이콘 id 만(스타일 주입 방지)
  if v_tile is not null and v_tile !~ '^linear-gradient\([0-9a-zA-Z#,.% ()-]{1,180}\)$' then v_tile := null; end if;
  if v_icon !~ '^[a-z]{2,20}$' then v_icon := 'pill'; end if;

  -- 필수 — 임시저장은 제품명만 · 심사 요청은 제품명 · 가격 · 카테고리 · 레시피 노트
  if v_name = '' then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'name'); end if;
  if p_submit then
    if v_price <= 0 then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'price'); end if;
    if v_category is null then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'category'); end if;
    if v_note = '' then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'note'); end if;
  end if;

  v_status := case when p_submit then 'pending' when p_id is null then 'draft' else p.status end;

  if p_id is null then
    insert into public.myr_products (seller_id, category, name, price, unit, tile, thumb_url, image_urls, icon, form, pack, chips, ingredients, note, howto,
                                     story_title, story, ingredient_rows, howto_steps, faq, shelf_life, storage_method, status, submitted_at)
    values (p_seller, v_category, v_name, v_price, public.myr_clip(j -> 'unit', 40), v_tile, v_images[1], v_images, v_icon,
            public.myr_clip(j -> 'form', 30), public.myr_clip(j -> 'pack', 30), v_chips,
            coalesce((select array_agg(e ->> 'name') from jsonb_array_elements(v_ing) e), '{}'), v_note, coalesce(v_steps -> 0 ->> 't', ''),
            public.myr_clip(j -> 'story_title', 80), public.myr_clip(j -> 'story', 3000), v_ing, v_steps, v_faq,
            public.myr_clip(j -> 'shelf_life', 80), public.myr_clip(j -> 'storage_method', 80), v_status, now())
    returning * into p;
  else
    update public.myr_products
       set category = v_category, name = v_name, price = v_price, unit = public.myr_clip(j -> 'unit', 40), tile = v_tile,
           thumb_url = v_images[1], image_urls = v_images, icon = v_icon,
           form = public.myr_clip(j -> 'form', 30), pack = public.myr_clip(j -> 'pack', 30), chips = v_chips,
           ingredients = coalesce((select array_agg(e ->> 'name') from jsonb_array_elements(v_ing) e), '{}'), note = v_note,
           howto = coalesce(v_steps -> 0 ->> 't', ''),
           story_title = public.myr_clip(j -> 'story_title', 80), story = public.myr_clip(j -> 'story', 3000),
           ingredient_rows = v_ing, howto_steps = v_steps, faq = v_faq,
           shelf_life = public.myr_clip(j -> 'shelf_life', 80), storage_method = public.myr_clip(j -> 'storage_method', 80),
           status = v_status,
           submitted_at = case when p_submit then now() else submitted_at end,
           reject_reason = case when p_submit then null else reject_reason end,
           reviewed_at = case when p_submit then null else reviewed_at end
     where id = p.id
     returning * into p;
  end if;

  return jsonb_build_object('ok', true, 'id', p.id, 'code', p.code, 'status', p.status);
end;
$$;
revoke all on function public.myr_app_seller_save_product(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_seller_save_product(uuid, uuid, jsonb, boolean) to service_role;

-- ------------------------------------------------------------
-- 판매 상태 바꾸기 · 임시저장 삭제
-- ------------------------------------------------------------
create or replace function public.myr_app_seller_set_status(p_seller uuid, p_id uuid, p_action text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p        public.myr_products%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_from   text[];
  v_to     text;
begin
  case v_action
    when 'pause' then v_from := array['listed']; v_to := 'paused';
    when 'resume' then v_from := array['paused']; v_to := 'listed';
    when 'end' then v_from := array['listed', 'paused']; v_to := 'ended';
    when 'delete' then v_from := array['draft']; v_to := null;
    else return jsonb_build_object('ok', false, 'code', 'BAD_ACTION');
  end case;
  select * into p from public.myr_products where id = p_id and seller_id = p_seller and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not (p.status = any (v_from)) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', p.status); end if;
  if v_action = 'delete' then
    update public.myr_products set deleted_at = now() where id = p.id;
    return jsonb_build_object('ok', true, 'status', 'deleted');
  end if;
  update public.myr_products set status = v_to where id = p.id returning * into p;
  return jsonb_build_object('ok', true, 'status', p.status);
end;
$$;
revoke all on function public.myr_app_seller_set_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.myr_app_seller_set_status(uuid, uuid, text) to service_role;

-- ------------------------------------------------------------
-- 버려진 상품 이미지 찾기 — 버킷 myr-products 에서 p_age 보다 오래됐고 어느 상품 행(삭제 · 종료 포함)의 image_urls 에도 없는 것.
--   에디터에서 지운 사진 · 올리고 저장하지 않은 사진. 지우기는 샵 크론(/api/cron/reconcile · 10분마다)이 Storage API 로(0068 환불 사진과 같은 방식).
--   24시간 여유 — 에디터를 열어 둔 채 저장 전인 사진을 지우지 않게. 4-2(수정 심사)에서 수정본의 이미지도 "참조" 에 넣는다.
-- ------------------------------------------------------------
create or replace function public.myr_product_image_orphans(p_age interval default interval '24 hours', p_limit integer default 100)
returns setof text
language sql
stable
security definer set search_path = public
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'myr-products'
     and o.created_at < now() - p_age
     and not exists (select 1 from public.myr_products p, unnest(p.image_urls) u where right(u, length(o.name) + 1) = '/' || o.name)
   order by o.created_at
   limit greatest(coalesce(p_limit, 100), 1)
$$;
revoke all on function public.myr_product_image_orphans(interval, integer) from public, anon, authenticated;
grant execute on function public.myr_product_image_orphans(interval, integer) to service_role;
