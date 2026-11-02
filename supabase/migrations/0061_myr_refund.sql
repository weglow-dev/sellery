-- ============================================================
-- 0061 MYR 환불 — 줄 × 수량 단위 부분 환불 (docs/myr.md §6.3 · §3.1 규칙 3 · 2026-11-02)
--
-- 셀러리 0008 app_refund_precheck/record(주문 전액) 를 MYR 구조(주문 1건 · 줄 N개)로: 입력은 [{ item_id, qty }] — 줄 전체 = 남은 수량 · 주문 전체 = 모든 줄.
--   · precheck: 토스 취소 **전** 가드만(잠금·변경 없음). actor 별 허용 조건은 아래 표 한 곳. 환불 금액 = Σ(단가 × qty) + (이번 환불로 주문이 전부 환불되면 배송비).
--   · record: 토스가 취소를 **확정한 뒤** 기록. NOT_FOUND / 남은 수량 없음(already) 외 가드 없음 — 돈이 돌아갔으면 기록한다.
--     줄 refunded_qty·refund_amount 누적 → 줄 status(PARTIAL_REFUNDED | REFUNDED) · 주문 refund_amount 누적 → 주문 status 파생(전부 환불 REFUNDED · 일부 PARTIAL_REFUNDED).
--     sold_qty 는 0058 트리거가 (qty − refunded_qty) 로 재계산한다.
--   · WAITING_DEPOSIT(가상계좌 입금 전) 은 토스 호출 없이 "취소" — precheck 가 deposit:true 를 돌려주고 record 는 주문·줄을 CANCELED 로(0058 deposit_expire 와 같은 결과 · actor 기록).
--
--   | 동작 | customer | seller | admin |
--   |---|---|---|---|
--   | 환불 | 본인 주문(user_id = actor · 비회원은 customer_id = actor)의 줄 · PAID/PARTIAL_REFUNDED · **발송 전**(tracking_no null) · WAITING_DEPOSIT 취소 | seller_id = actor 인 줄만 · 발송 뒤도 허용 | 전부 |
--
-- 반환 { ok, code } — 실패 code: BAD_ACTOR · NOT_FOUND · FORBIDDEN · SHIPPED · WRONG_STATUS(status) · BAD_ITEMS(items[{item_id, reason, left}]) · NOTHING_LEFT
-- 권한: service role 만. 테스트: supabase/tests/myr_refund.test.sql. 실행: 0060 이후. 재실행 가능.
-- ============================================================

-- 입력 정규화(내부): [{item_id, qty}] → 같은 item 합치기 · 형식 검사. 빈 배열이면 주문의 모든 줄 남은 수량.
create or replace function public.myr_refund_lines(o public.myr_orders, p_items jsonb)
returns table (item_id uuid, qty integer, unit_price integer, seller_id uuid, remaining integer, item_status text, problem text)
language plpgsql
stable
security definer set search_path = public
as $$
declare
  l jsonb;
  v_id uuid;
  v_qty integer;
  v_req jsonb := '{}'::jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    -- 전체: 남은 수량이 있는 줄 전부
    return query
      select i.id, (i.qty - i.refunded_qty), i.unit_price, i.seller_id, (i.qty - i.refunded_qty), i.status, null::text
        from public.myr_order_items i where i.order_id = o.id and i.status not in ('CANCELED') and (i.qty - i.refunded_qty) > 0;
    return;
  end if;
  for l in select * from jsonb_array_elements(p_items) loop
    if (l ->> 'item_id') !~ '^[0-9a-f-]{36}$' or (l ->> 'qty') !~ '^\d{1,3}$' then
      return query select null::uuid, 0, 0, null::uuid, 0, null::text, 'BAD_FORMAT'::text;
      return;
    end if;
    v_id := (l ->> 'item_id')::uuid;
    v_qty := (l ->> 'qty')::int + coalesce((v_req ->> v_id::text)::int, 0);
    v_req := v_req || jsonb_build_object(v_id::text, v_qty);
  end loop;
  return query
    select k.id, k.q, i.unit_price, i.seller_id, coalesce(i.qty - i.refunded_qty, 0), i.status,
           case when i.id is null then 'NOT_IN_ORDER'
                when i.status = 'CANCELED' then 'CANCELED'
                when k.q < 1 then 'BAD_QTY'
                when k.q > (i.qty - i.refunded_qty) then 'TOO_MANY'
                else null end
      from (select (key)::uuid as id, (value)::int as q from jsonb_each_text(v_req)) k
      left join public.myr_order_items i on i.id = k.id and i.order_id = o.id;
end;
$$;
revoke all on function public.myr_refund_lines(public.myr_orders, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------
-- myr_app_refund_precheck(order, items, actor, actor_id) — 가드 + 금액 계산 (잠금·변경 없음)
--   { ok:true, order_code, order_status, payment_key, amount, deposit, full, items:[{item_id, qty, amount, seller_id}] }
-- ------------------------------------------------------------
create or replace function public.myr_app_refund_precheck(p_order_id uuid, p_items jsonb, p_actor text, p_actor_id uuid)
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
  v_left_total integer;
  v_full     boolean;
begin
  if p_actor is null or p_actor not in ('customer','seller','admin','system') then return jsonb_build_object('ok', false, 'code', 'BAD_ACTOR'); end if;
  select * into o from public.myr_orders where id = p_order_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;

  -- 소유·권한 (존재 여부를 흘리지 않게 customer 의 남의 주문은 NOT_FOUND)
  if p_actor = 'customer' then
    if p_actor_id is null or not (o.user_id = p_actor_id or (o.user_id is null and o.customer_id = p_actor_id)) then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;
  end if;

  if o.status in ('REFUNDED','CANCELED') then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if o.status not in ('PAID','PARTIAL_REFUNDED','WAITING_DEPOSIT') then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if p_actor = 'customer' and o.tracking_no is not null then return jsonb_build_object('ok', false, 'code', 'SHIPPED'); end if;

  for r in select * from public.myr_refund_lines(o, p_items) loop
    if r.problem = 'BAD_FORMAT' then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS'); end if;
    if r.problem is not null then
      v_problems := v_problems || jsonb_build_object('item_id', r.item_id, 'reason', r.problem, 'left', r.remaining);
      continue;
    end if;
    if p_actor = 'seller' and (p_actor_id is null or r.seller_id is distinct from p_actor_id) then
      return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
    end if;
    v_items := v_items || jsonb_build_object('item_id', r.item_id, 'qty', r.qty, 'amount', r.unit_price * r.qty, 'seller_id', r.seller_id);
    v_amount := v_amount + r.unit_price * r.qty;
    v_req_total := v_req_total + r.qty;
  end loop;
  if jsonb_array_length(v_problems) > 0 then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS', 'items', v_problems); end if;
  if v_req_total = 0 then return jsonb_build_object('ok', false, 'code', 'NOTHING_LEFT'); end if;

  -- 이번 환불로 주문이 전부 환불되면 배송비도 돌려준다(§9-11 기본) — 배송비는 아직 환불 안 됐을 때 한 번만
  select coalesce(sum(i.qty - i.refunded_qty), 0) into v_left_total from public.myr_order_items i where i.order_id = o.id and i.status <> 'CANCELED';
  v_full := v_req_total >= v_left_total;
  if v_full and o.shipping_fee > 0 and o.refund_amount + v_amount + o.shipping_fee <= o.amount then v_amount := v_amount + o.shipping_fee; end if;

  return jsonb_build_object('ok', true, 'order_code', o.code, 'order_status', o.status, 'payment_key', o.payment_key,
                            'amount', v_amount, 'deposit', o.status = 'WAITING_DEPOSIT', 'full', v_full, 'items', v_items);
end;
$$;
revoke all on function public.myr_app_refund_precheck(uuid, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_refund_precheck(uuid, jsonb, text, uuid) to service_role;

-- ------------------------------------------------------------
-- myr_app_refund_record(order, items, actor, actor_id, reason, amount, raw) — 토스 취소 확정 뒤 기록 (한 트랜잭션)
--   { ok:true, already, order_code, status, amount } · { ok:false, code: BAD_ACTOR | NOT_FOUND | BAD_ITEMS }
--   WAITING_DEPOSIT(deposit 취소): 줄·주문 CANCELED · refund_amount 는 0(돈이 안 들어왔다)
-- ------------------------------------------------------------
create or replace function public.myr_app_refund_record(p_order_id uuid, p_items jsonb, p_actor text, p_actor_id uuid, p_reason text, p_amount integer, p_raw jsonb default null)
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
begin
  if p_actor is null or p_actor not in ('customer','seller','admin','system') then return jsonb_build_object('ok', false, 'code', 'BAD_ACTOR'); end if;
  select * into o from public.myr_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if o.status in ('REFUNDED','CANCELED') then return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'status', o.status, 'amount', o.refund_amount); end if;

  if o.status = 'WAITING_DEPOSIT' then
    update public.myr_order_items set status = 'CANCELED', refunded_at = now(), refund_reason = v_reason, refund_actor = p_actor where order_id = o.id;
    update public.myr_orders set status = 'CANCELED', refunded_at = now(), refund_reason = v_reason, refund_actor = p_actor, raw_cancel = p_raw where id = o.id;
    return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'status', 'CANCELED', 'amount', 0);
  end if;

  for r in select * from public.myr_refund_lines(o, p_items) loop
    if r.problem is not null then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS', 'items', jsonb_build_array(jsonb_build_object('item_id', r.item_id, 'reason', r.problem, 'left', r.remaining))); end if;
    update public.myr_order_items
       set refunded_qty = refunded_qty + r.qty,
           refund_amount = refund_amount + r.unit_price * r.qty,
           status = case when refunded_qty + r.qty >= qty then 'REFUNDED' else 'PARTIAL_REFUNDED' end,
           refunded_at = now(), refund_reason = v_reason, refund_actor = p_actor
     where id = r.item_id;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'status', o.status, 'amount', o.refund_amount); end if;

  select case when bool_and(i.status in ('REFUNDED','CANCELED')) then 'REFUNDED' else 'PARTIAL_REFUNDED' end into v_status
    from public.myr_order_items i where i.order_id = o.id;
  update public.myr_orders
     set refund_amount = refund_amount + greatest(coalesce(p_amount, 0), 0), status = v_status,
         refunded_at = now(), refund_reason = v_reason, refund_actor = p_actor, raw_cancel = coalesce(p_raw, raw_cancel)
   where id = o.id;
  -- myr_order_items_sync_sold_qty(0058) 가 줄 update 마다 sold_qty 를 (qty − refunded_qty) 로 재계산했다.
  return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'status', v_status, 'amount', o.refund_amount + greatest(coalesce(p_amount, 0), 0));
end;
$$;
revoke all on function public.myr_app_refund_record(uuid, jsonb, text, uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_refund_record(uuid, jsonb, text, uuid, text, integer, jsonb) to service_role;
