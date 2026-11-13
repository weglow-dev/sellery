-- pgTAP — 교환·환불 요청의 예상 환불 금액(refundQuote) 이 기대는 precheck(0061 · 0077) 결과.
--   예상 금액(샵 신청 화면 · 콘솔 처리 방법 · 승인 메일) 과 실제 환불(refundItems) 은 같은 precheck → 차감(quoteFromPrecheck · vitest) 을 쓴다.
--   여기서는 요청 줄(배송준비중 이후)을 actor system 으로 precheck 했을 때: 마지막 줄이면 배송비 포함 · 아니면 줄만 · 고객 actor 는 셀프 환불 가드로 막힘 · 금액 계산은 읽기만.
--   MYR2087 재현: 36,000 줄 하나 + 배송비 3,000 → precheck 39,000 → 단순 변심 차감 6,000 → 33,000.
begin;
select plan(25);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000e01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-quote-cust@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active)
values ('00000000-0000-4000-8000-000000000e11', '민지 루틴', '@pgtap.quote', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-000000000e21', 'pgtap-quote-a', '00000000-0000-4000-8000-000000000e11', 'diet', '글루타치온 스틱', 36000, 50, 'listed', 'pill');
-- 주문 1: 줄 하나(배송준비중) · 배송비 3,000 — 마지막 줄
-- 주문 2: 줄 둘(배송준비중 · 배송중) · 배송비 3,000 — 한 줄만이면 배송비 없음 · 두 줄 다면 포함
insert into public.myr_orders (id, code, status, paid_at, user_id, buyer_name, shipping, order_name, items_amount, shipping_fee, payment_key)
values ('00000000-0000-4000-8000-000000000e31', 'pgtap-quote-1', 'PAID', now() - interval '2 days', '00000000-0000-4000-8000-000000000e01', '홍길동', '{"recipient":"홍길동"}', '글루타치온 스틱', 36000, 3000, 'pk-quote-1'),
       ('00000000-0000-4000-8000-000000000e32', 'pgtap-quote-2', 'PAID', now() - interval '2 days', '00000000-0000-4000-8000-000000000e01', '홍길동', '{"recipient":"홍길동"}', '글루타치온 스틱 외', 72000, 3000, 'pk-quote-2');
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, ship_status)
values ('00000000-0000-4000-8000-000000000e41', '00000000-0000-4000-8000-000000000e31', '00000000-0000-4000-8000-000000000e21', '00000000-0000-4000-8000-000000000e11', '글루타치온 스틱', '', 1, 36000, 'PREPARING'),
       ('00000000-0000-4000-8000-000000000e42', '00000000-0000-4000-8000-000000000e32', '00000000-0000-4000-8000-000000000e21', '00000000-0000-4000-8000-000000000e11', '글루타치온 스틱', '', 1, 36000, 'PREPARING'),
       ('00000000-0000-4000-8000-000000000e43', '00000000-0000-4000-8000-000000000e32', '00000000-0000-4000-8000-000000000e21', '00000000-0000-4000-8000-000000000e11', '글루타치온 스틱', '', 1, 36000, 'SHIPPING');

-- 마지막 줄 — 배송비 포함(39,000 → 차감 6,000 하면 33,000 · 콘솔 · 샵 · 실제 환불 모두 이 값)
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000e31', '[{"item_id":"00000000-0000-4000-8000-000000000e41","qty":1}]', 'system', null) ->> 'amount', '39000', '마지막 요청 줄 → 줄 36,000 + 배송비 3,000');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000e31', '[{"item_id":"00000000-0000-4000-8000-000000000e41","qty":1}]', 'system', null) ->> 'full', 'true', '마지막 줄이면 full');
-- 0105 — 차감 뒤 금액 · 토스 전액 취소 여부도 precheck 가 정한다(TS 는 읽기만)
select is((select jsonb_build_object('refund', j -> 'refund_amount', 'deduction', j -> 'deduction', 'cancel_full', j -> 'cancel_full') from (select public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000e31', '[{"item_id":"00000000-0000-4000-8000-000000000e41","qty":1}]', 'system', null, 6000) as j) s),
  '{"refund": 33000, "deduction": 6000, "cancel_full": false}'::jsonb, '차감 — 39,000 − 6,000 = 33,000 · 차감이 있으면 부분 취소(남은 돈을 남긴다)');
select is((select jsonb_build_object('refund', j -> 'refund_amount', 'deduction', j -> 'deduction', 'cancel_full', j -> 'cancel_full') from (select public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000e31', '[{"item_id":"00000000-0000-4000-8000-000000000e41","qty":1}]', 'system', null, 0) as j) s),
  '{"refund": 39000, "deduction": 0, "cancel_full": true}'::jsonb, '전액 · 차감 0(같은 묶음에서 이미 뺐을 때와 같다) → 그대로 · 토스 전액 취소');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000e31', '[{"item_id":"00000000-0000-4000-8000-000000000e41","qty":1}]', 'system', null, -1) ->> 'code', 'BAD_DEDUCTION', '음수 차감 BAD_DEDUCTION');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000e31', '[{"item_id":"00000000-0000-4000-8000-000000000e41","qty":1}]', 'system', null, 39000) ->> 'code', 'DEDUCTION_TOO_BIG', '차감이 결제 금액과 같으면(0원) DEDUCTION_TOO_BIG');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000e31', '[{"item_id":"00000000-0000-4000-8000-000000000e41","qty":1}]', 'system', null, 38999) ->> 'refund_amount', '1', '차감 뒤 1원이면 환불한다');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000e32', '[{"item_id":"00000000-0000-4000-8000-000000000e42","qty":1}]', 'system', null, 6000) ->> 'refund_amount', '30000', '부분 — 마지막 줄이 아니면 줄 금액에서만 차감(36,000 − 6,000)');
-- 다른 줄이 남은 주문 — 한 줄만이면 배송비 없음
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000e32', '[{"item_id":"00000000-0000-4000-8000-000000000e42","qty":1}]', 'system', null) ->> 'amount', '36000', '다른 줄이 남으면 줄 금액만(배송비 없음)');
-- 고른 줄이 남은 전부면(한 번에 보낸 요청) — 배송비 한 번
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000e32', '[{"item_id":"00000000-0000-4000-8000-000000000e42","qty":1},{"item_id":"00000000-0000-4000-8000-000000000e43","qty":1}]', 'system', null) ->> 'amount', '75000', '두 줄 다 → 72,000 + 배송비 3,000');
-- 앞 줄이 먼저 환불됐다면 남은 줄이 마지막 — 그때는 배송비가 붙는다(예상 금액은 환불 순간의 주문 상태)
update public.myr_order_items set refunded_qty = 1, status = 'REFUNDED' where id = '00000000-0000-4000-8000-000000000e42';
update public.myr_orders set refund_amount = 36000, status = 'PARTIAL_REFUNDED' where id = '00000000-0000-4000-8000-000000000e32';
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000e32', '[{"item_id":"00000000-0000-4000-8000-000000000e43","qty":1}]', 'system', null) ->> 'amount', '39000', '앞 줄이 환불된 뒤 남은 줄 → 배송비 포함');
-- 고객 actor 는 셀프 환불 가드(발주 전 줄만) — 요청 줄 예상 금액은 소유 확인 뒤 actor system 으로 계산한다
select isnt(public.myr_app_refund_precheck('00000000-0000-4000-8000-000000000e31', '[{"item_id":"00000000-0000-4000-8000-000000000e41","qty":1}]', 'customer', '00000000-0000-4000-8000-000000000e01') ->> 'ok', 'true', '고객 actor 로는 배송준비중 줄을 계산하지 않는다(셀프 환불 가드)');
-- 읽기만 — 예상 금액을 몇 번 계산해도 주문 · 줄은 그대로
select is((select refund_amount from public.myr_orders where id = '00000000-0000-4000-8000-000000000e31'), 0, 'precheck 는 주문 환불액을 바꾸지 않는다');
select is((select refunded_qty from public.myr_order_items where id = '00000000-0000-4000-8000-000000000e41'), 0, 'precheck 는 줄 환불 수량을 바꾸지 않는다');
-- 0090 — 요청 JSON 에 주문 배송비(콘솔 "결제 금액 − 왕복 배송비 = 환불 금액" · 주문 카드 배송비/무료배송)
select is(public.myr_app_claim_open('00000000-0000-4000-8000-000000000e31', '00000000-0000-4000-8000-000000000e01', 'refund', '단순 변심', '[{"item_id":"00000000-0000-4000-8000-000000000e41","qty":1}]') ->> 'ok', 'true', '요청 접수');
select is((select public.myr_refund_request_json(r) #>> '{order,shipping_fee}' from public.myr_refund_requests r where r.order_id = '00000000-0000-4000-8000-000000000e31'), '3000', '요청 JSON order.shipping_fee = 주문 배송비');
-- 0091 — 승인은 메시지 없이 된다(null 저장) · 반려는 필수 · 1000자 초과는 둘 다 거부
-- 크리에이터 계정(픽스처를 짧게 — 고객 계정을 크리에이터 계정으로도 쓴다)
update public.sellers set user_id = '00000000-0000-4000-8000-000000000e01' where id = '00000000-0000-4000-8000-000000000e11';
select is(public.myr_app_claim_decide((select code from public.myr_refund_requests where order_id = '00000000-0000-4000-8000-000000000e31'), '00000000-0000-4000-8000-000000000e01', 'reject', null, '  ') ->> 'code', 'BAD_MESSAGE', '반려 · 빈 메시지 → BAD_MESSAGE');
select is(public.myr_app_claim_decide((select code from public.myr_refund_requests where order_id = '00000000-0000-4000-8000-000000000e31'), '00000000-0000-4000-8000-000000000e01', 'approve', 'partial', repeat('가', 1001)) ->> 'code', 'BAD_MESSAGE', '승인 · 1000자 초과 → BAD_MESSAGE');
select is(public.myr_app_claim_decide((select code from public.myr_refund_requests where order_id = '00000000-0000-4000-8000-000000000e31'), '00000000-0000-4000-8000-000000000e01', 'approve', 'partial', '   ') ->> 'ok', 'true', '승인 · 빈 메시지 → 승인된다');
select is((select jsonb_build_object('status', status, 'message', message, 'deduction', deduction) from public.myr_refund_requests where order_id = '00000000-0000-4000-8000-000000000e31'),
  '{"status": "progress", "message": null, "deduction": 6000}'::jsonb, '메시지는 null · 처리 진행 · 차감 그대로');
-- 0105 record — 받은 금액을 같은 precheck(같은 차감)로 다시 계산해 비교 · 다르면 거절하지 않고 기록한 뒤 mismatch
select is(public.myr_app_refund_record('00000000-0000-4000-8000-000000000e31', '[{"item_id":"00000000-0000-4000-8000-000000000e41","qty":1}]', 'system', null, '단순 변심', 30000, null, 6000) - 'order_code',
  '{"ok": true, "already": false, "status": "REFUNDED", "amount": 30000, "mismatch": true, "expected": 33000, "got": 30000}'::jsonb, '금액이 다르면 mismatch(expected 33,000 · got 30,000) — 기록은 된다');
select is((select refund_amount from public.myr_orders where id = '00000000-0000-4000-8000-000000000e31'), 30000, 'mismatch 여도 받은 금액(토스에 보낸 금액)으로 기록');
-- 권한 — precheck 는 서버(service role) 전용
select function_privs_are('public', 'myr_app_refund_precheck', '{uuid,jsonb,text,uuid,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 precheck 불가');
select function_privs_are('public', 'myr_app_refund_record', '{uuid,jsonb,text,uuid,text,integer,jsonb,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 record 불가');
select is((select count(*)::int from pg_proc where proname in ('myr_app_refund_precheck', 'myr_app_refund_record')), 2, '옛 인자 버전이 남지 않았다(precheck · record 하나씩)');

select * from finish();
rollback;
