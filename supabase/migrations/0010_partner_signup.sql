-- ============================================================
-- 0010 — 파트너(인플루언서) 가입: 인증 메일 완료 즉시 `sellers` 행 생성 (수동 심사 없음)
--        seller_channels.vcode_confirmed_at · sellers.sample_address / terms_agreed_at ·
--        partner_identity_confirmed(p_user_id) · create_seller_from_signup(…) · 코드 시퀀스(sellers/seller_channels)
--
-- 근거: docs/inf-console-plan.md §4.3(시퀀스) · §4.5(함수 계약) · §4.7(채널 인증 확인) · §5.4(0010 표) — 결정 5·12.
-- 실행: 0009 이후. 재실행 가능(add column if not exists / create sequence if not exists / create or replace).
--       0001~0009 파일은 수정하지 않는다 — sellers·seller_channels 정의는 그대로 두고 컬럼·기본값·인덱스·함수만 **추가**한다.
--
-- ★ 0001 헤더(L44–46 "파트너 연결: … 관리자가 심사 승인한 신청(glo 0013 seller_applications 패턴)을 서버가 처리")의
--   **계약 개정**: 가입 심사·신청 테이블은 두지 않는다(프로토타입 login.html 의 가입 정책 그대로 — 결정 5). 인증 메일 링크를
--   누르는 요청(`/auth/confirm`)이 service role 로 `create_seller_from_signup()` 을 호출해 한 트랜잭션에서
--   sellers insert · seller_channels 1행 · profiles.role='seller' · 🥬 축하 원장 · referred_by 를 만든다.
--   "이메일 일치 자동 연결 금지" 는 그대로다 — 시드·기존 계약자 행은 오직 `p_link_id`(운영자 경로: partner-admin.mjs link/invite
--   가 service role 만 쓸 수 있는 `app_metadata.link_seller_id` 로 넘김) 로만 연결하고, 일반 가입은 항상 새 행을 만든다.
--   신원 조건은 "email_confirmed_at is not null" 에서 `partner_identity_confirmed()`(이메일 인증 **또는** 카카오 신원)로 넓혔다 —
--   지금은 이메일 계정만 오지만 나중에 카카오 버튼을 켜도 DB 는 안 바뀐다. 사칭 방어는 가입 심사가 아니라 채널 인증(§4.7)이 맡는다.
--   브랜드는 같은 헬퍼 위에 `create_brand_from_signup()` 을 새 번호로 추가한다(§9) — 이 파일은 손대지 않는다.
--
-- 설계 요점
--   · 함수는 예외 대신 {ok, code} 를 돌려준다(라우트가 `/apply?reason=<code>` 로 보낸다). 멱등: 같은 user_id 의 행이 있으면
--     {ok:true, already:true} — 링크 재클릭 · 라우트 재시도 · /apply 재진입에 안전. `active=false` 여도 already 로 끝난다(게이트가 /suspended).
--   · security definer · service_role 만 execute(public/anon/authenticated 회수). 입력은 서버가 user_metadata(또는 보완 폼)에서
--     검증한 값이고, 함수 안에서 다시 검사한다(플랫폼 enum · 활동명 · 핸들 규약).
--   · handle 은 DB 규약 `'@' || normalize`(소문자 · 앞 `@` 제거 후 `@` 1개) 로 저장한다 — 0001 컬럼 주석 · lib/campaign.ts normalizeHandle.
--   · 유니크 선검사(HANDLE_TAKEN): sellers.handle 또는 seller_channels(platform, handle) 에 이미 있으면 거절(접미 자동 부여 없음 —
--     판매 링크에 쓰이는 이름이라 본인이 고른다). 경합으로 insert 가 unique_violation 을 내도 같은 코드로 돌려준다.
--   · sellers.email 은 auth.users.email 을 복사하되 다른 행이 같은 이메일(lower)을 이미 쓰면 null 로 둔다(sellers_email_uidx —
--     시드 `*@sellery.demo` 와 같은 주소로 일반 가입한 경우; 시드 행 재활용은 운영자 초대 경로). email 은 파트너에게 비공개 정보 컬럼일 뿐
--     로그인 식별자가 아니므로 실패 코드로 만들지 않는다.
--   · vcode_confirmed_at 은 0001 의 seller_channels 공개 grant 목록(id, seller_id, platform, handle, url, followers, verified, is_primary)
--     에 넣지 않는다(서버 전용). verified=true 전환은 운영자 스크립트(partner-admin.mjs verify-channel)만 — 클라이언트 요청으로
--     verified 가 되는 경로는 없다(§4.9).
-- ============================================================

-- ------------------------------------------------------------
-- 컬럼 추가 (§5.4 0010 표)
-- ------------------------------------------------------------
-- 인플루언서가 [인증 확인] 을 누른 시각 — "인증 대기" 칩 · `partner-admin.mjs channels --pending` 기준.
-- verified=true 전환 시 vcode 는 null 로, 이 컬럼은 기록으로 유지. 핸들·플랫폼 수정 시 null (§4.7).
alter table public.seller_channels add column if not exists vcode_confirmed_at timestamptz;

-- 샘플 배송지 기본값(결제·요청 폼 프리필) — { recipient, phone, postcode, address1, address2, memo } (Shipping 과 같은 키).
-- 수령인 연락처는 여기 들어간다 — 별도 contact_phone 컬럼은 두지 않는다(가입 폼이 연락처를 받지 않는다).
alter table public.sellers add column if not exists sample_address jsonb;

-- 가입 시 약관 동의 시각(user_metadata.terms_agreed_at 스냅샷; 연결 경로는 비어 있을 때만 채움)
alter table public.sellers add column if not exists terms_agreed_at timestamptz;

-- 인증 대기 목록용 부분 인덱스
create index if not exists seller_channels_vcode_pending_idx
  on public.seller_channels (vcode_confirmed_at)
  where vcode_confirmed_at is not null and not verified;

-- ------------------------------------------------------------
-- 코드 시퀀스 — 시드 s1~s8 · ch1~ch9 와 겹치지 않게 100 부터 (campaigns/orders/cs 와 같은 관례 · 프로토타입 seq=100)
-- ------------------------------------------------------------
create sequence if not exists public.seller_code_seq start 100;
create sequence if not exists public.seller_channel_code_seq start 100;
alter table public.sellers         alter column code set default ('s'  || nextval('public.seller_code_seq'));
alter table public.seller_channels alter column code set default ('ch' || nextval('public.seller_channel_code_seq'));

-- ------------------------------------------------------------
-- partner_random_code(prefix, len) — 'SLRY-XXXX' 형 코드 (추천 코드 ref_code 발급용 · 채널 인증 코드는 서버 액션이 같은 알파벳으로 생성)
--   알파벳에서 0/O · 1/I 를 뺐다(사람이 옮겨 적는 코드). 보안 토큰이 아니라 random() 으로 충분하다 — 인증 확인은 코드 존재를
--   운영자가 실제 프로필·DM 에서 대조하는 것이지 코드 자체가 권한이 아니다.
-- ------------------------------------------------------------
create or replace function public.partner_random_code(p_prefix text default 'SLRY-', p_len integer default 4)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_out text := '';
  i integer;
begin
  for i in 1..greatest(p_len, 1) loop
    v_out := v_out || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
  end loop;
  return coalesce(p_prefix, '') || v_out;
end;
$$;
revoke all on function public.partner_random_code(text, integer) from public, anon, authenticated;
grant execute on function public.partner_random_code(text, integer) to service_role;

-- ------------------------------------------------------------
-- partner_identity_confirmed(p_user_id) — 신원 확인 헬퍼 (§4.5 2단계, 역할 중립 — 브랜드 생성 함수가 그대로 공유)
--   auth.users.email_confirmed_at is not null  **또는**  auth.identities 에 provider='kakao' 가 있으면 true.
--   auth.users 에 없는 uuid 는 false (호출 측 코드 NOT_CONFIRMED 로 통일).
-- ------------------------------------------------------------
create or replace function public.partner_identity_confirmed(p_user_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select p_user_id is not null and (
    exists (select 1 from auth.users u where u.id = p_user_id and u.email_confirmed_at is not null)
    or exists (select 1 from auth.identities i where i.user_id = p_user_id and i.provider = 'kakao')
  )
$$;
revoke all on function public.partner_identity_confirmed(uuid) from public, anon, authenticated;
grant execute on function public.partner_identity_confirmed(uuid) to service_role;

-- ------------------------------------------------------------
-- create_seller_from_signup(user_id, name, platform, handle, referral_code, terms_agreed_at, link_id) — 가입 생성 (§4.5 · 한 트랜잭션 · 멱등)
--   호출자: /auth/confirm · /auth/callback 라우트, /apply 의 completeSignup 액션(lib/partner/signup.ts createSellerFromSignup),
--          web/scripts/{partner-admin,dev-seller}.mjs (p_link_id 경로). 전부 service role.
--   반환:
--     { ok:true,  already:true,  seller_id, code }              같은 user_id 의 행이 이미 있음(active 여부 무관)
--     { ok:true,  seller_id, code, linked:false }               일반 가입 — 새 행 + 채널 1행 + profiles.role + 🥬 축하 + referred_by
--     { ok:true,  seller_id, code, linked:true }                p_link_id 경로 — 기존 행에 user_id 연결(채널·축하 🥬 는 없을 때만)
--     { ok:false, code:'NOT_CONFIRMED' }                        partner_identity_confirmed() 실패(auth.users 에 없는 uuid 포함)
--     { ok:false, code:'INVALID_INPUT', field }                 플랫폼 enum 밖 · 활동명 비었거나 30자 초과 · 핸들 규약 위반 (일반 가입만)
--     { ok:false, code:'HANDLE_TAKEN' }                         sellers.handle 또는 seller_channels(platform, handle) 이미 사용 (일반 가입만)
--     { ok:false, code:'LINK_TARGET_NOT_FOUND' }                p_link_id 의 sellers 행 없음
--     { ok:false, code:'LINK_TARGET_TAKEN' }                    p_link_id 행의 user_id 가 이미 다른 계정
--   p_link_id 가 있으면 name/platform/handle 은 기존 행 값을 유지하고 입력값은 검사하지 않는다(초대 계정의 user_metadata 는
--   partner_role 만 있을 수 있다). email·terms_agreed_at 은 비어 있을 때만 채운다. `user_metadata` 의 값은 절대 p_link_id 로 넘기지
--   않는다(service role 만 쓸 수 있는 app_metadata.link_seller_id 또는 스크립트 인자만 — §4.2 · §4.7).
--   p_referral_code 가 sellers.ref_code 와 일치하면(본인 제외) referred_by 세팅 — 불일치·빈 값은 무시(실패 아님, 프로토타입 fJoin 과 동일).
-- ------------------------------------------------------------
create or replace function public.create_seller_from_signup(
  p_user_id         uuid,
  p_name            text,
  p_platform        text,
  p_handle          text,
  p_referral_code   text default null,
  p_terms_agreed_at timestamptz default now(),
  p_link_id         uuid default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  s            public.sellers%rowtype;
  v_email      text;
  v_name       text;
  v_handle     text;   -- '@' 포함 저장 규약
  v_ref_code   text;
  v_referrer   uuid;
  v_bonus      integer;
  v_constraint text;
  i            integer;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_CONFIRMED');
  end if;

  -- 1. 멱등 — 이미 연결된 행이 있으면 끝 (active=false 여도 여기서 끝: 게이트가 /suspended 로 보낸다)
  select * into s from public.sellers where user_id = p_user_id;
  if found then
    return jsonb_build_object('ok', true, 'already', true, 'seller_id', s.id, 'code', s.code);
  end if;

  -- 2. 신원 확인 (계약 개정 — 이메일 인증 또는 카카오 신원)
  if not public.partner_identity_confirmed(p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_CONFIRMED');
  end if;

  -- auth 이메일 — 다른 행이 같은 주소(lower)를 이미 쓰면 null (sellers_email_uidx)
  select lower(u.email) into v_email from auth.users u where u.id = p_user_id;
  if v_email is not null and exists (select 1 from public.sellers x where lower(x.email) = v_email) then
    v_email := null;
  end if;

  if p_link_id is not null then
    -- 5. 연결 경로 (시드 인플루언서 · 기존 오프라인 계약자) — 이메일 자동 매칭은 하지 않는다
    select * into s from public.sellers where id = p_link_id for update;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'LINK_TARGET_NOT_FOUND');
    end if;
    if s.user_id is not null then
      return jsonb_build_object('ok', false, 'code', 'LINK_TARGET_TAKEN');
    end if;

    update public.sellers
       set user_id         = p_user_id,
           email           = coalesce(email, v_email),
           terms_agreed_at = coalesce(terms_agreed_at, p_terms_agreed_at)
     where id = s.id
     returning * into s;

    -- 6′. primary 채널이 없을 때만 1행 (부분 유니크 seller_channels_primary_uidx 에 걸려 RPC 전체가 실패하지 않게)
    if not exists (select 1 from public.seller_channels c where c.seller_id = s.id and c.is_primary) then
      insert into public.seller_channels (seller_id, platform, handle, url, followers, verified, is_primary, vcode, vcode_confirmed_at)
      values (s.id, s.platform, s.handle, null, s.followers, false, true, null, null);
    end if;
  else
    -- 3. 입력 재검사 (일반 가입)
    v_name := btrim(coalesce(p_name, ''));
    if v_name = '' or char_length(v_name) > 30 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'name');
    end if;
    if p_platform is null or p_platform not in ('instagram','youtube','naver','tiktok') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'platform');
    end if;
    v_handle := lower(regexp_replace(btrim(coalesce(p_handle, '')), '^@+', ''));
    if v_handle !~ '^[a-z0-9._]{2,30}$' then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'handle');
    end if;
    v_handle := '@' || v_handle;

    -- 4. 유니크 선검사 — 접미 자동 부여 없음 (판매 링크에 쓰이는 이름이라 본인이 고른다)
    if exists (select 1 from public.sellers x where lower(x.handle) = v_handle)
       or exists (select 1 from public.seller_channels c where c.platform = p_platform and lower(c.handle) = v_handle) then
      return jsonb_build_object('ok', false, 'code', 'HANDLE_TAKEN');
    end if;

    -- 추천 코드(ref_code) 발급 — 유니크 확인 후 사용 (20회 시도)
    for i in 1..20 loop
      v_ref_code := public.partner_random_code('SLRY-', 4);
      exit when not exists (select 1 from public.sellers x where x.ref_code = v_ref_code);
      v_ref_code := null;
    end loop;

    begin
      insert into public.sellers (user_id, name, handle, email, platform, followers, active, ref_code, terms_agreed_at)
      values (p_user_id, v_name, v_handle, v_email, p_platform, 0, true, v_ref_code, p_terms_agreed_at)
      returning * into s;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'sellers_user_id_key' then
        -- 같은 계정의 동시 요청이 먼저 만들었다 → 멱등
        select * into s from public.sellers where user_id = p_user_id;
        return jsonb_build_object('ok', true, 'already', true, 'seller_id', s.id, 'code', s.code);
      elsif v_constraint = 'sellers_ref_code_key' then
        -- 추천 코드 경합 — 호출자가 재시도 (극히 드묾)
        return jsonb_build_object('ok', false, 'code', 'RETRY');
      else
        -- sellers_handle_key(핸들 경합) · 그 외 → 핸들 충돌로 취급 (이메일은 위에서 미리 null 처리)
        return jsonb_build_object('ok', false, 'code', 'HANDLE_TAKEN');
      end if;
    end;

    -- 6. 첫 채널 1행 (is_primary · verified=false) — 가입 직후 "지금 할 일" 첫 장이 이 채널의 인증
    begin
      insert into public.seller_channels (seller_id, platform, handle, url, followers, verified, is_primary, vcode, vcode_confirmed_at)
      values (s.id, p_platform, v_handle, null, 0, false, true, null, null);
    exception when unique_violation then
      -- (platform, handle) 경합 — 위 선검사와 insert 사이에 다른 인플루언서가 같은 채널을 만들었다 → 트랜잭션 전체를 되돌린다
      raise exception 'HANDLE_TAKEN' using errcode = 'unique_violation';
    end;
  end if;

  -- 7. profiles.role = 'seller' (트리거가 만든 customer 행을 승격 — 행이 없으면 만든다)
  insert into public.profiles (id, role, email)
  values (p_user_id, 'seller', v_email)
  on conflict (id) do update set role = 'seller';

  -- 8. 🥬 가입 축하 (platform_settings.signup_bonus_cel, 없으면 3) — 연결 경로는 같은 seller 에 signup_bonus 가 없을 때만
  if not exists (select 1 from public.celery_ledger l where l.seller_id = s.id and l.reason = 'signup_bonus') then
    select coalesce((ps.value #>> '{}')::integer, 3) into v_bonus from public.platform_settings ps where ps.key = 'signup_bonus_cel';
    v_bonus := coalesce(v_bonus, 3);
    if v_bonus > 0 then
      insert into public.celery_ledger (owner_type, seller_id, delta, reason, memo, ref_type, ref_id)
      values ('seller', s.id, v_bonus, 'signup_bonus', '가입 축하 지급', 'seller', s.id);
    end if;
  end if;

  -- 9. 추천 코드 → referred_by (본인 제외 · 이미 있으면 유지 · 불일치는 무시)
  if s.referred_by is null and nullif(btrim(coalesce(p_referral_code, '')), '') is not null then
    select x.id into v_referrer
      from public.sellers x
     where x.ref_code = upper(btrim(p_referral_code)) and x.id <> s.id
     limit 1;
    if v_referrer is not null then
      update public.sellers set referred_by = v_referrer where id = s.id;
    end if;
  end if;

  -- 10.
  return jsonb_build_object('ok', true, 'seller_id', s.id, 'code', s.code, 'linked', p_link_id is not null);
exception when unique_violation then
  -- 6 의 raise(채널 경합) — 부분 insert 는 함수 예외로 함께 롤백된다
  return jsonb_build_object('ok', false, 'code', 'HANDLE_TAKEN');
end;
$$;
revoke all on function public.create_seller_from_signup(uuid, text, text, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.create_seller_from_signup(uuid, text, text, text, text, timestamptz, uuid) to service_role;
