-- ============================================================
-- 0117 · MYR 크리에이터 콘솔 홈 "이번 주 판매" — 이번 주 월 ~ 일(KST)로 고정 · 주 합계는 서버 (2026-11-17)
--
--   전: 오늘을 끝으로 지난 7일(오늘 − 6일 ~ 오늘) — 첫 요일이 매일 바뀌었다(오늘이 화요일이면 "수 … 화") · 합계는 화면이 날짜별 주문 수를 더했다
--   고침:
--     myr_kst_week(시각)     그 시각이 속한 주의 월요일(KST)
--     myr_app_seller_sales   week = 이번 주 월 ~ 일 7일 { date, orders }(아직 오지 않은 날은 0 · 화면은 일곱 요일을 똑같이 그린다) · week_orders = 이번 주 주문 수(서로 다른 주문)
--   그대로: 이번 달 실적(gross · refunds · net · orders · units · refunded_orders · cs_rate)은 0116 그대로
--   테스트: supabase/tests/myr_seller_week.test.sql · 기존 실적 테스트(myr_seller_sales)
-- ============================================================

create or replace function public.myr_kst_week(p_at timestamptz)
returns date
language sql
immutable
as $$
  select date_trunc('week', public.myr_kst_date(p_at))::date
$$;
revoke all on function public.myr_kst_week(timestamptz) from public, anon, authenticated;

-- 0116 정의 → 이번 주 월 ~ 일 · week_orders
create or replace function public.myr_app_seller_sales(p_seller uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  with b as (
    select date_trunc('month', p_now at time zone 'Asia/Seoul') as m0,
           date_trunc('day', p_now at time zone 'Asia/Seoul') as d0,
           public.myr_kst_week(p_now)::timestamp as w0
  ),
  lines as (
    select l.order_id, l.qty, l.refunded_qty, l.left_qty, l.amount, l.refund_amount, l.net, l.has_refund,
           (l.paid_at at time zone 'Asia/Seoul') as paid_kst
      from public.myr_sales_lines() l
     where l.seller_id = p_seller
  ),
  m as (select l.* from lines l, b where l.paid_kst >= b.m0 and l.paid_kst < b.m0 + interval '1 month'),
  w as (select l.* from lines l, b where l.paid_kst >= b.w0 and l.paid_kst < b.w0 + interval '7 days')
  select jsonb_build_object(
    'month', to_char(b.m0, 'YYYY-MM'),
    'gross', coalesce((select sum(amount) from m), 0),
    'refunds', coalesce((select sum(refund_amount) from m), 0),
    'net', coalesce((select sum(net) from m), 0),
    'orders', (select count(distinct order_id) from m),
    'units', coalesce((select sum(left_qty) from m), 0),
    'refunded_orders', (select count(distinct order_id) from m where has_refund),
    -- 0116: CS 비율(환불이 생긴 주문 ÷ 주문 · 소수 첫째 자리 · 주문이 없으면 null)
    'cs_rate', public.myr_cs_rate((select count(distinct order_id) from m where has_refund)::int, (select count(distinct order_id) from m)::int),
    -- 0117: 이번 주 월 ~ 일(KST · myr_kst_week) — 요일 순서가 늘 같다 · 주 합계 week_orders(화면이 더하지 않는다)
    'week', (select jsonb_agg(jsonb_build_object('date', to_char(d, 'YYYY-MM-DD'),
                                                 'orders', (select count(distinct w.order_id) from w where date_trunc('day', w.paid_kst) = d))
                              order by d)
               from generate_series(b.w0, b.w0 + interval '6 days', interval '1 day') d),
    'week_orders', (select count(distinct order_id) from w)
  )
  from b
$$;
revoke all on function public.myr_app_seller_sales(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_sales(uuid, timestamptz) to service_role;
