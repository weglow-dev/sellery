-- ============================================================
-- 0118 · MYR 메일 · 발주 · 배송 완료 판정을 서버에서 — 크리에이터 환불 금액 · 오전 11시 출고 마감 · 발송 10일 뒤 자동 배송 완료 (2026-11-17)
--
--   점검(백엔드 원칙 1 · 메일 · 운영):
--     크리에이터 환불 메일 "내 상품 환불 금액"   메일(TS)이 환불한 줄 금액을 더했다 → 환불 확인(precheck)이 크리에이터별 합(seller_goods)을 준다
--       금액은 그대로(줄 금액 합 = 크리에이터 실적에서 빠지는 금액 · 왕복 배송비 차감 전 · 2026-11-17 결정)
--     오전 11시 출고 마감       이벗 발주 크론(TS prepareCutoff)이 계산해 넘겼다 → myr_prepare_cutoff(시각) · 발주 후보가 시각을 받지 않으면 서버가 정한다
--     발송 10일 뒤 자동 배송 완료  송장 동기화 크론(TS DELIVERED_AFTER_DAYS)이 판정해 넘겼다 → myr_line_auto_delivered(줄, 시각) · ship_line 이 택배사 완료 또는 이 함수로 정한다
--       배송 완료 시각은 정산 대상(배송 완료분)과 단순 변심 기한을 정한다
--   그대로 둔 것: 운영 수동 발주(/api/ops/prepare before)는 운영자가 고른 시각이라 그대로 넘긴다
--   계산 결과 불변 — 11시 · 10일 · 줄 금액 합은 지금 TS 식 그대로 · ship_line 응답에 delivered 칸만 더한다
--   테스트: supabase/tests/myr_mail_fulfillment_server.test.sql · 기존 환불 · 발주 · 송장 · 배송 테스트
-- ============================================================

-- 크리에이터별 환불 상품 금액 { seller_id: 줄 금액 합 } — precheck 줄(item_id · amount · seller_id)에서
create or replace function public.myr_refund_seller_goods(p_items jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(x.seller_id, x.goods), '{}'::jsonb)
    from (select e ->> 'seller_id' as seller_id, sum((e ->> 'amount')::int)::int as goods
            from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
           where e ->> 'seller_id' is not null
           group by 1) x
$$;
revoke all on function public.myr_refund_seller_goods(jsonb) from public, anon, authenticated;

-- 출고 마감 — 그날(KST) 오전 11시 전 결제분까지 발주(바인허브와 같다)
create or replace function public.myr_prepare_cutoff(p_now timestamptz)
returns timestamptz
language sql
immutable
as $$
  select (public.myr_kst_date(p_now)::timestamp + interval '11 hours') at time zone 'Asia/Seoul'
$$;
revoke all on function public.myr_prepare_cutoff(timestamptz) from public, anon, authenticated;

-- 자동 배송 완료 — 배송 중이고 발송 10일이 지남(택배사가 완료를 알려 주지 않아도 · 바인허브와 같다)
create or replace function public.myr_line_auto_delivered(i public.myr_order_items, p_now timestamptz)
returns boolean
language sql
immutable
as $$
  select coalesce(i.ship_status = 'SHIPPING' and i.shipped_at <= p_now - interval '10 days', false)
$$;
revoke all on function public.myr_line_auto_delivered(public.myr_order_items, timestamptz) from public, anon, authenticated;

-- 0108 정의 + seller_goods
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
  v_deposit := o.status = 'WAITING_DEPOSIT';
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

-- 0112 정의 → 시각을 받지 않으면 출고 마감 myr_prepare_cutoff(now())
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
   where i.ship_status = 'PAID' and public.myr_line_ship_work(o, i) and o.paid_at < coalesce(p_cutoff, public.myr_prepare_cutoff(now()))
$$;
revoke all on function public.myr_app_admin_prepare_candidates(timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_admin_prepare_candidates(timestamptz) to service_role;

-- 0112 정의 → 배송 완료 = 택배사 완료 또는 myr_line_auto_delivered · 응답 delivered
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
  v_tracking text := regexp_replace(coalesce(p_tracking_no, ''), '[\s-]', '', 'g');
  v_new      boolean;
  v_delivered boolean;
begin
  if v_courier is not null and v_courier not in ('CJ대한통운','우체국택배','한진택배','롯데택배','로젠택배') then return jsonb_build_object('ok', false, 'code', 'BAD_COURIER'); end if;
  if v_tracking !~ '^\d{8,30}$' then return jsonb_build_object('ok', false, 'code', 'BAD_TRACKING'); end if;
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
     set ship_status = case when v_delivered or ship_status = 'DELIVERED' then 'DELIVERED' else 'SHIPPING' end,
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
