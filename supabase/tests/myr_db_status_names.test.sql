-- pgTAP — 0120 DB 상태 비교 · 한도 · 형식을 이름 붙은 함수로(결과 그대로): 입금 대기 · 요청 진행 중 · 수정본 심사 중 · 줄 배송 상태 ·
--   상품 이미지 · 문의 본문 한도 · 택배사 · 송장번호 · 줄 응답 valid(취소 아닌 줄 · 배송 상자 표시).
begin;
select plan(26);

-- ---------- 권한 ----------
select function_privs_are('public', f, a::text[], 'authenticated', '{}'::text[], 'authenticated 는 ' || f || ' 불가')
  from (values ('myr_order_status_waiting_deposit', '{text}'), ('myr_claim_in_progress', '{myr_refund_requests}'), ('myr_revision_pending', '{myr_product_revisions}'),
               ('myr_ship_status_awaiting_prepare', '{text}'), ('myr_ship_status_preparing', '{text}'), ('myr_ship_status_shipping', '{text}'),
               ('myr_ship_status_delivered', '{text}'), ('myr_ship_status_syncing', '{text}'), ('myr_product_image_max', '{}'), ('myr_cs_body_max', '{}'),
               ('myr_courier_ok', '{text}'), ('myr_tracking_no', '{text}'), ('myr_tracking_ok', '{text}')) v(f, a);

-- ---------- 상태 ----------
select is((select jsonb_object_agg(st, public.myr_order_status_waiting_deposit(st)) from unnest(array['WAITING_DEPOSIT', 'PAID', 'CANCELED']) st),
          '{"WAITING_DEPOSIT": true, "PAID": false, "CANCELED": false}'::jsonb, '입금 대기 = WAITING_DEPOSIT 만');
select is((select jsonb_object_agg(st, public.myr_claim_in_progress(jsonb_populate_record(null::public.myr_refund_requests, jsonb_build_object('status', st)))) from unnest(array['pending', 'progress', 'done', 'rejected']) st),
          '{"pending": false, "progress": true, "done": false, "rejected": false}'::jsonb, '요청 진행 중 = progress 만');
select is((select jsonb_object_agg(st, public.myr_revision_pending(jsonb_populate_record(null::public.myr_product_revisions, jsonb_build_object('status', st)))) from unnest(array['pending', 'approved', 'rejected', 'canceled']) st),
          '{"pending": true, "approved": false, "rejected": false, "canceled": false}'::jsonb, '수정본 심사 중 = pending 만');
select is((select jsonb_object_agg(st, jsonb_build_array(public.myr_ship_status_awaiting_prepare(st), public.myr_ship_status_preparing(st), public.myr_ship_status_shipping(st),
                                                        public.myr_ship_status_delivered(st), public.myr_ship_status_syncing(st)))
             from unnest(array['PAID', 'PREPARING', 'SHIPPING', 'DELIVERED']) st),
          '{"PAID": [true, false, false, false, false], "PREPARING": [false, true, false, false, true], "SHIPPING": [false, false, true, false, true], "DELIVERED": [false, false, false, true, false]}'::jsonb,
          '줄 배송 상태 — 발주 전 · 배송준비중 · 배송중 · 배송완료 · 이벗 동기화 대상(배송준비중 · 배송중)');
-- 로컬 DB 의 모든 줄에서 글자 비교와 같다
select is((select count(*)::int from public.myr_order_items i
            where public.myr_ship_status_awaiting_prepare(i.ship_status) is distinct from (i.ship_status = 'PAID')
               or public.myr_ship_status_delivered(i.ship_status) is distinct from (i.ship_status = 'DELIVERED')
               or public.myr_ship_status_syncing(i.ship_status) is distinct from (i.ship_status in ('PREPARING', 'SHIPPING'))), 0,
          '모든 줄 — 배송 상태 함수 = 글자 비교(계산 결과 불변)');

-- ---------- 한도 · 형식 ----------
select is(array[public.myr_product_image_max(), public.myr_cs_body_max()], array[6, 2000], '한도 — 상품 이미지 6장 · 문의 본문 2000자(화면 MAX_IMAGES · CS_BODY_MAX 와 같은 숫자)');
select is(array[public.myr_courier_ok('CJ대한통운'), public.myr_courier_ok('로젠택배'), public.myr_courier_ok('대한통운'), public.myr_courier_ok(null)], array[true, true, false, false],
          '택배사 — 목록 다섯 곳만(별칭은 화면이 바꿔 보낸다)');
select is(public.myr_tracking_no(' 6123-4567 8901 '), '612345678901', '송장번호 — 공백 · 하이픈 뺌');
select is(array[public.myr_tracking_ok('1234567'), public.myr_tracking_ok('12345678'), public.myr_tracking_ok(repeat('1', 30)), public.myr_tracking_ok(repeat('1', 31)), public.myr_tracking_ok('12345678a'), public.myr_tracking_ok(null)],
          array[false, true, true, false, false, false], '송장번호 형식 — 숫자 8 ~ 30자리');

-- ---------- 실제 처리가 같은 함수로 거절 ----------
insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-00000000fb61', '민지 루틴', '@pgtap.names', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-00000000fb71', 'pgtap-names-a', '00000000-0000-4000-8000-00000000fb61', 'diet', '포도 젤리', 10000, 50, 'listed', 'grape');
select is(public.myr_app_cs_open('00000000-0000-4000-8000-00000000fb71', null, null, '고객', '상품 문의', repeat('가', 2001)) - 'ok',
          '{"code": "BAD_BODY", "max": 2000}'::jsonb, '문의 2001자 — BAD_BODY · max 2000(myr_cs_body_max)');
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount, payment_key)
values ('00000000-0000-4000-8000-00000000fb81', 'pgtap-names-1', 'PAID', now(), '김지은', '{}', '젤리', 20000, 'pk-names');
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, option_name, qty, unit_price, status)
values ('00000000-0000-4000-8000-00000000fb91', '00000000-0000-4000-8000-00000000fb81', '00000000-0000-4000-8000-00000000fb71', '00000000-0000-4000-8000-00000000fb61', '젤리 A', '', 1, 10000, 'PAID'),
       ('00000000-0000-4000-8000-00000000fb92', '00000000-0000-4000-8000-00000000fb81', '00000000-0000-4000-8000-00000000fb71', '00000000-0000-4000-8000-00000000fb61', '젤리 B', '', 1, 10000, 'CANCELED');
select is(public.myr_app_admin_ship('pgtap-names-1', '대한통운', '612345678901') ->> 'code', 'BAD_COURIER', '송장 입력 — 목록 밖 택배사 BAD_COURIER(myr_courier_ok)');
select is(public.myr_app_admin_ship('pgtap-names-1', 'CJ대한통운', '1234-567') ->> 'code', 'BAD_TRACKING', '송장 입력 — 7자리 BAD_TRACKING(myr_tracking_ok)');
select is((select jsonb_object_agg(i.product_name, public.myr_order_item_json(i) -> 'valid') from public.myr_order_items i where i.order_id = '00000000-0000-4000-8000-00000000fb81'),
          '{"젤리 A": true, "젤리 B": false}'::jsonb, '줄 응답 valid — 취소 줄만 false(배송 상자 표시가 읽는 값)');

select * from finish();
rollback;
