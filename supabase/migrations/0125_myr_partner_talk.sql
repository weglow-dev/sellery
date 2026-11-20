-- ============================================================
-- 0125 · MYR 파트너팀 톡 — 크리에이터 ↔ 운영 대화방(크리에이터마다 방 하나 · 2026-11-20)
--
--   "파트너팀에 문의"가 메일(mailto)이라 운영 기록이 남지 않고 크리에이터가 답을 콘솔에서 못 봤다 → 콘솔 안 대화방.
--   크리에이터 콘솔: 상단 메신저 아이콘(안 읽은 답변 뱃지) → /messages(대화 형식 · 실시간 아님 — 열 때 · 보낼 때 새로 읽는다).
--     "문의" 버튼(정산 정보 확인 중 · 토스 문자 도움말)도 /messages 를 연다(분류 · 맥락 없음 — 2026-11-20 결정).
--   운영: 운영 콘솔(화면 단계)이 생기기 전까지 packages/db/scripts/myr-talk.mjs(list · show · reply).
--   글만(첨부 없음) · 이메일 알림 없음(2026-11-20 결정 — 필요하면 다음 단계).
--
--   myr_partner_body_max()                 메시지 본문 최대 글자 수 2000 — 형식 검사 · 거절 응답의 max · 화면 상수(PARTNER_BODY_MAX · check-boundaries (j))가 같은 값
--   myr_partner_body_ok(body)              메시지 본문 형식 — 앞뒤 공백 뺀 1~myr_partner_body_max()자(입력 형식 · 화면도 같은 검사)
--   myr_partner_seller_unread(seller)      크리에이터가 안 읽은 파트너팀 답변 수(메신저 뱃지)
--   myr_partner_admin_unread(seller)       운영이 안 읽은 크리에이터 메시지 수(운영 목록)
--   myr_partner_waiting(thread)            운영이 답할 차례인가(마지막 메시지가 크리에이터)
--   myr_partner_thread_touch(seller, sender, body)  메시지 뒤 방 요약(마지막 보낸 쪽 · 미리보기 · 시각 · 보낸 쪽 읽음) — 보내기 · 답하기가 같이 쓴다
--   myr_app_partner_talk_of_user(user, mark_read)    크리에이터 대화(세션 user → sellers.user_id) · 읽음 표시 · waiting(답 기다리는 중). 거부: NOT_FOUND
--   myr_app_partner_unread_of_user(user)             크리에이터 뱃지 수
--   myr_app_partner_send_of_user(user, body)  크리에이터 보내기. 거부: NOT_FOUND · BAD_BODY · TOO_FAST(1분 10개)
--   myr_app_admin_partner_threads(waiting_only)      운영 목록(답할 차례 먼저)
--   myr_app_admin_partner_talk(seller, mark_read)    운영 대화 · 읽음 표시. 거부: NOT_FOUND
--   myr_app_admin_partner_reply(seller, body, admin) 운영 답하기. 거부: NOT_FOUND · BAD_BODY
--   권한: 표는 RLS 켜짐 · 정책 없음(service_role 만) · RPC 는 anon · authenticated EXECUTE 회수 — 크리에이터는 앱이 세션에서 정한 user id 로만
-- ============================================================

-- ---------- 판정 ----------
create or replace function public.myr_partner_body_max()
returns integer language sql immutable as $$ select 2000 $$;
revoke all on function public.myr_partner_body_max() from public, anon, authenticated;

create or replace function public.myr_partner_body_ok(p_body text)
returns boolean
language sql
immutable
as $$
  select coalesce(char_length(btrim(p_body)) between 1 and public.myr_partner_body_max(), false)
$$;
revoke all on function public.myr_partner_body_ok(text) from public, anon, authenticated;

-- ---------- 표 ----------
create table if not exists public.myr_partner_threads (
  seller_id        uuid primary key references public.sellers (id) on delete cascade,
  last_sender      text check (last_sender in ('seller', 'admin')),
  last_preview     text,
  last_message_at  timestamptz,
  seller_read_at   timestamptz,
  admin_read_at    timestamptz,
  created_at       timestamptz not null default now()
);
comment on table public.myr_partner_threads is 'MYR 파트너팀 톡 — 크리에이터마다 방 하나(0125) · 요약 · 양쪽 읽은 시각';

create table if not exists public.myr_partner_messages (
  id             uuid primary key default gen_random_uuid(),
  seller_id      uuid not null references public.sellers (id) on delete cascade,
  sender         text not null check (sender in ('seller', 'admin')),
  admin_user_id  uuid references auth.users (id) on delete set null,
  body           text not null check (public.myr_partner_body_ok(body)),
  created_at     timestamptz not null default now()
);
comment on table public.myr_partner_messages is 'MYR 파트너팀 톡 메시지(0125) — sender seller · admin · 글만';
create index if not exists myr_partner_messages_seller_idx on public.myr_partner_messages (seller_id, created_at);

alter table public.myr_partner_threads enable row level security;
alter table public.myr_partner_messages enable row level security;
revoke all on table public.myr_partner_threads from public, anon, authenticated;
revoke all on table public.myr_partner_messages from public, anon, authenticated;

-- ---------- 판정(표를 읽는 것) ----------
create or replace function public.myr_partner_seller_unread(p_seller uuid)
returns integer
language sql
stable
set search_path to 'public'
as $$
  select count(*)::integer
    from public.myr_partner_messages m
    left join public.myr_partner_threads t on t.seller_id = m.seller_id
   where m.seller_id = p_seller and m.sender = 'admin' and m.created_at > coalesce(t.seller_read_at, '-infinity'::timestamptz)
$$;
revoke all on function public.myr_partner_seller_unread(uuid) from public, anon, authenticated;

create or replace function public.myr_partner_admin_unread(p_seller uuid)
returns integer
language sql
stable
set search_path to 'public'
as $$
  select count(*)::integer
    from public.myr_partner_messages m
    left join public.myr_partner_threads t on t.seller_id = m.seller_id
   where m.seller_id = p_seller and m.sender = 'seller' and m.created_at > coalesce(t.admin_read_at, '-infinity'::timestamptz)
$$;
revoke all on function public.myr_partner_admin_unread(uuid) from public, anon, authenticated;

create or replace function public.myr_partner_waiting(t public.myr_partner_threads)
returns boolean
language sql
immutable
as $$
  select coalesce(t.last_sender = 'seller', false)
$$;
revoke all on function public.myr_partner_waiting(public.myr_partner_threads) from public, anon, authenticated;

create or replace function public.myr_partner_message_json(m public.myr_partner_messages)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('id', m.id, 'sender', m.sender, 'body', m.body, 'created_at', m.created_at)
$$;
revoke all on function public.myr_partner_message_json(public.myr_partner_messages) from public, anon, authenticated;

-- 메시지 뒤 방 요약 — 보내기 · 답하기가 같이 쓴다(보낸 쪽은 읽은 것으로)
create or replace function public.myr_partner_thread_touch(p_seller uuid, p_sender text, p_body text)
returns void
language sql
set search_path to 'public'
as $$
  insert into public.myr_partner_threads as t (seller_id, last_sender, last_preview, last_message_at, seller_read_at, admin_read_at)
  values (p_seller, p_sender, left(btrim(p_body), 80), now(),
          case when p_sender = 'seller' then now() end, case when p_sender = 'admin' then now() end)
  on conflict (seller_id) do update
     set last_sender = excluded.last_sender, last_preview = excluded.last_preview, last_message_at = excluded.last_message_at,
         seller_read_at = coalesce(excluded.seller_read_at, t.seller_read_at), admin_read_at = coalesce(excluded.admin_read_at, t.admin_read_at)
$$;
revoke all on function public.myr_partner_thread_touch(uuid, text, text) from public, anon, authenticated;

-- 대화 — 오래된 것부터(최근 300개)
create or replace function public.myr_partner_messages_json(p_seller uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(public.myr_partner_message_json(m) order by m.created_at), '[]'::jsonb)
    from (select * from public.myr_partner_messages where seller_id = p_seller order by created_at desc limit 300) m
$$;
revoke all on function public.myr_partner_messages_json(uuid) from public, anon, authenticated;

-- ---------- 크리에이터 ----------
create or replace function public.myr_app_partner_talk_of_user(p_user uuid, p_mark_read boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_seller uuid;
begin
  select id into v_seller from public.sellers where user_id = p_user;
  if v_seller is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if coalesce(p_mark_read, false) then
    insert into public.myr_partner_threads (seller_id, seller_read_at) values (v_seller, now())
    on conflict (seller_id) do update set seller_read_at = now();
  end if;
  return jsonb_build_object('ok', true, 'messages', public.myr_partner_messages_json(v_seller), 'unread', public.myr_partner_seller_unread(v_seller),
    'waiting', coalesce((select public.myr_partner_waiting(t) from public.myr_partner_threads t where t.seller_id = v_seller), false));
end;
$$;
revoke all on function public.myr_app_partner_talk_of_user(uuid, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_partner_talk_of_user(uuid, boolean) to service_role;

create or replace function public.myr_app_partner_unread_of_user(p_user uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select public.myr_partner_seller_unread(s.id) from public.sellers s where s.user_id = p_user), 0)
$$;
revoke all on function public.myr_app_partner_unread_of_user(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_partner_unread_of_user(uuid) to service_role;

create or replace function public.myr_app_partner_send_of_user(p_user uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_seller uuid;
  m        public.myr_partner_messages%rowtype;
begin
  select id into v_seller from public.sellers where user_id = p_user;
  if v_seller is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not public.myr_partner_body_ok(p_body) then return jsonb_build_object('ok', false, 'code', 'BAD_BODY', 'max', public.myr_partner_body_max()); end if;
  -- 너무 빠르게 여러 번(1분에 10개) — 버튼 연타 · 잘못된 반복 막기
  if (select count(*) from public.myr_partner_messages where seller_id = v_seller and sender = 'seller' and created_at > now() - interval '1 minute') >= 10 then
    return jsonb_build_object('ok', false, 'code', 'TOO_FAST');
  end if;
  insert into public.myr_partner_messages (seller_id, sender, body) values (v_seller, 'seller', btrim(p_body)) returning * into m;
  perform public.myr_partner_thread_touch(v_seller, 'seller', m.body);
  return jsonb_build_object('ok', true, 'message', public.myr_partner_message_json(m));
end;
$$;
revoke all on function public.myr_app_partner_send_of_user(uuid, text) from public, anon, authenticated;
grant execute on function public.myr_app_partner_send_of_user(uuid, text) to service_role;

-- ---------- 운영 ----------
create or replace function public.myr_app_admin_partner_threads(p_waiting_only boolean default false)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'seller_id', t.seller_id, 'handle', s.handle, 'name', s.name,
           'last_sender', t.last_sender, 'last_preview', t.last_preview, 'last_message_at', t.last_message_at,
           'waiting', public.myr_partner_waiting(t), 'unread', public.myr_partner_admin_unread(t.seller_id))
         order by public.myr_partner_waiting(t) desc, t.last_message_at desc nulls last), '[]'::jsonb)
    from public.myr_partner_threads t
    join public.sellers s on s.id = t.seller_id
   where t.last_message_at is not null
     and (not coalesce(p_waiting_only, false) or public.myr_partner_waiting(t))
$$;
revoke all on function public.myr_app_admin_partner_threads(boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_partner_threads(boolean) to service_role;

create or replace function public.myr_app_admin_partner_talk(p_seller uuid, p_mark_read boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.sellers where id = p_seller) then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if coalesce(p_mark_read, false) then
    insert into public.myr_partner_threads (seller_id, admin_read_at) values (p_seller, now())
    on conflict (seller_id) do update set admin_read_at = now();
  end if;
  return jsonb_build_object('ok', true, 'messages', public.myr_partner_messages_json(p_seller), 'unread', public.myr_partner_admin_unread(p_seller));
end;
$$;
revoke all on function public.myr_app_admin_partner_talk(uuid, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_partner_talk(uuid, boolean) to service_role;

create or replace function public.myr_app_admin_partner_reply(p_seller uuid, p_body text, p_admin uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  m public.myr_partner_messages%rowtype;
begin
  if not exists (select 1 from public.sellers where id = p_seller) then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not public.myr_partner_body_ok(p_body) then return jsonb_build_object('ok', false, 'code', 'BAD_BODY', 'max', public.myr_partner_body_max()); end if;
  insert into public.myr_partner_messages (seller_id, sender, admin_user_id, body) values (p_seller, 'admin', p_admin, btrim(p_body)) returning * into m;
  perform public.myr_partner_thread_touch(p_seller, 'admin', m.body);
  return jsonb_build_object('ok', true, 'message', public.myr_partner_message_json(m));
end;
$$;
revoke all on function public.myr_app_admin_partner_reply(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_admin_partner_reply(uuid, text, uuid) to service_role;
