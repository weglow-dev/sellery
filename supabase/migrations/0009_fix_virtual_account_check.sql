-- ============================================================
-- 0009 — app_confirm_checkout 가상계좌 판정 버그 수정
--
-- 0008 은 `p_payment ? 'virtualAccount'`(키 존재 여부)로 가상계좌를 판정했다. 그러나 토스
-- Payment 객체는 카드 결제여도 `virtualAccount: null` 키를 항상 포함하므로 **모든 카드 승인이
-- 가상계좌로 오인되어 자동 취소**됐다(2026-09-15 테스트 결제 2건에서 재현). 값이 null 이 아닐 때만
-- 가상계좌로 본다. 그 외 로직은 0008 과 동일(함수 전체를 create or replace 로 재정의).
-- ============================================================

create or replace function public.app_confirm_checkout(p_session_id uuid, p_payment_key text, p_payment jsonb, p_recover boolean default false)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  s        public.checkout_sessions%rowtype;
  c        public.campaigns%rowtype;
  v_oid    uuid;
  v_ocode  text;
  v_appr   timestamptz;
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into s from public.checkout_sessions where id = p_session_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if s.status = 'CONFIRMED' then
    select o.id, o.code into v_oid, v_ocode from public.orders o where o.checkout_session_id = s.id;
    return jsonb_build_object('ok', true, 'already', true, 'order_id', v_oid, 'order_code', v_ocode);
  end if;

  if s.status not in ('PENDING','CONFIRMING') then
    -- 세션은 종결됐는데 주문이 이미 있으면(과거 경합) 멱등 반환
    select o.id, o.code into v_oid, v_ocode from public.orders o where o.checkout_session_id = s.id;
    if found then
      return jsonb_build_object('ok', true, 'already', true, 'order_id', v_oid, 'order_code', v_ocode);
    end if;
    if not p_recover or s.fail_code = 'CANCEL_PENDING' then
      return jsonb_build_object('ok', false, 'code', coalesce(s.fail_code, s.status), 'message', s.fail_message);
    end if;
  end if;

  -- 토스 응답 원문을 세션과 대조 (라우트·웹훅·reconcile 어느 호출자든 여기서 한 번 더 막힌다)
  if p_payment is null
     or p_payment ->> 'status' is distinct from 'DONE'
     or p_payment ->> 'orderId' is distinct from s.toss_order_id
     or (p_payment ->> 'totalAmount')::bigint is distinct from s.amount::bigint
     or p_payment ->> 'paymentKey' is distinct from p_payment_key then
    return jsonb_build_object('ok', false, 'code', 'PAYMENT_MISMATCH');
  end if;
  -- 토스 Payment 객체는 카드 결제여도 virtualAccount/transfer/mobilePhone 등 키를 null 값으로 항상 포함한다.
  -- 키 존재(?)가 아니라 값이 null 이 아닐 때만 가상계좌로 본다 (0008 의 버그 수정).
  if p_payment ->> 'method' = '가상계좌'
     or (p_payment ? 'virtualAccount' and jsonb_typeof(p_payment -> 'virtualAccount') <> 'null') then
    return jsonb_build_object('ok', false, 'code', 'VIRTUAL_ACCOUNT_NOT_SUPPORTED');
  end if;

  -- 캠페인 행 잠금 → 기간·상태·재고 재검사. 같은 캠페인의 동시 confirm 은 여기서 직렬화된다.
  -- 슬라이스 1 에는 LIVE→CLEARING 스케줄러가 없으므로(app-plan §12) end_date 를 여기서 직접 본다 — 마지막 방어선.
  select * into c from public.campaigns where id = s.campaign_id for update;
  if not found or c.status <> 'LIVE'
     or c.start_date > v_today or c.end_date < v_today then
    return jsonb_build_object('ok', false, 'code', 'NOT_LIVE');
  end if;
  if c.qty - c.sold_qty < s.qty then
    return jsonb_build_object('ok', false, 'code', 'SOLD_OUT', 'left', greatest(c.qty - c.sold_qty, 0));
  end if;

  v_appr := coalesce((p_payment ->> 'approvedAt')::timestamptz, now());

  insert into public.orders (
    campaign_id, customer_id, user_id, status, buyer_name, buyer_phone, buyer_email,
    qty, unit_price, option_name, is_sample, shipping, order_name,
    payment_key, payment_method, paid_at, raw_payment, checkout_session_id)
  values (
    s.campaign_id, s.customer_id, s.user_id, 'PAID', s.buyer_name, s.buyer_phone, s.buyer_email,
    s.qty, s.unit_price, s.option_name, false, s.shipping, s.order_name,
    p_payment_key, p_payment ->> 'method', v_appr, p_payment, s.id)
  returning id, code into v_oid, v_ocode;
  -- orders_sync_sold_qty (0004, after insert) 가 같은 트랜잭션에서 campaigns.sold_qty 를 갱신한다.

  update public.checkout_sessions
     set status = 'CONFIRMED',
         payment_key = p_payment_key,
         payment_method = p_payment ->> 'method',
         approved_at = v_appr,
         raw_payment = p_payment,
         fail_code = null,
         fail_message = null
   where id = s.id;

  return jsonb_build_object('ok', true, 'already', false, 'order_id', v_oid, 'order_code', v_ocode);
end;
$$;
