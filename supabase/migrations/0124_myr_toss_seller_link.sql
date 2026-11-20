-- ============================================================
-- 0124 · MYR 토스 셀러 등록 연결 — 처음 등록은 크리에이터가 직접 · 등록된 크리에이터의 정보 변경은 운영 승인 때 토스에 한 번 반영 (2026-11-19)
--
--   docs/myr.md 7-7 5번. 가짜 토스(0121 · myr-influencer lib/server/toss-sim.ts)를 실제 토스 호출로 바꾼다.
--   시범운영(2026-11-19 결정): 개발 서버 · Preview · 운영 모두 tpeerkeamf5 테스트 키로 실제 호출. 테스트 환경도 사업자번호를 국세청 기준으로 확인한다.
--
--   토스를 부르는 곳(2026-11-19 결정 — 크론 · 다시 시도 · 겹친 시도 처리를 없애려고 한 곳으로 모은다):
--     지금 바로(크리에이터 저장 직후) — 토스 본인인증을 마치기 전(등록 전 · 토스 거절 · 본인인증 전)에는 모든 칸을 자유롭게 고치고 저장하면 바로 등록 · 다시 등록
--       (그 휴대폰으로 인증 문자). 저장 응답 toss_action.
--     운영 승인 때 — 본인인증을 마친 크리에이터의 변경(계좌 · 사업자번호 · 대표자 · 예금주 · 상호 · 휴대폰). 저장이 sellers.myr_toss_todo(register · update)를 남기고
--       운영 재확인(확인 중 → 사업자 정보 보류로 지급 멈춤)을 건다. 운영이 확인하면 콘솔이 토스에 한 번 반영하고, 성공해야 확인 완료가 된다
--       (확인 RPC 가 남은 할 일이 있으면 TOSS_PENDING 으로 거절). 실패하면 확인 중 그대로 — 운영이 다시 누른다.
--     웹훅 seller.changed · [인증을 마쳤어요]는 상태만 다시 읽어 적는다.
--   칸: 셀러리 0042 의 sellers.toss_seller_{id,status,synced_at,error} + 새 myr_toss_ref(MYR 이 토스에 준 refSellerId · 등록마다 새로 · 부르기 전에 적어
--     응답을 못 받아도 웹훅이 찾는다) · myr_toss_todo · myr_toss_todo_at(승인 때 반영할 할 일 · 처음 남은 시각).
--
--   myr_seller_toss_sending(seller)        송금 중인 지급 건이 있나(0111 myr_payout_sending) — 있으면 다시 등록(삭제 후 등록)을 막는다
--   myr_toss_ref_new()                      새 refSellerId — 'm' + 19자(16진수) = 20자
--   myr_seller_tax_email(seller)            세금계산서 · 토스 등록 이메일 — 0085 에서 정보 응답 · 운영 목록 두 곳에 있던 식을 한 곳으로(결과 그대로)
--   myr_toss_todo_merge(a, b)               할 일 합치기 — 등록이 우선
--   myr_seller_toss_todo_open(seller)       승인 때 반영할 할 일이 남았나
--   myr_toss_todo_register(seller)          승인 때 할 일이 다시 등록(register)인가 — 등록 확인 · 재인증이 같이 쓴다
--   myr_settle_reviewing(seller)            사업자 · 정산 정보가 확인 중(pending)인가 — 잠금 · 확인 완료 상태 · 운영 목록 순서가 같이 쓴다
--   myr_toss_ref_is_last(seller, ref)       토스가 돌려준 refSellerId 가 마지막 등록 시도의 것인가 — 등록 확인 · 웹훅의 등록 진행 중 끝내기
--   myr_toss_register_confirmed(seller, ref) 웹훅 · 다시 조회가 마지막 등록 시도(지금 myr_toss_ref)의 셀러를 찾았고 할 일이 register 인가
--   myr_toss_status_state(status, biz_no)   토스 셀러 상태 → 상태 이름(wait · kyc · approved · partial · corporate) — 토스 상태 목록은 여기 한 곳(카드 상태 · 본인인증 판정이 부른다 · 2026-11-20)
--   myr_toss_card_state(seller)             0121 다시 정의(결과 같음) — 미입력 none · 거절 rejected · 그 밖 myr_toss_status_state
--   myr_toss_registered(seller)             토스에 등록된 셀러가 있나(셀러 id · 상태가 있음 — 수정이 거절돼도 셀러는 그대로 · 2026-11-20) — 없으면 저장이 등록(저장 RPC 의 할 일)
--   myr_toss_verified(seller)               토스 본인인증을 마쳤나(토스 상태 인증 완료 · 추가 인증 · 한도 없음 · 법인 — 수정이 거절돼도 그대로 · 2026-11-20) — 마쳤으면 변경은 운영 승인 때 · 확인 중이면 잠금
--                                           (저장 RPC · 정보 응답 review_on_change · 2026-11-19 결정)
--   myr_settle_edit_locked(seller)          확인 중 + 본인인증을 마침 → 정보를 고칠 수 없다(저장 RPC REVIEW_PENDING · 정보 응답 edit_locked) — 잘못 넣었으면 운영이 다시 입력 요청
--   myr_toss_reauth_pending(seller)         승인 뒤 토스 본인인증을 다시 해야 하나(할 일 register = 사업자번호 · 대표자 변경 · 법인 제외) — 정보 응답 reauth_after_review · 운영 목록 reauth
--   myr_toss_register_in_flight(seller)     등록 진행 중인가(등록 시도 sellers.myr_toss_ref_at 뒤 5분 · 결과 적기 · 웹훅이 비운다) — 시작 RPC 가 다시 등록을 WAITING 으로(동시 승인 · 저장 · 버튼)
--   myr_toss_reply_waiting(seller)          마지막 등록의 토스 응답을 기다리는 중인가(등록 시도 sellers.myr_toss_ref_at 뒤 5분 · 셀러 · 거절 없음) — 다시 등록 막기(begin WAITING · toss_ask waiting)
--   myr_toss_creator_ask(seller)            크리에이터가 토스에서 할 일 — auth(본인인증 전) · kyc(추가 인증) · fix(토스 거절) · register(다시 등록 — 사업자번호는 있는데 토스 셀러 없음) · null
--                                           — 정보 응답 toss_ask(홈 배너 · 토스 카드 [다시 등록하기] · /api/my/toss 가 다시 읽어 확인)
--   myr_seller_contact_phone(seller)        요약 카드 연락처 — 확인 완료면 대표자 휴대폰(연락처와 하나로 · 2026-11-20) · 트리거 sellers_myr_toss_done 이 적는다 · 이미 확인 완료인 크리에이터는 이 마이그레이션이 맞춘다
--     (myr_contact_phone_backfill_0124 — 덮어쓰기 전 값은 표 myr_contact_phone_before_0124 에 남긴다 · 되돌리기 SQL 은 그 자리 주석)
--   myr_settle_verify_status(seller)        운영 확인 완료가 남길 상태 — 확인 중이었는데 토스 셀러가 본인인증 전이면 toss(재인증 = 가입 직후와 같은 상태 · 2026-11-20 결정) · 그 밖 verified
--   사업자 · 정산 정보 상태 toss(토스 인증 대기 · 2026-11-19 결정) — 본인인증 전에는 운영 확인이 없다: 저장하면 toss(운영 목록에 안 잡힌다) ·
--     본인인증을 마치면 확인 완료(트리거 sellers_myr_toss_done · 판정 myr_settle_toss_done) — 토스가 사업자번호(국세청) · 계좌(등록 검증) · 대표자(문자)를 확인했다.
--     운영은 시범운영(테스트 키 — 개인사업자 문자가 끝까지 오지 않는다) 동안 toss 도 직접 확인 완료할 수 있다(settle-verify · settle-info --all).
--     이미 확인 중(pending)인 크리에이터는 그대로 둔다(운영이 계좌를 확인해야 수동 이체가 나간다).
--   myr_app_seller_toss_begin(seller, action)  토스를 부르기 전 — 최종 동작(남은 할 일과 합침 · 수정인데 셀러 id 가 없으면 등록) · 송금 중이면 SENDING ·
--       등록이면 새 refSellerId 를 먼저 적고 이전 셀러 id(old_toss_id — 앱이 삭제)를 준다 · 계좌 원문 열람 기록. 거부: NOT_FOUND · BAD_ACTION · SENDING
--   myr_app_seller_toss_record(seller, toss_id, status, error, done)  결과 적기 — done(성공 · 크리에이터가 고칠 정보 오류)이면 남은 할 일을 지운다. 응답 done = 할 일이 비었나
--   myr_app_seller_toss_status(toss_id, ref, status)  웹훅 · 다시 조회 — 토스에 다시 조회한 상태만 · MYR 이 등록한 셀러만 · 셀러 id 없으면 refSellerId 로 ·
--       오류 칸 그대로 · 마지막 등록 시도가 확인되면(결과 불명이던 등록이 사실은 성공) 할 일 register → update(확인된 셀러를 지우지 않게)
--   myr_app_seller_toss_forget(seller, old_toss_id)  다시 등록이 결과 불명 · 우리 쪽 거절로 끝났을 때 — 지금 id 가 방금 지운 이전 셀러일 때만 비운다
--   myr_app_seller_toss_abort(seller, ref)  등록 시도가 확실히 실패(우리 쪽 거절 · 삭제 실패로 등록 요청 안 보냄) — 이번 시도면 등록 진행 중을 바로 끝낸다(결과 불명만 5분 대기 · 2026-11-20)
--   0121 myr_app_seller_toss_sync 는 지운다(record 와 하는 일이 같다 · 원칙 1 · 2)
--   myr_app_seller_settle_info_save — 지금 바로 할 일(toss_action) · 승인 때 할 일(toss_todo) · 등록된 크리에이터의 토스 칸 변경도 운영 재확인 ·
--     본인인증 전 저장은 토스 인증 대기 — 단 이미 확인 완료이고 0085 재확인 칸이 그대로면 확인 완료 그대로(2026-11-20) ·
--     토스 등록이 진행 중이면 지금 바로 보낼 저장은 REGISTER_WAITING(2026-11-20 · DB 와 토스가 어긋나지 않게) ·
--     본인인증을 마친 뒤 확인 중이면 REVIEW_PENDING
--   myr_app_admin_settle_info_check — verify 는 남은 할 일이 있으면 TOSS_PENDING(콘솔 운영 API 가 토스에 반영한 뒤 확인한다) ·
--     확인 완료 상태는 myr_settle_verify_status(승인 때 다시 등록돼 본인인증 전이면 toss) · 토스가 정보를 거절한 상태(toss_ask fix)면 TOSS_REJECTED(2026-11-20)
--   myr_settle_info_json — toss_ready(0122 myr_toss_ready) · review_on_change · toss_after_review(승인 때 반영할 할 일이 있나) · edit_locked — 내 정보 안내 · 확인 시트가 읽는다 ·
--     이메일은 myr_seller_tax_email · myr_app_admin_settle_infos — 이메일 · toss_todo
--   권한: 전부 service role 만. 테스트: supabase/tests/myr_toss_seller_link.test.sql · myr_settle_toss_prep.test.sql
-- ============================================================

alter table public.sellers add column if not exists myr_toss_ref text;
comment on column public.sellers.myr_toss_ref is 'MYR 이 토스 지급대행에 마지막으로 준 refSellerId(등록마다 새로) — 0124';
create unique index if not exists sellers_myr_toss_ref_uidx on public.sellers (myr_toss_ref) where myr_toss_ref is not null;
alter table public.sellers add column if not exists myr_toss_todo text;
alter table public.sellers add column if not exists myr_toss_todo_at timestamptz;
-- 2026-11-20: 마지막 등록 시도(begin register) 시각 — 결과 불명이면 몇 분 동안 다시 등록을 막는다(myr_toss_reply_waiting · 주인 없는 셀러 방지)
alter table public.sellers add column if not exists myr_toss_ref_at timestamptz;
alter table public.sellers drop constraint if exists sellers_myr_toss_todo_check;
alter table public.sellers add constraint sellers_myr_toss_todo_check check (myr_toss_todo is null or myr_toss_todo in ('register', 'update'));
comment on column public.sellers.myr_toss_todo is 'MYR 운영 승인 때 토스 셀러에 반영할 할 일(register | update) — 저장 RPC 가 적고 반영이 확정되면 지운다 · 0124';

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

-- 할 일 합치기 — 등록이 우선(등록은 수정을 포함한다)
create or replace function public.myr_toss_todo_merge(p_a text, p_b text)
returns text
language sql
immutable
as $$
  select case when p_a = 'register' or p_b = 'register' then 'register' else coalesce(p_a, p_b) end
$$;
revoke all on function public.myr_toss_todo_merge(text, text) from public, anon, authenticated;

-- 승인 때 반영할 할 일이 남았나
create or replace function public.myr_seller_toss_todo_open(s public.sellers)
returns boolean
language sql
immutable
as $$
  select coalesce(s.myr_toss_todo is not null, false)
$$;
revoke all on function public.myr_seller_toss_todo_open(public.sellers) from public, anon, authenticated;

-- 승인 때 할 일이 다시 등록(register)인가 — 등록 확인(myr_toss_register_confirmed) · 재인증(myr_toss_reauth_pending)이 같이 쓴다
create or replace function public.myr_toss_todo_register(s public.sellers)
returns boolean
language sql
immutable
as $$
  select coalesce(s.myr_toss_todo = 'register', false)
$$;
revoke all on function public.myr_toss_todo_register(public.sellers) from public, anon, authenticated;

-- 사업자 · 정산 정보가 확인 중(pending)인가 — 잠금(myr_settle_edit_locked) · 확인 완료가 남길 상태(myr_settle_verify_status) · 운영 목록 순서가 같이 쓴다
create or replace function public.myr_settle_reviewing(s public.sellers)
returns boolean
language sql
immutable
as $$
  select coalesce(s.myr_settle_status = 'pending', false)
$$;
revoke all on function public.myr_settle_reviewing(public.sellers) from public, anon, authenticated;

-- 토스가 돌려준 refSellerId 가 마지막 등록 시도(지금 myr_toss_ref)의 것인가 — 등록 확인 · 웹훅의 등록 진행 중 끝내기가 같이 쓴다(2026-11-20)
create or replace function public.myr_toss_ref_is_last(s public.sellers, p_ref text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_ref = s.myr_toss_ref, false)
$$;
revoke all on function public.myr_toss_ref_is_last(public.sellers, text) from public, anon, authenticated;

-- 웹훅 · 다시 조회가 마지막 등록 시도를 확인했나 — 그 셀러의 refSellerId 가 지금 myr_toss_ref 이고 할 일이 register
create or replace function public.myr_toss_register_confirmed(s public.sellers, p_ref text)
returns boolean
language sql
immutable
as $$
  select public.myr_toss_todo_register(s) and public.myr_toss_ref_is_last(s, p_ref)
$$;
revoke all on function public.myr_toss_register_confirmed(public.sellers, text) from public, anon, authenticated;


-- 토스 셀러 상태 → 상태 이름(2026-11-20 · 토스 상태 목록을 한 곳에) — wait 본인인증 전 · kyc 추가 인증 · approved 한도 없음 · partial 인증 완료(주 1천만 원 미만) ·
--   corporate 법인(본인인증 없이 PARTIALLY_APPROVED) · 모르는 상태 · 없음은 null. 카드 상태(myr_toss_card_state)와 본인인증 판정(myr_toss_verified)이 같이 부른다
create or replace function public.myr_toss_status_state(p_status text, p_biz_no text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case p_status
           when 'APPROVAL_REQUIRED' then 'wait'
           when 'KYC_REQUIRED' then 'kyc'
           when 'APPROVED' then 'approved'
           when 'PARTIALLY_APPROVED' then case when public.myr_biz_kind(p_biz_no) = 'corporate' then 'corporate' else 'partial' end
         end
$$;
revoke all on function public.myr_toss_status_state(text, text) from public, anon, authenticated;

-- 내 정보 "토스 본인인증" 카드 상태(0121 다시 정의 · 결과 같음) — 정보 미입력 → 거절 → 토스 상태 이름(myr_toss_status_state)
create or replace function public.myr_toss_card_state(s public.sellers)
returns text language sql stable set search_path = public as $$
  select case when not public.myr_has_biz_no(s.biz_no) then 'none'
              when s.toss_seller_error is not null then 'rejected'
              else coalesce(public.myr_toss_status_state(s.toss_seller_status, s.biz_no), 'none') end
$$;
revoke all on function public.myr_toss_card_state(public.sellers) from public, anon, authenticated;

-- 토스에 등록된 크리에이터인가 — 셀러 id · 상태가 있으면(수정이 거절돼도 셀러는 그대로). 등록됐으면 정보 변경은 셀러 수정(인증 뒤에는 운영 승인 때)
create or replace function public.myr_toss_registered(s public.sellers)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  -- 2026-11-20: 카드 상태가 아니라 셀러 id · 상태로 — 토스가 수정만 거절했으면(오류 칸) 셀러는 그대로 있다(다시 등록하면 인증된 셀러를 지운다)
  select s.toss_seller_id is not null and s.toss_seller_status is not null
$$;
revoke all on function public.myr_toss_registered(public.sellers) from public, anon, authenticated;

-- 토스 본인인증을 마쳤나 — 인증 완료 · 추가 인증 · 한도 없음 · 법인. 마치기 전에는 모든 칸을 자유롭게 고치고 저장하면 바로 (다시) 등록(그 휴대폰으로 문자)
--   마친 뒤의 변경은 운영 승인 때 토스에 반영(2026-11-19 결정)
create or replace function public.myr_toss_verified(s public.sellers)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  -- 2026-11-20: 카드 상태가 아니라 토스 상태로 — 수정이 거절돼(오류 칸) 카드가 "정보 확인 필요"여도 본인인증은 그대로다
  --   셀러가 있어야 한다(myr_toss_registered — 개발용 가짜 토스가 id 없이 상태만 적은 행은 인증으로 보지 않는다)
  select public.myr_toss_registered(s) and coalesce(public.myr_toss_status_state(s.toss_seller_status, s.biz_no) in ('partial', 'kyc', 'approved', 'corporate'), false)
$$;
revoke all on function public.myr_toss_verified(public.sellers) from public, anon, authenticated;

-- 확인 중 + 본인인증을 마침 → 정보를 고칠 수 없다(운영이 보고 있는 값을 바꾸지 않게 · 2026-11-19 결정). 잘못 넣었으면 운영이 "다시 입력 요청"(잠금이 풀린다)
create or replace function public.myr_settle_edit_locked(s public.sellers)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select public.myr_settle_reviewing(s) and public.myr_toss_verified(s)
$$;
revoke all on function public.myr_settle_edit_locked(public.sellers) from public, anon, authenticated;

-- 운영 승인 뒤 토스 본인인증을 다시 해야 하나 — 승인 때 토스에 새로 등록할 일(사업자번호 · 대표자 변경 · register)이 남았고 법인이 아니면(법인은 등록 즉시 지급 가능)
create or replace function public.myr_toss_reauth_pending(s public.sellers)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select public.myr_toss_todo_register(s) and public.myr_biz_kind(s.biz_no) is distinct from 'corporate'
$$;
revoke all on function public.myr_toss_reauth_pending(public.sellers) from public, anon, authenticated;

-- 마지막 등록의 토스 응답을 기다리는 중인가 — 등록 시도 뒤 5분 안이고 아직 셀러 · 거절 기록이 없으면(결과 불명일 수 있다 — 웹훅이 오면 셀러가 적힌다 · 2026-11-20).
--   그동안 [다시 등록하기] 대신 "응답을 기다리고 있어요"(toss_ask waiting) · 시작 RPC 가 다시 등록을 WAITING 으로 막는다
-- 등록 진행 중인가 — 마지막 등록 시도(begin register) 뒤 5분 안이고 그 결과가 아직 적히지 않았으면(결과 적기 · 웹훅이 시도 시각을 비운다 · 2026-11-20).
--   시작 RPC 가 다시 등록을 WAITING 으로 막는다 — 승인 · 저장 · 버튼이 겹쳐도 토스 셀러가 둘 생기지 않게(등록됐는지와 상관없이)
create or replace function public.myr_toss_register_in_flight(s public.sellers)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce(s.myr_toss_ref_at > now() - interval '5 minutes', false)
$$;
revoke all on function public.myr_toss_register_in_flight(public.sellers) from public, anon, authenticated;

create or replace function public.myr_toss_reply_waiting(s public.sellers)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select public.myr_toss_register_in_flight(s) and not public.myr_toss_registered(s) and s.toss_seller_error is null
$$;
revoke all on function public.myr_toss_reply_waiting(public.sellers) from public, anon, authenticated;

-- 크리에이터가 토스에서 할 일 — auth 본인인증(본인인증 전) · kyc 추가 인증(이메일) · fix 정보 고치기(토스 거절) ·
--   register 다시 등록(사업자번호가 있는데 토스 셀러가 없음 — 첫 등록이 우리 쪽 거절 · 결과 불명이었는데 실패 · 0124 전에 저장 · 2026-11-20) ·
--   waiting 토스 응답 대기(마지막 등록 뒤 5분 · myr_toss_reply_waiting) · 없으면 null.
--   홈 배너 · 토스 카드 [다시 등록하기](정보 응답 toss_ask) · 확인 완료 상태가 쓴다
create or replace function public.myr_toss_creator_ask(s public.sellers)
returns text
language sql
stable
set search_path to 'public'
as $$
  select case public.myr_toss_card_state(s) when 'wait' then 'auth' when 'kyc' then 'kyc' when 'rejected' then 'fix'
              when 'none' then case when not public.myr_has_biz_no(s.biz_no) then null when public.myr_toss_reply_waiting(s) then 'waiting' else 'register' end end
$$;
revoke all on function public.myr_toss_creator_ask(public.sellers) from public, anon, authenticated;

-- 운영 확인 완료가 남길 상태 — 확인 중(pending)이었는데 토스 셀러가 본인인증 전(승인 때 새로 등록 · 0124 전에 저장한 크리에이터)이면 토스 인증 대기(toss —
--   가입 직후와 같다 · 본인인증을 마치면 트리거가 확인 완료). 그 밖(토스 인증 대기를 운영이 직접 확인 · 인증을 마친 셀러 · 토스 미연결)은 확인 완료
create or replace function public.myr_settle_verify_status(s public.sellers)
returns text
language sql
stable
set search_path to 'public'
as $$
  select case when public.myr_settle_reviewing(s) and public.myr_toss_creator_ask(s) = 'auth' then 'toss' else 'verified' end
$$;
revoke all on function public.myr_settle_verify_status(public.sellers) from public, anon, authenticated;

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
  -- 남은 할 일과 합친다(호출자가 등록을 수정으로 낮추지 못하게) · 수정인데 토스 셀러 id 가 없으면 등록
  v_action := public.myr_toss_todo_merge(s.myr_toss_todo, p_action);
  v_action := case when v_action = 'update' and s.toss_seller_id is not null then 'update' else 'register' end;
  if v_action = 'register' then
    -- 다시 등록 = 이전 셀러 삭제 후 등록 — 송금 중인 지급이 있으면 막는다
    if s.toss_seller_id is not null and public.myr_seller_toss_sending(s.id) then
      return jsonb_build_object('ok', false, 'code', 'SENDING');
    end if;
    -- 2026-11-20: 등록이 진행 중이면(결과 불명 · 동시에 돈 승인 · 저장 · 버튼) 다시 등록하지 않는다 — 토스에 주인 없는 셀러가 하나 더 생긴다
    if public.myr_toss_register_in_flight(s) then
      return jsonb_build_object('ok', false, 'code', 'WAITING');
    end if;
    v_ref := public.myr_toss_ref_new();
    update public.sellers set myr_toss_ref = v_ref, myr_toss_ref_at = now() where id = s.id;
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

-- p_done — 결과가 확정됐나(성공 · 크리에이터가 고칠 정보 오류 → 남은 할 일을 지운다 · 결과 불명 · 우리 쪽 거절이면 false — 그대로 남겨 운영이 다시 승인)
-- 응답 { ok, done(할 일이 비었나), info } · 거부 NOT_FOUND · BAD_STATUS · DUPLICATE
create or replace function public.myr_app_seller_toss_record(p_seller uuid, p_toss_id text, p_status text, p_error jsonb, p_done boolean)
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
       set toss_seller_id = p_toss_id,
           -- 2026-11-20: 같은 셀러의 수정이 실패하면(상태 없이 오류만) 토스 상태를 비우지 않는다 — 토스에서는 셀러 · 본인인증이 그대로다
           toss_seller_status = case when p_status is null and p_toss_id is not distinct from toss_seller_id then toss_seller_status else p_status end,
           toss_seller_error = p_error, toss_seller_synced_at = now(),
           myr_toss_todo = case when coalesce(p_done, false) then null else myr_toss_todo end,
           myr_toss_todo_at = case when coalesce(p_done, false) then null else myr_toss_todo_at end,
           -- 2026-11-20: 결과가 확정됐으면(성공 · 크리에이터 정보 거절) 등록 진행 중이 끝난다
           myr_toss_ref_at = case when coalesce(p_done, false) then null else myr_toss_ref_at end
     where id = p_seller
    returning * into s;
  exception
    when check_violation then return jsonb_build_object('ok', false, 'code', 'BAD_STATUS');
    when unique_violation then return jsonb_build_object('ok', false, 'code', 'DUPLICATE');
  end;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  return jsonb_build_object('ok', true, 'done', not public.myr_seller_toss_todo_open(s), 'info', public.myr_settle_info_json(s));
end;
$$;
revoke all on function public.myr_app_seller_toss_record(uuid, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_seller_toss_record(uuid, text, text, jsonb, boolean) to service_role;

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
    -- 마지막 등록 시도가 확인됐으면(결과 불명이던 등록이 사실은 성공) 할 일 register → update — 다시 승인할 때 확인된 셀러를 지우지 않게
    update public.sellers
       set toss_seller_id = p_toss_id, toss_seller_status = p_status, toss_seller_synced_at = now(),
           myr_toss_todo = case when public.myr_toss_register_confirmed(s, p_ref) then 'update' else myr_toss_todo end,
           -- 2026-11-20: 마지막 등록 시도(지금 refSellerId)의 셀러를 찾았으면 등록 진행 중이 끝난다
           myr_toss_ref_at = case when public.myr_toss_ref_is_last(s, p_ref) then null else myr_toss_ref_at end
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

-- 다시 등록(이전 셀러 삭제 뒤)이 결과 불명 · 우리 쪽 거절로 끝났을 때 — 지금 id 가 방금 지운 이전 셀러일 때만 비운다(웹훅이 먼저 새 셀러를 적었으면 그대로) · 할 일은 그대로
create or replace function public.myr_app_seller_toss_forget(p_seller uuid, p_old_toss_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s public.sellers%rowtype;
  v_changed boolean;
begin
  update public.sellers
     set toss_seller_id = null, toss_seller_status = null, toss_seller_synced_at = now()
   where id = p_seller and toss_seller_id = p_old_toss_id
  returning * into s;
  v_changed := found;
  if not v_changed then
    select * into s from public.sellers where id = p_seller;
    if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  end if;
  return jsonb_build_object('ok', true, 'changed', v_changed, 'info', public.myr_settle_info_json(s));
end;
$$;
revoke all on function public.myr_app_seller_toss_forget(uuid, text) from public, anon, authenticated;
grant execute on function public.myr_app_seller_toss_forget(uuid, text) to service_role;

-- 등록 시도가 확실히 실패했다(2026-11-20) — 우리 쪽 거절(키 · 권한 · 접근 정책) · 다시 등록 전 삭제 실패(등록 요청을 보내지 않음)면 등록 진행 중을 바로 끝낸다.
--   결과 불명일 때만 5분을 기다린다(myr_toss_register_in_flight). 이번 시도(refSellerId)일 때만 — 그사이 새 시도가 시작됐으면 그대로. 거부: NOT_FOUND
create or replace function public.myr_app_seller_toss_abort(p_seller uuid, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s public.sellers%rowtype;
begin
  select * into s from public.sellers where id = p_seller for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if public.myr_toss_ref_is_last(s, p_ref) then
    update public.sellers set myr_toss_ref_at = null where id = s.id returning * into s;
  end if;
  return jsonb_build_object('ok', true, 'info', public.myr_settle_info_json(s));
end;
$$;
revoke all on function public.myr_app_seller_toss_abort(uuid, text) from public, anon, authenticated;
grant execute on function public.myr_app_seller_toss_abort(uuid, text) to service_role;

-- 정보 응답 — 0121 정의 + toss_ready(0122 myr_toss_ready) · 이메일은 myr_seller_tax_email
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
    'toss_ready', public.myr_toss_ready(s),
    -- 0124: 내 정보 안내 · 확인 시트 — 본인인증을 마쳐 변경은 승인 때 · 승인 때 반영할 할 일이 있나 · 확인 중이라 잠김
    'review_on_change', public.myr_toss_verified(s),
    'toss_after_review', public.myr_seller_toss_todo_open(s),
    'edit_locked', public.myr_settle_edit_locked(s),
    -- 0124: 확인이 끝나면 토스 본인인증을 다시 해야 하나(사업자번호 · 대표자 변경 · 법인 제외)
    'reauth_after_review', public.myr_toss_reauth_pending(s),
    -- 0124: 크리에이터가 토스에서 할 일(본인인증 · 추가 인증 · 정보 고치기) — 홈 배너가 "확인하고 있어요"보다 먼저 보인다
    'toss_ask', public.myr_toss_creator_ask(s))
$$;
revoke all on function public.myr_settle_info_json(public.sellers) from public, anon, authenticated;

-- 운영 사업자 정보 확인 목록(0085 · myr-creators.mjs) — 이메일은 myr_seller_tax_email · toss_todo(승인 때 토스에 반영할 할 일)
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
           'tax_email', public.myr_seller_tax_email(s), 'toss_todo', s.myr_toss_todo, 'reauth', public.myr_toss_reauth_pending(s),
           'note', s.myr_settle_note, 'submitted_at', s.myr_settle_submitted_at, 'checked_at', s.myr_settle_checked_at)
         order by public.myr_settle_reviewing(s) desc, s.myr_settle_submitted_at nulls last), '[]'::jsonb)
    from public.sellers s
   where s.user_id is not null
     and case when p_status is null then s.myr_settle_status <> 'none' else s.myr_settle_status = p_status end
$$;
revoke all on function public.myr_app_admin_settle_infos(text) from public, anon, authenticated;
grant execute on function public.myr_app_admin_settle_infos(text) to service_role;

-- 저장 RPC(0122 정의) — 지금 바로 할 일(toss_action) · 승인 때 할 일(toss_todo) · 등록된 크리에이터의 토스 칸 변경도 운영 재확인
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
  v_reset   boolean;
  v_toss_action text;
  v_now     boolean;
  v_todo    text;
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
  -- 0122: 토스 지급대행 계좌번호는 최대 14자리(myr_account_ok). 계좌 칸을 비워 저장된 값을 쓰는데 그 값이 규칙 밖이면(0122 전에 저장한 15 · 16자리)
  --   ACCOUNT_REENTER — 계좌를 건드리지 않은 크리에이터에게 "다시 입력"을 따로 안내한다
  if not public.myr_account_ok(v_account) then
    return jsonb_build_object('ok', false, 'code', case when p_account is null and coalesce(v_account, '') <> '' then 'ACCOUNT_REENTER' else 'BAD_ACCOUNT' end);
  end if;
  if char_length(v_holder) not between 1 and 50 then return jsonb_build_object('ok', false, 'code', 'BAD_HOLDER'); end if;
  if public.myr_holder_key(v_holder) not in (public.myr_holder_key(v_company), public.myr_holder_key(v_ceo)) then
    return jsonb_build_object('ok', false, 'code', 'HOLDER_MISMATCH');
  end if;
  -- 0121: 토스 본인인증 문자를 받을 대표자 휴대폰 · 토스페이먼츠 제3자 제공 동의(처음 한 번)
  if not public.myr_mobile_ok(v_phone) then return jsonb_build_object('ok', false, 'code', 'BAD_CEO_PHONE'); end if;
  if s.myr_toss_agreed_at is null and not coalesce(p_toss_agreed, false) then return jsonb_build_object('ok', false, 'code', 'TOSS_CONSENT_REQUIRED'); end if;
  -- 0124: 본인인증을 마친 뒤 확인 중이면 고칠 수 없다(잘못 넣었으면 운영이 다시 입력 요청)
  if public.myr_settle_edit_locked(s) then return jsonb_build_object('ok', false, 'code', 'REVIEW_PENDING'); end if;

  -- 토스 셀러에 할 일 — 저장 전 카드 상태 · 바뀐 칸으로(0121 판정 그대로)
  v_toss_action := case
    when not public.myr_toss_registered(s) or v_biz is distinct from s.biz_no or v_ceo is distinct from (s.tax_info ->> 'ceo')
         or (not public.myr_toss_verified(s) and v_phone is distinct from s.settle_phone) then 'register'
    when v_phone is distinct from s.settle_phone or v_company is distinct from (s.tax_info ->> 'company') or v_bank is distinct from (s.bank_info ->> 'bank')
         or v_account is distinct from (s.bank_info ->> 'account') or v_holder is distinct from (s.bank_info ->> 'holder') then 'update'
  end;
  -- 0124: 본인인증을 마치기 전이면 지금 바로(크리에이터가 직접 · 그 휴대폰으로 문자) · 마친 뒤의 변경은 운영 승인 때
  v_now := not public.myr_toss_verified(s);
  -- 2026-11-20: 토스 등록이 진행 중이면(결과 불명 · 응답 전) 지금 바로 토스에 보낼 저장을 받지 않는다 — 받으면 DB 는 새 값인데 토스 등록은 WAITING 으로 막혀
  --   첫 등록(옛 값)으로 본인인증 → 확인 완료가 되어 DB 와 토스가 아무 신호 없이 어긋난다(토스 방식이면 옛 계좌로 지급)
  if v_now and v_toss_action is not null and public.myr_toss_register_in_flight(s) then
    return jsonb_build_object('ok', false, 'code', 'REGISTER_WAITING');
  end if;
  v_todo := public.myr_toss_todo_merge(s.myr_toss_todo, case when not v_now then v_toss_action end);

  -- 다시 확인: 계좌 · 사업자번호 · 대표자가 바뀌면 + 0124: 본인인증을 마친 크리에이터가 토스에 보낼 칸(휴대폰 · 상호 포함)을 바꾸면 — 운영 승인 때 토스에 반영
  v_recheck := not public.myr_seller_settle_verified(s.myr_settle_status)
            or v_biz is distinct from s.biz_no
            or v_ceo is distinct from (s.tax_info ->> 'ceo')
            or v_bank is distinct from (s.bank_info ->> 'bank')
            or v_account is distinct from (s.bank_info ->> 'account')
            or v_holder is distinct from (s.bank_info ->> 'holder')
            or (not v_now and v_toss_action is not null);
  -- 0124: 본인인증 전에는 운영 확인이 없다 — 상태 toss(토스 인증 대기 · 운영 목록에 안 잡힌다). 본인인증을 마치면 트리거가 확인 완료로(myr_settle_toss_done)
  --   2026-11-20: 이미 확인 완료(0124 전에 운영이 확인 · 토스 미등록)이고 다시 확인할 칸(0085 — 계좌 · 사업자번호 · 대표자 · 예금주)이 그대로면 확인 완료 그대로
  --   (상호 · 휴대폰만 바꾸거나 그대로 저장해도 지급이 멈추던 것 — 토스 등록은 저장 응답 toss_action 으로 그대로 한다)
  if v_now then
    v_status := case when v_recheck then 'toss' else s.myr_settle_status end;
    v_reset := v_recheck;
    v_recheck := false;
  else
    v_status := case when v_recheck then 'pending' else s.myr_settle_status end;
    v_reset := v_recheck;
  end if;

  update public.sellers
     set biz_no = v_biz,
         tax_info = coalesce(tax_info, '{}'::jsonb) || jsonb_build_object('company', v_company, 'ceo', v_ceo),
         bank_info = jsonb_build_object('bank', v_bank, 'account', v_account, 'holder', v_holder),
         settle_type = 'biz',
         settle_phone = v_phone,
         myr_toss_agreed_at = coalesce(myr_toss_agreed_at, now()),
         myr_settle_status = v_status,
         myr_settle_note = case when v_reset then null else myr_settle_note end,
         myr_settle_submitted_at = case when v_reset then now() else myr_settle_submitted_at end,
         myr_settle_checked_at = case when v_reset then null else myr_settle_checked_at end,
         myr_settle_checked_by = case when v_reset then null else myr_settle_checked_by end,
         myr_toss_todo = v_todo,
         myr_toss_todo_at = case when v_todo is null then null else coalesce(myr_toss_todo_at, now()) end
   where id = s.id
  returning * into s;
  return jsonb_build_object('ok', true, 'recheck', v_recheck, 'toss_action', case when v_now then v_toss_action end, 'toss_todo', v_todo, 'info', public.myr_settle_info_json(s));
end;
$$;
revoke all on function public.myr_app_seller_settle_info_save(uuid, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_seller_settle_info_save(uuid, text, text, text, text, text, text, text, boolean) to service_role;

-- 운영 사업자 정보 확인(0085) — verify 는 승인 때 토스에 반영할 할 일이 남았으면 TOSS_PENDING
create or replace function public.myr_app_admin_settle_info_check(p_seller uuid, p_decision text, p_submitted_at timestamp with time zone, p_note text default null, p_admin uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s          public.sellers%rowtype;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_status   text;
begin
  if v_decision not in ('verify', 'reject') then return jsonb_build_object('ok', false, 'code', 'BAD_DECISION'); end if;
  select * into s from public.sellers where id = p_seller for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  -- 운영이 본 값 그대로인지 — 그사이 다시 저장했으면 거절(다시 목록을 보고 확인)
  if p_submitted_at is null or p_submitted_at is distinct from s.myr_settle_submitted_at then
    return jsonb_build_object('ok', false, 'code', 'STALE', 'submitted_at', s.myr_settle_submitted_at);
  end if;
  -- 0124: 토스 인증 대기(toss)도 운영이 직접 확인할 수 있다 — 시범운영(테스트 키)은 개인사업자 본인인증 문자가 끝까지 오지 않아 수동 지급 전에 운영이 확인한다
  if v_decision = 'verify' and s.myr_settle_status not in ('pending', 'toss') then return jsonb_build_object('ok', false, 'code', 'NOT_PENDING', 'status', s.myr_settle_status); end if;
  -- 0124: 토스에 반영할 할 일이 남았으면 확인 완료가 아니다 — 콘솔 운영 API(/api/ops/settle)가 토스에 반영한 뒤 확인한다(스크립트가 이 RPC 를 바로 불러도 막힌다)
  if v_decision = 'verify' and public.myr_seller_toss_todo_open(s) then
    return jsonb_build_object('ok', false, 'code', 'TOSS_PENDING', 'toss_todo', s.myr_toss_todo);
  end if;
  -- 2026-11-20: 토스가 크리에이터 정보를 거절한 상태(myr_toss_creator_ask = fix)면 확인 완료가 아니다 — 수동 지급이면 토스가 틀렸다고 한 계좌로 이체하게 된다.
  --   승인 때 토스 반영이 거절되면 할 일은 비워지므로 TOSS_PENDING 으로는 막히지 않는다 → 다시 입력 요청(settle-reject)
  if v_decision = 'verify' and public.myr_toss_creator_ask(s) = 'fix' then
    return jsonb_build_object('ok', false, 'code', 'TOSS_REJECTED', 'toss_error', s.toss_seller_error ->> 'code');
  end if;
  if v_decision = 'reject' and s.myr_settle_status not in ('pending', 'verified') then return jsonb_build_object('ok', false, 'code', 'NOT_PENDING', 'status', s.myr_settle_status); end if;
  if v_decision = 'reject' and (v_note is null or char_length(v_note) > 300) then return jsonb_build_object('ok', false, 'code', 'NOTE_REQUIRED'); end if;
  -- 0124: 확인 완료여도 토스 셀러가 본인인증 전이면(승인 때 다시 등록) 토스 인증 대기 — myr_settle_verify_status
  v_status := case v_decision when 'verify' then public.myr_settle_verify_status(s) else 'rejected' end;
  update public.sellers
     set myr_settle_status = v_status,
         myr_settle_note = case v_decision when 'reject' then v_note else null end,
         myr_settle_checked_at = now(),
         myr_settle_checked_by = p_admin
   where id = s.id;
  return jsonb_build_object('ok', true, 'status', v_status);
end;
$$;
revoke all on function public.myr_app_admin_settle_info_check(uuid, text, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_admin_settle_info_check(uuid, text, timestamptz, text, uuid) to service_role;

-- ---------- 토스 인증 대기(toss) — 본인인증 전에는 운영 확인이 없다 · 본인인증을 마치면 확인 완료 ----------
alter table public.sellers drop constraint if exists sellers_myr_settle_status_check;
alter table public.sellers add constraint sellers_myr_settle_status_check check (myr_settle_status in ('none', 'pending', 'verified', 'rejected', 'toss'));

-- 토스 인증 대기였는데 본인인증을 마쳤나 — 그러면 사업자 · 정산 정보 확인 완료
create or replace function public.myr_settle_toss_done(s public.sellers)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce(s.myr_settle_status = 'toss', false) and public.myr_toss_verified(s) and public.myr_toss_creator_ask(s) is distinct from 'fix'
$$;
revoke all on function public.myr_settle_toss_done(public.sellers) from public, anon, authenticated;

-- 요약 카드 연락처 = 확인이 끝난 대표자 휴대폰(2026-11-20 결정 · 연락처와 대표자 휴대폰을 하나로) — 사업자 · 정산 정보가 확인 완료면 대표자 휴대폰,
--   아니면(확인 중 · 토스 인증 대기 · 다시 입력 요청 · 미입력) 지금 연락처 그대로. 확인 완료가 되는 순간(본인인증 완료 · 운영 확인 · 재인증 완료) 트리거가 적는다
create or replace function public.myr_seller_contact_phone(s public.sellers)
returns text
language sql
stable
set search_path to 'public'
as $$
  select case when public.myr_seller_settle_verified(s.myr_settle_status) and s.settle_phone is not null then s.settle_phone else s.contact_phone end
$$;
revoke all on function public.myr_seller_contact_phone(public.sellers) from public, anon, authenticated;

create or replace function public.sellers_myr_toss_done()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if public.myr_settle_toss_done(new) then
    new.myr_settle_status := 'verified';
    new.myr_settle_checked_at := now();
    new.myr_settle_checked_by := null;
  end if;
  -- 확인 완료가 되면 요약 카드 연락처도 그 대표자 휴대폰으로(myr_seller_contact_phone)
  new.contact_phone := public.myr_seller_contact_phone(new);
  return new;
end;
$$;
revoke all on function public.sellers_myr_toss_done() from public, anon, authenticated;

drop trigger if exists sellers_myr_toss_done on public.sellers;
-- 이미 확인 완료인 크리에이터의 연락처를 대표자 휴대폰으로 맞춘다 — 덮어쓰기 전 값은 백업 표에 남긴다(되돌리기 · 2026-11-20)
--   되돌리기: update public.sellers s set contact_phone = b.contact_phone from public.myr_contact_phone_before_0124 b where b.seller_id = s.id;
create table if not exists public.myr_contact_phone_before_0124 (
  seller_id     uuid primary key references public.sellers(id) on delete cascade,
  contact_phone text,
  settle_phone  text,
  saved_at      timestamptz not null default now()
);
comment on table public.myr_contact_phone_before_0124 is '0124 가 요약 카드 연락처를 대표자 휴대폰으로 맞추기 전 연락처(되돌리기용) — 정책 없음(service_role 만)';
alter table public.myr_contact_phone_before_0124 enable row level security;
revoke all on table public.myr_contact_phone_before_0124 from public, anon, authenticated;

-- 백업 → 덮어쓰기(한 번 · 바뀐 행 수). 이미 백업이 있으면 처음 값을 그대로 둔다
create or replace function public.myr_contact_phone_backfill_0124()
returns integer
language plpgsql
set search_path to 'public'
as $$
declare
  v_n integer;
begin
  insert into public.myr_contact_phone_before_0124 (seller_id, contact_phone, settle_phone)
    select s.id, s.contact_phone, s.settle_phone from public.sellers s where s.contact_phone is distinct from public.myr_seller_contact_phone(s)
    on conflict (seller_id) do nothing;
  update public.sellers s set contact_phone = public.myr_seller_contact_phone(s) where s.contact_phone is distinct from public.myr_seller_contact_phone(s);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.myr_contact_phone_backfill_0124() from public, anon, authenticated;
select public.myr_contact_phone_backfill_0124();
create trigger sellers_myr_toss_done
  before update of toss_seller_status, toss_seller_error, myr_settle_status, settle_phone on public.sellers
  for each row
  execute function public.sellers_myr_toss_done();
