-- pgTAP — 0057 장바구니 · 찜: 권한 · 담기/수량/삭제 · 합치기 · 비우기 · 찜 (docs/myr.md §6.2 · docs/testing.md §2)
-- 실행: npm run test:db — 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(52);

-- ---------- 표 · 권한 ----------
select has_table('public', 'myr_cart_items', 'myr_cart_items 표');
select has_table('public', 'myr_likes', 'myr_likes 표');
select ok((select relrowsecurity from pg_class where oid = 'public.myr_cart_items'::regclass), 'myr_cart_items RLS on');
select ok((select relrowsecurity from pg_class where oid = 'public.myr_likes'::regclass), 'myr_likes RLS on');
select table_privs_are('public', 'myr_cart_items', 'anon', '{}'::text[], 'anon 은 장바구니 표 직접 권한 없음');
select table_privs_are('public', 'myr_cart_items', 'authenticated', '{}'::text[], 'authenticated 도 장바구니 표 직접 권한 없음');
select table_privs_are('public', 'myr_likes', 'authenticated', '{}'::text[], 'authenticated 는 찜 표 직접 권한 없음');
select function_privs_are('public', 'myr_cart_get', '{uuid}'::text[], 'anon', '{}'::text[], 'anon 은 myr_cart_get 실행 불가');
select function_privs_are('public', 'myr_cart_set', '{uuid,text,integer,integer,boolean}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 myr_cart_set 실행 불가');
select function_privs_are('public', 'myr_cart_merge', '{uuid,jsonb}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 myr_cart_merge 실행 불가');
select function_privs_are('public', 'myr_cart_clear', '{uuid}'::text[], 'anon', '{}'::text[], 'anon 은 myr_cart_clear 실행 불가');
select function_privs_are('public', 'myr_like_set', '{uuid,text,boolean}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 myr_like_set 실행 불가');
select function_privs_are('public', 'myr_likes_get', '{uuid}'::text[], 'anon', '{}'::text[], 'anon 은 myr_likes_get 실행 불가');
select function_privs_are('public', 'myr_cart_set', '{uuid,text,integer,integer,boolean}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 myr_cart_set 실행 가능');

-- ---------- 픽스처 (롤백됨) ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-cart@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-cart2@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

insert into public.sellers (id, name, handle, platform, active)
values ('00000000-0000-4000-8000-000000000a11', '테스트 셀러', '@pgtap.cart.seller', 'instagram', true),
       ('00000000-0000-4000-8000-000000000a12', '비활성 셀러', '@pgtap.cart.inactive', 'instagram', false);

insert into public.myr_products (id, code, seller_id, category, name, price, stock, sold_qty, status)
values ('00000000-0000-4000-8000-000000000b11', 'pgtap-cart-a',        '00000000-0000-4000-8000-000000000a11', 'diet',  'A', 10000, 5, 0, 'listed'),
       ('00000000-0000-4000-8000-000000000b12', 'pgtap-cart-b',        '00000000-0000-4000-8000-000000000a11', 'inner', 'B', 20000, 5, 0, 'listed'),
       ('00000000-0000-4000-8000-000000000b13', 'pgtap-cart-pending',  '00000000-0000-4000-8000-000000000a11', 'diet',  'C', 30000, 5, 0, 'pending'),
       ('00000000-0000-4000-8000-000000000b14', 'pgtap-cart-soldout',  '00000000-0000-4000-8000-000000000a11', 'diet',  'D', 40000, 5, 5, 'listed'),
       ('00000000-0000-4000-8000-000000000b15', 'pgtap-cart-inactive', '00000000-0000-4000-8000-000000000a12', 'diet',  'E', 50000, 5, 0, 'listed'),
       ('00000000-0000-4000-8000-000000000b16', 'pgtap-cart-deleted',  '00000000-0000-4000-8000-000000000a11', 'diet',  'F', 60000, 5, 0, 'listed');
update public.myr_products set deleted_at = now() where code = 'pgtap-cart-deleted';

-- ---------- myr_cart_set — 거부 ----------
select is(public.myr_cart_set(null, 'pgtap-cart-a', 0, 1) ->> 'code', 'NO_USER', 'user 없으면 NO_USER');
select is(public.myr_cart_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-a', 0, 10) ->> 'code', 'BAD_QTY', 'qty 10 은 BAD_QTY (상한 9)');
select is(public.myr_cart_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-a', 0, -1) ->> 'code', 'BAD_QTY', 'qty 음수는 BAD_QTY');
select is(public.myr_cart_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-a', -1, 1) ->> 'code', 'BAD_OPTION', 'option_index 음수는 BAD_OPTION');
select is(public.myr_cart_set('00000000-0000-4000-8000-0000000000c1', 'nope', 0, 1) ->> 'code', 'NOT_FOUND', '없는 code 는 NOT_FOUND');
select is(public.myr_cart_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-deleted', 0, 1) ->> 'code', 'NOT_FOUND', '삭제 상품은 NOT_FOUND');
select is(public.myr_cart_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-pending', 0, 1) ->> 'code', 'NOT_AVAILABLE', 'pending 은 NOT_AVAILABLE');
select is(public.myr_cart_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-soldout', 0, 1) ->> 'code', 'NOT_AVAILABLE', '품절은 NOT_AVAILABLE');
select is(public.myr_cart_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-inactive', 0, 1) ->> 'code', 'NOT_AVAILABLE', '비활성 셀러 상품은 NOT_AVAILABLE');

-- ---------- myr_cart_set — 담기 · 더하기 · 수량 · 삭제 ----------
select is(public.myr_cart_set('00000000-0000-4000-8000-0000000000c1', ' PGTAP-CART-A ', 0, 2), '{"ok": true, "code": "pgtap-cart-a", "qty": 2}'::jsonb, '담기 — code 는 trim+소문자 · qty 2');
select is(public.myr_cart_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-a', 0, 8, true) ->> 'qty', '9', 'add=true 는 더하되 9 에서 멈춘다');
select is(public.myr_cart_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-a', 0, 3) ->> 'qty', '3', 'add=false 는 그 값으로 맞춘다');
select is(public.myr_cart_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-a', 1, 1) ->> 'qty', '1', '다른 option_index 는 별도 줄');
select is((select count(*) from public.myr_cart_items where user_id = '00000000-0000-4000-8000-0000000000c1'), 2::bigint, '줄 2개 (옵션 0 · 1)');
select is(public.myr_cart_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-a', 1, 0) ->> 'qty', '0', 'qty 0 = 삭제');
select is((select count(*) from public.myr_cart_items where user_id = '00000000-0000-4000-8000-0000000000c1'), 1::bigint, '삭제 뒤 줄 1개');

-- ---------- myr_cart_get ----------
select is(public.myr_cart_get(null), '[]'::jsonb, 'user 없으면 빈 배열');
select is(public.myr_cart_get('00000000-0000-4000-8000-0000000000c2'), '[]'::jsonb, '다른 사용자 장바구니는 비어 있다');
select is(
  (select jsonb_agg(jsonb_build_object('code', e->>'code', 'qty', (e->>'qty')::int, 'available', (e->>'available')::boolean, 'price', (e->>'price')::int)) from jsonb_array_elements(public.myr_cart_get('00000000-0000-4000-8000-0000000000c1')) e),
  '[{"code": "pgtap-cart-a", "qty": 3, "available": true, "price": 10000}]'::jsonb,
  '줄 = 상품 공개 JSON + qty + available · 가격은 상품 표에서'
);
select ok((select (e ? 'stock') = false and (e ? 'seller_margin_rate') = false from jsonb_array_elements(public.myr_cart_get('00000000-0000-4000-8000-0000000000c1')) e limit 1), '재고 · 마진율은 장바구니 응답에도 없다');
update public.myr_products set price = 12000, status = 'paused' where code = 'pgtap-cart-a';
select is(
  (select jsonb_build_object('price', (e->>'price')::int, 'available', (e->>'available')::boolean) from jsonb_array_elements(public.myr_cart_get('00000000-0000-4000-8000-0000000000c1')) e),
  '{"price": 12000, "available": false}'::jsonb,
  '가격 변경은 바로 반영 · paused 가 되면 줄은 남고 available:false'
);
select is(public.myr_cart_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-a', 0, 2) ->> 'code', 'NOT_AVAILABLE', 'paused 상품은 수량 변경 불가');
select is(public.myr_cart_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-a', 0, 0) ->> 'ok', 'true', '살 수 없는 줄도 지울 수는 있다');
update public.myr_products set status = 'listed' where code = 'pgtap-cart-a';

-- ---------- myr_cart_merge ----------
select is(public.myr_cart_merge('00000000-0000-4000-8000-0000000000c1', '{}'::jsonb) ->> 'code', 'BAD_LINES', '배열이 아니면 BAD_LINES');
select is(
  public.myr_cart_merge('00000000-0000-4000-8000-0000000000c1', '[{"code":"pgtap-cart-a","qty":2},{"code":"pgtap-cart-b","qty":"x"},{"code":"pgtap-cart-pending","qty":1},{"code":"pgtap-cart-a","qty":8,"option_index":0},{"code":"pgtap-cart-b","qty":1}]'::jsonb),
  '{"ok": true, "merged": 3, "skipped": 2}'::jsonb,
  '합치기 — 잘못된 qty · 살 수 없는 상품은 건너뛰고 나머지는 더한다'
);
select is(
  (select jsonb_agg(jsonb_build_object('code', e->>'code', 'qty', (e->>'qty')::int) order by e->>'code') from jsonb_array_elements(public.myr_cart_get('00000000-0000-4000-8000-0000000000c1')) e),
  '[{"code": "pgtap-cart-a", "qty": 9}, {"code": "pgtap-cart-b", "qty": 1}]'::jsonb,
  '합친 결과 — a 는 2+8 → 상한 9 · b 는 1'
);

-- ---------- myr_cart_clear ----------
select is(public.myr_cart_clear('00000000-0000-4000-8000-0000000000c1'), '{"ok": true, "removed": 2}'::jsonb, '비우기 — 지운 줄 수');
select is(public.myr_cart_get('00000000-0000-4000-8000-0000000000c1'), '[]'::jsonb, '비운 뒤 빈 배열');
select is(public.myr_cart_clear(null) ->> 'code', 'NO_USER', 'clear 도 user 필수');

-- ---------- 찜 ----------
select is(public.myr_like_set(null, 'pgtap-cart-a', true) ->> 'code', 'NO_USER', '찜 user 없으면 NO_USER');
select is(public.myr_like_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-deleted', true) ->> 'code', 'NOT_FOUND', '삭제 상품 찜은 NOT_FOUND');
select is(public.myr_like_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-a', true), '{"ok": true, "code": "pgtap-cart-a", "liked": true}'::jsonb, '찜 켜기');
select is(public.myr_like_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-a', true) ->> 'ok', 'true', '두 번 켜도 멱등');
select is(public.myr_likes_merge('00000000-0000-4000-8000-0000000000c1', '["pgtap-cart-b", 7, "nope", "pgtap-cart-pending"]'::jsonb), '{"ok": true, "merged": 2, "skipped": 2}'::jsonb, '찜 합치기 — 문자열 아닌 값 · 없는 code 는 건너뜀 (pending 은 찜은 된다)');
select is(
  (select jsonb_agg(e->>'code' order by e->>'code') from jsonb_array_elements(public.myr_likes_get('00000000-0000-4000-8000-0000000000c1')) e),
  '["pgtap-cart-a", "pgtap-cart-b"]'::jsonb,
  '찜 목록 — 살 수 없는 상품(pending) 은 뺀다 (한 트랜잭션 안에선 created_at 이 같아 순서는 보지 않는다)'
);
select is(public.myr_like_set('00000000-0000-4000-8000-0000000000c1', 'pgtap-cart-a', false) ->> 'liked', 'false', '찜 끄기');
select is((select count(*) from public.myr_likes where user_id = '00000000-0000-4000-8000-0000000000c1'), 2::bigint, '끈 뒤 찜 2개(b · pending)');
select is(public.myr_likes_get('00000000-0000-4000-8000-0000000000c2'), '[]'::jsonb, '다른 사용자 찜은 비어 있다');

select * from finish();
rollback;
