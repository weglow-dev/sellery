-- ============================================================
-- 0120 · MYR DB 상태 비교 · 한도 · 형식을 이름 붙은 함수로 — 결과는 그대로 (2026-11-17)
--
--   점검(백엔드 원칙 1 · DB 안의 상태 묶음 · 판정 중복):
--     입금 대기 'WAITING_DEPOSIT' 직접 비교 7곳     → myr_order_status_waiting_deposit
--     요청 진행 중 'progress' 직접 비교 6곳          → myr_claim_in_progress(요청 처리 대기 'pending' 은 0116 myr_claim_waiting)
--     수정본 심사 중 'pending' 3곳                    → myr_revision_pending
--     줄 배송 상태 직접 비교 12곳                     → myr_ship_status_awaiting_prepare(PAID · 발주 전) · _preparing · _shipping · _delivered · _syncing(PREPARING · SHIPPING · 이벗 송장 동기화)
--                                                   (상태를 바꾸는 쓰기 set ship_status = … 는 그대로)
--     한도 숫자 — 상품 이미지 6장 · 문의 본문 2000자  → myr_product_image_max · myr_cs_body_max(거절 응답의 max 도 같은 함수)
--     택배사 목록 · 송장번호 정리 · 형식(SQL 3곳 복사) → myr_courier_ok · myr_tracking_no · myr_tracking_ok
--     배송 상자 표시의 "취소 아닌 줄"(화면이 status !== 'CANCELED' 로 판정) → 줄 응답 valid(myr_line_valid)
--   계산 결과 불변 — 새 함수는 지금 식을 그대로 감싼다 · 응답에 valid 칸만 더한다
--   테스트: supabase/tests/myr_db_status_names.test.sql · 기존 결제 · 입금 · 환불 · 요청 · 수정본 · 발주 · 송장 · 배송 · 문의 테스트
-- ============================================================

create or replace function public.myr_order_status_waiting_deposit(p_status text)
returns boolean language sql immutable as $$ select p_status = 'WAITING_DEPOSIT' $$;
revoke all on function public.myr_order_status_waiting_deposit(text) from public, anon, authenticated;

create or replace function public.myr_claim_in_progress(r public.myr_refund_requests)
returns boolean language sql immutable as $$ select r.status = 'progress' $$;
revoke all on function public.myr_claim_in_progress(public.myr_refund_requests) from public, anon, authenticated;

create or replace function public.myr_revision_pending(v public.myr_product_revisions)
returns boolean language sql immutable as $$ select v.status = 'pending' $$;
revoke all on function public.myr_revision_pending(public.myr_product_revisions) from public, anon, authenticated;

-- 줄 배송 상태 — 발주 전(결제완료) · 배송준비중 · 배송중 · 배송완료 · 이벗 송장 동기화 대상(배송준비중 · 배송중)
create or replace function public.myr_ship_status_awaiting_prepare(p_ship_status text)
returns boolean language sql immutable as $$ select p_ship_status = 'PAID' $$;
revoke all on function public.myr_ship_status_awaiting_prepare(text) from public, anon, authenticated;
create or replace function public.myr_ship_status_preparing(p_ship_status text)
returns boolean language sql immutable as $$ select p_ship_status = 'PREPARING' $$;
revoke all on function public.myr_ship_status_preparing(text) from public, anon, authenticated;
create or replace function public.myr_ship_status_shipping(p_ship_status text)
returns boolean language sql immutable as $$ select p_ship_status = 'SHIPPING' $$;
revoke all on function public.myr_ship_status_shipping(text) from public, anon, authenticated;
create or replace function public.myr_ship_status_delivered(p_ship_status text)
returns boolean language sql immutable as $$ select p_ship_status = 'DELIVERED' $$;
revoke all on function public.myr_ship_status_delivered(text) from public, anon, authenticated;
create or replace function public.myr_ship_status_syncing(p_ship_status text)
returns boolean language sql immutable as $$ select p_ship_status in ('PREPARING', 'SHIPPING') $$;
revoke all on function public.myr_ship_status_syncing(text) from public, anon, authenticated;

-- 한도 — 상품 이미지 장수 · 문의 본문 글자 수(화면은 입력 형식 규칙으로 같은 숫자를 따로 둔다 · 서버가 최종)
create or replace function public.myr_product_image_max()
returns integer language sql immutable as $$ select 6 $$;
revoke all on function public.myr_product_image_max() from public, anon, authenticated;
create or replace function public.myr_cs_body_max()
returns integer language sql immutable as $$ select 2000 $$;
revoke all on function public.myr_cs_body_max() from public, anon, authenticated;

-- 택배사 · 송장번호 — 받는 택배사 · 공백 · 하이픈을 뺀 번호 · 숫자 8~30자리
create or replace function public.myr_courier_ok(p_courier text)
returns boolean language sql immutable as $$ select coalesce(p_courier in ('CJ대한통운','우체국택배','한진택배','롯데택배','로젠택배'), false) $$;
revoke all on function public.myr_courier_ok(text) from public, anon, authenticated;
create or replace function public.myr_tracking_no(p_raw text)
returns text language sql immutable as $$ select regexp_replace(coalesce(p_raw, ''), '[\s-]', '', 'g') $$;
revoke all on function public.myr_tracking_no(text) from public, anon, authenticated;
create or replace function public.myr_tracking_ok(p_no text)
returns boolean language sql immutable as $$ select coalesce(p_no ~ '^\d{8,30}$', false) $$;
revoke all on function public.myr_tracking_ok(text) from public, anon, authenticated;

-- ── 판정을 쓰던 함수 — 식만 위 함수로 ─────────────────────────

-- 0115 정의 → 이름 붙은 함수
create or replace function public.myr_app_confirm_checkout(p_checkout_id uuid, p_payment_key text, p_payment jsonb, p_recover boolean default false)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c          public.myr_checkouts%rowtype;
  o_id       uuid;
  o_code     text;
  o_status   text;
  v_status   text;
  v_is_va    boolean;
  v_appr     timestamptz;
  v_due      timestamptz;
  v_problems jsonb := '[]'::jsonb;
  pr         record;
  v_need     integer;
  v_left     integer;
begin
  select * into c from public.myr_checkouts where id = p_checkout_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;

  if c.status = 'CONFIRMED' then
    select o.id, o.code, o.status into o_id, o_code, o_status from public.myr_orders o where o.checkout_id = c.id;
    return jsonb_build_object('ok', true, 'already', true, 'order_id', o_id, 'order_code', o_code, 'status', o_status);
  end if;
  if c.status not in ('PENDING','CONFIRMING') then
    select o.id, o.code, o.status into o_id, o_code, o_status from public.myr_orders o where o.checkout_id = c.id;
    if found then return jsonb_build_object('ok', true, 'already', true, 'order_id', o_id, 'order_code', o_code, 'status', o_status); end if;
    if not p_recover or c.fail_code = 'CANCEL_PENDING' then
      return jsonb_build_object('ok', false, 'code', coalesce(c.fail_code, c.status), 'message', c.fail_message);
    end if;
  end if;

  if p_payment is null
     or p_payment ->> 'status' not in ('DONE','WAITING_FOR_DEPOSIT')
     or p_payment ->> 'orderId' is distinct from c.toss_order_id
     or (p_payment ->> 'totalAmount')::bigint is distinct from c.amount::bigint
     or p_payment ->> 'paymentKey' is distinct from p_payment_key then
    return jsonb_build_object('ok', false, 'code', 'PAYMENT_MISMATCH');
  end if;
  v_is_va := p_payment ->> 'method' = '가상계좌' or (p_payment ? 'virtualAccount' and jsonb_typeof(p_payment -> 'virtualAccount') <> 'null');
  v_status := case when p_payment ->> 'status' = 'WAITING_FOR_DEPOSIT' then 'WAITING_DEPOSIT' else 'PAID' end;
  if public.myr_order_status_waiting_deposit(v_status) and not v_is_va then return jsonb_build_object('ok', false, 'code', 'PAYMENT_MISMATCH'); end if;
  v_appr := coalesce((p_payment ->> 'approvedAt')::timestamptz, (p_payment ->> 'requestedAt')::timestamptz, now());
  v_due  := case when public.myr_order_status_waiting_deposit(v_status) then (p_payment -> 'virtualAccount' ->> 'dueDate')::timestamptz else null end;

  -- 상품 행 잠금(id 순) → 상태·재고 재검사. 같은 상품을 담은 동시 confirm 은 여기서 직렬화된다.
  for pr in
    select p.id, p.code, public.myr_product_visible(p, s) as visible, public.myr_product_left(p) as left_qty,
           (select sum(ci.qty) from public.myr_checkout_items ci where ci.checkout_id = c.id and ci.product_id = p.id) as need
      from public.myr_products p
      left join public.sellers s on s.id = p.seller_id
     where p.id in (select product_id from public.myr_checkout_items where checkout_id = c.id)
     order by p.id
       for update of p
  loop
    v_need := coalesce(pr.need, 0);
    if not pr.visible then
      v_problems := v_problems || jsonb_build_object('code', pr.code, 'reason', 'NOT_AVAILABLE');
    else
      v_left := pr.left_qty;   -- 남은 재고 = myr_product_left 한 곳(0096)
      if public.myr_stock_short(v_left, v_need) then v_problems := v_problems || jsonb_build_object('code', pr.code, 'reason', 'SOLD_OUT', 'left', greatest(v_left, 0)); end if;
    end if;
  end loop;
  if jsonb_array_length(v_problems) > 0 then
    return jsonb_build_object('ok', false,
      'code', case when exists (select 1 from jsonb_array_elements(v_problems) e where e ->> 'reason' = 'SOLD_OUT') then 'SOLD_OUT' else 'NOT_AVAILABLE' end,
      'items', v_problems);
  end if;

  insert into public.myr_orders (checkout_id, user_id, customer_id, status, buyer_name, buyer_phone, buyer_email, shipping, order_name,
                                 items_amount, shipping_fee, payment_key, payment_method, paid_at, deposit_due_at, raw_payment)
  values (c.id, c.user_id, c.customer_id, v_status, c.buyer_name, c.buyer_phone, c.buyer_email, c.shipping, c.order_name,
          c.items_amount, c.shipping_fee, p_payment_key, p_payment ->> 'method', case when v_status = 'PAID' then v_appr else null end, v_due, p_payment)
  returning id, code into o_id, o_code;

  insert into public.myr_order_items (order_id, product_id, seller_id, product_name, option_index, option_name, qty, unit_price, seller_margin_rate, groupbuy_id)
  select o_id, ci.product_id, ci.seller_id, ci.product_name, ci.option_index, ci.option_name, ci.qty, ci.unit_price, p.seller_margin_rate, ci.groupbuy_id
    from public.myr_checkout_items ci
    join public.myr_products p on p.id = ci.product_id
   where ci.checkout_id = c.id;
  -- myr_order_items_sync_sold_qty 가 같은 트랜잭션에서 sold_qty 를 갱신한다.

  update public.myr_checkouts
     set status = 'CONFIRMED', payment_key = p_payment_key, payment_method = p_payment ->> 'method', approved_at = v_appr,
         raw_payment = p_payment, fail_code = null, fail_message = null
   where id = c.id;
  return jsonb_build_object('ok', true, 'already', false, 'order_id', o_id, 'order_code', o_code, 'status', v_status);
end;
$$;
revoke all on function public.myr_app_confirm_checkout(uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_confirm_checkout(uuid, text, jsonb, boolean) to service_role;

-- 0099 정의 → 이름 붙은 함수
create or replace function public.myr_app_deposit_done(p_order_id uuid, p_payment jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o public.myr_orders%rowtype;
begin
  select * into o from public.myr_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if public.myr_order_status_paid(o.status) then return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'status', o.status); end if;
  if not public.myr_order_status_waiting_deposit(o.status) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if p_payment is null or p_payment ->> 'status' is distinct from 'DONE' or p_payment ->> 'paymentKey' is distinct from o.payment_key
     or (p_payment ->> 'totalAmount')::bigint is distinct from o.amount::bigint then
    return jsonb_build_object('ok', false, 'code', 'PAYMENT_MISMATCH');
  end if;
  update public.myr_orders
     set status = 'PAID', paid_at = coalesce((p_payment ->> 'approvedAt')::timestamptz, now()), raw_payment = p_payment, payment_method = coalesce(p_payment ->> 'method', payment_method)
   where id = o.id;
  return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'status', 'PAID');
end;
$$;
revoke all on function public.myr_app_deposit_done(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_deposit_done(uuid, jsonb) to service_role;

-- 0058 정의 → 이름 붙은 함수
create or replace function public.myr_app_deposit_due(p_limit integer default 100)
returns setof jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object('id', o.id, 'code', o.code, 'payment_key', o.payment_key, 'checkout_id', o.checkout_id, 'deposit_due_at', o.deposit_due_at)
    from public.myr_orders o
   where public.myr_order_status_waiting_deposit(o.status) and o.deposit_due_at is not null and o.deposit_due_at < now()
   order by o.deposit_due_at
   limit p_limit
$$;
revoke all on function public.myr_app_deposit_due(integer) from public, anon, authenticated;
grant execute on function public.myr_app_deposit_due(integer) to service_role;

-- 0058 정의 → 이름 붙은 함수
create or replace function public.myr_app_deposit_expire(p_order_id uuid, p_payment jsonb default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o public.myr_orders%rowtype;
begin
  select * into o from public.myr_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if o.status = 'CANCELED' then return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'status', o.status); end if;
  if not public.myr_order_status_waiting_deposit(o.status) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  update public.myr_order_items set status = 'CANCELED' where order_id = o.id;
  update public.myr_orders set status = 'CANCELED', raw_cancel = p_payment, refund_actor = 'system', refund_reason = '가상계좌 입금 기한 만료', refunded_at = now() where id = o.id;
  return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'status', 'CANCELED');
end;
$$;
revoke all on function public.myr_app_deposit_expire(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_deposit_expire(uuid, jsonb) to service_role;

-- 0118 정의 → 이름 붙은 함수
create or replace function public.myr_app_refund_precheck(p_order_id uuid, p_items jsonb, p_actor text, p_actor_id uuid, p_deduction integer default 0)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  o          public.myr_orders%rowtype;
  r          record;
  v_items    jsonb := '[]'::jsonb;
  v_problems jsonb := '[]'::jsonb;
  v_amount   integer := 0;
  v_req_total integer := 0;
  v_full     boolean;
  v_goods    integer;
  v_deposit  boolean;
  v_deduction integer;
  v_refund   integer;
begin
  if p_actor is null or p_actor not in ('customer','seller','admin','system') then return jsonb_build_object('ok', false, 'code', 'BAD_ACTOR'); end if;
  if coalesce(p_deduction, 0) < 0 then return jsonb_build_object('ok', false, 'code', 'BAD_DEDUCTION'); end if;
  select * into o from public.myr_orders where id = p_order_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;

  -- 소유·권한 (존재 여부를 흘리지 않게 customer 의 남의 주문은 NOT_FOUND)
  if p_actor = 'customer' then
    if not public.myr_order_owned_by(o, p_actor_id) then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;
  end if;

  if not public.myr_order_status_alive(o.status) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  -- 고객 셀프 환불은 발주(배송준비중) 전 줄만 — 0077 에서 주문 운송장 기준 → 줄 배송 상태 기준(아래 줄마다)

  for r in select * from public.myr_refund_lines(o, p_items) loop
    if r.problem = 'BAD_FORMAT' then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS'); end if;
    if r.problem is not null then
      v_problems := v_problems || jsonb_build_object('item_id', r.item_id, 'reason', r.problem, 'left', r.remaining);
      continue;
    end if;
    -- 고객 셀프 환불은 바로 환불 줄만 — 줄 길 판정은 myr_line_refund_path 한 곳(샵 화면 · 요청 가드와 같다 · 0092)
    if p_actor = 'customer' and exists (select 1 from public.myr_order_items x where x.id = r.item_id and public.myr_line_refund_path(o, x) is distinct from 'instant') then
      return jsonb_build_object('ok', false, 'code', 'SHIPPED');
    end if;
    if p_actor = 'seller' and (p_actor_id is null or r.seller_id is distinct from p_actor_id) then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
    end if;
    v_items := v_items || jsonb_build_object('item_id', r.item_id, 'qty', r.qty, 'amount', public.myr_line_amount(r.unit_price, r.qty), 'seller_id', r.seller_id);
    v_amount := v_amount + public.myr_line_amount(r.unit_price, r.qty);
    v_req_total := v_req_total + r.qty;
  end loop;
  if jsonb_array_length(v_problems) > 0 then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS', 'items', v_problems); end if;
  if v_req_total = 0 then return jsonb_build_object('ok', false, 'code', 'NOTHING_LEFT'); end if;

  -- 이번 환불로 주문이 전부 환불되면 배송비도 돌려준다(§9-11 기본) — 배송비는 아직 환불 안 됐을 때 한 번만
  --   0108: 주문이 끝나는지는 남은 수량 하나(myr_order_refund_full → myr_order_left_qty) — record 의 주문 상태(myr_order_refund_status)와 같은 기준
  v_full := public.myr_order_refund_full(o, v_req_total);
  v_goods := v_amount;
  --   0108: 배송비까지 돌려줘도 남은 결제 금액(myr_order_net = 결제 − 환불) 안인지 — 같은 뜻을 모양만 바꿔 쓰지 않는다
  if v_full and o.shipping_fee > 0 and v_amount + o.shipping_fee <= public.myr_order_net(o) then v_amount := v_amount + o.shipping_fee; end if;

  -- 0105: 돌려줄 돈 — 입금 전 취소는 돈이 오가지 않아 0(차감도 없다) · 그 밖은 결제 금액 − 차감(myr_refund_after_deduction · 차감이 금액 이상이면 거절)
  v_deposit := public.myr_order_status_waiting_deposit(o.status);
  v_deduction := case when v_deposit then 0 else coalesce(p_deduction, 0) end;
  v_refund := case when v_deposit then 0 else public.myr_refund_after_deduction(v_amount, v_deduction) end;
  if v_refund is null then return jsonb_build_object('ok', false, 'code', 'DEDUCTION_TOO_BIG', 'amount', v_amount, 'deduction', v_deduction); end if;

  return jsonb_build_object('ok', true, 'order_code', o.code, 'order_status', o.status, 'payment_key', o.payment_key,
                            'amount', v_amount, 'goods', v_goods, 'shipping_back', v_amount - v_goods, 'deposit', v_deposit, 'full', v_full, 'items', v_items,
                            'deduction', v_deduction, 'refund_amount', v_refund, 'cancel_full', public.myr_refund_cancel_full(v_full, v_deduction),
                            -- 0118: 크리에이터별 환불 상품 금액(실적에서 빠지는 금액 · 차감 전) — 크리에이터 환불 메일이 줄을 다시 더하지 않는다
                            'seller_goods', public.myr_refund_seller_goods(v_items));
end;
$$;
revoke all on function public.myr_app_refund_precheck(uuid, jsonb, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.myr_app_refund_precheck(uuid, jsonb, text, uuid, integer) to service_role;

-- 0108 정의 → 이름 붙은 함수
create or replace function public.myr_app_refund_record(p_order_id uuid, p_items jsonb, p_actor text, p_actor_id uuid, p_reason text, p_amount integer, p_raw jsonb default null, p_deduction integer default 0)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o         public.myr_orders%rowtype;
  r         record;
  v_reason  text := left(coalesce(p_reason, ''), 200);
  v_n       integer := 0;
  v_status  text;
  v_expected integer;
  v_check   jsonb;
begin
  if p_actor is null or p_actor not in ('customer','seller','admin','system') then return jsonb_build_object('ok', false, 'code', 'BAD_ACTOR'); end if;
  select * into o from public.myr_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not public.myr_order_status_alive(o.status) then return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'status', o.status, 'amount', o.refund_amount); end if;
  -- 0105: 받은 금액을 precheck(같은 함수 · 같은 차감)로 다시 계산해 비교한다. 돈은 이미 나갔으니 다르면 거절하지 않고 기록한 뒤 mismatch 로 알린다
  --   (서버가 payment_events handled=false 로 운영 큐에 올린다 · 기록을 막으면 돈과 기록이 어긋난다)
  v_check := public.myr_app_refund_precheck(p_order_id, p_items, p_actor, p_actor_id, p_deduction);
  v_expected := case when (v_check ->> 'ok')::boolean then (v_check ->> 'refund_amount')::integer end;

  if public.myr_order_status_waiting_deposit(o.status) then
    update public.myr_order_items set status = 'CANCELED', refunded_at = now(), refund_reason = v_reason, refund_actor = p_actor where order_id = o.id;
    update public.myr_orders set status = 'CANCELED', refunded_at = now(), refund_reason = v_reason, refund_actor = p_actor, raw_cancel = p_raw where id = o.id;
    return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'status', 'CANCELED', 'amount', 0)
           || public.myr_refund_mismatch_json(p_amount, v_expected);
  end if;

  for r in select * from public.myr_refund_lines(o, p_items) loop
    if r.problem is not null then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS', 'items', jsonb_build_array(jsonb_build_object('item_id', r.item_id, 'reason', r.problem, 'left', r.remaining))); end if;
    -- 0068: 사진 경로는 이 주문·이 줄 아래(<order id>/<item id>/<uuid>.<ext>)만 — 아니면 거부(서버가 올린 경로가 아니다)
    if coalesce(array_length(r.photos, 1), 0) > 0
       and not (select bool_and(p ~ ('^' || o.id::text || '/' || r.item_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')) from unnest(r.photos) p) then
      return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS', 'items', jsonb_build_array(jsonb_build_object('item_id', r.item_id, 'reason', 'BAD_PHOTOS', 'left', r.remaining)));
    end if;
    update public.myr_order_items x
       set refunded_qty = refunded_qty + r.qty,
           refund_amount = refund_amount + public.myr_line_amount(r.unit_price, r.qty),
           -- 0108: 줄 상태 = 이번 환불 뒤 남은 수량이 0이면 REFUNDED(myr_line_refund_status → myr_line_left)
           status = public.myr_line_refund_status(x, r.qty),
           refunded_at = now(),
           -- 0067: 줄에는 "사유 — 상세"(상세가 있을 때만) · 0068: 사진 경로
           refund_reason = case when r.note is not null then left(v_reason || ' — ' || r.note, 500) else v_reason end,
           refund_photos = coalesce(r.photos, '{}'::text[]),
           refund_actor = p_actor
     where x.id = r.item_id;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'status', o.status, 'amount', o.refund_amount); end if;

  -- 0108: 주문 상태 = 남은 수량(myr_order_left_qty)이 0이면 REFUNDED — precheck 의 "주문이 끝나는지"(배송비 · 전액 취소)와 같은 기준
  v_status := public.myr_order_refund_status(o);
  update public.myr_orders
     set refund_amount = refund_amount + greatest(coalesce(p_amount, 0), 0), status = v_status,
         refunded_at = now(), refund_reason = v_reason, refund_actor = p_actor, raw_cancel = coalesce(p_raw, raw_cancel)
   where id = o.id;
  -- myr_order_items_sync_sold_qty(0058) 가 줄 update 마다 sold_qty 를 (qty − refunded_qty) 로 재계산했다.
  return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'status', v_status, 'amount', o.refund_amount + greatest(coalesce(p_amount, 0), 0))
         || public.myr_refund_mismatch_json(p_amount, v_expected);
end;
$$;
revoke all on function public.myr_app_refund_record(uuid, jsonb, text, uuid, text, integer, jsonb, integer) from public, anon, authenticated;
grant execute on function public.myr_app_refund_record(uuid, jsonb, text, uuid, text, integer, jsonb, integer) to service_role;

-- 0109 정의 → 이름 붙은 함수
create or replace function public.myr_order_json(o public.myr_orders, p_full boolean)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id, 'code', o.code, 'status', o.status,
    'amount', o.amount, 'items_amount', o.items_amount, 'shipping_fee', o.shipping_fee, 'refund_amount', o.refund_amount,
    'net_amount', public.myr_order_net(o), 'alive', public.myr_order_status_alive(o.status),
    'order_name', o.order_name, 'payment_method', o.payment_method, 'paid_at', o.paid_at, 'created_at', o.created_at,
    'deposit_due_at', o.deposit_due_at,
    'deposit', case when public.myr_order_status_waiting_deposit(o.status) and jsonb_typeof(o.raw_payment -> 'virtualAccount') = 'object'
                 then jsonb_build_object('bank', o.raw_payment -> 'virtualAccount' ->> 'bankCode', 'account', o.raw_payment -> 'virtualAccount' ->> 'accountNumber',
                                         'holder', o.raw_payment -> 'virtualAccount' ->> 'customerName', 'due', o.raw_payment -> 'virtualAccount' ->> 'dueDate')
                 else null end,
    'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at, 'delivered_at', o.delivered_at,
    'ship_status', public.myr_order_ship_status(o.id),
    'claim_status', case when public.myr_order_status_open(o.status) then public.myr_order_claim_status(o.id) end,
    'guest', o.user_id is null, 'buyer_name', o.buyer_name,
    'shipping', case when p_full then o.shipping else null end,
    'buyer_email', case when p_full then o.buyer_email else null end,
    'refund_reason', case when p_full and o.refund_amount > 0 then o.refund_reason else null end,
    'refunded_at', case when p_full and o.refund_amount > 0 then o.refunded_at else null end,
    -- 줄마다 환불 길(instant · claim · null · 0092) · 단순 변심 기한 · 지금 가능한지(0093) — 샵 화면이 이 값을 그대로 쓴다
    'items', coalesce((select jsonb_agg(public.myr_order_item_json(i) || jsonb_build_object('refund_path', public.myr_line_customer_path(o, i), 'left_qty', public.myr_line_left(i), 'left_amount', public.myr_line_amount(i.unit_price, public.myr_line_left(i)), 'live', public.myr_line_live(i),
                                                                                   'change_mind_until', public.myr_line_change_mind_until(i),
                                                                                   'change_mind_ok', public.myr_line_change_mind_ok(i)) order by i.created_at, i.id)
                         from public.myr_order_items i where i.order_id = o.id), '[]'::jsonb))
$$;
revoke all on function public.myr_order_json(public.myr_orders, boolean) from public, anon, authenticated;

-- 0078 정의 → 이름 붙은 함수
create or replace function public.myr_app_admin_claim_collected(p_code text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare r public.myr_refund_requests%rowtype;
begin
  select * into r from public.myr_refund_requests where code = lower(btrim(coalesce(p_code, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if r.collected_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'refund_now', public.myr_refund_request_step(r) = 'refund', 'request', public.myr_refund_request_json(r));
  end if;
  if not public.myr_claim_in_progress(r) or not r.needs_collect then return jsonb_build_object('ok', false, 'code', 'NOT_READY', 'status', r.status); end if;
  update public.myr_refund_requests set collected_at = now() where id = r.id;
  perform public.myr_refund_request_finish(r.id);
  select * into r from public.myr_refund_requests where id = r.id;
  return jsonb_build_object('ok', true, 'already', false, 'refund_now', public.myr_refund_request_step(r) = 'refund', 'request', public.myr_refund_request_json(r));
end;
$$;
revoke all on function public.myr_app_admin_claim_collected(text) from public, anon, authenticated;
grant execute on function public.myr_app_admin_claim_collected(text) to service_role;

-- 0078 정의 → 이름 붙은 함수
create or replace function public.myr_app_claims_refund_due(p_age interval default interval '5 minutes', p_limit integer default 20)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object('code', r.code, 'order_id', r.order_id, 'item_id', r.order_item_id, 'seller_id', r.seller_id, 'qty', r.qty,
                                        'reason', r.reason, 'note', r.note, 'photos', to_jsonb(r.photos), 'deduction', r.deduction) order by r.updated_at)
      from (select * from public.myr_refund_requests r
             where public.myr_claim_in_progress(r) and public.myr_refund_request_step(r) = 'refund' and r.updated_at < now() - p_age
             order by r.updated_at limit greatest(coalesce(p_limit, 20), 1)) r
  ), '[]'::jsonb)
$$;
revoke all on function public.myr_app_claims_refund_due(interval, integer) from public, anon, authenticated;
grant execute on function public.myr_app_claims_refund_due(interval, integer) to service_role;

-- 0116 정의 → 이름 붙은 함수
create or replace function public.myr_app_seller_claims_of_user(p_user uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select jsonb_agg(public.myr_refund_request_json(r) order by public.myr_claim_waiting(r) desc, (public.myr_claim_in_progress(r)) desc, r.created_at desc)
      from (select r.* from public.myr_refund_requests r join public.sellers s on s.id = r.seller_id
             where s.user_id = p_user order by public.myr_claim_waiting(r) desc, (public.myr_claim_in_progress(r)) desc, r.created_at desc limit 200) r
  ), '[]'::jsonb)
$$;
revoke all on function public.myr_app_seller_claims_of_user(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_claims_of_user(uuid) to service_role;

-- 0116 정의 → 이름 붙은 함수
create or replace function public.myr_order_claim_status(p_order_id uuid, p_seller_id uuid default null)
returns text
language sql
stable
set search_path = public
as $$
  select case when bool_or(public.myr_claim_waiting(r)) then 'pending' when bool_or(public.myr_claim_in_progress(r)) then 'progress' end
    from public.myr_refund_requests r
   where r.order_id = p_order_id and (p_seller_id is null or r.seller_id = p_seller_id) and public.myr_claim_status_open(r.status)
$$;
revoke all on function public.myr_order_claim_status(uuid, uuid) from public, anon, authenticated;

-- 0078 정의 → 이름 붙은 함수
create or replace function public.myr_refund_request_finish(p_id uuid)
returns text
language plpgsql
volatile
security definer set search_path = public
as $$
declare r public.myr_refund_requests%rowtype;
begin
  select * into r from public.myr_refund_requests where id = p_id for update;
  if public.myr_claim_in_progress(r) and public.myr_refund_request_step(r) is null then
    update public.myr_refund_requests set status = 'done', done_at = now() where id = p_id;
    return 'done';
  end if;
  return r.status;
end;
$$;
revoke all on function public.myr_refund_request_finish(uuid) from public, anon, authenticated;

-- 0116 정의 → 이름 붙은 함수
create or replace function public.myr_refund_request_step(r public.myr_refund_requests)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when public.myr_claim_waiting(r) then 'decide'
    when not public.myr_claim_in_progress(r) then null
    when r.needs_collect and r.collected_at is null then 'collect'
    when r.needs_refund and r.refunded_at is null then 'refund'
    when r.needs_reship and r.reshipped_at is null then 'reship'
    else null end
$$;
revoke all on function public.myr_refund_request_step(public.myr_refund_requests) from public, anon, authenticated;

-- 0099 정의 → 이름 붙은 함수
create or replace function public.myr_app_admin_review_product(p_product_id uuid, p_decision text, p_reason text default null, p_reviewer uuid default null, p_items jsonb default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p          public.myr_products%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_items    jsonb := public.myr_reject_items(p_items);
  v_reason   text := public.myr_reject_reason(p_reason, v_items);
begin
  select * into p from public.myr_products where id = p_product_id and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_decision not in ('approve', 'reject', 'pause', 'end') then return jsonb_build_object('ok', false, 'code', 'BAD_DECISION'); end if;
  if v_decision = 'reject' and v_reason is null then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;
  if v_decision = 'pause' and not public.myr_product_listed(p) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', p.status); end if;
  if v_decision = 'end' then
    if not public.myr_product_status_approved(p.status) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', p.status); end if;
    update public.myr_products set status = 'ended', reviewed_at = now(), reviewed_by = p_reviewer where id = p.id;
    update public.myr_product_revisions set status = 'canceled' where product_id = p.id and public.myr_revision_pending(myr_product_revisions);
    return jsonb_build_object('ok', true, 'code', p.code, 'status', 'ended');
  end if;
  update public.myr_products
     set status = case v_decision when 'approve' then 'listed' when 'reject' then 'rejected' else 'paused' end,
         reject_reason = case v_decision when 'reject' then v_reason else null end,
         reject_items = case v_decision when 'reject' then v_items else '[]'::jsonb end,
         reviewed_at = now(),
         reviewed_by = p_reviewer
   where id = p.id;
  return jsonb_build_object('ok', true, 'code', p.code, 'status', case v_decision when 'approve' then 'listed' when 'reject' then 'rejected' else 'paused' end);
end;
$$;
revoke all on function public.myr_app_admin_review_product(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_admin_review_product(uuid, text, text, uuid, jsonb) to service_role;

-- 0099 정의 → 이름 붙은 함수
create or replace function public.myr_app_admin_review_revision(p_product_id uuid, p_decision text, p_reason text default null, p_reviewer uuid default null, p_items jsonb default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p          public.myr_products%rowtype;
  rv         public.myr_product_revisions%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_items    jsonb := public.myr_reject_items(p_items);
  v_reason   text := public.myr_reject_reason(p_reason, v_items);
begin
  if v_decision not in ('approve', 'reject') then return jsonb_build_object('ok', false, 'code', 'BAD_DECISION'); end if;
  select * into p from public.myr_products where id = p_product_id and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select * into rv from public.myr_product_revisions where product_id = p.id and public.myr_revision_pending(myr_product_revisions) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_decision = 'reject' and v_reason is null then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;

  if v_decision = 'approve' then
    if not public.myr_product_status_approved(p.status) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', p.status); end if;
    perform public.myr_product_apply_fields(p.id, rv.fields);
    update public.myr_products set reviewed_at = now(), reviewed_by = p_reviewer where id = p.id;
  end if;
  update public.myr_product_revisions
     set status = case v_decision when 'approve' then 'approved' else 'rejected' end,
         reject_reason = case v_decision when 'reject' then v_reason end,
         reject_items = case v_decision when 'reject' then v_items else '[]'::jsonb end,
         reviewed_at = now(),
         reviewed_by = p_reviewer
   where id = rv.id;
  return jsonb_build_object('ok', true, 'code', p.code, 'status', case v_decision when 'approve' then 'approved' else 'rejected' end);
end;
$$;
revoke all on function public.myr_app_admin_review_revision(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_admin_review_revision(uuid, text, text, uuid, jsonb) to service_role;

-- 0099 정의 → 이름 붙은 함수
create or replace function public.myr_app_seller_submit_revision(p_seller uuid, p_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p     public.myr_products%rowtype;
  keep  text[];
  r     jsonb;
  cur   jsonb;
  v_id  uuid;
begin
  select * into p from public.myr_products where id = p_id and seller_id = p_seller and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not public.myr_product_status_approved(p.status) then return jsonb_build_object('ok', false, 'code', 'NOT_REVISABLE', 'status', p.status); end if;
  if exists (select 1 from public.myr_product_revisions where product_id = p.id and public.myr_revision_pending(myr_product_revisions)) then
    return jsonb_build_object('ok', false, 'code', 'REVISION_PENDING');
  end if;

  keep := array_remove(p.image_urls || p.thumb_url, null);
  r := public.myr_product_fields(p_seller, p_payload, true, keep);
  if not (r ->> 'ok')::boolean then return r; end if;
  -- 지금 내용도 같은 정리를 거쳐 비교(공백 · 빈 줄 차이는 "바뀜" 이 아니다)
  cur := coalesce(public.myr_product_fields(p_seller, public.myr_product_fields_json(p), false, keep) -> 'fields', public.myr_product_fields_json(p));
  if r -> 'fields' = cur then return jsonb_build_object('ok', false, 'code', 'NO_CHANGE'); end if;

  insert into public.myr_product_revisions (product_id, seller_id, fields)
  values (p.id, p_seller, r -> 'fields')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'revision_id', v_id, 'status', 'pending');
end;
$$;
revoke all on function public.myr_app_seller_submit_revision(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_seller_submit_revision(uuid, uuid, jsonb) to service_role;

-- 0077 정의 → 이름 붙은 함수
create or replace function public.myr_app_admin_mark_delayed()
returns integer
language sql
volatile
security definer set search_path = public
as $$
  with u as (update public.myr_order_items set is_delayed = true where public.myr_ship_status_preparing(ship_status) and not is_delayed returning 1)
  select count(*)::integer from u
$$;
revoke all on function public.myr_app_admin_mark_delayed() from public, anon, authenticated;
grant execute on function public.myr_app_admin_mark_delayed() to service_role;

-- 0112 정의 → 이름 붙은 함수
create or replace function public.myr_app_admin_mark_prepared(p_item_ids uuid[], p_ebut boolean default false)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_ids uuid[];
begin
  with u as (
    update public.myr_order_items i
       set ship_status = 'PREPARING', ebut_registered_at = case when p_ebut then now() else i.ebut_registered_at end
      from public.myr_orders o
     where o.id = i.order_id and i.id = any (coalesce(p_item_ids, '{}'))
       and public.myr_ship_status_awaiting_prepare(i.ship_status) and public.myr_line_ship_work(o, i)
    returning i.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from u;
  return jsonb_build_object('ok', true, 'count', cardinality(v_ids),
    'orders', coalesce((select jsonb_agg(distinct o.code) from public.myr_order_items i join public.myr_orders o on o.id = i.order_id where i.id = any (v_ids)), '[]'::jsonb));
end;
$$;
revoke all on function public.myr_app_admin_mark_prepared(uuid[], boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_mark_prepared(uuid[], boolean) to service_role;

-- 0118 정의 → 이름 붙은 함수
create or replace function public.myr_app_admin_prepare_candidates(p_cutoff timestamptz default null)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', i.id, 'order_id', o.id, 'order_code', o.code, 'ordered_at', o.created_at, 'paid_at', o.paid_at,
           'goods_code', coalesce(nullif(btrim(p.ebut_goods_code), ''), p.code), 'goods_name', i.product_name, 'goods_option', coalesce(i.option_name, ''),
           'qty', public.myr_line_left(i), 'seller_id', i.seller_id, 'shipping', o.shipping
         ) order by o.paid_at, o.id, i.created_at, i.id), '[]'::jsonb)
    from public.myr_order_items i
    join public.myr_orders o on o.id = i.order_id
    join public.myr_products p on p.id = i.product_id
   where public.myr_ship_status_awaiting_prepare(i.ship_status) and public.myr_line_ship_work(o, i) and o.paid_at < coalesce(p_cutoff, public.myr_prepare_cutoff(now()))
$$;
revoke all on function public.myr_app_admin_prepare_candidates(timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_admin_prepare_candidates(timestamptz) to service_role;

-- 0112 정의 → 이름 붙은 함수
create or replace function public.myr_app_admin_deliver(p_order_code text, p_delivered_at timestamptz default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o     public.myr_orders%rowtype;
  v_at  timestamptz := coalesce(p_delivered_at, now());
  v_n   integer;
begin
  select * into o from public.myr_orders where code = lower(btrim(coalesce(p_order_code, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not public.myr_order_status_open(o.status) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if v_at > now() + interval '5 minutes' or v_at < o.paid_at then return jsonb_build_object('ok', false, 'code', 'BAD_DATE'); end if;
  perform 1 from public.myr_order_items where order_id = o.id for update;
  if not exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_ship_status_shipping(i.ship_status) and public.myr_line_ship_work(o, i)) then
    if exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_ship_status_delivered(i.ship_status) and public.myr_line_ship_work(o, i)) then
      return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'delivered', 0);
    end if;
    return jsonb_build_object('ok', false, 'code', 'NOT_SHIPPED');
  end if;
  with u as (
    update public.myr_order_items
       set ship_status = 'DELIVERED', delivered_at = v_at, is_delayed = false
     where order_id = o.id and public.myr_ship_status_shipping(ship_status) and public.myr_line_ship_work(o, myr_order_items)
    returning 1)
  select count(*) into v_n from u;
  update public.myr_orders
     set delivered_at = case when public.myr_order_ship_status(o.id) = 'DELIVERED' then coalesce(delivered_at, v_at) else delivered_at end,
         updated_at = now()
   where id = o.id;
  return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'delivered', v_n, 'delivered_at', v_at);
end;
$$;
revoke all on function public.myr_app_admin_deliver(text, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_admin_deliver(text, timestamptz) to service_role;

-- 0112 정의 → 이름 붙은 함수
create or replace function public.myr_app_admin_ship(p_order_code text, p_courier text, p_tracking_no text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o          public.myr_orders%rowtype;
  v_courier  text := btrim(coalesce(p_courier, ''));
  v_tracking text := public.myr_tracking_no(p_tracking_no);
  v_old      text;
begin
  if not public.myr_courier_ok(v_courier) then return jsonb_build_object('ok', false, 'code', 'BAD_COURIER'); end if;
  if not public.myr_tracking_ok(v_tracking) then return jsonb_build_object('ok', false, 'code', 'BAD_TRACKING'); end if;
  select * into o from public.myr_orders where code = lower(btrim(coalesce(p_order_code, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not public.myr_order_status_open(o.status) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if o.tracking_no = v_tracking and o.courier = v_courier
     and not exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_line_ship_work(o, i) and public.myr_ship_status_unshipped(i.ship_status)) then
    return jsonb_build_object('ok', true, 'already', true, 'order_id', o.id, 'order_code', o.code, 'status', o.status, 'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at);
  end if;
  v_old := o.tracking_no;
  update public.myr_orders
     set courier = v_courier, tracking_no = v_tracking, shipped_at = coalesce(shipped_at, now()), updated_at = now()
   where id = o.id
   returning * into o;
  -- 남은 줄(결제완료 · 배송준비중) + 예전 송장을 달고 있던 줄(정정) — 배송완료 줄은 상태를 되돌리지 않는다
  update public.myr_order_items i
     set ship_status = case when public.myr_ship_status_delivered(i.ship_status) then 'DELIVERED' else 'SHIPPING' end,
         courier = v_courier, tracking_no = v_tracking, shipped_at = coalesce(i.shipped_at, now()), is_delayed = false
   where i.order_id = o.id and public.myr_line_ship_work(o, i)
     and (public.myr_ship_status_unshipped(i.ship_status) or (v_old is not null and i.tracking_no = v_old));
  return jsonb_build_object('ok', true, 'already', false, 'order_id', o.id, 'order_code', o.code, 'status', o.status, 'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at);
end;
$$;
revoke all on function public.myr_app_admin_ship(text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship(text, text, text) to service_role;

-- 0118 정의 → 이름 붙은 함수
create or replace function public.myr_app_admin_ship_line(p_item_id uuid, p_courier text, p_tracking_no text, p_delivered boolean default false)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  i          public.myr_order_items%rowtype;
  o          public.myr_orders%rowtype;
  v_courier  text := nullif(btrim(coalesce(p_courier, '')), '');
  v_tracking text := public.myr_tracking_no(p_tracking_no);
  v_new      boolean;
  v_delivered boolean;
begin
  if v_courier is not null and not public.myr_courier_ok(v_courier) then return jsonb_build_object('ok', false, 'code', 'BAD_COURIER'); end if;
  if not public.myr_tracking_ok(v_tracking) then return jsonb_build_object('ok', false, 'code', 'BAD_TRACKING'); end if;
  select * into i from public.myr_order_items where id = p_item_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select * into o from public.myr_orders where id = i.order_id for update;
  if not public.myr_line_ship_work(o, i) then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status);
  end if;
  v_new := i.tracking_no is distinct from v_tracking;
  -- 0118: 배송 완료 = 택배사 배송 완료(p_delivered · 이벗 91) 또는 발송 10일 지남(myr_line_auto_delivered · 전에는 TS 가 판정)
  v_delivered := coalesce(p_delivered, false) or public.myr_line_auto_delivered(i, now());
  update public.myr_order_items
     set ship_status = case when v_delivered or public.myr_ship_status_delivered(ship_status) then 'DELIVERED' else 'SHIPPING' end,
         courier = coalesce(v_courier, courier), tracking_no = v_tracking, shipped_at = coalesce(shipped_at, now()),
         delivered_at = case when v_delivered then coalesce(delivered_at, now()) else delivered_at end, is_delayed = false
   where id = i.id
   returning * into i;
  -- 주문 칸(옛 화면 · 배송 시작 메일) — 비었을 때만 채운다 · 살아 있는 줄이 전부 배송완료면 주문 배송완료 시각
  update public.myr_orders
     set courier = coalesce(courier, i.courier), tracking_no = coalesce(tracking_no, i.tracking_no), shipped_at = coalesce(shipped_at, i.shipped_at),
         delivered_at = case when public.myr_order_ship_status(o.id) = 'DELIVERED' then coalesce(delivered_at, now()) else delivered_at end,
         updated_at = now()
   where id = o.id;
  return jsonb_build_object('ok', true, 'newly_shipped', v_new, 'delivered', v_delivered, 'order_id', o.id, 'order_code', o.code, 'item_id', i.id,
                            'ship_status', i.ship_status, 'courier', i.courier, 'tracking_no', i.tracking_no, 'shipped_at', i.shipped_at);
end;
$$;
revoke all on function public.myr_app_admin_ship_line(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship_line(uuid, text, text, boolean) to service_role;

-- 0112 정의 → 이름 붙은 함수
create or replace function public.myr_app_admin_ship_pending(p_limit integer default 100, p_shipped boolean default false)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id, 'code', o.code, 'status', o.status, 'buyer_name', o.buyer_name, 'order_name', o.order_name, 'amount', o.amount,
           'paid_at', o.paid_at, 'created_at', o.created_at, 'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at,
           'recipient', o.shipping ->> 'recipient',
           'lines', o.n_lines,
           'ship_status', public.myr_order_ship_status(o.id),
           'preparing', o.n_preparing
         ) order by case when p_shipped then o.shipped_at else o.paid_at end desc), '[]'::jsonb)
    from (select o.*,
                 (select count(*) from public.myr_order_items i where i.order_id = o.id and public.myr_line_ship_work(o, i)) as n_lines,
                 (select count(*) from public.myr_order_items i where i.order_id = o.id and public.myr_line_ship_work(o, i) and public.myr_ship_status_preparing(i.ship_status)) as n_preparing
            from public.myr_orders o
           where public.myr_order_status_open(o.status)
             and (case when p_shipped
                       then not exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_line_ship_work(o, i) and public.myr_ship_status_unshipped(i.ship_status))
                            and exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_line_ship_work(o, i))
                       else exists (select 1 from public.myr_order_items i where i.order_id = o.id and public.myr_line_ship_work(o, i) and public.myr_ship_status_unshipped(i.ship_status)) end)
           order by case when p_shipped then o.shipped_at else o.paid_at end desc
           limit greatest(coalesce(p_limit, 100), 1)) o
$$;
revoke all on function public.myr_app_admin_ship_pending(integer, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship_pending(integer, boolean) to service_role;

-- 0112 정의 → 이름 붙은 함수
create or replace function public.myr_app_admin_ship_sync_candidates()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'order_id', i.order_id, 'ship_status', i.ship_status, 'tracking_no', i.tracking_no, 'shipped_at', i.shipped_at)
                            order by i.order_id, i.id), '[]'::jsonb)
    from public.myr_order_items i
    join public.myr_orders o on o.id = i.order_id
   where public.myr_ship_status_syncing(i.ship_status) and i.ebut_registered_at is not null
     and public.myr_line_ship_work(o, i)
$$;
revoke all on function public.myr_app_admin_ship_sync_candidates() from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship_sync_candidates() to service_role;

-- 0112 정의 → 이름 붙은 함수
create or replace function public.myr_app_admin_undelivered(p_days integer default 5)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'order_code', o.code, 'item_id', i.id, 'product', i.product_name, 'option', i.option_name, 'qty', public.myr_line_left(i),
           'seller', s.handle, 'courier', i.courier, 'tracking_no', i.tracking_no, 'shipped_at', i.shipped_at,
           'days', floor(extract(epoch from (now() - i.shipped_at)) / 86400)::integer, 'ebut', i.ebut_registered_at is not null)
         order by i.shipped_at, o.code), '[]'::jsonb)
    from public.myr_order_items i
    join public.myr_orders o on o.id = i.order_id
    join public.sellers s on s.id = i.seller_id
   where public.myr_ship_status_shipping(i.ship_status) and public.myr_line_ship_work(o, i)
     and i.shipped_at <= now() - make_interval(days => greatest(coalesce(p_days, 5), 0))
$$;
revoke all on function public.myr_app_admin_undelivered(integer) from public, anon, authenticated;
grant execute on function public.myr_app_admin_undelivered(integer) to service_role;

-- 0118 정의 → 이름 붙은 함수
create or replace function public.myr_line_auto_delivered(i public.myr_order_items, p_now timestamptz)
returns boolean
language sql
immutable
as $$
  select coalesce(public.myr_ship_status_shipping(i.ship_status) and i.shipped_at <= p_now - interval '10 days', false)
$$;
revoke all on function public.myr_line_auto_delivered(public.myr_order_items, timestamptz) from public, anon, authenticated;

-- 0099 정의 → 이름 붙은 함수
create or replace function public.myr_line_refund_path(o public.myr_orders, i public.myr_order_items)
returns text
language sql
stable
as $$
  select case
    when not public.myr_order_status_alive(o.status) then null
    when not public.myr_line_live(i) then null
    when public.myr_ship_status_awaiting_prepare(i.ship_status) then 'instant'
    when not public.myr_order_status_open(o.status) then null
    else 'claim' end
$$;
revoke all on function public.myr_line_refund_path(public.myr_orders, public.myr_order_items) from public, anon, authenticated;

-- 0099 정의 → 이름 붙은 함수
create or replace function public.myr_product_fields(p_seller uuid, p_payload jsonb, p_submit boolean, p_keep_images text[] default '{}')
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  j          jsonb := coalesce(p_payload, '{}'::jsonb);
  v_name     text := public.myr_clip(j -> 'name', 60);
  v_price    integer;
  v_price_n  numeric;
  v_category text := nullif(public.myr_clip(j -> 'category', 20), '');
  v_note     text := public.myr_clip(j -> 'note', 1000);
  v_images   text[];
  v_chips    text[];
  v_ing      jsonb;
  v_steps    jsonb;
  v_faq      jsonb;
  v_tile     text := nullif(public.myr_clip(j -> 'tile', 200), '');
  v_icon     text := public.myr_clip(j -> 'icon', 20);
  v_img_re   text := '^https?://[^/]+/storage/v1/object/public/myr-products/' || p_seller::text || '/[A-Za-z0-9-]{8,64}\.(jpg|png|webp)$';
begin
  -- 범위를 숫자(numeric) 그대로 먼저 본다 — 정수로 먼저 바꾸면 약 21억을 넘는 값에서 integer out of range 오류가 나 "저장하지 못했어요"로 끝났다(0094)
  v_price_n := case when jsonb_typeof(j -> 'price') = 'number' then (j ->> 'price')::numeric else 0 end;
  if v_price_n < 0 or v_price_n > public.myr_product_price_max() then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'price', 'max', public.myr_product_price_max());
  end if;
  v_price := v_price_n::integer;
  if v_category is not null and v_category not in ('diet','inner','derma','hair','mental','mens') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'category');
  end if;
  if jsonb_typeof(j -> 'image_urls') = 'array' and jsonb_array_length(j -> 'image_urls') > public.myr_product_image_max() then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'images');
  end if;
  select coalesce(array_agg(u order by o), '{}') into v_images
    from jsonb_array_elements_text(case when jsonb_typeof(j -> 'image_urls') = 'array' then j -> 'image_urls' else '[]'::jsonb end) with ordinality as t(u, o);
  if exists (select 1 from unnest(v_images) u where u !~ v_img_re and not coalesce(u = any (p_keep_images), false)) then
    return jsonb_build_object('ok', false, 'code', 'BAD_IMAGE');
  end if;
  select coalesce(array_agg(c order by o), '{}') into v_chips
    from (select left(btrim(c), 20) c, o from jsonb_array_elements_text(case when jsonb_typeof(j -> 'chips') = 'array' then j -> 'chips' else '[]'::jsonb end) with ordinality as t(c, o)) x
   where c <> '' and o <= 3;
  select coalesce(jsonb_agg(jsonb_build_object('name', public.myr_clip(e -> 'name', 40), 'why', public.myr_clip(e -> 'why', 200), 'amount', public.myr_clip(e -> 'amount', 40)) order by o), '[]'::jsonb) into v_ing
    from jsonb_array_elements(case when jsonb_typeof(j -> 'ingredient_rows') = 'array' then j -> 'ingredient_rows' else '[]'::jsonb end) with ordinality as t(e, o)
   where o <= 12 and public.myr_clip(e -> 'name', 40) <> '';
  select coalesce(jsonb_agg(jsonb_build_object('t', public.myr_clip(e -> 't', 40), 'd', public.myr_clip(e -> 'd', 300)) order by o), '[]'::jsonb) into v_steps
    from jsonb_array_elements(case when jsonb_typeof(j -> 'howto_steps') = 'array' then j -> 'howto_steps' else '[]'::jsonb end) with ordinality as t(e, o)
   where o <= 6 and public.myr_clip(e -> 't', 40) <> '';
  select coalesce(jsonb_agg(jsonb_build_object('q', public.myr_clip(e -> 'q', 120), 'a', public.myr_clip(e -> 'a', 600)) order by o), '[]'::jsonb) into v_faq
    from jsonb_array_elements(case when jsonb_typeof(j -> 'faq') = 'array' then j -> 'faq' else '[]'::jsonb end) with ordinality as t(e, o)
   where o <= 10 and public.myr_clip(e -> 'q', 120) <> '' and public.myr_clip(e -> 'a', 600) <> '';
  -- 비주얼 — 그라데이션 · 아이콘 id 만(스타일 주입 방지)
  if v_tile is not null and v_tile !~ '^linear-gradient\([0-9a-zA-Z#,.% ()-]{1,180}\)$' then v_tile := null; end if;
  if v_icon !~ '^[a-z]{2,20}$' then v_icon := 'pill'; end if;

  -- 필수 — 임시저장은 제품명만 · 심사 요청(새 상품 · 수정)은 제품명 · 가격 · 카테고리 · 레시피 노트
  if v_name = '' then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'name'); end if;
  if p_submit then
    if v_price <= 0 then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'price'); end if;
    if v_category is null then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'category'); end if;
    if v_note = '' then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'note'); end if;
  end if;

  return jsonb_build_object('ok', true, 'fields', jsonb_build_object(
    'name', v_name, 'price', v_price, 'unit', public.myr_clip(j -> 'unit', 40), 'category', v_category,
    'tile', v_tile, 'icon', v_icon, 'image_urls', to_jsonb(v_images), 'chips', to_jsonb(v_chips), 'note', v_note,
    'story_title', public.myr_clip(j -> 'story_title', 80), 'story', public.myr_clip(j -> 'story', 3000),
    'ingredient_rows', v_ing, 'howto_steps', v_steps, 'faq', v_faq,
    'form', public.myr_clip(j -> 'form', 30), 'pack', public.myr_clip(j -> 'pack', 30),
    'shelf_life', public.myr_clip(j -> 'shelf_life', 80), 'storage_method', public.myr_clip(j -> 'storage_method', 80)
  ));
end;
$$;
revoke all on function public.myr_product_fields(uuid, jsonb, boolean, text[]) from public, anon, authenticated;

-- 0119 정의 → 이름 붙은 함수
create or replace function public.myr_app_cs_open(p_product_id uuid, p_customer_id uuid, p_user_id uuid, p_buyer_name text, p_type text, p_body text,
                                                  p_order_code text default null, p_guest_token text default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p        public.myr_products%rowtype;
  v_body   text := public.myr_cs_normalize_body(p_body);
  v_type   text := btrim(coalesce(p_type, ''));
  v_name   text := nullif(left(regexp_replace(btrim(coalesce(p_buyer_name, '')), '\s+', ' ', 'g'), 40), '');
  v_ocode  text := nullif(left(btrim(coalesce(p_order_code, '')), 32), '');
  v_token  text := nullif(btrim(coalesce(p_guest_token, '')), '');
  v_oid    uuid;
  v_iid    uuid;
  v_seller text;
  x        public.myr_cs_conversations%rowtype;
begin
  select * into p from public.myr_products where id = p_product_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_type not in ('배송 문의', '교환·반품', '상품 문의', '기타') then return jsonb_build_object('ok', false, 'code', 'BAD_TYPE'); end if;
  if v_body = '' or char_length(v_body) > public.myr_cs_body_max() then return jsonb_build_object('ok', false, 'code', 'BAD_BODY', 'max', public.myr_cs_body_max()); end if;

  if v_ocode is not null then
    select o.id into v_oid from public.myr_orders o
     where lower(o.code) = lower(v_ocode)
       and ((p_user_id is not null and public.myr_order_owned_by(o, p_user_id)) or (p_customer_id is not null and public.myr_order_owned_by(o, p_customer_id)))
     limit 1;
    if v_oid is null and v_token is not null then
      v_oid := public.myr_app_guest_order_verify(v_ocode, v_token);
    end if;
    if v_oid is not null then
      select i.id into v_iid from public.myr_order_items i where i.order_id = v_oid and i.product_id = p.id order by i.created_at limit 1;
      if v_iid is null then v_oid := null; end if;   -- 이 상품의 줄이 없는 주문은 이 셀러와 무관 — 연결하지 않는다
    end if;
  end if;

  insert into public.myr_cs_conversations (product_id, seller_id, order_code, order_id, order_item_id, customer_id, user_id, buyer_name, type, status, last_preview, last_message_at)
  values (p.id, p.seller_id, v_ocode, v_oid, v_iid, p_customer_id, p_user_id, coalesce(v_name, '고객'), v_type, 'OPEN', left(v_body, 80), now())
  returning * into x;
  insert into public.myr_cs_messages (conversation_id, sender, actor_role, actor_user_id, body) values (x.id, 'customer', 'customer', p_user_id, v_body);
  select name into v_seller from public.sellers where id = p.seller_id;

  return jsonb_build_object('ok', true, 'conversation_id', x.id, 'conversation_code', x.code, 'client_token', x.client_token,
                            'seller_id', p.seller_id, 'seller_name', v_seller, 'order_id', v_oid, 'order_item_id', v_iid, 'order_matched', v_oid is not null);
end;
$$;
revoke all on function public.myr_app_cs_open(uuid, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_cs_open(uuid, uuid, uuid, text, text, text, text, text) to service_role;

-- 0063 정의 → 이름 붙은 함수
create or replace function public.myr_app_cs_reply(p_code text, p_actor text, p_actor_id uuid, p_client_token uuid, p_actor_user_id uuid, p_body text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  x        public.myr_cs_conversations%rowtype;
  v_body   text := public.myr_cs_normalize_body(p_body);
  v_sender text;
  v_status text;
  m        public.myr_cs_messages%rowtype;
begin
  if p_actor not in ('customer', 'seller', 'admin') then return jsonb_build_object('ok', false, 'code', 'BAD_ACTOR'); end if;
  select * into x from public.myr_cs_find(p_code, p_actor, p_actor_id, p_client_token);
  if x.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  perform 1 from public.myr_cs_conversations where id = x.id for update;
  if x.status = 'CLOSED' then return jsonb_build_object('ok', false, 'code', 'CLOSED'); end if;
  if v_body = '' or char_length(v_body) > public.myr_cs_body_max() then return jsonb_build_object('ok', false, 'code', 'BAD_BODY', 'max', public.myr_cs_body_max()); end if;

  v_sender := case when p_actor = 'customer' then 'customer' else 'seller' end;
  v_status := case when p_actor = 'customer' then 'OPEN' else 'ANSWERED' end;
  insert into public.myr_cs_messages (conversation_id, sender, actor_role, actor_user_id, body)
  values (x.id, v_sender, p_actor, p_actor_user_id, v_body) returning * into m;
  update public.myr_cs_conversations
     set status = v_status, last_preview = left(v_body, 80), last_message_at = m.created_at,
         replied_at = case when v_status = 'ANSWERED' then m.created_at else replied_at end
   where id = x.id;
  return jsonb_build_object('ok', true, 'conversation_id', x.id, 'conversation_code', x.code, 'status', v_status, 'message', public.myr_cs_message_json(m));
end;
$$;
revoke all on function public.myr_app_cs_reply(text, text, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.myr_app_cs_reply(text, text, uuid, uuid, uuid, text) to service_role;

-- 0078 정의 → 이름 붙은 함수
create or replace function public.myr_app_admin_claim_reship(p_code text, p_courier text, p_tracking_no text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  r          public.myr_refund_requests%rowtype;
  v_courier  text := btrim(coalesce(p_courier, ''));
  v_tracking text := public.myr_tracking_no(p_tracking_no);
begin
  if not public.myr_courier_ok(v_courier) then return jsonb_build_object('ok', false, 'code', 'BAD_COURIER'); end if;
  if not public.myr_tracking_ok(v_tracking) then return jsonb_build_object('ok', false, 'code', 'BAD_TRACKING'); end if;
  select * into r from public.myr_refund_requests where code = lower(btrim(coalesce(p_code, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if r.reshipped_at is not null and r.reship_tracking_no = v_tracking and r.reship_courier = v_courier then
    return jsonb_build_object('ok', true, 'already', true, 'request', public.myr_refund_request_json(r));
  end if;
  if r.status not in ('progress','done') or not r.needs_reship then return jsonb_build_object('ok', false, 'code', 'NOT_READY', 'status', r.status); end if;
  update public.myr_refund_requests set reship_courier = v_courier, reship_tracking_no = v_tracking, reshipped_at = coalesce(reshipped_at, now()) where id = r.id;
  perform public.myr_refund_request_finish(r.id);
  select * into r from public.myr_refund_requests where id = r.id;
  return jsonb_build_object('ok', true, 'already', false, 'request', public.myr_refund_request_json(r));
end;
$$;
revoke all on function public.myr_app_admin_claim_reship(text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_admin_claim_reship(text, text, text) to service_role;

-- 0077 정의 → 이름 붙은 함수
create or replace function public.myr_order_item_json(i public.myr_order_items)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', i.id, 'product_code', p.code, 'name', i.product_name, 'option', i.option_name,
    'qty', i.qty, 'unit_price', i.unit_price, 'amount', i.amount, 'status', i.status, 'refunded_qty', i.refunded_qty,
    -- 0120: 취소 아닌 줄(myr_line_valid) — 배송 상자 표시가 줄 상태로 다시 판정하지 않는다
    'valid', public.myr_line_valid(i),
    'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url, 'creator', s.name, 'creator_handle', s.handle,
    'ship_status', i.ship_status, 'courier', i.courier, 'tracking_no', i.tracking_no, 'shipped_at', i.shipped_at, 'delivered_at', i.delivered_at)
    from public.myr_products p
    left join public.sellers s on s.id = i.seller_id
   where p.id = i.product_id
$$;
revoke all on function public.myr_order_item_json(public.myr_order_items) from public, anon, authenticated;

-- 0116 정의 → 이름 붙은 함수
create or replace function public.myr_app_seller_orders(p_seller uuid, p_limit integer default 200)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', o.id, 'code', o.code, 'status', o.status, 'paid_at', o.paid_at,
             'buyer', public.myr_mask_name(o.buyer_name),
             -- 내 줄의 배송 상태 · 금액 — 화면이 줄을 다시 훑어 계산하지 않는다
             'ship_status', public.myr_order_ship_status(o.id, p_seller),
             -- 0116: 내 줄의 열린 요청 상태 · 주문 상태(칩) · 탭 — 화면이 줄을 훑어 순위를 다시 정하지 않는다(우선순위 요청 → 환불 → 배송)
             'claim_status', public.myr_order_claim_status(o.id, p_seller),
             'state', st.v, 'tab', public.myr_seller_order_tab(st.v),
             'amounts', (select jsonb_build_object('paid', coalesce(sum(i.amount), 0), 'refunded', coalesce(sum(i.refund_amount), 0),
                                                  'net', coalesce(sum(public.myr_line_net(i)), 0))
                           from public.myr_order_items i where i.order_id = o.id and i.seller_id = p_seller),
             'items', (select jsonb_agg(jsonb_build_object(
                         'id', i.id, 'name', i.product_name, 'option', i.option_name, 'qty', i.qty, 'unit_price', i.unit_price, 'amount', i.amount,
                         'status', i.status, 'refunded_qty', i.refunded_qty, 'refund_amount', i.refund_amount, 'has_refund', public.myr_line_has_refund(i),
                         'left_qty', public.myr_line_left(i), 'live', public.myr_line_live(i), 'valid', public.myr_line_valid(i),
                         'ship_status', i.ship_status, 'courier', i.courier, 'tracking_no', i.tracking_no, 'shipped_at', i.shipped_at, 'delivered_at', i.delivered_at,
                         'groupbuy', i.groupbuy_id is not null,
                         'product', (select jsonb_build_object('code', p.code, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = i.product_id),
                         'claim', public.myr_line_open_claim(i))
                       order by i.created_at, i.id)
                       from public.myr_order_items i where i.order_id = o.id and i.seller_id = p_seller))
           order by o.paid_at desc, o.code desc)
      from (select o.* from public.myr_orders o
             where public.myr_order_status_paid(o.status)
               and exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.seller_id = p_seller)
             order by o.paid_at desc, o.code desc
             limit least(greatest(coalesce(p_limit, 200), 1), 500)) o
      cross join lateral (select public.myr_seller_order_state(public.myr_order_claim_status(o.id, p_seller),
                                                               exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.seller_id = p_seller and public.myr_line_has_refund(i)),
                                                               public.myr_order_ship_status(o.id, p_seller)) as v) st
  ), '[]'::jsonb)
$$;
revoke all on function public.myr_app_seller_orders(uuid, integer) from public, anon, authenticated;
grant execute on function public.myr_app_seller_orders(uuid, integer) to service_role;
