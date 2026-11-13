-- pgTAP — 0107 결제가 재고를 잡는지(myr_checkout_holds_stock) · 새 결제로 대체되는지(myr_checkout_supersedable) · 내 결제(myr_checkout_mine) · 내 예약 합계(myr_checkout_own_held).
--   전체 예약(myr_app_checkout_reserved)과 결제 생성(myr_app_create_checkout)의 "내 예약 되돌리기 · 대체" 가 같은 함수 — 계산 결과는 0099 와 같다.
begin;
select plan(17);

select function_privs_are('public', 'myr_checkout_holds_stock', '{myr_checkouts}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 holds_stock 불가');
select function_privs_are('public', 'myr_checkout_supersedable', '{myr_checkouts}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 supersedable 불가');
select function_privs_are('public', 'myr_checkout_mine', '{myr_checkouts,uuid,uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 checkout_mine 불가');
select function_privs_are('public', 'myr_checkout_own_held', '{uuid,uuid,uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 own_held 불가');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000f701', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-holds-a@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-00000000f702', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-holds-b@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-00000000f711', '민지 루틴', '@pgtap.holds', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, sold_qty, status, icon)
values ('00000000-0000-4000-8000-00000000f721', 'pgtap-holds-a', '00000000-0000-4000-8000-00000000f711', 'diet', '레몬 스틱', 36000, 1000, 0, 'listed', 'pill');

-- 결제 — 회원 A 의 상태별 · 만료 전/후 · 회원 B · 비회원(회원 없음)
insert into public.myr_checkouts (id, toss_order_id, user_id, buyer_name, shipping, items_amount, order_name, status, expires_at, payment_key, approved_at)
values ('00000000-0000-4000-8000-00000000f731', 'myr_t_holds_pl', '00000000-0000-4000-8000-00000000f701', 'A', '{}', 0, '주문', 'PENDING',    now() + interval '20 minutes', null, null),
       ('00000000-0000-4000-8000-00000000f732', 'myr_t_holds_po', '00000000-0000-4000-8000-00000000f701', 'A', '{}', 0, '주문', 'PENDING',    now() - interval '5 minutes', null, null),
       ('00000000-0000-4000-8000-00000000f733', 'myr_t_holds_cl', '00000000-0000-4000-8000-00000000f701', 'A', '{}', 0, '주문', 'CONFIRMING', now() + interval '20 minutes', 'pk_holds_cl', null),
       ('00000000-0000-4000-8000-00000000f734', 'myr_t_holds_co', '00000000-0000-4000-8000-00000000f701', 'A', '{}', 0, '주문', 'CONFIRMING', now() - interval '5 minutes', 'pk_holds_co', null),
       ('00000000-0000-4000-8000-00000000f735', 'myr_t_holds_ok', '00000000-0000-4000-8000-00000000f701', 'A', '{}', 0, '주문', 'CONFIRMED',  now() + interval '20 minutes', 'pk_holds_ok', now()),
       ('00000000-0000-4000-8000-00000000f736', 'myr_t_holds_fa', '00000000-0000-4000-8000-00000000f701', 'A', '{}', 0, '주문', 'FAILED',     now() + interval '20 minutes', null, null),
       ('00000000-0000-4000-8000-00000000f737', 'myr_t_holds_ex', '00000000-0000-4000-8000-00000000f701', 'A', '{}', 0, '주문', 'EXPIRED',    now() + interval '20 minutes', null, null),
       ('00000000-0000-4000-8000-00000000f738', 'myr_t_holds_bl', '00000000-0000-4000-8000-00000000f702', 'B', '{}', 0, '주문', 'PENDING',    now() + interval '20 minutes', null, null),
       ('00000000-0000-4000-8000-00000000f739', 'myr_t_holds_gl', null,                                   'G', '{}', 0, '주문', 'PENDING',    now() + interval '20 minutes', null, null);
-- 줄 — 모두 같은 상품 · 수량으로 어느 결제가 셌는지 알 수 있게
insert into public.myr_checkout_items (checkout_id, product_id, seller_id, product_name, qty, unit_price)
select ('00000000-0000-4000-8000-00000000f73' || k)::uuid, '00000000-0000-4000-8000-00000000f721', '00000000-0000-4000-8000-00000000f711', '레몬 스틱', q, 36000
  from (values ('1', 1), ('2', 2), ('3', 4), ('4', 8), ('5', 16), ('6', 32), ('7', 64), ('8', 128), ('9', 256)) v(k, q);

-- 재고를 잡는 결제 = PENDING · CONFIRMING · 만료 전
select is((select jsonb_object_agg(c.toss_order_id, public.myr_checkout_holds_stock(c)) from public.myr_checkouts c where c.toss_order_id like 'myr_t_holds_%' and c.user_id = '00000000-0000-4000-8000-00000000f701'),
          '{"myr_t_holds_pl": true, "myr_t_holds_po": false, "myr_t_holds_cl": true, "myr_t_holds_co": false, "myr_t_holds_ok": false, "myr_t_holds_fa": false, "myr_t_holds_ex": false}'::jsonb,
          '재고를 잡는 결제 — PENDING · CONFIRMING 이고 만료 전만');
-- 대체될 결제 = PENDING(만료 조건 없음)
select is((select jsonb_object_agg(c.toss_order_id, public.myr_checkout_supersedable(c)) from public.myr_checkouts c where c.toss_order_id like 'myr_t_holds_%' and c.user_id = '00000000-0000-4000-8000-00000000f701'),
          '{"myr_t_holds_pl": true, "myr_t_holds_po": true, "myr_t_holds_cl": false, "myr_t_holds_co": false, "myr_t_holds_ok": false, "myr_t_holds_fa": false, "myr_t_holds_ex": false}'::jsonb,
          '대체될 결제 — PENDING 이면 만료됐어도(지금처럼 SUPERSEDED 로 남긴다)');

-- 내 결제 — 회원이면 그 회원 · 비회원이면 이전 결제(회원 없는 것만) · 둘 다 없으면 없음
select is((select public.myr_checkout_mine(c, '00000000-0000-4000-8000-00000000f701', null) from public.myr_checkouts c where c.toss_order_id = 'myr_t_holds_pl'), true, '회원 — 내 결제');
select is((select public.myr_checkout_mine(c, '00000000-0000-4000-8000-00000000f701', null) from public.myr_checkouts c where c.toss_order_id = 'myr_t_holds_bl'), false, '회원 — 다른 회원 결제 아님');
select is((select public.myr_checkout_mine(c, null, c.id) from public.myr_checkouts c where c.toss_order_id = 'myr_t_holds_gl'), true, '비회원 — 이전 결제(회원 없음)');
select is((select public.myr_checkout_mine(c, null, c.id) from public.myr_checkouts c where c.toss_order_id = 'myr_t_holds_pl'), false, '비회원 — 회원 결제는 이전 결제로 줘도 아님');
select is((select public.myr_checkout_mine(c, null, null) from public.myr_checkouts c where c.toss_order_id = 'myr_t_holds_gl'), false, '둘 다 없으면 아님');

-- 내 예약 합계(재고에 되돌려 줄 수량) = 내 결제 · 재고를 잡음 · 대체될 결제 = 회원 A 의 만료 전 PENDING 만(1)
select is(public.myr_checkout_own_held('00000000-0000-4000-8000-00000000f721', '00000000-0000-4000-8000-00000000f701', null), 1, '회원 A 내 예약 — 만료 전 PENDING 1개만(CONFIRMING 4 · 만료된 PENDING 2 는 아님)');
select is(public.myr_checkout_own_held('00000000-0000-4000-8000-00000000f721', null, '00000000-0000-4000-8000-00000000f739'), 256, '비회원 내 예약 — 이전 결제 256');
select is(public.myr_checkout_own_held('00000000-0000-4000-8000-00000000f721', null, null), 0, '회원 · 이전 결제 둘 다 없으면 0');
-- 전체 예약 = 재고를 잡는 결제 전부 = A PENDING 1 + A CONFIRMING 4 + B 128 + 비회원 256
select is(public.myr_app_checkout_reserved('00000000-0000-4000-8000-00000000f721'), 389, '전체 예약 — 만료 전 PENDING · CONFIRMING 전부(1 + 4 + 128 + 256)');

-- 결제 생성 — A 가 새 결제를 만들면 A 의 PENDING(만료 포함)만 대체 · CONFIRMING 은 그대로 · 다른 사람 것도 그대로
select is(public.myr_app_create_checkout('00000000-0000-4000-8000-00000000f701', null, '{"name":"A"}'::jsonb, '{"recipient":"A","address1":"서울"}'::jsonb,
          '[{"code":"pgtap-holds-a","qty":1}]', 'myr_t_holds_new') ->> 'ok', 'true', 'A 새 결제');
select is((select jsonb_object_agg(c.toss_order_id, c.status || '/' || coalesce(c.fail_code, '-')) from public.myr_checkouts c where c.toss_order_id in ('myr_t_holds_pl', 'myr_t_holds_po', 'myr_t_holds_cl', 'myr_t_holds_bl', 'myr_t_holds_gl')),
          '{"myr_t_holds_pl": "EXPIRED/SUPERSEDED", "myr_t_holds_po": "EXPIRED/SUPERSEDED", "myr_t_holds_cl": "CONFIRMING/-", "myr_t_holds_bl": "PENDING/-", "myr_t_holds_gl": "PENDING/-"}'::jsonb,
          '대체 — A 의 PENDING 두 개(만료된 것도 SUPERSEDED) · CONFIRMING · B · 비회원은 그대로');

select * from finish();
rollback;
