-- ============================================================
-- 0105 · MYR 교환·환불 요청 — 처리 방법별 차감액 · 부분 환불 가능 여부를 서버 한 곳에서 (2026-11-13)
--
--   문제: 콘솔 요청 상세의 처리 방법별 예상 금액(claims.server.ts claimQuotes)이 "refund → 차감 0 · partial → 왕복 배송비"를 TS 에 따로 적었다.
--     실제 승인(myr_app_claim_decide)은 myr_claim_resolution_deducts 로 정한다 — 한쪽만 바꾸면 화면 예상 금액과 실제 환불이 달라진다.
--     승인 안의 "부분 환불 불가(줄 금액 ≤ 차감액)"와 "환불이 필요한 처리(refund · partial)"도 이름 없는 식이었다.
--   고침:
--     myr_claim_resolution_refunds(resolution)       환불이 나가는 처리 방법(refund · partial)
--     myr_claim_option_deduction(request, resolution) 이 요청을 이 처리로 승인하면 뺄 왕복 배송비(차감 처리면 myr_refund_request_fee_due · 아니면 0)
--     myr_claim_option_blocked(request, resolution)   차감 뒤 0원 이하라 고를 수 없는 처리
--     요청 JSON(myr_refund_request_json)에 option_deductions — 환불이 나가는 처리마다 차감액 · 고를 수 없으면 null(재발송은 키 없음)
--     승인(myr_app_claim_decide)은 위 세 함수를 부른다 · 콘솔은 option_deductions 를 읽기만 한다
--   환불 금액(같은 PR · 2차):
--     myr_deduction_fits(금액, 차감)           차감할 수 있나(없거나 금액보다 작다) — 승인(option_blocked · 줄 금액)과 환불(after_deduction · 결제 금액)이 같은 비교
--     myr_refund_after_deduction(결제, 차감)     돌려줄 돈(차감할 수 없으면 null) · myr_claim_refund_paid(request) 는 그 거꾸로(환불액 + 차감)
--     myr_refund_cancel_full(full, 차감)         토스 전액 취소 여부(다 끝나고 차감 없음)
--     myr_app_refund_precheck(…, p_deduction)   차감 뒤 금액(refund_amount) · deduction · cancel_full 까지 — 입금 전 취소 0원 · 음수 BAD_DEDUCTION · 차감이 금액 이상 DEDUCTION_TOO_BIG
--     myr_app_refund_record(…, p_deduction)     받은 금액을 같은 precheck 로 다시 계산해 mismatch 로 알린다(돈은 이미 나갔으니 거절하지 않는다)
--     TS 의 deductedAmount · deposit 0원 · cancelAmount 선택은 지우고 precheck 값을 읽는다
--   계산 결과 불변 — 차감액 · 거절 조건 · needs_refund · 환불 금액은 0099 · TS 와 같은 식을 함수로 옮겼을 뿐이다.
--   테스트: supabase/tests/myr_refund_requests.test.sql · myr_single_source.test.sql
-- ============================================================

create or replace function public.myr_claim_resolution_refunds(p_resolution text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_resolution in ('refund', 'partial'), false)
$$;
revoke all on function public.myr_claim_resolution_refunds(text) from public, anon, authenticated;

create or replace function public.myr_claim_option_deduction(r public.myr_refund_requests, p_resolution text)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select case when public.myr_claim_resolution_deducts(p_resolution) then public.myr_refund_request_fee_due(r) else 0 end
$$;
revoke all on function public.myr_claim_option_deduction(public.myr_refund_requests, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 환불 금액 — 차감 뒤 금액 · 토스 전액 취소 여부를 precheck 한 곳에서(TS deductedAmount · deposit 0원 · cancelAmount 선택을 옮겼다)
-- ------------------------------------------------------------
-- 차감할 수 있나 — 차감이 없거나 금액보다 작을 때만. 승인(myr_claim_option_blocked · 줄 금액)과 환불(myr_refund_after_deduction · 결제 금액)이 같은 비교를 쓴다
create or replace function public.myr_deduction_fits(p_amount bigint, p_deduction integer)
returns boolean
language sql
immutable
as $$
  select coalesce(p_deduction, 0) = 0 or p_deduction < p_amount
$$;
revoke all on function public.myr_deduction_fits(bigint, integer) from public, anon, authenticated;

-- 돌려줄 돈 = 결제 금액(상품 + 함께 돌려주는 처음 배송비) − 차감 · 차감할 수 없으면 null
create or replace function public.myr_refund_after_deduction(p_paid integer, p_deduction integer)
returns integer
language sql
immutable
as $$
  select case when public.myr_deduction_fits(p_paid, p_deduction) then p_paid - coalesce(p_deduction, 0) end
$$;
revoke all on function public.myr_refund_after_deduction(integer, integer) from public, anon, authenticated;

-- 토스 전액 취소(cancelAmount 없이) — 이번 환불로 주문이 다 끝나고 차감이 없을 때만 · 차감이 있으면 남은 돈을 남기는 부분 취소
create or replace function public.myr_refund_cancel_full(p_full boolean, p_deduction integer)
returns boolean
language sql
immutable
as $$
  select coalesce(p_full, false) and coalesce(p_deduction, 0) = 0
$$;
revoke all on function public.myr_refund_cancel_full(boolean, integer) from public, anon, authenticated;

-- 기록 금액 비교 — 받은 금액(토스에 보낸 금액)과 다시 계산한 금액. 같으면 mismatch false · 다르면(다시 계산 실패 null 포함) 두 금액을 싣는다
create or replace function public.myr_refund_mismatch_json(p_amount integer, p_expected integer)
returns jsonb
language sql
immutable
as $$
  select case when p_expected is not distinct from coalesce(p_amount, 0) then jsonb_build_object('mismatch', false)
              else jsonb_build_object('mismatch', true, 'expected', p_expected, 'got', p_amount) end
$$;
revoke all on function public.myr_refund_mismatch_json(integer, integer) from public, anon, authenticated;

-- 0099 정의 + p_deduction · 응답에 deduction · refund_amount · cancel_full(입금 전 취소 0원 · 음수 차감 BAD_DEDUCTION · 차감이 금액 이상 DEDUCTION_TOO_BIG)
--   인자가 늘면 다른 함수다 — 옛 4인자 버전을 지우고 권한을 다시 건다
drop function if exists public.myr_app_refund_precheck(uuid, jsonb, text, uuid);
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
  v_left_total integer;
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
  select coalesce(sum(public.myr_line_left(i)), 0) into v_left_total from public.myr_order_items i where i.order_id = o.id and public.myr_line_live(i);
  v_full := v_req_total >= v_left_total;
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

-- 0099 정의 + p_deduction · 받은 금액을 precheck 로 다시 계산해 mismatch(거절하지 않는다) — 옛 7인자 버전을 지우고 권한을 다시 건다
drop function if exists public.myr_app_refund_record(uuid, jsonb, text, uuid, text, integer, jsonb);
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
    update public.myr_order_items
       set refunded_qty = refunded_qty + r.qty,
           refund_amount = refund_amount + public.myr_line_amount(r.unit_price, r.qty),
           status = case when refunded_qty + r.qty >= qty then 'REFUNDED' else 'PARTIAL_REFUNDED' end,
           refunded_at = now(),
           -- 0067: 줄에는 "사유 — 상세"(상세가 있을 때만) · 0068: 사진 경로
           refund_reason = case when r.note is not null then left(v_reason || ' — ' || r.note, 500) else v_reason end,
           refund_photos = coalesce(r.photos, '{}'::text[]),
           refund_actor = p_actor
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
  return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'status', v_status, 'amount', o.refund_amount + greatest(coalesce(p_amount, 0), 0))
         || public.myr_refund_mismatch_json(p_amount, v_expected);
end;
$$;
revoke all on function public.myr_app_refund_record(uuid, jsonb, text, uuid, text, integer, jsonb, integer) from public, anon, authenticated;
grant execute on function public.myr_app_refund_record(uuid, jsonb, text, uuid, text, integer, jsonb, integer) to service_role;

-- 차감 뒤 0원 이하가 되면 부분 환불은 안 된다(같은 묶음에서 이미 뺐으면 차감 0 → 전액과 같아 고를 수 있다)
create or replace function public.myr_claim_option_blocked(r public.myr_refund_requests, p_resolution text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.myr_claim_resolution_deducts(p_resolution)
     and not public.myr_deduction_fits(public.myr_line_amount(i.unit_price, r.qty), public.myr_claim_option_deduction(r, p_resolution))
    from public.myr_order_items i where i.id = r.order_item_id
$$;
revoke all on function public.myr_claim_option_blocked(public.myr_refund_requests, text) from public, anon, authenticated;

-- 환불이 끝난 요청의 결제 기준 금액 — 환불액 + 차감(myr_refund_after_deduction 의 거꾸로 · 환불 전이면 null). 요청 응답 refund_paid · shipping_back
create or replace function public.myr_claim_refund_paid(r public.myr_refund_requests)
returns integer
language sql
immutable
as $$
  select r.refund_amount + r.deduction
$$;
revoke all on function public.myr_claim_refund_paid(public.myr_refund_requests) from public, anon, authenticated;

-- 0100 정의 + option_deductions · refund_paid 를 myr_claim_refund_paid 로
create or replace function public.myr_refund_request_json(r public.myr_refund_requests)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id, 'code', r.code, 'status', r.status, 'open', public.myr_claim_status_open(r.status), 'step', public.myr_refund_request_step(r),
    'kind', r.kind, 'reason', r.reason, 'qty', r.qty, 'note', r.note, 'photos', to_jsonb(r.photos),
    'options', to_jsonb(public.myr_refund_request_options(r.kind, r.reason)),
    -- 처리 방법마다 회수가 필요한가(승인과 같은 함수) — 콘솔 처리 방법 안내가 사유로 다시 판정하지 않는다
    'option_collects', coalesce((select jsonb_object_agg(x, public.myr_claim_resolution_collects(x, r.reason)) from unnest(public.myr_refund_request_options(r.kind, r.reason)) x), '{}'::jsonb),
    -- 0105: 환불이 나가는 처리마다 뺄 왕복 배송비(승인과 같은 함수) · 차감 뒤 0원 이하라 고를 수 없으면 null — 콘솔 예상 금액 · 선택지가 처리 방법으로 다시 판정하지 않는다
    'option_deductions', coalesce((select jsonb_object_agg(x, case when public.myr_claim_option_blocked(r, x) then null else public.myr_claim_option_deduction(r, x) end)
                                     from unnest(public.myr_refund_request_options(r.kind, r.reason)) x where public.myr_claim_resolution_refunds(x)), '{}'::jsonb),
    'resolution', r.resolution, 'message', r.message, 'decided_at', r.decided_at,
    'needs_collect', r.needs_collect, 'collected_at', r.collected_at,
    'needs_reship', r.needs_reship, 'reship_courier', r.reship_courier, 'reship_tracking_no', r.reship_tracking_no, 'reshipped_at', r.reshipped_at,
    'needs_refund', r.needs_refund, 'deduction', r.deduction, 'return_fee', public.myr_refund_request_fee_due(r),
    'refund_amount', r.refund_amount, 'refunded_at', r.refunded_at, 'done_at', r.done_at, 'created_at', r.created_at,
    'amount', public.myr_line_amount(i.unit_price, r.qty),
    -- 환불이 끝난 요청을 결제 기준으로 — 결제 금액(상품 + 함께 돌려준 처음 배송비) = 환불액 + 차감 · 환불 전이면 refund_paid null · shipping_back 0
    'refund_paid', public.myr_claim_refund_paid(r),
    'shipping_back', greatest(public.myr_claim_refund_paid(r) - public.myr_line_amount(i.unit_price, r.qty), 0),
    'buyer_name', o.buyer_name,
    'buyer_phone', case when length(regexp_replace(coalesce(o.buyer_phone, o.shipping ->> 'phone', ''), '\D', '', 'g')) >= 10
                        then left(regexp_replace(coalesce(o.buyer_phone, o.shipping ->> 'phone'), '\D', '', 'g'), 3) || '-****-' || right(regexp_replace(coalesce(o.buyer_phone, o.shipping ->> 'phone'), '\D', '', 'g'), 4)
                        else null end,
    'order', jsonb_build_object('id', o.id, 'code', o.code, 'status', o.status, 'paid_at', o.paid_at, 'is_member', o.user_id is not null,
                                'shipping_fee', o.shipping_fee,
                                'item', jsonb_build_object('id', i.id, 'name', i.product_name, 'option', i.option_name, 'qty', i.qty, 'unit_price', i.unit_price, 'amount', i.amount,
                                                           'refunded_qty', i.refunded_qty, 'status', i.status, 'ship_status', i.ship_status,
                                                           'courier', i.courier, 'tracking_no', i.tracking_no,
                                                           'shipped_at', i.shipped_at, 'delivered_at', i.delivered_at),
                                -- 같은 주문에서 같은 크리에이터의 다른 줄(요청이 걸리지 않은 상품 포함) — 콘솔 "주문 · 배송" 칸의 "함께 주문한 상품".
                                --   다른 크리에이터 줄은 싣지 않는다(콘솔 주문 탭과 같은 범위) · 남은 수량 · 살아 있는 줄 · 열린 요청은 기존 판정 함수 값
                                'others', coalesce((select jsonb_agg(jsonb_build_object(
                                                     'id', x.id, 'name', x.product_name, 'option', x.option_name, 'qty', x.qty, 'amount', x.amount,
                                                     'refunded_qty', x.refunded_qty, 'has_refund', public.myr_line_has_refund(x), 'status', x.status, 'ship_status', x.ship_status,
                                                     'left_qty', public.myr_line_left(x), 'live', public.myr_line_live(x), 'delivered_at', x.delivered_at,
                                                     'claim', public.myr_line_open_claim(x))
                                                   order by x.created_at, x.id)
                                                     from public.myr_order_items x
                                                    where x.order_id = o.id and x.seller_id = r.seller_id and x.id <> r.order_item_id), '[]'::jsonb)),
    'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = r.product_id),
    'seller', (select jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle) from public.sellers s where s.id = r.seller_id))
    from public.myr_orders o
    join public.myr_order_items i on i.id = r.order_item_id
   where o.id = r.order_id
$$;
revoke all on function public.myr_refund_request_json(public.myr_refund_requests) from public, anon, authenticated;
grant execute on function public.myr_refund_request_json(public.myr_refund_requests) to service_role;

-- 0099 정의 + myr_claim_option_blocked · myr_claim_option_deduction · myr_claim_resolution_refunds
create or replace function public.myr_app_claim_decide(p_code text, p_user uuid, p_decision text, p_resolution text, p_message text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  r      public.myr_refund_requests%rowtype;
  v_msg  text := nullif(btrim(coalesce(p_message, '')), '');
begin
  select r2.* into r from public.myr_refund_requests r2 join public.sellers s on s.id = r2.seller_id
   where s.user_id = p_user and r2.code = lower(btrim(coalesce(p_code, ''))) for update of r2;
  if not found or p_user is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'code', 'NOT_PENDING', 'status', r.status); end if;
  -- 같은 묶음의 다른 요청을 동시에 승인해도 배송비가 두 번 빠지지 않게 묶음을 잠근다
  perform 1 from public.myr_refund_requests q where q.batch = r.batch for update;
  if p_decision is null or p_decision not in ('approve','reject') then return jsonb_build_object('ok', false, 'code', 'BAD_DECISION'); end if;
  -- 승인은 메시지 선택(비우면 null · 메일은 결과 · 다음 단계만) · 반려는 사유를 고객에게 알려야 하니 필수 · 둘 다 1000자까지
  if (p_decision = 'reject' and v_msg is null) or length(coalesce(v_msg, '')) > 1000 then return jsonb_build_object('ok', false, 'code', 'BAD_MESSAGE'); end if;

  if p_decision = 'reject' then
    update public.myr_refund_requests set status = 'rejected', message = v_msg, decided_at = now(), decided_by = p_user, done_at = now() where id = r.id
      returning * into r;
    return jsonb_build_object('ok', true, 'request', public.myr_refund_request_json(r), 'refund_now', false);
  end if;

  if p_resolution is null or not (p_resolution = any (public.myr_refund_request_options(r.kind, r.reason))) then
    return jsonb_build_object('ok', false, 'code', 'BAD_RESOLUTION');
  end if;
  -- 차감 뒤 0원 이하가 되면 부분 환불은 안 된다 — 콘솔 선택지(option_deductions null)와 같은 함수
  if public.myr_claim_option_blocked(r, p_resolution) then return jsonb_build_object('ok', false, 'code', 'BAD_RESOLUTION'); end if;

  update public.myr_refund_requests
     set status = 'progress', resolution = p_resolution, message = v_msg, decided_at = now(), decided_by = p_user,
         needs_refund  = public.myr_claim_resolution_refunds(p_resolution),
         needs_reship  = p_resolution in ('reship','reship_collect'),
         -- 파손 · 누액은 회수 없이(사진으로 확인) · 단순 변심 · 오배송 환불과 회수 후 재발송은 회수
         needs_collect = public.myr_claim_resolution_collects(p_resolution, r.reason),
         deduction     = public.myr_claim_option_deduction(r, p_resolution)
   where id = r.id
   returning * into r;
  return jsonb_build_object('ok', true, 'request', public.myr_refund_request_json(r), 'refund_now', public.myr_refund_request_step(r) = 'refund');
end;
$$;
revoke all on function public.myr_app_claim_decide(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_claim_decide(text, uuid, text, text, text) to service_role;
