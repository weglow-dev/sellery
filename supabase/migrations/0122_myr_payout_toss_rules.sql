-- ============================================================
-- 0122 · MYR 토스 지급대행 판정 — 토스로 지급 가능 · 보류 이유 "토스 본인인증 전" · 영업일 · 공유 잔액 가드 · 하루 한도 · 계좌 8~14자리 (2026-11-19)
--
--   docs/myr.md 7-7 3번. 판정은 DB 한 곳에 둔다 — 셀러리 packages/payments 의 판정(tossSellerReady · 영업일 · checkPayoutGuard)은 복사하지 않았다(0122 이전 #328).
--
--   지급 방식 설정 platform_settings 'myr_payout' = { mode: 'manual' | 'toss', daily_cap: 원 }  (셀러리 0040 payout_mode 와 같은 방식)
--     manual(기본) — 지금처럼 운영이 직접 이체하고 기록한다(myr-settle.mjs paid). 토스 상태를 보지 않는다.
--                    시범운영은 테스트 키라 실제 돈은 수동 이체로 나가고, 토스 테스트 환경은 법인만 등록돼 개인사업자는 "인증 완료"가 될 수 없다
--                    — 토스 보류를 처음부터 켜면 개인사업자 지급이 전부 막힌다.
--     toss          — 실키 전환 때 운영이 바꾼다. 크리에이터 쪽 보류 이유에 "토스 본인인증 전"이 더해진다. 바꾸면 지급 건 상태를 전부 다시 정한다(트리거).
--   myr_payout_toss_on()            지급 방식이 토스인지
--   myr_payout_daily_cap()          MYR 하루 지급 한도(기본 5,000,000 — 셀러리 기본값과 같다)
--   myr_toss_ready(seller)          토스로 지급 가능 — 0121 카드 상태가 인증 완료(partial · 한 주 1천만 원 미만) · 한도 없음(approved) · 법인(corporate).
--                                   토스가 정보를 거절했거나(rejected) 본인인증 전(wait) · 추가 인증(kyc) · 등록 전(none)이면 아니다
--   myr_seller_hold_reasons(seller) 크리에이터 쪽 보류 이유 전부 — 사업자 · 정산 정보 확인 전(settle_info) → 토스 본인인증 전(toss_auth · 토스 방식일 때만).
--                                   둘이 같이 걸리면 둘 다(운영 확인 대기 뒤에 크리에이터가 할 토스 본인인증이 가려지지 않게)
--   myr_seller_hold_reason(seller)  그 첫 이유 — 지급 건 상태 칸(hold_reason)은 하나
--   myr_payout_hold_reasons(p)      지급 건 보류 이유 전부(0104) = 크리에이터 쪽 이유 전부 → 세금계산서(tax_invoice)
--   myr_payout_hold_list_json(codes) [{ code, label }] — 지급 건 보류 목록(myr_payout_holds_json) · 다음 정산 보류 이유가 같이 쓴다
--   myr_seller_next_hold_json(seller) { code, label }(첫 이유 — 홈 배너 · 정산 탭 칩) + all(이유 전부 — 정산 상세 "보류 사유")
--   보류 이유 표 제약 · 문구(myr_payout_hold_label)에 toss_auth '토스 본인인증 전'
--   트리거 sellers_myr_payout_refresh — 사업자 정보 확인 상태에 더해 토스 셀러 상태 · 오류 · 사업자번호(카드 상태가 읽는 칸)가 바뀔 때도 지급 건을 다시 정한다
--
--   영업일(토스 지급대행은 영업일에만 · 2026-11-18 결정 "영업일 오후 1시")
--     표 myr_holidays(day · name · source) — 공휴일 · 대체공휴일. 공공데이터포털 "한국천문연구원 특일 정보" API 동기화 크론(다음 PR · source api)이 채우고,
--       운영이 임시공휴일 등을 직접 넣을 수 있다(source manual — 동기화가 지우지 않는다). 크론이 붙기 전 시작 값으로 2026-12-25 · 2027년을 넣어 둔다
--     myr_is_business_day(d)        토요일 · 일요일 · 공휴일이 아니면
--     myr_business_day_from(d)      d 부터 첫 영업일(그날이 영업일이면 그날)
--     myr_payout_next_run(now)      다음 지급 시각 — 다음 오후 1시(0106 myr_settlement_next_cron)를 영업일로 미룬다. 정산 계산 크론(매일 오후 1시)은 그대로
--     myr_payout_pay_due_at(p, now) 지급 예정 시각(0111) — 이제 영업일 오후 1시
--   지급 요청
--     myr_payout_sendable(p)        지금 보낼 지급 건 — 지급 가능(myr_payout_payable) · 송금 중 아님 · 계좌 · 운영 실패 아님(0111 pay_due_at 안의 조건을 떼어 냄 · 결과 그대로)
--     myr_payout_requested_on(p, d) 그 날(KST) 요청한 지급 건 — 마지막 시도가 그날이고 실패가 확정되지 않았다(송금 중 · 지급 완료 · 결과 불명 check 포함).
--                                   자동 이체(8번)는 지급 완료 때도 transfer_at 을 남긴다
--     myr_payout_guard(available, ids, now)  공유 잔액 가드 + 하루 한도 — 지급대행 잔액은 같은 상점을 쓰는 다른 서비스와 공유라,
--                                   MYR 이 보낼 금액은 DB 의 지급 건 금액 합으로만 정한다(요청 금액을 앱이 더하지 않는다).
--       거부: BAD_BATCH(빈 목록 · 중복) · NOT_SENDABLE(지금 보낼 지급 건이 아님 · ids) · BALANCE_UNKNOWN(잔액 조회 실패) ·
--             BALANCE_EXCEEDED(합 > 잔액) · DAILY_CAP_EXCEEDED(오늘 요청 + 합 > 한도)
--       통과: { ok, batch, available, requested_today, cap }
--       ⚠ 요청 순간의 확인이다(읽기만 · 잠그지 않음). 같은 잔액을 쓰는 다른 서비스(시범운영은 의사 CRM · 나중에 셀러리)가 동시에 보내면 둘 다 통과할 수 있다
--         — DB 로 막을 수 없는 공유 잔액의 한계. 자동 이체(docs/myr.md 7-7 8번)는 토스 잔액 부족 응답을 실패 종류 ops(운영 확인)로 받는다.
--         MYR 안에서 크론이 겹치는 것은 8번이 지급 건을 잠그고(for update) → 보낼 수 있나 → 가드 → 송금 중 표시를 한 트랜잭션 함수로 묶어 막는다
--   계좌번호
--     myr_account_ok(digits)        숫자 8~14자리 — 토스 지급대행 accountNumber 최대 14자리(#328 TOSS_ACCOUNT_MAX). 화면 ACCOUNT_RE(settle-info.ts)와 짝(check-boundaries (j))
--     myr_app_seller_settle_info_save — 계좌 검사를 이 함수로(전에는 8~16자리). 이미 저장된 15 · 16자리 계좌는 그대로 두고 다음 저장 때 거절된다
--       새 거부 ACCOUNT_REENTER — 계좌 칸을 비워(저장된 값 그대로) 다른 칸만 고치는데 저장된 계좌가 규칙 밖일 때. 직접 입력한 값이 틀리면 전처럼 BAD_ACCOUNT
--       ⚠ 클라우드에 올리기 전에 MYR 크리에이터 중 대상이 있는지 센다(셀러리 파트너는 sellers 표를 같이 쓰지만 이 함수를 쓰지 않는다):
--         select handle, myr_settle_status, length(bank_info->>'account') from sellers where length(bank_info->>'account') > 14 and myr_settle_status <> 'none';
--   권한: 전부 service role 만. 테스트: supabase/tests/myr_payout_toss_rules.test.sql · myr_single_source.test.sql 검사 표
-- ============================================================

-- ---------- 지급 방식 설정 ----------
insert into public.platform_settings (key, value, description)
values ('myr_payout', '{"mode": "manual", "daily_cap": 5000000}'::jsonb, 'MYR 지급 방식(manual · toss) · 하루 지급 한도(원) — 0122')
on conflict (key) do nothing;
alter table public.platform_settings drop constraint if exists platform_settings_myr_payout_check;
alter table public.platform_settings add constraint platform_settings_myr_payout_check check (
  key <> 'myr_payout' or (value ->> 'mode' in ('manual', 'toss') and coalesce(value ->> 'daily_cap', '') ~ '^[0-9]{1,12}$'));

create or replace function public.myr_payout_toss_on()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select ps.value ->> 'mode' from public.platform_settings ps where ps.key = 'myr_payout') = 'toss', false)
$$;
revoke all on function public.myr_payout_toss_on() from public, anon, authenticated;
grant execute on function public.myr_payout_toss_on() to service_role;

create or replace function public.myr_payout_daily_cap()
returns bigint
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select (ps.value ->> 'daily_cap')::bigint from public.platform_settings ps where ps.key = 'myr_payout'), 5000000)
$$;
revoke all on function public.myr_payout_daily_cap() from public, anon, authenticated;
grant execute on function public.myr_payout_daily_cap() to service_role;

-- ---------- 토스로 지급 가능 · 보류 이유 ----------
create or replace function public.myr_toss_ready(s public.sellers)
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce(public.myr_toss_card_state(s) in ('partial', 'approved', 'corporate'), false)
$$;
revoke all on function public.myr_toss_ready(public.sellers) from public, anon, authenticated;

alter table public.myr_payouts drop constraint if exists myr_payouts_hold_reason_check;
alter table public.myr_payouts add constraint myr_payouts_hold_reason_check check (hold_reason is null or hold_reason in ('settle_info', 'toss_auth', 'tax_invoice', 'manual'));

-- 크리에이터 쪽 보류 이유 전부(순서대로) — 사업자 정보 확인 전(운영 차례)과 토스 본인인증 전(크리에이터 차례)이 같이 걸리면 둘 다.
--   하나만 보여 주면 크리에이터가 할 일(토스 본인인증)이 운영 확인 뒤에 가려진다.
--   셀러가 없으면(지울 수 없는 칸이지만) 전처럼 settle_info — 바깥 한 줄 + left join
create or replace function public.myr_seller_hold_reasons(p_seller_id uuid)
returns text[]
language sql
stable
as $$
  select array_remove(array[case when not public.myr_seller_settle_verified(s.myr_settle_status) then 'settle_info' end,
                            case when public.myr_payout_toss_on() and not public.myr_toss_ready(s) then 'toss_auth' end], null)
    from (select 1) one left join public.sellers s on s.id = p_seller_id
$$;
revoke all on function public.myr_seller_hold_reasons(uuid) from public, anon, authenticated;

-- 첫 이유 — 지급 건 상태 칸(hold_reason)은 하나
create or replace function public.myr_seller_hold_reason(p_seller_id uuid)
returns text
language sql
stable
as $$
  select (public.myr_seller_hold_reasons(p_seller_id))[1]
$$;
revoke all on function public.myr_seller_hold_reason(uuid) from public, anon, authenticated;

-- 지급 건 보류 이유 전부(0104) — 크리에이터 쪽 이유 전부 → 세금계산서
create or replace function public.myr_payout_hold_reasons(p public.myr_payouts)
returns text[]
language sql
stable
as $$
  select array_remove(public.myr_seller_hold_reasons(p.seller_id) || case when not public.myr_payout_invoice_ok(p) then 'tax_invoice' end, null)
$$;
revoke all on function public.myr_payout_hold_reasons(public.myr_payouts) from public, anon, authenticated;

-- 보류 이유 코드 목록 → [{ code, label }] — 지급 건 보류 목록 · 다음 정산 보류 이유가 같이 쓴다
create or replace function public.myr_payout_hold_list_json(p_codes text[])
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', c, 'label', public.myr_payout_hold_label(c)) order by o), '[]'::jsonb)
    from unnest(coalesce(p_codes, '{}'::text[])) with ordinality u(c, o)
$$;
revoke all on function public.myr_payout_hold_list_json(text[]) from public, anon, authenticated;

-- 0104 그대로 — 목록 만들기만 위 함수로
create or replace function public.myr_payout_holds_json(p public.myr_payouts)
returns jsonb
language sql
stable
as $$
  select public.myr_payout_hold_list_json(case when p.hold_reason is null then '{}'::text[]
                     else array[p.hold_reason] || array(select r from unnest(public.myr_payout_hold_reasons(p)) r where r <> p.hold_reason) end)
$$;
revoke all on function public.myr_payout_holds_json(public.myr_payouts) from public, anon, authenticated;

-- 다음 정산 보류 이유(0116) — { code, label }(첫 이유 · 홈 배너 · 정산 탭 칩) + all(이유 전부 · 정산 상세 "보류 사유")
create or replace function public.myr_seller_next_hold_json(p_seller uuid)
returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select case when cardinality(r.codes) > 0
              then jsonb_build_object('code', r.codes[1], 'label', public.myr_payout_hold_label(r.codes[1]), 'all', public.myr_payout_hold_list_json(r.codes)) end
    from (select public.myr_seller_hold_reasons(p_seller) as codes) r
$$;
revoke all on function public.myr_seller_next_hold_json(uuid) from public, anon, authenticated;

create or replace function public.myr_payout_hold_label(p_code text)
returns text
language sql
immutable
as $$
  select case p_code when 'settle_info' then '사업자 · 정산 정보 확인 전' when 'toss_auth' then '토스 본인인증 전' when 'tax_invoice' then '세금계산서 확인 전' when 'manual' then '운영팀 확인 중' end
$$;
revoke all on function public.myr_payout_hold_label(text) from public, anon, authenticated;

drop trigger if exists sellers_myr_payout_refresh on public.sellers;
create trigger sellers_myr_payout_refresh
  after update of myr_settle_status, toss_seller_status, toss_seller_error, biz_no on public.sellers
  for each row
  when (old.myr_settle_status is distinct from new.myr_settle_status
        or old.toss_seller_status is distinct from new.toss_seller_status
        or old.toss_seller_error is distinct from new.toss_seller_error
        or old.biz_no is distinct from new.biz_no)
  execute function public.sellers_myr_payout_refresh();

-- 지급 방식을 바꾸면 자동 상태인 지급 건 전부 다시 정한다(지급 완료 · 운영 보류는 그대로 — myr_payout_refresh 가 거른다)
create or replace function public.myr_payout_refresh_all()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v record;
  n integer := 0;
begin
  for v in select p.id from public.myr_payouts p where public.myr_payout_status_auto(p) loop
    perform public.myr_payout_refresh(v.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.myr_payout_refresh_all() from public, anon, authenticated;
grant execute on function public.myr_payout_refresh_all() to service_role;

create or replace function public.platform_settings_myr_payout_refresh()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.myr_payout_refresh_all();
  return null;
end;
$$;
revoke all on function public.platform_settings_myr_payout_refresh() from public, anon, authenticated;

drop trigger if exists platform_settings_myr_payout_refresh on public.platform_settings;
create trigger platform_settings_myr_payout_refresh
  after insert or update on public.platform_settings
  for each row
  when (new.key = 'myr_payout')
  execute function public.platform_settings_myr_payout_refresh();

-- ---------- 영업일 ----------
create table if not exists public.myr_holidays (
  day        date primary key,
  name       text not null check (char_length(name) between 1 and 40),
  -- api: 공공데이터포털 "한국천문연구원 특일 정보" 동기화 크론이 넣고 지운다 · manual: 운영이 넣은 날(임시공휴일 등) — 동기화가 지우지 않는다
  source     text not null default 'manual' check (source in ('api', 'manual')),
  created_at timestamptz not null default now()
);
comment on table public.myr_holidays is 'MYR 지급 영업일 계산용 공휴일 · 대체공휴일 — 특일 정보 API 동기화(api) + 운영 입력(manual) · 0122';
alter table public.myr_holidays enable row level security;
revoke all on public.myr_holidays from anon, authenticated;

-- 한국천문연구원 2027 월력 자료(2026-11-19 확인) — 노동절 · 제헌절 공휴일 포함. 동기화 크론이 붙기 전 시작 값(manual — 동기화가 같은 날을 받으면 api 로 바뀐다)
insert into public.myr_holidays (day, name) values
  ('2026-12-25', '기독탄신일'),
  ('2027-01-01', '1월 1일'),
  ('2027-02-06', '설날'), ('2027-02-07', '설날'), ('2027-02-08', '설날'), ('2027-02-09', '대체공휴일(설날)'),
  ('2027-03-01', '3·1절'),
  ('2027-05-01', '노동절'), ('2027-05-03', '대체공휴일(노동절)'),
  ('2027-05-05', '어린이날'),
  ('2027-05-13', '부처님오신날'),
  ('2027-06-06', '현충일'),
  ('2027-07-17', '제헌절'), ('2027-07-19', '대체공휴일(제헌절)'),
  ('2027-08-15', '광복절'), ('2027-08-16', '대체공휴일(광복절)'),
  ('2027-09-14', '추석'), ('2027-09-15', '추석'), ('2027-09-16', '추석'),
  ('2027-10-03', '개천절'), ('2027-10-04', '대체공휴일(개천절)'),
  ('2027-10-09', '한글날'), ('2027-10-11', '대체공휴일(한글날)'),
  ('2027-12-25', '기독탄신일'), ('2027-12-27', '대체공휴일(기독탄신일)')
on conflict (day) do nothing;

create or replace function public.myr_is_business_day(p_day date)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select extract(isodow from p_day) < 6 and not exists (select 1 from public.myr_holidays h where h.day = p_day)
$$;
revoke all on function public.myr_is_business_day(date) from public, anon, authenticated;
grant execute on function public.myr_is_business_day(date) to service_role;

-- 한 달 안에 영업일이 없을 수는 없다(가장 긴 연휴도 열흘 안쪽)
create or replace function public.myr_business_day_from(p_day date)
returns date
language sql
stable
as $$
  select min(d)::date from generate_series(p_day::timestamp, p_day::timestamp + interval '31 days', interval '1 day') d where public.myr_is_business_day(d::date)
$$;
revoke all on function public.myr_business_day_from(date) from public, anon, authenticated;

create or replace function public.myr_payout_next_run(p_now timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select public.myr_settlement_time_on(public.myr_business_day_from(public.myr_kst_date(public.myr_settlement_next_cron(p_now))))
$$;
revoke all on function public.myr_payout_next_run(timestamptz) from public, anon, authenticated;

-- ---------- 지급 요청 ----------
create or replace function public.myr_payout_sendable(p public.myr_payouts)
returns boolean
language sql
stable
as $$
  select coalesce(public.myr_payout_payable(p), false)
     and not public.myr_payout_sending(p)
     and coalesce(public.myr_payout_fail_kind(p) not in ('account', 'ops'), true)
$$;
revoke all on function public.myr_payout_sendable(public.myr_payouts) from public, anon, authenticated;

create or replace function public.myr_payout_pay_due_at(p public.myr_payouts, p_now timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select case when public.myr_payout_sendable(p) then public.myr_payout_next_run(p_now) end
$$;
revoke all on function public.myr_payout_pay_due_at(public.myr_payouts, timestamptz) from public, anon, authenticated;

create or replace function public.myr_payout_requested_on(p public.myr_payouts, p_day date)
returns boolean
language sql
immutable
as $$
  select coalesce(public.myr_kst_date(p.transfer_at) = p_day and (p.transfer_fail is null or p.transfer_fail = 'check'), false)
$$;
revoke all on function public.myr_payout_requested_on(public.myr_payouts, date) from public, anon, authenticated;

create or replace function public.myr_payout_guard(p_available bigint, p_ids uuid[], p_now timestamptz default now())
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_bad   uuid[];
  v_batch bigint;
  v_today bigint;
  v_cap   bigint := public.myr_payout_daily_cap();
begin
  if coalesce(cardinality(p_ids), 0) = 0 or cardinality(p_ids) <> (select count(distinct x) from unnest(p_ids) x) then
    return jsonb_build_object('ok', false, 'code', 'BAD_BATCH');
  end if;
  select array_agg(x order by x) into v_bad
    from unnest(p_ids) x
   where not exists (select 1 from public.myr_payouts p where p.id = x and public.myr_payout_sendable(p));
  if v_bad is not null then return jsonb_build_object('ok', false, 'code', 'NOT_SENDABLE', 'ids', to_jsonb(v_bad)); end if;
  select coalesce(sum(public.myr_payout_amount(p)), 0) into v_batch from public.myr_payouts p where p.id = any (p_ids);
  if p_available is null then return jsonb_build_object('ok', false, 'code', 'BALANCE_UNKNOWN', 'batch', v_batch); end if;
  if v_batch > p_available then
    return jsonb_build_object('ok', false, 'code', 'BALANCE_EXCEEDED', 'batch', v_batch, 'available', p_available);
  end if;
  select coalesce(sum(public.myr_payout_amount(p)), 0) into v_today
    from public.myr_payouts p where public.myr_payout_requested_on(p, public.myr_kst_date(p_now));
  if v_today + v_batch > v_cap then
    return jsonb_build_object('ok', false, 'code', 'DAILY_CAP_EXCEEDED', 'batch', v_batch, 'requested_today', v_today, 'cap', v_cap);
  end if;
  return jsonb_build_object('ok', true, 'batch', v_batch, 'available', p_available, 'requested_today', v_today, 'cap', v_cap);
end;
$$;
revoke all on function public.myr_payout_guard(bigint, uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.myr_payout_guard(bigint, uuid[], timestamptz) to service_role;

-- ---------- 계좌번호 ----------
create or replace function public.myr_account_ok(p text)
returns boolean
language sql
immutable
as $$
  select coalesce(p ~ '^\d{8,14}$', false)
$$;
revoke all on function public.myr_account_ok(text) from public, anon, authenticated;

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
