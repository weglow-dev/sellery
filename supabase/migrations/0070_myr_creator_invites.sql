-- ============================================================
-- 0070 — MYR 크리에이터 초대 가입(docs/myr.md 결정 14 · §4.2.1 10번)
--   가입은 초대 링크로만 — 운영팀이 이메일로 초대하면 링크(`/invite/<토큰>`)를 메일 + 복사 링크로 받는다.
--   링크는 사람마다 다르고 30일 · 1회용(2026-11-04 대표 결정 — 처음 7일에서 늘림) · 다시 초대하면 이전 링크는 무효(취소).
--
--   sellers.contact_phone                       크리에이터 연락처(숫자만 · 제조 미팅 · 발주 연락용 · 샵에 안 보인다 — 공개 grant 없음)
--   myr_invites                                 초대 기록 — 토큰은 sha256 해시만(원문은 만들 때 한 번 돌려주고 저장하지 않는다)
--   myr_app_admin_invite_create(email, by, days) 초대 발급(기본 30일 · 1~90일) → { ok, invite_id, token, email, expires_at, reissued }
--                                                · { ok:false, code: BAD_EMAIL | ALREADY_CREATOR | EMAIL_HAS_ACCOUNT }
--   myr_app_admin_invite_revoke(email)          대기 중인 초대 취소 → { ok, revoked } · { ok:false, code: BAD_EMAIL }
--   myr_app_admin_invite_list(state, limit)     초대 목록(최근순) — state = pending | used | expired | revoked | requested | null(전부)
--   myr_app_invite_view(token)                  초대 화면 → { ok, invite_id, email, expires_at } · { ok:false, code: NOT_FOUND | EXPIRED | USED | REVOKED }
--   myr_app_invite_handle_check(token, handle)  핸들 확인(가입 폼 칸을 벗어날 때) → { ok, available, code? } — code: BAD_HANDLE | RESERVED | TAKEN
--                                                · 유효한 초대가 아니면 { ok:false, code: NOT_FOUND | EXPIRED | USED | REVOKED }
--   myr_app_invite_accept(token, user, name, handle, platform, phone, terms_at)
--                                               가입 — 로그인 계정(서버가 admin API 로 먼저 만든다)을 새 sellers 행에 연결 · 초대 사용 처리 · profiles.role=seller
--                                                → { ok, seller_id, handle } · { ok:false, code: NOT_FOUND | EXPIRED | USED | REVOKED | EMAIL_MISMATCH | ALREADY_LINKED
--                                                  | INVALID_INPUT(field) | RESERVED_HANDLE | HANDLE_TAKEN | ALREADY_CREATOR }
--   myr_app_invite_request(token)               만료 화면 "새 초대 요청하기" → 그 초대에 요청 시각 기록 → { ok, email } · { ok:false, code: NOT_FOUND | USED }
--
--   핸들 규칙(형식 · 예약어)은 이 파일이 서버의 정답이다. 가입 폼(apps/myr-influencer lib/signup-rules.ts)은 같은 형식을 칸에서 먼저 보여줄 뿐이고,
--   예약어 목록은 여기에만 둔다(화면은 RESERVED 코드를 받아 문구만 고른다).
--   권한: service role 만(anon · authenticated EXECUTE 회수). 콘솔 서버가 토큰을 받아 부른다. 테스트: supabase/tests/myr_invites.test.sql. 재실행 가능.
-- ============================================================

alter table public.sellers add column if not exists contact_phone text;
alter table public.sellers drop constraint if exists sellers_contact_phone_check;
alter table public.sellers add constraint sellers_contact_phone_check check (contact_phone is null or contact_phone ~ '^01[016789][0-9]{7,8}$');
comment on column public.sellers.contact_phone is '크리에이터 연락처(숫자만) — MYR 초대 가입(0070). 샵 공개 아님 · 정산 문자용 settle_phone(0042)과 별개';

create table if not exists public.myr_invites (
  id              uuid primary key default gen_random_uuid(),
  email           text not null check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' and char_length(email) <= 254),
  token_hash      text not null unique,                       -- sha256(토큰) hex — 원문은 저장하지 않는다
  invited_by      text,                                       -- 초대한 운영자 메모(스크립트 --by · 운영 콘솔은 관리자 이름)
  expires_at      timestamptz not null,
  used_at         timestamptz,
  seller_id       uuid references public.sellers (id) on delete set null,   -- 가입으로 만들어진 크리에이터
  revoked_at      timestamptz,
  revoked_reason  text check (revoked_reason in ('reissued','canceled')),
  requested_at    timestamptz,                                -- 만료 화면 "새 초대 요청하기" 마지막 시각
  request_count   integer not null default 0 check (request_count >= 0),
  created_at      timestamptz not null default now()
);
-- 이메일당 대기 중인 초대는 하나 — 다시 초대하면 이전 것을 먼저 취소한다(myr_app_admin_invite_create)
create unique index if not exists myr_invites_pending_email_uidx on public.myr_invites (email) where used_at is null and revoked_at is null;
create index if not exists myr_invites_created_idx on public.myr_invites (created_at desc);
alter table public.myr_invites enable row level security;
revoke all on table public.myr_invites from public, anon, authenticated;
grant select, insert, update, delete on table public.myr_invites to service_role;

-- ------------------------------------------------------------
-- 핸들 정규화 · 판정(내부) — '@' 없이 소문자 · 영문 소문자 · 숫자 · . _ 2~30자 · 예약어
-- ------------------------------------------------------------
create or replace function public.myr_handle_norm(p_handle text)
returns text
language sql
immutable
set search_path = public
as $$ select lower(regexp_replace(btrim(coalesce(p_handle, '')), '^@+', '')) $$;
revoke all on function public.myr_handle_norm(text) from public, anon, authenticated;
grant execute on function public.myr_handle_norm(text) to service_role;

-- 가짜 공식 계정처럼 보이는 이름 — 정확히 같거나 myr. / myr_ / sellery. … 로 시작하면 막는다
create or replace function public.myr_handle_reserved(p_norm text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_norm = any (array['admin','administrator','official','support','help','cs','staff','team','manager','root','system',
                             'myr','sellery','makeyourrecipe','make.your.recipe','make_your_recipe','notice','info','null','undefined'])
      or p_norm ~ '^(myr|sellery)[._]'
$$;
revoke all on function public.myr_handle_reserved(text) from public, anon, authenticated;
grant execute on function public.myr_handle_reserved(text) to service_role;

-- 핸들 판정 → null(사용 가능) | BAD_HANDLE | RESERVED | TAKEN
create or replace function public.myr_handle_problem(p_handle text)
returns text
language sql
stable
security definer set search_path = public
as $$
  select case
    when public.myr_handle_norm(p_handle) !~ '^[a-z0-9._]{2,30}$' then 'BAD_HANDLE'
    when public.myr_handle_reserved(public.myr_handle_norm(p_handle)) then 'RESERVED'
    when exists (select 1 from public.sellers s where lower(s.handle) = '@' || public.myr_handle_norm(p_handle)) then 'TAKEN'
    else null
  end
$$;
revoke all on function public.myr_handle_problem(text) from public, anon, authenticated;
grant execute on function public.myr_handle_problem(text) to service_role;

-- 토큰 → 초대 행(잠금 선택) · 상태 코드. 형식이 아니면 NOT_FOUND
create or replace function public.myr_invite_state(i public.myr_invites)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when i.id is null then 'NOT_FOUND'
    when i.used_at is not null then 'USED'
    when i.revoked_at is not null then 'REVOKED'
    when i.expires_at <= now() then 'EXPIRED'
    else null
  end
$$;
revoke all on function public.myr_invite_state(public.myr_invites) from public, anon, authenticated;
grant execute on function public.myr_invite_state(public.myr_invites) to service_role;

create or replace function public.myr_invite_token_hash(p_token text)
returns text
language sql
immutable
set search_path = public
as $$ select case when coalesce(p_token, '') ~ '^[0-9a-f]{64}$' then encode(extensions.digest(p_token, 'sha256'), 'hex') else null end $$;
revoke all on function public.myr_invite_token_hash(text) from public, anon, authenticated;
grant execute on function public.myr_invite_token_hash(text) to service_role;

-- ------------------------------------------------------------
-- 운영: 발급 · 취소 · 목록
-- ------------------------------------------------------------
create or replace function public.myr_app_admin_invite_create(p_email text, p_invited_by text default null, p_days integer default 30)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_token    text := encode(extensions.gen_random_bytes(32), 'hex');
  v_reissued boolean;
  i          public.myr_invites%rowtype;
begin
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or char_length(v_email) > 254 then
    return jsonb_build_object('ok', false, 'code', 'BAD_EMAIL');
  end if;
  -- 이미 크리에이터(시드 · 연결된 계정 포함) — 초대가 아니라 myr-creators.mjs account 로 잇는다
  if exists (select 1 from public.sellers s where lower(s.email) = v_email)
     or exists (select 1 from public.sellers s join auth.users u on u.id = s.user_id where lower(u.email) = v_email) then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_CREATOR');
  end if;
  -- 같은 이메일의 로그인 계정이 이미 있다(샵 고객 · 셀러리 계정 등) — 가입이 새 계정을 만들 수 없다
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_HAS_ACCOUNT');
  end if;

  update public.myr_invites
     set revoked_at = now(), revoked_reason = 'reissued'
   where email = v_email and used_at is null and revoked_at is null;
  v_reissued := found;

  insert into public.myr_invites (email, token_hash, invited_by, expires_at)
  values (v_email, encode(extensions.digest(v_token, 'sha256'), 'hex'), nullif(btrim(coalesce(p_invited_by, '')), ''),
          now() + make_interval(days => least(greatest(coalesce(p_days, 30), 1), 90)))
  returning * into i;

  return jsonb_build_object('ok', true, 'invite_id', i.id, 'token', v_token, 'email', i.email, 'expires_at', i.expires_at, 'reissued', v_reissued);
end;
$$;
revoke all on function public.myr_app_admin_invite_create(text, text, integer) from public, anon, authenticated;
grant execute on function public.myr_app_admin_invite_create(text, text, integer) to service_role;

create or replace function public.myr_app_admin_invite_revoke(p_email text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  n       integer;
begin
  if v_email = '' then return jsonb_build_object('ok', false, 'code', 'BAD_EMAIL'); end if;
  update public.myr_invites
     set revoked_at = now(), revoked_reason = 'canceled'
   where email = v_email and used_at is null and revoked_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'revoked', n);
end;
$$;
revoke all on function public.myr_app_admin_invite_revoke(text) from public, anon, authenticated;
grant execute on function public.myr_app_admin_invite_revoke(text) to service_role;

create or replace function public.myr_app_admin_invite_list(p_state text default null, p_limit integer default 100)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(t.r order by (t.r ->> 'created_at') desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'id', i.id, 'email', i.email, 'invited_by', i.invited_by, 'created_at', i.created_at, 'expires_at', i.expires_at,
               'used_at', i.used_at, 'revoked_at', i.revoked_at, 'revoked_reason', i.revoked_reason,
               'requested_at', i.requested_at, 'request_count', i.request_count,
               'state', case when i.used_at is not null then 'used' when i.revoked_at is not null then 'revoked'
                             when i.expires_at <= now() then 'expired' else 'pending' end,
               'seller', case when s.id is null then null else jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle) end
             ) as r
        from public.myr_invites i
        left join public.sellers s on s.id = i.seller_id
       where case coalesce(p_state, '')
               when '' then true
               when 'pending' then i.used_at is null and i.revoked_at is null and i.expires_at > now()
               when 'used' then i.used_at is not null
               when 'expired' then i.used_at is null and i.revoked_at is null and i.expires_at <= now()
               when 'revoked' then i.revoked_at is not null
               -- 새 초대 요청 — 요청 뒤에 다시 초대한 적이 없는 것(같은 이메일의 더 새 초대가 없음)
               when 'requested' then i.requested_at is not null and i.used_at is null
                                 and not exists (select 1 from public.myr_invites n where n.email = i.email and n.created_at > i.created_at)
               else false
             end
       order by i.created_at desc
       limit greatest(coalesce(p_limit, 100), 1)
    ) t
$$;
revoke all on function public.myr_app_admin_invite_list(text, integer) from public, anon, authenticated;
grant execute on function public.myr_app_admin_invite_list(text, integer) to service_role;

-- ------------------------------------------------------------
-- 초대 링크(콘솔 서버가 토큰으로 부른다)
-- ------------------------------------------------------------
create or replace function public.myr_app_invite_view(p_token text)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  i      public.myr_invites%rowtype;
  v_code text;
begin
  select * into i from public.myr_invites where token_hash = public.myr_invite_token_hash(p_token);
  v_code := public.myr_invite_state(i);
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  return jsonb_build_object('ok', true, 'invite_id', i.id, 'email', i.email, 'expires_at', i.expires_at);
end;
$$;
revoke all on function public.myr_app_invite_view(text) from public, anon, authenticated;
grant execute on function public.myr_app_invite_view(text) to service_role;

create or replace function public.myr_app_invite_handle_check(p_token text, p_handle text)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  i      public.myr_invites%rowtype;
  v_code text;
begin
  -- 유효한 초대 링크를 가진 사람만 묻는다 — 핸들 목록을 긁어가지 못하게
  select * into i from public.myr_invites where token_hash = public.myr_invite_token_hash(p_token);
  v_code := public.myr_invite_state(i);
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;
  v_code := public.myr_handle_problem(p_handle);
  if v_code is null then return jsonb_build_object('ok', true, 'available', true, 'handle', public.myr_handle_norm(p_handle)); end if;
  return jsonb_build_object('ok', true, 'available', false, 'code', v_code, 'handle', public.myr_handle_norm(p_handle));
end;
$$;
revoke all on function public.myr_app_invite_handle_check(text, text) from public, anon, authenticated;
grant execute on function public.myr_app_invite_handle_check(text, text) to service_role;

create or replace function public.myr_app_invite_accept(
  p_token           text,
  p_user_id         uuid,
  p_name            text,
  p_handle          text,
  p_platform        text,
  p_phone           text,
  p_terms_agreed_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  i          public.myr_invites%rowtype;
  s          public.sellers%rowtype;
  v_code     text;
  v_email    text;
  v_name     text := btrim(coalesce(p_name, ''));
  v_handle   text := public.myr_handle_norm(p_handle);
  v_phone    text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_constraint text;
begin
  -- 1. 초대 — 같은 토큰의 동시 제출은 행 잠금으로 줄 세운다(뒤 요청은 USED)
  select * into i from public.myr_invites where token_hash = public.myr_invite_token_hash(p_token) for update;
  v_code := public.myr_invite_state(i);
  if v_code is not null then return jsonb_build_object('ok', false, 'code', v_code); end if;

  -- 2. 계정 — 서버가 초대 이메일로 방금 만든 계정이어야 한다
  select lower(u.email) into v_email from auth.users u where u.id = p_user_id;
  if v_email is null or v_email <> i.email then return jsonb_build_object('ok', false, 'code', 'EMAIL_MISMATCH'); end if;
  if exists (select 1 from public.sellers x where x.user_id = p_user_id) then return jsonb_build_object('ok', false, 'code', 'ALREADY_LINKED'); end if;
  if exists (select 1 from public.sellers x where lower(x.email) = i.email) then return jsonb_build_object('ok', false, 'code', 'ALREADY_CREATOR'); end if;

  -- 3. 입력 재검사(화면과 같은 규칙 — 서버의 정답)
  if v_name = '' or char_length(v_name) > 30 then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'name'); end if;
  if p_platform is null or p_platform not in ('instagram','youtube','tiktok') then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'platform'); end if;
  if v_phone !~ '^01[016789][0-9]{7,8}$' then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'phone'); end if;
  if p_terms_agreed_at is null then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'terms'); end if;
  v_code := public.myr_handle_problem(v_handle);
  if v_code = 'BAD_HANDLE' then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'handle'); end if;
  if v_code = 'RESERVED' then return jsonb_build_object('ok', false, 'code', 'RESERVED_HANDLE'); end if;
  if v_code = 'TAKEN' then return jsonb_build_object('ok', false, 'code', 'HANDLE_TAKEN'); end if;

  -- 4. 크리에이터 행 — 핸들 경합(선검사와 insert 사이)은 같은 코드로
  begin
    insert into public.sellers (user_id, name, handle, email, platform, followers, active, contact_phone, terms_agreed_at)
    values (p_user_id, v_name, '@' || v_handle, i.email, p_platform, 0, true, v_phone, p_terms_agreed_at)
    returning * into s;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'sellers_user_id_key' then return jsonb_build_object('ok', false, 'code', 'ALREADY_LINKED'); end if;
    if v_constraint = 'sellers_email_uidx' then return jsonb_build_object('ok', false, 'code', 'ALREADY_CREATOR'); end if;
    return jsonb_build_object('ok', false, 'code', 'HANDLE_TAKEN');
  end;

  -- 5. 초대 사용 · 역할(트리거가 만든 customer 행을 seller 로 — 없으면 만든다)
  update public.myr_invites set used_at = now(), seller_id = s.id where id = i.id;
  insert into public.profiles (id, role, email) values (p_user_id, 'seller', i.email)
  on conflict (id) do update set role = 'seller';

  return jsonb_build_object('ok', true, 'seller_id', s.id, 'handle', s.handle);
end;
$$;
revoke all on function public.myr_app_invite_accept(text, uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_invite_accept(text, uuid, text, text, text, text, timestamptz) to service_role;

create or replace function public.myr_app_invite_request(p_token text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  i public.myr_invites%rowtype;
begin
  select * into i from public.myr_invites where token_hash = public.myr_invite_token_hash(p_token) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if i.used_at is not null then return jsonb_build_object('ok', false, 'code', 'USED'); end if;
  update public.myr_invites set requested_at = now(), request_count = request_count + 1 where id = i.id;
  return jsonb_build_object('ok', true, 'email', i.email);
end;
$$;
revoke all on function public.myr_app_invite_request(text) from public, anon, authenticated;
grant execute on function public.myr_app_invite_request(text) to service_role;
