-- pgTAP — 0102 지급 상태 · 보류 이유 · 지급 가능: 권한 · 사업자 정보 확인 전이면 지급 보류(settle_info) · 확인되면 트리거로 지급 대기 ·
--   운영 보류(manual)는 메모 필수 · 자동으로 풀리지 않음 · 해제하면 자동 상태로 · 지급 완료는 보류 불가 · 0원은 보류 불가 · 보고에 상태 · 이유 · 지급 가능
-- 2032년 회차를 쓴다(다른 정산 테스트와 겹치지 않게). 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(34);

-- ---------- 권한 ----------
select function_privs_are('public', 'myr_payout_hold', '{date,text,text,text}'::text[], 'anon', '{}'::text[], 'anon 은 payout_hold 불가');
select function_privs_are('public', 'myr_payout_hold', '{date,text,text,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 도 payout_hold 불가');
select function_privs_are('public', 'myr_payout_hold', '{date,text,text,text}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 payout_hold 가능');
select function_privs_are('public', 'myr_payout_release', '{date,text,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 payout_release 불가');
select function_privs_are('public', 'myr_payout_release', '{date,text,text}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 payout_release 가능');
select function_privs_are('public', 'myr_payout_refresh', '{uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 payout_refresh 불가');
select function_privs_are('public', 'myr_payout_payable', '{myr_payouts}'::text[], 'anon', '{}'::text[], 'anon 은 payout_payable 불가');
select function_privs_are('public', 'myr_seller_hold_reason', '{uuid}'::text[], 'anon', '{}'::text[], 'anon 은 seller_hold_reason 불가');

-- ---------- 픽스처 ----------
-- H1: 사업자 정보 미입력(none) · H2: 확인 완료 · H3: 확인 완료지만 정산금이 전부 상계(0원)
insert into public.sellers (id, name, handle, platform, active, myr_settle_status)
values ('00000000-0000-4000-8000-0000000c7001', '보류 1', '@pgtap.ph1', 'instagram', true, 'none'),
       ('00000000-0000-4000-8000-0000000c7002', '보류 2', '@pgtap.ph2', 'instagram', true, 'verified'),
       ('00000000-0000-4000-8000-0000000c7003', '보류 3', '@pgtap.ph3', 'instagram', true, 'verified');
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-0000000c7a01', 'pgtap-ph-1', '00000000-0000-4000-8000-0000000c7001', 'diet', 'P1', 10000, 1000, 'listed', 'grape'),
       ('00000000-0000-4000-8000-0000000c7a02', 'pgtap-ph-2', '00000000-0000-4000-8000-0000000c7002', 'diet', 'P2', 10000, 1000, 'listed', 'lemon'),
       ('00000000-0000-4000-8000-0000000c7a03', 'pgtap-ph-3', '00000000-0000-4000-8000-0000000c7003', 'diet', 'P3', 10000, 1000, 'listed', 'jelly');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000c7a01', 0, '제조금액 없음', 'test');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000c7a02', 0, '제조금액 없음', 'test');
select public.myr_mfg_add('00000000-0000-4000-8000-0000000c7a03', 1000000, '1차', 'test');
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount)
values ('00000000-0000-4000-8000-0000000c7b01', 'pgtap-ph-1', 'PAID', '2032-01-02', '김지은', '{}', '주문', 0);
insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, qty, unit_price, ship_status, delivered_at)
values ('00000000-0000-4000-8000-0000000c7d01', '00000000-0000-4000-8000-0000000c7b01', '00000000-0000-4000-8000-0000000c7a01', '00000000-0000-4000-8000-0000000c7001', '줄', 5, 10000, 'DELIVERED', '2032-01-10 12:00+09'),
       ('00000000-0000-4000-8000-0000000c7d02', '00000000-0000-4000-8000-0000000c7b01', '00000000-0000-4000-8000-0000000c7a02', '00000000-0000-4000-8000-0000000c7002', '줄', 2, 10000, 'DELIVERED', '2032-01-11 12:00+09'),
       ('00000000-0000-4000-8000-0000000c7d03', '00000000-0000-4000-8000-0000000c7b01', '00000000-0000-4000-8000-0000000c7a03', '00000000-0000-4000-8000-0000000c7003', '줄', 1, 10000, 'DELIVERED', '2032-01-12 12:00+09');
select is(public.myr_settlement_run('2032-01-01', 'test', '2032-02-01 13:00+09') ->> 'ok', 'true', '1월 회차');

create function pg_temp.st(p_handle text) returns jsonb language sql as $$
  select jsonb_build_array(p.status, p.hold_reason, public.myr_payout_payable(p)) from public.myr_payouts p where p.id = (public.myr_payout_find('2032-01-01', p_handle)).id
$$;

-- ---------- 자동 상태 ----------
select is(public.myr_seller_hold_reason('00000000-0000-4000-8000-0000000c7001'), 'settle_info', '사업자 정보 미입력 → 보류 이유 settle_info');
select is(public.myr_seller_hold_reason('00000000-0000-4000-8000-0000000c7002'), null, '확인 완료 → 보류 이유 없음');
select is(pg_temp.st('@pgtap.ph1'), '["held", "settle_info", false]'::jsonb, 'H1 — 지급 보류(사업자 정보 확인 전) · 지급 불가');
select is(pg_temp.st('@pgtap.ph2'), '["pending", null, true]'::jsonb, 'H2 — 지급 대기 · 지급 가능');
select is(pg_temp.st('@pgtap.ph3'), '["none", null, false]'::jsonb, 'H3 — 0원(전부 상계) · 지급 없음 · 지급 불가');

-- 사업자 정보 확인 상태가 바뀌면 트리거가 다시 정한다
update public.sellers set myr_settle_status = 'pending' where id = '00000000-0000-4000-8000-0000000c7001';
select is(pg_temp.st('@pgtap.ph1'), '["held", "settle_info", false]'::jsonb, '확인 중(pending)도 지급 보류');
update public.sellers set myr_settle_status = 'verified' where id = '00000000-0000-4000-8000-0000000c7001';
select is(pg_temp.st('@pgtap.ph1'), '["pending", null, true]'::jsonb, '확인 완료 → 트리거로 지급 대기 · 지급 가능');

-- ---------- 운영 보류 ----------
select is(public.myr_payout_hold('2032-01-01', '@pgtap.ph1', '  ', 'test') ->> 'code', 'NOTE_REQUIRED', '운영 보류는 메모 필수');
select is(public.myr_payout_hold('2032-01-01', '@pgtap.nobody', '메모', 'test') ->> 'code', 'NOT_FOUND', '없는 지급 건');
select is(public.myr_payout_hold('2032-01-01', '@pgtap.ph1', '계좌 확인 요청', 'test') ->> 'ok', 'true', 'H1 운영 보류');
select is(pg_temp.st('@pgtap.ph1'), '["held", "manual", false]'::jsonb, '운영 보류 — 지급 보류(manual) · 지급 불가');
select is((select hold_note || '/' || held_by from public.myr_payouts where id = (public.myr_payout_find('2032-01-01', '@pgtap.ph1')).id), '계좌 확인 요청/test', '메모 · 건 사람');
select is(public.myr_payout_hold('2032-01-01', '@pgtap.ph1', '또', 'test') ->> 'code', 'ALREADY_HELD', '이미 운영 보류');
-- 사람이 건 보류는 자동으로 풀리지 않는다
update public.sellers set myr_settle_status = 'pending' where id = '00000000-0000-4000-8000-0000000c7001';
update public.sellers set myr_settle_status = 'verified' where id = '00000000-0000-4000-8000-0000000c7001';
select is(pg_temp.st('@pgtap.ph1'), '["held", "manual", false]'::jsonb, '사업자 정보가 바뀌어도 운영 보류는 그대로');
select is(public.myr_payout_hold('2032-01-01', '@pgtap.ph3', '메모', 'test') ->> 'code', 'NOTHING_TO_PAY', '0원 지급 건은 보류할 것이 없다');

-- ---------- 해제 → 자동 상태로 ----------
update public.sellers set myr_settle_status = 'rejected' where id = '00000000-0000-4000-8000-0000000c7001';
select is(public.myr_payout_release('2032-01-01', '@pgtap.ph1', 'test') ->> 'status', 'held', '해제했지만 사업자 정보 다시 입력 요청(rejected) → 자동 상태 지급 보류');
select is(pg_temp.st('@pgtap.ph1'), '["held", "settle_info", false]'::jsonb, '이유는 settle_info · 메모는 지운다');
select is((select hold_note from public.myr_payouts where id = (public.myr_payout_find('2032-01-01', '@pgtap.ph1')).id), null, '운영 메모 지움');
select is(public.myr_payout_release('2032-01-01', '@pgtap.ph1', 'test') ->> 'code', 'NOT_MANUAL', '운영 보류가 아니면 해제할 것이 없다');

-- ---------- 지급 완료는 보류 · 자동 갱신 대상이 아니다 ----------
update public.myr_payouts set status = 'paid', paid_at = now(), paid_amount = 12000 where id = (public.myr_payout_find('2032-01-01', '@pgtap.ph2')).id;
select is(public.myr_payout_hold('2032-01-01', '@pgtap.ph2', '메모', 'test') ->> 'code', 'ALREADY_PAID', '지급 완료는 보류 불가');
update public.sellers set myr_settle_status = 'pending' where id = '00000000-0000-4000-8000-0000000c7002';
select is(pg_temp.st('@pgtap.ph2'), '["paid", null, false]'::jsonb, '지급 완료는 사업자 정보가 바뀌어도 그대로 · 지급 가능 아님');

-- ---------- 표 제약 ----------
select throws_ok($$update public.myr_payouts set status = 'held', hold_reason = null where id = (public.myr_payout_find('2032-01-01', '@pgtap.ph3')).id$$,
                 '23514', null, '지급 보류인데 이유가 없으면 막는다');
select throws_ok($$update public.myr_payouts set hold_reason = 'tax' where id = (public.myr_payout_find('2032-01-01', '@pgtap.ph1')).id$$,
                 '23514', null, '정해진 이유 코드만');

-- ---------- 문구 · 보고 ----------
select is(jsonb_build_array(public.myr_payout_hold_label('settle_info'), public.myr_payout_hold_label('manual'), public.myr_payout_status_label('pending'), public.myr_payout_status_label('none')),
          '["사업자 · 정산 정보 확인 전", "운영팀 확인 중", "지급 대기", "지급 없음"]'::jsonb, '보류 이유 · 상태 문구');
select is((select jsonb_agg(jsonb_build_array(e #>> '{seller,handle}', e ->> 'status', e ->> 'hold_reason', (e ->> 'payable')::boolean) order by e #>> '{seller,handle}')
             from jsonb_array_elements(public.myr_settlement_report('2032-01-01') -> 'payouts') e where e #>> '{seller,handle}' like '@pgtap.ph%'),
          '[["@pgtap.ph1", "held", "settle_info", false], ["@pgtap.ph2", "paid", null, false], ["@pgtap.ph3", "none", null, false]]'::jsonb, '보고 — 상태 · 이유 · 지급 가능은 같은 함수 값');

select * from finish();
rollback;
