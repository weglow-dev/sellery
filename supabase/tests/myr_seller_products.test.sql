-- pgTAP — 0071 · 0072 내 제품 읽기: 권한 · 새 상태(draft · ended) · 내 상품만 · 삭제 제외 · 남은 재고 · 정렬 · 샵 공개 RPC 에 안 나옴 (docs/myr.md §4.2.1 3번)
begin;
select plan(19);

select function_privs_are('public', 'myr_app_seller_products', '{uuid}'::text[], 'anon', '{}'::text[], 'anon 은 seller_products 실행 불가');
select function_privs_are('public', 'myr_app_seller_products', '{uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 도 seller_products 실행 불가');
select function_privs_are('public', 'myr_app_seller_products', '{uuid}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 seller_products 실행 가능');

select function_privs_are('public', 'myr_app_seller_products_of_user', '{uuid}'::text[], 'anon', '{}'::text[], 'anon 은 seller_products_of_user 실행 불가');
select function_privs_are('public', 'myr_app_seller_products_of_user', '{uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 도 seller_products_of_user 실행 불가');

-- 픽스처: 크리에이터 2명 · 내 상품 5개(상태별 + 삭제 1) · 남의 상품 1개
insert into public.sellers (id, name, handle, platform, active)
values ('00000000-0000-4000-8000-000000000a81', '민지 루틴', '@pgtap.sp1', 'instagram', true),
       ('00000000-0000-4000-8000-000000000a82', '하루 웰', '@pgtap.sp2', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, options, stock, sold_qty, status, reject_reason, tile, icon, updated_at, deleted_at)
values ('00000000-0000-4000-8000-000000000b81', 'pgtap-sp-live',    '00000000-0000-4000-8000-000000000a81', 'diet',  '판매 중 상품', 32000, '[{"n":"1박스","price":32000},{"n":"2박스","price":60000}]', 100, 30, 'listed', null, 'linear-gradient(145deg,#a,#b)', 'grape', now() - interval '3 days', null),
       ('00000000-0000-4000-8000-000000000b82', 'pgtap-sp-draft',   '00000000-0000-4000-8000-000000000a81', 'inner', '임시저장 상품', 0, '[]', 0, 0, 'draft', null, null, 'pill', now() - interval '1 hour', null),
       ('00000000-0000-4000-8000-000000000b83', 'pgtap-sp-ended',   '00000000-0000-4000-8000-000000000a81', 'diet',  '종료 상품', 28000, '[]', 10, 12, 'ended', null, null, 'film', now() - interval '10 days', null),
       ('00000000-0000-4000-8000-000000000b84', 'pgtap-sp-rejected','00000000-0000-4000-8000-000000000a81', 'mental','반려 상품', 27000, '[]', 0, 0, 'rejected', '성분 표기 보완', null, 'gummy', now() - interval '2 days', null),
       ('00000000-0000-4000-8000-000000000b85', 'pgtap-sp-deleted', '00000000-0000-4000-8000-000000000a81', 'diet',  '삭제 상품', 10000, '[]', 5, 0, 'paused', null, null, 'pill', now(), now()),
       ('00000000-0000-4000-8000-000000000b86', 'pgtap-sp-other',   '00000000-0000-4000-8000-000000000a82', 'diet',  '남의 상품', 20000, '[]', 5, 0, 'listed', null, null, 'pill', now(), null);

-- 새 상태 · 잘못된 상태 — 정렬 검사에 영향이 없게 남의 상품 행으로(수정하면 updated_at 이 바뀐다)
select lives_ok($$update public.myr_products set status = 'draft' where id = '00000000-0000-4000-8000-000000000b86'$$, 'draft 상태 저장 가능');
select lives_ok($$update public.myr_products set status = 'ended' where id = '00000000-0000-4000-8000-000000000b86'$$, 'ended 상태 저장 가능');
select throws_ok($$update public.myr_products set status = 'sold_out' where id = '00000000-0000-4000-8000-000000000b86'$$, '23514', null, '목록 밖 상태는 거부');

-- 내 상품만 · 삭제 제외 · 최근 수정순
select is((select jsonb_agg(e ->> 'code') from jsonb_array_elements(public.myr_app_seller_products('00000000-0000-4000-8000-000000000a81')) e),
  '["pgtap-sp-draft", "pgtap-sp-rejected", "pgtap-sp-live", "pgtap-sp-ended"]'::jsonb, '내 상품만 · 삭제 제외 · 최근 수정순');
select is((select jsonb_agg(e ->> 'code') from jsonb_array_elements(public.myr_app_seller_products('00000000-0000-4000-8000-000000000a82')) e),
  '["pgtap-sp-other"]'::jsonb, '다른 크리에이터는 자기 상품만');
select is(public.myr_app_seller_products('00000000-0000-4000-8000-0000000000ff'), '[]'::jsonb, '상품 없는(모르는) 크리에이터는 빈 배열');

-- 행 모양 — 남은 재고 · 옵션 수 · 반려 사유
select is((select e - 'id' - 'submitted_at' - 'reviewed_at' - 'created_at' - 'updated_at' from jsonb_array_elements(public.myr_app_seller_products('00000000-0000-4000-8000-000000000a81')) e where e ->> 'code' = 'pgtap-sp-live'),
  '{"code": "pgtap-sp-live", "icon": "grape", "name": "판매 중 상품", "tile": "linear-gradient(145deg,#a,#b)", "price": 32000, "stock": 100, "status": "listed", "category": "diet", "sold_qty": 30, "thumb_url": null, "stock_left": 70, "option_count": 2, "reject_reason": null, "revision": null}'::jsonb,
  '판매 중 행 — 남은 재고 = 입고 − 판매 · 옵션 수 · 수정본 없음(0074)');
select is((select (e ->> 'stock_left')::int from jsonb_array_elements(public.myr_app_seller_products('00000000-0000-4000-8000-000000000a81')) e where e ->> 'code' = 'pgtap-sp-ended'), 0, '판매가 입고보다 많아도 남은 재고는 0');
select is((select e ->> 'reject_reason' from jsonb_array_elements(public.myr_app_seller_products('00000000-0000-4000-8000-000000000a81')) e where e ->> 'code' = 'pgtap-sp-rejected'), '성분 표기 보완', '반려 사유');
select ok(not exists (select 1 from jsonb_array_elements(public.myr_app_seller_products('00000000-0000-4000-8000-000000000a81')) e where e ? 'seller_margin_rate' or e ? 'reviewed_by'), '마진율 · 검수자는 싣지 않는다');

-- 샵 공개 RPC 는 draft · ended 를 보여주지 않는다(listed 만)
select ok(not exists (select 1 from jsonb_array_elements(public.myr_home_products()) e where e ->> 'code' in ('pgtap-sp-draft', 'pgtap-sp-ended', 'pgtap-sp-rejected')), '샵 홈에 임시저장 · 종료 · 반려 없음');

-- 0072 계정으로 조회 — 연결된 크리에이터의 0071 결과와 같다 · 연결 없으면 빈 배열
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000c81', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-sp1@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-000000000c82', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-sp-none@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
update public.sellers set user_id = '00000000-0000-4000-8000-000000000c81' where id = '00000000-0000-4000-8000-000000000a81';
select is(public.myr_app_seller_products_of_user('00000000-0000-4000-8000-000000000c81'), public.myr_app_seller_products('00000000-0000-4000-8000-000000000a81'), '계정으로 조회 = 연결된 크리에이터 조회(행 모양 · 순서 같음)');
select is(jsonb_array_length(public.myr_app_seller_products_of_user('00000000-0000-4000-8000-000000000c81')), 4, '내 상품 4개(삭제 제외)');
select is(public.myr_app_seller_products_of_user('00000000-0000-4000-8000-000000000c82'), '[]'::jsonb, '크리에이터가 아닌 계정은 빈 배열');

select * from finish();
rollback;
