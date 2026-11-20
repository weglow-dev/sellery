-- pgTAP — 0099 판정 하나에 함수 하나(백엔드 원칙 1 · 2):
--   1) 새 판정 함수의 권한 · 값   2) 화면이 다시 계산하지 않게 응답에 더한 값   3) "식이 지정한 함수 밖에 없다" 검사(맨 아래 — 새 함수가 같은 식을 다시 쓰면 여기서 실패한다)
begin;
select plan(278);

-- ---------- 1. 권한 ----------
select function_privs_are('public', 'myr_product_visible', '{myr_products,sellers}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 product_visible 불가');
select function_privs_are('public', 'myr_order_status_open', '{text}'::text[], 'anon', '{}'::text[], 'anon 은 order_status_open 불가');
select function_privs_are('public', 'myr_order_owned_by', '{myr_orders,uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 order_owned_by 불가');
select function_privs_are('public', 'myr_line_amount', '{integer,integer}'::text[], 'anon', '{}'::text[], 'anon 은 line_amount 불가');
select function_privs_are('public', 'myr_claim_open_deduction', '{text,text}'::text[], 'anon', '{}'::text[], 'anon 은 claim_open_deduction 불가');
select function_privs_are('public', 'myr_claim_open_deduction', '{text,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 도 claim_open_deduction 불가');
select function_privs_are('public', 'myr_claim_open_deduction', '{text,text}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 claim_open_deduction 가능');
select function_privs_are('public', 'myr_app_claim_form_rules', '{}'::text[], 'anon', '{}'::text[], 'anon 은 claim_form_rules 불가');
select function_privs_are('public', 'myr_app_claim_form_rules', '{}'::text[], 'authenticated', '{}'::text[], 'authenticated 도 claim_form_rules 불가');
select function_privs_are('public', 'myr_app_claim_form_rules', '{}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 claim_form_rules 가능');
select function_privs_are('public', 'myr_app_order_refresh_payment', '{uuid,jsonb}'::text[], 'anon', '{}'::text[], 'anon 은 order_refresh_payment 불가');
select function_privs_are('public', 'myr_app_order_refresh_payment', '{uuid,jsonb}'::text[], 'authenticated', '{}'::text[], 'authenticated 도 order_refresh_payment 불가');
select function_privs_are('public', 'myr_app_order_refresh_payment', '{uuid,jsonb}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 order_refresh_payment 가능');
select function_privs_are('public', 'myr_order_ship_status', '{uuid,uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 order_ship_status 불가(다시 만든 뒤에도)');
select function_privs_are('public', 'myr_sales_lines', '{}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 sales_lines 불가(다시 만든 뒤에도)');
select hasnt_function('public', 'myr_order_ship_status', '{uuid}'::text[], '옛 myr_order_ship_status(uuid) 는 없다 — 인자 둘짜리 하나만');

-- ---------- 2. 상태 묶음 ----------
select is((select jsonb_object_agg(st, jsonb_build_array(public.myr_order_status_paid(st), public.myr_order_status_alive(st), public.myr_order_status_open(st)))
             from unnest(array['WAITING_DEPOSIT','PAID','PARTIAL_REFUNDED','REFUNDED','CANCELED']) st),
          '{"WAITING_DEPOSIT": [false, true, false], "PAID": [true, true, true], "PARTIAL_REFUNDED": [true, true, true], "REFUNDED": [true, false, false], "CANCELED": [false, false, false]}'::jsonb,
          '주문 상태 — [결제됨, 끝나지 않음, 결제됐고 끝나지 않음]');
select is((select jsonb_object_agg(st, public.myr_claim_status_open(st)) from unnest(array['pending','progress','done','rejected']) st),
          '{"pending": true, "progress": true, "done": false, "rejected": false}'::jsonb, '열린 요청 = pending · progress');
select is((select jsonb_object_agg(st, jsonb_build_array(public.myr_product_status_approved(st), public.myr_product_status_editable(st)))
             from unnest(array['draft','pending','listed','paused','rejected','ended']) st),
          '{"draft": [false, true], "pending": [false, false], "listed": [true, false], "paused": [true, false], "rejected": [false, true], "ended": [false, false]}'::jsonb,
          '상품 상태 — [심사 통과(수정본 · 판매 종료 가능), 직접 수정 가능]');
select is((select jsonb_object_agg(st, public.myr_revision_status_open(st)) from unnest(array['pending','approved','rejected','canceled']) st),
          '{"pending": true, "approved": false, "rejected": true, "canceled": false}'::jsonb, '열린 수정본 = pending · rejected');
select is((select jsonb_object_agg(st, public.myr_ship_status_unshipped(st)) from unnest(array['PAID','PREPARING','SHIPPING','DELIVERED']) st),
          '{"PAID": true, "PREPARING": true, "SHIPPING": false, "DELIVERED": false}'::jsonb, '출고 전 = 결제완료 · 배송준비중');
select is((select jsonb_object_agg(coalesce(r, 'null'), public.myr_claim_resolution_deducts(r)) from unnest(array['partial','refund','reship','reship_collect',null]) r),
          '{"partial": true, "refund": false, "reship": false, "reship_collect": false, "null": false}'::jsonb, '왕복 배송비를 빼는 처리 방법 = partial');
select is((select jsonb_object_agg(coalesce(r, 'null'), public.myr_claim_resolution_refunds(r)) from unnest(array['partial','refund','reship','reship_collect',null]) r),
          '{"partial": true, "refund": true, "reship": false, "reship_collect": false, "null": false}'::jsonb, '환불이 나가는 처리 방법 = refund · partial(0105)');
-- 0105 환불 금액 — 차감할 수 있나 · 차감 뒤 금액 · 토스 전액 취소 · 기록 금액 비교
select is((select jsonb_agg(public.myr_deduction_fits(a, d) order by o) from unnest(array[32000, 6000, 5000, 0, 32000], array[6000, 6000, 6000, 0, 0]) with ordinality u(a, d, o)),
          '[true, false, false, true, true]'::jsonb, '차감할 수 있나 — 금액보다 작거나 차감 없음(0원 금액도 차감 없으면 된다)');
select is((select jsonb_agg(public.myr_refund_after_deduction(a, d) order by o) from unnest(array[39000, 36000, 6000, 32000, 0], array[6000, 6000, 6000, 0, 0]) with ordinality u(a, d, o)),
          '[33000, 30000, null, 32000, 0]'::jsonb, '차감 뒤 금액 — 정상 · 부분 · 차감 불가 null · 전액 · 0원');
select is(public.myr_refund_after_deduction(39000, null), 39000, '차감 null = 0');
select is((select jsonb_agg(public.myr_refund_cancel_full(f, d) order by o) from unnest(array[true, true, false, null], array[0, 6000, 0, 0]) with ordinality u(f, d, o)),
          '[true, false, false, false]'::jsonb, '토스 전액 취소 — 다 끝나고 차감 없을 때만');
select is(public.myr_refund_mismatch_json(33000, 33000), '{"mismatch": false}'::jsonb, '기록 금액 같음 → mismatch false');
select is(public.myr_refund_mismatch_json(30000, 33000), '{"mismatch": true, "expected": 33000, "got": 30000}'::jsonb, '기록 금액 다름 → 두 금액');
select is(public.myr_refund_mismatch_json(0, null), '{"mismatch": true, "expected": null, "got": 0}'::jsonb, '다시 계산 실패(null) → mismatch');

-- ---------- 3. 금액 ----------
select is(public.myr_line_amount(10000000, 999999), 9999990000000::bigint, '단가 × 수량 — bigint(정수 범위를 넘어도 오류 없음)');
select is(public.myr_product_price_max(), 10000000, '판매가 상한 1,000만');
update public.platform_settings set value = '{"pct": 60, "deposit_pct": 25}'::jsonb where key = 'myr_settlement';
insert into public.platform_settings (key, value) select 'myr_settlement', '{"pct": 60, "deposit_pct": 25}'::jsonb where not exists (select 1 from public.platform_settings where key = 'myr_settlement');
select is(public.myr_deposit_amount(1000001), 250000, '보증금 = 제조비 × 보증금 비율(버림)');

-- 새 요청의 예상 차감 — 단순 변심 환불만 왕복 배송비
select is(public.myr_claim_open_deduction('refund', '단순 변심'), public.myr_claim_return_fee(), '단순 변심 환불 → 왕복 배송비');
select is(public.myr_claim_open_deduction('refund', '파손 · 누액'), 0, '파손 · 누액 환불 → 0');
select is(public.myr_claim_open_deduction('refund', '오배송'), 0, '오배송 환불 → 0');
select is(public.myr_claim_open_deduction('exchange', '단순 변심'), 0, '교환 → 0');
select is(public.myr_claim_open_deduction('refund', '모르는 사유'), 0, '모르는 사유 → 0');
select is(public.myr_claim_open_deduction(null, null), 0, 'null → 0');

-- 사유 규칙 — 신청 화면(myr_app_claim_form_rules)과 요청 접수(myr_app_claim_open)가 같은 함수
select is(public.myr_app_claim_form_rules() -> 'reasons',
          '[{"reason": "단순 변심", "kinds": ["refund"], "photo_required": false, "change_mind": true},
            {"reason": "파손 · 누액", "kinds": ["refund", "exchange"], "photo_required": true, "change_mind": false},
            {"reason": "오배송", "kinds": ["refund", "exchange"], "photo_required": true, "change_mind": false}]'::jsonb,
          '신청 화면 규칙 — 사유 순서 · 단순 변심은 환불만 · 파손 · 오배송은 사진 필수 · 단순 변심만 기한 적용');
select is((public.myr_app_claim_form_rules() ->> 'return_fee')::int, public.myr_claim_return_fee(), '신청 화면 규칙의 왕복 배송비 = myr_claim_return_fee');
select is((select jsonb_object_agg(k || '/' || r, public.myr_claim_kind_allowed(k, r)) from unnest(array['refund','exchange']) k, unnest(public.myr_claim_reasons()) r),
          '{"refund/단순 변심": true, "exchange/단순 변심": false, "refund/파손 · 누액": true, "exchange/파손 · 누액": true, "refund/오배송": true, "exchange/오배송": true}'::jsonb,
          '요청 종류 — 단순 변심 교환만 안 된다');
select is(jsonb_build_array(public.myr_claim_kind_allowed('exchange', null), public.myr_claim_kind_allowed(null, '오배송'), public.myr_claim_kind_allowed('gift', '오배송'), public.myr_claim_photo_required(null), public.myr_claim_reason_change_mind(null)),
          '[true, false, false, false, false]'::jsonb, 'null · 모르는 값 — 종류 없음 · 모르는 종류는 거절 · 사진 · 기한은 false(사유 자체는 BAD_REASON 이 먼저 막는다)');

-- 처리 방법 선택지(myr_refund_request_options)는 사유 이름으로 고른다 — 사유 목록(myr_claim_reasons)과 이름이 어긋나면 빈 배열이 되어 콘솔에서 처리 방법을 고를 수 없다.
--   사유 목록에서 꺼낸 이름으로 물어, 받는 사유 · 요청 종류마다 선택지가 있는지 본다(사유 이름을 한쪽만 바꾸면 여기서 실패한다)
select is((select count(*)::int from unnest(public.myr_claim_reasons()) rn, unnest(public.myr_claim_kinds(rn)) k where cardinality(public.myr_refund_request_options(k, rn)) = 0), 0,
          '받는 사유 · 요청 종류마다 처리 방법 선택지가 하나 이상(사유 이름이 어긋나지 않았다)');
select is((select jsonb_object_agg(rn || '/' || k, to_jsonb(public.myr_refund_request_options(k, rn))) from unnest(public.myr_claim_reasons()) rn, unnest(public.myr_claim_kinds(rn)) k),
          '{"단순 변심/refund": ["partial", "refund"], "파손 · 누액/refund": ["refund", "reship"], "파손 · 누액/exchange": ["reship", "refund"],
            "오배송/refund": ["refund", "reship_collect"], "오배송/exchange": ["reship_collect", "refund"]}'::jsonb,
          '사유 · 요청 종류별 선택지(첫 값이 기본 — 새 요청의 예상 차감이 이 값을 쓴다)');

-- 처리 방법마다 회수 여부 — 승인(needs_collect)과 콘솔 안내(option_collects)가 같은 함수
select is((select jsonb_object_agg(rs || '/' || rn, public.myr_claim_resolution_collects(rs, rn)) from unnest(array['refund','partial','reship','reship_collect']) rs, unnest(public.myr_claim_reasons()) rn),
          '{"refund/단순 변심": true, "refund/파손 · 누액": false, "refund/오배송": true, "partial/단순 변심": true, "partial/파손 · 누액": true, "partial/오배송": true,
            "reship/단순 변심": false, "reship/파손 · 누액": false, "reship/오배송": false, "reship_collect/단순 변심": true, "reship_collect/파손 · 누액": true, "reship_collect/오배송": true}'::jsonb,
          '회수 — 부분 환불 · 재발송 + 회수는 항상 · 전액 환불은 파손 · 누액만 회수 없이 · 재발송은 회수 없음');

-- ---------- 4. 공구 할인율 범위 ----------
select is((select jsonb_agg(public.myr_groupbuy_pct_ok(v) order by o) from unnest(array[0, 1, 70, 71, null]::int[]) with ordinality t(v, o)),
          '[false, true, true, false, false]'::jsonb, '할인율 범위 = min~max(0 · 71 · null 은 거절)');
select is(jsonb_build_array(public.myr_groupbuy_pct_min(), public.myr_groupbuy_pct_max()), '[1, 70]'::jsonb, '할인율 범위 1~70');

-- ---------- 픽스처 ----------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000e9c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-ss1@myr.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
insert into public.customers (id, guest, name, phone, phone_norm) values ('00000000-0000-4000-8000-00000000e9e1', true, '김비회원', '01099997777', '01099997777');
insert into public.sellers (id, name, handle, platform, active)
values ('00000000-0000-4000-8000-00000000e911', '셀러 A', '@pgtap.ss.a', 'instagram', true),
       ('00000000-0000-4000-8000-00000000e912', '셀러 B(비활성)', '@pgtap.ss.b', 'instagram', false),
       ('00000000-0000-4000-8000-00000000e913', '셀러 C', '@pgtap.ss.c', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon, deleted_at)
values ('00000000-0000-4000-8000-00000000e921', 'pgtap-ss-listed', '00000000-0000-4000-8000-00000000e911', 'diet', '판매 중', 10000, 5, 'listed', 'pill', null),
       ('00000000-0000-4000-8000-00000000e922', 'pgtap-ss-paused', '00000000-0000-4000-8000-00000000e911', 'diet', '일시 중지', 10000, 5, 'paused', 'pill', null),
       ('00000000-0000-4000-8000-00000000e923', 'pgtap-ss-deleted', '00000000-0000-4000-8000-00000000e911', 'diet', '삭제', 10000, 5, 'listed', 'pill', now()),
       ('00000000-0000-4000-8000-00000000e924', 'pgtap-ss-inactive', '00000000-0000-4000-8000-00000000e912', 'diet', '비활성 크리에이터', 10000, 5, 'listed', 'pill', null),
       ('00000000-0000-4000-8000-00000000e925', 'pgtap-ss-soldout', '00000000-0000-4000-8000-00000000e913', 'diet', '품절', 20000, 0, 'listed', 'pill', null),
       ('00000000-0000-4000-8000-00000000e926', 'pgtap-ss-draft', '00000000-0000-4000-8000-00000000e911', 'diet', '임시 저장', 10000, 0, 'draft', 'pill', null);

-- ---------- 5. 상품이 샵에 보이는가 ----------
select is((select jsonb_object_agg(p.code, jsonb_build_array(public.myr_product_listed(p), public.myr_product_visible(p, s), public.myr_product_sold_out(p), public.myr_product_available(p, s)))
             from public.myr_products p join public.sellers s on s.id = p.seller_id where p.code like 'pgtap-ss-%'),
          '{"pgtap-ss-listed": [true, true, false, true], "pgtap-ss-paused": [false, false, false, false], "pgtap-ss-deleted": [false, false, false, false],
            "pgtap-ss-inactive": [true, false, false, false], "pgtap-ss-soldout": [true, true, true, false], "pgtap-ss-draft": [false, false, true, false]}'::jsonb,
          '상품 — [판매 중, 샵에 보임, 품절, 살 수 있음]');
select is((select jsonb_agg(e ->> 'code' order by e ->> 'code') from jsonb_array_elements(public.myr_home_products()) e where e ->> 'code' like 'pgtap-ss-%'),
          '["pgtap-ss-listed", "pgtap-ss-soldout"]'::jsonb, '홈 = 샵에 보이는 상품만(일시 중지 · 삭제 · 비활성 크리에이터 제외 · 품절은 보인다)');
select is((select jsonb_object_agg(c, public.myr_product_card(c) is not null) from unnest(array['pgtap-ss-listed','pgtap-ss-paused','pgtap-ss-deleted','pgtap-ss-inactive','pgtap-ss-soldout']) c),
          '{"pgtap-ss-listed": true, "pgtap-ss-paused": false, "pgtap-ss-deleted": false, "pgtap-ss-inactive": false, "pgtap-ss-soldout": true}'::jsonb, '상품 페이지 = 같은 판정');
select is((select jsonb_object_agg(l ->> 'code', (l ->> 'unit_price') is not null)
             from jsonb_array_elements(public.myr_app_cart_quote('[{"code":"pgtap-ss-listed","qty":1},{"code":"pgtap-ss-paused","qty":1},{"code":"pgtap-ss-inactive","qty":1}]') -> 'lines') l),
          '{"pgtap-ss-listed": true, "pgtap-ss-paused": false, "pgtap-ss-inactive": false}'::jsonb, '장바구니 견적 = 같은 판정(안 보이는 상품은 단가 없음)');

-- 내 상품 JSON — editable · approved · sold_out
select is((select jsonb_object_agg(e ->> 'code', jsonb_build_array(e -> 'editable', e -> 'approved', e -> 'sold_out'))
             from jsonb_array_elements(public.myr_app_seller_products('00000000-0000-4000-8000-00000000e911')) e),
          '{"pgtap-ss-listed": [false, true, false], "pgtap-ss-paused": [false, true, false], "pgtap-ss-draft": [true, false, true]}'::jsonb,
          '내 제품 목록 — [직접 수정, 심사 통과, 품절] = 판정 함수 값');
select is((select jsonb_build_array(j -> 'product' -> 'editable', j -> 'product' -> 'approved') from (select public.myr_app_seller_product('00000000-0000-4000-8000-00000000e911', '00000000-0000-4000-8000-00000000e926') as j) x),
          '[true, false]'::jsonb, '내 제품 상세(임시 저장) — editable · approved');
select is(public.myr_app_seller_submit_revision('00000000-0000-4000-8000-00000000e911', '00000000-0000-4000-8000-00000000e926', '{}') ->> 'code', 'NOT_REVISABLE', '임시 저장 상품은 수정본 불가(approved 와 같은 판정)');
select is(public.myr_app_seller_save_product('00000000-0000-4000-8000-00000000e911', '00000000-0000-4000-8000-00000000e921', '{}', false) ->> 'code', 'NOT_EDITABLE', '판매 중 상품은 직접 수정 불가(editable 과 같은 판정)');

-- 판매가 상한 — 거절 응답이 상한을 준다(콘솔 안내 문구가 이 값을 쓴다)
select is(public.myr_product_fields('00000000-0000-4000-8000-00000000e911', '{"price": 10000001}', false, '{}') - 'code',
          '{"ok": false, "field": "price", "max": 10000000}'::jsonb, '상한을 넘으면 거절 · 응답에 상한');
select isnt(public.myr_product_fields('00000000-0000-4000-8000-00000000e911', '{"price": 10000000}', false, '{}') ->> 'field', 'price', '상한까지는 판매가로 거절하지 않는다');

-- ---------- 6. 공구 — 만들기 · 미리보기 · 표가 같은 범위 ----------
select is(public.myr_app_seller_groupbuy_create('00000000-0000-4000-8000-00000000e911', '00000000-0000-4000-8000-00000000e921', 71, now(), now() + interval '1 day'),
          '{"ok": false, "code": "BAD_PCT", "min": 1, "max": 70}'::jsonb, '만들기 71% → BAD_PCT · 범위');
select is(public.myr_app_groupbuy_preview('00000000-0000-4000-8000-00000000e911', '00000000-0000-4000-8000-00000000e921', 71),
          '{"ok": false, "code": "BAD_PCT", "min": 1, "max": 70}'::jsonb, '미리보기 71% → 만들기와 같은 거절(전에는 가격을 줬다)');
select is(public.myr_app_groupbuy_preview('00000000-0000-4000-8000-00000000e911', '00000000-0000-4000-8000-00000000e921', 0) ->> 'code', 'BAD_PCT', '미리보기 0% → BAD_PCT');
select is(public.myr_app_groupbuy_preview('00000000-0000-4000-8000-00000000e911', '00000000-0000-4000-8000-00000000e921', 70) ->> 'ok', 'true', '미리보기 70% → ok');
select throws_ok($$insert into public.myr_groupbuys (code, product_id, seller_id, discount_pct, starts_at, ends_at)
                   values ('pgtapss071', '00000000-0000-4000-8000-00000000e921', '00000000-0000-4000-8000-00000000e911', 71, now(), now() + interval '1 day')$$,
                 '23514', null, '표 CHECK 도 같은 함수 — 71% 는 넣을 수 없다');
select is(public.myr_app_seller_groupbuy_create('00000000-0000-4000-8000-00000000e911', '00000000-0000-4000-8000-00000000e922', 10, now(), now() + interval '1 day') ->> 'code', 'NOT_LISTED', '일시 중지 상품 → NOT_LISTED');
select is(public.myr_app_seller_groupbuy_create('00000000-0000-4000-8000-00000000e913', '00000000-0000-4000-8000-00000000e925', 10, now(), now() + interval '1 day') ->> 'code', 'SOLD_OUT', '품절 상품 → SOLD_OUT');
select is((select jsonb_build_array(j -> 'pct_min', j -> 'pct_max', j -> 'product' -> 'listed', j -> 'product' -> 'sold_out')
             from (select public.myr_app_seller_groupbuys('00000000-0000-4000-8000-00000000e911', '00000000-0000-4000-8000-00000000e921') as j) x),
          '[1, 70, true, false]'::jsonb, '공구 화면 응답 — 범위 · 판매 중 · 품절(콘솔 폼이 그대로 쓴다)');
select is((select j -> 'product' -> 'listed' from (select public.myr_app_seller_groupbuys('00000000-0000-4000-8000-00000000e911', '00000000-0000-4000-8000-00000000e922') as j) x),
          'false'::jsonb, '일시 중지 상품 → product.listed false');

-- ---------- 7. 주문 ----------
-- o1 회원 · 부분 환불(A 줄 3개 중 1개 환불 · 배송중 / C 줄 1개 · 배송준비중)  o2 비회원 · 전액 환불  o3 입금 대기  o4 주인 없음
insert into public.myr_orders (id, code, user_id, customer_id, status, buyer_name, shipping, order_name, items_amount, shipping_fee, payment_key, payment_method, paid_at, refund_amount)
values ('00000000-0000-4000-8000-00000000e931', 'pgtap-ss-1', '00000000-0000-4000-8000-00000000e9c1', null, 'PARTIAL_REFUNDED', '홍길동', '{}', '판매 중 외 1건', 50000, 3000, 'pk-ss1', '카드', now(), 10000),
       ('00000000-0000-4000-8000-00000000e932', 'pgtap-ss-2', null, '00000000-0000-4000-8000-00000000e9e1', 'REFUNDED', '김비회원', '{}', '판매 중', 10000, 3000, 'pk-ss2', '카드', now(), 13000),
       ('00000000-0000-4000-8000-00000000e933', 'pgtap-ss-3', '00000000-0000-4000-8000-00000000e9c1', null, 'WAITING_DEPOSIT', '홍길동', '{}', '판매 중', 10000, 3000, 'pk-ss3', '가상계좌', null, 0),
       ('00000000-0000-4000-8000-00000000e934', 'pgtap-ss-4', null, null, 'PAID', '주인 없음', '{}', '판매 중', 10000, 0, 'pk-ss4', '카드', now(), 0);
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, ship_status, refunded_qty, refund_amount, status)
values ('00000000-0000-4000-8000-00000000e941', '00000000-0000-4000-8000-00000000e931', '00000000-0000-4000-8000-00000000e921', '00000000-0000-4000-8000-00000000e911', '줄 a', '', 3, 10000, 'SHIPPING', 1, 10000, 'PARTIAL_REFUNDED'),
       ('00000000-0000-4000-8000-00000000e942', '00000000-0000-4000-8000-00000000e931', '00000000-0000-4000-8000-00000000e925', '00000000-0000-4000-8000-00000000e913', '줄 b', '', 1, 20000, 'PREPARING', 0, 0, 'PAID'),
       ('00000000-0000-4000-8000-00000000e943', '00000000-0000-4000-8000-00000000e932', '00000000-0000-4000-8000-00000000e921', '00000000-0000-4000-8000-00000000e911', '줄 c', '', 1, 10000, 'DELIVERED', 1, 10000, 'REFUNDED'),
       ('00000000-0000-4000-8000-00000000e944', '00000000-0000-4000-8000-00000000e933', '00000000-0000-4000-8000-00000000e921', '00000000-0000-4000-8000-00000000e911', '줄 d', '', 1, 10000, 'PAID', 0, 0, 'PAID'),
       ('00000000-0000-4000-8000-00000000e945', '00000000-0000-4000-8000-00000000e934', '00000000-0000-4000-8000-00000000e921', '00000000-0000-4000-8000-00000000e911', '줄 e', '', 1, 10000, 'PAID', 0, 0, 'PAID');
-- 요청: 줄 a 끝난 부분 환불(1개 · 차감 6,000 · 환불 4,000) · 줄 b 처리 대기 · 줄 c 전액 환불 진행 중(배송비 3,000 함께 13,000 환불됨)
insert into public.myr_refund_requests (id, code, order_id, order_item_id, seller_id, product_id, kind, qty, reason, status, resolution, decided_at, needs_refund, deduction, refund_amount, refunded_at, done_at)
values ('00000000-0000-4000-8000-00000000e951', 'pgss01', '00000000-0000-4000-8000-00000000e931', '00000000-0000-4000-8000-00000000e941', '00000000-0000-4000-8000-00000000e911', '00000000-0000-4000-8000-00000000e921', 'refund', 1, '단순 변심', 'done', 'partial', now(), true, 6000, 4000, now(), now()),
       ('00000000-0000-4000-8000-00000000e952', 'pgss02', '00000000-0000-4000-8000-00000000e931', '00000000-0000-4000-8000-00000000e942', '00000000-0000-4000-8000-00000000e913', '00000000-0000-4000-8000-00000000e925', 'refund', 1, '파손 · 누액', 'pending', null, null, false, 0, null, null, null),
       ('00000000-0000-4000-8000-00000000e953', 'pgss03', '00000000-0000-4000-8000-00000000e932', '00000000-0000-4000-8000-00000000e943', '00000000-0000-4000-8000-00000000e911', '00000000-0000-4000-8000-00000000e921', 'refund', 1, '오배송', 'progress', 'refund', now(), true, 0, 13000, now(), null);

-- 주인
select is((select jsonb_object_agg(o.code, jsonb_build_array(public.myr_order_owned_by(o, '00000000-0000-4000-8000-00000000e9c1'), public.myr_order_owned_by(o, '00000000-0000-4000-8000-00000000e9e1'), public.myr_order_owned_by(o, null)))
             from public.myr_orders o where o.code like 'pgtap-ss-%'),
          '{"pgtap-ss-1": [true, false, false], "pgtap-ss-2": [false, true, false], "pgtap-ss-3": [true, false, false], "pgtap-ss-4": [false, false, false]}'::jsonb,
          '주문 주인 — [회원, 비회원 고객, actor 없음] · 주인 없는 주문은 누구 것도 아니다');
select is(public.myr_app_refund_precheck('00000000-0000-4000-8000-00000000e934', '[]', 'customer', '00000000-0000-4000-8000-00000000e9c1') ->> 'code', 'NOT_FOUND', '환불 precheck — 주인 없는 주문은 NOT_FOUND');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-00000000e934', '00000000-0000-4000-8000-00000000e9c1', 'refund', '오배송', '[]') ->> 'code', 'NOT_FOUND', '요청 접수 — 같은 판정');
select is((select jsonb_agg(public.myr_app_claim_open('00000000-0000-4000-8000-00000000e931', '00000000-0000-4000-8000-00000000e9c1', k, r, '[]') ->> 'code' order by o)
             from (values (1, 'exchange', '단순 변심'), (2, 'refund', '모르는 사유'), (3, 'gift', '오배송'), (4, 'exchange', '오배송')) v(o, k, r)),
          '["EXCHANGE_NOT_ALLOWED", "BAD_REASON", "BAD_KIND", "NOTHING"]'::jsonb, '요청 접수 — 단순 변심 교환 · 모르는 사유 · 모르는 종류는 거절 · 오배송 교환은 통과(줄이 없어 NOTHING)');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-00000000e931', '00000000-0000-4000-8000-00000000e9c1', 'refund', '오배송', '[{"item_id":"00000000-0000-4000-8000-00000000e941","qty":1}]') -> 'items' -> 0 ->> 'reason',
          'PHOTO_REQUIRED', '요청 접수 — 사진 필수 사유인데 사진이 없으면 PHOTO_REQUIRED(화면 규칙과 같은 함수)');

-- 줄
select is((select jsonb_object_agg(i.product_name, jsonb_build_array(public.myr_line_valid(i), public.myr_line_live(i), public.myr_line_net(i))) from public.myr_order_items i where i.order_id in (select id from public.myr_orders where code like 'pgtap-ss-%')),
          '{"줄 a": [true, true, 20000], "줄 b": [true, true, 20000], "줄 c": [true, false, 0], "줄 d": [true, true, 10000], "줄 e": [true, true, 10000]}'::jsonb, '줄 — [취소 아님, 살아 있음, 금액 − 환불]');
update public.myr_order_items set status = 'CANCELED' where id = '00000000-0000-4000-8000-00000000e944';
select is((select jsonb_build_array(public.myr_line_valid(i), public.myr_line_live(i)) from public.myr_order_items i where i.id = '00000000-0000-4000-8000-00000000e944'), '[false, false]'::jsonb, '취소 줄 — 취소 아님 false · 살아 있음 false');
update public.myr_order_items set status = 'PAID' where id = '00000000-0000-4000-8000-00000000e944';

-- 샵 주문 응답 — net_amount · alive · 줄 live · claim_status
select is((select jsonb_object_agg(o.code, jsonb_build_array(j -> 'net_amount', j -> 'alive', j -> 'claim_status'))
             from public.myr_orders o, lateral (select public.myr_order_json(o, true) as j) x where o.code in ('pgtap-ss-1', 'pgtap-ss-2', 'pgtap-ss-3')),
          '{"pgtap-ss-1": [43000, true, "pending"], "pgtap-ss-2": [0, false, null], "pgtap-ss-3": [13000, true, null]}'::jsonb,
          '주문 응답 — [결제 − 환불, 끝나지 않음, 요청 상태] · 전액 환불 주문은 열린 요청이 있어도 claim_status null');
select is(public.myr_order_claim_status('00000000-0000-4000-8000-00000000e932'), 'progress', '(요청 자체는 진행 중 — 주문 응답에서만 가린다)');
select is((select jsonb_object_agg(l ->> 'name', l -> 'live') from public.myr_orders o, lateral jsonb_array_elements(public.myr_order_json(o, true) -> 'items') l where o.code in ('pgtap-ss-1', 'pgtap-ss-2')),
          '{"줄 a": true, "줄 b": true, "줄 c": false}'::jsonb, '주문 응답 줄 live = myr_line_live');
select is(public.myr_order_net((select o from public.myr_orders o where o.code = 'pgtap-ss-2')), 0, '결제 − 환불은 0 아래로 내려가지 않는다');
select is((select jsonb_object_agg(l ->> 'name', l -> 'left_amount') from public.myr_orders o, lateral jsonb_array_elements(public.myr_order_json(o, true) -> 'items') l where o.code in ('pgtap-ss-1', 'pgtap-ss-2')),
          '{"줄 a": 20000, "줄 b": 20000, "줄 c": 0}'::jsonb, '주문 응답 줄 left_amount = 단가 × 남은 수량(신청 화면이 곱하지 않는다)');

-- 결제 원문 갱신 — 결제됐고 끝나지 않은 주문만(샵 서버가 상태 묶음을 직접 쓰지 않는다)
select is((select jsonb_object_agg(o.code, public.myr_app_order_refresh_payment(o.id, '{"method": "간편결제", "status": "DONE"}')) from public.myr_orders o where o.code in ('pgtap-ss-1', 'pgtap-ss-2', 'pgtap-ss-3')),
          '{"pgtap-ss-1": true, "pgtap-ss-2": false, "pgtap-ss-3": false}'::jsonb, '갱신 — 부분 환불 주문만 true · 전액 환불 · 입금 대기는 false');
select is((select jsonb_object_agg(o.code, jsonb_build_array(o.payment_method, o.raw_payment ->> 'status')) from public.myr_orders o where o.code in ('pgtap-ss-1', 'pgtap-ss-2', 'pgtap-ss-3')),
          '{"pgtap-ss-1": ["간편결제", "DONE"], "pgtap-ss-2": ["카드", null], "pgtap-ss-3": ["가상계좌", null]}'::jsonb, '갱신된 주문만 결제 수단 · 원문이 바뀐다');
select is(public.myr_app_order_refresh_payment('00000000-0000-4000-8000-00000000ffff', '{"method": "카드"}'), false, '없는 주문 → false');
select is(public.myr_app_order_refresh_payment('00000000-0000-4000-8000-00000000e931', null), false, '원문이 없으면 → false(지우지 않는다)');

-- 콘솔 주문 응답 — 내 줄의 배송 상태 · 금액
select is(public.myr_order_ship_status('00000000-0000-4000-8000-00000000e931'), 'PREPARING', '주문 배송 상태(전체) = 가장 덜 진행된 줄');
select is(public.myr_order_ship_status('00000000-0000-4000-8000-00000000e931', '00000000-0000-4000-8000-00000000e911'), 'SHIPPING', '크리에이터 A 줄만 = 배송중');
select is(public.myr_order_ship_status('00000000-0000-4000-8000-00000000e932', '00000000-0000-4000-8000-00000000e911'), null, '살아 있는 줄이 없으면 null');
select is((select jsonb_object_agg(e ->> 'code', jsonb_build_array(e -> 'ship_status', e -> 'amounts')) from jsonb_array_elements(public.myr_app_seller_orders('00000000-0000-4000-8000-00000000e911', 50)) e where e ->> 'code' in ('pgtap-ss-1', 'pgtap-ss-2')),
          '{"pgtap-ss-1": ["SHIPPING", {"paid": 30000, "refunded": 10000, "net": 20000}], "pgtap-ss-2": [null, {"paid": 10000, "refunded": 10000, "net": 0}]}'::jsonb,
          '콘솔 주문(A) — 내 줄 배송 상태 · 결제 · 환불 · 남은 금액');
select is((select jsonb_build_array(e -> 'ship_status', e -> 'amounts') from jsonb_array_elements(public.myr_app_seller_orders('00000000-0000-4000-8000-00000000e913', 50)) e where e ->> 'code' = 'pgtap-ss-1'),
          '["PREPARING", {"paid": 20000, "refunded": 0, "net": 20000}]'::jsonb, '콘솔 주문(C) — 같은 주문이라도 내 줄 기준');
select is((select count(*)::int from jsonb_array_elements(public.myr_app_seller_orders('00000000-0000-4000-8000-00000000e911', 50)) e where e ->> 'code' = 'pgtap-ss-3'), 0, '입금 대기 주문은 콘솔 주문에 없다(결제된 주문만)');

-- 요청 응답 — open · refund_paid · shipping_back
select is((select jsonb_object_agg(r.code, jsonb_build_array(j -> 'open', j -> 'amount', j -> 'refund_paid', j -> 'shipping_back'))
             from public.myr_refund_requests r, lateral (select public.myr_refund_request_json(r) as j) x where r.code like 'pgss0%'),
          '{"pgss01": [false, 10000, 10000, 0], "pgss02": [true, 20000, null, 0], "pgss03": [true, 10000, 13000, 3000]}'::jsonb,
          '요청 응답 — [열림, 요청 상품 금액, 결제 기준 금액(환불 + 차감), 함께 돌려준 배송비]');
select is((select (public.myr_refund_request_json(r) #>> '{order,item,amount}')::int from public.myr_refund_requests r where r.code = 'pgss01'), 30000, '요청 응답 줄 amount = 주문 수량 전체 금액(3 × 10,000)');
select is((select jsonb_object_agg(r.code, public.myr_refund_request_json(r) -> 'option_collects') from public.myr_refund_requests r where r.code like 'pgss0%'),
          '{"pgss01": {"partial": true, "refund": true}, "pgss02": {"refund": false, "reship": false}, "pgss03": {"refund": true, "reship_collect": true}}'::jsonb,
          '요청 응답 option_collects — 선택지마다 회수 여부(단순 변심 · 파손 · 누액 · 오배송)');
select is(public.myr_app_claim_open('00000000-0000-4000-8000-00000000e931', '00000000-0000-4000-8000-00000000e9c1', 'refund', '오배송',
            '[{"item_id":"00000000-0000-4000-8000-00000000e942","qty":1,"photos":["00000000-0000-4000-8000-00000000e931/00000000-0000-4000-8000-00000000e942/00000000-0000-4000-8000-0000000000aa.jpg"]}]') -> 'items' -> 0 ->> 'reason',
          'OPEN_EXISTS', '열린 요청이 있는 줄은 새 요청 불가(같은 판정)');

-- 환불 precheck — goods · shipping_back(화면이 금액을 다시 나누지 않는다)
select is((select jsonb_build_array(j -> 'amount', j -> 'goods', j -> 'shipping_back', j -> 'full') from (select public.myr_app_refund_precheck('00000000-0000-4000-8000-00000000e934', '[]', 'admin', null) as j) x),
          '[10000, 10000, 0, true]'::jsonb, '무료배송 주문 전체 환불 — 상품 10,000 · 배송비 0');
update public.myr_orders set shipping_fee = 3000 where id = '00000000-0000-4000-8000-00000000e934';
select is((select jsonb_build_array(j -> 'amount', j -> 'goods', j -> 'shipping_back', j -> 'full') from (select public.myr_app_refund_precheck('00000000-0000-4000-8000-00000000e934', '[]', 'admin', null) as j) x),
          '[13000, 10000, 3000, true]'::jsonb, '배송비 낸 주문 전체 환불 — 상품 10,000 + 배송비 3,000');

-- 실적 줄 — net 칸 · 옛 마진율 칸 없음
select is((select jsonb_build_array(sum(net)::int, sum(left_qty)::int) from public.myr_sales_lines() where order_id = '00000000-0000-4000-8000-00000000e931'), '[40000, 3]'::jsonb, 'myr_sales_lines — net 합 · 남은 수량 합');
select ok((select not ('seller_margin_rate' = any (p.proargnames)) and 'net' = any (p.proargnames) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'myr_sales_lines'), 'myr_sales_lines — net 칸이 있고 seller_margin_rate 칸은 없다');

-- ---------- 8. 식이 지정한 함수 밖에 없다 ----------
--   MYR 함수 본문(주석 제외)에서 판정 식을 찾는다. 지정한 함수(allowed) 밖에서 나오면 실패 — 새 함수는 식을 다시 쓰지 말고 그 함수를 부른다.
--   allowed 의 첫 함수가 그 판정의 주인이다. 상태를 "쓰는" 전이 함수(입금 만료 · 환불 기록)는 allowed 에 같이 적는다.
create temp table _fn as
  select p.proname, regexp_replace(p.prosrc, '--[^\n]*', '', 'g') as src
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'myr%';
create temp table _rules (ord serial, label text, pat text, allowed text[]);
insert into _rules (label, pat, allowed) values
  ('줄의 남은 수량(수량 − 환불 수량 · 환불 수량 + n ≥ 수량 · 수량 ≤ 환불 수량 + n 모양도)', $p$qty(,\s*0\))?\s*-\s*(coalesce\()?(\w+\.)?refunded_qty|refunded_qty\s*\+\s*[\w.]+\s*(>=|>|<=|<)\s*(\w+\.)?qty\M|qty\s*(<=|<|>=|>)\s*(coalesce\()?[\w.]*refunded_qty\s*\+$p$, '{myr_line_left}'),
  ('살아 있는 줄(남은 수량 > 0)',             $p$myr_line_left\(\w+\)\s*>\s*0$p$,                                '{myr_line_live}'),
  ('취소 줄 비교',                            $p$status\s*<>\s*'CANCELED'|\.status\s*=\s*'CANCELED'|'REFUNDED'\s*,\s*'CANCELED'$p$, '{myr_line_valid,myr_app_deposit_expire,myr_app_refund_record}'),
  ('금액 − 환불(환불 + n ≤ 금액 · 금액 ≥ 환불 + n 모양도)', $p$amount\s*-\s*(\w+\.)?refund_amount|refund_amount\s*\+[^;]*<=\s*(\w+\.)?amount\M|amount\s*(>=|<=|>|<)\s*(coalesce\()?[\w.]*refund_amount\s*\+$p$, '{myr_line_net,myr_order_net}'),
  ('단가 × 수량(수량 × 단가 모양도)',           $p$unit_price(::bigint)?\s*\*|v_unit(::bigint)?\s*\*|\*\s*(\w+\.)?qty\M|\*\s*v_qty|\*\s*(\w+\.)?unit_price\M|\*\s*v_unit\M$p$, '{myr_line_amount}'),
  ('상품 남은 재고(입고 − 판매)',             $p$-\s*(coalesce\()?(\w+\.)?sold_qty$p$,                           '{myr_product_left}'),
  ('품절(남은 재고 0)',                       $p$myr_product_left\(\w+\)\s*(<=|>|<|=)$p$,                        '{myr_product_sold_out}'),
  ('판매 중 상태',                            $p$status\s*(=|<>)\s*'listed'|'listed'\s*,\s*'paused'$p$,          '{myr_product_listed,myr_product_status_approved}'),
  ('직접 수정 상태 묶음',                     $p$'draft'\s*,\s*'rejected'$p$,                                    '{myr_product_status_editable}'),
  ('열린 수정본 상태 묶음 — 콘솔 상품 탭의 심사 중(상품 상태 심사 · 반려)은 다른 묶음', $p$'pending'\s*,\s*'rejected'$p$, '{myr_revision_status_open,myr_seller_product_console}'),
  ('주문 상태 묶음',                          $p$'PAID'\s*,\s*'PARTIAL_REFUNDED'$p$,                             '{myr_order_status_paid,myr_order_status_alive}'),
  ('출고 전 상태 묶음',                       $p$'PAID'\s*,\s*'PREPARING'$p$,                                    '{myr_ship_status_unshipped}'),
  ('지급 건에 담을 줄',                        $p$payout_id\s+is\s+null$p$,                                         '{myr_settlement_row_payable}'),
  ('줄이 지급된 회차(지난 기록)',              $p$coalesce\(\s*(\w+\.)?released_run_id$p$,                          '{myr_settlement_row_pay_run}'),
  ('지급 건 0원 초과',                         $p$myr_payout_amount\([^)]*\)\s*(>|<|>=|<=|=|<>)$p$,                  '{myr_payout_has_amount}'),
  ('지급 건 자동 상태(대기 · 보류 · 없음)',    $p$then\s+'held'\s+else\s+'pending'|'pending'\s*,\s*'none'$p$,      '{myr_payout_auto_state}'),
  ('지급 완료 지급 건(비교 — set 은 값 넣기)',  $p$(\(|and|or|where|when|not)\s*(\w+\.)?status\s*(=|<>)\s*'paid'$p$,   '{myr_payout_is_paid}'),
  ('운영 보류 지급 건',                        $p$and\s+(\w+\.)?hold_reason\s*=\s*'manual'$p$,                     '{myr_payout_manual_held}'),
  ('사업자 · 정산 정보 확인 완료',             $p$(settle_status|p_status)\s*(<>|=|is\s+distinct\s+from)\s*'verified'$p$, '{myr_seller_settle_verified}'),
  ('크리에이터 쪽 보류 이유',                  $p$then\s+'settle_info'$p$,                                        '{myr_seller_hold_reasons}'),
  ('지급 가능(자동 상태가 지급 대기)',         $p$myr_payout_auto_state\([^)]*\)\s*a\)\s*=\s*'pending'$p$,         '{myr_payout_payable}'),
  ('정산월 → 회차 찾기',                       $p$month\s*=\s*(date_trunc\('month',\s*p_month\)|v_month)$p$,       '{myr_settlement_run_of}'),
  ('비율 %(제조금액 갚은 비율 · CS 비율)',     $p$\*\s*100(\.0)?\s*/$p$,                                           '{myr_mfg_repaid_pct,myr_cs_rate}'),
  ('한국 날짜',                                $p$\(\s*[\w.]+\s+at\s+time\s+zone\s+'Asia/Seoul'\)::date$p$,          '{myr_kst_date}'),
  ('계좌번호 가리기',                          $p$'\*\*\*\*'\s*\|\|$p$,                                            '{myr_mask_account}'),
  ('정산월 · 핸들로 지급 건 찾기',             $p$\.handle\s*=\s*p_handle$p$,                                      '{myr_payout_find}'),
  ('지급 건 금액(줄 지급액 합)',               $p$sum\(\s*(\w+\.)?payout\s*\)$p$,                                  '{myr_payout_amount}'),
  ('줄 지급액(정산금 − 상계 + 보증금 환급)',   $p$settle\s*-\s*[\w.]*offset$p$,                                   '{myr_settlement_row_payout}'),
  ('순매출(판매 − 정산 뒤 환불)',              $p$sales\w*(,\s*0\))?\s*-\s*(coalesce\()?[\w.]*refund_adj$p$,      '{myr_settlement_net_sales}'),
  ('정산 줄 판매 줄 수',                       $p$count\(\*\)(::integer)?\s+from\s+public\.myr_settlement_items\s+\w+\s+where\s+\w+\.row_id\s*=\s*[\w.]+\s+and\s+\w+\.kind\s*=\s*'sale'$p$, '{myr_settlement_row_lines}'),
  ('다음 회차가 풀 보류 줄 — 원장 확인 뒤 보류 줄을 따로 고르는 모양도', $p$(status\s*=\s*'held'|myr_settlement_row_held\(\w+\))\s+and\s+public\.myr_mfg_has_ledger|myr_mfg_has_ledger\([^)]*\)[\s\S]{0,250}(status\s*=\s*'held'|myr_settlement_row_held\()$p$, '{myr_settlement_row_releasable}'),
  ('확정된 정산 줄(= · <> · in 모양) — 상태 쓰기(myr_settlement_apply)는 판정이 아니다', $p$\mstatus\s*(=|<>|!=)\s*'confirmed'|\mstatus\s+(not\s+)?in\s*\([^)]*'confirmed'$p$,          '{myr_settlement_row_confirmed,myr_settlement_apply}'),
  ('보류 중인 정산 줄(= · <> · in 모양) — 지급 건(myr_payouts) 상태 · 상태 쓰기는 다른 것', $p$\mstatus\s*(=|<>|!=)\s*'held'|\mstatus\s+(not\s+)?in\s*\([^)]*'held'$p$, '{myr_settlement_row_held,myr_payout_hold,myr_payout_fail_kind,myr_payout_manual_held}'),
  ('정산 탭 카드 줄(지급 건 회차 비교)',       $p$run_id\s*<>$p$,                                                 '{myr_settlement_card_rows}'),
  ('제조금액 합',                              $p$sum\(\s*(\w+\.)?amount\)\s+from\s+public\.myr_mfg_batches$p$,   '{myr_mfg_total}'),
  ('상계 합',                                  $p$sum\(\s*(\w+\.)?offset_amount\)(,\s*0\)\s*into\s+\w+)?\s+from\s+public\.myr_settlement_rows$p$, '{myr_mfg_offset_total}'),
  ('살아 있는 차수(무효 아님)',                $p$voided_at\s+is\s+(not\s+)?null$p$,                            '{myr_mfg_batch_live}'),
  ('보증금 입금 확인',                         $p$deposit_paid_at\s+is\s+(not\s+)?null$p$,                      '{myr_mfg_batch_deposit_paid}'),
  ('보증금 환급됨',                            $p$deposit_refund_row_id\s+is\s+(not\s+)?null$p$,                '{myr_mfg_batch_deposit_refunded}'),
  ('맡긴 보증금 차수(입금 · 환급 전)',         $p$myr_mfg_batch_deposit_paid\(\w+\)\s+and\s+not\s+public\.myr_mfg_batch_deposit_refunded$p$, '{myr_mfg_batch_deposit_held}'),
  ('보증금 상태(환급 완료 · 입금 확인 전)',     $p$(held|unpaid|refunded)\s*(=|>)\s*0$p$,                           '{myr_mfg_deposits}'),
  ('상환 끝(남은 제조금액 0)',                 $p$(mfg_after|remaining\w*|after)\s*=\s*0|-\s*least\([^)]*\)\s*=\s*0$p$, '{myr_mfg_paid_off}'),
  ('차수 바꾼 뒤 상계 부족',                   $p$myr_mfg_total\([^)]*\)\s*-\s*case|<\s*v_offset|id\s*<>\s*b\.id$p$,     '{myr_mfg_change_shortfall}'),
  ('회차 마감(다음 달 1일)',                   $p$myr_month_start\(\([^;]*interval\s+'1 month'$p$,                '{myr_settlement_month_end}'),
  ('정산 시각(그날 13시 · 지급 시각 · 크론 시각)', $p$interval\s+'13 hours'$p$,                                     '{myr_settlement_time_on}'),
  ('그 회차의 크리에이터 지급 건 찾기',        $p$run_id\s*=\s*[\w.]+\s+and\s+(\w+\.)?seller_id\s*=$p$,             '{myr_payout_of}'),
  -- 세금계산서(0104)
  ('지급 건의 정산월(회차 달)',                $p$myr_settlement_runs\s+\w+\s+where\s+\w+\.id\s*=\s*\w+\.run_id$p$, '{myr_payout_month}'),
  ('세금계산서 합계(보증금 환급 뺀 줄 지급액)', $p$myr_settlement_row_payout\([\w.]+,\s*[\w.]+,\s*0\)$p$,            '{myr_payout_invoice_total}'),
  ('공급가액 · 세액(합계 ÷ 11)',               $p$/\s*11\M$p$,                                                    '{myr_tax_invoice_amounts}'),
  ('세금계산서 필요(합계 0원 초과)',            $p$myr_payout_invoice_total\([^)]*\)\s*(>|<|>=|<=|<>)$p$,           '{myr_payout_needs_invoice}'),
  ('세금계산서를 아직 받는 지급 건(필요 · 지급 전)', $p$myr_payout_needs_invoice\(\w+\)\s+and\s+not\s+public\.myr_payout_is_paid$p$, '{myr_tax_invoice_open}'),
  ('낸 합계 = 지금 합계',                      $p$(=|<>|is\s+distinct\s+from)\s*public\.myr_payout_invoice_total$p$, '{myr_tax_invoice_matches}'),
  ('지급 건의 세금계산서 찾기',                $p$myr_tax_invoices\s+\w+\s+where\s+\w+\.payout_id\s*=$p$,          '{myr_tax_invoice_of}'),
  ('세금계산서 확인 완료(비교 — set 은 값 넣기)', $p$(\(|and|or|where|when|not)\s*(\w+\.)?status\s*(=|<>)\s*'accepted'$p$, '{myr_tax_invoice_accepted}'),
  ('크리에이터가 낼 차례(없음 · 다시 제출 요청)', $p$(\(|and|or|where|when|not)\s*(\w+\.)?status\s*(=|<>)\s*'returned'$p$, '{myr_tax_invoice_waiting_creator}'),
  ('세금계산서 쪽 지급 가능(확인 완료 · 금액 같음)', $p$myr_tax_invoice_accepted\(\w+\)\s+and\s+public\.myr_tax_invoice_matches$p$, '{myr_payout_invoice_ok}'),
  ('지급 건 보류 이유(세금계산서)',            $p$then\s+'tax_invoice'$p$,                                        '{myr_payout_hold_reasons}'),
  ('보류 이유 목록 합치기(칸 이유 + 나머지)',   $p$array\[\w+\.hold_reason\]\s*\|\|$p$,                            '{myr_payout_holds_json}'),
  ('세금계산서 작성일자(정산월 말일)',          $p$myr_settlement_month_end\([^)]*\)\)\s*-\s*1$p$,                 '{myr_tax_invoice_write_date}'),
  ('세금계산서 발행 기한(다음 달 10일)',        $p$myr_settlement_month_end\([^)]*\)\)\s*\+\s*9$p$,                '{myr_tax_invoice_due}'),
  ('세금계산서 발행 기한 지남',                $p$>\s*public\.myr_tax_invoice_due$p$,                             '{myr_tax_invoice_overdue}'),
  ('세금계산서 승인번호 형식',                 $p$\[0-9a-z\]\{16\}$p$,                                            '{myr_tax_invoice_no}'),
  ('보증금 합',                                $p$sum\(\s*(\w+\.)?deposit_amount\)$p$,                           '{myr_mfg_deposits}'),
  ('줄에 환불이 있었나',                      $p$refunded_qty\s*>\s*0$p$,                                        '{myr_line_has_refund}'),
  ('줄의 열린 요청 찾기',                      $p$order_item_id\s*=\s*[\w.]+\s+and\s+public\.myr_claim_status_open$p$,     '{myr_line_open_claim}'),
  ('열린 요청 상태 묶음',                     $p$'pending'\s*,\s*'progress'$p$,                                  '{myr_claim_status_open}'),
  ('요청 사유 목록',                          $p$'단순 변심'\s*,\s*'파손 · 누액'$p$,                               '{myr_claim_reasons}'),
  ('단순 변심 사유 비교',                     $p$=\s*'단순 변심'$p$,                                             '{myr_claim_reason_change_mind}'),
  ('사진 필수 사유',                          $p$'파손 · 누액'\s*,\s*'오배송'$p$,                                 '{myr_claim_photo_required,myr_claim_reasons}'),
  ('처리 방법별 차감액(차감 처리면 뺄 배송비)', $p$myr_claim_resolution_deducts\(\w+\)\s+then$p$,                 '{myr_claim_option_deduction}'),
  ('부분 환불 불가(줄 금액에 차감이 안 맞음)',  $p$myr_deduction_fits\(public\.myr_line_amount|myr_line_amount\([^)]*\)\s*<=$p$, '{myr_claim_option_blocked}'),
  ('차감할 수 있나(차감 < 금액)',              $p$deduction\w*\s*<\s*\w*(amount|paid)$p$,                          '{myr_deduction_fits}'),
  ('차감 뒤 금액(금액 − 차감)',                $p$-\s*(coalesce\()?\s*(\w+\.)?\w*deduction\M$p$,                  '{myr_refund_after_deduction}'),
  ('환불한 요청의 결제 기준 금액(환불액 + 차감)', $p$refund_amount\s*\+\s*(\w+\.)?deduction$p$,                   '{myr_claim_refund_paid}'),
  ('토스 전액 취소(다 끝나고 차감 없음)',      $p$full\w*,\s*false\)\s+and\s+coalesce\(\w*deduction$p$,            '{myr_refund_cancel_full}'),
  ('기록 금액 어긋남',                         $p$'mismatch',\s*true$p$,                                          '{myr_refund_mismatch_json}'),
  ('환불이 나가는 처리 방법',                 $p$'refund'\s*,\s*'partial'$p$,                                  '{myr_claim_resolution_refunds}'),
  ('회수 없는 사유 비교',                     $p$<>\s*'파손 · 누액'$p$,                                          '{myr_claim_resolution_collects}'),
  ('주문 주인',                               $p$user_id is null and (\w+\.)?customer_id$p$,                     '{myr_order_owned_by}'),
  ('판매가 상한',                             $p$10000000$p$,                                                    '{myr_product_price_max}'),
  ('수량 형식 상한',                          $p$999999$p$,                                                      '{myr_qty_max}'),
  ('공구 할인율 범위',                        $p$pct\s*(<|>|between|not between)$p$,                             '{myr_groupbuy_pct_ok}'),
  ('공구가 식',                               $p$\(100\s*-\s*\w+\)$p$,                                           '{myr_groupbuy_price}'),
  ('비율 나누기(정산 · 보증금)',              $p$/\s*100\M$p$,                                                   '{myr_settlement_amount,myr_deposit_amount}'),
  ('보증금 식',                               $p$myr_deposit_pct\(\)\s*[*/]$p$,                                  '{myr_deposit_amount}'),
  ('미리보기 정산 시각 — 크론이 도는 1시간',    $p$pay_at\(\w+\)\s*\+\s*interval\s*'1 hour'$p$,                  '{myr_settlement_settle_at}'),
  ('재고를 잡는 결제 상태(PENDING · CONFIRMING) — 결제 승인은 "이미 끝난 결제인지"(상태 바꾸기)', $p$'PENDING'\s*,\s*'CONFIRMING'$p$, '{myr_checkout_holds_stock,myr_app_confirm_checkout}'),
  ('새 결제로 대체될 결제(PENDING) — 선점 · 정리 크론은 상태 바꾸기라 자기 조건', $p$status\s*=\s*'PENDING'$p$,         '{myr_checkout_supersedable,myr_app_claim_checkout,myr_expire_checkouts}'),
  ('내 결제(비회원은 이전 결제)',              $p$id\s*=\s*p_prev_checkout_id$p$,                                '{myr_checkout_mine}'),
  ('주문에 남은 수량(줄 남은 수량 합) — 상품 판매 수량 재계산은 상품 단위', $p$sum\(\s*public\.myr_line_left$p$,  '{myr_order_left_qty,myr_recalc_product_sold_qty}'),
  ('이번 환불이 주문을 끝내는지(수량 ≥ 남은 수량)', $p$>=\s*public\.myr_order_left_qty$p$,                           '{myr_order_refund_full}'),
  ('환불 상태(남은 수량 0 이면 REFUNDED) — 주문 · 줄', $p$else\s+'PARTIAL_REFUNDED'$p$,                           '{myr_order_refund_status,myr_line_refund_status}'),
  -- 금지 패턴(허용 목록 비움) — 주인 함수 없이 어디에도 다시 나오면 실패. 0108 에서 없앤 "줄 상태로 전체 환불 판정"(남은 수량 기준 myr_order_refund_status 를 쓴다)
  ('줄 상태 묶음으로 전체 환불 판정(REFUNDED · CANCELED) — 금지 · myr_order_refund_status', $p$'REFUNDED'\s*,\s*'CANCELED'|'CANCELED'\s*,\s*'REFUNDED'$p$, '{}'),
  ('줄에 열린 요청이 있으면(신청 길 없음 · 같은 줄 중복 OPEN_EXISTS)', $p$myr_line_open_claim\(\w+\)\s+is\s+not\s+null$p$, '{myr_line_customer_path,myr_app_claim_open}'),
  ('결제된 줄(paid_at · 결제 상태 · 취소 아님) — 실적 · 정산 · 미리보기', $p$\mpaid_at\s+is\s+not\s+null$p$, '{myr_line_paid}'),
  ('배송 작업 대상 줄(열린 주문 + 살아 있는 줄) — 발주 · 송장 · 배송 완료 · 동기화 · 발송 대기', $p$myr_order_status_open\([^)]*\)\s+(and|or)\s+(not\s+)?public\.myr_line_live|myr_line_live\(\w+\)\s+(and|or)\s+(not\s+)?public\.myr_order_status_open$p$, '{myr_line_ship_work}'),
  ('크리에이터에게 보이는 이체 실패 종류(운영 쪽은 ops 로)', $p$'ops'\s*,\s*'check'$p$,                   '{myr_payout_fail_kind}'),
  ('송금 중인지(이체 상태 sending)',            $p$transfer_state\s*=\s*'sending'$p$,                           '{myr_payout_sending}'),
  ('마지막 정산 회차 다음 달',                  $p$max\(\w+\.month\)\s*\+\s*interval$p$,                      '{myr_settlement_after_last}'),
  ('정산할 달 — KST 지난달(이번 달 − 1달)',    $p$-\s*interval\s*'1 month'$p$,                                  '{myr_settlement_due}'),
  ('결제 금액(상품 합계 + 배송비 · 배송비 + 상품 합계 모양도) — 결제 · 주문 표 amount 생성 칸과 같은 식', $p$items_amount\s*\+\s*[\w.]*shipping_fee|v_items\w*\s*\+\s*v_fee|shipping_fee\s*\+\s*[\w.]*items_amount|v_fee\s*\+\s*v_items$p$, '{myr_pay_amount}'),
  ('재고가 모자란지(남은 수량 < 필요 수량)',   $p$\w*left\s*<\s*\w*(need|tot)\M$p$,                               '{myr_stock_short}'),
  ('한 번에 결제할 수 있는 줄 수',              $p$c_max_lines|>\s*public\.myr_checkout_lines_max$p$,                  '{myr_checkout_lines_over}'),
  -- 0116 크리에이터 콘솔 화면 값
  ('크리에이터 답변을 기다리는 요청(처리 대기)', $p$\mr\.status\s*(=|<>)\s*'pending'$p$,                    '{myr_claim_waiting}'),
  ('답변을 기다리는 문의(답변 대기)',          $p$\mstatus\s*(=|<>)\s*'OPEN'$p$,                              '{myr_cs_waiting}'),
  ('답변 기한(접수 + 설정 일수)',               $p$make_interval\(days\s*=>\s*public\.myr_claim_answer_days$p$, '{myr_claim_due_json}'),
  ('콘솔 주문 상태 · 탭(요청 → 환불 → 배송)',   $p$'claim_'\s*\|\||'partial_refunded'$p$,                     '{myr_seller_order_state,myr_seller_order_tab}'),
  ('콘솔 상품 탭 · 홈 개수 · 메뉴 · 수정 화면',  $p$'home_pending'|'opens_review'$p$,                            '{myr_seller_product_console}'),
  ('다음 정산 보류 이유 { code, label, all }',   $p$myr_seller_hold_reasons\(p_seller\)$p$,                          '{myr_seller_next_hold_json}'),
  ('보류 이유 목록 [{ code, label }](0122)',     $p$'code',\s*c,\s*'label'$p$,                                      '{myr_payout_hold_list_json}'),
  ('크리에이터 쪽 첫 보류 이유',                 $p$myr_seller_hold_reasons\([^)]*\)\)\[1\]$p$,                       '{myr_seller_hold_reason}'),
  ('이번 주(월요일 · KST) — 콘솔 홈 이번 주 판매',  $p$date_trunc\('week'|interval\s*'6 days'$p$,                  '{myr_kst_week,myr_app_seller_sales}'),
  -- 0118 메일 · 발주 · 배송 완료
  ('출고 마감(그날 KST 오전 11시)',           $p$interval\s*'11 hours'$p$,                                         '{myr_prepare_cutoff}'),
  ('자동 배송 완료(발송 10일 지남)',           $p$interval\s*'10 days'$p$,                                          '{myr_line_auto_delivered}'),
  -- 0119 DB 판정 정리
  ('공구 기본가에 상품가 대체값 — 금지 · 결제 단가와 같은 myr_product_unit_price(p, 0)', $p$coalesce\(public\.myr_product_unit_price\($p$, '{}'),
  ('문의 주문 연결을 고객 행 id 로 직접 비교 — 금지 · myr_order_owned_by', $p$\mcustomer_id\s*=\s*p_customer_id$p$,       '{}'),
  ('초대 사용 · 취소 · 만료(초대 상태)',        $p$used_at\s+is\s+(not\s+)?null$p$,                                  '{myr_invite_state}'),
  ('환불 사진 한도(3장)',                       $p$cardinality\([^)]*photos[^)]*\)(,\s*0\))?\s*>|<>\s*''\s*limit\s*\d$p$,     '{myr_refund_photos_too_many}'),
  -- 0120 상태 비교 · 한도 · 형식
  ('입금 대기 주문(WAITING_DEPOSIT)',           $p$status\s*(=|<>)\s*'WAITING_DEPOSIT'$p$,                               '{myr_order_status_waiting_deposit}'),
  ('요청 진행 중(progress)',                    $p$\mr\.status\s*(=|<>)\s*'progress'$p$,                                 '{myr_claim_in_progress}'),
  ('수정본 심사 중(pending)',                   $p$product_revisions\M[^;]*\mwhere[^;]*\mstatus\s*=\s*'pending'|\mv\.status\s*=\s*'pending'$p$, '{myr_revision_pending}'),
  ('줄 배송 상태 비교(상태를 바꾸는 쓰기는 제외)', $p$(?<!set )ship_status\s*(=|<>)\s*'(PAID|PREPARING|SHIPPING|DELIVERED)'|ship_status\s+(not\s+)?in\s*\($p$,
                                                '{myr_ship_status_awaiting_prepare,myr_ship_status_preparing,myr_ship_status_shipping,myr_ship_status_delivered,myr_ship_status_syncing,myr_ship_status_unshipped}'),
  ('상품 이미지 · 문의 본문 한도 숫자 — 금지 · myr_product_image_max · myr_cs_body_max', $p$image_urls'\)\s*>\s*\d|char_length\(v_body\)\s*>\s*\d$p$, '{}'),
  ('받는 택배사 목록',                          $p$'CJ대한통운'$p$,                                                        '{myr_courier_ok}'),
  ('송장번호 형식(숫자 8~30자리)',               $p$\\d\{8,30\}$p$,                                                      '{myr_tracking_ok}'),
  ('번호 정리(공백 · 하이픈 빼기) — 세금계산서 번호는 다른 번호', $p$\[\\s-\]$p$,                                       '{myr_tracking_no,myr_tax_invoice_no}'),
  ('휴대폰 번호 형식(01x + 7~8자리) — 가입 연락처 · 대표자 휴대폰', $p$01\[016789\]$p$,                                   '{myr_mobile_ok}'),
  ('개인사업자 · 법인(사업자번호 가운데 두 자리 80~89)', $p$between\s+80\s+and\s+89|substr\([^)]*,\s*4,\s*2\)$p$,   '{myr_biz_kind}'),
  -- 2026-11-20: 토스 상태 목록은 myr_toss_status_state 한 곳 — 상태 비교(= · <> · in ( )와 토스 상태 글자 둘 다 막는다
  -- 0125 파트너팀 톡
  ('파트너팀 톡 본문 1~최대 글자 수',                 $p$between\s+1\s+and\s+public\.myr_partner_body_max\(\)$p$,          '{myr_partner_body_ok}'),
  ('거절 응답의 한도 숫자(max · min) 직접 쓰기 — 금지 · 한도 함수(myr_partner_body_max 등)를 부른다', $p$'(max|min)',\s*\d$p$, '{}'),
  ('파트너팀 톡 운영이 답할 차례',                    $p$last_sender\s*=\s*'seller'$p$,                                       '{myr_partner_waiting}'),
  ('파트너팀 톡 크리에이터가 안 읽은 답변',           $p$sender\s*=\s*'admin'\s+and\s+m\.created_at\s*>$p$,                 '{myr_partner_seller_unread}'),
  ('파트너팀 톡 운영이 안 읽은 메시지',               $p$sender\s*=\s*'seller'\s+and\s+m\.created_at\s*>$p$,                '{myr_partner_admin_unread}'),
  ('토스 셀러 상태 비교(= · <> · in)',                $p$toss_seller_status\s*(=\s*'|<>\s*'|(not\s+)?in\s*\()$p$,                '{}'),
  ('토스 셀러 상태 → 상태 이름(본인인증 전 · 추가 인증 · 한도 없음 · 인증 완료)', $p$'(APPROVAL_REQUIRED|KYC_REQUIRED|PARTIALLY_APPROVED|APPROVED)'$p$, '{myr_toss_status_state}'),
  -- myr_toss_creator_ask 의 'register' 는 크리에이터에게 보일 할 일(다시 등록 버튼 · 2026-11-20) — 같은 글자라 주인에 넣는다(판정은 카드 상태 none + 사업자번호)
  ('저장 뒤 토스 셀러에 할 일(register · update)', $p$then\s+'register'$p$,                                              '{myr_app_seller_settle_info_save,myr_toss_todo_merge,myr_toss_creator_ask}'),
  ('사업자번호가 들어 있나(숫자 10자리)',       $p$biz_no\s*~\s*'$p$,                                                     '{myr_has_biz_no}'),
  ('숫자만 남기기(''\D'' · ''[^0-9]'')',       $p$'(\\D|\[\^0-9\])'\s*,\s*''\s*,\s*'g'$p$,                          '{myr_digits}'),
  -- 0122 토스 지급대행 판정
  ('토스로 지급 가능(카드 상태 인증 완료 · 한도 없음 · 법인)', $p$'partial'\s*,\s*'approved'$p$,                        '{myr_toss_ready}'),
  ('크리에이터 쪽 보류 이유(토스 본인인증 전)',   $p$then\s+'toss_auth'$p$,                                             '{myr_seller_hold_reasons}'),
  ('영업일(주말 · 공휴일 표) — 동기화 · 개수는 표를 쓰는 쪽', $p$isodow|myr_holidays\M$p$,                            '{myr_is_business_day,myr_holidays_sync,myr_holiday_count}'),
  -- 0124 토스 셀러 등록 연결
  ('토스에 할 최종 동작(수정인데 셀러 id 가 없으면 등록)', $p$then\s+'update'\s+else\s+'register'$p$,                   '{myr_app_seller_toss_begin}'),
  ('토스 셀러 다시 등록 막기(송금 중인 지급 건)', $p$exists\s*\(select[^;]*myr_payouts[^;]*myr_payout_sending$p$,       '{myr_seller_toss_sending}'),
  ('MYR refSellerId 만들기',                     $p$'m'\s*\|\|$p$,                                                    '{myr_toss_ref_new}'),
  ('MYR 이 등록한 셀러만(셀러리 쪽 셀러는 건드리지 않는다)', $p$myr_toss_ref\s+is\s+not\s+null$p$,                     '{myr_app_seller_toss_status}'),
  ('승인 때 토스에 반영할 할 일이 남았나',        $p$myr_toss_todo\s+is\s+(not\s+)?null$p$,                           '{myr_seller_toss_todo_open}'),
  ('지금 바로 토스에 할 일(본인인증 전) — 마친 뒤는 운영 승인 때', $p$v_now\s*:=$p$,               '{myr_app_seller_settle_info_save}'),
  ('토스에 등록된 크리에이터(등록 전 · 거절 아님)',  $p$toss_seller_id\s+is\s+not\s+null\s+and\s+s\.toss_seller_status\s+is\s+not\s+null$p$, '{myr_toss_registered}'),
  ('토스 인증 대기였는데 본인인증을 마침 → 확인 완료', $p$myr_settle_status\s*=\s*'toss'\s*,\s*false\)\s+and$p$,           '{myr_settle_toss_done}'),
  ('확인 중 + 본인인증 마침 → 고칠 수 없음',           $p$myr_settle_reviewing\(s\)\s+and\s+public\.myr_toss_verified$p$,       '{myr_settle_edit_locked}'),
  ('사업자 · 정산 정보 확인 중(pending)인가',          $p$myr_settle_status\s*=\s*'pending'$p$,                               '{myr_settle_reviewing}'),
  ('승인 때 할 일이 다시 등록(register)인가',          $p$myr_toss_todo\s*=\s*'register'$p$,                                  '{myr_toss_todo_register}'),
  ('승인 뒤 토스 재인증(할 일 register · 법인 제외)',  $p$myr_toss_todo_register\(s\)\s+and\s+public\.myr_biz_kind$p$,        '{myr_toss_reauth_pending}'),
  ('등록 진행 중(마지막 등록 시도 뒤 5분)',              $p$myr_toss_ref_at\s*>\s*now\(\)$p$,                                    '{myr_toss_register_in_flight}'),
  ('크리에이터가 토스에서 할 일(본인인증 · 추가 인증 · 고치기)', $p$when\s+'wait'\s+then\s+'auth'$p$,                         '{myr_toss_creator_ask}'),
  ('요약 카드 연락처 = 확인 완료면 대표자 휴대폰',     $p$settle_verified\(s\.myr_settle_status\)\s+and\s+s\.settle_phone\s+is\s+not\s+null$p$, '{myr_seller_contact_phone}'),
  ('확인 완료가 남길 상태(확인 중 + 본인인증 전 → toss)', $p$myr_toss_creator_ask\(s\)\s*=\s*'auth'$p$,                     '{myr_settle_verify_status}'),
  ('토스 본인인증을 마쳤나(인증 완료 · 추가 인증 · 한도 없음 · 법인)', $p$'partial'\s*,\s*'kyc'\s*,\s*'approved'\s*,\s*'corporate'$p$, '{myr_toss_verified}'),
  ('토스 반영 전에는 확인 완료 아님(TOSS_PENDING)', $p$'TOSS_PENDING'$p$,                                                  '{myr_app_admin_settle_info_check}'),
  ('토스 refSellerId = 마지막 등록 시도의 것인가',     $p$p_ref\s*=\s*\w+\.myr_toss_ref$p$,                                  '{myr_toss_ref_is_last}'),
  ('세금계산서 · 토스 등록 이메일(크리에이터 이메일 · 없으면 계정 이메일)', $p$coalesce\(\s*\w+\.email\s*,\s*\(select\s+\w+\.email\s+from\s+auth\.users$p$, '{myr_seller_tax_email}'),
  -- 0123 공휴일 동기화
  ('KST 올해(동기화할 연도 · 올해 빈 목록 · 올해 비었나)', $p$extract\(year\s+from\s+public\.myr_kst_date$p$,           '{myr_holiday_this_year}'),
  ('올해를 동기화 연도 첫 칸으로 고르기 — 금지 · myr_holiday_this_year', $p$myr_holiday_sync_years\([^)]*\)\)\[1\]$p$,   '{}'),
  ('공휴일 이름 글자 수(1~40) — 표 제약도 이 함수', $p$char_length\([^;]*\)\s+between\s+1\s+and\s+40$p$,                '{myr_holiday_name_ok}'),
  ('그해 날짜인가',                              $p$extract\(year\s+from\s+(p_day|[\w.]*day)\)$p$,               '{myr_holiday_in_year}'),
  ('올해 공휴일이 비었나',                       $p$myr_holiday_count\([^;]*\)\s*=\s*0$p$,                             '{myr_holidays_missing}'),
  ('첫 영업일 찾기',                             $p$myr_is_business_day\(\w+::date\)$p$,                               '{myr_business_day_from}'),
  ('다음 지급 시각(영업일 오후 1시)',            $p$myr_business_day_from\(public\.myr_kst_date$p$,                   '{myr_payout_next_run}'),
  ('지금 보낼 지급 건(지급 가능 · 송금 중 아님 · 계좌 · 운영 실패 아님)', $p$'account'\s*,\s*'ops'$p$,                   '{myr_payout_sendable}'),
  ('그날 요청한 지급 건(시도한 날 · 실패 확정 아님)', $p$myr_kst_date\(\w+\.transfer_at\)|transfer_fail\s*=\s*'check'$p$, '{myr_payout_requested_on}'),
  ('계좌번호 형식(숫자 8~14자리 · 토스 최대 14)', $p$\\d\{8,1[46]\}$p$,                                              '{myr_account_ok}'),
  -- 상태 비교는 정규형으로만(status = 'X' · <> · in (…) · 값이 빌 수 있으면 coalesce(status = 'X', false)) — 판정별 규칙이 정규형으로 적혀 있으므로
  --   다른 모양(순서 바꾸기 · != · any(array) · is distinct from · 형 변환 · 값 하나짜리 in)은 금지해 빠져나가지 못하게 한다. 변수(v_status · p_ship_status)도 같다.
  --   순서 바꾸기에서 JSON 키 비교(x ->> 'status' = p_status)는 상태 글자 비교가 아니라 뺀다(따옴표 앞이 >)
  ('상태 비교 순서 바꾸기(''X'' = status) — 금지 · status = ''X'' 로', $p$(^|[^>\s])\s*'\w+'\s*(=|<>|!=)\s*[\w.]*status\M$p$, '{}'),
  ('상태 비교 != — 금지 · <> 로',               $p$status\s*!=$p$,                                                         '{}'),
  ('상태 비교 = any(array) — 금지 · in (…) 로', $p$status\s*=\s*any\s*\($p$,                                             '{}'),
  ('상태 비교 is distinct from — 금지 · coalesce(status = ''X'', false) 로', $p$status\s+is\s+(not\s+)?distinct\s+from\s*'$p$, '{}'),
  ('상태 비교 형 변환(status::text = ''X'') — 금지 · status = ''X'' 로', $p$status::\w+\s*(=|<>|!=)$p$,                         '{}'),
  ('상태 비교 값 하나짜리 in(status in (''X'')) — 금지 · status = ''X'' 로', $p$status\s+(not\s+)?in\s*\(\s*'\w+'\s*\)$p$,    '{}'),
  ('운영 설정 읽기',                          $p$platform_settings$p$,                                           '{myr_shipping_rule,myr_settlement_pct,myr_deposit_pct,myr_claim_return_fee,myr_claim_answer_days,myr_payout_toss_on,myr_payout_daily_cap}');

-- 표 제약도 같은 형식 규칙을 따로 쓰지 않는다(함수 본문 검사가 못 보는 곳) — 휴대폰 형식은 myr_mobile_ok
select is((select string_agg(c.conrelid::regclass || '.' || c.conname, ', ') from pg_constraint c where c.contype = 'c' and pg_get_constraintdef(c.oid) ~ '01\[016789\]'), null,
          '표 제약에 휴대폰 정규식이 없다(myr_mobile_ok 를 부른다)');
-- 한 함수 안에서 같은 조건을 두 번 쓰지 않는다(지급 건 만들기 — 담을 줄은 한 번만 고른다)
select is((select count(*)::int from _fn f, regexp_matches(f.src, 'not\s+p_past_run', 'g') where f.proname = 'myr_payout_collect'), 1, '지급 건 만들기 — 담을 줄 조건은 한 번만');
select is(coalesce((select string_agg(f.proname, ', ' order by f.proname) from _fn f where f.src ~ r.pat and not (f.proname = any (r.allowed))), ''), '',
          r.label || ' — 지정한 함수 밖에 이 식이 없다') from _rules r order by r.ord;
-- 검사가 살아 있는지 — 식이 판정의 주인 함수에는 있어야 한다(패턴이 틀려 아무것도 못 잡는 검사를 막는다)
--   허용 목록이 빈 규칙(금지 패턴)은 주인이 없으니 이 확인에서 뺀다
select is((select count(*)::int from _rules r where r.allowed <> '{}' and not exists (select 1 from _fn f where f.proname = r.allowed[1] and f.src ~ r.pat)), 0, '모든 검사 식이 주인 함수에는 있다(죽은 검사 없음)');

select * from finish();
rollback;
