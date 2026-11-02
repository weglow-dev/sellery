-- ============================================================
-- 0060 MYR 주문 조회 — 마이 주문 목록 · 주문 상세 (docs/myr.md §4 · §7 S6 · 2026-11-02)
--
-- 고객이 보는 주문 JSON 한 모양(myr_order_json) 과 그것을 돌려주는 RPC 2개.
--   · myr_app_my_orders(user, limit)        회원 목록 — 줄 포함 · 배송지 없음(p_full=false)
--   · myr_app_order_view(code, user)         상세 — 회원은 user_id 가 같아야, 비회원(user null) 은 user_id 가 null 인 주문만.
--     비회원 토큰 검증은 0058 myr_app_guest_order_verify 가 라우트에서 먼저 한다(규칙 1 · 쿠키 토큰 → 주문 id 일치 확인).
--   · 응답에 재고·마진·결제 원문·raw_cancel 은 없다. 가상계좌 입금 정보(은행·계좌·기한)는 WAITING_DEPOSIT 일 때만 raw_payment 에서 뽑는다.
-- 권한: 전부 service role 만. 테스트: supabase/tests/myr_order_views.test.sql. 실행: 0059 이후. 재실행 가능.
-- ============================================================

create or replace function public.myr_order_item_json(i public.myr_order_items)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', i.id, 'product_code', p.code, 'name', i.product_name, 'option', i.option_name,
    'qty', i.qty, 'unit_price', i.unit_price, 'amount', i.amount, 'status', i.status, 'refunded_qty', i.refunded_qty,
    'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url, 'creator', s.name)
    from public.myr_products p
    left join public.sellers s on s.id = i.seller_id
   where p.id = i.product_id
$$;
revoke all on function public.myr_order_item_json(public.myr_order_items) from public, anon, authenticated;

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
    'guest', o.user_id is null, 'buyer_name', o.buyer_name,
    'shipping', case when p_full then o.shipping else null end,
    'items', coalesce((select jsonb_agg(public.myr_order_item_json(i) order by i.created_at, i.id) from public.myr_order_items i where i.order_id = o.id), '[]'::jsonb))
$$;
revoke all on function public.myr_order_json(public.myr_orders, boolean) from public, anon, authenticated;

-- 회원 주문 목록 (최신순 · limit 1~100)
create or replace function public.myr_app_my_orders(p_user_id uuid, p_limit integer default 20)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select jsonb_agg(public.myr_order_json(o, false) order by o.created_at desc)
      from (select * from public.myr_orders where user_id = p_user_id and p_user_id is not null
             order by created_at desc limit least(greatest(coalesce(p_limit, 20), 1), 100)) o), '[]'::jsonb)
$$;
revoke all on function public.myr_app_my_orders(uuid, integer) from public, anon, authenticated;
grant execute on function public.myr_app_my_orders(uuid, integer) to service_role;

-- 주문 상세 — 소유 불일치는 null (존재 여부를 흘리지 않는다)
create or replace function public.myr_app_order_view(p_order_code text, p_user_id uuid default null)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  o public.myr_orders%rowtype;
begin
  select * into o from public.myr_orders where lower(code) = lower(btrim(coalesce(p_order_code, '')));
  if not found then return null; end if;
  if p_user_id is not null then
    if o.user_id is distinct from p_user_id then return null; end if;
  else
    if o.user_id is not null then return null; end if;   -- 비회원 경로로 회원 주문은 열지 않는다
  end if;
  return public.myr_order_json(o, true);
end;
$$;
revoke all on function public.myr_app_order_view(text, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_order_view(text, uuid) to service_role;
