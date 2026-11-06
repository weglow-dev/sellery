-- ============================================================
-- 0077 — MYR 줄 단위 배송 상태 · 배송준비중 · 이벗 발주/송장 수집 준비(docs/myr.md §6.8 E1-b · E2 · E3 · 2026-11-06)
--
--   발송 · 송장의 단위를 주문에서 **주문 줄**로 옮긴다(이벗이 줄마다 송장을 준다 · 한 주문에 크리에이터 여럿 · 7번 교환·환불이 "발주 전/후" 로 갈린다).
--   이벗 연동은 바인허브(`weglow-biz/vyneherb` OrderStatusToPreparing · OrderStatusToDeliveringOrDelivered)와 같은 방식 — 키가 없으면 꺼져 있다(앱 쪽).
--
--   myr_products.ebut_goods_code          이벗 상품코드(E1-a 자리 · 운영 입력 · 공개 RPC 미포함) — 비면 상품 code 로 등록
--   myr_order_items + ship_status('PAID' 결제완료 | 'PREPARING' 배송준비중 | 'SHIPPING' 배송중 | 'DELIVERED' 배송완료)
--                   + courier · tracking_no · ebut_registered_at · shipped_at · delivered_at · is_delayed
--       기존 주문(운송장 있음)은 그 줄들을 배송중/배송완료로 옮겨 적는다. 주문의 courier · tracking_no · shipped_at · delivered_at 은 남겨 두고 같이 맞춘다(옛 화면 · 메일 호환).
--   myr_order_ship_status(order)   주문 배송 상태 = 살아 있는 줄(취소 아님 · 남은 수량 > 0)의 가장 덜 진행된 상태 · 없으면 null — 판정은 이 함수 하나(바인허브 deriveStatus 와 같은 생각)
--   myr_order_item_json  + ship_status · courier · tracking_no · shipped_at · delivered_at
--   myr_order_json       + ship_status(위 함수)
--   myr_cs_conversation_json 의 order.item + 같은 배송 칸(콘솔 문의 상세 "주문 · 배송")
--
--   myr_app_refund_precheck   고객 셀프 환불 = **발주(배송준비중) 전 줄만**(줄 ship_status = 'PAID') — 주문 운송장 기준에서 바뀜. 셀러 · 관리자는 그대로.
--   myr_app_admin_ship(code, courier, tracking)   0069 와 같은 이름 · 인자 · 반환 — 주문의 남은 줄 전부에 같은 송장(한 박스) + 주문 칸도 같이
--   myr_app_admin_ship_pending(limit, shipped)    발송 대기 = 결제완료 · 배송준비중 줄이 남은 주문 · + ship_status · preparing(배송준비중 줄 수)
--   myr_app_admin_prepare_candidates(cutoff)      발주 대상 줄 = 결제완료 줄 · 주문 PAID/PARTIAL_REFUNDED · 결제 시각 < cutoff(바인허브 "11시 전 첫 결제") — 이벗 등록 본문에 필요한 칸
--   myr_app_admin_mark_prepared(item_ids, ebut)   결제완료 → 배송준비중(이벗 등록에 성공한 줄만 · 운영 수동 전환은 ebut=false)
--   myr_app_admin_ship_line(item, courier, tracking, delivered)   줄 하나에 송장 · 배송완료(이벗 송장 수집 · 정정) — 주문 칸이 비었으면 같이
--   myr_app_admin_ship_sync_candidates()          송장 수집 대상 = 이벗에 등록된 배송준비중 · 배송중 줄
--   myr_app_admin_mark_delayed()                  송장 수집 뒤에도 배송준비중인 줄 → is_delayed(바인허브와 같다)
--
--   권한: 새 RPC 는 service role 만(anon · authenticated EXECUTE 회수). 이벗 호출 · 크론은 샵 서버(결정 12 — 외부 호출 한 곳).
--   테스트: supabase/tests/myr_line_shipping.test.sql. 재실행 가능.
-- ============================================================

alter table public.myr_products add column if not exists ebut_goods_code text;
comment on column public.myr_products.ebut_goods_code is '이벗 상품코드(운영 입력 · 공개 RPC 미포함) — 비면 code 로 등록 (0077)';

alter table public.myr_order_items add column if not exists ship_status text not null default 'PAID';
alter table public.myr_order_items add column if not exists courier text;
alter table public.myr_order_items add column if not exists tracking_no text;
alter table public.myr_order_items add column if not exists ebut_registered_at timestamptz;
alter table public.myr_order_items add column if not exists shipped_at timestamptz;
alter table public.myr_order_items add column if not exists delivered_at timestamptz;
alter table public.myr_order_items add column if not exists is_delayed boolean not null default false;
alter table public.myr_order_items drop constraint if exists myr_order_items_ship_status_check;
alter table public.myr_order_items add constraint myr_order_items_ship_status_check check (ship_status in ('PAID', 'PREPARING', 'SHIPPING', 'DELIVERED'));
create index if not exists myr_order_items_ship_open_idx on public.myr_order_items (ship_status) where ship_status in ('PAID', 'PREPARING', 'SHIPPING');

-- 기존 주문 운송장 → 그 주문의 줄(아직 줄 운송장이 없는 것만 · 재실행 안전)
update public.myr_order_items i
   set ship_status = case when o.delivered_at is not null then 'DELIVERED' else 'SHIPPING' end,
       courier = o.courier, tracking_no = o.tracking_no, shipped_at = o.shipped_at, delivered_at = o.delivered_at
  from public.myr_orders o
 where o.id = i.order_id and o.tracking_no is not null and i.tracking_no is null;

-- ------------------------------------------------------------
-- 주문 배송 상태 — 살아 있는 줄의 가장 덜 진행된 상태
-- ------------------------------------------------------------
create or replace function public.myr_order_ship_status(p_order_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select case min(case i.ship_status when 'PAID' then 1 when 'PREPARING' then 2 when 'SHIPPING' then 3 else 4 end)
           when 1 then 'PAID' when 2 then 'PREPARING' when 3 then 'SHIPPING' when 4 then 'DELIVERED' end
    from public.myr_order_items i
   where i.order_id = p_order_id and i.status <> 'CANCELED' and i.qty - i.refunded_qty > 0
$$;
revoke all on function public.myr_order_ship_status(uuid) from public, anon, authenticated;

-- 0065 정의 + 배송 칸
create or replace function public.myr_order_item_json(i public.myr_order_items)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', i.id, 'product_code', p.code, 'name', i.product_name, 'option', i.option_name,
    'qty', i.qty, 'unit_price', i.unit_price, 'amount', i.amount, 'status', i.status, 'refunded_qty', i.refunded_qty,
    'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url, 'creator', s.name, 'creator_handle', s.handle,
    'ship_status', i.ship_status, 'courier', i.courier, 'tracking_no', i.tracking_no, 'shipped_at', i.shipped_at, 'delivered_at', i.delivered_at)
    from public.myr_products p
    left join public.sellers s on s.id = i.seller_id
   where p.id = i.product_id
$$;
revoke all on function public.myr_order_item_json(public.myr_order_items) from public, anon, authenticated;

-- 0066 정의 + ship_status
create or replace function public.myr_order_json(o public.myr_orders, p_full boolean)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id, 'code', o.code, 'status', o.status,
    'amount', o.amount, 'items_amount', o.items_amount, 'shipping_fee', o.shipping_fee, 'refund_amount', o.refund_amount,
    'order_name', o.order_name, 'payment_method', o.payment_method, 'paid_at', o.paid_at, 'created_at', o.created_at,
    'deposit_due_at', o.deposit_due_at,
    'deposit', case when o.status = 'WAITING_DEPOSIT' and jsonb_typeof(o.raw_payment -> 'virtualAccount') = 'object'
                 then jsonb_build_object('bank', o.raw_payment -> 'virtualAccount' ->> 'bankCode', 'account', o.raw_payment -> 'virtualAccount' ->> 'accountNumber',
                                         'holder', o.raw_payment -> 'virtualAccount' ->> 'customerName', 'due', o.raw_payment -> 'virtualAccount' ->> 'dueDate')
                 else null end,
    'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at, 'delivered_at', o.delivered_at,
    'ship_status', public.myr_order_ship_status(o.id),
    'guest', o.user_id is null, 'buyer_name', o.buyer_name,
    'shipping', case when p_full then o.shipping else null end,
    'buyer_email', case when p_full then o.buyer_email else null end,
    'refund_reason', case when p_full and o.refund_amount > 0 then o.refund_reason else null end,
    'refunded_at', case when p_full and o.refund_amount > 0 then o.refunded_at else null end,
    'items', coalesce((select jsonb_agg(public.myr_order_item_json(i) order by i.created_at, i.id) from public.myr_order_items i where i.order_id = o.id), '[]'::jsonb))
$$;
revoke all on function public.myr_order_json(public.myr_orders, boolean) from public, anon, authenticated;

-- 0075 정의 + order.item 배송 칸
create or replace function public.myr_cs_conversation_json(x public.myr_cs_conversations)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', x.id, 'code', x.code, 'status', x.status, 'type', x.type,
    'buyer_name', x.buyer_name, 'order_code', x.order_code, 'order_id', x.order_id,
    'order', (select jsonb_build_object('code', o.code, 'status', o.status, 'courier', o.courier, 'tracking_no', o.tracking_no,
                                        'shipped_at', o.shipped_at, 'delivered_at', o.delivered_at, 'paid_at', o.paid_at,
                                        'item', (select jsonb_build_object('id', i.id, 'name', i.product_name, 'option', i.option_name, 'qty', i.qty,
                                                                           'amount', i.amount, 'status', i.status, 'refunded_qty', i.refunded_qty,
                                                                           'ship_status', i.ship_status, 'courier', i.courier, 'tracking_no', i.tracking_no,
                                                                           'shipped_at', i.shipped_at, 'delivered_at', i.delivered_at)
                                                   from public.myr_order_items i where i.id = x.order_item_id))
                from public.myr_orders o where o.id = x.order_id),
    'is_member', x.user_id is not null,
    'last_preview', x.last_preview, 'last_message_at', x.last_message_at,
    'replied_at', x.replied_at, 'closed_at', x.closed_at, 'created_at', x.created_at,
    'message_count', (select count(*) from public.myr_cs_messages m where m.conversation_id = x.id),
    'first_body', (select left(m.body, 200) from public.myr_cs_messages m where m.conversation_id = x.id order by m.created_at, m.id limit 1),
    'answer', (select jsonb_build_object('id', m.id, 'body', left(m.body, 300), 'created_at', m.created_at)
                 from public.myr_cs_messages m where m.conversation_id = x.id and m.sender = 'seller' order by m.created_at desc, m.id desc limit 1),
    'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url, 'status', p.status)
                  from public.myr_products p where p.id = x.product_id),
    'seller', (select jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle) from public.sellers s where s.id = x.seller_id))
$$;
revoke all on function public.myr_cs_conversation_json(public.myr_cs_conversations) from public, anon, authenticated;
grant execute on function public.myr_cs_conversation_json(public.myr_cs_conversations) to service_role;

-- ------------------------------------------------------------
-- 환불 가드(0061) — 고객 셀프 환불은 결제완료(발주 전) 줄만. 나머지 그대로
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
  -- 고객 셀프 환불은 발주(배송준비중) 전 줄만 — 0077 에서 주문 운송장 기준 → 줄 배송 상태 기준(아래 줄마다)

  for r in select * from public.myr_refund_lines(o, p_items) loop
    if r.problem = 'BAD_FORMAT' then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS'); end if;
    if r.problem is not null then
      v_problems := v_problems || jsonb_build_object('item_id', r.item_id, 'reason', r.problem, 'left', r.remaining);
      continue;
    end if;
    if p_actor = 'customer' and exists (select 1 from public.myr_order_items x where x.id = r.item_id and x.ship_status <> 'PAID') then
      return jsonb_build_object('ok', false, 'code', 'SHIPPED');
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
-- 운송장(0069 재정의) — 주문의 남은 줄 전부에 같은 송장(한 박스) · 주문 칸도 같이. 이름 · 인자 · 반환 · 거부 코드는 0069 그대로
-- ------------------------------------------------------------
create or replace function public.myr_app_admin_ship(p_order_code text, p_courier text, p_tracking_no text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o          public.myr_orders%rowtype;
  v_courier  text := btrim(coalesce(p_courier, ''));
  v_tracking text := regexp_replace(coalesce(p_tracking_no, ''), '[\s-]', '', 'g');
  v_old      text;
begin
  if v_courier not in ('CJ대한통운','우체국택배','한진택배','롯데택배','로젠택배') then return jsonb_build_object('ok', false, 'code', 'BAD_COURIER'); end if;
  if v_tracking !~ '^\d{8,30}$' then return jsonb_build_object('ok', false, 'code', 'BAD_TRACKING'); end if;
  select * into o from public.myr_orders where code = lower(btrim(coalesce(p_order_code, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if o.status not in ('PAID','PARTIAL_REFUNDED') then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if o.tracking_no = v_tracking and o.courier = v_courier
     and not exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.status <> 'CANCELED' and i.qty - i.refunded_qty > 0 and i.ship_status in ('PAID','PREPARING')) then
    return jsonb_build_object('ok', true, 'already', true, 'order_id', o.id, 'order_code', o.code, 'status', o.status, 'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at);
  end if;
  v_old := o.tracking_no;
  update public.myr_orders
     set courier = v_courier, tracking_no = v_tracking, shipped_at = coalesce(shipped_at, now()), updated_at = now()
   where id = o.id
   returning * into o;
  -- 남은 줄(결제완료 · 배송준비중) + 예전 송장을 달고 있던 줄(정정) — 배송완료 줄은 상태를 되돌리지 않는다
  update public.myr_order_items i
     set ship_status = case when i.ship_status = 'DELIVERED' then 'DELIVERED' else 'SHIPPING' end,
         courier = v_courier, tracking_no = v_tracking, shipped_at = coalesce(i.shipped_at, now()), is_delayed = false
   where i.order_id = o.id and i.status <> 'CANCELED' and i.qty - i.refunded_qty > 0
     and (i.ship_status in ('PAID','PREPARING') or (v_old is not null and i.tracking_no = v_old));
  return jsonb_build_object('ok', true, 'already', false, 'order_id', o.id, 'order_code', o.code, 'status', o.status, 'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at);
end;
$$;
revoke all on function public.myr_app_admin_ship(text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship(text, text, text) to service_role;

-- 발송 대기 / 발송된 주문(0069 재정의) — 기준이 줄 배송 상태로
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
           'lines', (select count(*) from public.myr_order_items i where i.order_id = o.id and i.status <> 'CANCELED' and i.qty - i.refunded_qty > 0),
           'ship_status', public.myr_order_ship_status(o.id),
           'preparing', (select count(*) from public.myr_order_items i where i.order_id = o.id and i.status <> 'CANCELED' and i.qty - i.refunded_qty > 0 and i.ship_status = 'PREPARING')
         ) order by case when p_shipped then o.shipped_at else o.paid_at end desc), '[]'::jsonb)
    from (select * from public.myr_orders o
           where o.status in ('PAID','PARTIAL_REFUNDED')
             and (case when p_shipped
                       then not exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.status <> 'CANCELED' and i.qty - i.refunded_qty > 0 and i.ship_status in ('PAID','PREPARING'))
                            and exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.status <> 'CANCELED' and i.qty - i.refunded_qty > 0)
                       else exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.status <> 'CANCELED' and i.qty - i.refunded_qty > 0 and i.ship_status in ('PAID','PREPARING')) end)
           order by case when p_shipped then o.shipped_at else o.paid_at end desc
           limit greatest(coalesce(p_limit, 100), 1)) o
$$;
revoke all on function public.myr_app_admin_ship_pending(integer, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship_pending(integer, boolean) to service_role;

-- ------------------------------------------------------------
-- 발주(결제완료 → 배송준비중) — 이벗 11시 등록(E2) · 운영 수동 전환이 같이 쓴다
-- ------------------------------------------------------------
create or replace function public.myr_app_admin_prepare_candidates(p_cutoff timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'item_id', i.id, 'order_id', o.id, 'order_code', o.code, 'ordered_at', o.created_at, 'paid_at', o.paid_at,
           'goods_code', coalesce(nullif(btrim(p.ebut_goods_code), ''), p.code), 'goods_name', i.product_name, 'goods_option', coalesce(i.option_name, ''),
           'qty', i.qty - i.refunded_qty, 'seller_id', i.seller_id, 'shipping', o.shipping
         ) order by o.paid_at, o.id, i.created_at, i.id), '[]'::jsonb)
    from public.myr_order_items i
    join public.myr_orders o on o.id = i.order_id
    join public.myr_products p on p.id = i.product_id
   where i.ship_status = 'PAID' and i.status <> 'CANCELED' and i.qty - i.refunded_qty > 0
     and o.status in ('PAID','PARTIAL_REFUNDED') and o.paid_at is not null and o.paid_at < p_cutoff
$$;
revoke all on function public.myr_app_admin_prepare_candidates(timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_admin_prepare_candidates(timestamptz) to service_role;

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
       and i.ship_status = 'PAID' and i.status <> 'CANCELED' and i.qty - i.refunded_qty > 0
       and o.status in ('PAID','PARTIAL_REFUNDED')
    returning i.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from u;
  return jsonb_build_object('ok', true, 'count', cardinality(v_ids),
    'orders', coalesce((select jsonb_agg(distinct o.code) from public.myr_order_items i join public.myr_orders o on o.id = i.order_id where i.id = any (v_ids)), '[]'::jsonb));
end;
$$;
revoke all on function public.myr_app_admin_mark_prepared(uuid[], boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_mark_prepared(uuid[], boolean) to service_role;

-- ------------------------------------------------------------
-- 줄 송장 · 배송완료(이벗 송장 수집 E3 · 정정)
-- ------------------------------------------------------------
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
begin
  if v_courier is not null and v_courier not in ('CJ대한통운','우체국택배','한진택배','롯데택배','로젠택배') then return jsonb_build_object('ok', false, 'code', 'BAD_COURIER'); end if;
  if v_tracking !~ '^\d{8,30}$' then return jsonb_build_object('ok', false, 'code', 'BAD_TRACKING'); end if;
  select * into i from public.myr_order_items where id = p_item_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select * into o from public.myr_orders where id = i.order_id for update;
  if o.status not in ('PAID','PARTIAL_REFUNDED') or i.status = 'CANCELED' or i.qty - i.refunded_qty <= 0 then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status);
  end if;
  v_new := i.tracking_no is distinct from v_tracking;
  update public.myr_order_items
     set ship_status = case when p_delivered or ship_status = 'DELIVERED' then 'DELIVERED' else 'SHIPPING' end,
         courier = coalesce(v_courier, courier), tracking_no = v_tracking, shipped_at = coalesce(shipped_at, now()),
         delivered_at = case when p_delivered then coalesce(delivered_at, now()) else delivered_at end, is_delayed = false
   where id = i.id
   returning * into i;
  -- 주문 칸(옛 화면 · 배송 시작 메일) — 비었을 때만 채운다 · 살아 있는 줄이 전부 배송완료면 주문 배송완료 시각
  update public.myr_orders
     set courier = coalesce(courier, i.courier), tracking_no = coalesce(tracking_no, i.tracking_no), shipped_at = coalesce(shipped_at, i.shipped_at),
         delivered_at = case when public.myr_order_ship_status(o.id) = 'DELIVERED' then coalesce(delivered_at, now()) else delivered_at end,
         updated_at = now()
   where id = o.id;
  return jsonb_build_object('ok', true, 'newly_shipped', v_new, 'order_id', o.id, 'order_code', o.code, 'item_id', i.id,
                            'ship_status', i.ship_status, 'courier', i.courier, 'tracking_no', i.tracking_no, 'shipped_at', i.shipped_at);
end;
$$;
revoke all on function public.myr_app_admin_ship_line(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship_line(uuid, text, text, boolean) to service_role;

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
   where i.ship_status in ('PREPARING','SHIPPING') and i.ebut_registered_at is not null
     and i.status <> 'CANCELED' and i.qty - i.refunded_qty > 0 and o.status in ('PAID','PARTIAL_REFUNDED')
$$;
revoke all on function public.myr_app_admin_ship_sync_candidates() from public, anon, authenticated;
grant execute on function public.myr_app_admin_ship_sync_candidates() to service_role;

create or replace function public.myr_app_admin_mark_delayed()
returns integer
language sql
volatile
security definer set search_path = public
as $$
  with u as (update public.myr_order_items set is_delayed = true where ship_status = 'PREPARING' and not is_delayed returning 1)
  select count(*)::integer from u
$$;
revoke all on function public.myr_app_admin_mark_delayed() from public, anon, authenticated;
grant execute on function public.myr_app_admin_mark_delayed() to service_role;
