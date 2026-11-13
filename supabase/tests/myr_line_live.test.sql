-- pgTAP — 0098 줄의 남은 수량 · 살아 있는 줄 판정 한 곳(myr_line_left · myr_line_live): 발송 · 주문 배송 상태 · 실적 · 콘솔 주문 줄이 같은 함수 값을 쓴다
begin;
select plan(11);

select function_privs_are('public', 'myr_line_live', '{myr_order_items}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 line_live 불가');
select function_privs_are('public', 'myr_sales_lines', '{}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 sales_lines 불가(다시 만든 뒤에도)');

insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-00000000d911', '민지 루틴', '@pgtap.live', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-00000000d921', 'pgtap-live-a', '00000000-0000-4000-8000-00000000d911', 'diet', '레몬 스틱', 10000, 100, 'listed', 'pill');
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount, payment_key, refund_amount)
values ('00000000-0000-4000-8000-00000000d931', 'pgtap-live-1', 'PARTIAL_REFUNDED', now(), '김지은', '{}', '레몬 외', 60000, 'pk-live', 20000);
-- a: 3개 중 1개 환불(살아 있음 · 남은 2 · 배송중) · b: 1개 전부 환불(죽음) · c: 취소(죽음) · d: 2개(살아 있음 · 배송준비중)
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, ship_status, refunded_qty, status)
values ('00000000-0000-4000-8000-00000000d941', '00000000-0000-4000-8000-00000000d931', '00000000-0000-4000-8000-00000000d921', '00000000-0000-4000-8000-00000000d911', '레몬 a', '', 3, 10000, 'SHIPPING', 1, 'PARTIAL_REFUNDED'),
       ('00000000-0000-4000-8000-00000000d942', '00000000-0000-4000-8000-00000000d931', '00000000-0000-4000-8000-00000000d921', '00000000-0000-4000-8000-00000000d911', '레몬 b', '', 1, 10000, 'PAID', 1, 'REFUNDED'),
       ('00000000-0000-4000-8000-00000000d943', '00000000-0000-4000-8000-00000000d931', '00000000-0000-4000-8000-00000000d921', '00000000-0000-4000-8000-00000000d911', '레몬 c', '', 1, 10000, 'PAID', 0, 'CANCELED'),
       ('00000000-0000-4000-8000-00000000d944', '00000000-0000-4000-8000-00000000d931', '00000000-0000-4000-8000-00000000d921', '00000000-0000-4000-8000-00000000d911', '레몬 d', '', 2, 10000, 'PREPARING', 0, 'PAID');

-- 판정 함수
select is((select jsonb_object_agg(i.product_name, jsonb_build_array(public.myr_line_left(i), public.myr_line_live(i))) from public.myr_order_items i where i.order_id = '00000000-0000-4000-8000-00000000d931'),
          '{"레몬 a": [2, true], "레몬 b": [0, false], "레몬 c": [1, false], "레몬 d": [2, true]}'::jsonb, '남은 수량 · 살아 있는 줄 — 부분 환불 · 전부 환불 · 취소 · 정상');

-- 주문 배송 상태 — 살아 있는 줄(a 배송중 · d 배송준비중) 중 가장 덜 진행된 것. 죽은 줄(b · c 결제완료)은 보지 않는다
select is(public.myr_order_ship_status('00000000-0000-4000-8000-00000000d931'), 'PREPARING', '주문 배송 상태 = 살아 있는 줄 기준(죽은 PAID 줄 제외)');

-- 발송 대기 목록 — 살아 있는 줄 수 · 배송준비중 수
select is((select jsonb_build_object('lines', (e ->> 'lines')::int, 'preparing', (e ->> 'preparing')::int) from jsonb_array_elements(public.myr_app_admin_ship_pending(50, false)) e where e ->> 'code' = 'pgtap-live-1'),
          '{"lines": 2, "preparing": 1}'::jsonb, '발송 대기 — 살아 있는 줄 2 · 배송준비중 1');

-- 실적 — 판매 수량 = 살아 있든 아니든 남은 수량 합(취소 줄 포함 · 0086 과 같은 결과)
-- 0110: 실적도 정산과 같은 "결제된 줄"(myr_line_paid · 취소 줄 제외) — 취소된 c 는 판매가 아니다(전에는 c 의 1개까지 세어 5)
select is((select sum(left_qty)::int from public.myr_sales_lines() where order_id = '00000000-0000-4000-8000-00000000d931'), 4, 'myr_sales_lines.left_qty 합 = 2 + 0 + 2(취소 줄 c 제외 · 0110)');
select is((public.myr_app_seller_sales('00000000-0000-4000-8000-00000000d911') ->> 'units')::int, 4, '홈 판매 수량 = 같은 합(취소 줄 제외 · 정산과 같은 기준)');

-- 콘솔 주문 줄 JSON — left_qty · live(주문 탭이 다시 계산하지 않는다)
select is((select jsonb_object_agg(l ->> 'name', jsonb_build_array((l ->> 'left_qty')::int, (l ->> 'live')::boolean))
             from jsonb_array_elements(public.myr_app_seller_orders('00000000-0000-4000-8000-00000000d911', 50)) o, jsonb_array_elements(o -> 'items') l where o ->> 'code' = 'pgtap-live-1'),
          '{"레몬 a": [2, true], "레몬 b": [0, false], "레몬 c": [1, false], "레몬 d": [2, true]}'::jsonb, '콘솔 주문 줄 left_qty · live = 판정 함수 값');

-- 환불 길 — 죽은 줄은 길이 없다(0097 함수가 myr_line_live 를 쓴다)
select is((select jsonb_object_agg(i.product_name, public.myr_line_refund_path(o, i)) from public.myr_orders o join public.myr_order_items i on i.order_id = o.id where o.id = '00000000-0000-4000-8000-00000000d931'),
          '{"레몬 a": "claim", "레몬 b": null, "레몬 c": null, "레몬 d": "claim"}'::jsonb, '환불 길 — 살아 있는 줄만');

-- 배송 완료 기록 — 살아 있는 배송중 줄만 바뀐다
select is(public.myr_app_admin_deliver('pgtap-live-1', now()) ->> 'ok', 'true', 'deliver → ok');
select is((select jsonb_object_agg(product_name, ship_status) from public.myr_order_items where order_id = '00000000-0000-4000-8000-00000000d931'),
          '{"레몬 a": "DELIVERED", "레몬 b": "PAID", "레몬 c": "PAID", "레몬 d": "PREPARING"}'::jsonb, '배송중이던 살아 있는 줄 a 만 배송 완료');

select * from finish();
rollback;
