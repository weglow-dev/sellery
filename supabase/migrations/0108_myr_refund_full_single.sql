-- ============================================================
-- 0108 · MYR 주문 · 줄 환불 상태와 "주문 전체 환불"을 남은 수량 하나로 (2026-11-13)
--
--   점검(백엔드 원칙 1): "주문 전체 환불" 판정이 두 방식이었다.
--     precheck — 수량 기준: 이번 환불 수량 ≥ 주문에 남은 수량 합 → 배송비를 같이 돌려줄지 · 토스 전액 취소(full)
--     record   — 상태 기준: 모든 줄이 REFUNDED · CANCELED → 주문 상태 REFUNDED
--     줄 상태도 record 안의 이름 없는 식(환불 뒤 남은 수량이 0이면 REFUNDED)이었다.
--   지금 데이터에서는 결과가 같다(남은 수량 0 ⇔ 줄 REFUNDED · CANCELED 는 살아 있는 줄이 아니다). 기준을 하나로 맞춰 둔다 —
--   다른 경로가 줄 상태와 수량을 따로 바꾸면 배송비 환불 여부와 주문 상태가 다르게 정해진다.
--   고침:
--     myr_order_left_qty(o)            주문에 남은 수량 = 살아 있는 줄(myr_line_live)의 남은 수량(myr_line_left) 합
--     myr_order_refund_full(o, 수량)   이번 환불이 주문을 끝내는지 — 수량 ≥ 남은 수량(precheck full)
--     myr_order_refund_status(o)       주문 상태 — 남은 수량 0 이면 REFUNDED · 아니면 PARTIAL_REFUNDED(record · 줄을 기록한 뒤)
--     myr_line_refund_status(i, 수량)  줄 상태 — 이번 환불 뒤 남은 수량(myr_line_left − 수량)이 0 이하면 REFUNDED · 아니면 PARTIAL_REFUNDED
--   그대로 둔 것: 동시 환불 틈(precheck 는 토스 전 · record 는 토스 뒤 — 그 사이 다른 줄 환불이 끼면 배송비가 빠진 채 REFUNDED) —
--     record 가 precheck 로 다시 계산해 금액이 다르면 운영 할 일 목록에 띄운다(0105 mismatch).
--   계산 결과 불변 — 같은 판정을 수량 기준 함수로 옮겼다(supabase/tests/myr_refund_full.test.sql · 기존 환불 테스트).
-- ============================================================

create or replace function public.myr_order_left_qty(o public.myr_orders)
returns integer
language sql
stable
as $$
  select coalesce(sum(public.myr_line_left(i)), 0)::int from public.myr_order_items i where i.order_id = o.id and public.myr_line_live(i)
$$;
revoke all on function public.myr_order_left_qty(public.myr_orders) from public, anon, authenticated;

create or replace function public.myr_order_refund_full(o public.myr_orders, p_qty integer)
returns boolean
language sql
stable
as $$
  select coalesce(p_qty, 0) >= public.myr_order_left_qty(o)
$$;
revoke all on function public.myr_order_refund_full(public.myr_orders, integer) from public, anon, authenticated;

create or replace function public.myr_order_refund_status(o public.myr_orders)
returns text
language sql
stable
as $$
  select case when public.myr_order_left_qty(o) = 0 then 'REFUNDED' else 'PARTIAL_REFUNDED' end
$$;
revoke all on function public.myr_order_refund_status(public.myr_orders) from public, anon, authenticated;

create or replace function public.myr_line_refund_status(i public.myr_order_items, p_qty integer)
returns text
language sql
stable
as $$
  select case when public.myr_line_left(i) - coalesce(p_qty, 0) <= 0 then 'REFUNDED' else 'PARTIAL_REFUNDED' end
$$;
revoke all on function public.myr_line_refund_status(public.myr_order_items, integer) from public, anon, authenticated;

-- 0105 정의 + 주문이 끝나는지 → myr_order_refund_full
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
  if v_full and o.shipping_fee > 0 and o.refund_amount + v_amount + o.shipping_fee <= o.amount then v_amount := v_amount + o.shipping_fee; end if;

  -- 0105: 돌려줄 돈 — 입금 전 취소는 돈이 오가지 않아 0(차감도 없다) · 그 밖은 결제 금액 − 차감(myr_refund_after_deduction · 차감이 금액 이상이면 거절)
  v_deposit := o.status = 'WAITING_DEPOSIT';
  v_deduction := case when v_deposit then 0 else coalesce(p_deduction, 0) end;
  v_refund := case when v_deposit then 0 else public.myr_refund_after_deduction(v_amount, v_deduction) end;
  if v_refund is null then return jsonb_build_object('ok', false, 'code', 'DEDUCTION_TOO_BIG', 'amount', v_amount, 'deduction', v_deduction); end if;

  return jsonb_build_object('ok', true, 'order_code', o.code, 'order_status', o.status, 'payment_key', o.payment_key,
                            'amount', v_amount, 'goods', v_goods, 'shipping_back', v_amount - v_goods, 'deposit', v_deposit, 'full', v_full, 'items', v_items,
                            'deduction', v_deduction, 'refund_amount', v_refund, 'cancel_full', public.myr_refund_cancel_full(v_full, v_deduction));
end;
$$;
revoke all on function public.myr_app_refund_precheck(uuid, jsonb, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.myr_app_refund_precheck(uuid, jsonb, text, uuid, integer) to service_role;

-- 0105 정의 + 줄 상태 → myr_line_refund_status · 주문 상태 → myr_order_refund_status
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

  if o.status = 'WAITING_DEPOSIT' then
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
