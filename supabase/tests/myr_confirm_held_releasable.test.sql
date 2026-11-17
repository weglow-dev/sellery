-- pgTAP — 0113 운영 보류 확정(myr_settlement_confirm_held)이 "풀 수 있는 보류 줄"(myr_settlement_row_releasable)을 고른다 — 회차 자동 해제와 같은 기준.
--   원장 없음 NO_MFG · 원장이 들어오면 releasable 인 줄 = 확정되는 줄 · 다른 상품 줄은 건드리지 않음 · 다 확정하면 NOTHING_HELD
-- 2031년 회차를 쓴다(로컬 DB 의 실제 회차 · 다른 테스트와 겹치지 않게). 트랜잭션 안에서 돌고 롤백된다.
begin;
select plan(9);

select function_privs_are('public', 'myr_settlement_confirm_held', '{uuid,text}'::text[], 'authenticated', '{}'::text[], 'authenticated 는 confirm_held 불가');

insert into public.sellers (id, name, handle, platform, active) values ('00000000-0000-4000-8000-00000000fc11', '민지 루틴', '@pgtap.held', 'instagram', true);
-- P: 보류 줄 둘(5월 · 6월) · Q: 보류 줄 하나(원장 있음 — P 확정이 건드리지 않아야 한다)
insert into public.myr_products (id, code, seller_id, category, name, price, stock, status, icon)
values ('00000000-0000-4000-8000-00000000fc21', 'pgtap-held-p', '00000000-0000-4000-8000-00000000fc11', 'diet', '보리 차', 10000, 100, 'listed', 'pill'),
       ('00000000-0000-4000-8000-00000000fc22', 'pgtap-held-q', '00000000-0000-4000-8000-00000000fc11', 'diet', '옥수수 차', 10000, 100, 'listed', 'pill');
insert into public.myr_settlement_runs (id, month, cutoff_at, created_by)
values ('00000000-0000-4000-8000-00000000fc31', '2031-05-01', '2031-06-01 13:00+09', 'pgtap'),
       ('00000000-0000-4000-8000-00000000fc32', '2031-06-01', '2031-07-01 13:00+09', 'pgtap');
insert into public.myr_settlement_rows (id, run_id, product_id, seller_id, pct, sales, refund_adj, carry_in, base, carry_out, settle, status)
values ('00000000-0000-4000-8000-00000000fc41', '00000000-0000-4000-8000-00000000fc31', '00000000-0000-4000-8000-00000000fc21', '00000000-0000-4000-8000-00000000fc11', 60, 50000, 0, 0, 50000, 0, 30000, 'held'),
       ('00000000-0000-4000-8000-00000000fc42', '00000000-0000-4000-8000-00000000fc32', '00000000-0000-4000-8000-00000000fc21', '00000000-0000-4000-8000-00000000fc11', 60, 20000, 0, 0, 20000, 0, 12000, 'held'),
       ('00000000-0000-4000-8000-00000000fc43', '00000000-0000-4000-8000-00000000fc31', '00000000-0000-4000-8000-00000000fc22', '00000000-0000-4000-8000-00000000fc11', 60, 10000, 0, 0, 10000, 0, 6000, 'held');
select ok(public.myr_mfg_add('00000000-0000-4000-8000-00000000fc22', 0, '제조금액 없음', 'test') ->> 'ok' = 'true', 'Q 원장 입력(0원)');

-- 원장이 없으면 풀 수 있는 줄이 없고 · 확정은 NO_MFG
select is((select count(*)::int from public.myr_settlement_rows r where r.product_id = '00000000-0000-4000-8000-00000000fc21' and public.myr_settlement_row_releasable(r)), 0, 'P 원장 없음 — 풀 수 있는 보류 줄 0');
select is(public.myr_settlement_confirm_held('00000000-0000-4000-8000-00000000fc21', 'test') ->> 'code', 'NO_MFG', 'P 원장 없음 — NO_MFG');

-- 원장이 들어오면 — 풀 수 있는 줄(회차 자동 해제가 고를 줄) = 운영 확정이 확정하는 줄
select ok(public.myr_mfg_add('00000000-0000-4000-8000-00000000fc21', 10000, '1차', 'test') ->> 'ok' = 'true', 'P 원장 입력(1만)');
create temp table _releasable on commit drop as
  select r.id from public.myr_settlement_rows r where r.product_id = '00000000-0000-4000-8000-00000000fc21' and public.myr_settlement_row_releasable(r);
select is(public.myr_settlement_confirm_held('00000000-0000-4000-8000-00000000fc21', 'test'), '{"ok": true, "payout": 32000, "confirmed": 2}'::jsonb,
          'P 보류 2개 확정 — 5월 3만 중 1만 상계 · 6월 1.2만 그대로 → 지급 3.2만');
select is((select array_agg(id order by id) from public.myr_settlement_rows where product_id = '00000000-0000-4000-8000-00000000fc21' and status = 'confirmed'),
          (select array_agg(id order by id) from _releasable), '확정된 줄 = 확정 전에 풀 수 있던 줄(myr_settlement_row_releasable)');
select is((select status from public.myr_settlement_rows where id = '00000000-0000-4000-8000-00000000fc43'), 'held', '다른 상품(Q) 보류 줄은 그대로');

-- 다 확정하면 풀 수 있는 줄이 없다
select is(public.myr_settlement_confirm_held('00000000-0000-4000-8000-00000000fc21', 'test') ->> 'code', 'NOTHING_HELD', 'P 다시 확정 — NOTHING_HELD');

select * from finish();
rollback;
