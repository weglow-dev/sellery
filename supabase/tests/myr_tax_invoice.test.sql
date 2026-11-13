-- pgTAP — 0104 세금계산서 수취 확인: 권한 · 합계(정산금 − 상계 · 보증금 환급 제외) · 공급가액/세액(÷11 버림) · 작성일자/발행 기한 · 승인번호 형식 ·
--   지급 건 보류 이유 tax_invoice(사업자 정보 이유 다음) · 크리에이터 제출 · 운영 확인 · 다시 제출 요청 · 금액 바뀜 · 지급 완료 뒤 · 목록 · 보고 · 정산 탭 · 이력 · 표 제약
-- 2034년 회차를 쓴다(다른 정산 테스트와 겹치지 않게). 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(73);

-- ---------- 권한 ----------
select function_privs_are('public', 'myr_app_seller_tax_invoice_submit', '{uuid,date,text,"timestamp with time zone"}'::text[], 'anon', '{}'::text[], 'anon 은 세금계산서 제출 불가');
select function_privs_are('public', 'myr_app_seller_tax_invoice_submit', '{uuid,date,text,"timestamp with time zone"}'::text[], 'authenticated', '{}'::text[], 'authenticated 도 세금계산서 제출 불가');
select function_privs_are('public', 'myr_app_seller_tax_invoice_submit', '{uuid,date,text,"timestamp with time zone"}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 세금계산서 제출 가능');
select function_privs_are('public', 'myr_tax_invoice_list', '{date,text,"timestamp with time zone"}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 세금계산서 목록 불가');
select function_privs_are('public', 'myr_tax_invoice_list', '{date,text,"timestamp with time zone"}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 세금계산서 목록 가능');
select function_privs_are('public', 'myr_tax_invoice_accept', '{date,text,text}'::text[], 'anon', '{}'::text[], 'anon 은 세금계산서 확인 불가');
select function_privs_are('public', 'myr_tax_invoice_accept', '{date,text,text}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 세금계산서 확인 가능');
select function_privs_are('public', 'myr_tax_invoice_return', '{date,text,text,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 다시 제출 요청 불가');
select function_privs_are('public', 'myr_tax_invoice_return', '{date,text,text,text}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 다시 제출 요청 가능');
select function_privs_are('public', 'myr_payout_invoice_json', '{myr_payouts,"timestamp with time zone"}'::text[], 'anon', '{}'::text[], 'anon 은 invoice_json 불가');
select table_privs_are('public', 'myr_tax_invoices', 'authenticated', '{}'::text[], 'authenticated 는 세금계산서 표 권한 없음');
select table_privs_are('public', 'myr_tax_invoice_logs', 'anon', '{}'::text[], 'anon 은 세금계산서 이력 표 권한 없음');
select ok((select relrowsecurity from pg_class where oid = 'public.myr_tax_invoices'::regclass) and (select relrowsecurity from pg_class where oid = 'public.myr_tax_invoice_logs'::regclass), '두 표 RLS on');

-- ---------- 순수 함수 ----------
select is((select jsonb_agg(jsonb_build_array(t, a.supply, a.tax, a.supply + a.tax = t) order by t) from unnest(array[0, 1, 11, 21, 600000, 1234567]) t, lateral public.myr_tax_invoice_amounts(t) a),
          '[[0, 0, 0, true], [1, 1, 0, true], [11, 10, 1, true], [21, 20, 1, true], [600000, 545455, 54545, true], [1234567, 1122334, 112233, true]]'::jsonb,
          '공급가액 · 세액 — 세액 = 합계 ÷ 11 버림 · 공급가액 = 나머지 · 합이 합계와 같다');
select is(jsonb_build_array(public.myr_tax_invoice_write_date('2034-01-15'), public.myr_tax_invoice_due('2034-01-01'),
                            public.myr_tax_invoice_write_date('2032-02-01'), public.myr_tax_invoice_due('2032-02-01'),
                            public.myr_tax_invoice_write_date('2034-12-01'), public.myr_tax_invoice_due('2034-12-01')),
          '["2034-01-31", "2034-02-10", "2032-02-29", "2032-03-10", "2034-12-31", "2035-01-10"]'::jsonb, '작성일자 = 정산월 말일(윤년 포함) · 발행 기한 = 다음 달 10일(해 넘김 포함)');
select is(jsonb_build_array(public.myr_tax_invoice_no('20340201-41000000-A1b2C3d4'), public.myr_tax_invoice_no(' 20340201 41000000 12345678 '),
                            public.myr_tax_invoice_no('20340201-41000000-1234567'), public.myr_tax_invoice_no('2034020a-41000000-12345678'),
                            public.myr_tax_invoice_no('20340201-41000000-1234-5678'), public.myr_tax_invoice_no(null)),
          '["2034020141000000a1b2c3d4", "203402014100000012345678", null, null, "203402014100000012345678", null]'::jsonb,
          '승인번호 — 하이픈 · 공백 빼고 소문자 · 앞 8자리 숫자 + 16자리 · 아니면 null');
select is(jsonb_build_array(public.myr_tax_invoice_status_label(null), public.myr_tax_invoice_status_label('submitted'), public.myr_tax_invoice_status_label('accepted'),
                            public.myr_tax_invoice_status_label('returned'), public.myr_payout_hold_label('tax_invoice')),
          '["제출 전", "확인 중", "확인 완료", "다시 제출 필요", "세금계산서 확인 전"]'::jsonb, '상태 · 보류 이유 문구');

-- ---------- 픽스처 ----------
-- T1: 확인 완료 · 제조금액 0 → 정산금 3만 = 합계 3만
-- T2: 확인 완료 · 제조금액 1만(보증금 2,500 입금) → 정산금 3만 − 상계 1만 = 합계 2만 · 보증금 환급 2,500 → 지급 2.25만
-- T3: 확인 완료 · 제조금액 3만(보증금 7,500 입금) → 전부 상계 · 합계 0 · 보증금 환급만 7,500 → 세금계산서 필요 없음
-- T4: 사업자 정보 미입력 · 제조금액 0 → 합계 3만
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select ('00000000-0000-4000-8000-0000000e70c' || n)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pgtap-ti' || n || '@myr.test', '', now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from generate_series(1, 4) n;
insert into public.sellers (id, name, handle, platform, active, user_id, myr_settle_status, biz_no, tax_info)
values ('00000000-0000-4000-8000-0000000e7001', '계산서 1', '@pgtap.ti1', 'instagram', true, '00000000-0000-4000-8000-0000000e70c1', 'verified', '1234567891', '{"company": "티원상회", "ceo": "계산서 1"}'),
       ('00000000-0000-4000-8000-0000000e7002', '계산서 2', '@pgtap.ti2', 'instagram', true, '00000000-0000-4000-8000-0000000e70c2', 'verified', null, null),
       ('00000000-0000-4000-8000-0000000e7003', '계산서 3', '@pgtap.ti3', 'instagram', true, '00000000-0000-4000-8000-0000000e70c3', 'verified', null, null),
       ('00000000-0000-4000-8000-0000000e7004', '계산서 4', '@pgtap.ti4', 'instagram', true, '00000000-0000-4000-8000-0000000e70c4', 'none', null, null);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
select ('00000000-0000-4000-8000-0000000e7a0' || n)::uuid, 'pgtap-ti-' || n, ('00000000-0000-4000-8000-0000000e700' || n)::uuid, 'diet', 'T' || n, 10000, 1000, 'listed', 'grape'
  from generate_series(1, 4) n;
select public.myr_mfg_add('00000000-0000-4000-8000-0000000e7a01', 0, '제조금액 없음', 'test');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000e7a02', 10000, '1차', 'test');
select public.myr_mfg_deposit('00000000-0000-4000-8000-0000000e7a02', 1, '2034-01-03 10:00+09');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000e7a03', 30000, '1차', 'test');
select public.myr_mfg_deposit('00000000-0000-4000-8000-0000000e7a03', 1, '2034-01-03 10:00+09');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000e7a04', 0, '제조금액 없음', 'test');
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount)
values ('00000000-0000-4000-8000-0000000e7b01', 'pgtap-ti-1', 'PAID', '2034-01-02', '김지은', '{}', '주문', 0);
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, qty, unit_price, ship_status, delivered_at)
select ('00000000-0000-4000-8000-0000000e7d0' || n)::uuid, '00000000-0000-4000-8000-0000000e7b01', ('00000000-0000-4000-8000-0000000e7a0' || n)::uuid,
       ('00000000-0000-4000-8000-0000000e700' || n)::uuid, '줄', 5, 10000, 'DELIVERED', '2034-01-10 12:00+09'
  from generate_series(1, 4) n;
select is(public.myr_settlement_run('2034-01-01', 'test', '2034-02-01 13:00+09') ->> 'ok', 'true', '1월 회차(2월 1일 13시)');

create function pg_temp.po(p_handle text) returns public.myr_payouts language sql as $$ select public.myr_payout_find('2034-01-01', p_handle) $$;
create function pg_temp.st(p_handle text) returns jsonb language sql as $$
  select jsonb_build_array(p.status, p.hold_reason, public.myr_payout_payable(p)) from public.myr_payouts p where p.id = (pg_temp.po(p_handle)).id
$$;
create function pg_temp.submit(n int, p_no text, p_now timestamptz default '2034-02-05 10:00+09') returns jsonb language sql as $$
  select public.myr_app_seller_tax_invoice_submit(('00000000-0000-4000-8000-0000000e70c' || n)::uuid, '2034-01-01', p_no, p_now)
$$;
create function pg_temp.inv(p_handle text, p_now timestamptz default '2034-02-05 10:00+09') returns jsonb language sql as $$
  select public.myr_payout_invoice_json(pg_temp.po(p_handle), p_now)
$$;

-- ---------- 합계 · 필요 여부 · 자동 상태 ----------
select is((select jsonb_agg(jsonb_build_array(h, public.myr_payout_amount(pg_temp.po(h)), public.myr_payout_invoice_total(pg_temp.po(h)), public.myr_payout_needs_invoice(pg_temp.po(h))) order by h)
             from unnest(array['@pgtap.ti1', '@pgtap.ti2', '@pgtap.ti3', '@pgtap.ti4']) h),
          '[["@pgtap.ti1", 30000, 30000, true], ["@pgtap.ti2", 22500, 20000, true], ["@pgtap.ti3", 7500, 0, false], ["@pgtap.ti4", 30000, 30000, true]]'::jsonb,
          '[지급 건 금액, 세금계산서 합계, 필요] — 합계 = 정산금 − 상계(보증금 환급 제외) · 보증금 환급만이면 필요 없음');
select is((select jsonb_object_agg(h, pg_temp.st(h)) from unnest(array['@pgtap.ti1', '@pgtap.ti2', '@pgtap.ti3', '@pgtap.ti4']) h),
          '{"@pgtap.ti1": ["held", "tax_invoice", false], "@pgtap.ti2": ["held", "tax_invoice", false], "@pgtap.ti3": ["pending", null, true], "@pgtap.ti4": ["held", "settle_info", false]}'::jsonb,
          '자동 상태 — 세금계산서 확인 전이면 보류 · 필요 없으면 지급 대기 · 사업자 정보 이유가 먼저');
select is((select jsonb_object_agg(h, jsonb_path_query_array(public.myr_payout_holds_json(pg_temp.po(h)), '$[*].code')) from unnest(array['@pgtap.ti1', '@pgtap.ti3', '@pgtap.ti4']) h),
          '{"@pgtap.ti1": ["tax_invoice"], "@pgtap.ti3": [], "@pgtap.ti4": ["settle_info", "tax_invoice"]}'::jsonb,
          '보류 이유 전부 — 사업자 정보와 세금계산서가 같이 걸리면 둘 다(먼저 볼 이유부터) · 보류가 아니면 빈 배열');
select is(jsonb_path_query_array(public.myr_payout_holds_json(pg_temp.po('@pgtap.ti4')), '$[*].label'), '["사업자 · 정산 정보 확인 전", "세금계산서 확인 전"]'::jsonb, '보류 이유 문구 둘');
select public.myr_payout_hold('2034-01-01', '@pgtap.ti4', '계좌 다시 확인', 'test');
select is(jsonb_path_query_array(public.myr_payout_holds_json(pg_temp.po('@pgtap.ti4')), '$[*].code'), '["manual", "settle_info", "tax_invoice"]'::jsonb, '운영 보류 중이면 운영 보류 먼저 · 자동 이유도 같이');
select public.myr_payout_release('2034-01-01', '@pgtap.ti4', 'test');
select is(pg_temp.inv('@pgtap.ti2') - 'submitted_at' - 'checked_at',
          '{"needed": true, "show": true, "total": 20000, "supply": 18182, "tax": 1818, "write_date": "2034-01-31", "due_date": "2034-02-10", "overdue": false, "todo": true,
            "status": "none", "status_label": "제출 전", "accepted": false, "approval_no": null, "return_note": null, "amount_changed": false, "can_submit": true}'::jsonb,
          'T2 응답 — 합계 2만 · 공급가액 18,182 · 세액 1,818 · 작성일자 1/31 · 기한 2/10 · 제출 전 · 제출 가능');
select is(jsonb_build_array(pg_temp.inv('@pgtap.ti2', '2034-02-10 23:59+09') -> 'overdue', pg_temp.inv('@pgtap.ti2', '2034-02-11 00:00+09') -> 'overdue'), '[false, true]'::jsonb,
          '기한 지남 — 10일까지는 아님 · 11일(KST)부터');
select is(jsonb_build_array(public.myr_tax_invoice_open(pg_temp.po('@pgtap.ti2')), public.myr_tax_invoice_open(pg_temp.po('@pgtap.ti3'))), '[true, false]'::jsonb,
          '아직 받는 지급 건 — 필요하고 지급 전 · 필요 없으면 아님');
select is(jsonb_build_array(pg_temp.inv('@pgtap.ti3') -> 'needed', pg_temp.inv('@pgtap.ti3') -> 'show', pg_temp.inv('@pgtap.ti3') -> 'can_submit'), '[false, false, false]'::jsonb, 'T3 — 세금계산서 칸 없음');

-- ---------- 크리에이터 제출 — 거절 ----------
select is(public.myr_app_seller_tax_invoice_submit('00000000-0000-4000-8000-00000000ffff', '2034-01-01', '20340203-41000000-11111111') ->> 'code', 'NOT_FOUND', '크리에이터가 아닌 계정');
select is(pg_temp.submit(1, '20340203-4100000-1111111') ->> 'code', 'BAD_NO', '형식이 틀린 승인번호(22자리)');
select is(public.myr_app_seller_tax_invoice_submit('00000000-0000-4000-8000-0000000e70c1', '2034-02-01', '20340203-41000000-11111111') ->> 'code', 'NOT_FOUND', '회차가 없는 달');
select is(pg_temp.submit(3, '20340203-41000000-33333333') ->> 'code', 'NOT_NEEDED', 'T3 — 세금계산서가 필요 없는 지급 건');

-- ---------- 제출 ----------
select is(pg_temp.submit(1, '20340203-41000000-11111110') #>> '{invoice,status}', 'submitted', 'T1 제출');
select is(pg_temp.submit(2, '20340203-41000000-11111110') ->> 'code', 'DUPLICATE_NO', '다른 지급 건에 쓴 승인번호');
select is(pg_temp.submit(1, '20340203-41000000-11111111') #>> '{invoice,approval_no}', '203402034100000011111111', '확인 전이면 고쳐 다시 낼 수 있다(승인번호 정리해서 저장)');
select is(jsonb_build_array(pg_temp.inv('@pgtap.ti1') ->> 'status_label', pg_temp.inv('@pgtap.ti1') -> 'can_submit', pg_temp.inv('@pgtap.ti1', '2034-02-20 10:00+09') -> 'overdue', pg_temp.inv('@pgtap.ti1') -> 'todo'),
          '["확인 중", true, false, false]'::jsonb, '확인 중 — 고쳐 낼 수 있고 · 낸 뒤에는 기한 지남 · 할 일이 아니다');
select is(pg_temp.st('@pgtap.ti1'), '["held", "tax_invoice", false]'::jsonb, '제출만으로는 지급 보류 그대로');

-- ---------- 운영 확인 — 거절 ----------
select is(public.myr_tax_invoice_accept('2034-01-01', '@pgtap.nobody', 'test') ->> 'code', 'NOT_FOUND', '없는 지급 건');
select is(public.myr_tax_invoice_accept('2034-01-01', '@pgtap.ti2', 'test') ->> 'code', 'NOT_SUBMITTED', '아직 안 낸 세금계산서');
update public.myr_tax_invoices set total = 29999 where payout_id = (pg_temp.po('@pgtap.ti1')).id;
select is(public.myr_tax_invoice_accept('2034-01-01', '@pgtap.ti1', 'test') - 'ok', '{"code": "AMOUNT_CHANGED", "submitted_total": 29999, "total": 30000}'::jsonb, '낸 합계와 지금 합계가 다르면 거절 · 두 금액을 같이');
select is(pg_temp.inv('@pgtap.ti1') -> 'amount_changed', 'true'::jsonb, '크리에이터 응답에도 금액 바뀜');
update public.myr_tax_invoices set total = 30000 where payout_id = (pg_temp.po('@pgtap.ti1')).id;

-- ---------- 운영 확인 ----------
select is(public.myr_tax_invoice_accept('2034-01-01', '@pgtap.ti1', 'test') - 'ok', '{"status": "pending", "hold_reason": null, "hold_label": null, "payable": true}'::jsonb, 'T1 확인 → 지급 대기 · 지급 가능');
select is(public.myr_tax_invoice_accept('2034-01-01', '@pgtap.ti1', 'test') ->> 'code', 'ALREADY_ACCEPTED', '다시 확인하면 ALREADY_ACCEPTED');
select is(pg_temp.submit(1, '20340203-41000000-11111112') ->> 'code', 'ALREADY_ACCEPTED', '확인 완료 뒤에는 크리에이터가 바꿀 수 없다');
select is(jsonb_build_array(pg_temp.inv('@pgtap.ti1') ->> 'status_label', pg_temp.inv('@pgtap.ti1') -> 'can_submit'), '["확인 완료", false]'::jsonb, '확인 완료 · 제출 불가');
select is((select jsonb_agg(e #>> '{seller,handle}' order by e #>> '{seller,handle}') from jsonb_array_elements(public.myr_payout_to_pay('2034-01-01')) e where e #>> '{seller,handle}' like '@pgtap.ti%'),
          '["@pgtap.ti1", "@pgtap.ti3"]'::jsonb, '지급 목록 — 확인된 T1 · 세금계산서가 필요 없는 T3');

-- ---------- 다시 제출 요청 ----------
select is(public.myr_tax_invoice_return('2034-01-01', '@pgtap.ti1', '  ', 'test') ->> 'code', 'REASON_REQUIRED', '다시 제출 요청은 사유 필수');
select is(public.myr_tax_invoice_return('2034-01-01', '@pgtap.ti2', '금액', 'test') ->> 'code', 'NOT_SUBMITTED', '안 낸 세금계산서는 요청할 것이 없다');
select is(public.myr_tax_invoice_return('2034-01-01', '@pgtap.ti1', '작성일자가 1월 31일이 아니에요', 'test') - 'ok', '{"status": "held", "hold_reason": "tax_invoice"}'::jsonb, '확인 완료도 지급 전이면 되돌릴 수 있다 → 다시 보류');
select is(pg_temp.inv('@pgtap.ti1', '2034-02-11 10:00+09') - 'submitted_at' - 'checked_at' - 'supply' - 'tax' - 'write_date' - 'due_date' - 'needed' - 'show' - 'total',
          '{"overdue": true, "todo": true, "status": "returned", "status_label": "다시 제출 필요", "accepted": false, "approval_no": "203402034100000011111111", "return_note": "작성일자가 1월 31일이 아니에요",
            "amount_changed": false, "can_submit": true}'::jsonb, '크리에이터 — 다시 제출 필요 · 사유 · 기한 지났으면 기한 지남');
select is(public.myr_tax_invoice_return('2034-01-01', '@pgtap.ti1', '또', 'test') ->> 'code', 'NOT_SUBMITTED', '이미 다시 제출 요청 중');
select is(pg_temp.submit(1, '20340211-41000000-11111113', '2034-02-11 10:00+09') #>> '{invoice,return_note}', null, '다시 내면 사유는 지운다');
select is(public.myr_tax_invoice_accept('2034-01-01', '@pgtap.ti1', 'test') ->> 'status', 'pending', '다시 확인 → 지급 대기');

-- ---------- 지급 완료 뒤 ----------
select is(public.myr_payout_mark_paid('2034-01-01', '@pgtap.ti1', 30000, '2034-02-12', '1월분', 'test', '2034-02-12 10:00+09') ->> 'ok', 'true', 'T1 지급 완료');
select is(pg_temp.submit(1, '20340211-41000000-11111114') ->> 'code', 'ALREADY_PAID', '지급 완료 뒤 제출 불가');
select is(public.myr_tax_invoice_return('2034-01-01', '@pgtap.ti1', '사유', 'test') ->> 'code', 'ALREADY_PAID', '지급 완료 뒤 다시 제출 요청 불가');
select is(public.myr_tax_invoice_accept('2034-01-01', '@pgtap.ti1', 'test') ->> 'code', 'ALREADY_PAID', '지급 완료 뒤 확인 불가');
select is(public.myr_payout_unmark_paid('2034-01-01', '@pgtap.ti1', '잘못 기록', 'test') - 'ok', '{"status": "pending", "hold_reason": null}'::jsonb, '지급 완료 취소 → 세금계산서는 확인된 채라 지급 대기');

-- ---------- 사업자 정보 이유가 먼저 ----------
select is(pg_temp.submit(4, '20340203-41000000-44444444') ->> 'ok', 'true', 'T4 — 사업자 정보 확인 전에도 낼 수 있다');
select is(public.myr_tax_invoice_accept('2034-01-01', '@pgtap.ti4', 'test') - 'ok', '{"status": "held", "hold_reason": "settle_info", "hold_label": "사업자 · 정산 정보 확인 전", "payable": false}'::jsonb,
          '세금계산서를 확인해도 사업자 정보 확인 전이면 그 이유로 보류');
update public.sellers set myr_settle_status = 'verified' where id = '00000000-0000-4000-8000-0000000e7004';
select is(pg_temp.st('@pgtap.ti4'), '["pending", null, true]'::jsonb, '사업자 정보 확인(트리거) → 지급 대기');

-- ---------- 금액이 바뀐 확인 완료는 지급 불가 ----------
update public.myr_tax_invoices set total = 29000 where payout_id = (pg_temp.po('@pgtap.ti4')).id;
select is(jsonb_build_array(public.myr_payout_invoice_ok(pg_temp.po('@pgtap.ti4')), (public.myr_payout_auto_state(pg_temp.po('@pgtap.ti4'))).hold_reason), '[false, "tax_invoice"]'::jsonb,
          '확인 완료라도 합계가 다르면 세금계산서 이유로 보류');
update public.myr_tax_invoices set total = 30000 where payout_id = (pg_temp.po('@pgtap.ti4')).id;

-- ---------- 운영 목록 ----------
select pg_temp.submit(2, '20340204-41000000-22222222');
select is((select jsonb_agg(jsonb_build_array(e #>> '{seller,handle}', e #>> '{invoice,status}', (e #>> '{invoice,total}')::int) order by e #>> '{seller,handle}')
             from jsonb_array_elements(public.myr_tax_invoice_list('2034-01-01', null, '2034-02-05 10:00+09')) e where e #>> '{seller,handle}' like '@pgtap.ti%'),
          '[["@pgtap.ti1", "accepted", 30000], ["@pgtap.ti2", "submitted", 20000], ["@pgtap.ti4", "accepted", 30000]]'::jsonb, '목록(그 달 전부 · 로컬 실제 데이터가 섞일 수 있어 테스트 셀러만) — 세금계산서가 필요한 지급 건만(T3 없음)');
select is((select jsonb_agg(e #>> '{seller,handle}') from jsonb_array_elements(public.myr_tax_invoice_list(null, 'submitted')) e where e #>> '{seller,handle}' like '@pgtap.ti%'),
          '["@pgtap.ti2"]'::jsonb, '확인 대기(submitted)만 · 달 없이');
select is((select jsonb_build_array(e ->> 'month', e #>> '{seller,company}', e #>> '{seller,biz_no}') from jsonb_array_elements(public.myr_tax_invoice_list('2034-01-01', 'accepted')) e where e #>> '{seller,handle}' = '@pgtap.ti1'),
          '["2034-01", "티원상회", "1234567891"]'::jsonb, '홈택스 대조용 — 상호 · 사업자등록번호 원문(service_role 만)');

-- ---------- 보고 · 정산 탭 ----------
select is(jsonb_build_array(pg_temp.inv('@pgtap.ti1') -> 'accepted', pg_temp.inv('@pgtap.ti2') -> 'accepted'), '[true, false]'::jsonb, '응답 accepted — 확인 완료만 true');
select is((select jsonb_object_agg(e #>> '{seller,handle}', jsonb_build_array(e ->> 'status', e #>> '{invoice,status}')) from jsonb_array_elements(public.myr_settlement_report('2034-01-01') -> 'payouts') e where e #>> '{seller,handle}' like '@pgtap.ti%'),
          '{"@pgtap.ti1": ["pending", "accepted"], "@pgtap.ti2": ["held", "submitted"], "@pgtap.ti3": ["pending", "none"], "@pgtap.ti4": ["pending", "accepted"]}'::jsonb, '보고 — 지급 건마다 세금계산서 상태');
select is((select jsonb_build_array(m ->> 'payout_status', jsonb_path_query_array(m -> 'holds', '$[*].label'), m #>> '{invoice,status_label}', (m #>> '{invoice,total}')::int, (m #>> '{invoice,supply}')::int)
             from jsonb_array_elements(public.myr_app_seller_settlements_of_user('00000000-0000-4000-8000-0000000e70c2', '2034-02-05 10:00+09') -> 'months') m where m ->> 'month' = '2034-01'),
          '["held", ["세금계산서 확인 전"], "확인 중", 20000, 18182]'::jsonb, '정산 탭(T2) — 지급 보류 · 이유 목록 · 세금계산서 상태 · 합계 · 공급가액');
select is((select count(*)::int from jsonb_array_elements(public.myr_app_seller_settlements_of_user('00000000-0000-4000-8000-0000000e70c3') -> 'months') m where m ->> 'month' = '2034-01' and (m #>> '{invoice,show}')::boolean),
          0, '정산 탭(T3) — 세금계산서 칸 없음');

-- ---------- 이력 ----------
-- 같은 트랜잭션이라 시각이 같아 순서 대신 동작별로 센다
select is((select jsonb_object_agg(a, c) from (select l.action as a, count(*)::int as c from public.myr_tax_invoice_logs l join public.myr_tax_invoices i on i.id = l.invoice_id
                                                where i.payout_id = (pg_temp.po('@pgtap.ti1')).id group by l.action) x),
          '{"submit": 3, "accept": 2, "return": 1}'::jsonb, '이력 — 제출 3(첫 제출 · 고침 · 다시 제출) · 확인 2 · 다시 제출 요청 1(거절은 남기지 않는다)');
select is((select l.note from public.myr_tax_invoice_logs l join public.myr_tax_invoices i on i.id = l.invoice_id where i.payout_id = (pg_temp.po('@pgtap.ti1')).id and l.action = 'return'),
          '작성일자가 1월 31일이 아니에요', '다시 제출 요청 사유가 이력에 남는다');

-- ---------- 표 제약 ----------
select throws_ok($$update public.myr_tax_invoices set status = 'returned' where payout_id = (pg_temp.po('@pgtap.ti2')).id$$, '23514', null, '다시 제출 요청인데 사유가 없으면 막는다');
select throws_ok($$update public.myr_tax_invoices set status = 'oops' where payout_id = (pg_temp.po('@pgtap.ti2')).id$$, '23514', null, '정해진 상태만');
select throws_ok($$insert into public.myr_tax_invoice_logs (invoice_id, action, actor) select id, 'oops', 'test' from public.myr_tax_invoices limit 1$$, '23514', null, '이력 동작은 submit · accept · return 만');

select * from finish();
rollback;
