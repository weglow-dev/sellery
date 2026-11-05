-- pgTAP — 0074 판매 중 상품 수정 심사: 권한 · 요청 대상 · 필수 칸 · 바뀐 게 없음 · 대기 1건 · 이미지(내 폴더 · 이미 붙은 것) · 샵은 승인 전까지 그대로 ·
--         반려(사유) → 다시 요청 · 승인 반영(상태 유지) · 판매 종료 때 접힘 · 목록/에디터 응답 · 버려진 이미지 (docs/myr.md §4.2.1 4-2)
begin;
select plan(64);

-- ---------- 권한 ----------
select function_privs_are('public', 'myr_app_seller_submit_revision', '{uuid,uuid,jsonb}'::text[], 'anon', '{}'::text[], 'anon 은 submit_revision 불가');
select function_privs_are('public', 'myr_app_seller_submit_revision', '{uuid,uuid,jsonb}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 submit_revision 불가');
select function_privs_are('public', 'myr_app_seller_submit_revision', '{uuid,uuid,jsonb}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 submit_revision 가능');
select function_privs_are('public', 'myr_app_admin_review_revision', '{uuid,text,text,uuid,jsonb}'::text[], 'anon', '{}'::text[], 'anon 은 review_revision 불가');
select function_privs_are('public', 'myr_app_admin_review_revision', '{uuid,text,text,uuid,jsonb}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 review_revision 불가');
select function_privs_are('public', 'myr_product_fields', '{uuid,jsonb,boolean,text[]}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 myr_product_fields 불가');
select function_privs_are('public', 'myr_product_apply_fields', '{uuid,jsonb}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 myr_product_apply_fields 불가');
select table_privs_are('public', 'myr_product_revisions', 'anon', '{}'::text[], 'anon 은 수정본 표 접근 불가');
select table_privs_are('public', 'myr_product_revisions', 'authenticated', '{}'::text[], 'authenticated 는 수정본 표 접근 불가');

-- ---------- 픽스처 ----------
insert into public.sellers (id, name, handle, platform, active)
values ('00000000-0000-4000-8000-000000000c91', '민지 루틴', '@pgtap.rev1', 'instagram', true),
       ('00000000-0000-4000-8000-000000000c92', '하루 웰', '@pgtap.rev2', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, note, tile, icon, image_urls, thumb_url, ingredient_rows, ingredients)
values ('00000000-0000-4000-8000-000000000d91', 'pgtap-rev-listed', '00000000-0000-4000-8000-000000000c91', 'diet', '포도 젤리', 32000, 10, 'listed', '식사 뒤 한 포', 'linear-gradient(145deg,#5b3cc4,#2a1a5e)', 'grape',
        '{}', null, '[{"name":"가르시니아","why":"","amount":""}]', '{가르시니아}'),
       ('00000000-0000-4000-8000-000000000d92', 'pgtap-rev-paused', '00000000-0000-4000-8000-000000000c91', 'inner', '콜라겐 필름', 28000, 10, 'paused', '물 없이', null, 'film', '{}', null, '[]', '{}'),
       ('00000000-0000-4000-8000-000000000d93', 'pgtap-rev-pending', '00000000-0000-4000-8000-000000000c91', 'diet', '심사 중', 30000, 0, 'pending', '노트', null, 'pill', '{}', null, '[]', '{}'),
       ('00000000-0000-4000-8000-000000000d94', 'pgtap-rev-other', '00000000-0000-4000-8000-000000000c92', 'diet', '남의 것', 30000, 10, 'listed', '노트', null, 'pill', '{}', null, '[]', '{}'),
       ('00000000-0000-4000-8000-000000000d95', 'pgtap-rev-ops-img', '00000000-0000-4000-8000-000000000c91', 'derma', '앰플', 34000, 10, 'listed', '노트', null, 'liquid',
        '{https://cdn.example/ops/ampoule.jpg}', 'https://cdn.example/ops/ampoule.jpg', '[]', '{}');

-- 수정 요청 본문(지금 내용 + 바꾼 것)
create temp table t_body as select
  '{"name":"포도 젤리 리뉴얼","price":33000,"category":"diet","note":"식사 뒤 한 포","tile":"linear-gradient(145deg,#5b3cc4,#2a1a5e)","icon":"grape",
    "image_urls":["https://x.supabase.co/storage/v1/object/public/myr-products/00000000-0000-4000-8000-000000000c91/aaaaaaaa-0001.jpg"],
    "ingredient_rows":[{"name":"가르시니아","why":"","amount":""},{"name":"녹차추출물","why":"","amount":""}],
    "howto_steps":[{"t":"식사 후 30분","d":"한 포"}]}'::jsonb as b;

-- ---------- 요청 대상 ----------
select is(public.myr_app_seller_submit_revision('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d94', (select b from t_body)) ->> 'code', 'NOT_FOUND', '남의 상품 NOT_FOUND');
select is(public.myr_app_seller_submit_revision('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d93', (select b from t_body)), '{"ok": false, "code": "NOT_REVISABLE", "status": "pending"}'::jsonb, '심사 중 상품은 수정 심사 불가');
select is(public.myr_app_seller_submit_revision('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d91', (select b || '{"note":"  "}' from t_body)) ->> 'field', 'note', '필수 칸 — 레시피 노트 없으면 INVALID_INPUT note');
select is(public.myr_app_seller_submit_revision('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d91', (select b || '{"price":0}' from t_body)) ->> 'field', 'price', '필수 칸 — 가격 0 이면 price');
select is(public.myr_app_seller_submit_revision('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d91',
  (select b || '{"image_urls":["https://x.supabase.co/storage/v1/object/public/myr-products/00000000-0000-4000-8000-000000000c92/aaaaaaaa-0002.jpg"]}' from t_body)) ->> 'code', 'BAD_IMAGE', '남의 폴더 이미지 BAD_IMAGE');
select is(public.myr_app_seller_submit_revision('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d91',
  (select public.myr_product_fields_json(p) || '{"note":"  식사 뒤 한 포 ","faq":[{"q":"빈 답","a":""}]}' from public.myr_products p where p.id = '00000000-0000-4000-8000-000000000d91')) ->> 'code', 'NO_CHANGE',
  '지금 내용과 같으면(공백 · 빈 줄 차이만) NO_CHANGE');
select is((select count(*) from public.myr_product_revisions where product_id = '00000000-0000-4000-8000-000000000d91'), 0::bigint, '거절된 요청은 수정본을 남기지 않는다');

-- ---------- 요청 성공 · 샵은 그대로 ----------
create temp table t_rev1 as select public.myr_app_seller_submit_revision('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d91', (select b from t_body)) as r;
select is((select r ->> 'status' from t_rev1), 'pending', '수정 심사 요청 → pending');
select is(public.myr_app_seller_submit_revision('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d91', (select b || '{"name":"또"}' from t_body)) ->> 'code', 'REVISION_PENDING', '심사 중 수정본이 있으면 REVISION_PENDING');
select is((select jsonb_build_object('name', name, 'price', price, 'status', status) from public.myr_products where id = '00000000-0000-4000-8000-000000000d91'),
  '{"name": "포도 젤리", "price": 32000, "status": "listed"}'::jsonb, '승인 전 — 상품 행은 그대로 · 판매 중 유지');
select is(public.myr_product_card('pgtap-rev-listed') ->> 'name', '포도 젤리', '승인 전 — 샵 상세는 지금 내용');
select is((select e -> 'revision' ->> 'status' from jsonb_array_elements(public.myr_app_seller_products('00000000-0000-4000-8000-000000000c91')) e where e ->> 'code' = 'pgtap-rev-listed'), 'pending', '내 제품 행 — revision.status = pending');
select is(public.myr_app_seller_product('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d91') #>> '{revision,fields,name}', '포도 젤리 리뉴얼', '에디터 1건 — 수정본 내용');
select is(public.myr_app_seller_product('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d91') #>> '{product,name}', '포도 젤리', '에디터 1건 — 상품은 지금 내용');

-- ---------- 운영 검수 — 거절 코드 ----------
select is(public.myr_app_admin_review_revision('00000000-0000-4000-8000-000000000d91', 'pause') ->> 'code', 'BAD_DECISION', '모르는 결정 BAD_DECISION');
select is(public.myr_app_admin_review_revision('00000000-0000-4000-8000-000000000d91', 'reject', '   ') ->> 'code', 'REASON_REQUIRED', '반려는 사유 필수');
select is(public.myr_app_admin_review_revision('00000000-0000-4000-8000-000000000d92', 'approve') ->> 'code', 'NOT_FOUND', '대기 중 수정본이 없으면 NOT_FOUND');

-- ---------- 반려 → 다시 요청 ----------
select is(public.myr_app_admin_review_revision('00000000-0000-4000-8000-000000000d91', 'reject', '  효능   표현 수정 ') ->> 'status', 'rejected', '수정 반려 → rejected');
select is((select jsonb_build_object('name', name, 'status', status, 'reject_reason', reject_reason) from public.myr_products where id = '00000000-0000-4000-8000-000000000d91'),
  '{"name": "포도 젤리", "status": "listed", "reject_reason": null}'::jsonb, '수정 반려 — 상품은 그대로 · 판매 중 · 상품 반려 사유 없음');
select is((select e -> 'revision' from jsonb_array_elements(public.myr_app_seller_products('00000000-0000-4000-8000-000000000c91')) e where e ->> 'code' = 'pgtap-rev-listed') - 'submitted_at' - 'reviewed_at',
  '{"status": "rejected", "reject_reason": "효능 표현 수정", "reject_items": []}'::jsonb, '내 제품 행 — 반려 수정본 · 사유(공백 정리) · 의견 없음');
create temp table t_rev2 as select public.myr_app_seller_submit_revision('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d91', (select b || '{"name":"포도 젤리 리뉴얼2"}' from t_body)) as r;
select is((select r ->> 'status' from t_rev2), 'pending', '반려 뒤 다시 요청 → pending');
select is((select e -> 'revision' ->> 'status' from jsonb_array_elements(public.myr_app_seller_products('00000000-0000-4000-8000-000000000c91')) e where e ->> 'code' = 'pgtap-rev-listed'), 'pending', '가장 최근 수정본 기준 — 다시 pending');

-- ---------- 승인 반영 ----------
select is(public.myr_app_admin_review_revision('00000000-0000-4000-8000-000000000d91', 'approve'), '{"ok": true, "code": "pgtap-rev-listed", "status": "approved"}'::jsonb, '수정 승인 → approved');
select is((select jsonb_build_object('name', name, 'price', price, 'status', status, 'thumb', thumb_url, 'ingredients', ingredients, 'howto', howto, 'stock', stock)
             from public.myr_products where id = '00000000-0000-4000-8000-000000000d91'),
  jsonb_build_object('name', '포도 젤리 리뉴얼2', 'price', 33000, 'status', 'listed', 'thumb', 'https://x.supabase.co/storage/v1/object/public/myr-products/00000000-0000-4000-8000-000000000c91/aaaaaaaa-0001.jpg',
                     'ingredients', array['가르시니아', '녹차추출물'], 'howto', '식사 후 30분', 'stock', 10),
  '승인 — 상세 반영(대표 이미지 · 성분 이름 · 한 줄 섭취법) · 판매 상태 · 재고 그대로');
select ok((select reviewed_at > now() - interval '1 minute' from public.myr_products where id = '00000000-0000-4000-8000-000000000d91'), '승인 — 상품 검수 시각 갱신');
select is(public.myr_product_card('pgtap-rev-listed') ->> 'name', '포도 젤리 리뉴얼2', '승인 뒤 — 샵 상세에 반영');
select is((select e -> 'revision' from jsonb_array_elements(public.myr_app_seller_products('00000000-0000-4000-8000-000000000c91')) e where e ->> 'code' = 'pgtap-rev-listed'), 'null'::jsonb, '반영된 수정본은 목록에 안 보인다');
select ok(public.myr_app_seller_product('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d91') -> 'revision' = 'null'::jsonb, '에디터 1건 — 열린 수정본 없음');
select is((select array_agg(status order by created_at) from public.myr_product_revisions where product_id = '00000000-0000-4000-8000-000000000d91'), array['rejected', 'approved'], '수정본 이력 — 반려 · 반영');

-- ---------- 일시중지 상품 · 이미 붙은(운영팀) 이미지 ----------
select is(public.myr_app_seller_submit_revision('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d92',
  '{"name":"콜라겐 필름","price":29000,"category":"inner","note":"물 없이","icon":"film"}') ->> 'status', 'pending', '일시중지 상품도 수정 심사');
select is(public.myr_app_admin_review_revision('00000000-0000-4000-8000-000000000d92', 'approve') ->> 'status', 'approved', '일시중지 상품 수정 승인');
select is((select jsonb_build_object('price', price, 'status', status) from public.myr_products where id = '00000000-0000-4000-8000-000000000d92'), '{"price": 29000, "status": "paused"}'::jsonb, '승인해도 일시중지는 그대로');
select is(public.myr_app_seller_submit_revision('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d95',
  '{"name":"앰플 리뉴얼","price":34000,"category":"derma","note":"노트","icon":"liquid","image_urls":["https://cdn.example/ops/ampoule.jpg"]}') ->> 'status', 'pending',
  '상품에 이미 붙은 이미지(다른 주소)는 그대로 둘 수 있다');

-- ---------- 판매 종료 · 상품 상태가 바뀐 뒤 승인 ----------
select is(public.myr_app_seller_set_status('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d95', 'end') ->> 'status', 'ended', '수정 심사 중에 판매 종료');
select is((select status from public.myr_product_revisions where product_id = '00000000-0000-4000-8000-000000000d95'), 'canceled', '판매 종료 — 대기 중 수정본은 canceled');
select is(public.myr_app_admin_review_revision('00000000-0000-4000-8000-000000000d95', 'approve') ->> 'code', 'NOT_FOUND', '접힌 수정본은 승인할 수 없다');
select is(public.myr_app_seller_submit_revision('00000000-0000-4000-8000-000000000c92', '00000000-0000-4000-8000-000000000d94', '{"name":"남의 것 고침","price":30000,"category":"diet","note":"노트"}') ->> 'status', 'pending', '(다른 크리에이터) 수정 심사 요청');
select is(public.myr_app_admin_review_product('00000000-0000-4000-8000-000000000d94', 'reject', '판매 중지 필요') ->> 'status', 'rejected', '운영팀이 상품 자체를 반려');
select is(public.myr_app_admin_review_revision('00000000-0000-4000-8000-000000000d94', 'approve'), '{"ok": false, "code": "WRONG_STATUS", "status": "rejected"}'::jsonb, '판매 중 · 일시중지가 아니면 수정 승인 WRONG_STATUS');

-- ---------- 버려진 이미지 — 열린 수정본의 사진은 쓰는 중 ----------
select is(public.myr_app_seller_submit_revision('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d91',
  (select b || '{"name":"사진 교체","image_urls":["https://x.supabase.co/storage/v1/object/public/myr-products/00000000-0000-4000-8000-000000000c91/bbbbbbbb-0003.jpg"]}' from t_body)) ->> 'status', 'pending', '사진 바꾼 수정 요청');
insert into storage.objects (bucket_id, name, created_at)
values ('myr-products', '00000000-0000-4000-8000-000000000c91/aaaaaaaa-0001.jpg', now() - interval '2 days'),
       ('myr-products', '00000000-0000-4000-8000-000000000c91/bbbbbbbb-0003.jpg', now() - interval '2 days'),
       ('myr-products', '00000000-0000-4000-8000-000000000c91/cccccccc-0004.jpg', now() - interval '2 days');
select is((select array_agg(o order by o) from public.myr_product_image_orphans() o where o like '00000000-0000-4000-8000-000000000c91/%'),
  array['00000000-0000-4000-8000-000000000c91/cccccccc-0004.jpg'], '고아 — 상품 사진 · 심사 중 수정본 사진 제외');
select is(public.myr_app_admin_review_revision('00000000-0000-4000-8000-000000000d91', 'approve') ->> 'status', 'approved', '사진 교체 승인');
select is((select array_agg(o order by o) from public.myr_product_image_orphans() o where o like '00000000-0000-4000-8000-000000000c91/%'),
  array['00000000-0000-4000-8000-000000000c91/aaaaaaaa-0001.jpg', '00000000-0000-4000-8000-000000000c91/cccccccc-0004.jpg'], '승인 뒤 — 바뀌기 전 사진이 고아가 된다');

-- ---------- 섹션별 반려 의견 ----------
select function_privs_are('public', 'myr_reject_items', '{jsonb}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 myr_reject_items 불가');
select is(public.myr_reject_items('[{"step":2,"msg":"  효능   표현 "},{"step":9,"msg":"전체"},{"step":4,"msg":"  "},{"step":"4","msg":"문자 단계"}]'),
  '[{"step": 2, "msg": "효능 표현"}, {"step": null, "msg": "전체"}, {"step": null, "msg": "문자 단계"}]'::jsonb, '의견 정리 — 공백 · 빈 의견 제외 · 1~7 밖 · 문자 단계는 전체(null)');
select is(public.myr_app_seller_submit_revision('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d91', (select b || '{"name":"의견 테스트"}' from t_body)) ->> 'status', 'pending', '(의견용) 수정 요청');
select is(public.myr_app_admin_review_revision('00000000-0000-4000-8000-000000000d91', 'reject', null, null, '[]') ->> 'code', 'REASON_REQUIRED', '사유도 의견도 없으면 REASON_REQUIRED');
select is(public.myr_app_admin_review_revision('00000000-0000-4000-8000-000000000d91', 'reject', null, null,
  '[{"step":2,"msg":"효능 표현을 바꿔주세요"},{"step":4,"msg":"함량을 mg 로"}]') ->> 'status', 'rejected', '사유 없이 섹션별 의견만으로 수정 반려');
select is((select jsonb_build_object('reason', e #>> '{revision,reject_reason}', 'items', e #> '{revision,reject_items}') from jsonb_array_elements(public.myr_app_seller_products('00000000-0000-4000-8000-000000000c91')) e where e ->> 'code' = 'pgtap-rev-listed'),
  '{"reason": "효능 표현을 바꿔주세요 / 함량을 mg 로", "items": [{"step": 2, "msg": "효능 표현을 바꿔주세요"}, {"step": 4, "msg": "함량을 mg 로"}]}'::jsonb, '목록 — 수정 반려 의견 · 사유는 의견을 이어 붙인 요약');
select is(public.myr_app_seller_product('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d91') #> '{revision,reject_items,1,step}', '4'::jsonb, '에디터 1건 — 수정본 의견');
-- 상품 반려 의견 → 다시 심사 요청하면 비움
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, note, icon)
values ('00000000-0000-4000-8000-000000000d96', 'pgtap-rev-new', '00000000-0000-4000-8000-000000000c91', 'diet', '새 상품', 30000, 0, 'pending', '노트', 'pill');
select is(public.myr_app_admin_review_product('00000000-0000-4000-8000-000000000d96', 'reject', '표시 문구 보완', null, '[{"step":2,"msg":"효능 표현"}]') ->> 'status', 'rejected', '상품 반려 — 사유 + 섹션별 의견');
select is((select jsonb_build_object('reason', reject_reason, 'items', reject_items) from public.myr_products where id = '00000000-0000-4000-8000-000000000d96'),
  '{"reason": "표시 문구 보완", "items": [{"step": 2, "msg": "효능 표현"}]}'::jsonb, '상품 반려 — 사유는 준 값 · 의견 저장');
select is(public.myr_app_seller_product('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d96') #> '{product,reject_items,0,step}', '2'::jsonb, '에디터 1건 — 상품 반려 의견');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-000000000c91', '00000000-0000-4000-8000-000000000d96', '{"name":"새 상품","price":30000,"category":"diet","note":"고친 노트"}', true) ->> 'status', 'pending', '반려 상품 다시 심사 요청');
select is((select reject_items from public.myr_products where id = '00000000-0000-4000-8000-000000000d96'), '[]'::jsonb, '다시 심사 요청하면 의견을 비운다');

select * from finish();
rollback;
