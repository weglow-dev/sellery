-- ============================================================
-- 0076 — MYR 크리에이터 콘솔 홈 지표 · 실적(docs/myr.md §4.2.1 8번 · 2026-11-06)
--
--   myr_app_seller_sales(seller, now)   그 크리에이터의 이번 달(한국 시각) 실적 + 최근 7일 주문 수 — 줄 단위(내 상품 줄만 · 결정 2-1)
--     → { month: 'YYYY-MM', gross, refunds, net, orders, units, refunded_orders, payout, week: [{ date: 'YYYY-MM-DD', orders }] × 7 }
--       대상 줄 = 결제된 주문(paid_at 있음 · PAID · PARTIAL_REFUNDED · REFUNDED)의 내 줄. 입금 대기 · 취소 주문은 빼고, 달은 **결제 시각(KST)** 으로 가른다
--       gross   = 줄 금액(amount) 합 · refunds = 그 줄들의 환불 누적(refund_amount) · net = gross − refunds (이번 달 순매출 · 홈 큰 숫자)
--       orders  = 내 줄이 있는 주문 수 · units = 판매 수량 − 환불 수량 · refunded_orders = 환불 줄이 하나라도 있는 주문 수(CS 비율 = refunded_orders / orders)
--       payout  = Σ (줄 금액 − 줄 환불) × 줄의 seller_margin_rate 스냅샷 — **한 줄이라도 마진율이 비면 null**(정산 비율 미정 · §9-6 · 결정 10). 홈은 지금 net 을 보여 준다
--       week    = 오늘 포함 최근 7일(KST) 날짜별 내 줄이 있는 결제 주문 수 — 오래된 날부터
--     p_now 는 테스트용(기본 now()) — 화면은 넘기지 않는다
--   myr_app_seller_sales_of_user(user, now)   그 계정에 연결된 크리에이터의 같은 결과 · 연결 없으면 null — 크리에이터 게이트와 **동시에** 보낸다(0072 방식)
--
--   순매출 · 주문 · 판매 수량 판정은 이 함수 하나에만 둔다(백엔드 원칙 1) — 운영 콘솔 실적(myr-admin)도 같은 함수를 부른다.
--   권한: service role 만(anon · authenticated EXECUTE 회수). 크리에이터 · 계정 id 는 콘솔 서버가 세션에서(결정 3).
--   테스트: supabase/tests/myr_seller_sales.test.sql. 재실행 가능.
-- ============================================================

create or replace function public.myr_app_seller_sales(p_seller uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  with b as (
    select date_trunc('month', p_now at time zone 'Asia/Seoul') as m0,
           date_trunc('day', p_now at time zone 'Asia/Seoul') as d0
  ),
  lines as (
    select i.order_id, i.qty, i.refunded_qty, i.amount, i.refund_amount, i.seller_margin_rate,
           (o.paid_at at time zone 'Asia/Seoul') as paid_kst
      from public.myr_order_items i
      join public.myr_orders o on o.id = i.order_id
     where i.seller_id = p_seller
       and o.paid_at is not null
       and o.status in ('PAID', 'PARTIAL_REFUNDED', 'REFUNDED')
  ),
  m as (select l.* from lines l, b where l.paid_kst >= b.m0 and l.paid_kst < b.m0 + interval '1 month'),
  w as (select l.* from lines l, b where l.paid_kst >= b.d0 - interval '6 days' and l.paid_kst < b.d0 + interval '1 day')
  select jsonb_build_object(
    'month', to_char(b.m0, 'YYYY-MM'),
    'gross', coalesce((select sum(amount) from m), 0),
    'refunds', coalesce((select sum(refund_amount) from m), 0),
    'net', coalesce((select sum(amount - refund_amount) from m), 0),
    'orders', (select count(distinct order_id) from m),
    'units', coalesce((select sum(qty - refunded_qty) from m), 0),
    'refunded_orders', (select count(distinct order_id) from m where refunded_qty > 0),
    'payout', case when exists (select 1 from m where seller_margin_rate is null) then null
                   else coalesce((select round(sum((amount - refund_amount) * seller_margin_rate)) from m), 0) end,
    'week', (select jsonb_agg(jsonb_build_object('date', to_char(d, 'YYYY-MM-DD'),
                                                 'orders', (select count(distinct w.order_id) from w where date_trunc('day', w.paid_kst) = d))
                              order by d)
               from generate_series(b.d0 - interval '6 days', b.d0, interval '1 day') d)
  )
  from b
$$;
revoke all on function public.myr_app_seller_sales(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_sales(uuid, timestamptz) to service_role;

create or replace function public.myr_app_seller_sales_of_user(p_user uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select (select public.myr_app_seller_sales(s.id, p_now) from public.sellers s where s.user_id = p_user)
$$;
revoke all on function public.myr_app_seller_sales_of_user(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_sales_of_user(uuid, timestamptz) to service_role;
