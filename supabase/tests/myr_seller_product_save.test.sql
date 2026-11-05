-- pgTAP — 0073 상품 등록 저장: 권한 · 임시저장 · 심사 요청 · 반려 재제출 · 수정 가능 상태 · 입력 검사 · 이미지 폴더 · 상태 바꾸기 · 에디터 1건 · 샵 응답 (docs/myr.md §4.2.1 4-1)
begin;
select plan(52);

-- ---------- 권한 ----------
select function_privs_are('public', 'myr_app_seller_save_product', '{uuid,uuid,jsonb,boolean}'::text[], 'anon', '{}'::text[], 'anon 은 save_product 불가');
select function_privs_are('public', 'myr_app_seller_save_product', '{uuid,uuid,jsonb,boolean}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 save_product 불가');
select function_privs_are('public', 'myr_app_seller_save_product', '{uuid,uuid,jsonb,boolean}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 save_product 가능');
select function_privs_are('public', 'myr_app_seller_set_status', '{uuid,uuid,text}'::text[], 'anon', '{}'::text[], 'anon 은 set_status 불가');
select function_privs_are('public', 'myr_app_seller_set_status', '{uuid,uuid,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 set_status 불가');
select function_privs_are('public', 'myr_app_seller_product', '{uuid,uuid}'::text[], 'anon', '{}'::text[], 'anon 은 seller_product 불가');
select function_privs_are('public', 'myr_app_seller_product', '{uuid,uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 seller_product 불가');
select ok((select public from storage.buckets where id = 'myr-products'), '버킷 myr-products 는 공개 읽기');
select is((select file_size_limit from storage.buckets where id = 'myr-products'), 4194304::bigint, '버킷 한도 4MB');

-- ---------- 픽스처 ----------
insert into public.sellers (id, name, handle, platform, active)
values ('00000000-0000-4000-8000-000000000a91', '민지 루틴', '@pgtap.save1', 'instagram', true),
       ('00000000-0000-4000-8000-000000000a92', '하루 웰', '@pgtap.save2', 'instagram', true),
       ('00000000-0000-4000-8000-000000000a93', '정지됨', '@pgtap.save3', 'instagram', false);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, reject_reason, tile, icon)
values ('00000000-0000-4000-8000-000000000b91', 'pgtap-save-listed', '00000000-0000-4000-8000-000000000a91', 'diet', '판매 중', 32000, 10, 'listed', null, null, 'pill'),
       ('00000000-0000-4000-8000-000000000b92', 'pgtap-save-rejected', '00000000-0000-4000-8000-000000000a91', 'diet', '반려됨', 32000, 0, 'rejected', '성분 표기 보완', null, 'pill'),
       ('00000000-0000-4000-8000-000000000b93', 'pgtap-save-pending', '00000000-0000-4000-8000-000000000a91', 'diet', '심사 중', 32000, 0, 'pending', null, null, 'pill'),
       ('00000000-0000-4000-8000-000000000b94', 'pgtap-save-other', '00000000-0000-4000-8000-000000000a92', 'diet', '남의 것', 32000, 0, 'draft', null, null, 'pill');

-- ---------- 임시저장(새 상품) ----------
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', null, '{"name":"  "}', false) ->> 'field', 'name', '제품명 없으면 임시저장도 INVALID_INPUT name');
create temp table t_new as select public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', null,
  '{"name":" 민지 굿나잇 구미 ","price":0,"chips":["구미","","수면","x","넘침"],"tile":"linear-gradient(145deg,#a05ac8,#3f1f57)","icon":"gummy"}', false) as r;
select is((select r ->> 'status' from t_new), 'draft', '새 상품 임시저장 → draft');
select ok((select (r ->> 'ok')::boolean and r ->> 'code' ~ '^m[0-9]+$' from t_new), '코드 자동(m + 번호)');
select is((select jsonb_build_object('name', name, 'category', category, 'price', price, 'chips', chips, 'tile', tile, 'icon', icon) from public.myr_products where id = (select (r ->> 'id')::uuid from t_new)),
  jsonb_build_object('name', '민지 굿나잇 구미', 'category', null, 'price', 0, 'chips', array['구미','수면'], 'tile', 'linear-gradient(145deg,#a05ac8,#3f1f57)', 'icon', 'gummy'),
  '임시저장 — 공백 정리 · 카테고리 없이 저장 · 태그 3개까지 빈 값 제외');
select ok(not exists (select 1 from jsonb_array_elements(public.myr_home_products()) e where e ->> 'id' = (select r ->> 'id' from t_new)), '임시저장은 샵에 안 나온다');

-- ---------- 심사 요청 — 필수 칸 ----------
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', (select (r ->> 'id')::uuid from t_new), '{"name":"구미","price":0,"category":"mental","note":"노트"}', true) ->> 'field', 'price', '심사 요청 — 가격 0 이면 price');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', (select (r ->> 'id')::uuid from t_new), '{"name":"구미","price":27000,"note":"노트"}', true) ->> 'field', 'category', '심사 요청 — 카테고리 없으면 category');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', (select (r ->> 'id')::uuid from t_new), '{"name":"구미","price":27000,"category":"mental","note":"  "}', true) ->> 'field', 'note', '심사 요청 — 레시피 노트 없으면 note');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', null, '{"name":"구미","category":"sleep"}', false) ->> 'field', 'category', '목록 밖 카테고리 INVALID_INPUT category');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', null, '{"name":"구미","price":-1}', false) ->> 'field', 'price', '음수 가격 INVALID_INPUT price');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', null, '{"name":"구미","image_urls":["a","b","c","d","e","f","g"]}', false) ->> 'field', 'images', '이미지 7장 INVALID_INPUT images');

-- ---------- 이미지 폴더 ----------
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', null,
  '{"name":"구미","image_urls":["https://x.supabase.co/storage/v1/object/public/myr-products/00000000-0000-4000-8000-000000000a92/abcdef12-3456.jpg"]}', false) ->> 'code', 'BAD_IMAGE', '남의 폴더 이미지 BAD_IMAGE');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', null, '{"name":"구미","image_urls":["https://evil.example/a.jpg"]}', false) ->> 'code', 'BAD_IMAGE', '버킷 밖 주소 BAD_IMAGE');

-- ---------- 심사 요청 성공 ----------
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', (select (r ->> 'id')::uuid from t_new),
  '{"name":"민지 굿나잇 구미","price":27000,"category":"mental","note":"자기 전 한 알","unit":"30구미 / 1개월","form":"구미","pack":"파우치","shelf_life":"제조일로부터 18개월","storage_method":"서늘한 곳",
    "image_urls":["http://127.0.0.1:54321/storage/v1/object/public/myr-products/00000000-0000-4000-8000-000000000a91/0f8a1c2e-1111.webp","https://x.supabase.co/storage/v1/object/public/myr-products/00000000-0000-4000-8000-000000000a91/0f8a1c2e-2222.jpg"],
    "ingredient_rows":[{"name":"테아닌","why":"긴장 완화","amount":"200mg"},{"name":"","why":"빈 줄","amount":""}],
    "howto_steps":[{"t":"자기 전","d":"30분 전에 한 알"},{"t":"","d":"빈 줄"}],
    "faq":[{"q":"매일 먹어도 되나요?","a":"네"},{"q":"답 없음","a":""}]}', true) ->> 'status', 'pending', '심사 요청 → pending');
select is((select jsonb_build_object('thumb', thumb_url, 'n_img', cardinality(image_urls), 'ingredients', ingredients, 'howto', howto, 'n_steps', jsonb_array_length(howto_steps), 'n_faq', jsonb_array_length(faq), 'shelf', shelf_life, 'storage', storage_method, 'form', form, 'pack', pack, 'unit', unit)
             from public.myr_products where id = (select (r ->> 'id')::uuid from t_new)),
  jsonb_build_object('thumb', 'http://127.0.0.1:54321/storage/v1/object/public/myr-products/00000000-0000-4000-8000-000000000a91/0f8a1c2e-1111.webp', 'n_img', 2, 'ingredients', array['테아닌'], 'howto', '자기 전', 'n_steps', 1, 'n_faq', 1,
                     'shelf', '제조일로부터 18개월', 'storage', '서늘한 곳', 'form', '구미', 'pack', '파우치', 'unit', '30구미 / 1개월'),
  '저장 내용 — 대표 이미지 = 첫 장 · 빈 성분/섭취/FAQ 줄 제외 · 성분 이름 목록 · 한 줄 섭취법 · 유통기한 · 보관');

-- ---------- 수정 가능한 상태 ----------
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', (select (r ->> 'id')::uuid from t_new), '{"name":"다시"}', false) ->> 'code', 'NOT_EDITABLE', '심사 중(pending)은 수정 불가');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', '00000000-0000-4000-8000-000000000b91', '{"name":"다시"}', false), '{"ok": false, "code": "NOT_EDITABLE", "status": "listed"}'::jsonb, '판매 중은 4-2 수정 심사 전까지 NOT_EDITABLE');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', '00000000-0000-4000-8000-000000000b94', '{"name":"훔치기"}', false) ->> 'code', 'NOT_FOUND', '남의 상품 NOT_FOUND');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a93', null, '{"name":"정지"}', false) ->> 'code', 'NOT_FOUND', '정지된 크리에이터는 새 상품 불가');

-- ---------- 반려 → 임시저장(반려 유지) → 재제출 ----------
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', '00000000-0000-4000-8000-000000000b92', '{"name":"반려됨 고침","price":32000,"category":"diet","note":"노트"}', false) ->> 'status', 'rejected', '반려 상품 임시저장 — 상태 rejected 그대로');
select is((select reject_reason from public.myr_products where id = '00000000-0000-4000-8000-000000000b92'), '성분 표기 보완', '임시저장해도 반려 사유 유지');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', '00000000-0000-4000-8000-000000000b92', '{"name":"반려됨 고침","price":32000,"category":"diet","note":"노트"}', true) ->> 'status', 'pending', '반려 재제출 → pending');
select ok((select reject_reason is null and reviewed_at is null and submitted_at > now() - interval '1 minute' from public.myr_products where id = '00000000-0000-4000-8000-000000000b92'), '재제출 — 반려 사유 · 검수 시각 비움 · 제출 시각 갱신');

-- ---------- 에디터 1건 ----------
select is(public.myr_app_seller_product('00000000-0000-4000-8000-000000000a91', '00000000-0000-4000-8000-000000000b94') ->> 'code', 'NOT_FOUND', '남의 상품은 열 수 없다');
select is(public.myr_app_seller_product('00000000-0000-4000-8000-000000000a91', (select (r ->> 'id')::uuid from t_new)) #>> '{product,shelf_life}', '제조일로부터 18개월', '에디터 1건 — 입력값 그대로');
select ok(not (public.myr_app_seller_product('00000000-0000-4000-8000-000000000a91', (select (r ->> 'id')::uuid from t_new)) -> 'product' ? 'seller_margin_rate'), '에디터 1건에 마진율 없음');

-- ---------- 상태 바꾸기 ----------
select is(public.myr_app_seller_set_status('00000000-0000-4000-8000-000000000a91', '00000000-0000-4000-8000-000000000b91', 'fly') ->> 'code', 'BAD_ACTION', '모르는 동작 BAD_ACTION');
select is(public.myr_app_seller_set_status('00000000-0000-4000-8000-000000000a91', '00000000-0000-4000-8000-000000000b94', 'delete') ->> 'code', 'NOT_FOUND', '남의 상품 NOT_FOUND');
select is(public.myr_app_seller_set_status('00000000-0000-4000-8000-000000000a91', '00000000-0000-4000-8000-000000000b91', 'resume'), '{"ok": false, "code": "WRONG_STATUS", "status": "listed"}'::jsonb, '판매 중을 다시 판매 WRONG_STATUS');
select is(public.myr_app_seller_set_status('00000000-0000-4000-8000-000000000a91', '00000000-0000-4000-8000-000000000b91', 'pause') ->> 'status', 'paused', '판매 중 → 일시중지');
select ok(not exists (select 1 from jsonb_array_elements(public.myr_home_products()) e where e ->> 'code' = 'pgtap-save-listed'), '일시중지는 샵에서 내려감');
select is(public.myr_app_seller_set_status('00000000-0000-4000-8000-000000000a91', '00000000-0000-4000-8000-000000000b91', 'resume') ->> 'status', 'listed', '일시중지 → 다시 판매');
select is(public.myr_app_seller_set_status('00000000-0000-4000-8000-000000000a91', '00000000-0000-4000-8000-000000000b91', 'end') ->> 'status', 'ended', '판매 중 → 판매 종료');
select is(public.myr_app_seller_set_status('00000000-0000-4000-8000-000000000a91', '00000000-0000-4000-8000-000000000b91', 'resume') ->> 'code', 'WRONG_STATUS', '판매 종료는 되돌릴 수 없다');
select is(public.myr_app_seller_set_status('00000000-0000-4000-8000-000000000a91', '00000000-0000-4000-8000-000000000b93', 'delete') ->> 'code', 'WRONG_STATUS', '심사 중은 삭제 불가(임시저장만)');
create temp table t_draft as select public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000a91', null, '{"name":"지울 초안"}', false) as r;
select is(public.myr_app_seller_set_status('00000000-0000-4000-8000-000000000a91', (select (r ->> 'id')::uuid from t_draft), 'delete') ->> 'status', 'deleted', '임시저장 삭제');
select ok((select deleted_at is not null from public.myr_products where id = (select (r ->> 'id')::uuid from t_draft)), '삭제는 deleted_at(소프트)');

-- ---------- 제약 · 샵 응답 ----------
select throws_ok($$insert into public.myr_products (seller_id, name, price, status) values ('00000000-0000-4000-8000-000000000a91', '카테고리 없음', 1000, 'pending')$$, '23514', null, '임시저장이 아니면 카테고리 필수(제약)');
select ok((select public.myr_product_public_json(p, s) ?& array['shelf_life', 'storage_method', 'image_urls'] from public.myr_products p join public.sellers s on s.id = p.seller_id where p.code = 'pgtap-save-pending'), '샵 응답에 유통기한 · 보관 · 이미지 목록');

-- ---------- 버려진 이미지 ----------
select function_privs_are('public', 'myr_product_image_orphans', '{interval,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 orphans 불가');
insert into storage.objects (bucket_id, name, created_at)
values ('myr-products', '00000000-0000-4000-8000-000000000a91/0f8a1c2e-1111.webp', now() - interval '2 days'),
       ('myr-products', '00000000-0000-4000-8000-000000000a91/00000000-dead-beef.jpg', now() - interval '2 days'),
       ('myr-products', '00000000-0000-4000-8000-000000000a91/11111111-fresh.jpg', now() - interval '1 minute');
select is((select array_agg(o) from public.myr_product_image_orphans() o where o like '00000000-0000-4000-8000-000000000a91/%'),
  array['00000000-0000-4000-8000-000000000a91/00000000-dead-beef.jpg'], '고아 = 어느 상품에도 없고 24시간 지난 것만(저장된 사진 · 방금 올린 사진 제외)');
select is((select count(*) from public.myr_product_image_orphans(interval '0', 100) o where o like '00000000-0000-4000-8000-000000000a91/%'), 2::bigint, 'age 0 이면 방금 올린 미참조 사진도');
update public.myr_products set deleted_at = now() where id = (select (r ->> 'id')::uuid from t_new);
select ok(not exists (select 1 from public.myr_product_image_orphans() o where o = '00000000-0000-4000-8000-000000000a91/0f8a1c2e-1111.webp'), '삭제된 상품의 사진도 지우지 않는다(주문 · 기록이 참조할 수 있다)');

select * from finish();
rollback;
