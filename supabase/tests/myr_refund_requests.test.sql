-- pgTAP — 0078 교환·환불 요청: 권한 · 요청 남기기(가드 · 사진 · 줄마다 하나) · 크리에이터 목록 · 승인/반려(처리 방법 · 할 일 · 차감) ·
--         회수 확인 · 환불 기록 · 재발송 송장 · 완료 판정 · 환불 재시도 대상 · 고아 사진 (docs/myr.md §4.2.1 7번)
begin;
select plan(90);

-- ---------- 권한 ----------
select function_privs_are('public', 'myr_app_claim_open', '{uuid,uuid,text,text,jsonb}'::text[], 'anon', '{}'::text[], 'anon 은 claim_open 불가');
select function_privs_are('public', 'myr_app_claim_open', '{uuid,uuid,text,text,jsonb}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 claim_open 불가');
select function_privs_are('public', 'myr_app_claims_for_order', '{uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 claims_for_order 불가');
select function_privs_are('public', 'myr_app_seller_claims_of_user', '{uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 seller_claims_of_user 불가');
select function_privs_are('public', 'myr_app_seller_claim_of_user', '{uuid,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 seller_claim_of_user 불가');
select function_privs_are('public', 'myr_app_seller_claims_waiting_of_user', '{uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 claims_waiting 불가');
select function_privs_are('public', 'myr_app_claim_decide', '{text,uuid,text,text,text}'::text[], 'anon', '{}'::text[], 'anon 은 claim_decide 불가');
select function_privs_are('public', 'myr_app_claim_decide', '{text,uuid,text,text,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 claim_decide 불가');
select function_privs_are('public', 'myr_app_claim_refunded', '{text,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 claim_refunded 불가');
select function_privs_are('public', 'myr_app_claims_refund_due', '{interval,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 claims_refund_due 불가');
select function_privs_are('public', 'myr_app_admin_claims', '{boolean}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 admin_claims 불가');
select function_privs_are('public', 'myr_app_admin_claim_collected', '{text}'::text[], 'anon', '{}'::text[], 'anon 은 claim_collected 불가');
select function_privs_are('public', 'myr_app_admin_claim_collected', '{text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 claim_collected 불가');
select function_privs_are('public', 'myr_app_admin_claim_reship', '{text,text,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 claim_reship 불가');
select function_privs_are('public', 'myr_app_claim_open', '{uuid,uuid,text,text,jsonb}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 claim_open 가능');
select function_privs_are('public', 'myr_app_claims_of_user', '{uuid,integer}'::text[], 'anon', '{}'::text[], 'anon 은 claims_of_user 불가');
select function_privs_are('public', 'myr_app_claims_of_user', '{uuid,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 claims_of_user 불가');

-- ---------- 픽스처 ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-000000000f81', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-rq-a@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-000000000f82', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-rq-b@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-000000000f83', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-rq-cust@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id)
values ('00000000-0000-4000-8000-000000000f91', '민지 루틴', '@pgtap.rq1', 'instagram', true, '00000000-0000-4000-8000-000000000f81'),
       ('00000000-0000-4000-8000-000000000f92', '하루 웰', '@pgtap.rq2', 'instagram', true, '00000000-0000-4000-8000-000000000f82');
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-000000000fa1', 'pgtap-rq-a', '00000000-0000-4000-8000-000000000f91', 'diet', '포도 젤리', 32000, 50, 'listed', 'grape'),
       ('00000000-0000-4000-8000-000000000fa2', 'pgtap-rq-b', '00000000-0000-4000-8000-000000000f92', 'diet', '작은 구미', 5000, 50, 'listed', 'pill');
insert into public.myr_orders (id, code, status, paid_at, user_id, buyer_name, buyer_phone, shipping, order_name, items_amount, payment_key)
values ('00000000-0000-4000-8000-000000000fb1', 'pgtap-rq-1', 'PAID', now() - interval '5 days', '00000000-0000-4000-8000-000000000f83', '홍길동', '010-1234-5678', '{"recipient":"홍길동"}', '포도 젤리 외', 165000, 'pk-rq'),
       ('00000000-0000-4000-8000-000000000fb2', 'pgtap-rq-2', 'WAITING_DEPOSIT', null, '00000000-0000-4000-8000-000000000f83', '홍길동', null, '{"recipient":"홍길동"}', '포도 젤리', 32000, null);
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, ship_status)
values ('00000000-0000-4000-8000-000000000fc1', '00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000fa1', '00000000-0000-4000-8000-000000000f91', '포도 젤리', '', 2, 32000, 'PREPARING'),
       ('00000000-0000-4000-8000-000000000fc2', '00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000fa1', '00000000-0000-4000-8000-000000000f91', '포도 젤리', '', 1, 32000, 'PAID'),
       ('00000000-0000-4000-8000-000000000fc3', '00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000fa2', '00000000-0000-4000-8000-000000000f92', '작은 구미', '', 1, 5000, 'SHIPPING'),
       ('00000000-0000-4000-8000-000000000fc4', '00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000fa1', '00000000-0000-4000-8000-000000000f91', '포도 젤리', '', 1, 32000, 'DELIVERED'),
       ('00000000-0000-4000-8000-000000000fc5', '00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000fa1', '00000000-0000-4000-8000-000000000f91', '포도 젤리', '', 1, 32000, 'SHIPPING'),
       ('00000000-0000-4000-8000-000000000fc6', '00000000-0000-4000-8000-000000000fb2', '00000000-0000-4000-8000-000000000fa1', '00000000-0000-4000-8000-000000000f91', '포도 젤리', '', 1, 32000, 'PAID');

create temp table ph as select
  '00000000-0000-4000-8000-000000000fb1/00000000-0000-4000-8000-000000000fc5/00000000-0000-4000-8000-0000000000a1.jpg'::text as c5,
  '00000000-0000-4000-8000-000000000fb1/00000000-0000-4000-8000-000000000fc4/00000000-0000-4000-8000-0000000000a2.png'::text as c4,
  '00000000-0000-4000-8000-000000000fb1/00000000-0000-4000-8000-000000000fc1/00000000-0000-4000-8000-0000000000a3.jpg'::text as c1;
create temp table rq (k text primary key, code text);

-- ---------- 요청 남기기 — 거부 ----------
select is(public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f83', 'swap', '단순 변심', '[]') ->> 'code', 'BAD_KIND', 'BAD_KIND');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f83', 'refund', '그냥', '[]') ->> 'code', 'BAD_REASON', 'BAD_REASON');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f83', 'exchange', '단순 변심', '[]') ->> 'code', 'EXCHANGE_NOT_ALLOWED', '단순 변심은 교환 불가 EXCHANGE_NOT_ALLOWED');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f81', 'refund', '단순 변심', '[{"item_id":"00000000-0000-4000-8000-000000000fc1","qty":1}]') ->> 'code', 'NOT_FOUND', '남의 주문 NOT_FOUND');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb2', '00000000-0000-4000-8000-000000000f83', 'refund', '단순 변심', '[{"item_id":"00000000-0000-4000-8000-000000000fc6","qty":1}]') ->> 'code', 'WRONG_STATUS', '입금 대기 주문 WRONG_STATUS');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f83', 'refund', '단순 변심', '[]') ->> 'code', 'NOTHING', '줄 없음 NOTHING');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f83', 'refund', '단순 변심', '[{"item_id":"00000000-0000-4000-8000-000000000fc2","qty":1}]') -> 'items' -> 0 ->> 'reason', 'NOT_PREPARED', '결제완료(발주 전) 줄은 요청이 아니라 셀프 환불 NOT_PREPARED');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f83', 'refund', '단순 변심', '[{"item_id":"00000000-0000-4000-8000-000000000fc1","qty":3}]') -> 'items' -> 0 ->> 'reason', 'TOO_MANY', '남은 수량 초과 TOO_MANY');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f83', 'exchange', '파손 · 누액', '[{"item_id":"00000000-0000-4000-8000-000000000fc5","qty":1}]') -> 'items' -> 0 ->> 'reason', 'PHOTO_REQUIRED', '파손 · 누액은 사진 필수 PHOTO_REQUIRED');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f83', 'exchange', '파손 · 누액', jsonb_build_array(jsonb_build_object('item_id', '00000000-0000-4000-8000-000000000fc5', 'qty', 1, 'photos', jsonb_build_array((select c4 from ph))))) -> 'items' -> 0 ->> 'reason', 'BAD_PHOTOS', '다른 줄 경로의 사진 BAD_PHOTOS');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f83', 'refund', '단순 변심', '[{"item_id":"00000000-0000-4000-8000-000000000fc1","qty":1},{"item_id":"00000000-0000-4000-8000-000000000fc2","qty":1}]') ->> 'code', 'BAD_ITEMS', '한 줄이라도 걸리면 BAD_ITEMS');
select is((select count(*)::int from public.myr_refund_requests where order_id = '00000000-0000-4000-8000-000000000fb1'), 0, '거부되면 아무 요청도 만들지 않는다');

-- ---------- 요청 남기기 — 성공 ----------
insert into rq select 'rc1', public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f83', 'refund', '단순 변심',
  '[{"item_id":"00000000-0000-4000-8000-000000000fc1","qty":1,"note":"  미개봉이에요\n포장 그대로 있어요 💚  "}]') #>> '{requests,0,code}';
select ok((select code from rq where k = 'rc1') ~ '^rq\d+$', '단순 변심 환불 요청 → rq 코드');
select is((select jsonb_build_object('status', status, 'note', note, 'qty', qty) from public.myr_refund_requests where code = (select code from rq where k = 'rc1')),
  '{"status": "pending", "note": "미개봉이에요\n포장 그대로 있어요 💚", "qty": 1}'::jsonb, '처리 대기 · 상세는 앞뒤 공백만 정리 · 줄바꿈 · 이모지 그대로');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f83', 'refund', '단순 변심', '[{"item_id":"00000000-0000-4000-8000-000000000fc1","qty":1}]') -> 'items' -> 0 ->> 'reason', 'OPEN_EXISTS', '같은 줄에 진행 중인 요청이 있으면 OPEN_EXISTS');
insert into rq select 'rc5', public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f83', 'exchange', '파손 · 누액',
  jsonb_build_array(jsonb_build_object('item_id', '00000000-0000-4000-8000-000000000fc5', 'qty', 1, 'photos', jsonb_build_array((select c5 from ph))))) #>> '{requests,0,code}';
insert into rq select 'rc4', public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f83', 'refund', '오배송',
  jsonb_build_array(jsonb_build_object('item_id', '00000000-0000-4000-8000-000000000fc4', 'qty', 1, 'photos', jsonb_build_array((select c4 from ph))))) #>> '{requests,0,code}';
insert into rq select 'rc3', public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f83', 'refund', '단순 변심',
  '[{"item_id":"00000000-0000-4000-8000-000000000fc3","qty":1}]') #>> '{requests,0,code}';
select is((select count(*)::int from rq where code is not null), 4, '파손 교환 · 오배송 환불 · 다른 크리에이터 줄 요청도 생성');
select is(jsonb_array_length(public.myr_app_claims_for_order('00000000-0000-4000-8000-000000000fb1')), 4, '주문의 요청 목록');

-- ---------- 고객 — 마이 목록 · 주문 상태 칩 ----------
select is(jsonb_array_length(public.myr_app_claims_of_user('00000000-0000-4000-8000-000000000f83', 50)), 4, '마이 — 내 주문의 요청 전부');
select is(jsonb_array_length(public.myr_app_claims_of_user('00000000-0000-4000-8000-000000000f81', 50)), 0, '마이 — 내 주문이 아니면 없음(크리에이터 계정이어도)');
select is(jsonb_array_length(public.myr_app_claims_of_user(null, 50)), 0, '마이 — user 없으면 빈 목록');
select is(jsonb_array_length(public.myr_app_claims_of_user('00000000-0000-4000-8000-000000000f83', 2)), 2, '마이 — 개수 제한');
select is(public.myr_order_claim_status('00000000-0000-4000-8000-000000000fb1'), 'pending', '처리 대기 요청이 있으면 pending');
select is(public.myr_order_claim_status('00000000-0000-4000-8000-000000000fb2'), null, '요청 없는 주문 null');
select is((select e ->> 'claim_status' from jsonb_array_elements(public.myr_app_my_orders('00000000-0000-4000-8000-000000000f83', 20)) e where e ->> 'code' = 'pgtap-rq-1'), 'pending', '회원 주문 목록 JSON 에 claim_status');

-- ---------- 크리에이터 목록 ----------
select is(jsonb_array_length(public.myr_app_seller_claims_of_user('00000000-0000-4000-8000-000000000f81')), 3, '내 상품 요청만(3건)');
select is(public.myr_app_seller_claims_waiting_of_user('00000000-0000-4000-8000-000000000f81'), 3, '처리 대기 수');
select is(public.myr_app_seller_claim_of_user('00000000-0000-4000-8000-000000000f81', (select code from rq where k = 'rc3')), null, '남의 상품 요청은 null');
select is((select jsonb_build_object('options', j -> 'options', 'phone', j ->> 'buyer_phone', 'step', j ->> 'step', 'amount', (j ->> 'amount')::int, 'fee', (j ->> 'return_fee')::int)
             from (select public.myr_app_seller_claim_of_user('00000000-0000-4000-8000-000000000f81', upper((select code from rq where k = 'rc1'))) as j) s),
  '{"options": ["partial", "refund"], "phone": "010-****-5678", "step": "decide", "amount": 32000, "fee": 6000}'::jsonb, '상세 JSON — 단순 변심 선택지 · 연락처 가림 · 단계 · 금액 · 왕복 배송비(코드 대소문자 무관)');
select is(public.myr_app_seller_claim_of_user('00000000-0000-4000-8000-000000000f81', (select code from rq where k = 'rc5')) -> 'options', '["reship", "refund"]'::jsonb, '파손 교환 요청 선택지 — 재발송 먼저');
-- 0105: 처리 방법별 차감액(승인과 같은 함수) — 환불이 나가는 처리만 · 고를 수 없으면 null
select is(public.myr_app_seller_claim_of_user('00000000-0000-4000-8000-000000000f81', (select code from rq where k = 'rc1')) -> 'option_deductions', '{"partial": 6000, "refund": 0}'::jsonb, '단순 변심 — 부분 환불은 왕복 배송비 · 전액 환불은 0');
select is(public.myr_app_seller_claim_of_user('00000000-0000-4000-8000-000000000f81', (select code from rq where k = 'rc5')) -> 'option_deductions', '{"refund": 0}'::jsonb, '파손 교환 — 재발송은 환불이 없어 키 없음');
select is((select public.myr_refund_request_json(q) -> 'option_deductions' from public.myr_refund_requests q where q.code = (select code from rq where k = 'rc3')), '{"partial": null, "refund": 0}'::jsonb, '차감 뒤 0원 이하 — 부분 환불은 null(고를 수 없음 · 승인 BAD_RESOLUTION 과 같은 함수)');
update public.myr_order_items set courier = '한진택배', tracking_no = '440000000001', shipped_at = now() where id = '00000000-0000-4000-8000-000000000fc5';
select is((select jsonb_build_object('status', j #>> '{order,status}', 'courier', j #>> '{order,item,courier}', 'tracking', j #>> '{order,item,tracking_no}')
             from (select public.myr_app_seller_claim_of_user('00000000-0000-4000-8000-000000000f81', (select code from rq where k = 'rc5')) as j) s),
  '{"status": "PAID", "courier": "한진택배", "tracking": "440000000001"}'::jsonb, '요청 JSON — 주문 상태 · 그 줄의 택배사 · 송장(0080)');

-- ---------- 승인 · 반려 ----------
select is(public.myr_app_claim_decide((select code from rq where k = 'rc1'), '00000000-0000-4000-8000-000000000f82', 'approve', 'partial', '확인했어요') ->> 'code', 'NOT_FOUND', '다른 크리에이터는 NOT_FOUND');
select is(public.myr_app_claim_decide((select code from rq where k = 'rc1'), '00000000-0000-4000-8000-000000000f81', 'reject', null, '   ') ->> 'code', 'BAD_MESSAGE', '반려는 메시지 필수 BAD_MESSAGE(0091 — 승인은 선택)');
select is(public.myr_app_claim_decide((select code from rq where k = 'rc1'), '00000000-0000-4000-8000-000000000f81', 'hold', 'partial', '확인') ->> 'code', 'BAD_DECISION', 'BAD_DECISION');
select is(public.myr_app_claim_decide((select code from rq where k = 'rc1'), '00000000-0000-4000-8000-000000000f81', 'approve', 'reship', '확인') ->> 'code', 'BAD_RESOLUTION', '단순 변심에 재발송 BAD_RESOLUTION');
select is((select jsonb_build_object('refund_now', (j ->> 'refund_now')::boolean, 'step', j #>> '{request,step}', 'collect', (j #>> '{request,needs_collect}')::boolean, 'deduction', (j #>> '{request,deduction}')::int, 'status', j #>> '{request,status}')
             from (select public.myr_app_claim_decide((select code from rq where k = 'rc1'), '00000000-0000-4000-8000-000000000f81', 'approve', 'partial', E'회수 뒤 배송비 빼고 환불할게요\n감사합니다 🙏') as j) s),
  '{"refund_now": false, "step": "collect", "collect": true, "deduction": 6000, "status": "progress"}'::jsonb, '부분 환불 승인 → 회수 먼저 · 왕복 배송비 차감');
select is((select message from public.myr_refund_requests where code = (select code from rq where k = 'rc1')), E'회수 뒤 배송비 빼고 환불할게요\n감사합니다 🙏', '고객에게 보낼 메시지 — 줄바꿈 · 이모지 그대로 저장');
select is(public.myr_app_claim_decide((select code from rq where k = 'rc1'), '00000000-0000-4000-8000-000000000f81', 'reject', null, '다시') ->> 'code', 'NOT_PENDING', '이미 처리한 요청 NOT_PENDING');
select is((select jsonb_build_object('refund_now', (j ->> 'refund_now')::boolean, 'step', j #>> '{request,step}', 'collect', (j #>> '{request,needs_collect}')::boolean)
             from (select public.myr_app_claim_decide((select code from rq where k = 'rc5'), '00000000-0000-4000-8000-000000000f81', 'approve', 'reship', '새 제품 보내드릴게요') as j) s),
  '{"refund_now": false, "step": "reship", "collect": false}'::jsonb, '파손 재발송 승인 → 회수 없이 재발송');
select is((select (j #>> '{request,needs_collect}')::boolean from (select public.myr_app_claim_decide((select code from rq where k = 'rc4'), '00000000-0000-4000-8000-000000000f81', 'approve', 'refund', '회수 뒤 환불할게요') as j) s),
  true, '오배송 환불 승인 → 회수 뒤 환불');
select is(public.myr_app_claim_decide((select code from rq where k = 'rc3'), '00000000-0000-4000-8000-000000000f82', 'approve', 'partial', '확인') ->> 'code', 'BAD_RESOLUTION', '차감 뒤 0원 이하면 부분 환불 불가');
select is((select jsonb_build_object('status', j #>> '{request,status}', 'message', j #>> '{request,message}', 'step', j #> '{request,step}')
             from (select public.myr_app_claim_decide((select code from rq where k = 'rc3'), '00000000-0000-4000-8000-000000000f82', 'reject', null, '개봉 제품이라 어려워요') as j) s),
  '{"status": "rejected", "message": "개봉 제품이라 어려워요", "step": null}'::jsonb, '반려 — 메시지 남김 · 단계 없음');
select is(public.myr_app_seller_claims_waiting_of_user('00000000-0000-4000-8000-000000000f81'), 0, '처리 대기 0');
select is(public.myr_order_claim_status('00000000-0000-4000-8000-000000000fb1'), 'progress', '처리 대기가 없고 진행 중이 있으면 progress(반려는 끝난 요청)');

-- ---------- 회수 · 환불 ----------
select is(public.myr_app_claim_refunded((select code from rq where k = 'rc1'), 26000) ->> 'code', 'NOT_READY', '회수 전 환불 기록 NOT_READY');
select is(public.myr_app_admin_claim_collected((select code from rq where k = 'rc5')) ->> 'code', 'NOT_READY', '회수가 필요 없는 요청 NOT_READY');
select is(public.myr_app_admin_claim_collected('rq0') ->> 'code', 'NOT_FOUND', '없는 요청 NOT_FOUND');
select is((select jsonb_build_object('already', (j ->> 'already')::boolean, 'refund_now', (j ->> 'refund_now')::boolean, 'step', j #>> '{request,step}')
             from (select public.myr_app_admin_claim_collected((select code from rq where k = 'rc1')) as j) s),
  '{"already": false, "refund_now": true, "step": "refund"}'::jsonb, '회수 확인 → 환불할 차례');
select is((public.myr_app_admin_claim_collected((select code from rq where k = 'rc1')) ->> 'already')::boolean, true, '회수 확인 다시 → already');
select ok((select bool_or(e ->> 'code' = (select code from rq where k = 'rc1') and (e ->> 'deduction')::int = 6000) from jsonb_array_elements(public.myr_app_claims_refund_due(interval '-1 minute', 20)) e), '환불이 남은 요청 → 재시도 대상(차감 포함 · 트랜잭션 안이라 나이 -1분)');
select ok(not exists (select 1 from jsonb_array_elements(public.myr_app_claims_refund_due(interval '-1 minute', 20)) e where e ->> 'code' = (select code from rq where k = 'rc4')), '회수 전 요청은 재시도 대상 아님');
select is(public.myr_app_claim_refunded((select code from rq where k = 'rc1'), 26000), '{"ok": true, "already": false, "status": "done"}'::jsonb, '환불 기록 → 할 일이 끝나 완료');
select is((select jsonb_build_object('amount', refund_amount, 'done', done_at is not null) from public.myr_refund_requests where code = (select code from rq where k = 'rc1')), '{"amount": 26000, "done": true}'::jsonb, '환불 금액 · 완료 시각');
select is((select jsonb_build_object('paid', (j ->> 'refund_paid')::int, 'back', public.myr_refund_after_deduction((j ->> 'refund_paid')::int, (j ->> 'deduction')::int), 'refund', (j ->> 'refund_amount')::int)
             from (select public.myr_refund_request_json(q) as j from public.myr_refund_requests q where q.code = (select code from rq where k = 'rc1')) s),
  '{"paid": 32000, "back": 26000, "refund": 26000}'::jsonb, '0105 응답 refund_paid(환불액 + 차감)를 차감 뒤 금액 함수에 넣으면 환불액 — 두 식이 같은 관계');
select is((public.myr_app_claim_refunded((select code from rq where k = 'rc1'), 26000) ->> 'already')::boolean, true, '환불 기록 다시 → already');

-- ---------- 재발송 ----------
select is(public.myr_app_admin_claim_reship((select code from rq where k = 'rc5'), '택배', '123456789012') ->> 'code', 'BAD_COURIER', 'BAD_COURIER');
select is(public.myr_app_admin_claim_reship((select code from rq where k = 'rc5'), 'CJ대한통운', '12') ->> 'code', 'BAD_TRACKING', 'BAD_TRACKING');
select is(public.myr_app_admin_claim_reship((select code from rq where k = 'rc4'), 'CJ대한통운', '123456789012') ->> 'code', 'NOT_READY', '재발송이 없는 요청 NOT_READY');
select is((select jsonb_build_object('status', j #>> '{request,status}', 'tracking', j #>> '{request,reship_tracking_no}')
             from (select public.myr_app_admin_claim_reship((select code from rq where k = 'rc5'), '한진택배', '4400-1111-2222') as j) s),
  '{"status": "done", "tracking": "440011112222"}'::jsonb, '재발송 송장 → 완료(하이픈 정리)');
select is((public.myr_app_admin_claim_reship((select code from rq where k = 'rc5'), '한진택배', '440011112222') ->> 'already')::boolean, true, '같은 송장 다시 → already');

-- ---------- 끝난 줄에는 새 요청 · 파손 환불은 바로 환불 ----------
insert into rq select 'rc5b', public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f83', 'refund', '파손 · 누액',
  jsonb_build_array(jsonb_build_object('item_id', '00000000-0000-4000-8000-000000000fc5', 'qty', 1, 'photos', jsonb_build_array((select c5 from ph))))) #>> '{requests,0,code}';
select ok((select code from rq where k = 'rc5b') is not null, '완료된 요청이 있던 줄에도 새 요청');
select is((public.myr_app_claim_decide((select code from rq where k = 'rc5b'), '00000000-0000-4000-8000-000000000f81', 'approve', 'refund', '바로 환불해드릴게요') ->> 'refund_now')::boolean, true, '파손 환불 승인 → 회수 없이 바로 환불');
select is(public.myr_app_admin_claims(true) @> jsonb_build_array(jsonb_build_object('code', (select code from rq where k = 'rc5b'))), true, '운영 목록 — 진행 중 요청');
select is(public.myr_app_admin_claims(true) @> jsonb_build_array(jsonb_build_object('code', (select code from rq where k = 'rc1'))), false, '운영 목록(열린 것만)에 완료 요청 없음');

-- ---------- 한 번에 보낸 단순 변심 요청 — 왕복 배송비는 한 번만 ----------
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, ship_status)
values ('00000000-0000-4000-8000-000000000fc7', '00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000fa1', '00000000-0000-4000-8000-000000000f91', '포도 젤리', '', 1, 32000, 'DELIVERED'),
       ('00000000-0000-4000-8000-000000000fc8', '00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000fa1', '00000000-0000-4000-8000-000000000f91', '포도 젤리', '', 1, 32000, 'DELIVERED');
create temp table bt as select public.myr_app_claim_open('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f83', 'refund', '단순 변심',
  '[{"item_id":"00000000-0000-4000-8000-000000000fc7","qty":1},{"item_id":"00000000-0000-4000-8000-000000000fc8","qty":1}]') as r;
select is((select count(distinct batch)::int from public.myr_refund_requests where order_item_id in ('00000000-0000-4000-8000-000000000fc7', '00000000-0000-4000-8000-000000000fc8')), 1, '한 번에 보낸 요청은 한 묶음');
select is((public.myr_app_claim_decide((select r #>> '{requests,0,code}' from bt), '00000000-0000-4000-8000-000000000f81', 'approve', 'partial', '확인') #>> '{request,deduction}')::int, 6000, '묶음 첫 부분 환불 → 배송비 차감');
select is((select (j ->> 'return_fee')::int from (select public.myr_app_seller_claim_of_user('00000000-0000-4000-8000-000000000f81', (select r #>> '{requests,1,code}' from bt)) as j) s), 0, '같은 묶음 다른 요청 — 뺄 배송비 0(화면 안내)');
select is(public.myr_app_seller_claim_of_user('00000000-0000-4000-8000-000000000f81', (select r #>> '{requests,1,code}' from bt)) -> 'option_deductions', '{"partial": 0, "refund": 0}'::jsonb, '같은 묶음 다른 요청 — 부분 환불 차감 0(예상 금액도 전액과 같다)');
select is((public.myr_app_claim_decide((select r #>> '{requests,1,code}' from bt), '00000000-0000-4000-8000-000000000f81', 'approve', 'partial', '확인') #>> '{request,deduction}')::int, 0, '같은 묶음 두 번째 부분 환불 → 차감 없음');

-- ---------- 고아 사진 ----------
insert into storage.objects (bucket_id, name, created_at) values
  ('myr-refunds', (select c5 from ph), now() - interval '2 days'),
  ('myr-refunds', (select c1 from ph), now() - interval '2 days');
select ok(not exists (select 1 from public.myr_refund_photo_orphans(interval '24 hours', 1000) x where x = (select c5 from ph)), '요청에 실린 사진은 고아가 아니다');
select ok(exists (select 1 from public.myr_refund_photo_orphans(interval '24 hours', 1000) x where x = (select c1 from ph)), '어디에도 안 실린 사진은 고아');

select * from finish();
rollback;
