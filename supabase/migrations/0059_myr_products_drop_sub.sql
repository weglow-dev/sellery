-- ============================================================
-- 0059 MYR 상품 — 한 줄 소개(sub) · 숫자 포인트 3칸(points) · 섭취법 제목(howto_title) · 제품 정보 카드 3개(specs) 삭제
--   (대표 결정 2026-10-30: 인플루언서 상품 등록에도 이 칸들을 두지 않는다 — specs 는 섭취법·구성(unit)과 겹쳤다. 제품 정보 표(infoRowsOf)는 남는다)
--
-- 공개 RPC 응답(myr_product_public_json)에서 'sub' · 'points' · 'howto_title' · 'specs' 를 빼고 컬럼을 지운다. 네 컬럼은 myr-shop 만 읽었고, 샵의 행 매핑(lib/product-row.ts)은
-- 없는 키를 무시하므로 옛 배포가 잠깐 남아 있어도 깨지지 않는다 — 한 단계로 끝낸다(docs/myr.md §3.1 "같이 배포되지 않는 창").
-- 실행: 0058 이후. 재실행 가능.
-- ============================================================

create or replace function public.myr_product_public_json(p public.myr_products, s public.sellers)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', p.id, 'code', p.code, 'category', p.category, 'name', p.name, 'unit', p.unit, 'price', p.price,
    'tile', p.tile, 'thumb_url', p.thumb_url, 'icon', p.icon, 'form', p.form, 'pack', p.pack, 'flavor', p.flavor, 'tag', p.tag,
    'chips', to_jsonb(p.chips), 'ingredients', to_jsonb(p.ingredients), 'note', p.note, 'howto', p.howto,
    'story_title', p.story_title, 'story', p.story, 'ingredient_rows', p.ingredient_rows,
    'howto_steps', p.howto_steps, 'faq', p.faq,
    'sold_out', (p.stock - p.sold_qty) <= 0,
    'creator', jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'avatar_url', s.avatar_url),
    'created_at', p.created_at
  )
$$;
revoke all on function public.myr_product_public_json(public.myr_products, public.sellers) from public, anon, authenticated;

alter table public.myr_products drop column if exists sub;
alter table public.myr_products drop column if exists points;
alter table public.myr_products drop column if exists howto_title;
alter table public.myr_products drop column if exists specs;
