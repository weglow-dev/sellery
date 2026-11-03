-- pgTAP — 0069 발송 처리: 권한 · 거부 코드 · 기록 · already · 정정 · 발송 대기 목록 (docs/myr.md §7 S8)
begin;
select plan(17);

select function_privs_are('public', 'myr_app_admin_ship', '{text,text,text}'::text[], 'anon', '{}'::text[], 'anon 은 ship 실행 불가');
select function_privs_are('public', 'myr_app_admin_ship', '{text,text,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 도 ship 실행 불가');
select function_privs_are('public', 'myr_app_admin_ship', '{text,text,text}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 ship 실행 가능');
select function_privs_are('public', 'myr_app_admin_ship_pending', '{integer,boolean}'::text[], 'anon', '{}'::text[], 'anon 은 ship_pending 실행 불가');

-- 픽스처: PAID 2건(하나는 이미 발송) · WAITING_DEPOSIT · REFUNDED
insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-000000000a61', '민지 루틴', '@pgtap.ship', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, tile, icon)
values ('00000000-0000-4000-8000-000000000b61', 'pgtap-ship-a', '00000000-0000-4000-8000-000000000a61', 'diet', '상품 A', 20000, 9, 'listed', 'lg', 'grape');
insert into public.myr_orders (id, code, status, buyer_name, shipping, order_name, items_amount, shipping_fee, payment_key, payment_method, paid_at, created_at, courier, tracking_no, shipped_at)
values ('00000000-0000-4000-8000-000000000d61', 'pgtap-sh-1', 'PAID', '홍길동', '{"recipient":"홍길동","phone":"01012345678","address1":"서울"}', '상품 A', 20000, 0, 'pk_sh1', '카드', now() - interval '2 days', now() - interval '2 days', null, null, null),
       ('00000000-0000-4000-8000-000000000d62', 'pgtap-sh-2', 'PAID', '김영희', '{"recipient":"김영희","phone":"01012345678","address1":"부산"}', '상품 A', 20000, 0, 'pk_sh2', '카드', now() - interval '1 day', now() - interval '1 day', 'CJ대한통운', '111122223333', now() - interval '12 hours'),
       ('00000000-0000-4000-8000-000000000d63', 'pgtap-sh-3', 'WAITING_DEPOSIT', '박입금', '{"recipient":"박입금","phone":"01012345678","address1":"대구"}', '상품 A', 20000, 0, 'pk_sh3', '가상계좌', null, now(), null, null, null),
       ('00000000-0000-4000-8000-000000000d64', 'pgtap-sh-4', 'REFUNDED', '최환불', '{"recipient":"최환불","phone":"01012345678","address1":"광주"}', '상품 A', 20000, 0, 'pk_sh4', '카드', now(), now(), null, null, null);
insert into public.myr_order_items (order_id, product_id, seller_id, product_name, option_name, qty, unit_price)
values ('00000000-0000-4000-8000-000000000d61', '00000000-0000-4000-8000-000000000b61', '00000000-0000-4000-8000-000000000a61', '상품 A', '', 1, 20000),
       ('00000000-0000-4000-8000-000000000d62', '00000000-0000-4000-8000-000000000b61', '00000000-0000-4000-8000-000000000a61', '상품 A', '', 1, 20000),
       ('00000000-0000-4000-8000-000000000d63', '00000000-0000-4000-8000-000000000b61', '00000000-0000-4000-8000-000000000a61', '상품 A', '', 1, 20000),
       ('00000000-0000-4000-8000-000000000d64', '00000000-0000-4000-8000-000000000b61', '00000000-0000-4000-8000-000000000a61', '상품 A', '', 1, 20000);

-- 거부 코드
select is(public.myr_app_admin_ship('pgtap-sh-1', '택배', '123456789') ->> 'code', 'BAD_COURIER', '택배사 목록 밖 BAD_COURIER');
select is(public.myr_app_admin_ship('pgtap-sh-1', 'CJ대한통운', '12-34') ->> 'code', 'BAD_TRACKING', '운송장 8자리 미만 BAD_TRACKING');
select is(public.myr_app_admin_ship('pgtap-nope', 'CJ대한통운', '123456789') ->> 'code', 'NOT_FOUND', '없는 주문 NOT_FOUND');
select is(public.myr_app_admin_ship('pgtap-sh-3', 'CJ대한통운', '123456789') ->> 'code', 'WRONG_STATUS', '입금 대기 주문은 WRONG_STATUS');
select is(public.myr_app_admin_ship('pgtap-sh-4', 'CJ대한통운', '123456789') ->> 'code', 'WRONG_STATUS', '환불된 주문은 WRONG_STATUS');

-- 기록(대문자·하이픈·공백 정리) · already · 정정
select is(public.myr_app_admin_ship('PGTAP-SH-1', '한진택배', '1234-5678-90 ') - 'shipped_at' - 'order_id',
  '{"ok": true, "already": false, "order_code": "pgtap-sh-1", "status": "PAID", "courier": "한진택배", "tracking_no": "1234567890"}'::jsonb, '발송 기록 — 코드 소문자 · 운송장 숫자만');
select is((select courier || '/' || tracking_no || '/' || (shipped_at is not null)::text from public.myr_orders where code = 'pgtap-sh-1'), '한진택배/1234567890/true', '주문 행에 택배사·운송장·shipped_at');
select is(public.myr_app_admin_ship('pgtap-sh-1', '한진택배', '1234567890') ->> 'already', 'true', '같은 택배사·운송장 재호출은 already');
update public.myr_orders set shipped_at = '2026-11-01T00:00:00Z' where code = 'pgtap-sh-1';
select is(public.myr_app_admin_ship('pgtap-sh-1', '롯데택배', '99998888777') ->> 'already', 'false', '다른 운송장은 정정(already false)');
select is((select courier || '/' || tracking_no || '/' || shipped_at::text from public.myr_orders where code = 'pgtap-sh-1'), '롯데택배/99998888777/2026-11-01 00:00:00+00', '정정해도 shipped_at 은 처음 값');

-- 발송 대기 목록 — PAID 이고 운송장 없는 것만 · shipped=true 면 발송된 것
select is((select coalesce(jsonb_agg(e ->> 'code'), '[]'::jsonb) from jsonb_array_elements(public.myr_app_admin_ship_pending(10, false)) e where e ->> 'code' like 'pgtap-sh-%'), '[]'::jsonb, '전부 발송됐으면 대기 목록에 없음');
update public.myr_orders set courier = null, tracking_no = null, shipped_at = null where code = 'pgtap-sh-1';
select is((select jsonb_agg(e ->> 'code') from jsonb_array_elements(public.myr_app_admin_ship_pending(10, false)) e where e ->> 'code' like 'pgtap-sh-%'), '["pgtap-sh-1"]'::jsonb, '대기 목록 = PAID · 운송장 없음(입금 대기·환불 제외)');
select is((select e - 'id' - 'paid_at' - 'created_at' - 'shipped_at' from jsonb_array_elements(public.myr_app_admin_ship_pending(10, true)) e where e ->> 'code' = 'pgtap-sh-2'),
  '{"code": "pgtap-sh-2", "lines": 1, "amount": 20000, "status": "PAID", "courier": "CJ대한통운", "recipient": "김영희", "buyer_name": "김영희", "order_name": "상품 A", "tracking_no": "111122223333"}'::jsonb, '발송된 목록 행 모양(수취인 이름만 · 주소 없음)');

select * from finish();
rollback;
