-- ============================================================
-- 0100 — 교환·환불 요청 JSON 에 "같은 주문의 내 다른 상품"(2026-11-12)
--   콘솔 요청 상세 "주문 · 배송" 칸이 요청이 걸린 줄 하나만 보여 줘서, 상품 2개 주문인데 1개만 산 것처럼 보였다(RQ2920 · MYR8003).
--   myr_refund_request_json 의 order 에 others(같은 주문 · 같은 크리에이터 · 요청 줄 제외)를 더한다. 다른 크리에이터 줄은 싣지 않는다.
--   줄 판정은 기존 함수 그대로 — 남은 수량 myr_line_left · 살아 있는 줄 myr_line_live · 열린 요청 myr_claim_status_open.
--   새 함수 myr_line_open_claim(줄) — 줄의 열린 교환·환불 요청 { code, status, kind } · 없으면 null. 콘솔 주문(myr_app_seller_orders) · 요청 접수(myr_app_claim_open
--   OPEN_EXISTS) · 이 JSON 이 각자 쓰던 같은 하위 조회를 이 함수 하나로(백엔드 원칙 1 · 계산 결과 불변).
--   권한 그대로(anon · authenticated EXECUTE 없음 · service_role 만). 테스트: supabase/tests/myr_claim_order_others.test.sql
-- ============================================================

create or replace function public.myr_line_open_claim(i public.myr_order_items)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('code', q.code, 'status', q.status, 'kind', q.kind)
    from public.myr_refund_requests q
   where q.order_item_id = i.id and public.myr_claim_status_open(q.status)
   order by q.created_at desc
   limit 1
$$;
revoke all on function public.myr_line_open_claim(public.myr_order_items) from public, anon, authenticated;

-- 0099 정의 + order.others
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
    'resolution', r.resolution, 'message', r.message, 'decided_at', r.decided_at,
    'needs_collect', r.needs_collect, 'collected_at', r.collected_at,
    'needs_reship', r.needs_reship, 'reship_courier', r.reship_courier, 'reship_tracking_no', r.reship_tracking_no, 'reshipped_at', r.reshipped_at,
    'needs_refund', r.needs_refund, 'deduction', r.deduction, 'return_fee', public.myr_refund_request_fee_due(r),
    'refund_amount', r.refund_amount, 'refunded_at', r.refunded_at, 'done_at', r.done_at, 'created_at', r.created_at,
    'amount', public.myr_line_amount(i.unit_price, r.qty),
    -- 환불이 끝난 요청을 결제 기준으로 — 결제 금액(상품 + 함께 돌려준 처음 배송비) = 환불액 + 차감 · 환불 전이면 refund_paid null · shipping_back 0
    'refund_paid', r.refund_amount + r.deduction,
    'shipping_back', greatest(r.refund_amount + r.deduction - public.myr_line_amount(i.unit_price, r.qty), 0),
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
                                                     'refunded_qty', x.refunded_qty, 'status', x.status, 'ship_status', x.ship_status,
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

-- 0099 정의 + 줄의 열린 요청을 myr_line_open_claim 으로
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
             'amounts', (select jsonb_build_object('paid', coalesce(sum(i.amount), 0), 'refunded', coalesce(sum(i.refund_amount), 0),
                                                  'net', coalesce(sum(public.myr_line_net(i)), 0))
                           from public.myr_order_items i where i.order_id = o.id and i.seller_id = p_seller),
             'items', (select jsonb_agg(jsonb_build_object(
                         'id', i.id, 'name', i.product_name, 'option', i.option_name, 'qty', i.qty, 'unit_price', i.unit_price, 'amount', i.amount,
                         'status', i.status, 'refunded_qty', i.refunded_qty, 'refund_amount', i.refund_amount,
                         'left_qty', public.myr_line_left(i), 'live', public.myr_line_live(i),
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
  ), '[]'::jsonb)
$$;
revoke all on function public.myr_app_seller_orders(uuid, integer) from public, anon, authenticated;
grant execute on function public.myr_app_seller_orders(uuid, integer) to service_role;

-- 0099 정의 + 같은 줄에 열린 요청이 있는지(OPEN_EXISTS)를 myr_line_open_claim 으로
create or replace function public.myr_app_claim_open(p_order_id uuid, p_actor_id uuid, p_kind text, p_reason text, p_lines jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o          public.myr_orders%rowtype;
  i          public.myr_order_items%rowtype;
  l          jsonb;
  v_id       uuid;
  v_qty      integer;
  v_note     text;
  v_photos   text[];
  v_problems jsonb := '[]'::jsonb;
  v_seen     uuid[] := '{}';
  v_out      jsonb := '[]'::jsonb;
  v_code     text;
  v_batch    uuid := gen_random_uuid();
begin
  if p_kind is null or p_kind not in ('refund','exchange') then return jsonb_build_object('ok', false, 'code', 'BAD_KIND'); end if;
  if p_reason is null or not (p_reason = any (public.myr_claim_reasons())) then return jsonb_build_object('ok', false, 'code', 'BAD_REASON'); end if;
  if not public.myr_claim_kind_allowed(p_kind, p_reason) then return jsonb_build_object('ok', false, 'code', 'EXCHANGE_NOT_ALLOWED'); end if;
  select * into o from public.myr_orders where id = p_order_id for update;
  if not found or not public.myr_order_owned_by(o, p_actor_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if not public.myr_order_status_open(o.status) then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then return jsonb_build_object('ok', false, 'code', 'NOTHING'); end if;
  if jsonb_array_length(p_lines) > 20 then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS'); end if;

  -- 1) 검사(하나라도 걸리면 아무것도 만들지 않는다)
  for l in select * from jsonb_array_elements(p_lines) loop
    if (l ->> 'item_id') !~ '^[0-9a-f-]{36}$' or public.myr_qty_parse(l ->> 'qty') < 0 then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS'); end if;   -- 숫자 형식만(수량 상한 없음 · 남은 수량은 아래 TOO_MANY)
    v_id := (l ->> 'item_id')::uuid;
    v_qty := (l ->> 'qty')::int;
    v_photos := coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(l -> 'photos') = 'array' then l -> 'photos' else '[]'::jsonb end) x where x <> ''), '{}');
    select * into i from public.myr_order_items where id = v_id and order_id = o.id;
    if not found or v_id = any (v_seen) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'NOT_IN_ORDER');
    elsif not public.myr_line_valid(i) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'CANCELED');
    elsif v_qty < 1 then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'BAD_QTY');
    elsif v_qty > public.myr_line_left(i) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'TOO_MANY');
    elsif public.myr_line_refund_path(o, i) is distinct from 'claim' then
      -- 결제완료(발주 전) 줄은 요청이 아니라 바로 환불 — 줄 길 판정은 myr_line_refund_path 한 곳(0092)
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'NOT_PREPARED');
    elsif public.myr_line_open_claim(i) is not null then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'OPEN_EXISTS');
    elsif public.myr_claim_reason_change_mind(p_reason) and not public.myr_line_change_mind_ok(i) then
      -- 단순 변심은 수령 후 7일(날짜 기준)까지 — 기한 판정은 myr_line_change_mind_until 한 곳(샵 화면도 같은 값 · 0093)
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'CHANGE_MIND_EXPIRED', 'until', public.myr_line_change_mind_until(i));
    elsif cardinality(v_photos) > 3 or exists (select 1 from unnest(v_photos) p where p !~ ('^' || o.id::text || '/' || v_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'BAD_PHOTOS');
    elsif public.myr_claim_photo_required(p_reason) and cardinality(v_photos) = 0 then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'PHOTO_REQUIRED');
    end if;
    v_seen := v_seen || v_id;
  end loop;
  if jsonb_array_length(v_problems) > 0 then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS', 'items', v_problems); end if;

  -- 2) 만들기
  for l in select * from jsonb_array_elements(p_lines) loop
    v_id := (l ->> 'item_id')::uuid;
    v_note := nullif(btrim(left(l ->> 'note', 300)), '');
    v_photos := coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(l -> 'photos') = 'array' then l -> 'photos' else '[]'::jsonb end) x where x <> ''), '{}');
    insert into public.myr_refund_requests (batch, order_id, order_item_id, seller_id, product_id, kind, qty, reason, note, photos)
    select v_batch, o.id, i2.id, i2.seller_id, i2.product_id, p_kind, (l ->> 'qty')::int, p_reason, v_note, v_photos
      from public.myr_order_items i2 where i2.id = v_id
    returning code into v_code;
    v_out := v_out || jsonb_build_object('code', v_code, 'item_id', v_id);
  end loop;
  return jsonb_build_object('ok', true, 'order_code', o.code, 'requests', v_out);
end;
$$;
revoke all on function public.myr_app_claim_open(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_claim_open(uuid, uuid, text, text, jsonb) to service_role;
