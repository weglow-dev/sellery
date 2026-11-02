-- ============================================================
-- 0063 — MYR 고객 문의(CS) · S7 (docs/myr.md §3 myr_cs_* · §6.6 소유 증명 · 결정 7 · 12)
--
-- 셀러리 0005 cs_conversations/cs_messages + 0018 app_cs_* + 0041 소유 증명을 MYR 로 복사:
--   · 캠페인 → **상품**(myr_products) 단위. seller_id 는 상품에서 파생(폼 값 아님 · 결정 3).
--   · brand → seller. 문의는 셀러(인플루언서)에게 바로 간다(결정 7). 관리자는 열람·대행 답변.
--   · 주문 연결은 **소유가 증명될 때만**(0041): 회원 user_id · 고객 행 customer_id · 비회원 조회 토큰(0058 myr_app_guest_order_verify).
--     증명된 주문 안에서 **이 상품의 줄**(order_item_id)만 같이 연결한다 — 다른 셀러의 줄은 응답에 담지 않는다(§6.6).
--   · 단일 함수 원칙(결정 12): thread · list · reply · close 는 함수 하나 + actor('customer'|'seller'|'admin') 로 권한만 가른다.
--     customer 는 client_token(비회원 · 접수 응답 1회 → HttpOnly 쿠키) 또는 user_id(회원) · seller 는 seller_id = actor_id · admin 은 전부.
--   · 셀러리의 campaign_events 는 MYR 에 없으므로 이벤트 기록 없음. 메일은 앱 훅(lib/server/mail-events.ts).
-- 권한: 전부 security definer · revoke from public/anon/authenticated · grant service_role (0007 방식). pgTAP supabase/tests/myr_cs.test.sql.
-- 반환은 { ok, code } — 실패 code: BAD_ACTOR · NOT_FOUND · BAD_TYPE · BAD_BODY(max) · CLOSED
-- ============================================================

create sequence if not exists public.myr_cs_code_seq start 1001;

create table if not exists public.myr_cs_conversations (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique default ('cs' || nextval('public.myr_cs_code_seq')),
  product_id       uuid not null references public.myr_products (id) on delete cascade,
  seller_id        uuid not null references public.sellers (id) on delete cascade,     -- 상품에서 파생
  order_code       text,                                                                -- 고객 입력 원문(≤ 32)
  order_id         uuid references public.myr_orders (id) on delete set null,          -- 소유 증명될 때만
  order_item_id    uuid references public.myr_order_items (id) on delete set null,     -- 그 주문 안 이 상품의 줄
  customer_id      uuid references public.customers (id) on delete set null,
  user_id          uuid references auth.users (id) on delete set null,
  client_token     uuid not null unique default gen_random_uuid(),
  buyer_name       text not null default '고객',
  type             text not null check (type in ('배송 문의','교환·반품','상품 문의','기타')),
  status           text not null default 'OPEN' check (status in ('OPEN','ANSWERED','CLOSED')),
  last_preview     text,
  last_message_at  timestamptz not null default now(),
  replied_at       timestamptz,
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint myr_cs_answered_has_reply check (status <> 'ANSWERED' or replied_at is not null)
);
create index if not exists myr_cs_conversations_seller_idx   on public.myr_cs_conversations (seller_id, status, last_message_at desc);
create index if not exists myr_cs_conversations_product_idx  on public.myr_cs_conversations (product_id);
create index if not exists myr_cs_conversations_order_idx    on public.myr_cs_conversations (order_id);
create index if not exists myr_cs_conversations_user_idx     on public.myr_cs_conversations (user_id, last_message_at desc);
create index if not exists myr_cs_conversations_customer_idx on public.myr_cs_conversations (customer_id);

drop trigger if exists myr_cs_conversations_updated_at on public.myr_cs_conversations;
create trigger myr_cs_conversations_updated_at before update on public.myr_cs_conversations
  for each row execute function public.set_updated_at();

create table if not exists public.myr_cs_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.myr_cs_conversations (id) on delete cascade,
  sender           text not null check (sender in ('customer','seller','admin')),       -- 표시 역할(관리자 대행 답변 = 'seller')
  actor_role       text not null check (actor_role in ('customer','seller','admin')),   -- 실제 발신 역할
  actor_user_id    uuid references auth.users (id) on delete set null,
  body             text not null,
  created_at       timestamptz not null default now()
);
create index if not exists myr_cs_messages_conv_idx on public.myr_cs_messages (conversation_id, created_at);

alter table public.myr_cs_conversations enable row level security;
alter table public.myr_cs_messages enable row level security;
revoke all on public.myr_cs_conversations from anon, authenticated;
revoke all on public.myr_cs_messages from anon, authenticated;
grant all on public.myr_cs_conversations to service_role;
grant all on public.myr_cs_messages to service_role;
grant usage, select on sequence public.myr_cs_code_seq to service_role;

-- ------------------------------------------------------------
-- JSON — client_token 은 싣지 않는다(접수 응답에서만 1회). 주문은 소유 증명된 것만 · 줄은 이 상품 줄만.
-- ------------------------------------------------------------
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
    'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url, 'status', p.status)
                  from public.myr_products p where p.id = x.product_id),
    'seller', (select jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle) from public.sellers s where s.id = x.seller_id))
$$;
revoke all on function public.myr_cs_conversation_json(public.myr_cs_conversations) from public, anon, authenticated;
grant execute on function public.myr_cs_conversation_json(public.myr_cs_conversations) to service_role;

create or replace function public.myr_cs_message_json(m public.myr_cs_messages)
returns jsonb
language sql immutable
as $$
  select jsonb_build_object('id', m.id, 'conversation_id', m.conversation_id, 'sender', m.sender, 'actor_role', m.actor_role, 'body', m.body, 'created_at', m.created_at)
$$;
revoke all on function public.myr_cs_message_json(public.myr_cs_messages) from public, anon, authenticated;
grant execute on function public.myr_cs_message_json(public.myr_cs_messages) to service_role;

create or replace function public.myr_cs_thread_json(x public.myr_cs_conversations)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'conversation', public.myr_cs_conversation_json(x),
    'messages', coalesce((select jsonb_agg(public.myr_cs_message_json(m) order by m.created_at, m.id)
                            from public.myr_cs_messages m where m.conversation_id = x.id), '[]'::jsonb))
$$;
revoke all on function public.myr_cs_thread_json(public.myr_cs_conversations) from public, anon, authenticated;
grant execute on function public.myr_cs_thread_json(public.myr_cs_conversations) to service_role;

-- 본문 정규화 — 0018 cs_normalize_body 와 같다(제어문자 제거 · 개행 유지 · 빈 줄 축소 · 앞뒤 공백)
create or replace function public.myr_cs_normalize_body(p_body text)
returns text
language sql immutable
as $$
  select btrim(regexp_replace(regexp_replace(replace(coalesce(p_body, ''), E'\r', ''), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'), '\n{3,}', E'\n\n', 'g'), E' \t\n')
$$;
revoke all on function public.myr_cs_normalize_body(text) from public, anon, authenticated;
grant execute on function public.myr_cs_normalize_body(text) to service_role;

-- actor 로 대화 찾기 — customer: client_token 또는 user_id 일치 · seller: seller_id = actor_id · admin: 전부. 없으면 null(코드·권한 불일치를 구분하지 않는다)
create or replace function public.myr_cs_find(p_code text, p_actor text, p_actor_id uuid, p_client_token uuid)
returns public.myr_cs_conversations
language sql stable
security definer set search_path = public
as $$
  select x.* from public.myr_cs_conversations x
   where lower(x.code) = lower(btrim(coalesce(p_code, '')))
     and case p_actor
           when 'customer' then ((p_client_token is not null and x.client_token = p_client_token) or (p_actor_id is not null and x.user_id = p_actor_id))
           when 'seller'   then (p_actor_id is not null and x.seller_id = p_actor_id)
           when 'admin'    then true
           else false
         end
   limit 1
$$;
revoke all on function public.myr_cs_find(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.myr_cs_find(text, text, uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- myr_app_cs_open(p_product_id, p_customer_id, p_user_id, p_buyer_name, p_type, p_body, p_order_code, p_guest_token) — 고객 문의 접수
--   상품이 있으면 어떤 상태든 접수(판매 내린 상품을 산 고객도 문의한다) → 없는 id NOT_FOUND · type BAD_TYPE · body 1~2000자 BAD_BODY{max} · 이름 ≤ 40(비면 '고객')
--   주문 연결 = 소유 증명될 때만: ① user_id ② customer_id ③ 비회원 조회 토큰(myr_app_guest_order_verify). 증명돼도 **이 상품의 줄이 없는 주문**이면 연결하지 않는다.
--   반환 { ok:true, conversation_id, conversation_code, client_token, seller_id, seller_name, order_id, order_item_id, order_matched }
--      | { ok:false, code:'NOT_FOUND'|'BAD_TYPE'|'BAD_BODY'(max) }
-- ------------------------------------------------------------
create or replace function public.myr_app_cs_open(p_product_id uuid, p_customer_id uuid, p_user_id uuid, p_buyer_name text, p_type text, p_body text,
                                                  p_order_code text default null, p_guest_token text default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p        public.myr_products%rowtype;
  v_body   text := public.myr_cs_normalize_body(p_body);
  v_type   text := btrim(coalesce(p_type, ''));
  v_name   text := nullif(left(regexp_replace(btrim(coalesce(p_buyer_name, '')), '\s+', ' ', 'g'), 40), '');
  v_ocode  text := nullif(left(btrim(coalesce(p_order_code, '')), 32), '');
  v_token  text := nullif(btrim(coalesce(p_guest_token, '')), '');
  v_oid    uuid;
  v_iid    uuid;
  v_seller text;
  x        public.myr_cs_conversations%rowtype;
begin
  select * into p from public.myr_products where id = p_product_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_type not in ('배송 문의', '교환·반품', '상품 문의', '기타') then return jsonb_build_object('ok', false, 'code', 'BAD_TYPE'); end if;
  if v_body = '' or char_length(v_body) > 2000 then return jsonb_build_object('ok', false, 'code', 'BAD_BODY', 'max', 2000); end if;

  if v_ocode is not null then
    select o.id into v_oid from public.myr_orders o
     where lower(o.code) = lower(v_ocode)
       and ((p_user_id is not null and o.user_id = p_user_id) or (p_customer_id is not null and o.customer_id = p_customer_id))
     limit 1;
    if v_oid is null and v_token is not null then
      v_oid := public.myr_app_guest_order_verify(v_ocode, v_token);
    end if;
    if v_oid is not null then
      select i.id into v_iid from public.myr_order_items i where i.order_id = v_oid and i.product_id = p.id order by i.created_at limit 1;
      if v_iid is null then v_oid := null; end if;   -- 이 상품의 줄이 없는 주문은 이 셀러와 무관 — 연결하지 않는다
    end if;
  end if;

  insert into public.myr_cs_conversations (product_id, seller_id, order_code, order_id, order_item_id, customer_id, user_id, buyer_name, type, status, last_preview, last_message_at)
  values (p.id, p.seller_id, v_ocode, v_oid, v_iid, p_customer_id, p_user_id, coalesce(v_name, '고객'), v_type, 'OPEN', left(v_body, 80), now())
  returning * into x;
  insert into public.myr_cs_messages (conversation_id, sender, actor_role, actor_user_id, body) values (x.id, 'customer', 'customer', p_user_id, v_body);
  select name into v_seller from public.sellers where id = p.seller_id;

  return jsonb_build_object('ok', true, 'conversation_id', x.id, 'conversation_code', x.code, 'client_token', x.client_token,
                            'seller_id', p.seller_id, 'seller_name', v_seller, 'order_id', v_oid, 'order_item_id', v_iid, 'order_matched', v_oid is not null);
end;
$$;
revoke all on function public.myr_app_cs_open(uuid, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_cs_open(uuid, uuid, uuid, text, text, text, text, text) to service_role;

-- ------------------------------------------------------------
-- myr_app_cs_thread(p_code, p_actor, p_actor_id, p_client_token) — 스레드(대화 + 메시지 시간순). 권한 없음·없는 코드 = null(라우트 404)
-- ------------------------------------------------------------
create or replace function public.myr_app_cs_thread(p_code text, p_actor text, p_actor_id uuid default null, p_client_token uuid default null)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select public.myr_cs_thread_json(x) from public.myr_cs_find(p_code, p_actor, p_actor_id, p_client_token) x where x.id is not null
$$;
revoke all on function public.myr_app_cs_thread(text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_cs_thread(text, text, uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- myr_app_cs_list(p_actor, p_actor_id, p_status) — 문의 목록. customer = user_id 의 것(회원) · seller = 내 상품 문의 · admin = 전부.
--   OPEN → ANSWERED → CLOSED · 같은 상태는 최근 메시지순 · ≤ 200. actor_id 없는 customer/seller 는 빈 배열.
-- ------------------------------------------------------------
create or replace function public.myr_app_cs_list(p_actor text, p_actor_id uuid default null, p_status text default null)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select coalesce((select jsonb_agg(public.myr_cs_conversation_json(x) order by (x.status = 'OPEN') desc, (x.status = 'ANSWERED') desc, x.last_message_at desc)
                     from (select * from public.myr_cs_conversations c
                            where (p_status is null or c.status = p_status)
                              and case p_actor
                                    when 'customer' then (p_actor_id is not null and c.user_id = p_actor_id)
                                    when 'seller'   then (p_actor_id is not null and c.seller_id = p_actor_id)
                                    when 'admin'    then true
                                    else false
                                  end
                            order by (c.status = 'OPEN') desc, (c.status = 'ANSWERED') desc, c.last_message_at desc
                            limit 200) x), '[]'::jsonb)
$$;
revoke all on function public.myr_app_cs_list(text, uuid, text) from public, anon, authenticated;
grant execute on function public.myr_app_cs_list(text, uuid, text) to service_role;

-- 주문 상세의 "이 주문의 문의" — 주문 소유는 호출하는 라우트가 이미 확인했다(myr_app_order_view · 비회원 토큰). 코드·유형·상태만.
create or replace function public.myr_app_cs_for_order(p_order_id uuid)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select coalesce((select jsonb_agg(jsonb_build_object('code', c.code, 'type', c.type, 'status', c.status, 'last_message_at', c.last_message_at,
                                                        'product_name', (select p.name from public.myr_products p where p.id = c.product_id))
                                    order by c.last_message_at desc)
                     from public.myr_cs_conversations c where c.order_id = p_order_id), '[]'::jsonb)
$$;
revoke all on function public.myr_app_cs_for_order(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_cs_for_order(uuid) to service_role;

-- ------------------------------------------------------------
-- myr_app_cs_reply(p_code, p_actor, p_actor_id, p_client_token, p_actor_user_id, p_body) — 메시지 추가
--   customer: 추가 문의 → OPEN(CLOSED 면 CLOSED 거부) · seller: 답변 → ANSWERED · replied_at · admin: 대행 답변(sender='seller' · actor_role='admin') → ANSWERED
--   CLOSED 는 누구도 못 쓴다 — 고객은 새 문의, 셀러는 다시 열 이유가 없다. body 1~2000자.
--   반환 { ok:true, conversation_id, conversation_code, status, message } | { ok:false, code:'BAD_ACTOR'|'NOT_FOUND'|'CLOSED'|'BAD_BODY'(max) }
-- ------------------------------------------------------------
create or replace function public.myr_app_cs_reply(p_code text, p_actor text, p_actor_id uuid, p_client_token uuid, p_actor_user_id uuid, p_body text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  x        public.myr_cs_conversations%rowtype;
  v_body   text := public.myr_cs_normalize_body(p_body);
  v_sender text;
  v_status text;
  m        public.myr_cs_messages%rowtype;
begin
  if p_actor not in ('customer', 'seller', 'admin') then return jsonb_build_object('ok', false, 'code', 'BAD_ACTOR'); end if;
  select * into x from public.myr_cs_find(p_code, p_actor, p_actor_id, p_client_token);
  if x.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  perform 1 from public.myr_cs_conversations where id = x.id for update;
  if x.status = 'CLOSED' then return jsonb_build_object('ok', false, 'code', 'CLOSED'); end if;
  if v_body = '' or char_length(v_body) > 2000 then return jsonb_build_object('ok', false, 'code', 'BAD_BODY', 'max', 2000); end if;

  v_sender := case when p_actor = 'customer' then 'customer' else 'seller' end;
  v_status := case when p_actor = 'customer' then 'OPEN' else 'ANSWERED' end;
  insert into public.myr_cs_messages (conversation_id, sender, actor_role, actor_user_id, body)
  values (x.id, v_sender, p_actor, p_actor_user_id, v_body) returning * into m;
  update public.myr_cs_conversations
     set status = v_status, last_preview = left(v_body, 80), last_message_at = m.created_at,
         replied_at = case when v_status = 'ANSWERED' then m.created_at else replied_at end
   where id = x.id;
  return jsonb_build_object('ok', true, 'conversation_id', x.id, 'conversation_code', x.code, 'status', v_status, 'message', public.myr_cs_message_json(m));
end;
$$;
revoke all on function public.myr_app_cs_reply(text, text, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.myr_app_cs_reply(text, text, uuid, uuid, uuid, text) to service_role;

-- ------------------------------------------------------------
-- myr_app_cs_close(p_code, p_actor, p_actor_id) — 처리 종료(seller · admin 만). 멱등(already).
--   반환 { ok:true, already, conversation_id, conversation_code, status:'CLOSED' } | { ok:false, code:'BAD_ACTOR'|'NOT_FOUND' }
-- ------------------------------------------------------------
create or replace function public.myr_app_cs_close(p_code text, p_actor text, p_actor_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  x public.myr_cs_conversations%rowtype;
begin
  if p_actor not in ('seller', 'admin') then return jsonb_build_object('ok', false, 'code', 'BAD_ACTOR'); end if;
  select * into x from public.myr_cs_find(p_code, p_actor, p_actor_id, null);
  if x.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  perform 1 from public.myr_cs_conversations where id = x.id for update;
  if x.status = 'CLOSED' then
    return jsonb_build_object('ok', true, 'already', true, 'conversation_id', x.id, 'conversation_code', x.code, 'status', 'CLOSED');
  end if;
  update public.myr_cs_conversations set status = 'CLOSED', closed_at = now() where id = x.id;
  return jsonb_build_object('ok', true, 'already', false, 'conversation_id', x.id, 'conversation_code', x.code, 'status', 'CLOSED');
end;
$$;
revoke all on function public.myr_app_cs_close(text, text, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_cs_close(text, text, uuid) to service_role;
