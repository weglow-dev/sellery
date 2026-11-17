-- pgTAP — 0118 메일 · 발주 · 배송 완료 판정을 서버에서: 크리에이터별 환불 상품 금액(myr_refund_seller_goods · precheck seller_goods) ·
--   출고 마감(myr_prepare_cutoff · 그날 KST 오전 11시 · 발주 후보가 시각을 받지 않으면 서버가 정한다) ·
--   자동 배송 완료(myr_line_auto_delivered · 배송 중이고 발송 10일 지남 · ship_line 이 택배사 완료 또는 이 함수로 정한다). 값은 0118 전 TS 와 같다.
begin;
select plan(14);

select function_privs_are('public', 'myr_refund_seller_goods', '{jsonb}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 refund_seller_goods 불가');
select function_privs_are('public', 'myr_prepare_cutoff', '{timestamptz}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 prepare_cutoff 불가');
select function_privs_are('public', 'myr_line_auto_delivered', '{myr_order_items,timestamptz}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 line_auto_delivered 불가');

-- ---------- 크리에이터별 환불 상품 금액 ----------
select is(public.myr_refund_seller_goods('[{"item_id":"a","qty":1,"amount":16000,"seller_id":"s1"},{"item_id":"b","qty":2,"amount":32000,"seller_id":"s1"},{"item_id":"c","qty":1,"amount":29000,"seller_id":"s2"}]'),
          '{"s1": 48000, "s2": 29000}'::jsonb, '크리에이터별 줄 금액 합(차감 전 · 실적에서 빠지는 금액)');
select is(public.myr_refund_seller_goods('[]'), '{}'::jsonb, '줄이 없으면 빈 객체');

-- ---------- 출고 마감 ----------
select is(array[public.myr_prepare_cutoff('2026-11-16T10:59:00+09'), public.myr_prepare_cutoff('2026-11-16T11:00:00+09'), public.myr_prepare_cutoff('2026-11-15T16:30:00Z')],
          array['2026-11-16T11:00:00+09', '2026-11-16T11:00:00+09', '2026-11-16T11:00:00+09']::timestamptz[],
          '그날 KST 오전 11시 — 10:59 · 11:00 · UTC 15일 16:30(= KST 16일 01:30)');

insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-00000000ff11', '민지 루틴', '@pgtap.fulfil', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-00000000ff21', 'pgtap-fulfil-a', '00000000-0000-4000-8000-00000000ff11', 'diet', '포도 젤리', 10000, 100, 'listed', 'grape');
-- 마감 1분 전 결제(발주 대상) · 1분 뒤 결제(다음 발주) · 송장 줄 둘(발송 11일 전 · 2일 전)
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount, payment_key)
values ('00000000-0000-4000-8000-00000000ff31', 'pgtap-fulfil-1', 'PAID', public.myr_prepare_cutoff(now()) - interval '1 minute', '김지은', '{}', '젤리', 10000, 'pk-ff-1'),
       ('00000000-0000-4000-8000-00000000ff32', 'pgtap-fulfil-2', 'PAID', public.myr_prepare_cutoff(now()) + interval '1 minute', '김지은', '{}', '젤리', 10000, 'pk-ff-2'),
       ('00000000-0000-4000-8000-00000000ff33', 'pgtap-fulfil-3', 'PAID', now() - interval '12 days', '김지은', '{}', '젤리', 30000, 'pk-ff-3');
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, ship_status, tracking_no, shipped_at, ebut_registered_at)
values ('00000000-0000-4000-8000-00000000ff41', '00000000-0000-4000-8000-00000000ff31', '00000000-0000-4000-8000-00000000ff21', '00000000-0000-4000-8000-00000000ff11', '젤리', '', 1, 10000, 'PAID', null, null, null),
       ('00000000-0000-4000-8000-00000000ff42', '00000000-0000-4000-8000-00000000ff32', '00000000-0000-4000-8000-00000000ff21', '00000000-0000-4000-8000-00000000ff11', '젤리', '', 1, 10000, 'PAID', null, null, null),
       ('00000000-0000-4000-8000-00000000ff43', '00000000-0000-4000-8000-00000000ff33', '00000000-0000-4000-8000-00000000ff21', '00000000-0000-4000-8000-00000000ff11', '젤리 A', '', 1, 10000, 'SHIPPING', '111122223333', now() - interval '11 days', now() - interval '12 days'),
       ('00000000-0000-4000-8000-00000000ff44', '00000000-0000-4000-8000-00000000ff33', '00000000-0000-4000-8000-00000000ff21', '00000000-0000-4000-8000-00000000ff11', '젤리 B', '', 1, 10000, 'SHIPPING', '444455556666', now() - interval '2 days', now() - interval '12 days'),
       ('00000000-0000-4000-8000-00000000ff45', '00000000-0000-4000-8000-00000000ff33', '00000000-0000-4000-8000-00000000ff21', '00000000-0000-4000-8000-00000000ff11', '젤리 C', '', 1, 10000, 'SHIPPING', '777788889999', now() - interval '2 days', now() - interval '12 days');

select is((select jsonb_agg(e ->> 'order_code' order by e ->> 'order_code') from jsonb_array_elements(public.myr_app_admin_prepare_candidates()) e where e ->> 'order_code' like 'pgtap-fulfil-%'),
          '["pgtap-fulfil-1"]'::jsonb, '발주 후보(시각 없이) — 서버 출고 마감 전 결제만(마감 뒤 결제는 다음 발주)');
select is((select jsonb_agg(e ->> 'order_code' order by e ->> 'order_code') from jsonb_array_elements(public.myr_app_admin_prepare_candidates(public.myr_prepare_cutoff(now()) + interval '1 hour')) e where e ->> 'order_code' like 'pgtap-fulfil-%'),
          '["pgtap-fulfil-1", "pgtap-fulfil-2"]'::jsonb, '운영이 고른 시각(수동 발주)은 그대로 쓴다');

-- ---------- 자동 배송 완료 ----------
create function pg_temp.auto(p_status text, p_shipped timestamptz) returns boolean language sql as $$
  select public.myr_line_auto_delivered(jsonb_populate_record(null::public.myr_order_items, jsonb_build_object('ship_status', p_status, 'shipped_at', p_shipped)), '2026-11-20T09:00:00Z')
$$;
select is(array[pg_temp.auto('SHIPPING', '2026-11-09T09:00:00Z'), pg_temp.auto('SHIPPING', '2026-11-10T09:00:00Z'), pg_temp.auto('SHIPPING', '2026-11-10T09:00:01Z'),
                pg_temp.auto('PREPARING', '2026-11-01T09:00:00Z'), pg_temp.auto('SHIPPING', null)],
          array[true, true, false, false, false], '배송 중 · 발송 10일 지남(11일 · 딱 10일 ○ / 10일 못 됨 · 배송준비중 · 발송 시각 없음 ×) — 0118 전 TS 와 같다');

-- ship_line — 택배사 완료가 아니어도 발송 10일 지난 줄은 배송 완료 · 2일 된 줄은 배송 중 · 택배사 완료면 배송 완료
select is(public.myr_app_admin_ship_line('00000000-0000-4000-8000-00000000ff43', null, '111122223333', false) ->> 'delivered', 'true', '발송 11일 — 택배사 완료가 아니어도 서버가 배송 완료');
select is((select jsonb_build_array(ship_status, delivered_at is not null) from public.myr_order_items where id = '00000000-0000-4000-8000-00000000ff43'), '["DELIVERED", true]'::jsonb, '배송 완료 · 배송 완료 시각 기록(정산 · 단순 변심 기한)');
select is(public.myr_app_admin_ship_line('00000000-0000-4000-8000-00000000ff44', null, '444455556666', false) ->> 'delivered', 'false', '발송 2일 — 배송 중 그대로');
select is(public.myr_app_admin_ship_line('00000000-0000-4000-8000-00000000ff45', null, '777788889999', true) ->> 'delivered', 'true', '택배사 완료(이벗 91) — 배송 완료');
select is((select jsonb_object_agg(product_name, ship_status) from public.myr_order_items where order_id = '00000000-0000-4000-8000-00000000ff33'),
          '{"젤리 A": "DELIVERED", "젤리 B": "SHIPPING", "젤리 C": "DELIVERED"}'::jsonb, '줄 상태 — A 10일 지남 · B 배송 중 · C 택배사 완료');

select * from finish();
rollback;
