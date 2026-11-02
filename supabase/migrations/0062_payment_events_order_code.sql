-- ============================================================
-- 0062 payment_events.order_code — 결제 로그에 샵 주문번호 (2026-11-02 · 대표 요청)
--
-- payment_events 는 셀러리·MYR 공용 감사 로그다. 지금은 토스 orderId(toss_order_id · 'myr_…')와 paymentKey 로만 연결돼 Supabase 에서
-- 주문번호(MYR1002 · o2013)로 필터할 수 없었다. 선택 컬럼 하나를 더해 MYR 샵이 승인·환불·입금 로그에 myr_orders.code 를 적는다.
-- 셀러리 쪽은 그대로(비워 둠 · 필요하면 orders.code 를 적으면 된다). 실행: 0061 이후. 재실행 가능.
-- ============================================================
alter table public.payment_events add column if not exists order_code text;
create index if not exists payment_events_order_code_idx on public.payment_events (order_code) where order_code is not null;
comment on column public.payment_events.order_code is '샵 주문번호 (MYR myr_orders.code · 셀러리 orders.code) — 주문번호로 로그를 찾기 위한 선택 컬럼 (0062)';
