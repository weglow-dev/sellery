-- ============================================================
-- 0094 — MYR 상품 판매가가 아주 크면 저장이 DB 오류로 끝나던 것 고침(2026-11-11)
--   myr_product_fields(0074) 가 판매가를 정수로 먼저 바꾼 뒤 범위(0 ~ 1,000만 원)를 봐서, 약 21억(2,147,483,647)을 넘으면
--   "integer out of range" 오류 → 콘솔에 "저장하지 못했어요. 잠시 후 다시 시도해주세요"만 떴다.
--   범위를 숫자 그대로 먼저 보고, 넘으면 다른 초과 값과 같은 INVALID_INPUT · field price(콘솔 "판매가는 1,000만 원까지 입력할 수 있어요")로 거절한다.
--   myr_app_seller_save_product · myr_app_seller_submit_revision 이 이 함수를 같이 쓴다(둘 다 고쳐진다). 나머지 검사 · 결과는 0074 그대로.
--   권한: 그대로. 테스트: supabase/tests/myr_product_price.test.sql.
-- ============================================================

-- 0074 정의 + 판매가 범위를 정수 변환 전에
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
  v_price_n  numeric;
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
  -- 범위를 숫자(numeric) 그대로 먼저 본다 — 정수로 먼저 바꾸면 약 21억을 넘는 값에서 integer out of range 오류가 나 "저장하지 못했어요"로 끝났다(0094)
  v_price_n := case when jsonb_typeof(j -> 'price') = 'number' then (j ->> 'price')::numeric else 0 end;
  if v_price_n < 0 or v_price_n > 10000000 then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'price'); end if;
  v_price := v_price_n::integer;
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
