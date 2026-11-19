-- ============================================================
-- 0124 · MYR 토스 셀러 등록 연결 — 정보 저장 뒤 토스 셀러 등록 · 수정 · 다시 등록, 웹훅 seller.changed · [인증을 마쳤어요] 상태 반영 (2026-11-19)
--
--   docs/myr.md 7-7 5번. 가짜 토스(0121 · myr-influencer lib/server/toss-sim.ts)를 실제 토스 호출로 바꾼다.
--   시범운영(2026-11-19 결정): 개발 서버 · Preview · 운영 모두 tpeerkeamf5 테스트 키로 실제 호출 — 토스 테스트 환경은 법인 셀러만 받으므로
--     개인사업자는 토스가 거절할 수 있다(그때 카드가 "정보 확인 필요"). 실키 전환 뒤 개인사업자 흐름(본인인증 문자)이 끝까지 돈다.
--   칸: 셀러리 0042 의 sellers.toss_seller_{id,status,synced_at,error} + 새 sellers.myr_toss_ref(MYR 이 토스에 준 refSellerId).
--     refSellerId 는 등록마다 새로(삭제한 값을 다시 써도 되는지 문서에 없다 · 2026-11-18 결정) — 토스를 부르기 전에 적어 두어,
--     등록 응답을 못 받아도(네트워크 · 5xx) 웹훅이 refSellerId 로 이 크리에이터를 찾는다.
--
--   myr_seller_toss_sending(seller)        송금 중인 지급 건이 있나(0111 myr_payout_sending) — 있으면 다시 등록(삭제 후 등록)을 막는다
--   myr_toss_ref_new()                      새 refSellerId — 'm' + 19자(16진수) = 20자(토스 7~20자)
--   myr_app_seller_toss_begin(seller, action)  토스를 부르기 전 — 최종 동작 · 등록 본문 재료 · 새 refSellerId
--       action = 저장 응답 toss_action(0121 · register | update). update 인데 토스 셀러 id 가 없으면(등록 응답을 못 받음 등) register.
--       register 면 새 refSellerId 를 적고, 이전 셀러 id(old_toss_id — 앱이 삭제한다)를 돌려준다. 송금 중이면 SENDING.
--       응답 { ok, action, ref, toss_id, old_toss_id, input: { company, ceo, biz_no, biz_kind, email, phone, bank: { bank, account, holder } } }
--       계좌 원문을 읽으므로 열람 기록(sensitive_access_log · 셀러리와 같은 표)을 남긴다. 거부: NOT_FOUND · BAD_ACTION · SENDING
--   myr_app_seller_toss_record(seller, toss_id, status, error)  등록 · 수정 결과 적기 — 셀러 id · 상태 · 오류를 통째로(성공이면 오류 null)
--       거부: NOT_FOUND · BAD_STATUS · DUPLICATE(다른 크리에이터의 셀러 id)
--   myr_app_seller_toss_status(toss_id, ref, status)  웹훅 seller.changed · [인증을 마쳤어요] — 토스에 다시 조회한 상태만 적는다(본문은 믿지 않는다)
--       MYR 이 등록한 셀러만(myr_toss_ref 가 있는 행) · 셀러 id 로 찾고, 없으면 refSellerId 로 찾아 셀러 id 도 적는다 · 오류 칸은 그대로(정보를 고쳐야 풀린다)
--       응답 { ok, found, info? } — 모르는 셀러(다른 서비스 · 삭제됨)는 found false(웹훅은 200 으로 넘긴다). 거부: BAD_STATUS
--   0121 myr_app_seller_toss_sync(상태 · 오류 적기 — 가짜 토스가 쓰던 것)는 지운다 — myr_app_seller_toss_record 와 하는 일이 같아(셀러 id 만 없음)
--     두 함수가 남으면 상태 적기를 아무 쪽으로나 할 수 있다(원칙 1 · 2). 앱에서 부르는 곳은 없다(가짜 토스 삭제).
--   상태가 바뀌면 0122 트리거(sellers_myr_payout_refresh)가 지급 건을 다시 정한다.
--   myr_seller_tax_email(seller)       세금계산서 · 토스 등록 이메일(크리에이터 이메일 · 없으면 계정 이메일) — 0085 에서 두 함수(정보 응답 · 운영 목록)에 같은 식이 있던 것을
--                                      이 함수 하나로 모은다(결과 그대로). 토스 등록 재료도 이 함수
--   권한: 전부 service role 만. 테스트: supabase/tests/myr_toss_seller_link.test.sql
-- ============================================================

alter table public.sellers add column if not exists myr_toss_ref text;
comment on column public.sellers.myr_toss_ref is 'MYR 이 토스 지급대행에 마지막으로 준 refSellerId(등록마다 새로) — 0124';
create unique index if not exists sellers_myr_toss_ref_uidx on public.sellers (myr_toss_ref) where myr_toss_ref is not null;

create or replace function public.myr_seller_toss_sending(p_seller uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.myr_payouts p where p.seller_id = p_seller and public.myr_payout_sending(p))
$$;
revoke all on function public.myr_seller_toss_sending(uuid) from public, anon, authenticated;

create or replace function public.myr_toss_ref_new()
returns text
language sql
volatile
as $$
  select 'm' || left(replace(gen_random_uuid()::text, '-', ''), 19)
$$;
revoke all on function public.myr_toss_ref_new() from public, anon, authenticated;

-- 세금계산서 · 토스 등록 이메일 — 0085 의 같은 식(정보 응답 · 운영 목록)을 한 곳으로(결과 그대로)
create or replace function public.myr_seller_tax_email(s public.sellers)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(s.email, (select u.email from auth.users u where u.id = s.user_id))
$$;
revoke all on function public.myr_seller_tax_email(public.sellers) from public, anon, authenticated;

create or replace function public.myr_app_seller_toss_begin(p_seller uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s        public.sellers%rowtype;
  v_action text;
  v_ref    text;
begin
  if p_action is null or p_action not in ('register', 'update') then return jsonb_build_object('ok', false, 'code', 'BAD_ACTION'); end if;
  select * into s from public.sellers where id = p_seller for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  -- 수정인데 토스 셀러 id 가 없으면 등록(등록 응답을 못 받았거나 아직 등록 전)
  v_action := case when p_action = 'update' and s.toss_seller_id is not null then 'update' else 'register' end;
  if v_action = 'register' then
    -- 다시 등록 = 이전 셀러 삭제 후 등록 — 송금 중인 지급이 있으면 막는다
    if s.toss_seller_id is not null and public.myr_seller_toss_sending(s.id) then
      return jsonb_build_object('ok', false, 'code', 'SENDING');
    end if;
    v_ref := public.myr_toss_ref_new();
    update public.sellers set myr_toss_ref = v_ref where id = s.id;
  else
    v_ref := s.myr_toss_ref;
  end if;
  insert into public.sensitive_access_log (seller_id, field, actor, purpose) values (s.id, 'bank_info', 'myr-toss', '토스 지급대행 셀러 ' || case v_action when 'register' then '등록' else '수정' end);
  return jsonb_build_object(
    'ok', true, 'action', v_action, 'ref', v_ref, 'toss_id', case when v_action = 'update' then s.toss_seller_id end,
    'old_toss_id', case when v_action = 'register' then s.toss_seller_id end,
    'input', jsonb_build_object(
      'company', s.tax_info ->> 'company', 'ceo', s.tax_info ->> 'ceo', 'biz_no', s.biz_no, 'biz_kind', public.myr_biz_kind(s.biz_no),
      'email', public.myr_seller_tax_email(s), 'phone', s.settle_phone,
      'bank', case when s.bank_info is not null then jsonb_build_object('bank', s.bank_info ->> 'bank', 'account', s.bank_info ->> 'account', 'holder', s.bank_info ->> 'holder') end));
end;
$$;
revoke all on function public.myr_app_seller_toss_begin(uuid, text) from public, anon, authenticated;
grant execute on function public.myr_app_seller_toss_begin(uuid, text) to service_role;

drop function if exists public.myr_app_seller_toss_sync(uuid, text, jsonb);

create or replace function public.myr_app_seller_toss_record(p_seller uuid, p_toss_id text, p_status text, p_error jsonb)
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
       set toss_seller_id = p_toss_id, toss_seller_status = p_status, toss_seller_error = p_error, toss_seller_synced_at = now()
     where id = p_seller
    returning * into s;
  exception
    when check_violation then return jsonb_build_object('ok', false, 'code', 'BAD_STATUS');
    when unique_violation then return jsonb_build_object('ok', false, 'code', 'DUPLICATE');
  end;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  return jsonb_build_object('ok', true, 'info', public.myr_settle_info_json(s));
end;
$$;
revoke all on function public.myr_app_seller_toss_record(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_seller_toss_record(uuid, text, text, jsonb) to service_role;

create or replace function public.myr_app_seller_toss_status(p_toss_id text, p_ref text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s public.sellers%rowtype;
begin
  if p_toss_id is null then return jsonb_build_object('ok', true, 'found', false); end if;
  select * into s from public.sellers where toss_seller_id = p_toss_id and myr_toss_ref is not null for update;
  if not found and p_ref is not null then
    select * into s from public.sellers where myr_toss_ref = p_ref for update;
  end if;
  if not found then return jsonb_build_object('ok', true, 'found', false); end if;
  begin
    update public.sellers
       set toss_seller_id = p_toss_id, toss_seller_status = p_status, toss_seller_synced_at = now()
     where id = s.id
    returning * into s;
  exception
    when check_violation then return jsonb_build_object('ok', false, 'code', 'BAD_STATUS');
    when unique_violation then return jsonb_build_object('ok', false, 'code', 'DUPLICATE');
  end;
  return jsonb_build_object('ok', true, 'found', true, 'info', public.myr_settle_info_json(s));
end;
$$;
revoke all on function public.myr_app_seller_toss_status(text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_seller_toss_status(text, text, text) to service_role;

-- 정보 응답에 토스로 지급 가능(0122 myr_toss_ready)을 싣는다 — 가입 토스 화면 · 환영 칩이 "인증 완료"를 TS 로 다시 판정하지 않게(0121 정의 + toss_ready · 이메일은 myr_seller_tax_email)
create or replace function public.myr_settle_info_json(s public.sellers)
returns jsonb
language sql
stable
security definer
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
    'tax_email', public.myr_seller_tax_email(s),
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
    'toss_fix', case when s.toss_seller_error ->> 'field' in ('account', 'bizNo') then s.toss_seller_error ->> 'field' end,
    -- 0124: 토스로 지급 가능(0122)
    'toss_ready', public.myr_toss_ready(s))
$$;
revoke all on function public.myr_settle_info_json(public.sellers) from public, anon, authenticated;

-- 운영 사업자 정보 확인 목록(0085 · myr-creators.mjs) — 이메일만 myr_seller_tax_email 로(나머지 그대로)
create or replace function public.myr_app_admin_settle_infos(p_status text default 'pending')
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'seller_id', s.id, 'name', s.name, 'handle', s.handle, 'status', s.myr_settle_status,
           'company', s.tax_info ->> 'company', 'ceo', s.tax_info ->> 'ceo', 'biz_no', s.biz_no,
           'bank', s.bank_info ->> 'bank', 'account', s.bank_info ->> 'account', 'holder', s.bank_info ->> 'holder',
           'tax_email', public.myr_seller_tax_email(s),
           'note', s.myr_settle_note, 'submitted_at', s.myr_settle_submitted_at, 'checked_at', s.myr_settle_checked_at)
         order by (s.myr_settle_status = 'pending') desc, s.myr_settle_submitted_at nulls last), '[]'::jsonb)
    from public.sellers s
   where s.user_id is not null
     and case when p_status is null then s.myr_settle_status <> 'none' else s.myr_settle_status = p_status end
$$;
revoke all on function public.myr_app_admin_settle_infos(text) from public, anon, authenticated;
grant execute on function public.myr_app_admin_settle_infos(text) to service_role;
