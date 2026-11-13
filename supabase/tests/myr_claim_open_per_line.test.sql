-- pgTAP — 0109 열린 교환·환불 요청은 그 줄만 막는다(2026-11-13 결정): 고객 신청 길(myr_line_customer_path) · 주문 응답 refund_path ·
--   같은 주문의 다른 상품 요청 · 바로 환불은 된다 · 같은 줄 중복은 요청 접수가 OPEN_EXISTS.
begin;
select plan(9);

select function_privs_are('public', 'myr_line_customer_path', '{myr_orders,myr_order_items}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 line_customer_path 불가');

-- 픽스처: 주문 하나 · 줄 셋(A · B 배송준비중 = 요청 길 · C 결제완료 = 바로 환불 길)
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000f901', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-perline@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-00000000f911', '민지 루틴', '@pgtap.perline', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-00000000f921', 'pgtap-perline-a', '00000000-0000-4000-8000-00000000f911', 'diet', '포도 젤리', 32000, 50, 'listed', 'grape');
insert into public.myr_orders (id, code, status, paid_at, user_id, buyer_name, buyer_phone, shipping, order_name, items_amount, payment_key)
values ('00000000-0000-4000-8000-00000000f931', 'pgtap-perline-1', 'PAID', now() - interval '2 days', '00000000-0000-4000-8000-00000000f901', '홍길동', '010-1234-5678', '{"recipient":"홍길동"}', '포도 젤리 외', 96000, 'pk-perline');
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, ship_status)
values ('00000000-0000-4000-8000-00000000f941', '00000000-0000-4000-8000-00000000f931', '00000000-0000-4000-8000-00000000f921', '00000000-0000-4000-8000-00000000f911', '포도 젤리 A', '', 1, 32000, 'PREPARING'),
       ('00000000-0000-4000-8000-00000000f942', '00000000-0000-4000-8000-00000000f931', '00000000-0000-4000-8000-00000000f921', '00000000-0000-4000-8000-00000000f911', '포도 젤리 B', '', 1, 32000, 'PREPARING'),
       ('00000000-0000-4000-8000-00000000f943', '00000000-0000-4000-8000-00000000f931', '00000000-0000-4000-8000-00000000f921', '00000000-0000-4000-8000-00000000f911', '포도 젤리 C', '', 1, 32000, 'PAID');

-- 요청 전 — 줄 길 그대로(A · B 요청 · C 바로 환불)
select is((select jsonb_object_agg(e ->> 'name', e -> 'refund_path') from jsonb_array_elements(public.myr_order_json((select o from public.myr_orders o where o.code = 'pgtap-perline-1'), true) -> 'items') e),
          '{"포도 젤리 A": "claim", "포도 젤리 B": "claim", "포도 젤리 C": "instant"}'::jsonb, '요청 전 — 줄마다 신청 길');

-- A 에 교환·환불 요청
select is(public.myr_app_claim_open('00000000-0000-4000-8000-00000000f931', '00000000-0000-4000-8000-00000000f901', 'refund', '단순 변심',
          '[{"item_id":"00000000-0000-4000-8000-00000000f941","qty":1}]') ->> 'ok', 'true', 'A 요청 접수');

-- 요청이 걸린 A 만 신청 길이 비고 B · C 는 그대로(주문 전체를 막지 않는다)
select is((select jsonb_object_agg(e ->> 'name', e -> 'refund_path') from jsonb_array_elements(public.myr_order_json((select o from public.myr_orders o where o.code = 'pgtap-perline-1'), true) -> 'items') e),
          '{"포도 젤리 A": null, "포도 젤리 B": "claim", "포도 젤리 C": "instant"}'::jsonb, '열린 요청이 걸린 A 만 신청 길 없음 · B · C 는 그대로');
select is(public.myr_order_claim_status('00000000-0000-4000-8000-00000000f931'), 'pending', '주문에는 열린 요청이 있다(주문 칩)');

-- 같은 주문의 다른 상품 — B 요청 · C 바로 환불(precheck)이 된다
select is(public.myr_app_claim_open('00000000-0000-4000-8000-00000000f931', '00000000-0000-4000-8000-00000000f901', 'refund', '단순 변심',
          '[{"item_id":"00000000-0000-4000-8000-00000000f942","qty":1}]') ->> 'ok', 'true', '열린 요청이 있어도 같은 주문의 B 요청 접수');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-00000000f931', '[{"item_id":"00000000-0000-4000-8000-00000000f943","qty":1}]', 'customer', '00000000-0000-4000-8000-00000000f901') ->> 'ok',
          'true', '열린 요청이 있어도 C 는 고객이 바로 환불할 수 있다');

-- 같은 줄 중복은 막는다
select is(public.myr_app_claim_open('00000000-0000-4000-8000-00000000f931', '00000000-0000-4000-8000-00000000f901', 'refund', '단순 변심',
          '[{"item_id":"00000000-0000-4000-8000-00000000f941","qty":1}]') #>> '{items,0,reason}', 'OPEN_EXISTS', '요청 중인 A 는 다시 요청할 수 없다(OPEN_EXISTS)');

-- 요청이 끝나면(반려) A 의 신청 길이 돌아온다
update public.myr_refund_requests set status = 'rejected', decided_at = now(), message = '반려', done_at = now() where order_item_id = '00000000-0000-4000-8000-00000000f941';
select is((select public.myr_line_customer_path(o, i) from public.myr_orders o join public.myr_order_items i on i.order_id = o.id where i.id = '00000000-0000-4000-8000-00000000f941'),
          'claim', '요청이 끝나면 A 의 신청 길이 돌아온다');

select * from finish();
rollback;
