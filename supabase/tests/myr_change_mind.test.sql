-- pgTAP — 0093 단순 변심 "수령 후 7일"(날짜 기준 · 한국 시간): 기한 계산 · 경계 · 요청 접수 거절 · 수령 전 · 다른 사유 · 주문 JSON · 권한
begin;
select plan(16);

-- ---------- 권한 ----------
select function_privs_are('public', 'myr_line_change_mind_until', '{myr_order_items}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 change_mind_until 불가');
select function_privs_are('public', 'myr_line_change_mind_ok', '{myr_order_items,"timestamp with time zone"}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 change_mind_ok 불가');

-- ---------- 픽스처 ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000c901', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-cm@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-00000000c911', '민지 루틴', '@pgtap.cm', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-00000000c921', 'pgtap-cm-lemon', '00000000-0000-4000-8000-00000000c911', 'diet', '레몬 스틱', 36000, 50, 'listed', 'pill');
insert into public.myr_orders (id, code, status, paid_at, user_id, buyer_name, shipping, order_name, items_amount, payment_key)
values ('00000000-0000-4000-8000-00000000c931', 'pgtap-cm-1', 'PAID', now() - interval '20 days', '00000000-0000-4000-8000-00000000c901', '홍길동', '{}', '레몬 외', 144000, 'pk-cm');
-- 줄: a = MYR1495 재현(11/3 18:11 KST 수령) · b = 9일 전 수령(지남) · c = 2일 전 수령(가능) · d = 배송중(수령 전)
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, ship_status, delivered_at)
values ('00000000-0000-4000-8000-00000000c941', '00000000-0000-4000-8000-00000000c931', '00000000-0000-4000-8000-00000000c921', '00000000-0000-4000-8000-00000000c911', '레몬', '', 1, 36000, 'DELIVERED', '2026-11-03 18:11:00+09'),
       ('00000000-0000-4000-8000-00000000c942', '00000000-0000-4000-8000-00000000c931', '00000000-0000-4000-8000-00000000c921', '00000000-0000-4000-8000-00000000c911', '레몬', '', 1, 36000, 'DELIVERED', now() - interval '9 days'),
       ('00000000-0000-4000-8000-00000000c943', '00000000-0000-4000-8000-00000000c931', '00000000-0000-4000-8000-00000000c921', '00000000-0000-4000-8000-00000000c911', '레몬', '', 1, 36000, 'DELIVERED', now() - interval '2 days'),
       ('00000000-0000-4000-8000-00000000c944', '00000000-0000-4000-8000-00000000c931', '00000000-0000-4000-8000-00000000c921', '00000000-0000-4000-8000-00000000c911', '레몬', '', 1, 36000, 'SHIPPING', null);

-- ---------- 기한 계산 · 경계(날짜 기준) ----------
select is((select public.myr_line_change_mind_until(i) from public.myr_order_items i where id = '00000000-0000-4000-8000-00000000c941'), '2026-11-10 23:59:59+09'::timestamptz, '11/3 수령 → 11/10 23:59:59(한국 시간)까지');
select is((select public.myr_line_change_mind_ok(i, '2026-11-10 23:59:59+09') from public.myr_order_items i where id = '00000000-0000-4000-8000-00000000c941'), true, '11/10 23:59:59 → 가능(마지막 순간)');
select is((select public.myr_line_change_mind_ok(i, '2026-11-11 00:00:00+09') from public.myr_order_items i where id = '00000000-0000-4000-8000-00000000c941'), false, '11/11 00:00 → 지남');
select is((select public.myr_line_change_mind_ok(i, '2026-11-11 12:02:00+09') from public.myr_order_items i where id = '00000000-0000-4000-8000-00000000c941'), false, 'RQ2500 시각(11/11 12:02) → 지남');
update public.myr_order_items set delivered_at = '2026-11-03 00:00:01+09' where id = '00000000-0000-4000-8000-00000000c941';
select is((select public.myr_line_change_mind_until(i) from public.myr_order_items i where id = '00000000-0000-4000-8000-00000000c941'), '2026-11-10 23:59:59+09'::timestamptz, '11/3 00:00 에 받아도 같은 기한(날짜 기준)');
select is((select public.myr_line_change_mind_until(i) from public.myr_order_items i where id = '00000000-0000-4000-8000-00000000c944'), null, '수령 전(배송 완료 기록 없음) → 기한 없음');
select is((select public.myr_line_change_mind_ok(i) from public.myr_order_items i where id = '00000000-0000-4000-8000-00000000c944'), true, '수령 전 → 단순 변심 가능');

-- ---------- 요청 접수 ----------
select is(public.myr_app_claim_open('00000000-0000-4000-8000-00000000c931', '00000000-0000-4000-8000-00000000c901', 'refund', '단순 변심', '[{"item_id":"00000000-0000-4000-8000-00000000c942","qty":1}]') -> 'items' -> 0 ->> 'reason', 'CHANGE_MIND_EXPIRED', '수령 9일 지난 줄 단순 변심 → CHANGE_MIND_EXPIRED');
select ok((public.myr_app_claim_open('00000000-0000-4000-8000-00000000c931', '00000000-0000-4000-8000-00000000c901', 'refund', '단순 변심', '[{"item_id":"00000000-0000-4000-8000-00000000c942","qty":1}]') -> 'items' -> 0 ->> 'until') is not null, '거절에 기한(until)을 싣는다');
select is((select count(*)::int from public.myr_refund_requests where order_id = '00000000-0000-4000-8000-00000000c931'), 0, '거절되면 요청을 만들지 않는다');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-00000000c931', '00000000-0000-4000-8000-00000000c901', 'refund', '단순 변심', '[{"item_id":"00000000-0000-4000-8000-00000000c943","qty":1}]') ->> 'ok', 'true', '수령 2일 된 줄 단순 변심 → 접수');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-00000000c931', '00000000-0000-4000-8000-00000000c901', 'refund', '단순 변심', '[{"item_id":"00000000-0000-4000-8000-00000000c944","qty":1}]') ->> 'ok', 'true', '수령 전(배송중) 단순 변심 → 접수');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-00000000c931', '00000000-0000-4000-8000-00000000c901', 'refund', '오배송',
          jsonb_build_array(jsonb_build_object('item_id', '00000000-0000-4000-8000-00000000c942', 'qty', 1, 'photos',
            jsonb_build_array('00000000-0000-4000-8000-00000000c931/00000000-0000-4000-8000-00000000c942/00000000-0000-4000-8000-0000000000a1.jpg')))) ->> 'ok', 'true', '기한 지난 줄도 오배송은 접수(기한은 단순 변심만)');

-- ---------- 주문 JSON ----------
select is((select e -> 'change_mind_ok' from jsonb_array_elements((select public.myr_order_json(o, false) from public.myr_orders o where o.code = 'pgtap-cm-1') -> 'items') e
            where e ->> 'id' = '00000000-0000-4000-8000-00000000c942'), 'false'::jsonb, '주문 JSON — 지난 줄 change_mind_ok false(화면이 그대로 쓴다)');

select * from finish();
rollback;
