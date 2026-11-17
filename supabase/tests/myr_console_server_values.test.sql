-- pgTAP — 0116 크리에이터 콘솔 화면 값을 서버에서: 정산 비율(myr_settlement_pct · myr_settlement_card_pct) · 다음 정산 보류 이유(myr_seller_next_hold_json) ·
--   처리 대기(myr_claim_waiting · myr_cs_waiting) · 답변 기한(myr_claim_due_json · 설정 myr_claim_answer) · 주문 상태 · 탭(myr_order_claim_status(주문, 크리에이터) ·
--   myr_seller_order_state · myr_seller_order_tab) · 상품 탭 · 메뉴 · 수정 화면(myr_seller_product_console) · CS 비율(myr_cs_rate).
--   값은 0116 전 TS 판정과 같다(답변 기한 2일 · 정산 비율 60 · 탭 우선순위 · 메뉴 그대로).
begin;
select plan(38);

-- ---------- 권한 ----------
select function_privs_are('public', 'myr_claim_waiting', '{myr_refund_requests}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 claim_waiting 불가');
select function_privs_are('public', 'myr_cs_waiting', '{myr_cs_conversations}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 cs_waiting 불가');
select function_privs_are('public', 'myr_claim_due_json', '{myr_refund_requests,timestamptz}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 claim_due_json 불가');
select function_privs_are('public', 'myr_claim_answer_days', '{}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 claim_answer_days 불가');
select function_privs_are('public', 'myr_order_claim_status', '{uuid,uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 order_claim_status 불가');
select function_privs_are('public', 'myr_seller_order_state', '{text,boolean,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 seller_order_state 불가');
select function_privs_are('public', 'myr_seller_order_tab', '{text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 seller_order_tab 불가');
select function_privs_are('public', 'myr_seller_product_console', '{myr_products,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 seller_product_console 불가');
select function_privs_are('public', 'myr_cs_rate', '{integer,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 cs_rate 불가');
select function_privs_are('public', 'myr_seller_next_hold_json', '{uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 seller_next_hold_json 불가');
select function_privs_are('public', 'myr_settlement_card_pct', '{integer[]}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 settlement_card_pct 불가');

-- ---------- 정산 비율 ----------
select is(public.myr_settlement_pct(), 60, '정산 비율 설정 60(화면 "정산금 (60%)" 와 같은 값)');
select is(array[public.myr_settlement_card_pct(array[60, 60]), public.myr_settlement_card_pct(array[60, 55]), public.myr_settlement_card_pct(array[]::int[])], array[60, null, null]::int[],
          '달 카드 비율 — 줄 비율이 하나면 그 값 · 섞이면 null · 줄이 없으면 null');

-- ---------- 처리 대기 · 답변 기한 ----------
select is((select jsonb_object_agg(st, public.myr_claim_waiting(jsonb_populate_record(null::public.myr_refund_requests, jsonb_build_object('status', st)))) from unnest(array['pending', 'progress', 'done', 'rejected']) st),
          '{"pending": true, "progress": false, "done": false, "rejected": false}'::jsonb, '처리 대기 = pending 만');
select is((select jsonb_object_agg(st, public.myr_cs_waiting(jsonb_populate_record(null::public.myr_cs_conversations, jsonb_build_object('status', st)))) from unnest(array['OPEN', 'ANSWERED', 'CLOSED']) st),
          '{"OPEN": true, "ANSWERED": false, "CLOSED": false}'::jsonb, '답변 대기 = OPEN 만');
select is(public.myr_claim_answer_days(), 2, '답변 기한 설정 2일(0116 전 화면 ANSWER_DAYS 와 같은 값)');
create function pg_temp.due(p_status text, p_created timestamptz) returns jsonb language sql as $$
  select public.myr_claim_due_json(jsonb_populate_record(null::public.myr_refund_requests, jsonb_build_object('status', p_status, 'created_at', p_created)), '2026-11-06T12:00:00Z') - 'at'
$$;
-- 0116 전 화면 테스트와 같은 시각 — 오늘 접수 2일 · 하루 지나면 오늘 안 · 넘기면 지남
select is(pg_temp.due('pending', '2026-11-06T10:00:00Z'), '{"days": 2, "overdue": false, "urgent": false}'::jsonb, '오늘 접수 — 2일 안');
select is(pg_temp.due('pending', '2026-11-05T10:00:00Z'), '{"days": 1, "overdue": false, "urgent": true}'::jsonb, '하루 지남 — 오늘 안(급함)');
select is(pg_temp.due('pending', '2026-11-01T10:00:00Z'), '{"days": 0, "overdue": true, "urgent": true}'::jsonb, '넘김 — 기한 지남');
select is(pg_temp.due('progress', '2026-11-05T10:00:00Z'), null, '기다리지 않는 요청은 기한 없음(null)');
select is(public.myr_claim_due_json(jsonb_populate_record(null::public.myr_refund_requests, '{"status": "pending", "created_at": "2026-11-06T10:00:00Z"}'::jsonb), now()) ->> 'at',
          to_jsonb('2026-11-08T10:00:00Z'::timestamptz) #>> '{}', '기한 = 접수 + 2일');
update public.platform_settings set value = '{"days": 3}' where key = 'myr_claim_answer';
select is(pg_temp.due('pending', '2026-11-06T10:00:00Z') -> 'days', '3'::jsonb, '설정을 바꾸면 기한도 따라간다(3일)');
update public.platform_settings set value = '{"days": 2}' where key = 'myr_claim_answer';

-- ---------- 주문 상태 · 탭 ----------
select is((select jsonb_object_agg(c, public.myr_seller_order_state(x.claim, x.refund, x.ship))
             from (values ('a', 'pending', true, 'PAID'), ('b', 'progress', false, 'SHIPPING'), ('c', null, true, null), ('d', null, true, 'DELIVERED'), ('e', null, false, 'SHIPPING'), ('f', null, false, 'PREPARING')) x(c, claim, refund, ship)),
          '{"a": "claim_pending", "b": "claim_progress", "c": "refunded", "d": "partial_refunded", "e": "SHIPPING", "f": "PREPARING"}'::jsonb,
          '주문 상태 — 요청 → 환불(남은 줄 없음 환불 완료 · 있음 부분 환불) → 배송 상태');
select is((select jsonb_object_agg(st, public.myr_seller_order_tab(st)) from unnest(array['claim_pending', 'claim_progress', 'refunded', 'partial_refunded', 'PAID', 'PREPARING', 'SHIPPING', 'DELIVERED']) st),
          '{"claim_pending": "claim", "claim_progress": "claim", "refunded": "refunded", "partial_refunded": "refunded", "PAID": "prep", "PREPARING": "prep", "SHIPPING": "shipping", "DELIVERED": "delivered"}'::jsonb,
          '주문 탭 — 교환·환불 · 환불 완료(부분 포함) · 배송 준비 · 배송 중 · 배송 완료');

-- 픽스처: 주문 하나 · 크리에이터 A 줄 · B 줄(배송 완료) · A 줄에 교환·환불 요청
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000fd51', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-console@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
       ('00000000-0000-4000-8000-00000000fd52', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-console-a@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.sellers (id, name, handle, platform, active, user_id)
values ('00000000-0000-4000-8000-00000000fd61', '민지 루틴', '@pgtap.consolea', 'instagram', true, '00000000-0000-4000-8000-00000000fd52'),
       ('00000000-0000-4000-8000-00000000fd62', '하루 루틴', '@pgtap.consoleb', 'instagram', true, null);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-00000000fd71', 'pgtap-console-a', '00000000-0000-4000-8000-00000000fd61', 'diet', '포도 젤리', 32000, 50, 'listed', 'grape'),
       ('00000000-0000-4000-8000-00000000fd72', 'pgtap-console-b', '00000000-0000-4000-8000-00000000fd62', 'diet', '레몬 스틱', 36000, 50, 'listed', 'pill');
insert into public.myr_orders (id, code, status, paid_at, user_id, buyer_name, buyer_phone, shipping, order_name, items_amount, payment_key)
values ('00000000-0000-4000-8000-00000000fd81', 'pgtap-console-1', 'PAID', now() - interval '3 days', '00000000-0000-4000-8000-00000000fd51', '홍길동', '010-1234-5678', '{"recipient":"홍길동"}', '포도 젤리 외', 68000, 'pk-console');
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, ship_status, delivered_at)
values ('00000000-0000-4000-8000-00000000fd91', '00000000-0000-4000-8000-00000000fd81', '00000000-0000-4000-8000-00000000fd71', '00000000-0000-4000-8000-00000000fd61', '포도 젤리', '', 1, 32000, 'DELIVERED', now() - interval '1 day'),
       ('00000000-0000-4000-8000-00000000fd92', '00000000-0000-4000-8000-00000000fd81', '00000000-0000-4000-8000-00000000fd72', '00000000-0000-4000-8000-00000000fd62', '레몬 스틱', '', 1, 36000, 'DELIVERED', now() - interval '1 day');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-00000000fd81', '00000000-0000-4000-8000-00000000fd51', 'refund', '단순 변심',
          '[{"item_id":"00000000-0000-4000-8000-00000000fd91","qty":1}]') ->> 'ok', 'true', 'A 줄 교환·환불 요청 접수');
select is(array[public.myr_order_claim_status('00000000-0000-4000-8000-00000000fd81', '00000000-0000-4000-8000-00000000fd61'),
                public.myr_order_claim_status('00000000-0000-4000-8000-00000000fd81', '00000000-0000-4000-8000-00000000fd62'),
                public.myr_order_claim_status('00000000-0000-4000-8000-00000000fd81')],
          array['pending', null, 'pending'], '요청 상태 — A 는 처리 대기 · B 는 없음 · 주문 전체(샵 칩)는 처리 대기');
select is((select jsonb_build_array(e ->> 'claim_status', e ->> 'state', e ->> 'tab') from jsonb_array_elements(public.myr_app_seller_orders('00000000-0000-4000-8000-00000000fd61')) e where e ->> 'code' = 'pgtap-console-1'),
          '["pending", "claim_pending", "claim"]'::jsonb, 'A 주문 탭 — 교환·환불');
select is((select jsonb_build_array(e ->> 'claim_status', e ->> 'state', e ->> 'tab') from jsonb_array_elements(public.myr_app_seller_orders('00000000-0000-4000-8000-00000000fd62')) e where e ->> 'code' = 'pgtap-console-1'),
          '[null, "DELIVERED", "delivered"]'::jsonb, 'B 주문 탭 — 같은 주문이어도 B 줄에는 요청이 없어 배송 완료');
select is((select jsonb_build_array(q ->> 'waiting', q #>> '{due,days}') from (select public.myr_refund_request_json(r) q from public.myr_refund_requests r where r.order_item_id = '00000000-0000-4000-8000-00000000fd91') x),
          '["true", "2"]'::jsonb, '요청 응답 — waiting · 답변 기한 2일');
select is(public.myr_app_seller_claims_waiting_of_user('00000000-0000-4000-8000-00000000fd52'), 1, 'A 처리 대기 수 1(같은 함수)');
-- 승인하면 기다리지 않는다 — 대기 수 · 응답 · 결정 가능이 같은 함수
select is(public.myr_app_claim_decide((select r.code from public.myr_refund_requests r where r.order_item_id = '00000000-0000-4000-8000-00000000fd91'), '00000000-0000-4000-8000-00000000fd52', 'approve', 'partial', '') ->> 'ok',
          'true', 'A 요청 승인');
select is((select jsonb_build_array(q ->> 'waiting', q -> 'due') from (select public.myr_refund_request_json(r) q from public.myr_refund_requests r where r.order_item_id = '00000000-0000-4000-8000-00000000fd91') x),
          '["false", null]'::jsonb, '승인 뒤 — 기다리지 않음 · 기한 없음');

-- ---------- 상품 탭 · 메뉴 · 수정 화면 ----------
create function pg_temp.pc(p_status text, p_rev text) returns jsonb language sql as $$
  select public.myr_seller_product_console(jsonb_populate_record(null::public.myr_products, jsonb_build_object('status', p_status)), p_rev)
$$;
select is((select jsonb_object_agg(k, pg_temp.pc(s, r) -> 'tabs') from (values ('draft', 'draft', null), ('pending', 'pending', null), ('rejected', 'rejected', null), ('listed', 'listed', null),
                                                                        ('listed+rev', 'listed', 'pending'), ('paused', 'paused', null), ('paused+rej', 'paused', 'rejected'), ('ended', 'ended', null)) v(k, s, r)),
          '{"draft": ["draft"], "pending": ["review"], "rejected": ["review"], "listed": ["live"], "listed+rev": ["live", "review"], "paused": ["live"], "paused+rej": ["live", "review"], "ended": ["ended"]}'::jsonb,
          '탭 — 판매 중 = 판매 · 일시중지 · 심사 중 = 심사 · 반려 · 수정 심사(판매 중이면 둘 다)');
select is((select jsonb_object_agg(k, jsonb_build_array(pg_temp.pc(s, r) -> 'home_live', pg_temp.pc(s, r) -> 'home_pending'))
             from (values ('draft', 'draft', null), ('pending', 'pending', null), ('rejected', 'rejected', null), ('listed', 'listed', null), ('listed+rev', 'listed', 'pending'), ('paused', 'paused', null), ('ended', 'ended', null)) v(k, s, r)),
          '{"draft": [false, true], "pending": [false, true], "rejected": [false, true], "listed": [true, false], "listed+rev": [true, true], "paused": [false, false], "ended": [false, false]}'::jsonb,
          '홈 개수 — 판매 중(판매만) · 심사(심사 · 반려 · 임시저장 · 수정 심사)');
select is((select jsonb_object_agg(k, jsonb_build_array(pg_temp.pc(s, r) -> 'actions', pg_temp.pc(s, r) -> 'opens_review', pg_temp.pc(s, r) -> 'edit_mode'))
             from (values ('draft', 'draft', null), ('pending', 'pending', null), ('rejected', 'rejected', null), ('listed', 'listed', null), ('listed+rev', 'listed', 'pending'),
                          ('listed+rej', 'listed', 'rejected'), ('paused', 'paused', null), ('paused+rej', 'paused', 'rejected'), ('ended', 'ended', null)) v(k, s, r)),
          '{"draft": [["continue", "delete"], false, "new"], "pending": [[], false, null], "rejected": [["review"], true, "fix_new"], "listed": [["revise", "groupbuy"], false, "edit"],
            "listed+rev": [["groupbuy"], false, null], "listed+rej": [["review", "groupbuy"], false, "fix_rev"], "paused": [["revise"], false, "edit"], "paused+rej": [["review"], true, "fix_rev"], "ended": [[], false, null]}'::jsonb,
          '메뉴 · 바로 심사 결과 · 수정 화면 — 0116 전 화면 규칙과 같다');

-- ---------- CS 비율 ----------
select is(array[public.myr_cs_rate(2, 4), public.myr_cs_rate(1, 3), public.myr_cs_rate(0, 10), public.myr_cs_rate(0, 0)], array[50.0, 33.3, 0.0, null]::numeric[],
          'CS 비율 — 환불 주문 ÷ 주문 · 소수 첫째 자리 · 주문 없으면 null');

-- ---------- 다음 정산 보류 이유 — 정산 탭 · 홈(정산 정보)이 같은 값 ----------
select is(public.myr_seller_next_hold_json('00000000-0000-4000-8000-00000000fd61') ->> 'code', 'settle_info', '정산 정보 확인 전 — settle_info');
select is((select public.myr_settle_info_json(s) -> 'hold' from public.sellers s where s.id = '00000000-0000-4000-8000-00000000fd61'),
          public.myr_seller_next_hold_json('00000000-0000-4000-8000-00000000fd61'), '홈(정산 정보 hold) = 정산 탭(next_hold) 같은 함수');

select * from finish();
rollback;
