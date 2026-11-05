-- ============================================================
-- 0074 — MYR 판매 중 상품 수정 심사(docs/myr.md §4.2.1 4번 중 4-2 · 2026-11-05)
--
--   판매 중(listed) · 일시중지(paused) 상품의 상세페이지 수정은 바로 반영하지 않고 "수정본" 으로 보관한다.
--   운영팀이 승인하면 그때 상품 행에 반영 · 반려하면 사유를 남긴다. 심사 중에도 샵은 지금 내용 그대로 판매를 이어 간다.
--
--   표 myr_product_revisions — 상품당 대기 중(pending) 수정본은 1건
--     fields         정리된 수정 내용(아래 myr_product_fields 의 fields — 0073 저장 본문과 같은 키)
--     status         pending 심사 중 · approved 반영됨 · rejected 반려(사유 필수) · canceled 취소(판매 종료로 접힘)
--     created_at     clock_timestamp — 같은 트랜잭션 안에서도 "가장 최근 수정본" 이 하나로 정해진다
--
--   입력 정리 · 반영을 한 곳으로(백엔드 원칙 1)
--     myr_product_fields(seller, payload, submit, keep_images)  0073 저장의 입력 검사 · 정리를 떼어 낸 것 → { ok, fields } · { ok:false, code: INVALID_INPUT(field) | BAD_IMAGE }
--         keep_images = 그 상품에 이미 붙은 이미지(운영팀이 넣은 다른 주소도 그대로 둘 수 있게) — 새 이미지는 0073 과 같이 그 크리에이터 폴더만
--     myr_product_fields_json(p)          상품 행 → 같은 모양의 fields(바뀐 게 없는지 비교)
--     myr_product_apply_fields(id, f)     fields → 상품 행의 상세 컬럼(대표 이미지 · 성분 이름 목록 · 한 줄 섭취법 포함) — 저장(0073)과 수정 승인이 같이 쓴다
--     myr_app_seller_save_product         0073 그대로(반환 · 거절 코드 · 규칙 불변) — 위 두 함수를 호출하도록만 바꿈
--
--   myr_app_seller_submit_revision(seller, id, payload)   수정 심사 요청
--       → { ok, revision_id, status: 'pending' } · { ok:false, code: NOT_FOUND | NOT_REVISABLE(status) | REVISION_PENDING | NO_CHANGE | INVALID_INPUT(field) | BAD_IMAGE }
--       필수 칸은 심사 요청과 같다(제품명 · 가격 > 0 · 카테고리 · 레시피 노트) · 지금 내용과 같으면 NO_CHANGE
--   myr_app_admin_review_revision(product, decision, reason, reviewer)   운영 검수(상품의 대기 중 수정본)
--       approve → 상품에 반영(판매 상태는 그대로) · reject → 반려(사유 필수 · 상품은 그대로)
--       → { ok, code, status } · { ok:false, code: NOT_FOUND | BAD_DECISION | REASON_REQUIRED | WRONG_STATUS(status) }
--   myr_app_seller_set_status — 판매 종료(end) 때 대기 중 수정본을 canceled 로 접는다(나머지 0073 그대로)
--   myr_app_seller_products(0071) 행에 revision { status, reject_reason, submitted_at, reviewed_at } — 가장 최근 수정본이 심사 중 · 반려일 때만(반영 · 취소면 null)
--   myr_app_seller_product(0073) 응답에 revision { id, status, reject_reason, submitted_at, fields } — 같은 기준 · 반려된 수정본은 에디터가 이어서 고친다
--   myr_product_image_orphans(0073) — 심사 중 · (가장 최근인) 반려 수정본의 이미지도 "쓰는 중" 으로 본다
--
--   권한: 새 RPC 는 service role 만(anon · authenticated EXECUTE 회수) — 크리에이터 id 는 콘솔 서버가 세션(requireSeller)에서 정해 넘긴다(결정 3).
--   테스트: supabase/tests/myr_product_revisions.test.sql. 재실행 가능.
-- ============================================================

create table if not exists public.myr_product_revisions (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.myr_products (id) on delete cascade,
  seller_id      uuid not null references public.sellers (id) on delete restrict,
  fields         jsonb not null,
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'canceled')),
  reject_reason  text,
  submitted_at   timestamptz not null default now(),
  reviewed_at    timestamptz,
  reviewed_by    uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default clock_timestamp(),
  constraint myr_product_revisions_reject_reason check (status <> 'rejected' or reject_reason is not null)
);
comment on table public.myr_product_revisions is 'MYR 판매 중 상품 수정본 — 운영 승인 때 myr_products 에 반영 (docs/myr.md §4.2.1 4-2 · 0074)';
create unique index if not exists myr_product_revisions_one_pending on public.myr_product_revisions (product_id) where status = 'pending';
create index if not exists myr_product_revisions_product_idx on public.myr_product_revisions (product_id, created_at desc);
create index if not exists myr_product_revisions_pending_idx on public.myr_product_revisions (submitted_at) where status = 'pending';

alter table public.myr_product_revisions enable row level security;
revoke all on table public.myr_product_revisions from public, anon, authenticated;
grant select, insert, update, delete on table public.myr_product_revisions to service_role;

-- ------------------------------------------------------------
-- 입력 정리(0073 저장에서 떼어 냄 — 검사 순서 · 상한 · 거절 코드 그대로)
-- ------------------------------------------------------------
create or replace function public.myr_product_fields(p_seller uuid, p_payload jsonb, p_submit boolean, p_keep_images text[] default '{}')
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
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
  v_img_re   text := '^https?://[^/]+/storage/v1/object/public/myr-products/' || p_seller::text || '/[A-Za-z0-9-]{8,64}\.(jpg|png|webp)$';
begin
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
  if exists (select 1 from unnest(v_images) u where u !~ v_img_re and not coalesce(u = any (p_keep_images), false)) then
    return jsonb_build_object('ok', false, 'code', 'BAD_IMAGE');
  end if;
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

  -- 필수 — 임시저장은 제품명만 · 심사 요청(새 상품 · 수정)은 제품명 · 가격 · 카테고리 · 레시피 노트
  if v_name = '' then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'name'); end if;
  if p_submit then
    if v_price <= 0 then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'price'); end if;
    if v_category is null then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'category'); end if;
    if v_note = '' then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'note'); end if;
  end if;

  return jsonb_build_object('ok', true, 'fields', jsonb_build_object(
    'name', v_name, 'price', v_price, 'unit', public.myr_clip(j -> 'unit', 40), 'category', v_category,
    'tile', v_tile, 'icon', v_icon, 'image_urls', to_jsonb(v_images), 'chips', to_jsonb(v_chips), 'note', v_note,
    'story_title', public.myr_clip(j -> 'story_title', 80), 'story', public.myr_clip(j -> 'story', 3000),
    'ingredient_rows', v_ing, 'howto_steps', v_steps, 'faq', v_faq,
    'form', public.myr_clip(j -> 'form', 30), 'pack', public.myr_clip(j -> 'pack', 30),
    'shelf_life', public.myr_clip(j -> 'shelf_life', 80), 'storage_method', public.myr_clip(j -> 'storage_method', 80)
  ));
end;
$$;
revoke all on function public.myr_product_fields(uuid, jsonb, boolean, text[]) from public, anon, authenticated;

-- 상품 행 → fields(같은 키) — 수정본과 비교 · 에디터 기준
create or replace function public.myr_product_fields_json(p public.myr_products)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'name', p.name, 'price', p.price, 'unit', p.unit, 'category', p.category,
    'tile', p.tile, 'icon', p.icon, 'image_urls', to_jsonb(p.image_urls), 'chips', to_jsonb(p.chips), 'note', p.note,
    'story_title', p.story_title, 'story', p.story, 'ingredient_rows', p.ingredient_rows, 'howto_steps', p.howto_steps, 'faq', p.faq,
    'form', p.form, 'pack', p.pack, 'shelf_life', p.shelf_life, 'storage_method', p.storage_method
  )
$$;
revoke all on function public.myr_product_fields_json(public.myr_products) from public, anon, authenticated;

-- fields → 상품 행(상세 컬럼만 — 상태 · 재고 · 마진 · 옵션 · 태그는 건드리지 않는다)
create or replace function public.myr_product_apply_fields(p_id uuid, f jsonb)
returns void
language sql
volatile
set search_path = public
as $$
  update public.myr_products
     set category = f ->> 'category', name = f ->> 'name', price = (f ->> 'price')::integer, unit = f ->> 'unit', tile = f ->> 'tile',
         thumb_url = f -> 'image_urls' ->> 0,
         image_urls = array(select u from jsonb_array_elements_text(f -> 'image_urls') with ordinality t(u, o) order by o),
         icon = f ->> 'icon', form = f ->> 'form', pack = f ->> 'pack',
         chips = array(select c from jsonb_array_elements_text(f -> 'chips') with ordinality t(c, o) order by o),
         ingredients = array(select e ->> 'name' from jsonb_array_elements(f -> 'ingredient_rows') with ordinality t(e, o) order by o),
         note = f ->> 'note', howto = coalesce(f -> 'howto_steps' -> 0 ->> 't', ''),
         story_title = f ->> 'story_title', story = f ->> 'story',
         ingredient_rows = f -> 'ingredient_rows', howto_steps = f -> 'howto_steps', faq = f -> 'faq',
         shelf_life = f ->> 'shelf_life', storage_method = f ->> 'storage_method'
   where id = p_id
$$;
revoke all on function public.myr_product_apply_fields(uuid, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 저장(0073) — 정리 · 반영을 위 함수로. 대상 · 상태 · 반환은 그대로
-- ------------------------------------------------------------
create or replace function public.myr_app_seller_save_product(p_seller uuid, p_id uuid, p_payload jsonb, p_submit boolean)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p        public.myr_products%rowtype;
  r        jsonb;
  f        jsonb;
  v_status text;
begin
  -- 대상 — 새 상품이거나 내 상품 중 draft · rejected (판매 중 수정은 myr_app_seller_submit_revision)
  if p_id is not null then
    select * into p from public.myr_products where id = p_id and seller_id = p_seller and deleted_at is null for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
    if p.status not in ('draft', 'rejected') then return jsonb_build_object('ok', false, 'code', 'NOT_EDITABLE', 'status', p.status); end if;
  elsif not exists (select 1 from public.sellers s where s.id = p_seller and s.active) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  r := public.myr_product_fields(p_seller, p_payload, p_submit);
  if not (r ->> 'ok')::boolean then return r; end if;
  f := r -> 'fields';
  v_status := case when p_submit then 'pending' when p_id is null then 'draft' else p.status end;

  if p_id is null then
    insert into public.myr_products (seller_id, category, name, price, status, submitted_at)
    values (p_seller, f ->> 'category', f ->> 'name', (f ->> 'price')::integer, v_status, now())
    returning * into p;
  end if;
  perform public.myr_product_apply_fields(p.id, f);
  if p_id is not null then
    update public.myr_products
       set status = v_status,
           submitted_at = case when p_submit then now() else submitted_at end,
           reject_reason = case when p_submit then null else reject_reason end,
           reviewed_at = case when p_submit then null else reviewed_at end
     where id = p.id;
  end if;
  select * into p from public.myr_products where id = p.id;

  return jsonb_build_object('ok', true, 'id', p.id, 'code', p.code, 'status', p.status);
end;
$$;
revoke all on function public.myr_app_seller_save_product(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_seller_save_product(uuid, uuid, jsonb, boolean) to service_role;

-- ------------------------------------------------------------
-- 수정 심사 요청(크리에이터)
-- ------------------------------------------------------------
create or replace function public.myr_app_seller_submit_revision(p_seller uuid, p_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p     public.myr_products%rowtype;
  keep  text[];
  r     jsonb;
  cur   jsonb;
  v_id  uuid;
begin
  select * into p from public.myr_products where id = p_id and seller_id = p_seller and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p.status not in ('listed', 'paused') then return jsonb_build_object('ok', false, 'code', 'NOT_REVISABLE', 'status', p.status); end if;
  if exists (select 1 from public.myr_product_revisions where product_id = p.id and status = 'pending') then
    return jsonb_build_object('ok', false, 'code', 'REVISION_PENDING');
  end if;

  keep := array_remove(p.image_urls || p.thumb_url, null);
  r := public.myr_product_fields(p_seller, p_payload, true, keep);
  if not (r ->> 'ok')::boolean then return r; end if;
  -- 지금 내용도 같은 정리를 거쳐 비교(공백 · 빈 줄 차이는 "바뀜" 이 아니다)
  cur := coalesce(public.myr_product_fields(p_seller, public.myr_product_fields_json(p), false, keep) -> 'fields', public.myr_product_fields_json(p));
  if r -> 'fields' = cur then return jsonb_build_object('ok', false, 'code', 'NO_CHANGE'); end if;

  insert into public.myr_product_revisions (product_id, seller_id, fields)
  values (p.id, p_seller, r -> 'fields')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'revision_id', v_id, 'status', 'pending');
end;
$$;
revoke all on function public.myr_app_seller_submit_revision(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_seller_submit_revision(uuid, uuid, jsonb) to service_role;

-- ------------------------------------------------------------
-- 수정 심사 검수(운영) — 상품의 대기 중 수정본
-- ------------------------------------------------------------
create or replace function public.myr_app_admin_review_revision(p_product_id uuid, p_decision text, p_reason text default null, p_reviewer uuid default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p          public.myr_products%rowtype;
  rv         public.myr_product_revisions%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_reason   text := nullif(left(regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g'), 200), '');
begin
  if v_decision not in ('approve', 'reject') then return jsonb_build_object('ok', false, 'code', 'BAD_DECISION'); end if;
  select * into p from public.myr_products where id = p_product_id and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select * into rv from public.myr_product_revisions where product_id = p.id and status = 'pending' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_decision = 'reject' and v_reason is null then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;

  if v_decision = 'approve' then
    if p.status not in ('listed', 'paused') then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', p.status); end if;
    perform public.myr_product_apply_fields(p.id, rv.fields);
    update public.myr_products set reviewed_at = now(), reviewed_by = p_reviewer where id = p.id;
  end if;
  update public.myr_product_revisions
     set status = case v_decision when 'approve' then 'approved' else 'rejected' end,
         reject_reason = case v_decision when 'reject' then v_reason end,
         reviewed_at = now(),
         reviewed_by = p_reviewer
   where id = rv.id;
  return jsonb_build_object('ok', true, 'code', p.code, 'status', case v_decision when 'approve' then 'approved' else 'rejected' end);
end;
$$;
revoke all on function public.myr_app_admin_review_revision(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_admin_review_revision(uuid, text, text, uuid) to service_role;

-- ------------------------------------------------------------
-- 판매 상태(0073) — 판매 종료 때 대기 중 수정본을 접는다
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
  if v_action = 'end' then
    update public.myr_product_revisions set status = 'canceled' where product_id = p.id and status = 'pending';
  end if;
  return jsonb_build_object('ok', true, 'status', p.status);
end;
$$;
revoke all on function public.myr_app_seller_set_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.myr_app_seller_set_status(uuid, uuid, text) to service_role;

-- ------------------------------------------------------------
-- 읽기 — 가장 최근 수정본이 심사 중 · 반려일 때만 보인다
-- ------------------------------------------------------------
create or replace function public.myr_product_open_revision(p_product_id uuid)
returns public.myr_product_revisions
language sql
stable
set search_path = public
as $$
  select r.* from (
    select * from public.myr_product_revisions where product_id = p_product_id order by created_at desc limit 1
  ) r where r.status in ('pending', 'rejected')
$$;
revoke all on function public.myr_product_open_revision(uuid) from public, anon, authenticated;

create or replace function public.myr_app_seller_products(p_seller uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'code', p.code, 'name', p.name, 'status', p.status, 'reject_reason', p.reject_reason,
           'category', p.category, 'price', p.price, 'option_count', jsonb_array_length(p.options),
           'stock', p.stock, 'sold_qty', p.sold_qty, 'stock_left', greatest(p.stock - p.sold_qty, 0),
           'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url,
           'submitted_at', p.submitted_at, 'reviewed_at', p.reviewed_at, 'created_at', p.created_at, 'updated_at', p.updated_at,
           'revision', case when rv.id is null then null
                            else jsonb_build_object('status', rv.status, 'reject_reason', rv.reject_reason, 'submitted_at', rv.submitted_at, 'reviewed_at', rv.reviewed_at) end
         ) order by p.updated_at desc, p.created_at desc), '[]'::jsonb)
    from public.myr_products p
    left join lateral public.myr_product_open_revision(p.id) rv on true
   where p.seller_id = p_seller
     and p.deleted_at is null
$$;
revoke all on function public.myr_app_seller_products(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_products(uuid) to service_role;

create or replace function public.myr_app_seller_product(p_seller uuid, p_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  p  public.myr_products%rowtype;
  rv public.myr_product_revisions%rowtype;
begin
  select * into p from public.myr_products where id = p_id and seller_id = p_seller and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  rv := public.myr_product_open_revision(p.id);
  return jsonb_build_object('ok', true, 'product', public.myr_seller_product_json(p),
    'revision', case when rv.id is null then null
                     else jsonb_build_object('id', rv.id, 'status', rv.status, 'reject_reason', rv.reject_reason, 'submitted_at', rv.submitted_at, 'fields', rv.fields) end);
end;
$$;
revoke all on function public.myr_app_seller_product(uuid, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_product(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- 버려진 상품 이미지(0073) — 열린 수정본(심사 중 · 가장 최근 반려)의 이미지도 쓰는 중
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
     and not exists (
       select 1
         from public.myr_product_revisions r, jsonb_array_elements_text(r.fields -> 'image_urls') u
        where r.status in ('pending', 'rejected')
          and (public.myr_product_open_revision(r.product_id)).id = r.id
          and right(u, length(o.name) + 1) = '/' || o.name)
   order by o.created_at
   limit greatest(coalesce(p_limit, 100), 1)
$$;
revoke all on function public.myr_product_image_orphans(interval, integer) from public, anon, authenticated;
grant execute on function public.myr_product_image_orphans(interval, integer) to service_role;
