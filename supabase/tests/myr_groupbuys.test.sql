-- pgTAP — 0086 공구 링크: 권한 · 공구가 · 만들기 거부 코드 · 상태 · 링크 조회 · 장바구니 · 체크아웃(공구가 · PRICE_CHANGED · 고정) · 지금 종료 · 주문 복사 · 실적 · 주문 표시
-- 실행: npm run test:db — 트랜잭션 안에서 돌고 롤백된다. 트랜잭션 안의 now() 는 고정이라 "지난 시각으로 시작 = 지금부터 진행 중" 이다.
begin;
select plan(57);

-- ---------- 표 · 권한 ----------
select has_table('public', 'myr_groupbuys', 'myr_groupbuys 표');
select ok((select relrowsecurity from pg_class where oid = 'public.myr_groupbuys'::regclass), 'myr_groupbuys RLS on');
select table_privs_are('public', 'myr_groupbuys', 'anon', '{}'::text[], 'anon 은 공구 표 직접 권한 없음');
select table_privs_are('public', 'myr_groupbuys', 'authenticated', '{}'::text[], 'authenticated 도 공구 표 직접 권한 없음');
select function_privs_are('public', 'myr_groupbuy_lookup', '{text}'::text[], 'anon', '{}'::text[], 'anon 은 groupbuy_lookup 불가');
select function_privs_are('public', 'myr_groupbuy_lookup', '{text}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 groupbuy_lookup 가능');
select function_privs_are('public', 'myr_app_seller_groupbuy_create', '{uuid,uuid,integer,timestamptz,timestamptz}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 groupbuy_create 불가');
select function_privs_are('public', 'myr_app_seller_groupbuy_create', '{uuid,uuid,integer,timestamptz,timestamptz}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 groupbuy_create 가능');
select function_privs_are('public', 'myr_app_seller_groupbuy_close', '{uuid,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 groupbuy_close 불가');
select function_privs_are('public', 'myr_app_seller_groupbuys', '{uuid,uuid}'::text[], 'anon', '{}'::text[], 'anon 은 seller_groupbuys 불가');
select function_privs_are('public', 'myr_groupbuy_price', '{integer,integer}'::text[], 'anon', '{}'::text[], 'anon 은 groupbuy_price 불가');

-- ---------- 공구가 = 기본가 × (100 − pct)% · 10원 아래 버림 ----------
select is(array[public.myr_groupbuy_price(32000, 20), public.myr_groupbuy_price(33333, 15), public.myr_groupbuy_price(990, 70), public.myr_groupbuy_price(100, 1)],
          array[25600, 28330, 290, 90], '공구가 — 25,600 · 28,330 · 290 · 90');

-- ---------- 픽스처 ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000f81', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-gb-a@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-000000000f82', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-gb-buyer@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id)
values ('00000000-0000-4000-8000-000000000f91', '민지 루틴', '@pgtap.gb1', 'instagram', true, '00000000-0000-4000-8000-000000000f81'),
       ('00000000-0000-4000-8000-000000000f92', '하루 웰', '@pgtap.gb2', 'instagram', true, null);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-000000000fa1', 'pgtap-gb-a', '00000000-0000-4000-8000-000000000f91', 'diet', '포도 젤리', 32000, 50, 'listed', 'grape'),
       ('00000000-0000-4000-8000-000000000fa2', 'pgtap-gb-b', '00000000-0000-4000-8000-000000000f91', 'diet', '레몬 스틱', 20000, 50, 'listed', 'lemon'),
       ('00000000-0000-4000-8000-000000000fa3', 'pgtap-gb-pending', '00000000-0000-4000-8000-000000000f91', 'diet', '심사 중', 10000, 50, 'pending', 'pill'),
       ('00000000-0000-4000-8000-000000000fa4', 'pgtap-gb-other', '00000000-0000-4000-8000-000000000f92', 'diet', '콜라겐 필름', 28000, 50, 'listed', 'film'),
       ('00000000-0000-4000-8000-000000000fa5', 'pgtap-gb-soldout', '00000000-0000-4000-8000-000000000f91', 'diet', '품절 젤리', 30000, 0, 'listed', 'jelly');

create temp table s (k text primary key, v jsonb);
create function pg_temp.mk(p_product text, p_pct integer, p_starts timestamptz, p_ends timestamptz) returns jsonb language sql as $$
  select public.myr_app_seller_groupbuy_create('00000000-0000-4000-8000-000000000f91', p_product::uuid, p_pct, p_starts, p_ends)
$$;
create function pg_temp.ck(p_toss text, p_lines jsonb) returns jsonb language sql as $$
  select public.myr_app_create_checkout(null, null, '{"name":"김지은"}', '{"recipient":"김지은","address1":"서울"}', p_lines, p_toss, null)
$$;

-- ---------- 만들기 — 거부 ----------
select is(public.myr_app_seller_groupbuy_create('00000000-0000-4000-8000-000000000f92', '00000000-0000-4000-8000-000000000fa1', 20, now(), now() + interval '3 days') ->> 'code', 'NOT_FOUND', '남의 상품은 NOT_FOUND');
select is(pg_temp.mk('00000000-0000-4000-8000-000000000fa3', 20, now(), now() + interval '3 days') ->> 'code', 'NOT_LISTED', '판매 중이 아닌 상품은 NOT_LISTED');
select is(pg_temp.mk('00000000-0000-4000-8000-000000000fa5', 20, now(), now() + interval '3 days') ->> 'code', 'SOLD_OUT', '품절(재고 0)은 SOLD_OUT');
select is(public.myr_app_seller_groupbuys('00000000-0000-4000-8000-000000000f91', '00000000-0000-4000-8000-000000000fa5') #>> '{product,sold_out}', 'true', '공구 목록의 상품에 품절 표시');
select is(pg_temp.mk('00000000-0000-4000-8000-000000000fa1', 0, now(), now() + interval '3 days') ->> 'code', 'BAD_PCT', '할인율 0 은 BAD_PCT');
select is(pg_temp.mk('00000000-0000-4000-8000-000000000fa1', 71, now(), now() + interval '3 days') ->> 'code', 'BAD_PCT', '할인율 71 은 BAD_PCT (최대 70)');
select is(pg_temp.mk('00000000-0000-4000-8000-000000000fa1', 20, now() + interval '2 days', now() + interval '1 day') ->> 'code', 'BAD_PERIOD', '종료가 시작보다 앞이면 BAD_PERIOD');
select is(pg_temp.mk('00000000-0000-4000-8000-000000000fa1', 20, now() - interval '3 days', now() - interval '1 day') ->> 'code', 'BAD_PERIOD', '이미 끝난 기간은 BAD_PERIOD');

-- ---------- 만들기 — 진행 중(지난 시각 시작 = 지금부터) · 예정 ----------
insert into s values ('a', pg_temp.mk('00000000-0000-4000-8000-000000000fa1', 20, now() - interval '1 hour', now() + interval '3 days'));
select ok((select (v ->> 'ok')::boolean from s where k = 'a'), '공구 만들기 — ok');
select is((select v #>> '{groupbuy,state}' from s where k = 'a'), 'active', '지난 시각으로 시작하면 지금부터 진행 중');
select is((select (v #>> '{groupbuy,starts_at}')::timestamptz from s where k = 'a'), now(), '시작 = 지금으로 당겨진다');
select is((select (v #>> '{groupbuy,price}')::int from s where k = 'a'), 25600, '공구가 25,600');
select ok((select v #>> '{groupbuy,code}' from s where k = 'a') ~ '^[a-z0-9]{6,16}$', '링크 코드 형식');
select is(pg_temp.mk('00000000-0000-4000-8000-000000000fa1', 10, now(), now() + interval '5 days') ->> 'code', 'ALREADY_OPEN', '진행 중인 공구가 있으면 ALREADY_OPEN');
insert into s values ('b', pg_temp.mk('00000000-0000-4000-8000-000000000fa2', 30, now() + interval '1 day', now() + interval '4 days'));
select is((select v #>> '{groupbuy,state}' from s where k = 'b'), 'scheduled', '시작 전이면 예정');
select is(pg_temp.mk('00000000-0000-4000-8000-000000000fa2', 10, now() + interval '5 days', now() + interval '6 days') ->> 'code', 'ALREADY_OPEN', '예정된 공구가 있어도 ALREADY_OPEN');

-- ---------- 링크 조회 ----------
select is(public.myr_groupbuy_lookup(upper((select v #>> '{groupbuy,code}' from s where k = 'a'))) ->> 'product_code', 'pgtap-gb-a', '링크 → 상품 code (대소문자 무관)');
select is(public.myr_groupbuy_lookup((select v #>> '{groupbuy,code}' from s where k = 'a')) #>> '{groupbuy,price}', '25600', '링크 → 공구가');
select is(public.myr_groupbuy_lookup('zzzzzzzz'), null, '없는 링크는 null');

-- ---------- 장바구니 ----------
select is(public.myr_cart_set('00000000-0000-4000-8000-000000000f82', 'pgtap-gb-a', 0, 1, false, (select v #>> '{groupbuy,code}' from s where k = 'a')) ->> 'ok', 'true', '공구 코드로 담기');
select is((select e #>> '{groupbuy,price}' from jsonb_array_elements(public.myr_cart_get('00000000-0000-4000-8000-000000000f82')) e where e ->> 'code' = 'pgtap-gb-a'), '25600', '장바구니 줄에 공구가');
select is(public.myr_cart_set('00000000-0000-4000-8000-000000000f82', 'pgtap-gb-a', 0, 1, true) ->> 'qty', '2', '코드 없이 다시 담기 — 수량만 더한다');
select is((select e #>> '{groupbuy,state}' from jsonb_array_elements(public.myr_cart_get('00000000-0000-4000-8000-000000000f82')) e where e ->> 'code' = 'pgtap-gb-a'), 'active', '코드 없이 다시 담아도 공구는 그대로');
select is(public.myr_cart_set('00000000-0000-4000-8000-000000000f82', 'pgtap-gb-other', 0, 1, false, (select v #>> '{groupbuy,code}' from s where k = 'a')) ->> 'ok', 'true', '다른 상품의 공구 코드 — 담기는 된다');
select is((select e -> 'groupbuy' from jsonb_array_elements(public.myr_cart_get('00000000-0000-4000-8000-000000000f82')) e where e ->> 'code' = 'pgtap-gb-other'), 'null'::jsonb, '다른 상품의 공구 코드는 버린다(기본가)');

-- ---------- 체크아웃 ----------
select is(pg_temp.ck('myr_pgtapgb_bad', jsonb_build_array(jsonb_build_object('code', 'pgtap-gb-a', 'qty', 1, 'gb', 'NOT A CODE'))) ->> 'code', 'BAD_LINES', '공구 코드 형식이 틀리면 BAD_LINES');
select is(pg_temp.ck('myr_pgtapgb_c1', jsonb_build_array(jsonb_build_object('code', 'pgtap-gb-a', 'qty', 1, 'gb', (select v #>> '{groupbuy,code}' from s where k = 'a'), 'price', 32000))),
          '{"ok": false, "code": "PRICE_CHANGED", "items": [{"now": 25600, "was": 32000, "code": "pgtap-gb-a", "groupbuy": "active", "option_index": 0}]}'::jsonb,
          '화면 단가가 다르면 PRICE_CHANGED (공구 적용)');
select is(pg_temp.ck('myr_pgtapgb_c2', jsonb_build_array(jsonb_build_object('code', 'pgtap-gb-a', 'qty', 1, 'price', 25600))) #> '{items,0}',
          '{"now": 32000, "was": 25600, "code": "pgtap-gb-a", "groupbuy": null, "option_index": 0}'::jsonb, '공구 코드 없이 공구가를 보내면 기본가로 PRICE_CHANGED');
select is(pg_temp.ck('myr_pgtapgb_c3', jsonb_build_array(jsonb_build_object('code', 'pgtap-gb-b', 'qty', 1, 'gb', (select v #>> '{groupbuy,code}' from s where k = 'b'), 'price', 14000))) #> '{items,0}',
          '{"now": 20000, "was": 14000, "code": "pgtap-gb-b", "groupbuy": "inactive", "option_index": 0}'::jsonb, '예정 공구는 아직 기본가 — inactive');
select is((select count(*)::int from public.myr_checkouts where toss_order_id like 'myr_pgtapgb_c%'), 0, 'PRICE_CHANGED 면 결제 건을 만들지 않는다');
insert into s values ('c', pg_temp.ck('myr_pgtapgb_ok', jsonb_build_array(jsonb_build_object('code', 'pgtap-gb-a', 'qty', 1, 'gb', (select v #>> '{groupbuy,code}' from s where k = 'a'), 'price', 25600))));
select is((select (v #>> '{checkout,items_amount}')::int from s where k = 'c'), 25600, '공구가로 결제 건 — 25,600');
select is((select g.code from public.myr_checkout_items ci join public.myr_checkouts c on c.id = ci.checkout_id join public.myr_groupbuys g on g.id = ci.groupbuy_id
            where c.toss_order_id = 'myr_pgtapgb_ok'), (select v #>> '{groupbuy,code}' from s where k = 'a'), '결제 건 줄에 공구 기록');
select is(pg_temp.ck('myr_pgtapgb_np', jsonb_build_array(jsonb_build_object('code', 'pgtap-gb-a', 'qty', 1, 'gb', (select v #>> '{groupbuy,code}' from s where k = 'a')))) #>> '{checkout,items_amount}', '25600', 'price 없이 보내면 비교하지 않는다');

-- ---------- 지금 종료 ----------
select is(public.myr_app_seller_groupbuy_close('00000000-0000-4000-8000-000000000f92', (select v #>> '{groupbuy,code}' from s where k = 'a')) ->> 'code', 'NOT_FOUND', '남의 공구는 NOT_FOUND');
select is(public.myr_app_seller_groupbuy_close('00000000-0000-4000-8000-000000000f91', (select v #>> '{groupbuy,code}' from s where k = 'a')) #>> '{groupbuy,state}', 'ended', '지금 종료 — ended');
select is(public.myr_app_seller_groupbuy_close('00000000-0000-4000-8000-000000000f91', (select v #>> '{groupbuy,code}' from s where k = 'a')) ->> 'code', 'ALREADY_ENDED', '다시 종료하면 ALREADY_ENDED');
select is(pg_temp.ck('myr_pgtapgb_c4', jsonb_build_array(jsonb_build_object('code', 'pgtap-gb-a', 'qty', 1, 'gb', (select v #>> '{groupbuy,code}' from s where k = 'a'), 'price', 25600))) #> '{items,0}',
          '{"now": 32000, "was": 25600, "code": "pgtap-gb-a", "groupbuy": "inactive", "option_index": 0}'::jsonb, '끝난 공구로 결제하면 기본가 — PRICE_CHANGED');
select is(pg_temp.mk('00000000-0000-4000-8000-000000000fa1', 10, now(), now() + interval '2 days') ->> 'ok', 'true', '끝나면 새 공구를 만들 수 있다');

-- ---------- 결제 건을 만든 때의 단가로 고정 · 주문 줄 복사 ----------
select is(public.myr_app_confirm_checkout((select id from public.myr_checkouts where toss_order_id = 'myr_pgtapgb_ok'), 'pk_pgtapgb_ok',
            jsonb_build_object('status', 'DONE', 'orderId', 'myr_pgtapgb_ok', 'totalAmount', (select amount from public.myr_checkouts where toss_order_id = 'myr_pgtapgb_ok'),
                               'paymentKey', 'pk_pgtapgb_ok', 'method', '카드', 'approvedAt', now())) ->> 'ok', 'true', '공구가 끝난 뒤 승인 — 결제 건 단가 그대로 주문');
select is((select i.unit_price from public.myr_order_items i join public.myr_orders o on o.id = i.order_id join public.myr_checkouts c on c.id = o.checkout_id where c.toss_order_id = 'myr_pgtapgb_ok'),
          25600, '주문 줄 단가 = 공구가');
select ok((select i.groupbuy_id is not null from public.myr_order_items i join public.myr_orders o on o.id = i.order_id join public.myr_checkouts c on c.id = o.checkout_id where c.toss_order_id = 'myr_pgtapgb_ok'),
          '주문 줄에 공구 기록');

-- ---------- 실적 · 목록 · 주문 표시 ----------
select is((select e -> 'stats' from jsonb_array_elements(public.myr_app_seller_groupbuys('00000000-0000-4000-8000-000000000f91', '00000000-0000-4000-8000-000000000fa1') -> 'items') e
            where e ->> 'code' = (select v #>> '{groupbuy,code}' from s where k = 'a')),
          '{"net": 25600, "units": 1, "orders": 1}'::jsonb, '공구 실적 — 주문 1 · 수량 1 · 매출 25,600');
select is(jsonb_array_length(public.myr_app_seller_groupbuys('00000000-0000-4000-8000-000000000f91', '00000000-0000-4000-8000-000000000fa1') -> 'items'), 2, '지난 공구도 목록에 남는다');
select is(public.myr_app_seller_groupbuys('00000000-0000-4000-8000-000000000f92', '00000000-0000-4000-8000-000000000fa1'), null, '남의 상품 공구 목록은 null');
select is((select e #>> '{items,0,groupbuy}' from jsonb_array_elements(public.myr_app_seller_orders('00000000-0000-4000-8000-000000000f91')) e
            where e ->> 'code' = (select o.code from public.myr_orders o join public.myr_checkouts c on c.id = o.checkout_id where c.toss_order_id = 'myr_pgtapgb_ok')),
          'true', '주문 줄에 공구 표시');

select * from finish();
rollback;
