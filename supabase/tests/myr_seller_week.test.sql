-- pgTAP — 0117 콘솔 홈 "이번 주 판매": 이번 주 월 ~ 일(KST · myr_kst_week) · 아직 오지 않은 날은 0 · 주 합계 week_orders(서로 다른 주문).
--   기준 시각 2031-03-12(수) 12:00 KST — 이번 주 = 3월 10일(월) ~ 16일(일). 지난 일요일 주문은 빠진다.
begin;
select plan(5);

select function_privs_are('public', 'myr_kst_week', '{timestamptz}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 kst_week 불가');
select is(array[public.myr_kst_week('2031-03-12T12:00:00+09'), public.myr_kst_week('2031-03-16T23:59:00+09'), public.myr_kst_week('2031-03-09T23:59:00+09'), public.myr_kst_week('2031-03-09T15:30:00Z')],
          array['2031-03-10', '2031-03-10', '2031-03-03', '2031-03-10']::date[], '주의 월요일(KST) — 수 · 일요일 밤은 그 주 · 지난 일요일은 지난주 · UTC 일요일 15:30 = KST 월요일 0:30');

insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-00000000fe61', '민지 루틴', '@pgtap.week', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-00000000fe71', 'pgtap-week-a', '00000000-0000-4000-8000-00000000fe61', 'diet', '포도 젤리', 10000, 100, 'listed', 'grape');
-- 지난 일요일 밤 1건(빠짐) · 월요일 1건 · 수요일 2건(한 주문은 두 줄)
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount, payment_key)
values ('00000000-0000-4000-8000-00000000fe81', 'pgtap-week-1', 'PAID', '2031-03-09T23:30:00+09', '김지은', '{}', '젤리', 10000, 'pk-week-1'),
       ('00000000-0000-4000-8000-00000000fe82', 'pgtap-week-2', 'PAID', '2031-03-10T09:00:00+09', '김지은', '{}', '젤리', 10000, 'pk-week-2'),
       ('00000000-0000-4000-8000-00000000fe83', 'pgtap-week-3', 'PAID', '2031-03-12T08:00:00+09', '김지은', '{}', '젤리', 20000, 'pk-week-3'),
       ('00000000-0000-4000-8000-00000000fe84', 'pgtap-week-4', 'PAID', '2031-03-12T11:00:00+09', '김지은', '{}', '젤리', 10000, 'pk-week-4');
insert into public.myr_order_items (order_id, product_id, seller_id, product_name, option_name, qty, unit_price)
values ('00000000-0000-4000-8000-00000000fe81', '00000000-0000-4000-8000-00000000fe71', '00000000-0000-4000-8000-00000000fe61', '젤리', '', 1, 10000),
       ('00000000-0000-4000-8000-00000000fe82', '00000000-0000-4000-8000-00000000fe71', '00000000-0000-4000-8000-00000000fe61', '젤리', '', 1, 10000),
       ('00000000-0000-4000-8000-00000000fe83', '00000000-0000-4000-8000-00000000fe71', '00000000-0000-4000-8000-00000000fe61', '젤리 A', '', 1, 10000),
       ('00000000-0000-4000-8000-00000000fe83', '00000000-0000-4000-8000-00000000fe71', '00000000-0000-4000-8000-00000000fe61', '젤리 B', '', 1, 10000),
       ('00000000-0000-4000-8000-00000000fe84', '00000000-0000-4000-8000-00000000fe71', '00000000-0000-4000-8000-00000000fe61', '젤리', '', 1, 10000);

create temp table _s on commit drop as select public.myr_app_seller_sales('00000000-0000-4000-8000-00000000fe61', '2031-03-12T12:00:00+09') as v;
select is((select jsonb_agg(e ->> 'date' order by e ->> 'date') from _s, jsonb_array_elements(_s.v -> 'week') e),
          '["2031-03-10", "2031-03-11", "2031-03-12", "2031-03-13", "2031-03-14", "2031-03-15", "2031-03-16"]'::jsonb, '이번 주 월 ~ 일 7일(요일 순서 고정)');
select is((select jsonb_agg((e ->> 'orders')::int order by e ->> 'date') from _s, jsonb_array_elements(_s.v -> 'week') e),
          '[1, 0, 2, 0, 0, 0, 0]'::jsonb, '날짜별 주문 — 월 1 · 수 2(두 줄 주문도 1건) · 아직 오지 않은 목 ~ 일은 0 · 지난 일요일 주문은 빠진다');
select is((select (v ->> 'week_orders')::int from _s), 3, '이번 주 주문 3건(서로 다른 주문 · 날짜별 합과 같다)');

select * from finish();
rollback;
