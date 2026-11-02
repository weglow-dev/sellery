-- ============================================================
-- 0064 — MYR 문의 목록에 첫 질문(first_body) 추가 (마이페이지 "내 문의" 아코디언 제목 · 2026-11-02)
--   myr_cs_conversation_json 에 'first_body'(첫 메시지 = 고객 질문 · 200자) 한 칸만 더한다. 나머지 모양·권한은 0063 그대로.
--   펼친 뒤 전체 스레드는 기존 myr_app_cs_thread(actor='customer') 로 읽는다 — 새 RPC 없음.
--   메시지 시각 기본값을 clock_timestamp() 로 — now() 는 트랜잭션 시작 시각이라 한 트랜잭션에서 넣은 메시지가 같은 시각이 되고
--   "첫 메시지"·스레드 순서가 id(난수)에 따라 바뀐다. 이미 들어간 행은 그대로.
-- ============================================================

alter table public.myr_cs_messages alter column created_at set default clock_timestamp();

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
                                                                           'amount', i.amount, 'status', i.status, 'refunded_qty', i.refunded_qty)
                                                   from public.myr_order_items i where i.id = x.order_item_id))
                from public.myr_orders o where o.id = x.order_id),
    'is_member', x.user_id is not null,
    'last_preview', x.last_preview, 'last_message_at', x.last_message_at,
    'replied_at', x.replied_at, 'closed_at', x.closed_at, 'created_at', x.created_at,
    'message_count', (select count(*) from public.myr_cs_messages m where m.conversation_id = x.id),
    'first_body', (select left(m.body, 200) from public.myr_cs_messages m where m.conversation_id = x.id order by m.created_at, m.id limit 1),
    'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url, 'status', p.status)
                  from public.myr_products p where p.id = x.product_id),
    'seller', (select jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle) from public.sellers s where s.id = x.seller_id))
$$;
revoke all on function public.myr_cs_conversation_json(public.myr_cs_conversations) from public, anon, authenticated;
grant execute on function public.myr_cs_conversation_json(public.myr_cs_conversations) to service_role;
