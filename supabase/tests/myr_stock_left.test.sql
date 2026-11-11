-- pgTAP — 0096 재고 판정 한 곳: 남은 재고(myr_product_left) · 지금 살 수 있는 수량(myr_product_buyable) — 상품 공개 정보 · 장바구니 견적 · 결제 생성이 같은 값
begin;
select plan(14);

select function_privs_are('public', 'myr_product_left', '{myr_products}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 product_left 불가');
select function_privs_are('public', 'myr_product_buyable', '{myr_products,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 product_buyable 불가');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000e701', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-stock-a@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-00000000e702', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-stock-b@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-00000000e711', '민지 루틴', '@pgtap.stock', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, sold_qty, status, icon)
values ('00000000-0000-4000-8000-00000000e721', 'pgtap-stock-a', '00000000-0000-4000-8000-00000000e711', 'diet', '레몬 스틱', 36000, 10, 3, 'listed', 'pill'),
       ('00000000-0000-4000-8000-00000000e722', 'pgtap-stock-out', '00000000-0000-4000-8000-00000000e711', 'diet', '품절 상품', 36000, 5, 5, 'listed', 'pill');
create temp table args as select '{"name":"김지은"}'::jsonb as buyer, '{"recipient":"김지은","address1":"서울"}'::jsonb as ship;

select is((select public.myr_product_left(p) from public.myr_products p where code = 'pgtap-stock-a'), 7, '남은 재고 = 입고 10 − 판매 3 = 7');
select is((select public.myr_product_buyable(p) from public.myr_products p where code = 'pgtap-stock-a'), 7, '결제 대기 없으면 살 수 있는 수량 = 남은 재고');

-- 다른 고객(b)이 2개 결제 대기
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-00000000e702', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-stock-a","qty":2}]', 'myr_t_stock_b1') ->> 'ok', 'true', '고객 b 2개 결제 대기');
select is((select public.myr_product_buyable(p) from public.myr_products p where code = 'pgtap-stock-a'), 5, '다른 고객 대기 2개를 빼면 지금 살 수 있는 수량 5');
select is((select public.myr_product_left(p) from public.myr_products p where code = 'pgtap-stock-a'), 7, '남은 재고(입고 − 판매)는 그대로 7');

-- 상품 공개 정보 · 장바구니 견적 · 결제 생성이 같은 값
select is((select public.myr_product_public_json(p, s) ->> 'stock_left' from public.myr_products p join public.sellers s on s.id = p.seller_id where p.code = 'pgtap-stock-a'), '5', '상품 공개 정보 stock_left 5(상품 페이지 표시)');
select is(public.myr_app_cart_quote('[{"code":"pgtap-stock-a","qty":1}]') -> 'lines' -> 0 ->> 'stock_left', '5', '장바구니 견적 stock_left 5');
-- 상품 페이지 RPC(plpgsql · security definer 안에서 부른다) — 0096 초안에서 jsonb 오류가 났던 경로
select is(public.myr_product_card('pgtap-stock-a') ->> 'stock_left', '5', '상품 페이지(myr_product_card) stock_left 5 — 오류 없이');
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-00000000e701', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-stock-a","qty":6}]', 'myr_t_stock_a1') #> '{items,0}',
          '{"code": "pgtap-stock-a", "left": 5, "reason": "SOLD_OUT"}'::jsonb, '고객 a 6개 → SOLD_OUT · left 5(표시와 같은 값)');
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-00000000e701', null, (select buyer from args), (select ship from args), '[{"code":"pgtap-stock-a","qty":5}]', 'myr_t_stock_a2') ->> 'ok', 'true', '고객 a 5개 → 된다');

-- 품절
select is((select public.myr_product_public_json(p, s) -> 'sold_out' from public.myr_products p join public.sellers s on s.id = p.seller_id where p.code = 'pgtap-stock-out'), 'true'::jsonb, '남은 재고 0 → 품절');
select is((select public.myr_product_public_json(p, s) ->> 'stock_left' from public.myr_products p join public.sellers s on s.id = p.seller_id where p.code = 'pgtap-stock-out'), '0', '품절 → stock_left 0');

select * from finish();
rollback;
