-- ============================================================
-- 0127 · MYR 지급 = 토스 지급대행 자동 이체만(2026-11-24 결정) — 수동 이체 경로를 걷어내고 크론 · 웹훅 · 매시간 확인으로
--
--   결정(2026-11-24): 지급 방식 manual 을 없애고 토스 지급대행 하나로 간다. 시범운영은 테스트 키(peerkeamf5)라 돈이 나가지 않고,
--     샵 결제도 테스트 키라 받은 돈도 없다 — 처음부터 최종 구조로 둔다. 토스 본인인증 전 크리에이터는 보류(toss_auth · 0122)라 보내지 않는다.
--     운영이 직접 "지급 완료"를 적는 기능(myr_payout_mark_paid)은 예외용으로만 남긴다 — 토스가 끝내 결과를 알려 주지 않는 "결과 확인 필요" 건을
--     운영이 토스 대시보드에서 확인하고 마무리할 때(docs/myr-admin-screens.md §11-2). 수동 이체 목록(계좌 원문 · myr_payout_to_pay)은 지운다.
--
--   토스 규칙(docs.tosspayments.com 2026-11-24 확인):
--     바로지급(EXPRESS)은 영업일 08:00~15:00 에만 요청할 수 있다 → 크론은 영업일 13:05(정산 크론 13:00 바로 뒤).
--     refPayoutId 는 다시 쓸 수 없다 → 시도마다 참조 번호 transfer_ref = '<지급 건 id>-<시도 횟수>'(≤ 50자).
--     멱등 키는 15일 유효 · 같은 키로 다시 보내면 같은 결과 → 결과를 모르면(5xx · 응답 없음) 같은 시도의 키('myr-po-' || transfer_ref)로 다시 확인한다.
--     요청 하나가 실패하면 그 요청 전체가 실패한다 → 지급 건마다 한 요청(시범운영 규모 · 실패가 서로 번지지 않게).
--     실패한 지급(FAILED)의 error.code 목록은 문서에 없다 → 계좌 오류 코드만 account, 나머지는 재시도(실패면 돈이 나가지 않았다) · 3번째부터 운영(ops).
--     웹훅 payout.changed 는 COMPLETED · FAILED(REJECTED 도 FAILED 로) 때만 온다.
--
--   설정: platform_settings.myr_payout.mode 는 'toss' 만(제약) — 운영 값이 manual 이면 toss 로 바꾸고, 트리거(0122 platform_settings_myr_payout_refresh)가
--         지급 건 상태를 전부 다시 정한다(토스 본인인증 전이면 지급 보류 · 토스 본인인증 전).
--   칸(myr_payouts): transfer_ref(이번 시도 참조 번호 · 유일) · toss_payout_id(토스 지급 id) · transfer_error(토스 오류 원문 — 운영용)
--   지급 기록(myr_payout_logs.action): + toss_request(토스에 요청) · toss_failed(실패 · 종류) · toss_retry(운영이 다시 보내기) · toss_confirmed(운영 예외 기록 뒤 토스가 완료를 알려 옴)
--   판정:
--     myr_payout_toss_outcome(status)        토스 지급 상태 → paid · sending · failed · check(모름)
--     myr_payout_toss_fail_kind(code, tries) 토스 오류 코드 → retry · account · ops · check(실패 종류 0111)
--     myr_payout_send_window(now)            지금 토스에 바로지급을 요청할 수 있나(영업일 · 한국 08:00~15:00)
--     myr_payout_unknown(p)                  결과 모름(실패 종류 check) — 0122 myr_payout_requested_on 도 이 함수로
--     myr_toss_ready(s)                      0122 정의 + 토스 셀러 있음(0124 myr_toss_registered) — 셀러 id 가 없으면 지급 가능이 아니다(보류 이유 toss_auth).
--                                            전에는 카드 상태만 봐서 셀러 id 없이 상태만 남은 크리에이터가 화면은 "지급 대기" · ③ 완료인데 크론은 보내지 못했다.
--                                            보류 이유 · 정산 상세 ③ · 정보 응답 · 보낼 목록 · 송금 시작이 모두 이 함수 하나를 본다 · 트리거 sellers_myr_payout_refresh 에 toss_seller_id 를 더한다
--     myr_payout_idem_key(ref)               이번 시도의 멱등 키 'myr-po-' || 참조 번호 — 시작 · 매시간 다시 요청이 같이 쓴다
--   기록:
--     myr_payout_record_paid(id, paid_on, note, actor, now)  지급 완료 적기 — 크론 완료와 운영 예외 기록(myr_payout_mark_paid)이 같이 쓴다 · 이체 상태를 비운다
--                                                           (0103 은 이체 상태를 비우지 않아 "결과 확인 필요" 건을 운영이 마무리하면 칸 제약에 걸렸다)
--   RPC(service role 만 · 크론 · 웹훅):
--     myr_payout_send_list(now)                 지금 보낼 지급 건 [{ id, amount }] — 요청할 수 있는 시간이 아니면 []
--     myr_payout_send_begin(id, available, now) 잠그고 잔액 · 하루 한도 가드(0122 myr_payout_guard) → 송금 중 · 시도 +1 · 참조 번호 · 멱등 키.
--                                                거절: NOT_FOUND(없는 지급 건) · OUT_OF_WINDOW(바로지급 요청 시간이 아님) · NOT_SENDABLE(토스로 지급 가능이 아님 · 보낼 수 없는 상태) ·
--                                                      가드 코드 그대로(BALANCE_UNKNOWN · BALANCE_EXCEEDED · DAILY_CAP_EXCEEDED) — 지급 건은 그대로(다음 영업일에 다시)
--     myr_payout_send_result(ref, status, toss_id, code, error, now)  토스 결과 적기 — 완료면 지급 완료 · 요청 · 진행 중이면 송금 중 · 실패면 실패 종류 · 모르면 결과 확인 필요.
--                                                거절: NOT_FOUND(지난 시도의 참조 번호 — 다른 시도가 이미 시작했다)
--     myr_payout_check_list(now)                매시간 확인할 지급 건 — 송금 중(토스 id 로 조회) · 결과 확인 필요(같은 키로 다시 요청 · 요청할 수 있는 시간에만)
--     myr_payout_send_retry(month, handle, note, actor)  운영 — 실패한 지급 건을 다음 자동 이체에 다시 보낸다(운영 조치 필요 · 결과 확인 필요를 토스에서 확인한 뒤).
--                                                거절: NOT_FOUND · ALREADY_PAID · NOT_FAILED · NOTE_REQUIRED. 결과 확인 필요(check)는 토스에서 "실패"를 확인했을 때만 —
--                                                실제로 나갔으면 다시 보내지 말고 myr_payout_mark_paid(예외 기록)로 마무리한다(두 번 나간다)
--   계좌 실패 자동 재시도: myr_payout_account_fixed(p, s) — 계좌 문제로 실패한 뒤 사업자 · 정산 정보가 다시 확인됐다(확인 시각 > 마지막 시도) →
--     myr_payout_refresh(0102 정의 · 트리거 sellers_myr_payout_refresh 가 부른다)가 실패 종류를 retry 로 — 다음 자동 이체에 다시 보낸다
--   지급 완료 취소(0103 myr_payout_unmark_paid) — 토스가 완료로 알려 준 건(myr_payout_paid_by_toss · paid_by 'toss')은 거절 PAID_BY_TOSS(리뷰 2026-11-24):
--     취소하면 자동 상태(지급 대기)로 돌아가 이체 상태도 비어 있어 다음 13:05 에 새 참조 번호로 다시 나간다 — 두 번 지급. 운영 예외 기록(paid)으로 적은 건은 그대로 취소할 수 있다.
--     운영이 "결과 확인 필요"를 예외 기록으로 마무리한 뒤 토스가 같은 시도를 COMPLETED 로 알려 오면 결과 기록이 paid_by 를 'toss' 로 바꾼다(toss_confirmed) — 그 뒤 취소도 PAID_BY_TOSS
--   지움: myr_payout_to_pay(month)(수동 이체 목록 · 계좌 원문) — myr-settle.mjs to-pay 도 지운다
--   테스트: supabase/tests/myr_payout_toss_auto.test.sql
-- ============================================================

-- ---------- 지급 방식: 토스만 ----------
alter table public.platform_settings drop constraint if exists platform_settings_myr_payout_check;
update public.platform_settings set value = jsonb_set(value, '{mode}', '"toss"') where key = 'myr_payout' and value ->> 'mode' is distinct from 'toss';
alter table public.platform_settings add constraint platform_settings_myr_payout_check check (
  key <> 'myr_payout' or (value ->> 'mode' = 'toss' and coalesce(value ->> 'daily_cap', '') ~ '^[0-9]{1,12}$'));

-- ---------- 칸 ----------
alter table public.myr_payouts
  add column if not exists transfer_ref text,
  add column if not exists toss_payout_id text,
  add column if not exists transfer_error jsonb;
create unique index if not exists myr_payouts_transfer_ref_uidx on public.myr_payouts (transfer_ref) where transfer_ref is not null;
comment on column public.myr_payouts.transfer_ref is '토스 지급 요청 참조 번호(refPayoutId) — 시도마다 <id>-<시도> · 멱등 키는 myr-po-<이 값>(0127)';
comment on column public.myr_payouts.toss_payout_id is '토스 지급 id(0127) — 매시간 조회 · 웹훅';
comment on column public.myr_payouts.transfer_error is '토스 오류 원문 { code, message }(0127) — 운영 확인용 · 크리에이터에게 보이지 않는다';

alter table public.myr_payout_logs drop constraint if exists myr_payout_logs_action_check;
alter table public.myr_payout_logs add constraint myr_payout_logs_action_check check (action in ('paid', 'unpaid', 'toss_request', 'toss_failed', 'toss_retry', 'toss_confirmed'));

-- ---------- 판정 ----------
create or replace function public.myr_payout_toss_outcome(p_status text)
returns text
language sql
immutable
as $$
  select case when p_status = 'COMPLETED' then 'paid'
              when p_status in ('REQUESTED', 'IN_PROGRESS') then 'sending'
              when p_status in ('FAILED', 'REJECTED', 'CANCELED', 'DELETED') then 'failed'
              else 'check' end
$$;
revoke all on function public.myr_payout_toss_outcome(text) from public, anon, authenticated;

-- 실패 종류(0111) — 결과를 모르면 check(같은 키로 다시 확인) · 계좌 오류는 account(크리에이터가 다시 입력) ·
--   토스 잔액 부족은 retry(다음 영업일 자동 — 운영 할 일 아님 · screens §3) · 3번째 실패부터 ops · 키 · 상점 · 셀러 문제는 ops · 그 밖은 retry
--   실측(2026-11-24 테스트 키 · 산업은행 실패용 계좌): 실패 지급의 error.code = TRANSFER_FAILED("타행이체 불가계좌") — 일반 이체 실패 코드일 수 있어
--   계좌 오류(account)로 넣지 않고 retry 로 둔다(결정 B · 2026-11-24): 일시 실패면 저절로 풀리고, 계좌 문제면 3번째에 ops — 운영은 transfer_error 원문을 보고 안내한다
create or replace function public.myr_payout_toss_fail_kind(p_code text, p_tries integer)
returns text
language sql
immutable
as $$
  select case when p_code is null or p_code in ('UNCERTAIN', 'COMMON_ERROR', 'PREVIOUS_REQUEST_IN_PROGRESS', 'IDEMPOTENT_REQUEST_PROCESSING') then 'check'
              when p_code in ('INVALID_ACCOUNT_INFO', 'BANK_ACCOUNT_VERIFICATION_FAIL', 'INVALID_ACCOUNT_NUMBER', 'RESTRICTED_TRANSFER_ACCOUNT', 'NOT_MATCH_PAYEE_NAME', 'INVALID_STOPPED_ACCOUNT') then 'account'
              when p_code in ('EXCEEDED_PAYOUT_BALANCE_AMOUNT', 'NOT_ENOUGH_AMOUNT') then 'retry'
              when coalesce(p_tries, 0) >= 3 then 'ops'
              when p_code in ('UNAUTHORIZED_KEY', 'INVALID_ENCRYPTION', 'FORBIDDEN_REQUEST', 'FORBIDDEN_SELLER_PAYOUT', 'FORBIDDEN_OVERDUE_PAYOUT_FEE', 'FORBIDDEN_ACCOUNT_SUSPENDED',
                              'NOT_FOUND_SELLER', 'INVALID_SELLER_INFO', 'INVALID_REQUEST', 'INVALID_PAYOUT_REQUEST', 'DUPLICATE_PAYOUT_REQUEST', 'EXCEED_MAXIMUM_REQUESTS', 'INVALID_IDEMPOTENCY_KEY') then 'ops'
              else 'retry' end
$$;
revoke all on function public.myr_payout_toss_fail_kind(text, integer) from public, anon, authenticated;

-- 결과 모름(실패 종류 check) — 0122 그날 요청한 지급 건(myr_payout_requested_on)과 매시간 확인이 같이 쓴다
create or replace function public.myr_payout_unknown(p public.myr_payouts)
returns boolean
language sql
immutable
as $$
  select coalesce(p.transfer_fail = 'check', false)
$$;
revoke all on function public.myr_payout_unknown(public.myr_payouts) from public, anon, authenticated;

-- 0122 정의 — 결과 모름은 myr_payout_unknown
create or replace function public.myr_payout_requested_on(p public.myr_payouts, p_day date)
returns boolean
language sql
immutable
as $$
  select coalesce(public.myr_kst_date(p.transfer_at) = p_day and (p.transfer_fail is null or public.myr_payout_unknown(p)), false)
$$;
revoke all on function public.myr_payout_requested_on(public.myr_payouts, date) from public, anon, authenticated;

-- 0122 정의 + 토스 셀러 있음 — 판정 하나(보류 이유 · 정산 상세 ③ · 정보 응답 · 보낼 목록 · 송금 시작)
create or replace function public.myr_toss_ready(s public.sellers)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce(public.myr_toss_card_state(s) in ('partial', 'approved', 'corporate') and public.myr_toss_registered(s), false)
$$;
revoke all on function public.myr_toss_ready(public.sellers) from public, anon, authenticated;

-- 0122 트리거 + toss_seller_id — 지급 가능이 셀러 id 도 보므로 셀러 id 가 바뀌면(등록 · 삭제) 지급 건을 다시 정한다
drop trigger if exists sellers_myr_payout_refresh on public.sellers;
create trigger sellers_myr_payout_refresh
  after update of myr_settle_status, toss_seller_status, toss_seller_error, biz_no, toss_seller_id on public.sellers
  for each row
  when (old.myr_settle_status is distinct from new.myr_settle_status
        or old.toss_seller_status is distinct from new.toss_seller_status
        or old.toss_seller_error is distinct from new.toss_seller_error
        or old.biz_no is distinct from new.biz_no
        or old.toss_seller_id is distinct from new.toss_seller_id)
  execute function public.sellers_myr_payout_refresh();

create or replace function public.myr_payout_idem_key(p_ref text)
returns text
language sql
immutable
as $$
  select 'myr-po-' || p_ref
$$;
revoke all on function public.myr_payout_idem_key(text) from public, anon, authenticated;

create or replace function public.myr_payout_send_window(p_now timestamptz default now())
returns boolean
language sql
stable
as $$
  select public.myr_is_business_day(public.myr_kst_date(p_now))
     and (p_now at time zone 'Asia/Seoul')::time >= time '08:00'
     and (p_now at time zone 'Asia/Seoul')::time < time '15:00'
$$;
revoke all on function public.myr_payout_send_window(timestamptz) from public, anon, authenticated;

-- ---------- 지급 완료 적기(크론 · 운영 예외 기록 공용) ----------
create or replace function public.myr_payout_record_paid(p_id uuid, p_paid_on date, p_note text, p_actor text, p_now timestamptz default now())
returns public.myr_payouts
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v      public.myr_payouts%rowtype;
  v_amt  integer;
  v_bank jsonb;
begin
  select * into v from public.myr_payouts where id = p_id for update;
  v_amt := public.myr_payout_amount(v);
  v_bank := public.myr_payout_bank_snapshot(v.seller_id);
  update public.myr_payouts
     set status = 'paid', hold_reason = null, hold_note = null, held_by = null, held_at = null,
         paid_at = p_now, paid_on = p_paid_on, paid_amount = v_amt, paid_bank = v_bank,
         paid_note = nullif(btrim(coalesce(p_note, '')), ''), paid_by = coalesce(p_actor, 'script'),
         transfer_state = null, transfer_fail = null, updated_at = now()
   where id = v.id returning * into v;
  insert into public.myr_payout_logs (payout_id, action, amount, paid_on, bank, note, actor)
  values (v.id, 'paid', v_amt, p_paid_on, v_bank, v.paid_note, coalesce(p_actor, 'script'));
  return v;
end;
$$;
revoke all on function public.myr_payout_record_paid(uuid, date, text, text, timestamptz) from public, anon, authenticated;

-- 운영 예외 기록(0103 정의) — 검사는 그대로 · 적기는 myr_payout_record_paid(이체 상태를 비운다)
create or replace function public.myr_payout_mark_paid(p_month date, p_handle text, p_amount integer, p_paid_on date, p_note text, p_actor text, p_now timestamptz default now())
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v      public.myr_payouts%rowtype;
  v_run  public.myr_settlement_runs%rowtype;
  v_amt  integer;
begin
  v := public.myr_payout_find(p_month, p_handle);
  if v.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select * into v from public.myr_payouts where id = v.id for update;
  if public.myr_payout_is_paid(v) then return jsonb_build_object('ok', false, 'code', 'ALREADY_PAID', 'paid_on', v.paid_on); end if;
  if not public.myr_payout_payable(v) then
    return jsonb_build_object('ok', false, 'code', 'NOT_PAYABLE', 'status', v.status, 'hold_reason', v.hold_reason, 'hold_label', public.myr_payout_hold_label(v.hold_reason));
  end if;
  v_amt := public.myr_payout_amount(v);
  if p_amount is distinct from v_amt then return jsonb_build_object('ok', false, 'code', 'AMOUNT_MISMATCH', 'amount', v_amt); end if;
  select * into v_run from public.myr_settlement_runs where id = v.run_id;
  if p_paid_on is null then return jsonb_build_object('ok', false, 'code', 'BAD_DATE'); end if;
  if p_paid_on > public.myr_kst_date(p_now) then return jsonb_build_object('ok', false, 'code', 'FUTURE_DATE'); end if;
  if p_paid_on < public.myr_kst_date(v_run.cutoff_at) then return jsonb_build_object('ok', false, 'code', 'BEFORE_RUN', 'run_on', public.myr_kst_date(v_run.cutoff_at)); end if;
  v := public.myr_payout_record_paid(v.id, p_paid_on, p_note, p_actor, p_now);
  return jsonb_build_object('ok', true, 'amount', v.paid_amount, 'paid_on', v.paid_on, 'bank', v.paid_bank);
end;
$$;
revoke all on function public.myr_payout_mark_paid(date, text, integer, date, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_payout_mark_paid(date, text, integer, date, text, text, timestamptz) to service_role;

-- ---------- 지급 완료 취소 — 토스가 완료한 건은 막는다 ----------
create or replace function public.myr_payout_paid_by_toss(p public.myr_payouts)
returns boolean
language sql
immutable
as $$
  select coalesce(public.myr_payout_is_paid(p) and p.paid_by = 'toss', false)
$$;
revoke all on function public.myr_payout_paid_by_toss(public.myr_payouts) from public, anon, authenticated;

-- 0103 정의 + PAID_BY_TOSS
create or replace function public.myr_payout_unmark_paid(p_month date, p_handle text, p_reason text, p_actor text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v        public.myr_payouts%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  v := public.myr_payout_find(p_month, p_handle);
  if v.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_reason = '' then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;
  select * into v from public.myr_payouts where id = v.id for update;
  if not public.myr_payout_is_paid(v) then return jsonb_build_object('ok', false, 'code', 'NOT_PAID'); end if;
  -- 토스가 완료로 알려 준 건은 실제로 돈이 나갔다 — 취소하면 다음 자동 이체에 다시 나간다(두 번 지급)
  if public.myr_payout_paid_by_toss(v) then return jsonb_build_object('ok', false, 'code', 'PAID_BY_TOSS', 'paid_on', v.paid_on); end if;
  insert into public.myr_payout_logs (payout_id, action, amount, paid_on, bank, note, actor)
  values (v.id, 'unpaid', v.paid_amount, v.paid_on, v.paid_bank, v_reason, coalesce(p_actor, 'script'));
  -- 지급 완료를 지우고 자동 상태로(사업자 정보 확인 전이면 지급 보류)
  update public.myr_payouts p
     set (status, hold_reason) = (select a.status, a.hold_reason from public.myr_payout_auto_state(v) a),
         paid_at = null, paid_on = null, paid_amount = null, paid_bank = null, paid_note = null, paid_by = null, updated_at = now()
   where p.id = v.id returning * into v;
  return jsonb_build_object('ok', true, 'status', v.status, 'hold_reason', v.hold_reason);
end;
$$;
revoke all on function public.myr_payout_unmark_paid(date, text, text, text) from public, anon, authenticated;
grant execute on function public.myr_payout_unmark_paid(date, text, text, text) to service_role;

-- ---------- 실패 다시 보내기 ----------
create or replace function public.myr_payout_account_fixed(p public.myr_payouts, s public.sellers)
returns boolean
language sql
immutable
as $$
  select coalesce(p.transfer_fail = 'account' and public.myr_seller_settle_verified(s.myr_settle_status) and s.myr_settle_checked_at > p.transfer_at, false)
$$;
revoke all on function public.myr_payout_account_fixed(public.myr_payouts, public.sellers) from public, anon, authenticated;

-- 0102 정의 + 계좌 실패 뒤 다시 확인되면 재시도로(트리거 sellers_myr_payout_refresh · 지급 방식 트리거가 부른다)
create or replace function public.myr_payout_refresh(p_payout_id uuid)
returns void
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v public.myr_payouts%rowtype;
  s public.sellers%rowtype;
begin
  select * into v from public.myr_payouts where id = p_payout_id for update;
  if not found then return; end if;
  select * into s from public.sellers where id = v.seller_id;
  if public.myr_payout_account_fixed(v, s) then
    update public.myr_payouts set transfer_fail = 'retry', updated_at = now() where id = v.id returning * into v;
  end if;
  if not public.myr_payout_status_auto(v) then return; end if;
  update public.myr_payouts p
     set (status, hold_reason) = (select a.status, a.hold_reason from public.myr_payout_auto_state(v) a), updated_at = now()
   where p.id = v.id;
end;
$$;
revoke all on function public.myr_payout_refresh(uuid) from public, anon, authenticated;

create or replace function public.myr_payout_send_retry(p_month date, p_handle text, p_note text, p_actor text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v      public.myr_payouts%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
  v_was  text;
begin
  v := public.myr_payout_find(p_month, p_handle);
  if v.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_note = '' then return jsonb_build_object('ok', false, 'code', 'NOTE_REQUIRED'); end if;
  select * into v from public.myr_payouts where id = v.id for update;
  if public.myr_payout_is_paid(v) then return jsonb_build_object('ok', false, 'code', 'ALREADY_PAID', 'paid_on', v.paid_on); end if;
  if v.transfer_fail is null then return jsonb_build_object('ok', false, 'code', 'NOT_FAILED'); end if;
  v_was := v.transfer_fail;
  update public.myr_payouts set transfer_fail = 'retry', updated_at = now() where id = v.id;
  insert into public.myr_payout_logs (payout_id, action, amount, note, actor)
  values (v.id, 'toss_retry', public.myr_payout_amount(v), v_was || ' → retry · ' || v_note, coalesce(p_actor, 'script'));
  return jsonb_build_object('ok', true, 'was', v_was);
end;
$$;
revoke all on function public.myr_payout_send_retry(date, text, text, text) from public, anon, authenticated;
grant execute on function public.myr_payout_send_retry(date, text, text, text) to service_role;

-- ---------- 크론 · 웹훅 RPC ----------
create or replace function public.myr_payout_send_list(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'amount', public.myr_payout_amount(p)) order by p.created_at, p.id), '[]'::jsonb)
    from public.myr_payouts p
    join public.sellers s on s.id = p.seller_id
   where public.myr_payout_send_window(p_now)
     and public.myr_payout_sendable(p)
     and public.myr_toss_ready(s)
$$;
revoke all on function public.myr_payout_send_list(timestamptz) from public, anon, authenticated;
grant execute on function public.myr_payout_send_list(timestamptz) to service_role;

create or replace function public.myr_payout_send_begin(p_id uuid, p_available bigint, p_now timestamptz default now())
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v       public.myr_payouts%rowtype;
  s       public.sellers%rowtype;
  v_guard jsonb;
  v_ref   text;
begin
  select * into v from public.myr_payouts where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select * into s from public.sellers where id = v.seller_id;
  if not public.myr_payout_send_window(p_now) then return jsonb_build_object('ok', false, 'code', 'OUT_OF_WINDOW'); end if;
  if not public.myr_toss_ready(s) then return jsonb_build_object('ok', false, 'code', 'NOT_SENDABLE', 'ids', jsonb_build_array(v.id)); end if;
  v_guard := public.myr_payout_guard(p_available, array[v.id], p_now);
  if not coalesce((v_guard ->> 'ok')::boolean, false) then return v_guard; end if;
  v_ref := v.id::text || '-' || (v.transfer_tries + 1);
  update public.myr_payouts
     set transfer_state = 'sending', transfer_fail = null, transfer_tries = transfer_tries + 1, transfer_at = p_now,
         transfer_ref = v_ref, toss_payout_id = null, transfer_error = null, updated_at = now()
   where id = v.id returning * into v;
  insert into public.myr_payout_logs (payout_id, action, amount, note, actor)
  values (v.id, 'toss_request', public.myr_payout_amount(v), v_ref, 'toss');
  -- available_after — 토스가 받아 주면(결과 accepted) 이번 실행의 다음 건 가드에 넘길 지급 가능 금액(화면 · 크론이 빼기를 다시 하지 않게)
  return jsonb_build_object('ok', true, 'id', v.id, 'ref', v_ref, 'key', public.myr_payout_idem_key(v_ref), 'toss_seller_id', s.toss_seller_id,
                            'amount', public.myr_payout_amount(v), 'available_after', p_available - public.myr_payout_amount(v));
end;
$$;
revoke all on function public.myr_payout_send_begin(uuid, bigint, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_payout_send_begin(uuid, bigint, timestamptz) to service_role;

-- 토스 결과 — p_status 는 토스 지급 상태(요청 자체가 실패했으면 null · 오류 코드로 실패 종류) · 결과를 모르면 p_code 'UNCERTAIN'
create or replace function public.myr_payout_send_result(p_ref text, p_status text, p_toss_id text, p_code text, p_error jsonb, p_now timestamptz default now())
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v       public.myr_payouts%rowtype;
  v_out   text;
  v_kind  text;
begin
  select * into v from public.myr_payouts where transfer_ref = p_ref for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if public.myr_payout_is_paid(v) then
    -- 운영 예외 기록 뒤 토스가 같은 시도를 완료로 알려 옴 → 토스 완료로(그 뒤 지급 완료 취소는 PAID_BY_TOSS — 취소하면 두 번 지급)
    if public.myr_payout_toss_outcome(p_status) = 'paid' and not public.myr_payout_paid_by_toss(v) then
      update public.myr_payouts set paid_by = 'toss', toss_payout_id = coalesce(p_toss_id, toss_payout_id), updated_at = now() where id = v.id;
      insert into public.myr_payout_logs (payout_id, action, amount, paid_on, note, actor)
      values (v.id, 'toss_confirmed', v.paid_amount, v.paid_on, '운영 예외 기록(' || coalesce(v.paid_by, '—') || ') 뒤 토스 완료 · ' || coalesce(p_toss_id, '—') || ' · ' || p_ref, 'toss');
      return jsonb_build_object('ok', true, 'result', 'paid', 'already', true, 'confirmed', true);
    end if;
    return jsonb_build_object('ok', true, 'result', 'paid', 'already', true);
  end if;
  v_out := case when p_status is not null then public.myr_payout_toss_outcome(p_status)
                when public.myr_payout_toss_fail_kind(p_code, v.transfer_tries) = 'check' then 'check'
                else 'failed' end;
  if v_out = 'paid' then
    update public.myr_payouts set toss_payout_id = coalesce(p_toss_id, toss_payout_id), transfer_error = null where id = v.id;
    v := public.myr_payout_record_paid(v.id, public.myr_kst_date(p_now), '토스 지급 ' || coalesce(p_toss_id, v.toss_payout_id, p_ref), 'toss', p_now);
    return jsonb_build_object('ok', true, 'result', 'paid', 'accepted', true, 'paid_on', v.paid_on);
  end if;
  if v_out = 'sending' then
    update public.myr_payouts set transfer_state = 'sending', transfer_fail = null, toss_payout_id = coalesce(p_toss_id, toss_payout_id), transfer_error = null, updated_at = now()
     where id = v.id;
    return jsonb_build_object('ok', true, 'result', 'sending', 'accepted', true);
  end if;
  v_kind := case when v_out = 'check' then 'check' else public.myr_payout_toss_fail_kind(coalesce(p_code, p_status), v.transfer_tries) end;
  -- 토스가 실패로 끝냈는데 코드가 "모름" 쪽이면 — 돈이 나가지 않았으니 코드 없는 실패로(재시도 · 3번째부터 운영)
  if v_out = 'failed' and v_kind = 'check' then v_kind := public.myr_payout_toss_fail_kind('FAILED', v.transfer_tries); end if;
  update public.myr_payouts
     set transfer_state = 'failed', transfer_fail = v_kind, toss_payout_id = coalesce(p_toss_id, toss_payout_id),
         transfer_error = coalesce(p_error, jsonb_build_object('code', p_code)), updated_at = now()
   where id = v.id;
  insert into public.myr_payout_logs (payout_id, action, amount, note, actor)
  values (v.id, 'toss_failed', public.myr_payout_amount(v), v_kind || ' · ' || coalesce(p_code, p_status, '—') || ' · ' || p_ref, 'toss');
  return jsonb_build_object('ok', true, 'result', v_out, 'accepted', false, 'kind', v_kind);
end;
$$;
revoke all on function public.myr_payout_send_result(text, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_payout_send_result(text, text, text, text, jsonb, timestamptz) to service_role;

-- 매시간 확인 — 송금 중(토스 id 가 있으면 조회) · 결과 확인 필요(같은 키로 다시 요청 — 바로지급을 요청할 수 있는 시간에만)
create or replace function public.myr_payout_check_list(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'ref', p.transfer_ref, 'key', public.myr_payout_idem_key(p.transfer_ref), 'toss_payout_id', p.toss_payout_id,
           'toss_seller_id', s.toss_seller_id, 'amount', public.myr_payout_amount(p),
           'action', case when p.toss_payout_id is not null then 'get' else 'resend' end)
         order by p.transfer_at, p.id), '[]'::jsonb)
    from public.myr_payouts p
    join public.sellers s on s.id = p.seller_id
   where p.transfer_ref is not null
     and not public.myr_payout_is_paid(p)
     and (public.myr_payout_sending(p) or public.myr_payout_unknown(p))
     and (p.toss_payout_id is not null or public.myr_payout_send_window(p_now))
$$;
revoke all on function public.myr_payout_check_list(timestamptz) from public, anon, authenticated;
grant execute on function public.myr_payout_check_list(timestamptz) to service_role;

-- ---------- 지움: 수동 이체 목록(계좌 원문) ----------
drop function if exists public.myr_payout_to_pay(date);
