-- pgTAP — 0101 지급 기록: 권한 · 회차가 크리에이터마다 지급 건 1건 · 금액 = 담긴 줄 지급액 합 · 0원이면 지급 없음(none) ·
--   보류 줄은 풀린 회차 지급 건에 · 운영이 먼저 확정한 보류 줄은 다음 회차 지급 건에 · 다시 돌려도 지급 건이 늘지 않는다
-- 2031년 회차를 쓴다(로컬 DB 의 실제 회차 · 다른 정산 테스트와 겹치지 않게). 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(38);

-- ---------- 권한 ----------
select table_privs_are('public', 'myr_payouts', 'anon', '{}'::text[], 'anon 은 지급 건 표 직접 권한 없음');
select table_privs_are('public', 'myr_payouts', 'authenticated', '{}'::text[], 'authenticated 도 없음');
select ok((select relrowsecurity from pg_class where oid = 'public.myr_payouts'::regclass), 'myr_payouts RLS on');
select function_privs_are('public', 'myr_payout_collect', '{uuid,boolean}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 payout_collect 불가');
select function_privs_are('public', 'myr_settlement_row_payable', '{myr_settlement_rows}'::text[], 'anon', '{}'::text[], 'anon 은 row_payable 불가');
select function_privs_are('public', 'myr_payout_amount', '{myr_payouts}'::text[], 'anon', '{}'::text[], 'anon 은 payout_amount 불가');
select function_privs_are('public', 'myr_settlement_card_rows', '{uuid,uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 card_rows 불가');
select function_privs_are('public', 'myr_mfg_deposits', '{uuid}'::text[], 'anon', '{}'::text[], 'anon 은 mfg_deposits 불가');
select function_privs_are('public', 'myr_payout_of', '{uuid,uuid}'::text[], 'anon', '{}'::text[], 'anon 은 payout_of 불가');
select function_privs_are('public', 'myr_mfg_change_shortfall', '{myr_mfg_batches,integer}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 change_shortfall 불가');

-- ---------- 픽스처 ----------
-- 셀러 1: A(제조금액 0원 명시 → 전부 지급) · B(제조 원장 없음 → 보류) / 셀러 2: C(제조금액 100만 · 1월 정산금이 전부 상계 → 0원)
-- 두 셀러 모두 사업자 · 정산 정보 확인 완료(0102 — 확인 전이면 지급 보류 · myr_payout_hold.test.sql)
insert into public.sellers (id, name, handle, platform, active, myr_settle_status)
values ('00000000-0000-4000-8000-0000000b7001', '셀러 1', '@pgtap.po1', 'instagram', true, 'verified'),
       ('00000000-0000-4000-8000-0000000b7002', '셀러 2', '@pgtap.po2', 'instagram', true, 'verified');
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-0000000b7a01', 'pgtap-po-a', '00000000-0000-4000-8000-0000000b7001', 'diet', 'A', 10000, 1000, 'listed', 'grape'),
       ('00000000-0000-4000-8000-0000000b7a02', 'pgtap-po-b', '00000000-0000-4000-8000-0000000b7001', 'diet', 'B', 10000, 1000, 'listed', 'lemon'),
       ('00000000-0000-4000-8000-0000000b7a03', 'pgtap-po-c', '00000000-0000-4000-8000-0000000b7002', 'diet', 'C', 10000, 1000, 'listed', 'jelly');
insert into public.myr_orders (id, code, status, paid_at, buyer_name, shipping, order_name, items_amount)
values ('00000000-0000-4000-8000-0000000b7b01', 'pgtap-po-1', 'PAID', '2031-01-02', '김지은', '{}', '주문', 0);
create function pg_temp.line(p_id text, p_product text, p_seller text, p_qty integer, p_delivered timestamptz) returns void language sql as $$
  insert into public.myr_order_items (id, order_id, product_id, seller_id, product_name, qty, unit_price, ship_status, delivered_at)
  values (p_id::uuid, '00000000-0000-4000-8000-0000000b7b01', p_product::uuid, p_seller::uuid, '줄', p_qty, 10000, 'DELIVERED', p_delivered)
$$;
create function pg_temp.payouts(p_month date) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(s.handle, jsonb_build_array(p.status, public.myr_payout_amount(p), (select count(*) from public.myr_settlement_rows r where r.payout_id = p.id))), '{}'::jsonb)
    from public.myr_payouts p join public.myr_settlement_runs u on u.id = p.run_id join public.sellers s on s.id = p.seller_id
   where u.month = p_month and s.handle like '@pgtap.po%'
$$;

select is(public.myr_mfg_add('00000000-0000-4000-8000-0000000b7a01', 0, '제조금액 없음', 'test') ->> 'ok', 'true', 'A — 제조금액 0원 명시');
select is(public.myr_mfg_add('00000000-0000-4000-8000-0000000b7a03', 1000000, '1차', 'test') ->> 'ok', 'true', 'C — 제조금액 100만');

-- ---------- 1월 ----------
select pg_temp.line('00000000-0000-4000-8000-0000000b7d01', '00000000-0000-4000-8000-0000000b7a01', '00000000-0000-4000-8000-0000000b7001', 5, '2031-01-10 12:00+09');   -- A 5만 → 정산 3만
select pg_temp.line('00000000-0000-4000-8000-0000000b7d02', '00000000-0000-4000-8000-0000000b7a02', '00000000-0000-4000-8000-0000000b7001', 2, '2031-01-11 12:00+09');   -- B 2만 → 보류
select pg_temp.line('00000000-0000-4000-8000-0000000b7d03', '00000000-0000-4000-8000-0000000b7a03', '00000000-0000-4000-8000-0000000b7002', 3, '2031-01-12 12:00+09');   -- C 3만 → 1.8만 전부 상계
-- 0106 — 회차는 정산할 차례인 달만(myr_settlement_due = 마지막 회차 다음 달). 로컬 DB 에 예전 회차가 있어도 결과가 같게 직전 회차(2030-12)를 둔다
insert into public.myr_settlement_runs (month, cutoff_at, created_by) values ('2030-12-01', '2031-01-01 13:00+09', 'pgtap');
select is(public.myr_settlement_run('2031-01-01', 'test', '2031-02-01 13:00+09') ->> 'ok', 'true', '1월 회차');
-- 로컬 DB 의 실제 미정산 줄도 이 회차에 들어올 수 있어 테스트 셀러만 센다
select is((select count(*)::int from public.myr_payouts p join public.myr_settlement_runs u on u.id = p.run_id join public.sellers s on s.id = p.seller_id where u.month = '2031-01-01' and s.handle like '@pgtap.po%'), 2, '크리에이터마다 지급 건 1건(셀러 1 · 셀러 2)');
select is(pg_temp.payouts('2031-01-01'), '{"@pgtap.po1": ["held", 30000, 1], "@pgtap.po2": ["none", 0, 1]}'::jsonb,
          '셀러 1 — 확정된 A 만 담아 3만 · 지급 보류(세금계산서 확인 전 · 0104 · B 는 보류라 안 담김) / 셀러 2 — 전부 상계 0원 · 지급 없음');
select is((select payout_id from public.myr_settlement_rows where product_id = '00000000-0000-4000-8000-0000000b7a02'), null, '보류 줄(B)은 아직 어느 지급 건에도 없다');
select is((public.myr_settlement_run('2031-01-01', 'test', '2031-02-02 13:00+09') ->> 'already')::boolean, true, '같은 달 다시 돌려도');
select is((select count(*)::int from public.myr_payouts p join public.myr_settlement_runs u on u.id = p.run_id join public.sellers s on s.id = p.seller_id where u.month = '2031-01-01' and s.handle like '@pgtap.po%'), 2, '지급 건이 늘지 않는다');

-- ---------- 운영이 B 보류를 먼저 푼다(회차 전) → 다음 회차 지급 건에 ----------
select is(public.myr_mfg_add('00000000-0000-4000-8000-0000000b7a02', 0, '제조금액 없음', 'test') ->> 'ok', 'true', 'B — 제조금액 0원 명시');
select is((public.myr_settlement_confirm_held('00000000-0000-4000-8000-0000000b7a02', 'test') ->> 'payout')::int, 12000, '운영이 B 보류 확정(1.2만)');

-- ---------- 2월 ----------
select pg_temp.line('00000000-0000-4000-8000-0000000b7d04', '00000000-0000-4000-8000-0000000b7a01', '00000000-0000-4000-8000-0000000b7001', 1, '2031-02-10 12:00+09');   -- A 1만 → 정산 6천
select is((public.myr_settlement_run('2031-02-01', 'test', '2031-03-01 13:00+09') ->> 'payout')::int, 18000, '2월 회차 지급 합계 = 지급 건 금액 합(A 6천 + 먼저 확정한 B 1.2만)');
select is(pg_temp.payouts('2031-02-01'), '{"@pgtap.po1": ["held", 18000, 2]}'::jsonb, '셀러 1(세금계산서 확인 전) — 2월 A 줄 + 먼저 확정한 1월 B 줄 · 셀러 2 는 2월에 확정된 줄이 없어 지급 건 없음');

-- 판정 함수 — 지급 건에 담을 줄 · 지급된 회차 · 0원 초과 · 자동 상태
select is((select jsonb_object_agg(p.code, public.myr_settlement_row_payable(r)) from public.myr_settlement_rows r join public.myr_products p on p.id = r.product_id where p.code like 'pgtap-po-%'),
          '{"pgtap-po-a": false, "pgtap-po-b": false, "pgtap-po-c": false}'::jsonb, '다 담긴 뒤에는 담을 줄 없음(확정 · 지급 건 있음)');
select is((select jsonb_object_agg(p.code, public.myr_settlement_row_pay_run(r) = r.run_id) from public.myr_settlement_rows r join public.myr_products p on p.id = r.product_id where p.code like 'pgtap-po-%'),
          '{"pgtap-po-a": true, "pgtap-po-b": true, "pgtap-po-c": true}'::jsonb, '크론이 풀지 않은 줄(운영이 먼저 확정한 B 포함)의 지급된 회차 = 자기 회차');
select is((select jsonb_agg(public.myr_payout_has_amount(p) order by s.handle) from public.myr_payouts p join public.sellers s on s.id = p.seller_id join public.myr_settlement_runs u on u.id = p.run_id where u.month = '2031-01-01' and s.handle like '@pgtap.po%'),
          '[true, false]'::jsonb, '0원 초과 — 셀러 1 true · 셀러 2(전부 상계) false');
select is((select jsonb_object_agg(st || '/' || coalesce(why, '-'), public.myr_payout_status_auto(jsonb_populate_record(null::public.myr_payouts, jsonb_build_object('status', st, 'hold_reason', why))))
             from (values ('pending', null), ('none', null), ('held', 'settle_info'), ('held', 'manual'), ('paid', null)) v(st, why)),
          '{"pending/-": true, "none/-": true, "held/settle_info": true, "held/manual": false, "paid/-": false}'::jsonb,
          '자동으로 다시 정해도 되는 지급 건 = 지급 완료 · 운영 보류가 아닌 것(0102 — 사업자 정보 보류도 자동)');
-- 정산 탭 카드 줄(myr_settlement_card_rows) — [상품, 지난 달 줄, 이 회차 지급 건에 담김, 다른 회차 지급 건에서 나감]
create function pg_temp.card(p_month date) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_array(p.code, c.origin, c.counted, (select to_char(l.month, 'YYYY-MM') from public.myr_settlement_runs l where l.id = c.paid_later_run)) order by p.code, c.origin)
    from public.myr_settlement_runs u cross join lateral public.myr_settlement_card_rows('00000000-0000-4000-8000-0000000b7001', u.id) c
    join public.myr_settlement_rows r on r.id = c.row_id join public.myr_products p on p.id = r.product_id
   where u.month = p_month
$$;
select is(pg_temp.card('2031-01-01'), '[["pgtap-po-a", false, true, null], ["pgtap-po-b", false, false, "2031-02"]]'::jsonb,
          '1월 카드 — A 는 1월 지급 건 · B 는 1월 줄이지만 2월 지급 건에서 나감(합계 제외)');
select is(pg_temp.card('2031-02-01'), '[["pgtap-po-a", false, true, null], ["pgtap-po-b", true, true, null]]'::jsonb,
          '2월 카드 — 2월 A + 2월 지급 건에 담긴 1월 B(지난 달 줄 · 합계 포함)');
select is((select jsonb_object_agg(to_char(u.month, 'MM'), public.myr_settlement_row_lines(r)) from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id where r.product_id = '00000000-0000-4000-8000-0000000b7a01'),
          '{"01": 1, "02": 1}'::jsonb, '정산 줄 판매 줄 수 — A 1월 · 2월 각 1줄');

-- 그 회차의 크리에이터 지급 건 · 없으면 빈 행(금액 0)
select is((select (public.myr_payout_of(u.id, '00000000-0000-4000-8000-0000000b7001')).status from public.myr_settlement_runs u where u.month = '2031-01-01'), 'held', 'payout_of — 셀러 1 · 1월 지급 건(세금계산서 확인 전)');
select is((select public.myr_payout_amount(public.myr_payout_of(u.id, '00000000-0000-4000-8000-0000000b7002')) from public.myr_settlement_runs u where u.month = '2031-02-01'), 0, 'payout_of — 지급 건이 없으면 금액 0');
-- 회차 마감 · 지급 시각
select is(jsonb_build_array(public.myr_settlement_month_end('2031-01-15'), public.myr_settlement_pay_at('2031-12-01')),
          jsonb_build_array('2031-02-01 00:00+09'::timestamptz, '2032-01-01 13:00+09'::timestamptz), '마감 = 다음 달 1일 0시 · 지급 = 다음 달 1일 오후 1시(KST)');
-- 다 갚았나
select is(jsonb_build_array(public.myr_mfg_paid_off(0), public.myr_mfg_paid_off(5), public.myr_mfg_paid_off(null)), '[true, false, false]'::jsonb, 'paid_off — 남은 제조금액 0 만');
-- 차수 상태 · 보증금 합 · 상태 — C(제조금액 100만 · 보증금 25만 입금 전)
select is((select jsonb_build_array(public.myr_mfg_batch_live(b), public.myr_mfg_batch_deposit_paid(b), public.myr_mfg_batch_deposit_refunded(b), public.myr_mfg_batch_deposit_held(b))
             from public.myr_mfg_batches b where b.product_id = '00000000-0000-4000-8000-0000000b7a03'), '[true, false, false, false]'::jsonb, 'C 1차 — 살아 있음 · 입금 전 · 환급 전 · 맡김 아님');
select is((select to_jsonb(d) from public.myr_mfg_deposits('00000000-0000-4000-8000-0000000b7a03') d),
          '{"paid": 0, "unpaid": 250000, "refunded": 0, "held": 0, "total": 250000, "state": "unpaid"}'::jsonb, 'C 보증금 — 입금 전 25만 · 상태 unpaid');
-- 차수를 바꾸면 상계보다 작아지나 — C 는 1월에 1.8만 상계
select is((select jsonb_build_array(public.myr_mfg_change_shortfall(b, 0), public.myr_mfg_change_shortfall(b, 10000), public.myr_mfg_change_shortfall(b, 20000))
             from public.myr_mfg_batches b where b.product_id = '00000000-0000-4000-8000-0000000b7a03'), '[18000, 8000, null]'::jsonb,
          '무효면 1.8만 모자람 · 1만으로 정정하면 8천 모자람 · 2만이면 괜찮음(null)');

-- 보고 — 지급 건 · 합계(스크립트가 줄을 더하지 않는다)
select is((select jsonb_agg(jsonb_build_array(e #>> '{seller,handle}', e ->> 'status', (e ->> 'amount')::int, (e ->> 'rows')::int) order by e #>> '{seller,handle}') from jsonb_array_elements(public.myr_settlement_report('2031-02-01') -> 'payouts') e where e #>> '{seller,handle}' like '@pgtap.po%'),
          '[["@pgtap.po1", "held", 18000, 2]]'::jsonb, '2월 보고 지급 건 = 지급 건 표 값');
select ok((public.myr_settlement_report('2031-02-01') ->> 'payout_total')::int >= 18000, '보고 지급 합계 = 지급 건 금액 합(로컬 실제 데이터가 섞일 수 있어 하한만)');

select * from finish();
rollback;
