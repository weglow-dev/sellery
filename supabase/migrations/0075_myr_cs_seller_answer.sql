-- ============================================================
-- 0075 — MYR 크리에이터 콘솔 "고객 문의" 답변(docs/myr.md §4.2.1 5번 · 시안 "MYR Influencer Admin" CS 관리 › 고객 문의 · 2026-11-05)
--
--   시안은 문의 1건 = 고객 질문 1 + 내 답변 1. DB 는 0063 의 스레드(메시지 여러 개)를 그대로 쓰고,
--   "내 답변" = 그 문의의 **가장 최근 크리에이터 메시지**(sender='seller' — 운영 대행 답변 포함)로 본다. 고객 추가 문의는 S7-5 에서 없앴다.
--   답변 수정은 없다(2026-11-05 대표 결정 — 시안의 [답변 수정] 은 넣지 않음). 답변 등록은 0063 myr_app_cs_reply 그대로.
--
--   myr_cs_conversation_json       + answer { id, body(300자), created_at } — 가장 최근 크리에이터 메시지 · 없으면 null (목록 카드 "↩ 답변" 줄)
--   myr_app_seller_cs_of_user(user)       그 계정에 연결된 크리에이터의 문의 목록(= myr_app_cs_list('seller', …) 그대로) · 연결 없으면 []
--   myr_app_seller_cs_waiting_of_user(user)  답변 대기(OPEN) 수 — 콘솔 내비 · 홈 뱃지
--       두 함수는 0072 와 같은 이유(크리에이터 게이트와 **동시에** 보내 DB 왕복 대기를 줄인다) — 게이트가 통과해야 결과를 쓴다(호출자 책임)
--
--   답변 등록은 0063 myr_app_cs_reply(actor='seller') 그대로 — OPEN → ANSWERED · replied_at. 종료(myr_app_cs_close)는 시안에 없어 콘솔에서 쓰지 않는다.
--   권한: 새 RPC 는 service role 만(anon · authenticated EXECUTE 회수). 크리에이터 · 계정 id 는 콘솔 서버가 세션에서 정해 넘긴다(결정 3).
--   테스트: supabase/tests/myr_cs_answer.test.sql. 재실행 가능.
-- ============================================================

-- 0064 정의 + answer
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
    'answer', (select jsonb_build_object('id', m.id, 'body', left(m.body, 300), 'created_at', m.created_at)
                 from public.myr_cs_messages m where m.conversation_id = x.id and m.sender = 'seller' order by m.created_at desc, m.id desc limit 1),
    'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url, 'status', p.status)
                  from public.myr_products p where p.id = x.product_id),
    'seller', (select jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle) from public.sellers s where s.id = x.seller_id))
$$;
revoke all on function public.myr_cs_conversation_json(public.myr_cs_conversations) from public, anon, authenticated;
grant execute on function public.myr_cs_conversation_json(public.myr_cs_conversations) to service_role;

-- ------------------------------------------------------------
-- 계정으로 바로 — 내 문의 목록 · 답변 대기 수(0072 와 같은 방식)
-- ------------------------------------------------------------
create or replace function public.myr_app_seller_cs_of_user(p_user uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select public.myr_app_cs_list('seller', s.id, null) from public.sellers s where s.user_id = p_user), '[]'::jsonb)
$$;
revoke all on function public.myr_app_seller_cs_of_user(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_cs_of_user(uuid) to service_role;

create or replace function public.myr_app_seller_cs_waiting_of_user(p_user uuid)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select count(*)::integer
    from public.myr_cs_conversations c
    join public.sellers s on s.id = c.seller_id
   where s.user_id = p_user and c.status = 'OPEN'
$$;
revoke all on function public.myr_app_seller_cs_waiting_of_user(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_cs_waiting_of_user(uuid) to service_role;
