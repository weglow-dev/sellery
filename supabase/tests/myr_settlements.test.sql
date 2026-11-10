-- pgTAP — 0087 정산 계산 · 확정: 권한 · 제조 원장 · 회차(정상 · 부분 환불 · 전액 환불 · 0원 지급 · 상계 끝난 달 보증금 환급 · 정산 뒤 환불 다음 회차 차감 ·
--   공구가 줄 · 재생산 차수 · 마이너스 이월 · 보류 → 제조금액 입력 뒤 확정 · 늦게 기록된 배송 완료 · 미배송 · 입금 대기 제외) · 멱등 · 순서 · 아직 안 끝난 달
-- 2030년 회차를 쓴다(로컬 DB 의 실제 회차와 겹치지 않게). 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(60);

-- ---------- 권한 ----------
select table_privs_are('public', 'myr_mfg_batches', 'authenticated', '{}'::text[], 'authenticated 는 제조 원장 표 직접 권한 없음');
select table_privs_are('public', 'myr_settlement_rows', 'anon', '{}'::text[], 'anon 은 정산 줄 표 직접 권한 없음');
select ok((select relrowsecurity from pg_class where oid = 'public.myr_settlement_items'::regclass), 'myr_settlement_items RLS on');
select function_privs_are('public', 'myr_settlement_run', '{date,text,timestamptz}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 settlement_run 불가');
select function_privs_are('public', 'myr_settlement_run', '{date,text,timestamptz}'::text[], 'service_role', '{EXECUTE}'::text[], 'service_role 은 settlement_run 가능');
select function_privs_are('public', 'myr_settlement_confirm_held', '{uuid,text}'::text[], 'anon', '{}'::text[], 'anon 은 confirm_held 불가');
select function_privs_are('public', 'myr_settlement_report', '{date}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 report 불가');
select function_privs_are('public', 'myr_mfg_add', '{uuid,integer,text,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 mfg_add 불가');
select function_privs_are('public', 'myr_mfg_ledger', '{uuid}'::text[], 'anon', '{}'::text[], 'anon 은 mfg_ledger 불가');
select function_privs_are('public', 'myr_settlement_apply', '{uuid,text}'::text[], 'service_role', '{}'::text[], 'apply 는 내부 전용(service_role 도 직접 못 부른다)');
select is(public.myr_settlement_pct(), 60, '정산 비율 60%(platform_settings)');

-- ---------- 픽스처 ----------
-- A: 제조금액 100만(보증금 25만 입금) · B: 제조 원장 없음(보류) · C: 제조금액 0원 명시 · 공구 줄
insert into public.sellers (id, name, handle, platform, active)
values ('00000000-0000-4000-8000-0000000a7001', '민지 루틴', '@pgtap.st1', 'instagram', true);
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-0000000a7a01', 'pgtap-st-a', '00000000-0000-4000-8000-0000000a7001', 'diet', '포도 젤리', 100000, 1000, 'listed', 'grape'),
       ('00000000-0000-4000-8000-0000000a7a02', 'pgtap-st-b', '00000000-0000-4000-8000-0000000a7001', 'diet', '레몬 스틱', 100000, 1000, 'listed', 'lemon'),
       ('00000000-0000-4000-8000-0000000a7a03', 'pgtap-st-c', '00000000-0000-4000-8000-0000000a7001', 'diet', '콜라겐', 32000, 1000, 'listed', 'jelly');
insert into public.myr_groupbuys (id, code, product_id, seller_id, discount_pct, starts_at, ends_at)
values ('00000000-0000-4000-8000-0000000a7c01', 'pgtapst1', '00000000-0000-4000-8000-0000000a7a03', '00000000-0000-4000-8000-0000000a7001', 20, '2030-01-01', '2030-01-10');
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount)
values ('00000000-0000-4000-8000-0000000a7b01', 'pgtap-st-1', 'PAID', '2030-01-02', '김지은', '{}', '주문1', 0),
       ('00000000-0000-4000-8000-0000000a7b02', 'pgtap-st-2', 'WAITING_DEPOSIT', null, '이현', '{}', '주문2', 0);
create function pg_temp.line(p_id text, p_product text, p_qty integer, p_unit integer, p_delivered timestamptz, p_order text default '00000000-0000-4000-8000-0000000a7b01', p_gb uuid default null)
returns void language sql as $$
  insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, qty, unit_price, ship_status, delivered_at, groupbuy_id)
  values (p_id::uuid, p_order::uuid, p_product::uuid, '00000000-0000-4000-8000-0000000a7001', '줄', p_qty, p_unit,
          case when p_delivered is null then 'SHIPPING' else 'DELIVERED' end, p_delivered, p_gb)
$$;
create function pg_temp.refund(p_id text, p_qty integer, p_amount integer) returns void language sql as $$
  update public.myr_order_items set refunded_qty = p_qty, refund_amount = p_amount, status = case when p_qty = qty then 'REFUNDED' else 'PARTIAL_REFUNDED' end where id = p_id::uuid
$$;
create function pg_temp.row(p_month date, p_product text) returns public.myr_settlement_rows language sql as $$
  select r.* from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id where u.month = p_month and r.product_id = p_product::uuid
$$;
create function pg_temp.money(p_month date, p_product text) returns int[] language sql as $$
  select array[r.sales, r.refund_adj, r.carry_in, r.settle, r.mfg_before, r.offset_amount, r.mfg_after, r.deposit_refund, r.payout] from pg_temp.row(p_month, p_product) r
$$;

-- ---------- 제조 원장 ----------
select is(public.myr_mfg_add('00000000-0000-4000-8000-0000000a7a01', -1, null, 'test') ->> 'code', 'BAD_AMOUNT', '제조금액 음수는 BAD_AMOUNT');
select is(public.myr_mfg_add('00000000-0000-4000-8000-0000000a7a01', 1000000, '1차', 'test') #>> '{batch,deposit_amount}', '250000', '1차 제조 100만 · 보증금 25%(25만)');
select is(public.myr_mfg_deposit('00000000-0000-4000-8000-0000000a7a01', 1, '2029-12-20') ->> 'ok', 'true', '보증금 입금 확인');
select is(public.myr_mfg_deposit('00000000-0000-4000-8000-0000000a7a01', 1) ->> 'code', 'ALREADY_PAID', '다시 입금 확인하면 ALREADY_PAID');
select is(public.myr_mfg_add('00000000-0000-4000-8000-0000000a7a03', 0, '제조금액 없음', 'test') #>> '{batch,seq}', '1', 'C — 제조금액 0원 명시');
select is((public.myr_mfg_ledger('00000000-0000-4000-8000-0000000a7a01') ->> 'remaining')::int, 1000000, '남은 제조금액 100만');

-- ---------- 1월 판매 ----------
select pg_temp.line('00000000-0000-4000-8000-0000000a7d01', '00000000-0000-4000-8000-0000000a7a01', 9, 100000, '2030-01-10 12:00+09');   -- A 90만
select pg_temp.line('00000000-0000-4000-8000-0000000a7d02', '00000000-0000-4000-8000-0000000a7a01', 3, 100000, '2030-01-31 23:59+09');   -- A 30만 · 1개 부분 환불(정산 전)
select pg_temp.line('00000000-0000-4000-8000-0000000a7d03', '00000000-0000-4000-8000-0000000a7a01', 1, 50000, '2030-01-15 12:00+09');    -- A 5만 · 전액 환불(정산 전)
select pg_temp.line('00000000-0000-4000-8000-0000000a7d04', '00000000-0000-4000-8000-0000000a7a02', 1, 100000, '2030-01-20 12:00+09');   -- B 10만(원장 없음)
select pg_temp.line('00000000-0000-4000-8000-0000000a7d05', '00000000-0000-4000-8000-0000000a7a03', 1, 25600, '2030-01-05 12:00+09', '00000000-0000-4000-8000-0000000a7b01', '00000000-0000-4000-8000-0000000a7c01');   -- C 공구가
select pg_temp.line('00000000-0000-4000-8000-0000000a7d06', '00000000-0000-4000-8000-0000000a7a01', 1, 70000, null);                     -- A 배송 중(제외)
select pg_temp.line('00000000-0000-4000-8000-0000000a7d07', '00000000-0000-4000-8000-0000000a7a01', 1, 80000, '2030-01-12 12:00+09', '00000000-0000-4000-8000-0000000a7b02');   -- 입금 대기 주문(제외)
select pg_temp.line('00000000-0000-4000-8000-0000000a7d08', '00000000-0000-4000-8000-0000000a7a01', 1, 40000, '2030-02-01 00:00+09');    -- 2월 1일 0시(KST) — 2월분
select pg_temp.refund('00000000-0000-4000-8000-0000000a7d02', 1, 100000);
select pg_temp.refund('00000000-0000-4000-8000-0000000a7d03', 1, 50000);

select is(public.myr_settlement_run('2030-01-01', 'test', '2030-01-31 23:00+09') ->> 'code', 'NOT_CLOSED', '달이 끝나기 전에는 NOT_CLOSED');
select is(public.myr_settlement_run('2030-01-15', 'test', '2030-02-01 13:00+09') ->> 'month', '2030-01', '1월 회차(그 달 아무 날이어도 1일로)');
select is((select array_agg(r.status order by p.code) from public.myr_settlement_rows r join public.myr_products p on p.id = r.product_id
            join public.myr_settlement_runs u on u.id = r.run_id where u.month = '2030-01-01' and p.code like 'pgtap-st-%'),
          array['confirmed', 'held', 'confirmed'], '1월 — A · C 확정 · B 보류');
select is(pg_temp.money('2030-01-01', '00000000-0000-4000-8000-0000000a7a01'), array[1100000, 0, 0, 660000, 1000000, 660000, 340000, 0, 0],
          'A 1월 — 판매 110만(부분 · 전액 환불 반영) · 정산 66만 전부 상계 · 남은 34만 · 지급 0원');
select is((select count(*)::int from public.myr_settlement_items i join public.myr_settlement_rows r on r.id = i.row_id
            where r.product_id = '00000000-0000-4000-8000-0000000a7a01' and i.kind = 'sale'), 3, 'A 1월 줄 3개(배송 중 · 입금 대기 · 2월 0시 줄 제외)');
select is((pg_temp.row('2030-01-01', '00000000-0000-4000-8000-0000000a7a02')).status, 'held', 'B 1월 — 제조 원장이 없으면 보류');
select is((pg_temp.row('2030-01-01', '00000000-0000-4000-8000-0000000a7a02')).settle, 60000, 'B 보류 — 정산금은 계산해 둔다(6만)');
select is((pg_temp.row('2030-01-01', '00000000-0000-4000-8000-0000000a7a02')).payout, null, 'B 보류 — 지급액 없음');
select is(pg_temp.money('2030-01-01', '00000000-0000-4000-8000-0000000a7a03'), array[25600, 0, 0, 15360, 0, 0, 0, 0, 15360], 'C 1월 — 공구가 25,600 × 60% = 15,360 지급(제조금액 0원)');
select is(public.myr_settlement_run('2030-01-01', 'test', '2030-02-02 13:00+09') ->> 'already', 'true', '같은 달 다시 돌리면 already(멱등)');
select is(public.myr_settlement_confirm_held('00000000-0000-4000-8000-0000000a7a02', 'test') ->> 'code', 'NO_MFG', '원장 없이 보류 확정은 NO_MFG');
select function_privs_are('public', 'myr_mfg_pending', '{}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 mfg_pending 불가');
select ok((select bool_or(e #>> '{product,code}' = 'pgtap-st-b' and e -> 'months' = '["2030-01"]' and (e ->> 'settle')::int = 60000) from jsonb_array_elements(public.myr_mfg_pending() -> 'held') e),
          '원장 대기 — B 보류(2030-01 · 6만)');
select ok((select bool_or(e #>> '{product,code}' = 'pgtap-st-b') from jsonb_array_elements(public.myr_mfg_pending() -> 'no_ledger') e), '원장 대기 — B 원장 없음');

-- ---------- 2월 — 정산 뒤 환불 · 늦게 기록된 배송 완료 · 상계 끝(보증금 환급) · 마이너스 이월 · 보류가 이어진다 ----------
select pg_temp.refund('00000000-0000-4000-8000-0000000a7d01', 1, 100000);          -- A 1월 정산한 줄 정산 뒤 환불 10만
select pg_temp.refund('00000000-0000-4000-8000-0000000a7d05', 1, 25600);           -- C 공구 줄 정산 뒤 전액 환불
select pg_temp.line('00000000-0000-4000-8000-0000000a7d09', '00000000-0000-4000-8000-0000000a7a01', 1, 10000, '2030-01-20 12:00+09');   -- 1월 배송 완료 · 1월 회차 뒤 기록
select pg_temp.line('00000000-0000-4000-8000-0000000a7d10', '00000000-0000-4000-8000-0000000a7a01', 9, 100000, '2030-02-10 12:00+09');  -- A 2월 90만
select pg_temp.line('00000000-0000-4000-8000-0000000a7d11', '00000000-0000-4000-8000-0000000a7a02', 1, 50000, '2030-02-10 12:00+09');   -- B 2월 5만
select is(public.myr_settlement_run('2030-02-01', 'test', '2030-03-01 13:00+09') ->> 'held', '1', '2월 회차 — B 는 1월 보류가 있어 계속 보류');
select is(pg_temp.money('2030-02-01', '00000000-0000-4000-8000-0000000a7a01'), array[950000, 100000, 0, 510000, 340000, 340000, 0, 250000, 420000],
          'A 2월 — 판매 95만(2월 0시 줄 · 늦은 1월 줄 포함) − 정산 뒤 환불 10만 → 51만 · 34만 상계로 끝 · 보증금 25만 환급 · 지급 42만');
select ok((select bool_and(deposit_refund_row_id = (pg_temp.row('2030-02-01', '00000000-0000-4000-8000-0000000a7a01')).id) from public.myr_mfg_batches where product_id = '00000000-0000-4000-8000-0000000a7a01'),
          'A 1차 보증금은 2월 줄에서 환급 표시');
select is((select count(*)::int from public.myr_settlement_items i where i.order_item_id = '00000000-0000-4000-8000-0000000a7d01' and i.kind = 'refund_adj'), 1, '정산 뒤 환불은 refund_adj 줄로');
select is(pg_temp.money('2030-02-01', '00000000-0000-4000-8000-0000000a7a03'), array[0, 25600, 0, 0, 0, 0, 0, 0, 0], 'C 2월 — 판매 없이 환불만 → 정산 0 · 지급 0');
select is((pg_temp.row('2030-02-01', '00000000-0000-4000-8000-0000000a7a03')).carry_out, -25600, 'C 2월 — 마이너스 25,600 다음 회차로 이월');
select is(public.myr_settlement_run('2029-12-01', 'test', '2030-03-01 13:00+09') ->> 'code', 'OUT_OF_ORDER', '더 늦은 회차가 있으면 OUT_OF_ORDER');

-- ---------- 보류 확정 ----------
select is(public.myr_mfg_add('00000000-0000-4000-8000-0000000a7a02', 30000, '1차', 'test') ->> 'ok', 'true', 'B 제조금액 3만 입력(보증금 미입금)');
select is(public.myr_settlement_confirm_held('00000000-0000-4000-8000-0000000a7a02', 'test'), '{"ok": true, "payout": 60000, "confirmed": 2}'::jsonb, 'B 보류 2개(1월 · 2월) 확정');
select is(pg_temp.money('2030-01-01', '00000000-0000-4000-8000-0000000a7a02'), array[100000, 0, 0, 60000, 30000, 30000, 0, 0, 30000], 'B 1월 — 6만 중 3만 상계 · 보증금 미입금이라 환급 0 · 지급 3만');
select is(pg_temp.money('2030-02-01', '00000000-0000-4000-8000-0000000a7a02'), array[50000, 0, 0, 30000, 0, 0, 0, 0, 30000], 'B 2월 — 다 갚아서 3만 그대로 지급');
select is(public.myr_settlement_confirm_held('00000000-0000-4000-8000-0000000a7a02', 'test') ->> 'code', 'NOTHING_HELD', '보류가 없으면 NOTHING_HELD');

-- ---------- 3월 — 재생산 차수 · 이월 차감 ----------
select is(public.myr_mfg_add('00000000-0000-4000-8000-0000000a7a01', 200000, '2차', 'test') #>> '{batch,seq}', '2', 'A 재생산 2차 20만');
select is(public.myr_mfg_deposit('00000000-0000-4000-8000-0000000a7a01', 2, '2030-02-20') ->> 'ok', 'true', 'A 2차 보증금 5만 입금');
select is((public.myr_mfg_ledger('00000000-0000-4000-8000-0000000a7a01') ->> 'remaining')::int, 200000, 'A 남은 제조금액 = 새 차수 20만');
select pg_temp.line('00000000-0000-4000-8000-0000000a7d12', '00000000-0000-4000-8000-0000000a7a01', 1, 100000, '2030-03-10 12:00+09');
select pg_temp.line('00000000-0000-4000-8000-0000000a7d13', '00000000-0000-4000-8000-0000000a7a03', 1, 50000, '2030-03-10 12:00+09');
select is(public.myr_settlement_run('2030-03-01', 'test', '2030-04-01 13:00+09') ->> 'ok', 'true', '3월 회차');
select is(pg_temp.money('2030-03-01', '00000000-0000-4000-8000-0000000a7a01'), array[100000, 0, 0, 60000, 200000, 60000, 140000, 0, 0], 'A 3월 — 2차 20만에서 6만 상계 · 지급 0 · 2차 보증금은 아직');
select is(pg_temp.money('2030-03-01', '00000000-0000-4000-8000-0000000a7a03'), array[50000, 0, -25600, 14640, 0, 0, 0, 0, 14640], 'C 3월 — 5만 − 이월 25,600 = 24,400 × 60% = 14,640(원 미만 버림)');

-- ---------- 무효 · 보고 ----------
select is(public.myr_mfg_void('00000000-0000-4000-8000-0000000a7a01', 2, '', 'test') ->> 'code', 'REASON_REQUIRED', '무효는 사유 필수');
select is(public.myr_mfg_void('00000000-0000-4000-8000-0000000a7a01', 1, '잘못 입력', 'test') ->> 'code', 'REFUNDED', '보증금을 환급한 차수는 무효 불가');
select is(public.myr_mfg_void('00000000-0000-4000-8000-0000000a7a01', 2, '잘못 입력', 'test') ->> 'code', 'USED', '상계에 쓰인 차수는 무효 불가(남은 제조금액이 상계 합계보다 작아진다)');
select is(public.myr_mfg_add('00000000-0000-4000-8000-0000000a7a03', 10000, '오타', 'test') ->> 'ok', 'true', 'C 잘못 넣은 차수');
select is(public.myr_mfg_void('00000000-0000-4000-8000-0000000a7a03', 2, '오타', 'test') ->> 'ok', 'true', '상계 전 차수는 무효 처리(지우지 않는다)');
select is((select count(*)::int from public.myr_mfg_batches where product_id = '00000000-0000-4000-8000-0000000a7a03'), 2, '무효 차수도 기록으로 남는다');
select is((select count(*)::int from jsonb_array_elements(public.myr_settlement_report('2030-02-01') -> 'rows') e where e #>> '{product,code}' like 'pgtap-st-%'), 3, '보고 — 2월 상품 3개');
select is((select e ->> 'payout' from jsonb_array_elements(public.myr_settlement_report('2030-02-01') -> 'rows') e where e #>> '{product,code}' = 'pgtap-st-a'), '420000', '보고 — A 2월 지급 42만');
select is(public.myr_settlement_report('2031-01-01'), null, '없는 회차 보고는 null');
select is((select count(*)::int from public.myr_settlement_items where order_item_id = '00000000-0000-4000-8000-0000000a7d01' and kind = 'sale'), 1, '한 줄은 한 번만 sale');
select throws_ok($$insert into public.myr_settlement_items (row_id, order_item_id, kind, amount, refund_snapshot)
                   select row_id, order_item_id, 'sale', 0, 0 from public.myr_settlement_items where order_item_id = '00000000-0000-4000-8000-0000000a7d01' and kind = 'sale'$$,
                 '23505', null, '같은 줄 sale 두 번은 막힌다(유일 인덱스)');

select * from finish();
rollback;
