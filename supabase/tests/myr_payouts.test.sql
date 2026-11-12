-- pgTAP — 0101 지급 기록: 권한 · 회차가 크리에이터마다 지급 건 1건 · 금액 = 담긴 줄 지급액 합 · 0원이면 지급 없음(none) ·
--   보류 줄은 풀린 회차 지급 건에 · 운영이 먼저 확정한 보류 줄은 다음 회차 지급 건에 · 다시 돌려도 지급 건이 늘지 않는다
-- 2031년 회차를 쓴다(로컬 DB 의 실제 회차 · 다른 정산 테스트와 겹치지 않게). 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(17);

-- ---------- 권한 ----------
select table_privs_are('public', 'myr_payouts', 'anon', '{}'::text[], 'anon 은 지급 건 표 직접 권한 없음');
select table_privs_are('public', 'myr_payouts', 'authenticated', '{}'::text[], 'authenticated 도 없음');
select ok((select relrowsecurity from pg_class where oid = 'public.myr_payouts'::regclass), 'myr_payouts RLS on');
select function_privs_are('public', 'myr_payout_collect', '{uuid}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 payout_collect 불가');
select function_privs_are('public', 'myr_payout_amount', '{myr_payouts}'::text[], 'anon', '{}'::text[], 'anon 은 payout_amount 불가');

-- ---------- 픽스처 ----------
-- 셀러 1: A(제조금액 0원 명시 → 전부 지급) · B(제조 원장 없음 → 보류) / 셀러 2: C(제조금액 100만 · 1월 정산금이 전부 상계 → 0원)
insert into public.sellers (id, name, handle, platform, active)
values ('00000000-0000-4000-8000-0000000b7001', '셀러 1', '@pgtap.po1', 'instagram', true),
       ('00000000-0000-4000-8000-0000000b7002', '셀러 2', '@pgtap.po2', 'instagram', true);
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
select is(public.myr_settlement_run('2031-01-01', 'test', '2031-02-01 13:00+09') ->> 'ok', 'true', '1월 회차');
-- 로컬 DB 의 실제 미정산 줄도 이 회차에 들어올 수 있어 테스트 셀러만 센다
select is((select count(*)::int from public.myr_payouts p join public.myr_settlement_runs u on u.id = p.run_id join public.sellers s on s.id = p.seller_id where u.month = '2031-01-01' and s.handle like '@pgtap.po%'), 2, '크리에이터마다 지급 건 1건(셀러 1 · 셀러 2)');
select is(pg_temp.payouts('2031-01-01'), '{"@pgtap.po1": ["pending", 30000, 1], "@pgtap.po2": ["none", 0, 1]}'::jsonb,
          '셀러 1 — 확정된 A 만 담아 3만 · 지급 대기(B 는 보류라 안 담김) / 셀러 2 — 전부 상계 0원 · 지급 없음');
select is((select payout_id from public.myr_settlement_rows where product_id = '00000000-0000-4000-8000-0000000b7a02'), null, '보류 줄(B)은 아직 어느 지급 건에도 없다');
select is((public.myr_settlement_run('2031-01-01', 'test', '2031-02-02 13:00+09') ->> 'already')::boolean, true, '같은 달 다시 돌려도');
select is((select count(*)::int from public.myr_payouts p join public.myr_settlement_runs u on u.id = p.run_id join public.sellers s on s.id = p.seller_id where u.month = '2031-01-01' and s.handle like '@pgtap.po%'), 2, '지급 건이 늘지 않는다');

-- ---------- 운영이 B 보류를 먼저 푼다(회차 전) → 다음 회차 지급 건에 ----------
select is(public.myr_mfg_add('00000000-0000-4000-8000-0000000b7a02', 0, '제조금액 없음', 'test') ->> 'ok', 'true', 'B — 제조금액 0원 명시');
select is((public.myr_settlement_confirm_held('00000000-0000-4000-8000-0000000b7a02', 'test') ->> 'payout')::int, 12000, '운영이 B 보류 확정(1.2만)');

-- ---------- 2월 ----------
select pg_temp.line('00000000-0000-4000-8000-0000000b7d04', '00000000-0000-4000-8000-0000000b7a01', '00000000-0000-4000-8000-0000000b7001', 1, '2031-02-10 12:00+09');   -- A 1만 → 정산 6천
select is((public.myr_settlement_run('2031-02-01', 'test', '2031-03-01 13:00+09') ->> 'payout')::int, 18000, '2월 회차 지급 합계 = 지급 건 금액 합(A 6천 + 먼저 확정한 B 1.2만)');
select is(pg_temp.payouts('2031-02-01'), '{"@pgtap.po1": ["pending", 18000, 2]}'::jsonb, '셀러 1 — 2월 A 줄 + 먼저 확정한 1월 B 줄 · 셀러 2 는 2월에 확정된 줄이 없어 지급 건 없음');

select * from finish();
rollback;
