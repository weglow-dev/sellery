-- ============================================================
-- 0121 · MYR 사업자 · 정산 정보에 토스 지급대행 준비 칸 — 대표자 휴대폰 · 토스페이먼츠 제3자 제공 동의 · 개인사업자/법인 (2026-11-18)
--
--   지급대행 = 토스페이먼츠 v2(2026-11-18 결정 · docs/myr-admin-screens.md §5-3 · §11). 크리에이터마다 토스 셀러로 등록해야 지급된다.
--     - 토스는 셀러 등록 때 company.phone(대표자 번호)로 본인인증 문자를 보낸다 — 가입 03 연락처(제조 미팅 · 발주용)와 다를 수 있어 따로 받는다.
--       칸은 셀러리 0042 의 sellers.settle_phone(토스 본인인증 문자 번호)을 그대로 쓴다(0085 가 tax_info · bank_info 를 쓴 것과 같은 방식).
--     - 이름 · 대표자 휴대폰 · 사업자번호 · 계좌를 토스페이먼츠에 넘기므로 제3자 제공 동의를 받는다 — sellers.myr_toss_agreed_at(처음 동의한 시각).
--     - 토스 businessType — 사업자등록번호 가운데 두 자리 80~89 = 법인(CORPORATE · 본인인증 없음) · 그 밖 = 개인사업자(INDIVIDUAL_BUSINESS · 문자 본인인증)
--       → myr_biz_kind. 화면(가입 토스 단계를 건너뛸지) · 다음 단계 셀러 등록 본문이 이 값 하나를 읽는다.
--   토스 셀러 등록 · 상태 동기화(웹훅 seller.changed) · 지급 보류 이유 "토스 본인인증 전"은 다음 단계(셀러리 0042 의 toss_seller_* 칸을 쓴다).
--
--   myr_digits(text)             숫자만 남기기(하이픈 · 공백 등 빼기 · null 은 null) — 전화번호 · 사업자번호 · 계좌번호. '\D' · '[^0-9]' 두 모양을 '[^0-9]'(ASCII 숫자만) 하나로
--                                0121 안 함수 + 같은 식을 쓰던 myr_biz_no_valid(0085) · myr_app_guest_order_lookup · myr_refund_request_json 도 이 함수로(결과 그대로)
--   myr_mobile_ok(text)          휴대폰 번호 형식(숫자만 01x + 7~8자리) — 가입 연락처(0070 myr_app_invite_accept · 표 제약 sellers_contact_phone_check)와 대표자 휴대폰이 같이 쓴다
--   myr_biz_kind(text)           'corporate' · 'individual' · 사업자번호가 아니면(myr_biz_no_valid) null
--   myr_app_seller_settle_info_save(user, company, ceo, biz_no, bank, account, holder, ceo_phone, toss_agreed)
--       새 거부: BAD_CEO_PHONE · TOSS_CONSENT_REQUIRED(처음 저장 때 · 이미 동의했으면 다시 묻지 않는다)
--       대표자 휴대폰만 바꾸면 운영 확인 상태 그대로(운영이 확인하는 칸이 아니다 · 토스가 본인인증으로 확인한다)
--       응답 toss_action — 저장 뒤 토스 셀러에 할 일(2026-11-18 결정 · 앱은 이 값만 읽는다):
--         register  (다시) 등록 → 새로 본인인증: 토스 등록 전 · 토스가 거절 · 사업자번호가 바뀜(다른 사업자) · 대표자가 바뀜(인증받은 적 없는 사람)
--                   · 본인인증 전에 대표자 휴대폰을 고침(새 번호로 문자)
--         update    셀러 수정 → 인증 그대로: 인증 뒤 대표자 휴대폰 · 계좌 · 상호 · 은행 · 예금주(사람은 같다 — 계좌는 토스가 수정 때 다시 검증하고 운영 재확인(recheck)까지 지급 보류)
--         null      토스가 가진 칸이 그대로
--   myr_settle_info_json          ceo_phone · toss_agreed · biz_kind · toss_state · toss_fix 를 더한다
--   myr_has_biz_no(text)         사업자번호가 들어 있나(숫자 10자리) — 응답 has_biz_no · 가린 번호 · 토스 카드 상태가 같이 쓴다
--   myr_toss_card_state(seller)   내 정보 "토스 본인인증" 카드 상태 — 셀러리 0042 칸(toss_seller_status · toss_seller_error)을 읽는다
--       none 시작 전 · rejected 토스가 정보 거절 · wait 본인인증 전 · partial 인증 완료(한 주 1천만 원 미만) · kyc 추가 인증 · approved 한도 없음 · corporate 법인
--   myr_app_seller_toss_sync(seller, status, error)   토스 셀러 상태 적기 — 연동 뒤 등록 결과 · 웹훅 seller.changed 가 부른다.
--       연동 전에는 크리에이터 콘솔의 가짜 토스(개발 서버 · Vercel Preview 만 · lib/server/toss-sim.ts)가 부른다. 거부: NOT_FOUND · BAD_STATUS
--   권한: 전부 service role 만. 테스트: supabase/tests/myr_settle_toss_prep.test.sql · myr_settle_info.test.sql · myr_invites.test.sql
-- ============================================================

alter table public.sellers add column if not exists myr_toss_agreed_at timestamptz;
comment on column public.sellers.myr_toss_agreed_at is 'MYR 토스페이먼츠 지급대행 개인정보 제3자 제공 동의 시각(처음) — 0121';

create or replace function public.myr_digits(p text)
returns text language sql immutable as $$ select regexp_replace(p, '[^0-9]', '', 'g') $$;
revoke all on function public.myr_digits(text) from public, anon, authenticated;

create or replace function public.myr_mobile_ok(p text)
returns boolean language sql immutable as $$ select coalesce(p ~ '^01[016789][0-9]{7,8}$', false) $$;
revoke all on function public.myr_mobile_ok(text) from public, anon, authenticated;
-- 0070 표 제약도 같은 함수로(같은 정규식을 표에 따로 두지 않는다)
alter table public.sellers drop constraint if exists sellers_contact_phone_check;
alter table public.sellers add constraint sellers_contact_phone_check check (contact_phone is null or public.myr_mobile_ok(contact_phone));

-- 사업자등록번호 가운데 두 자리(개인 · 법인 구분 코드) — 80~89 법인 · 비영리 · 단체 = 토스 CORPORATE
create or replace function public.myr_biz_kind(p_biz_no text)
returns text language sql immutable as $$
  -- 형식은 기존 체크섬 함수(myr_biz_no_valid)로 — 하이픈은 빼고 본다
  select case when not public.myr_biz_no_valid(p_biz_no) then null
              when substr(public.myr_digits(p_biz_no), 4, 2)::int between 80 and 89 then 'corporate'
              else 'individual' end
$$;
revoke all on function public.myr_biz_kind(text) from public, anon, authenticated;
grant execute on function public.myr_biz_kind(text) to service_role; -- 가입 미리보기(저장 없음)가 토스 단계를 고를 때 부른다

-- 가입 연락처 형식 — 0070 본문 그대로, 형식 검사만 myr_mobile_ok 로
create or replace function public.myr_app_invite_accept(p_token text, p_user_id uuid, p_name text, p_handle text, p_platform text, p_phone text, p_terms_agreed_at timestamp with time zone)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  i          public.myr_invites%rowtype;
  s          public.sellers%rowtype;
  v_code     text;
  v_email    text;
  v_name     text := btrim(coalesce(p_name, ''));
  v_handle   text := public.myr_handle_norm(p_handle);
  v_phone    text := public.myr_digits(coalesce(p_phone, ''));
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
  if not public.myr_mobile_ok(v_phone) then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'phone'); end if;
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
revoke all on function public.myr_app_invite_accept(text, uuid, text, text, text, text, timestamp with time zone) from public, anon, authenticated;

-- 사업자번호가 들어 있나 — 응답(가린 번호 · has_biz_no)과 토스 카드 상태가 같은 함수를 쓴다
create or replace function public.myr_has_biz_no(p_biz_no text)
returns boolean language sql immutable as $$ select coalesce(p_biz_no ~ '^\d{10}$', false) $$;
revoke all on function public.myr_has_biz_no(text) from public, anon, authenticated;

-- 내 정보 "토스 본인인증" 카드 상태 — 정보 미입력 → 거절 → 토스 셀러 상태(법인은 본인인증 없이 PARTIALLY_APPROVED)
create or replace function public.myr_toss_card_state(s public.sellers)
returns text language sql stable set search_path = public as $$
  select case when not public.myr_has_biz_no(s.biz_no) then 'none'
              when s.toss_seller_error is not null then 'rejected'
              when s.toss_seller_status = 'APPROVAL_REQUIRED' then 'wait'
              when s.toss_seller_status = 'KYC_REQUIRED' then 'kyc'
              when s.toss_seller_status = 'APPROVED' then 'approved'
              when s.toss_seller_status = 'PARTIALLY_APPROVED' then case when public.myr_biz_kind(s.biz_no) = 'corporate' then 'corporate' else 'partial' end
              else 'none' end
$$;
revoke all on function public.myr_toss_card_state(public.sellers) from public, anon, authenticated;

-- 응답 — 0116 본문 + 대표자 휴대폰 · 토스 동의 · 개인사업자/법인 · 토스 카드 상태
create or replace function public.myr_settle_info_json(s public.sellers)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select jsonb_build_object(
    'company', s.tax_info ->> 'company',
    'ceo', s.tax_info ->> 'ceo',
    'biz_no_masked', case when public.myr_has_biz_no(s.biz_no) then '***-**-' || right(s.biz_no, 5) end,
    'has_biz_no', public.myr_has_biz_no(s.biz_no),
    'bank', s.bank_info ->> 'bank',
    'holder', s.bank_info ->> 'holder',
    'account_masked', public.myr_mask_account(s.bank_info ->> 'account'),
    'has_account', public.myr_mask_account(s.bank_info ->> 'account') is not null,
    'tax_email', coalesce(s.email, (select u.email from auth.users u where u.id = s.user_id)),
    'status', s.myr_settle_status,
    'note', case when s.myr_settle_status = 'rejected' then s.myr_settle_note end,
    'submitted_at', s.myr_settle_submitted_at,
    'checked_at', s.myr_settle_checked_at,
    -- 0116: 다음 정산 보류 이유(정산 탭 next_hold 와 같은 함수) — 홈 배너가 입력 상태로 다시 판정하지 않는다
    'hold', public.myr_seller_next_hold_json(s.id),
    -- 0121: 토스 지급대행 준비
    'ceo_phone', s.settle_phone,
    'toss_agreed', s.myr_toss_agreed_at is not null,
    'biz_kind', public.myr_biz_kind(s.biz_no),
    'toss_state', public.myr_toss_card_state(s),
    'toss_fix', case when s.toss_seller_error ->> 'field' in ('account', 'bizNo') then s.toss_seller_error ->> 'field' end)
$$;
revoke all on function public.myr_settle_info_json(public.sellers) from public, anon, authenticated;

drop function if exists public.myr_app_seller_settle_info_save(uuid, text, text, text, text, text, text);
create or replace function public.myr_app_seller_settle_info_save(p_user uuid, p_company text, p_ceo text, p_biz_no text, p_bank text, p_account text, p_holder text, p_ceo_phone text, p_toss_agreed boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  s         public.sellers%rowtype;
  v_company text := btrim(coalesce(p_company, ''));
  v_ceo     text := btrim(coalesce(p_ceo, ''));
  v_bank    text := btrim(coalesce(p_bank, ''));
  v_holder  text := btrim(coalesce(p_holder, ''));
  v_phone   text := public.myr_digits(coalesce(p_ceo_phone, ''));
  v_biz     text;
  v_account text;
  v_status  text;
  v_recheck boolean;
  v_toss_state text;
  v_toss_action text;
begin
  select * into s from public.sellers where user_id = p_user and p_user is not null for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  -- null 이면 저장된 값(가린 값만 가진 화면이 다시 입력하지 않아도 되게)
  v_biz := case when p_biz_no is null then s.biz_no else public.myr_digits(p_biz_no) end;
  v_account := case when p_account is null then s.bank_info ->> 'account' else public.myr_digits(p_account) end;

  if char_length(v_company) not between 1 and 50 then return jsonb_build_object('ok', false, 'code', 'BAD_COMPANY'); end if;
  if char_length(v_ceo) not between 1 and 30 then return jsonb_build_object('ok', false, 'code', 'BAD_CEO'); end if;
  if not public.myr_biz_no_valid(v_biz) then return jsonb_build_object('ok', false, 'code', 'BAD_BIZ_NO'); end if;
  if char_length(v_bank) not between 1 and 20 then return jsonb_build_object('ok', false, 'code', 'BAD_BANK'); end if;
  if coalesce(v_account, '') !~ '^\d{8,16}$' then return jsonb_build_object('ok', false, 'code', 'BAD_ACCOUNT'); end if;
  if char_length(v_holder) not between 1 and 50 then return jsonb_build_object('ok', false, 'code', 'BAD_HOLDER'); end if;
  if public.myr_holder_key(v_holder) not in (public.myr_holder_key(v_company), public.myr_holder_key(v_ceo)) then
    return jsonb_build_object('ok', false, 'code', 'HOLDER_MISMATCH');
  end if;
  -- 0121: 토스 본인인증 문자를 받을 대표자 휴대폰 · 토스페이먼츠 제3자 제공 동의(처음 한 번)
  if not public.myr_mobile_ok(v_phone) then return jsonb_build_object('ok', false, 'code', 'BAD_CEO_PHONE'); end if;
  if s.myr_toss_agreed_at is null and not coalesce(p_toss_agreed, false) then return jsonb_build_object('ok', false, 'code', 'TOSS_CONSENT_REQUIRED'); end if;

  -- 다시 확인: 계좌 · 사업자번호 · 대표자가 바뀌면. 상호 · 대표자 휴대폰만 바뀌면 확인 완료 그대로
  v_recheck := not public.myr_seller_settle_verified(s.myr_settle_status)
            or v_biz is distinct from s.biz_no
            or v_ceo is distinct from (s.tax_info ->> 'ceo')
            or v_bank is distinct from (s.bank_info ->> 'bank')
            or v_account is distinct from (s.bank_info ->> 'account')
            or v_holder is distinct from (s.bank_info ->> 'holder');
  v_status := case when v_recheck then 'pending' else s.myr_settle_status end;
  -- 토스 셀러에 할 일 — 저장 전 카드 상태 · 바뀐 칸으로
  v_toss_state := public.myr_toss_card_state(s);
  v_toss_action := case
    when v_toss_state in ('none', 'rejected') or v_biz is distinct from s.biz_no or v_ceo is distinct from (s.tax_info ->> 'ceo')
         or (v_toss_state = 'wait' and v_phone is distinct from s.settle_phone) then 'register'
    when v_phone is distinct from s.settle_phone or v_company is distinct from (s.tax_info ->> 'company') or v_bank is distinct from (s.bank_info ->> 'bank')
         or v_account is distinct from (s.bank_info ->> 'account') or v_holder is distinct from (s.bank_info ->> 'holder') then 'update'
  end;

  update public.sellers
     set biz_no = v_biz,
         tax_info = coalesce(tax_info, '{}'::jsonb) || jsonb_build_object('company', v_company, 'ceo', v_ceo),
         bank_info = jsonb_build_object('bank', v_bank, 'account', v_account, 'holder', v_holder),
         settle_type = 'biz',
         settle_phone = v_phone,
         myr_toss_agreed_at = coalesce(myr_toss_agreed_at, now()),
         myr_settle_status = v_status,
         myr_settle_note = case when v_recheck then null else myr_settle_note end,
         myr_settle_submitted_at = case when v_recheck then now() else myr_settle_submitted_at end,
         myr_settle_checked_at = case when v_recheck then null else myr_settle_checked_at end,
         myr_settle_checked_by = case when v_recheck then null else myr_settle_checked_by end
   where id = s.id
  returning * into s;
  return jsonb_build_object('ok', true, 'recheck', v_recheck, 'toss_action', v_toss_action, 'info', public.myr_settle_info_json(s));
end;
$$;
revoke all on function public.myr_app_seller_settle_info_save(uuid, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_seller_settle_info_save(uuid, text, text, text, text, text, text, text, boolean) to service_role;

-- 토스 셀러 상태 적기 — 상태 값은 셀러리 0042 check(APPROVAL_REQUIRED · PARTIALLY_APPROVED · KYC_REQUIRED · APPROVED · null)가 막는다.
--   error: 토스가 등록을 거절한 이유 { field: 'account' | 'bizNo', code, message } · 상태가 정해지면 null
create or replace function public.myr_app_seller_toss_sync(p_seller uuid, p_status text, p_error jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  s public.sellers%rowtype;
begin
  begin
    update public.sellers
       set toss_seller_status = p_status, toss_seller_error = p_error, toss_seller_synced_at = now()
     where id = p_seller
    returning * into s;
  exception when check_violation then
    return jsonb_build_object('ok', false, 'code', 'BAD_STATUS');
  end;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  return jsonb_build_object('ok', true, 'info', public.myr_settle_info_json(s));
end;
$$;
revoke all on function public.myr_app_seller_toss_sync(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_seller_toss_sync(uuid, text, jsonb) to service_role;

-- 숫자만 남기기를 myr_digits 로 — 기존 함수 본문 그대로(로컬 DB 의 마지막 정의)에서 그 식만 바꾼다(권한은 create or replace 가 그대로 둔다)
CREATE OR REPLACE FUNCTION public.myr_biz_no_valid(p text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  d   text := public.myr_digits(coalesce(p, ''));
  w   int[] := array[1, 3, 7, 1, 3, 7, 1, 3, 5];
  s   int := 0;
  i   int;
begin
  if d !~ '^\d{10}$' then return false; end if;
  for i in 1..9 loop s := s + substr(d, i, 1)::int * w[i]; end loop;
  s := s + (substr(d, 9, 1)::int * 5) / 10;
  return (10 - s % 10) % 10 = substr(d, 10, 1)::int;
end;
$function$;

CREATE OR REPLACE FUNCTION public.myr_app_guest_order_lookup(p_order_code text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_oid uuid; v_ocode text; v_cid uuid; v_token text;
begin
  if p_order_code is null or p_phone is null or p_phone !~ '^[0-9]{8,15}$' then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select o.id, o.code, cu.id into v_oid, v_ocode, v_cid
    from public.myr_orders o join public.customers cu on cu.id = o.customer_id
   where lower(o.code) = lower(btrim(p_order_code)) and cu.guest
     and (cu.phone_norm = p_phone or public.myr_digits(coalesce(o.buyer_phone, '')) = p_phone
          or public.myr_digits(coalesce(o.shipping ->> 'phone', '')) = p_phone)
   limit 1;
  if v_oid is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  v_token := public.guest_token_rotate(v_cid);
  return jsonb_build_object('ok', true, 'order_id', v_oid, 'order_code', v_ocode, 'customer_id', v_cid, 'token', v_token);
end;
$function$;

CREATE OR REPLACE FUNCTION public.myr_refund_request_json(r myr_refund_requests)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'id', r.id, 'code', r.code, 'status', r.status, 'open', public.myr_claim_status_open(r.status), 'step', public.myr_refund_request_step(r),
    -- 0116: 크리에이터 답변을 기다리는지 · 답변 기한(설정 myr_claim_answer · 기다릴 때만) — 콘솔 탭 · 대기 수 · 기한 문구가 상태 · 날짜로 다시 판정하지 않는다
    'waiting', public.myr_claim_waiting(r), 'due', public.myr_claim_due_json(r, now()),
    'kind', r.kind, 'reason', r.reason, 'qty', r.qty, 'note', r.note, 'photos', to_jsonb(r.photos),
    'options', to_jsonb(public.myr_refund_request_options(r.kind, r.reason)),
    -- 처리 방법마다 회수가 필요한가(승인과 같은 함수) — 콘솔 처리 방법 안내가 사유로 다시 판정하지 않는다
    'option_collects', coalesce((select jsonb_object_agg(x, public.myr_claim_resolution_collects(x, r.reason)) from unnest(public.myr_refund_request_options(r.kind, r.reason)) x), '{}'::jsonb),
    -- 0105: 환불이 나가는 처리마다 뺄 왕복 배송비(승인과 같은 함수) · 차감 뒤 0원 이하라 고를 수 없으면 null — 콘솔 예상 금액 · 선택지가 처리 방법으로 다시 판정하지 않는다
    'option_deductions', coalesce((select jsonb_object_agg(x, case when public.myr_claim_option_blocked(r, x) then null else public.myr_claim_option_deduction(r, x) end)
                                     from unnest(public.myr_refund_request_options(r.kind, r.reason)) x where public.myr_claim_resolution_refunds(x)), '{}'::jsonb),
    'resolution', r.resolution, 'message', r.message, 'decided_at', r.decided_at,
    'needs_collect', r.needs_collect, 'collected_at', r.collected_at,
    'needs_reship', r.needs_reship, 'reship_courier', r.reship_courier, 'reship_tracking_no', r.reship_tracking_no, 'reshipped_at', r.reshipped_at,
    'needs_refund', r.needs_refund, 'deduction', r.deduction, 'return_fee', public.myr_refund_request_fee_due(r),
    'refund_amount', r.refund_amount, 'refunded_at', r.refunded_at, 'done_at', r.done_at, 'created_at', r.created_at,
    'amount', public.myr_line_amount(i.unit_price, r.qty),
    -- 환불이 끝난 요청을 결제 기준으로 — 결제 금액(상품 + 함께 돌려준 처음 배송비) = 환불액 + 차감 · 환불 전이면 refund_paid null · shipping_back 0
    'refund_paid', public.myr_claim_refund_paid(r),
    'shipping_back', greatest(public.myr_claim_refund_paid(r) - public.myr_line_amount(i.unit_price, r.qty), 0),
    'buyer_name', o.buyer_name,
    'buyer_phone', case when length(public.myr_digits(coalesce(o.buyer_phone, o.shipping ->> 'phone', ''))) >= 10
                        then left(public.myr_digits(coalesce(o.buyer_phone, o.shipping ->> 'phone')), 3) || '-****-' || right(public.myr_digits(coalesce(o.buyer_phone, o.shipping ->> 'phone')), 4)
                        else null end,
    'order', jsonb_build_object('id', o.id, 'code', o.code, 'status', o.status, 'paid_at', o.paid_at, 'is_member', o.user_id is not null,
                                'shipping_fee', o.shipping_fee,
                                'item', jsonb_build_object('id', i.id, 'name', i.product_name, 'option', i.option_name, 'qty', i.qty, 'unit_price', i.unit_price, 'amount', i.amount,
                                                           'refunded_qty', i.refunded_qty, 'status', i.status, 'ship_status', i.ship_status,
                                                           'courier', i.courier, 'tracking_no', i.tracking_no,
                                                           'shipped_at', i.shipped_at, 'delivered_at', i.delivered_at),
                                -- 같은 주문에서 같은 크리에이터의 다른 줄(요청이 걸리지 않은 상품 포함) — 콘솔 "주문 · 배송" 칸의 "함께 주문한 상품".
                                --   다른 크리에이터 줄은 싣지 않는다(콘솔 주문 탭과 같은 범위) · 남은 수량 · 살아 있는 줄 · 열린 요청은 기존 판정 함수 값
                                'others', coalesce((select jsonb_agg(jsonb_build_object(
                                                     'id', x.id, 'name', x.product_name, 'option', x.option_name, 'qty', x.qty, 'amount', x.amount,
                                                     'refunded_qty', x.refunded_qty, 'has_refund', public.myr_line_has_refund(x), 'status', x.status, 'ship_status', x.ship_status,
                                                     'left_qty', public.myr_line_left(x), 'live', public.myr_line_live(x), 'delivered_at', x.delivered_at,
                                                     'claim', public.myr_line_open_claim(x))
                                                   order by x.created_at, x.id)
                                                     from public.myr_order_items x
                                                    where x.order_id = o.id and x.seller_id = r.seller_id and x.id <> r.order_item_id), '[]'::jsonb)),
    'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = r.product_id),
    'seller', (select jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle) from public.sellers s where s.id = r.seller_id))
    from public.myr_orders o
    join public.myr_order_items i on i.id = r.order_item_id
   where o.id = r.order_id
$function$;
