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
--   계산 결과 불변 — 차감액 · 거절 조건 · needs_refund 는 0099 와 같은 식을 함수로 옮겼을 뿐이다.
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

-- 차감 뒤 0원 이하가 되면 부분 환불은 안 된다(같은 묶음에서 이미 뺐으면 차감 0 → 전액과 같아 고를 수 있다)
create or replace function public.myr_claim_option_blocked(r public.myr_refund_requests, p_resolution text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select public.myr_claim_resolution_deducts(p_resolution)
     and public.myr_line_amount(i.unit_price, r.qty) <= public.myr_claim_option_deduction(r, p_resolution)
    from public.myr_order_items i where i.id = r.order_item_id
$$;
revoke all on function public.myr_claim_option_blocked(public.myr_refund_requests, text) from public, anon, authenticated;

-- 0100 정의 + option_deductions
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
