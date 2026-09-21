-- ============================================================
-- 0014 — 브랜드 가입: 인증 메일 완료 즉시 `brands` 행 생성 (수동 심사 없음)
--        brands.manager_phone · brands.terms_agreed_at · brand_code_seq(코드 기본값) · create_brand_from_signup(…)
--
-- 근거: docs/brand-console-plan.md §0 결정 4·5·15 · §3(함수 계약 · 시퀀스 다이어그램) · §4 "0014 1단계" — 인플루언서 0010 의 브랜드 판.
-- 실행: 0013 이후. 재실행 가능(add column if not exists / create sequence if not exists / create or replace).
--       0001~0013 파일은 수정하지 않는다 — brands 정의(0001)는 그대로 두고 컬럼·기본값·함수만 **추가**한다.
--
-- ★ 계약: 가입 심사 · 신청 테이블 · `/pending` 화면은 두지 않는다(결정 4). 사업자 확인은 가입이 아니라 **상품 `pending` 검수 게이트**
--   (0002 `products.status` 기본값 `'pending'` · 관리자만 `listed`)와 정산 정보(계좌 · 사업자등록증, `settlements.hold_brand`)가 맡는다 —
--   돈이 움직이기 전에 두 게이트가 이미 있다. 사업자등록번호 **진위확인 API 는 후속**(§8) — 여기서는 형식(숫자 10자리)만.
--   신원 조건은 0010 의 `partner_identity_confirmed()`(이메일 인증 또는 카카오 신원)를 그대로 공유한다.
--   "이메일 일치 자동 연결 금지" 는 그대로 — 시드 b1·b2(`user_id null`, seed.sql:97)는 오직 `p_link_id`(운영자 경로:
--   partner-admin.mjs link-brand/invite-brand · dev-brand.mjs 가 service role 만 쓸 수 있는 `app_metadata.link_brand_id` 로 넘김)로만 연결한다.
--
-- 설계 요점 (0010 create_seller_from_signup 과 같은 구조 — 다른 점만)
--   · 유니크 선검사: `brands_biz_no_uidx`(0001) → BIZ_NO_TAKEN, `brands_email_uidx`(lower(email)) → EMAIL_TAKEN.
--     인플루언서는 이메일 충돌을 null 로 흡수하지만 브랜드는 이메일이 자연 키(0001 주석 "lower(email) 유니크")라 실패 코드로 돌려준다(§3).
--     핸들에 해당하는 것은 없다(브랜드 판매 링크는 인플루언서 핸들 기준).
--   · biz_no 는 숫자만 남긴 뒤 10자리 확인 → `000-00-00000` 로 정규화해 저장(@sellery/db partner/settle-rules normalizeBizNo 와 동일).
--   · 카테고리는 0001 check(`'건강기능식품'`,`'이너뷰티'`) 와 같은 값만(INVALID_INPUT field 'category').
--   · 담당자 연락처는 `^0\d{1,2}-?\d{3,4}-?\d{4}$` 형식만 · 하이픈 표기로 정규화(02-XXX(X)-XXXX · 0NN-XXX(X)-XXXX).
--   · 코드는 `'b' || nextval('brand_code_seq')`(100 부터 — 시드 b1·b2 와 겹치지 않게, 0010 seller_code_seq 와 같은 관례).
--   · 추천 코드 발급 `SLRB-XXXX`(0010 partner_random_code) · grade '스타터' · 🥬 입점 이벤트 = platform_settings.onboarding_bonus_cel(없으면 5)
--     — 연결 경로는 같은 brand 에 onboarding_bonus 가 없을 때만(시드 b1·b2 에는 이미 있다, seed.sql:273·275).
--   · p_referral_code 가 다른 브랜드의 ref_code 와 일치하면 referred_by(예 'VYNE-01') — 불일치·빈 값은 무시(프로토타입 fJoin 과 동일).
--   · 함수는 예외 대신 {ok, code} 를 돌려준다(라우트가 `/brand/apply?reason=<code>` 로 보낸다). 멱등: 같은 user_id 의 행이 있으면
--     {ok:true, already:true} — 링크 재클릭 · 라우트 재시도 · /apply 재진입에 안전. `active=false` 여도 already(게이트가 /suspended).
--   · security definer · service_role 만 execute(public/anon/authenticated 회수 — 0007 관례).
-- ============================================================

-- ------------------------------------------------------------
-- 컬럼 추가 (§4 0014 표)
-- ------------------------------------------------------------
-- 담당자 연락처 — 가입 폼 값. 파트너에게 비공개(0001 의 brands 공개 grant 목록에 넣지 않는다 — 서비스 롤만 읽는다).
alter table public.brands add column if not exists manager_phone text;

-- 가입 시 약관 동의 시각(user_metadata.terms_agreed_at 스냅샷; 연결 경로는 비어 있을 때만 채움) — sellers.terms_agreed_at(0010) 과 짝
alter table public.brands add column if not exists terms_agreed_at timestamptz;

-- ------------------------------------------------------------
-- 코드 시퀀스 — 시드 b1·b2 와 겹치지 않게 100 부터 (0010 seller_code_seq 와 같은 방식)
-- ------------------------------------------------------------
create sequence if not exists public.brand_code_seq start 100;
alter table public.brands alter column code set default ('b' || nextval('public.brand_code_seq'));

-- ------------------------------------------------------------
-- create_brand_from_signup(user_id, name, biz_no, manager_name, manager_phone, category, referral_code, terms_agreed_at, link_id)
--   가입 생성 (§3 · 한 트랜잭션 · 멱등). 호출자: apps/brand `/brand/auth/confirm` · `/brand/apply`(재시도 + form action) ·
--   packages/db/scripts/{partner-admin(link-brand · invite-brand),dev-brand}.mjs (p_link_id 경로). 전부 service role.
--   반환:
--     { ok:true,  already:true,  brand_id, code }               같은 user_id 의 행이 이미 있음(active 여부 무관)
--     { ok:true,  brand_id, code, linked:false }                일반 가입 — 새 행 + profiles.role + 🥬 입점 이벤트 + referred_by
--     { ok:true,  brand_id, code, linked:true }                 p_link_id 경로 — 기존 행에 user_id 연결(🥬 는 없을 때만)
--     { ok:false, code:'NOT_CONFIRMED' }                        partner_identity_confirmed() 실패(auth.users 에 없는 uuid 포함)
--     { ok:false, code:'INVALID_INPUT', field }                 name(1~40자) · biz_no(숫자 10자리) · manager_name(1~30자) · manager_phone(형식) · category(enum) (일반 가입만)
--     { ok:false, code:'BIZ_NO_TAKEN' }                         brands.biz_no 이미 사용 (일반 가입만 — 자동 병합 없음, 고객센터 안내)
--     { ok:false, code:'EMAIL_TAKEN' }                          다른 brands 행이 같은 이메일(lower) 사용 (일반 가입만)
--     { ok:false, code:'LINK_TARGET_NOT_FOUND' }                p_link_id 의 brands 행 없음
--     { ok:false, code:'LINK_TARGET_TAKEN' }                    p_link_id 행의 user_id 가 이미 다른 계정
--     { ok:false, code:'RETRY' }                                추천 코드 경합(극히 드묾) — 호출자 재시도
--   p_link_id 가 있으면 name/biz_no/category/manager 는 기존 행 값을 유지하고 입력값은 검사하지 않는다(초대 계정의 user_metadata 는
--   partner_role 만 있을 수 있다). email · terms_agreed_at · manager_phone 은 비어 있을 때만 채운다.
-- ------------------------------------------------------------
create or replace function public.create_brand_from_signup(
  p_user_id         uuid,
  p_name            text,
  p_biz_no          text,
  p_manager_name    text,
  p_manager_phone   text,
  p_category        text,
  p_referral_code   text default null,
  p_terms_agreed_at timestamptz default now(),
  p_link_id         uuid default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  b            public.brands%rowtype;
  v_email      text;
  v_name       text;
  v_biz_digits text;
  v_biz_no     text;   -- '000-00-00000' 저장 규약
  v_manager    text;
  v_phone_raw  text;
  v_phone_d    text;
  v_phone      text;   -- 하이픈 표기
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
  select * into b from public.brands where user_id = p_user_id;
  if found then
    return jsonb_build_object('ok', true, 'already', true, 'brand_id', b.id, 'code', b.code);
  end if;

  -- 2. 신원 확인 (0010 헬퍼 공유 — 이메일 인증 또는 카카오 신원)
  if not public.partner_identity_confirmed(p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_CONFIRMED');
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = p_user_id;

  -- 담당자 연락처 정규화 (연결 경로에서도 비어 있을 때 채우므로 먼저)
  v_phone_raw := btrim(coalesce(p_manager_phone, ''));
  v_phone := null;
  if v_phone_raw ~ '^0\d{1,2}-?\d{3,4}-?\d{4}$' then
    v_phone_d := regexp_replace(v_phone_raw, '\D', '', 'g');
    if left(v_phone_d, 2) = '02' then
      v_phone := '02-' || left(substr(v_phone_d, 3), length(v_phone_d) - 6) || '-' || right(v_phone_d, 4);
    else
      v_phone := left(v_phone_d, 3) || '-' || left(substr(v_phone_d, 4), length(v_phone_d) - 7) || '-' || right(v_phone_d, 4);
    end if;
  end if;

  if p_link_id is not null then
    -- 5. 연결 경로 (시드 브랜드 · 기존 오프라인 계약사) — 이메일 자동 매칭은 하지 않는다
    select * into b from public.brands where id = p_link_id for update;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'LINK_TARGET_NOT_FOUND');
    end if;
    if b.user_id is not null then
      return jsonb_build_object('ok', false, 'code', 'LINK_TARGET_TAKEN');
    end if;

    update public.brands
       set user_id         = p_user_id,
           email           = coalesce(email, case when v_email is not null and not exists (select 1 from public.brands x where lower(x.email) = v_email) then v_email end),
           manager_phone   = coalesce(manager_phone, v_phone),
           terms_agreed_at = coalesce(terms_agreed_at, p_terms_agreed_at)
     where id = b.id
     returning * into b;
  else
    -- 3. 입력 재검사 (일반 가입)
    v_name := btrim(coalesce(p_name, ''));
    if v_name = '' or char_length(v_name) > 40 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'name');
    end if;
    v_biz_digits := regexp_replace(coalesce(p_biz_no, ''), '\D', '', 'g');
    if v_biz_digits !~ '^\d{10}$' then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'biz_no');
    end if;
    v_biz_no := left(v_biz_digits, 3) || '-' || substr(v_biz_digits, 4, 2) || '-' || right(v_biz_digits, 5);
    v_manager := btrim(coalesce(p_manager_name, ''));
    if v_manager = '' or char_length(v_manager) > 30 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'manager_name');
    end if;
    if v_phone is null then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'manager_phone');
    end if;
    if p_category is null or p_category not in ('건강기능식품', '이너뷰티') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'category');
    end if;

    -- 4. 유니크 선검사 — 사업자번호(자연 키) · 이메일(자연 키). 자동 병합 없음.
    if exists (select 1 from public.brands x where x.biz_no = v_biz_no) then
      return jsonb_build_object('ok', false, 'code', 'BIZ_NO_TAKEN');
    end if;
    if v_email is not null and exists (select 1 from public.brands x where lower(x.email) = v_email) then
      return jsonb_build_object('ok', false, 'code', 'EMAIL_TAKEN');
    end if;

    -- 추천 코드(ref_code) 발급 — 유니크 확인 후 사용 (20회 시도)
    for i in 1..20 loop
      v_ref_code := public.partner_random_code('SLRB-', 4);
      exit when not exists (select 1 from public.brands x where x.ref_code = v_ref_code);
      v_ref_code := null;
    end loop;

    begin
      insert into public.brands (user_id, name, category, manager_name, manager_phone, email, biz_no, grade, active, ref_code, terms_agreed_at)
      values (p_user_id, v_name, p_category, v_manager, v_phone, v_email, v_biz_no, '스타터', true, v_ref_code, p_terms_agreed_at)
      returning * into b;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'brands_user_id_key' then
        -- 같은 계정의 동시 요청이 먼저 만들었다 → 멱등
        select * into b from public.brands where user_id = p_user_id;
        return jsonb_build_object('ok', true, 'already', true, 'brand_id', b.id, 'code', b.code);
      elsif v_constraint = 'brands_ref_code_key' then
        return jsonb_build_object('ok', false, 'code', 'RETRY');
      elsif v_constraint = 'brands_email_uidx' then
        return jsonb_build_object('ok', false, 'code', 'EMAIL_TAKEN');
      else
        -- brands_biz_no_uidx(사업자번호 경합) · 그 외 → 사업자번호 충돌로 취급
        return jsonb_build_object('ok', false, 'code', 'BIZ_NO_TAKEN');
      end if;
    end;
  end if;

  -- 7. profiles.role = 'brand' (트리거가 만든 customer 행을 승격 — 행이 없으면 만든다)
  insert into public.profiles (id, role, email)
  values (p_user_id, 'brand', v_email)
  on conflict (id) do update set role = 'brand';

  -- 8. 🥬 입점 이벤트 (platform_settings.onboarding_bonus_cel, 없으면 5) — 연결 경로는 같은 brand 에 onboarding_bonus 가 없을 때만
  if not exists (select 1 from public.celery_ledger l where l.brand_id = b.id and l.reason = 'onboarding_bonus') then
    select coalesce((ps.value #>> '{}')::integer, 5) into v_bonus from public.platform_settings ps where ps.key = 'onboarding_bonus_cel';
    v_bonus := coalesce(v_bonus, 5);
    if v_bonus > 0 then
      insert into public.celery_ledger (owner_type, brand_id, delta, reason, memo, ref_type, ref_id)
      values ('brand', b.id, v_bonus, 'onboarding_bonus', '입점 이벤트 지급', 'brand', b.id);
    end if;
  end if;

  -- 9. 추천 코드 → referred_by (본인 제외 · 이미 있으면 유지 · 불일치는 무시)
  if b.referred_by is null and nullif(btrim(coalesce(p_referral_code, '')), '') is not null then
    select x.id into v_referrer
      from public.brands x
     where x.ref_code = upper(btrim(p_referral_code)) and x.id <> b.id
     limit 1;
    if v_referrer is not null then
      update public.brands set referred_by = v_referrer where id = b.id;
    end if;
  end if;

  -- 10.
  return jsonb_build_object('ok', true, 'brand_id', b.id, 'code', b.code, 'linked', p_link_id is not null);
end;
$$;
revoke all on function public.create_brand_from_signup(uuid, text, text, text, text, text, text, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.create_brand_from_signup(uuid, text, text, text, text, text, text, timestamptz, uuid) to service_role;
