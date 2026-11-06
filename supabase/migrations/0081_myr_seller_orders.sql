-- ============================================================
-- 0081 — MYR 크리에이터 콘솔 "주문"(읽기 전용 · docs/myr.md §4.2.1 6번 · 2026-11-06)
--
--   크리에이터는 **내 상품 줄**만 본다 — 한 주문에 크리에이터가 여럿이면 다른 크리에이터 줄 · 금액 · 송장은 싣지 않는다.
--   고객 정보는 이름 가림(김*은)만 · 연락처 · 주소 · 이메일 없음(발송은 MYR 물류 — 결정 8). 환불 버튼 없음(7번 승인 흐름).
--   결제된 주문만(PAID · PARTIAL_REFUNDED · REFUNDED — 0076 실적과 같은 기준) · 입금 대기 · 취소는 싣지 않는다.
--
--   myr_mask_name(text)                       김*은 · 이* · 남궁*호 — 첫 글자 + 가운데 * + 끝 글자(두 글자면 첫 글자 + *)
--   myr_app_seller_orders(seller, limit)      주문(결제 최근순 ≤ limit) — { id, code, status, paid_at, buyer, items:[내 줄 …] }
--                                             줄 = 상품 · 수량 · 단가 · 금액 · 환불 수량/금액 · 줄 배송(0077) · 송장 · 진행 중 교환·환불 요청(0078 · 코드 · 상태)
--   myr_app_seller_orders_of_user(user, limit)  로그인 계정으로 바로(0072 · 0075 · 0076 과 같은 방식 · 게이트와 동시에)
--
--   권한: service role 만(anon · authenticated EXECUTE 회수). 테스트: supabase/tests/myr_seller_orders.test.sql. 재실행 가능.
-- ============================================================

create or replace function public.myr_mask_name(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
           when p_name is null or btrim(p_name) = '' then '고객'
           when char_length(btrim(p_name)) = 1 then btrim(p_name)
           when char_length(btrim(p_name)) = 2 then left(btrim(p_name), 1) || '*'
           else left(btrim(p_name), 1) || repeat('*', char_length(btrim(p_name)) - 2) || right(btrim(p_name), 1)
         end
$$;
revoke all on function public.myr_mask_name(text) from public, anon, authenticated;

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
             'items', (select jsonb_agg(jsonb_build_object(
                         'id', i.id, 'name', i.product_name, 'option', i.option_name, 'qty', i.qty, 'unit_price', i.unit_price, 'amount', i.amount,
                         'status', i.status, 'refunded_qty', i.refunded_qty, 'refund_amount', i.refund_amount,
                         'ship_status', i.ship_status, 'courier', i.courier, 'tracking_no', i.tracking_no, 'shipped_at', i.shipped_at, 'delivered_at', i.delivered_at,
                         'product', (select jsonb_build_object('code', p.code, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = i.product_id),
                         'claim', (select jsonb_build_object('code', r.code, 'status', r.status, 'kind', r.kind)
                                     from public.myr_refund_requests r where r.order_item_id = i.id and r.status in ('pending', 'progress')
                                    order by r.created_at desc limit 1))
                       order by i.created_at, i.id)
                       from public.myr_order_items i where i.order_id = o.id and i.seller_id = p_seller))
           order by o.paid_at desc, o.code desc)
      from (select o.* from public.myr_orders o
             where o.status in ('PAID', 'PARTIAL_REFUNDED', 'REFUNDED')
               and exists (select 1 from public.myr_order_items i where i.order_id = o.id and i.seller_id = p_seller)
             order by o.paid_at desc, o.code desc
             limit least(greatest(coalesce(p_limit, 200), 1), 500)) o
  ), '[]'::jsonb)
$$;
revoke all on function public.myr_app_seller_orders(uuid, integer) from public, anon, authenticated;
grant execute on function public.myr_app_seller_orders(uuid, integer) to service_role;

create or replace function public.myr_app_seller_orders_of_user(p_user uuid, p_limit integer default 200)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select public.myr_app_seller_orders(s.id, p_limit) from public.sellers s where s.user_id = p_user and p_user is not null), '[]'::jsonb)
$$;
revoke all on function public.myr_app_seller_orders_of_user(uuid, integer) from public, anon, authenticated;
grant execute on function public.myr_app_seller_orders_of_user(uuid, integer) to service_role;
