-- pgTAP — 0115 샵 화면 숫자를 서버 견적에서: 결제 금액(myr_pay_amount) · 재고 초과(myr_stock_short) · 한 번에 결제할 줄 수(myr_checkout_lines_max · _over).
--   견적(장바구니 · 상품 페이지)과 결제 생성(BAD_LINES · SOLD_OUT)이 같은 함수를 쓰는지 고정한다.
begin;
select plan(16);

select function_privs_are('public', 'myr_pay_amount', '{bigint,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 pay_amount 불가');
select function_privs_are('public', 'myr_stock_short', '{integer,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 stock_short 불가');
select function_privs_are('public', 'myr_checkout_lines_max', '{}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 checkout_lines_max 불가');
select function_privs_are('public', 'myr_checkout_lines_over', '{integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 checkout_lines_over 불가');

insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-00000000fe11', '민지 루틴', '@pgtap.shopq', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon, options)
values ('00000000-0000-4000-8000-00000000fe21', 'pgtap-sq2-a', '00000000-0000-4000-8000-00000000fe11', 'diet', '레몬 스틱', 36000, 5, 'listed', 'pill', '[]'::jsonb);

-- ---------- 함수 ----------
select is(public.myr_pay_amount(47000, 3000), 50000::bigint, '결제 금액 = 상품 합계 + 배송비');
select is(array[public.myr_stock_short(5, 6), public.myr_stock_short(5, 5), public.myr_stock_short(0, 1), public.myr_stock_short(null, 1)], array[true, false, true, false],
          '재고가 모자란지 — 남은 수량 < 필요 수량(모르면 false)');
select is(array[public.myr_checkout_lines_max()::text, public.myr_checkout_lines_over(20)::text, public.myr_checkout_lines_over(21)::text], array['20', 'false', 'true'],
          '한 번에 결제할 줄 수 20 · 20줄 통과 · 21줄 넘음');

-- ---------- 견적 — 결제 금액 · 무료배송 기준 · 줄 수 한도 ----------
select is(public.myr_app_cart_quote('[{"code":"pgtap-sq2-a","qty":1}]') - 'lines',
          '{"ok": true, "amount": 39000, "free_over": 50000, "lines_max": 20, "lines_over": false, "items_amount": 36000, "shipping_fee": 3000, "free_shipping_left": 14000}'::jsonb,
          '견적 1개 — 결제 금액 39,000(상품 36,000 + 배송비 3,000) · 무료배송 기준 5만 · 줄 수 한도 20');
select is((select (q ->> 'amount')::bigint = (q ->> 'items_amount')::bigint + (q ->> 'shipping_fee')::bigint from (select public.myr_app_cart_quote('[{"code":"pgtap-sq2-a","qty":2}]') q) x), true,
          '견적 2개 — amount = 상품 합계 + 배송비(결제 표 amount 생성 칸과 같은 식)');
select is(public.myr_app_cart_quote('[{"code":"pgtap-sq2-a","qty":2}]') ->> 'amount', '72000', '견적 2개 — 7.2만은 무료배송이라 결제 금액 72,000');
select is((select jsonb_agg(public.myr_app_cart_quote(jsonb_build_array(jsonb_build_object('code', 'pgtap-sq2-a', 'qty', n))) #> '{lines,0,over_stock}' order by n) from unnest(array[5, 6]) n),
          '[false, true]'::jsonb, '견적 줄 over_stock — 5개(남은 수량) false · 6개 true');
select is(public.myr_app_cart_quote('[{"code":"pgtap-sq2-none","qty":1}]') #> '{lines,0,over_stock}', 'null'::jsonb, '샵에 없는 줄은 over_stock null(살 수 없음)');
select is(public.myr_app_cart_quote((select jsonb_agg(jsonb_build_object('code', 'pgtap-sq2-x' || g, 'qty', 1)) from generate_series(1, 21) g)) ->> 'lines_over', 'true',
          '견적 21줄 — lines_over true(견적은 50줄까지 받는다)');

-- ---------- 결제 생성 — 같은 함수로 거절 ----------
select is(public.myr_app_create_checkout(null, null, '{"name":"A"}'::jsonb, '{"recipient":"A","address1":"서울"}'::jsonb,
          (select jsonb_agg(jsonb_build_object('code', 'pgtap-sq2-x' || g, 'qty', 1)) from generate_series(1, 21) g), 'myr_sq2_000001') ->> 'code',
          'BAD_LINES', '결제 21줄 — BAD_LINES(견적 lines_over 와 같은 함수)');
select isnt(public.myr_app_create_checkout(null, null, '{"name":"A"}'::jsonb, '{"recipient":"A","address1":"서울"}'::jsonb,
          (select jsonb_agg(jsonb_build_object('code', 'pgtap-sq2-x' || g, 'qty', 1)) from generate_series(1, 20) g), 'myr_sq2_000002') ->> 'code',
          'BAD_LINES', '결제 20줄 — 줄 수로는 막지 않는다');
select is(public.myr_app_create_checkout(null, null, '{"name":"A"}'::jsonb, '{"recipient":"A","address1":"서울"}'::jsonb,
          '[{"code":"pgtap-sq2-a","qty":6}]', 'myr_sq2_000003') #>> '{items,0,reason}',
          'SOLD_OUT', '결제 6개(남은 수량 5) — SOLD_OUT(견적 over_stock 과 같은 함수)');

select * from finish();
rollback;
