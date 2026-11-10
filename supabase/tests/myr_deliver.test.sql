-- pgTAP — 0088 배송 완료 수동 기록 · 배송 완료 없는 줄 목록: 권한 · 거부 코드 · 배송 완료일 · 주문 칸 · 멱등 · 정산(0087) 대상이 되는지
begin;
select plan(15);

select function_privs_are('public', 'myr_app_admin_deliver', '{text,timestamptz}'::text[], 'anon', '{}'::text[], 'anon 은 deliver 불가');
select function_privs_are('public', 'myr_app_admin_deliver', '{text,timestamptz}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 deliver 불가');
select function_privs_are('public', 'myr_app_admin_deliver', '{text,timestamptz}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 deliver 가능');
select function_privs_are('public', 'myr_app_admin_undelivered', '{integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 undelivered 불가');

insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-0000000a8001', '민지 루틴', '@pgtap.dl1', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-0000000a8a01', 'pgtap-dl-a', '00000000-0000-4000-8000-0000000a8001', 'diet', '포도 젤리', 32000, 100, 'listed', 'grape');
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount)
values ('00000000-0000-4000-8000-0000000a8b01', 'pgtap-dl-1', 'PAID', now() - interval '12 days', '김지은', '{}', '주문1', 0),
       ('00000000-0000-4000-8000-0000000a8b02', 'pgtap-dl-2', 'PAID', now() - interval '3 days', '이현', '{}', '주문2', 0),
       ('00000000-0000-4000-8000-0000000a8b03', 'pgtap-dl-3', 'REFUNDED', now() - interval '3 days', '박민', '{}', '주문3', 0);
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, qty, unit_price, ship_status, courier, tracking_no, shipped_at)
values ('00000000-0000-4000-8000-0000000a8c01', '00000000-0000-4000-8000-0000000a8b01', '00000000-0000-4000-8000-0000000a8a01', '00000000-0000-4000-8000-0000000a8001', '포도 젤리', 1, 32000, 'SHIPPING', 'CJ대한통운', '612300000001', now() - interval '10 days'),
       ('00000000-0000-4000-8000-0000000a8c02', '00000000-0000-4000-8000-0000000a8b01', '00000000-0000-4000-8000-0000000a8a01', '00000000-0000-4000-8000-0000000a8001', '포도 젤리', 1, 32000, 'SHIPPING', 'CJ대한통운', '612300000001', now() - interval '10 days'),
       ('00000000-0000-4000-8000-0000000a8c03', '00000000-0000-4000-8000-0000000a8b02', '00000000-0000-4000-8000-0000000a8a01', '00000000-0000-4000-8000-0000000a8001', '포도 젤리', 1, 32000, 'PREPARING', null, null, null);

select ok((select bool_or(e ->> 'order_code' = 'pgtap-dl-1' and (e ->> 'days')::int >= 9 and e ->> 'ebut' = 'false') from jsonb_array_elements(public.myr_app_admin_undelivered(5)) e),
          '배송중 10일 줄이 목록에 — 이벗 미등록 표시');
select ok(not (select coalesce(bool_or(e ->> 'order_code' = 'pgtap-dl-1'), false) from jsonb_array_elements(public.myr_app_admin_undelivered(30)) e), 'days 보다 짧으면 목록에 없다');

select is(public.myr_app_admin_deliver('nope', null) ->> 'code', 'NOT_FOUND', '없는 주문은 NOT_FOUND');
select is(public.myr_app_admin_deliver('pgtap-dl-3', null) ->> 'code', 'WRONG_STATUS', '전액 환불 주문은 WRONG_STATUS');
select is(public.myr_app_admin_deliver('pgtap-dl-2', null) ->> 'code', 'NOT_SHIPPED', '배송중 줄이 없으면 NOT_SHIPPED');
select is(public.myr_app_admin_deliver('pgtap-dl-1', now() + interval '1 day') ->> 'code', 'BAD_DATE', '미래 날짜는 BAD_DATE');
select is(public.myr_app_admin_deliver('pgtap-dl-1', now() - interval '20 days') ->> 'code', 'BAD_DATE', '결제 전 날짜는 BAD_DATE');

select is(public.myr_app_admin_deliver('PGTAP-DL-1', now() - interval '7 days') ->> 'delivered', '2', '배송중 줄 2개 → 배송 완료(대문자 주문번호도)');
select is((select array_agg(ship_status || ':' || (delivered_at = now() - interval '7 days')::text order by id) from public.myr_order_items where order_id = '00000000-0000-4000-8000-0000000a8b01'),
          array['DELIVERED:true', 'DELIVERED:true'], '줄 배송 완료일 = 넣은 날짜');
select is((select delivered_at from public.myr_orders where id = '00000000-0000-4000-8000-0000000a8b01'), now() - interval '7 days', '살아 있는 줄이 전부 완료라 주문 칸에도');
select is(public.myr_app_admin_deliver('pgtap-dl-1', null) ->> 'already', 'true', '다시 부르면 already(날짜는 그대로)');

select * from finish();
rollback;
