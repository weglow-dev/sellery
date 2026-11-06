-- pgTAP — 0081 크리에이터 주문 열람: 권한 · 내 줄만(섞인 주문) · 결제된 주문만 · 이름 가림 · 진행 중 요청 · 계정으로 바로
begin;
select plan(16);

-- ---------- 권한 ----------
select function_privs_are('public', 'myr_app_seller_orders', '{uuid,integer}'::text[], 'anon', '{}'::text[], 'anon 은 seller_orders 불가');
select function_privs_are('public', 'myr_app_seller_orders', '{uuid,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 seller_orders 불가');
select function_privs_are('public', 'myr_app_seller_orders_of_user', '{uuid,integer}'::text[], 'anon', '{}'::text[], 'anon 은 seller_orders_of_user 불가');
select function_privs_are('public', 'myr_app_seller_orders_of_user', '{uuid,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 seller_orders_of_user 불가');
select function_privs_are('public', 'myr_app_seller_orders_of_user', '{uuid,integer}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 seller_orders_of_user 가능');

-- ---------- 이름 가림 ----------
select is(array[public.myr_mask_name('김지은'), public.myr_mask_name('이현'), public.myr_mask_name('남궁민호'), public.myr_mask_name('결'), public.myr_mask_name('  ')],
          array['김*은', '이*', '남**호', '결', '고객'], '이름 가림 — 첫 글자 · * · 끝 글자');

-- ---------- 픽스처 ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000e81', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-so-a@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-000000000e82', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-so-b@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id)
values ('00000000-0000-4000-8000-000000000e91', '민지 루틴', '@pgtap.so1', 'instagram', true, '00000000-0000-4000-8000-000000000e81'),
       ('00000000-0000-4000-8000-000000000e92', '하루 웰', '@pgtap.so2', 'instagram', true, '00000000-0000-4000-8000-000000000e82');
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-000000000ea1', 'pgtap-so-a', '00000000-0000-4000-8000-000000000e91', 'diet', '포도 젤리', 32000, 50, 'listed', 'grape'),
       ('00000000-0000-4000-8000-000000000ea2', 'pgtap-so-b', '00000000-0000-4000-8000-000000000e92', 'diet', '콜라겐 필름', 28000, 50, 'listed', 'film');
insert into public.myr_orders (id, code, status, paid_at, buyer_name, buyer_phone, shipping, order_name, items_amount)
values ('00000000-0000-4000-8000-000000000eb1', 'pgtap-so-1', 'PAID', now() - interval '1 day', '김지은', '010-1111-2222', '{"recipient":"김지은","address1":"서울"}', '포도 젤리 외 1건', 60000),
       ('00000000-0000-4000-8000-000000000eb2', 'pgtap-so-2', 'WAITING_DEPOSIT', null, '이현', null, '{"recipient":"이현"}', '포도 젤리', 32000),
       ('00000000-0000-4000-8000-000000000eb3', 'pgtap-so-3', 'REFUNDED', now() - interval '2 days', '박민', null, '{"recipient":"박민"}', '포도 젤리', 32000),
       ('00000000-0000-4000-8000-000000000eb4', 'pgtap-so-4', 'PAID', now() - interval '3 days', '최유나', null, '{"recipient":"최유나"}', '콜라겐 필름', 28000);
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, ship_status, courier, tracking_no, shipped_at)
values ('00000000-0000-4000-8000-000000000ec1', '00000000-0000-4000-8000-000000000eb1', '00000000-0000-4000-8000-000000000ea1', '00000000-0000-4000-8000-000000000e91', '포도 젤리', '', 1, 32000, 'DELIVERED', 'CJ대한통운', '612300000001', now()),
       ('00000000-0000-4000-8000-000000000ec2', '00000000-0000-4000-8000-000000000eb1', '00000000-0000-4000-8000-000000000ea2', '00000000-0000-4000-8000-000000000e92', '콜라겐 필름', '', 1, 28000, 'SHIPPING', '롯데택배', '233300000002', now()),
       ('00000000-0000-4000-8000-000000000ec3', '00000000-0000-4000-8000-000000000eb2', '00000000-0000-4000-8000-000000000ea1', '00000000-0000-4000-8000-000000000e91', '포도 젤리', '', 1, 32000, 'PAID', null, null, null),
       ('00000000-0000-4000-8000-000000000ec4', '00000000-0000-4000-8000-000000000eb3', '00000000-0000-4000-8000-000000000ea1', '00000000-0000-4000-8000-000000000e91', '포도 젤리', '', 1, 32000, 'PAID', null, null, null),
       ('00000000-0000-4000-8000-000000000ec5', '00000000-0000-4000-8000-000000000eb4', '00000000-0000-4000-8000-000000000ea2', '00000000-0000-4000-8000-000000000e92', '콜라겐 필름', '', 1, 28000, 'PREPARING', null, null, null);
update public.myr_order_items set status = 'REFUNDED', refunded_qty = 1, refund_amount = 32000 where id = '00000000-0000-4000-8000-000000000ec4';
insert into public.myr_refund_requests (id, code, order_id, order_item_id, seller_id, product_id, kind, qty, reason, status)
values ('00000000-0000-4000-8000-000000000ed1', 'rq9901', '00000000-0000-4000-8000-000000000eb1', '00000000-0000-4000-8000-000000000ec1', '00000000-0000-4000-8000-000000000e91', '00000000-0000-4000-8000-000000000ea1', 'refund', 1, '단순 변심', 'pending');

create temp table j as select public.myr_app_seller_orders('00000000-0000-4000-8000-000000000e91') as a, public.myr_app_seller_orders('00000000-0000-4000-8000-000000000e92') as b;

-- ---------- 목록 ----------
select is((select jsonb_agg(e ->> 'code' order by e ->> 'code') from jsonb_array_elements((select a from j)) e), '["pgtap-so-1", "pgtap-so-3"]'::jsonb, '민지 — 결제된 주문만(입금 대기 제외 · 전액 환불은 포함)');
select is((select jsonb_agg(e ->> 'code' order by e ->> 'code') from jsonb_array_elements((select b from j)) e), '["pgtap-so-1", "pgtap-so-4"]'::jsonb, '하루 — 섞인 주문 + 자기 주문');
select is((select jsonb_array_length(e -> 'items') from jsonb_array_elements((select a from j)) e where e ->> 'code' = 'pgtap-so-1'), 1, '섞인 주문 — 내 줄만(다른 크리에이터 줄 없음)');
select is((select e #>> '{items,0,tracking_no}' from jsonb_array_elements((select b from j)) e where e ->> 'code' = 'pgtap-so-1'), '233300000002', '섞인 주문 — 송장도 내 줄 것만');
select is((select e ->> 'buyer' from jsonb_array_elements((select a from j)) e where e ->> 'code' = 'pgtap-so-1'), '김*은', '고객 이름은 가림');
select ok((select bool_and(not (e ? 'shipping') and not (e ? 'buyer_phone') and not (e ? 'buyer_email') and not (e ? 'buyer_name')) from jsonb_array_elements((select a from j)) e), '연락처 · 주소 · 이메일 · 원래 이름 없음');
select is((select e #> '{items,0,claim}' from jsonb_array_elements((select a from j)) e where e ->> 'code' = 'pgtap-so-1'), '{"code": "rq9901", "kind": "refund", "status": "pending"}'::jsonb, '진행 중인 교환·환불 요청');
select is((select e #> '{items,0,claim}' from jsonb_array_elements((select b from j)) e where e ->> 'code' = 'pgtap-so-1'), 'null'::jsonb, '다른 크리에이터 줄의 요청은 내 줄에 안 붙는다');

-- ---------- 계정으로 바로 ----------
select is(jsonb_array_length(public.myr_app_seller_orders_of_user('00000000-0000-4000-8000-000000000e81')), 2, '계정으로 바로 — 같은 결과');
select is(public.myr_app_seller_orders_of_user('00000000-0000-4000-8000-0000000000ff'), '[]'::jsonb, '크리에이터가 아닌 계정 · null 은 빈 배열');

select * from finish();
rollback;
