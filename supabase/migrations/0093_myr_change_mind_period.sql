-- ============================================================
-- 0093 — MYR 단순 변심 "수령 후 7일" 기한을 서버가 막는다(2026-11-11 · 지금까지는 안내 문구에만 있었다)
--   발견: MYR1495(11/3 18:11 배송 완료)에 11/11 단순 변심 환불이 그대로 접수됐다(RQ2500).
--   규칙(대표 결정 2026-11-11)
--     · 날짜 기준 — 수령(배송 완료) 다음 날부터 7일째 밤 23:59:59(한국 시간)까지. 11/3 수령 → 11/10 23:59:59 까지 · 전자상거래법 "공급받은 날부터 7일"과 같은 셈
--     · 배송 완료 기록이 없는 줄(배송준비중 · 배송중)은 아직 수령 전 — 기한 없음(지금처럼 받는다)
--     · 파손 · 누액 / 오배송은 기한 없음(크리에이터 판단 · 정책이 정해지면 따로)
--     · "미개봉"은 시스템이 알 수 없다 — 크리에이터가 사진 · 회수 상태로 판단
--
--   새 함수
--     myr_line_change_mind_until(item)        단순 변심 가능 마지막 시각(배송 완료 없으면 null)
--     myr_line_change_mind_ok(item, now)      지금 단순 변심을 받을 수 있나 — 요청 접수 · 주문 JSON 이 같이 쓴다
--   바뀌는 함수(나머지 그대로)
--     myr_app_claim_open   0092 정의 + 단순 변심 기한 검사 → 줄 reason CHANGE_MIND_EXPIRED(until 포함)
--     myr_order_json       0092 정의 + 줄마다 change_mind_until · change_mind_ok
--   이미 접수된 요청(예: RQ2500)은 건드리지 않는다 — 크리에이터가 반려한다.
--   권한: 새 내부 함수는 anon · authenticated EXECUTE 회수. 테스트: supabase/tests/myr_change_mind.test.sql.
-- ============================================================

create or replace function public.myr_line_change_mind_until(i public.myr_order_items)
returns timestamptz
language sql
stable
as $$
  select case when i.delivered_at is null then null
              else ((((i.delivered_at at time zone 'Asia/Seoul')::date + 8)::timestamp) at time zone 'Asia/Seoul') - interval '1 second' end
$$;
revoke all on function public.myr_line_change_mind_until(public.myr_order_items) from public, anon, authenticated;

create or replace function public.myr_line_change_mind_ok(i public.myr_order_items, p_now timestamptz default now())
returns boolean
language sql
stable
as $$
  select coalesce(p_now <= public.myr_line_change_mind_until(i), true)
$$;
revoke all on function public.myr_line_change_mind_ok(public.myr_order_items, timestamptz) from public, anon, authenticated;

-- 0092 정의 + 단순 변심 기한
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
  if p_reason is null or p_reason not in ('단순 변심','파손 · 누액','오배송') then return jsonb_build_object('ok', false, 'code', 'BAD_REASON'); end if;
  if p_reason = '단순 변심' and p_kind = 'exchange' then return jsonb_build_object('ok', false, 'code', 'EXCHANGE_NOT_ALLOWED'); end if;
  select * into o from public.myr_orders where id = p_order_id for update;
  if not found or p_actor_id is null or not (o.user_id = p_actor_id or (o.user_id is null and o.customer_id = p_actor_id)) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if o.status not in ('PAID','PARTIAL_REFUNDED') then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then return jsonb_build_object('ok', false, 'code', 'NOTHING'); end if;
  if jsonb_array_length(p_lines) > 20 then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS'); end if;

  -- 1) 검사(하나라도 걸리면 아무것도 만들지 않는다)
  for l in select * from jsonb_array_elements(p_lines) loop
    if (l ->> 'item_id') !~ '^[0-9a-f-]{36}$' or (l ->> 'qty') !~ '^\d{1,2}$' then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS'); end if;
    v_id := (l ->> 'item_id')::uuid;
    v_qty := (l ->> 'qty')::int;
    v_photos := coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(l -> 'photos') = 'array' then l -> 'photos' else '[]'::jsonb end) x where x <> ''), '{}');
    select * into i from public.myr_order_items where id = v_id and order_id = o.id;
    if not found or v_id = any (v_seen) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'NOT_IN_ORDER');
    elsif i.status = 'CANCELED' then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'CANCELED');
    elsif v_qty < 1 then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'BAD_QTY');
    elsif v_qty > i.qty - i.refunded_qty then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'TOO_MANY');
    elsif public.myr_line_refund_path(o, i) is distinct from 'claim' then
      -- 결제완료(발주 전) 줄은 요청이 아니라 바로 환불 — 줄 길 판정은 myr_line_refund_path 한 곳(0092)
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'NOT_PREPARED');
    elsif exists (select 1 from public.myr_refund_requests q where q.order_item_id = v_id and q.status in ('pending','progress')) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'OPEN_EXISTS');
    elsif p_reason = '단순 변심' and not public.myr_line_change_mind_ok(i) then
      -- 단순 변심은 수령 후 7일(날짜 기준)까지 — 기한 판정은 myr_line_change_mind_until 한 곳(샵 화면도 같은 값 · 0093)
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'CHANGE_MIND_EXPIRED', 'until', public.myr_line_change_mind_until(i));
    elsif cardinality(v_photos) > 3 or exists (select 1 from unnest(v_photos) p where p !~ ('^' || o.id::text || '/' || v_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'BAD_PHOTOS');
    elsif p_reason in ('파손 · 누액','오배송') and cardinality(v_photos) = 0 then
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

-- 0092 정의 + 단순 변심 기한 칸
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
    'claim_status', public.myr_order_claim_status(o.id),
    'guest', o.user_id is null, 'buyer_name', o.buyer_name,
    'shipping', case when p_full then o.shipping else null end,
    'buyer_email', case when p_full then o.buyer_email else null end,
    'refund_reason', case when p_full and o.refund_amount > 0 then o.refund_reason else null end,
    'refunded_at', case when p_full and o.refund_amount > 0 then o.refunded_at else null end,
    -- 줄마다 환불 길(instant · claim · null · 0092) · 단순 변심 기한 · 지금 가능한지(0093) — 샵 화면이 이 값을 그대로 쓴다
    'items', coalesce((select jsonb_agg(public.myr_order_item_json(i) || jsonb_build_object('refund_path', public.myr_line_refund_path(o, i),
                                                                                   'change_mind_until', public.myr_line_change_mind_until(i),
                                                                                   'change_mind_ok', public.myr_line_change_mind_ok(i)) order by i.created_at, i.id)
                         from public.myr_order_items i where i.order_id = o.id), '[]'::jsonb))
$$;
revoke all on function public.myr_order_json(public.myr_orders, boolean) from public, anon, authenticated;
