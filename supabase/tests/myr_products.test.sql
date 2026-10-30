-- pgTAP — 0056 myr_products: 권한 · 공개 RPC · 검수 RPC (docs/myr.md §3 · §3.1 규칙 2)
-- 실행: npm run test:db  (= npx supabase test db — 로컬 Supabase · 트랜잭션 안에서 돌고 롤백된다. 운영 DB 는 건드리지 않는다)
begin;
select plan(34);

-- ---------- 표 · 권한 ----------
select has_table('public', 'myr_products', 'myr_products 표가 있다');
select ok((select relrowsecurity from pg_class where oid = 'public.myr_products'::regclass), 'myr_products RLS on');
select table_privs_are('public', 'myr_products', 'anon', '{}'::text[], 'anon 은 myr_products 직접 권한 없음');
select table_privs_are('public', 'myr_products', 'authenticated', '{}'::text[], 'authenticated 도 직접 권한 없음');
select function_privs_are('public', 'myr_home_products', '{}'::text[], 'anon', '{EXECUTE}'::text[], 'anon 이 myr_home_products 실행 가능');
select function_privs_are('public', 'myr_product_card', '{text}'::text[], 'anon', '{EXECUTE}'::text[], 'anon 이 myr_product_card 실행 가능');
select function_privs_are('public', 'myr_app_admin_review_product', '{uuid,text,text,uuid}'::text[], 'anon', '{}'::text[], 'anon 은 검수 RPC 실행 불가');
select function_privs_are('public', 'myr_app_admin_review_product', '{uuid,text,text,uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 도 검수 RPC 실행 불가');

-- ---------- 픽스처 (롤백됨) ----------
insert into public.sellers (id, name, handle, platform, active)
values ('00000000-0000-4000-8000-000000000a01', '테스트 셀러', '@pgtap.seller', 'instagram', true),
       ('00000000-0000-4000-8000-000000000a02', '비활성 셀러', '@pgtap.inactive', 'instagram', false);

insert into public.myr_products (id, code, seller_id, category, name, price, stock, sold_qty, status, icon, ingredients, howto)
values ('00000000-0000-4000-8000-000000000b01', 'pgtap-listed',   '00000000-0000-4000-8000-000000000a01', 'diet',  '상품 A', 10000, 5, 0, 'listed',  'jelly', '{성분1,성분2}', '하루 1포'),
       ('00000000-0000-4000-8000-000000000b02', 'pgtap-same-cat', '00000000-0000-4000-8000-000000000a01', 'diet',  '상품 B', 20000, 5, 5, 'listed',  'pill',  '{}', ''),
       ('00000000-0000-4000-8000-000000000b03', 'pgtap-pending',  '00000000-0000-4000-8000-000000000a01', 'diet',  '상품 C', 30000, 5, 0, 'pending', 'pill',  '{}', ''),
       ('00000000-0000-4000-8000-000000000b04', 'pgtap-paused',   '00000000-0000-4000-8000-000000000a01', 'inner', '상품 D', 40000, 5, 0, 'paused',  'pill',  '{}', ''),
       ('00000000-0000-4000-8000-000000000b05', 'pgtap-inactive', '00000000-0000-4000-8000-000000000a02', 'diet',  '상품 E', 50000, 5, 0, 'listed',  'pill',  '{}', ''),
       ('00000000-0000-4000-8000-000000000b06', 'pgtap-deleted',  '00000000-0000-4000-8000-000000000a01', 'diet',  '상품 F', 60000, 5, 0, 'listed',  'pill',  '{}', '');
update public.myr_products set deleted_at = now() where code = 'pgtap-deleted';

-- ---------- myr_home_products ----------
select is(
  (select count(*) from jsonb_array_elements(public.myr_home_products()) e where e->>'code' like 'pgtap-%'),
  2::bigint,
  '홈 목록 = listed · 미삭제 · 셀러 active 만 (A · B)'
);
select ok(not exists (select 1 from jsonb_array_elements(public.myr_home_products()) e where e->>'code' in ('pgtap-pending','pgtap-paused','pgtap-inactive','pgtap-deleted')), 'pending · paused · 비활성 셀러 · 삭제는 홈에 없음');
select is((select e->'creator'->>'handle' from jsonb_array_elements(public.myr_home_products()) e where e->>'code' = 'pgtap-listed'), '@pgtap.seller', '크리에이터 핸들이 실린다');
select ok((select e ? 'stock' from jsonb_array_elements(public.myr_home_products()) e where e->>'code' = 'pgtap-listed') = false, '재고 수치는 응답에 없다');
select ok((select e ? 'seller_margin_rate' from jsonb_array_elements(public.myr_home_products()) e where e->>'code' = 'pgtap-listed') = false, '마진율은 응답에 없다');
select ok((select e ? 'sub' from jsonb_array_elements(public.myr_home_products()) e where e->>'code' = 'pgtap-listed') = false, '한 줄 소개(sub)는 0059 에서 삭제 — 응답에 없다');
select hasnt_column('public', 'myr_products', 'sub', 'myr_products.sub 컬럼 없음(0059)');
select ok((select e ? 'points' from jsonb_array_elements(public.myr_home_products()) e where e->>'code' = 'pgtap-listed') = false, '숫자 포인트(points)도 0059 에서 삭제 — 응답에 없다');
select hasnt_column('public', 'myr_products', 'points', 'myr_products.points 컬럼 없음(0059)');
select ok((select e ? 'howto_title' from jsonb_array_elements(public.myr_home_products()) e where e->>'code' = 'pgtap-listed') = false, '섭취법 제목(howto_title)도 0059 에서 삭제 — 응답에 없다');
select hasnt_column('public', 'myr_products', 'howto_title', 'myr_products.howto_title 컬럼 없음(0059)');
select is((select (e->>'sold_out')::boolean from jsonb_array_elements(public.myr_home_products()) e where e->>'code' = 'pgtap-same-cat'), true, 'stock − sold_qty ≤ 0 이면 sold_out');

-- ---------- myr_product_card ----------
select is(public.myr_product_card('pgtap-pending'), null, 'pending 은 카드 null(404)');
select is(public.myr_product_card('pgtap-paused'), null, 'paused 도 카드 null');
select is(public.myr_product_card('pgtap-inactive'), null, '비활성 셀러 상품은 카드 null');
select is(public.myr_product_card('pgtap-deleted'), null, '삭제 상품은 카드 null');
select is(public.myr_product_card(' PGTAP-LISTED ')->>'code', 'pgtap-listed', '코드는 trim + 소문자로 찾는다');
-- 로컬 DB 에 시드 상품(diet)이 있으면 related 에 같이 실리므로 픽스처(pgtap-*)만 본다
select is(
  (select coalesce(jsonb_agg(r->>'code' order by r->>'code'), '[]'::jsonb) from jsonb_array_elements(public.myr_product_card('pgtap-listed')->'related') r where r->>'code' like 'pgtap-%'),
  '["pgtap-same-cat"]'::jsonb,
  'related = 같은 카테고리/크리에이터의 listed 만 · 자기 제외 · pending/paused/삭제/비활성 제외'
);

-- ---------- myr_app_admin_review_product ----------
select is(public.myr_app_admin_review_product('00000000-0000-4000-8000-000000000b03', 'reject', null) ->> 'code', 'REASON_REQUIRED', 'reject 는 사유 필수');
select is(public.myr_app_admin_review_product('00000000-0000-4000-8000-000000000b03', 'pause', null) ->> 'code', 'WRONG_STATUS', 'pause 는 listed 에서만');
select is(public.myr_app_admin_review_product('00000000-0000-4000-8000-000000000b03', 'bogus', null) ->> 'code', 'BAD_DECISION', '모르는 decision 은 거부');
select is(public.myr_app_admin_review_product('00000000-0000-4000-8000-000000000b03', 'reject', '문구 수정 필요') ->> 'status', 'rejected', 'reject + 사유 → rejected');
select is((select reject_reason from public.myr_products where code = 'pgtap-pending'), '문구 수정 필요', '사유가 저장된다');
select is(public.myr_app_admin_review_product('00000000-0000-4000-8000-000000000b03', 'approve', null) ->> 'status', 'listed', 'rejected → approve → listed');
select is((select reject_reason from public.myr_products where code = 'pgtap-pending'), null, 'approve 가 사유를 지운다');
select is(public.myr_app_admin_review_product('00000000-0000-4000-8000-000000000b06', 'approve', null) ->> 'code', 'NOT_FOUND', '삭제된 상품은 NOT_FOUND');

select * from finish();
rollback;
