-- pgTAP — 0100 교환·환불 요청 JSON 의 order.others(같은 주문 · 같은 크리에이터의 다른 줄): 요청 줄 제외 · 다른 크리에이터 줄 제외 · 줄 판정은 기존 함수 값
begin;
select plan(7);

select function_privs_are('public', 'myr_refund_request_json', '{myr_refund_requests}'::text[], 'anon', '{}'::text[], 'anon 은 refund_request_json 불가(다시 만든 뒤에도)');
select function_privs_are('public', 'myr_refund_request_json', '{myr_refund_requests}'::text[], 'authenticated', '{}'::text[], 'authenticated 도 불가');

insert into public.sellers (id, name, handle, platform, active)
values ('00000000-0000-4000-8000-00000000c011', '셀러 A', '@pgtap.oth.a', 'instagram', true),
       ('00000000-0000-4000-8000-00000000c012', '셀러 B', '@pgtap.oth.b', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-00000000c021', 'pgtap-oth-a1', '00000000-0000-4000-8000-00000000c011', 'diet', '레몬 스틱', 36000, 50, 'listed', 'lemon'),
       ('00000000-0000-4000-8000-00000000c022', 'pgtap-oth-a2', '00000000-0000-4000-8000-00000000c011', 'diet', '포도 젤리', 32000, 50, 'listed', 'grape'),
       ('00000000-0000-4000-8000-00000000c023', 'pgtap-oth-b1', '00000000-0000-4000-8000-00000000c012', 'diet', '셀러 B 상품', 20000, 50, 'listed', 'pill');
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount, payment_key)
values ('00000000-0000-4000-8000-00000000c031', 'pgtap-oth-1', 'PARTIAL_REFUNDED', now() - interval '5 days', '홍길동', '{}', '레몬 스틱 외', 124000, 'pk-oth');
-- a: 요청 줄(레몬) · b: 같은 셀러 포도 2개 중 1개 환불(배송 완료) · c: 같은 셀러 포도 옵션 · 열린 요청 · d: 다른 셀러
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, ship_status, refunded_qty, refund_amount, status, created_at)
values ('00000000-0000-4000-8000-00000000c041', '00000000-0000-4000-8000-00000000c031', '00000000-0000-4000-8000-00000000c021', '00000000-0000-4000-8000-00000000c011', '레몬 스틱', '', 1, 36000, 'DELIVERED', 0, 0, 'PAID', now() - interval '3 minutes'),
       ('00000000-0000-4000-8000-00000000c042', '00000000-0000-4000-8000-00000000c031', '00000000-0000-4000-8000-00000000c022', '00000000-0000-4000-8000-00000000c011', '포도 젤리', '', 2, 32000, 'DELIVERED', 1, 32000, 'PARTIAL_REFUNDED', now() - interval '2 minutes'),
       ('00000000-0000-4000-8000-00000000c043', '00000000-0000-4000-8000-00000000c031', '00000000-0000-4000-8000-00000000c022', '00000000-0000-4000-8000-00000000c011', '포도 젤리', '2개 세트', 1, 24000, 'SHIPPING', 0, 0, 'PAID', now() - interval '1 minute'),
       ('00000000-0000-4000-8000-00000000c044', '00000000-0000-4000-8000-00000000c031', '00000000-0000-4000-8000-00000000c023', '00000000-0000-4000-8000-00000000c012', '셀러 B 상품', '', 1, 20000, 'DELIVERED', 0, 0, 'PAID', now());
insert into public.myr_refund_requests (id, code, order_id, order_item_id, seller_id, product_id, kind, qty, reason, status, resolution, decided_at)
values ('00000000-0000-4000-8000-00000000c051', 'pgoth01', '00000000-0000-4000-8000-00000000c031', '00000000-0000-4000-8000-00000000c041', '00000000-0000-4000-8000-00000000c011', '00000000-0000-4000-8000-00000000c021', 'refund', 1, '오배송', 'pending', null, null),
       ('00000000-0000-4000-8000-00000000c052', 'pgoth02', '00000000-0000-4000-8000-00000000c031', '00000000-0000-4000-8000-00000000c043', '00000000-0000-4000-8000-00000000c011', '00000000-0000-4000-8000-00000000c022', 'exchange', 1, '파손 · 누액', 'progress', 'reship', now()),
       ('00000000-0000-4000-8000-00000000c053', 'pgoth03', '00000000-0000-4000-8000-00000000c031', '00000000-0000-4000-8000-00000000c044', '00000000-0000-4000-8000-00000000c012', '00000000-0000-4000-8000-00000000c023', 'refund', 1, '오배송', 'pending', null, null);

create temp table j as select r.code, public.myr_refund_request_json(r) as v from public.myr_refund_requests r where r.code like 'pgoth0%';

select is((select jsonb_agg(e ->> 'id' order by e ->> 'id') from j, jsonb_array_elements(v -> 'order' -> 'others') e where code = 'pgoth01'),
          '["00000000-0000-4000-8000-00000000c042", "00000000-0000-4000-8000-00000000c043"]'::jsonb, '레몬 요청 — 같은 셀러의 다른 줄 둘(요청 줄 · 다른 셀러 줄 제외)');
select is((select v -> 'order' -> 'others' -> 0 from j where code = 'pgoth01'),
          '{"id": "00000000-0000-4000-8000-00000000c042", "name": "포도 젤리", "option": "", "qty": 2, "amount": 64000, "refunded_qty": 1, "status": "PARTIAL_REFUNDED",
            "ship_status": "DELIVERED", "left_qty": 1, "live": true, "delivered_at": null, "claim": null}'::jsonb,
          '줄 모양 — 남은 수량 · 살아 있는 줄은 myr_line_left · myr_line_live 값 · 요청 없으면 claim null');
select is((select v -> 'order' -> 'others' -> 1 -> 'claim' from j where code = 'pgoth01'),
          '{"code": "pgoth02", "status": "progress", "kind": "exchange"}'::jsonb, '다른 줄의 열린 요청도 싣는다');
select is((select jsonb_agg(e ->> 'name') from j, jsonb_array_elements(v -> 'order' -> 'others') e where code = 'pgoth03'), null, '다른 셀러 요청 — 그 셀러 줄은 하나뿐이라 others 비어 있음(셀러 A 줄은 안 실린다)');
select is((select v -> 'order' -> 'others' from j where code = 'pgoth03'), '[]'::jsonb, '빈 배열(null 아님)');

select * from finish();
rollback;
