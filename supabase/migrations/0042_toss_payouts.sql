-- ============================================================
-- 0040 — 토스페이먼츠 지급대행(Payouts) 연동: 정산 지급을 이체 파일 대신 토스 API 로 (대표 결정 2026-10-07)
--        sellers.settle_phone · sellers/brands.toss_seller_{id,status,synced_at,error} · payouts.toss_{payout_id,payout_status,requested_at,error,schedule_date}
--        · payout_events · platform_settings 'payout_mode'(manual|toss · 기본 manual) · payout_mode()
--        · 보류 코드 TOSS_SELLER_PENDING · PHONE_MISSING (admin_hold_label · admin_payout_hold_reason 재정의 — toss 모드에서만 추가 판정)
--        · admin_payouts_recheck(보류 ↔ 대기 양방향) · 자동 해제 트리거 감시 열 추가(settle_phone · manager_phone · toss_seller_status)
--        · app_set_settle_phone · app_partner_seller_sync · app_payout_mark_requested · app_payout_sync_status · app_payout_mode_set
--        · app_admin_payouts_toss_queue · admin_payout_json(토스 필드 추가)
--
-- 근거: docs/settlement-policy.md §8.3(지급 보류) · docs/admin-console-plan.md "정산·돈"(0020 · 이체 파일) · 0029(자동 해제) · 0030(보류 조건)
--       · 토스 지급대행 문서 docs.tosspayments.com/guides/v2/payouts · /reference/additional (셀러 상태 APPROVAL_REQUIRED → PARTIALLY_APPROVED(주 1천만 이하)
--         → KYC_REQUIRED → APPROVED · 지급 상태 REQUESTED → IN_PROGRESS → COMPLETED | FAILED · CANCELED · REJECTED · DELETED).
-- 실행: 0039 이후. 재실행 가능(add column if not exists / create or replace / insert … on conflict do nothing).
--       0001~0039 파일은 수정하지 않는다 — 컬럼·함수만 **추가**하고 admin_hold_label · admin_payout_hold_reason · admin_payout_json 은 재정의한다.
--
-- 방식
--   · **`platform_settings.payout_mode` 가 'manual'(기본) 이면 아무것도 달라지지 않는다** — 보류 판정 · 이체 파일 · [지급 완료] 전부 0020~0030 그대로.
--     'toss' 로 바꾸면(app_payout_mode_set · partner-admin.mjs payout-mode toss) 보류 판정에 두 조건이 더해진다:
--       PHONE_MISSING        개인 인플루언서(settle_type <> 'biz')는 본인인증 문자를 받을 settle_phone 이 필요 · 브랜드는 manager_phone
--       TOSS_SELLER_PENDING  토스 셀러가 아직 PARTIALLY_APPROVED / APPROVED 가 아님(미등록 · APPROVAL_REQUIRED · KYC_REQUIRED · 등록 오류)
--     기존 조건(계좌 · 주민번호 · 사업자등록증 · 브랜드 4개)이 먼저다 — 그것들이 있어야 토스 셀러를 만들 수 있다.
--   · 토스 셀러 등록은 앱 서버(@sellery/payments server/payouts)가 정산 정보 저장 직후 한다 — 결과를 app_partner_seller_sync 로 적고,
--     웹훅 seller.changed 도 같은 함수로 들어온다. 상태가 바뀌면 트리거가 보류를 다시 검사한다(해제 또는 보류 — admin_payouts_recheck).
--   · 지급 요청(app_payout_mark_requested)은 pending 행에 토스 지급 id 를 적을 뿐 status 는 그대로 'pending' 이다(0004 check 유지).
--     "진행 중" = toss_payout_status in (REQUESTED, IN_PROGRESS). COMPLETED 웹훅(app_payout_sync_status)이 app_admin_payout_mark_paid 와 같은 전이로 paid 를 만든다
--     (actor_user_id null · 메모 '토스 지급대행 <id>'). FAILED · CANCELED · REJECTED · DELETED 면 toss_error 에 남기고 다시 요청할 수 있다.
--   · 계좌 원문은 토스에 보낼 때만 service role 이 읽는다 — 읽을 때마다 sensitive_access_log(field 'bank_info' · actor 'toss-payouts') 를 남긴다(앱 서버).
--   · payout_events — 토스 지급대행 원문 기록(요청 · 웹훅 · 취소 · 셀러 동기화). payment_events(0008)는 결제 전용이라 섞지 않는다.
-- 숫자·규칙의 정답은 packages/db/src/admin/settle-rules.ts(sellerHoldReason · brandHoldReason) · packages/payments/src/payout-rules.ts 다 — 둘을 함께 고친다.
-- ============================================================

-- ------------------------------------------------------------
-- 컬럼
-- ------------------------------------------------------------
alter table public.sellers add column if not exists settle_phone          text;         -- 지급대행 본인인증 문자 수신 번호(숫자만 8~15) — 샘플 배송지 연락처와 별개
alter table public.sellers add column if not exists toss_seller_id        text;         -- 토스 발급 셀러 id
alter table public.sellers add column if not exists toss_seller_status    text
  check (toss_seller_status is null or toss_seller_status in ('APPROVAL_REQUIRED','PARTIALLY_APPROVED','KYC_REQUIRED','APPROVED'));
alter table public.sellers add column if not exists toss_seller_synced_at timestamptz;
alter table public.sellers add column if not exists toss_seller_error     jsonb;        -- 마지막 등록/수정 실패 { code, message, at } — 성공하면 null

alter table public.brands add column if not exists toss_seller_id        text;
alter table public.brands add column if not exists toss_seller_status    text
  check (toss_seller_status is null or toss_seller_status in ('APPROVAL_REQUIRED','PARTIALLY_APPROVED','KYC_REQUIRED','APPROVED'));
alter table public.brands add column if not exists toss_seller_synced_at timestamptz;
alter table public.brands add column if not exists toss_seller_error     jsonb;

create unique index if not exists sellers_toss_seller_id_uidx on public.sellers (toss_seller_id) where toss_seller_id is not null;
create unique index if not exists brands_toss_seller_id_uidx  on public.brands  (toss_seller_id) where toss_seller_id is not null;

comment on column public.sellers.settle_phone is '토스 지급대행 본인인증 문자 수신 번호(숫자만) — 0040. payout_mode=toss 에서 개인 인플루언서 지급 조건(PHONE_MISSING)';
comment on column public.sellers.toss_seller_status is '토스 셀러 상태 APPROVAL_REQUIRED|PARTIALLY_APPROVED|KYC_REQUIRED|APPROVED — 0040 app_partner_seller_sync';
comment on column public.brands.toss_seller_status  is '토스 셀러 상태 — 0040 app_partner_seller_sync (브랜드는 company 셀러)';

alter table public.payouts add column if not exists toss_payout_id     text;
alter table public.payouts add column if not exists toss_payout_status text
  check (toss_payout_status is null or toss_payout_status in ('REQUESTED','IN_PROGRESS','COMPLETED','FAILED','CANCELED','REJECTED','DELETED'));
alter table public.payouts add column if not exists toss_requested_at  timestamptz;
alter table public.payouts add column if not exists toss_error         jsonb;          -- 마지막 실패 { code, message, status, at }
alter table public.payouts add column if not exists toss_schedule_date date;           -- SCHEDULED 면 지급 예정일 · EXPRESS 면 요청일

create unique index if not exists payouts_toss_payout_id_uidx on public.payouts (toss_payout_id) where toss_payout_id is not null;

comment on column public.payouts.toss_payout_status is '토스 지급 상태(0040) — REQUESTED·IN_PROGRESS 면 진행 중(재요청 불가) · COMPLETED 면 status paid · 그 외는 재요청 가능';

-- 보류 코드 2개 추가 (0020 check 재정의)
alter table public.payouts drop constraint if exists payouts_hold_code_check;
alter table public.payouts
  add constraint payouts_hold_code_check
  check (hold_code is null or hold_code in ('BANK_MISSING','RRN_MISSING','TAX_INFO_MISSING','SETTLE_INFO_INCOMPLETE','MANUAL','TOSS_SELLER_PENDING','PHONE_MISSING'));

-- ------------------------------------------------------------
-- payout_events — 토스 지급대행 원문 기록 (요청 · 웹훅 · 취소 · 셀러 동기화)
-- ------------------------------------------------------------
create table if not exists public.payout_events (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in ('request','webhook','cancel','seller_sync','mode')),
  event_type      text,                           -- 'payout.changed' · 'seller.changed' · 'request' · 'cancel' · 'seller_sync' · 'mode'
  payout_id       uuid references public.payouts (id) on delete set null,
  toss_payout_id  text,
  toss_seller_id  text,
  payload         jsonb not null,
  handled         boolean not null default false,
  result          text,
  received_at     timestamptz not null default now()
);
create index if not exists payout_events_payout_idx   on public.payout_events (payout_id);
create index if not exists payout_events_toss_idx     on public.payout_events (toss_payout_id);
create index if not exists payout_events_received_idx on public.payout_events (received_at desc);
alter table public.payout_events enable row level security;
revoke all on public.payout_events from anon, authenticated;
grant select, insert, update on public.payout_events to service_role;

-- ------------------------------------------------------------
-- platform_settings 'payout_mode' — 'manual'(기본) | 'toss'
-- ------------------------------------------------------------
insert into public.platform_settings (key, value, description)
values ('payout_mode', '"manual"'::jsonb, '정산 지급 방식 — manual(이체 파일 · 기본) | toss(토스 지급대행 · 0040). 바꾸면 app_payout_mode_set 이 보류를 다시 검사한다')
on conflict (key) do nothing;

create or replace function public.payout_mode()
returns text
language sql stable
set search_path = public
as $$
  select case when (select value #>> '{}' from public.platform_settings where key = 'payout_mode') = 'toss' then 'toss' else 'manual' end
$$;
revoke all on function public.payout_mode() from public, anon, authenticated;
grant execute on function public.payout_mode() to service_role;

-- ------------------------------------------------------------
-- admin_hold_label — 0030 + 토스 코드 2개
-- ------------------------------------------------------------
create or replace function public.admin_hold_label(p_code text)
returns text
language sql immutable
set search_path = public
as $$
  select case p_code
           when 'BANK_MISSING'           then '정산 계좌 미등록'
           when 'RRN_MISSING'            then '주민등록번호 미등록 — 원천징수 자료'
           when 'TAX_INFO_MISSING'       then '사업자등록증 미등록'
           when 'SETTLE_INFO_INCOMPLETE' then '정산 정보 미완비 — 은행·계좌·예금주·사업자등록번호'
           when 'MANUAL'                 then '운영자 보류'
           when 'TOSS_SELLER_PENDING'    then '토스 지급대행 계좌 확인 대기 — 본인인증(문자) 또는 셀러 등록 필요'
           when 'PHONE_MISSING'          then '본인인증 휴대폰 번호 미등록 — 토스 지급대행'
           else p_code end
$$;

-- ------------------------------------------------------------
-- admin_payout_hold_reason — 0030 과 같고, payout_mode() = 'toss' 일 때만 PHONE_MISSING · TOSS_SELLER_PENDING 을 뒤에 더한다
-- ------------------------------------------------------------
create or replace function public.admin_payout_hold_reason(p_payee_type text, p_seller_id uuid, p_brand_id uuid)
returns text
language plpgsql stable
security definer set search_path = public
as $$
declare
  s      public.sellers%rowtype;
  b      public.brands%rowtype;
  v_toss boolean := public.payout_mode() = 'toss';
begin
  if p_payee_type = 'seller' then
    select * into s from public.sellers where id = p_seller_id;
    if not found then return 'BANK_MISSING'; end if;
    if s.bank_info is null or coalesce(s.bank_info ->> 'account', '') = '' then return 'BANK_MISSING'; end if;
    if s.settle_type = 'biz' then
      if coalesce(s.biz_no, '') = '' or coalesce(s.biz_doc_url, '') = '' then return 'TAX_INFO_MISSING'; end if;
    elsif s.rrn_set_at is null then
      return 'RRN_MISSING';
    end if;
    if v_toss then
      if s.settle_type is distinct from 'biz' and coalesce(s.settle_phone, '') = '' then return 'PHONE_MISSING'; end if;
      if s.toss_seller_status is null or s.toss_seller_status not in ('PARTIALLY_APPROVED', 'APPROVED') then return 'TOSS_SELLER_PENDING'; end if;
    end if;
    return null;
  elsif p_payee_type = 'referrer' then
    -- 추천 보상(0027): 계좌만 본다 — toss 모드에서는 돈이 토스 셀러로 가므로 셀러 상태도 본다
    select * into s from public.sellers where id = p_seller_id;
    if not found then return 'BANK_MISSING'; end if;
    if s.bank_info is null or coalesce(s.bank_info ->> 'account', '') = '' then return 'BANK_MISSING'; end if;
    if v_toss then
      if s.settle_type is distinct from 'biz' and coalesce(s.settle_phone, '') = '' then return 'PHONE_MISSING'; end if;
      if s.toss_seller_status is null or s.toss_seller_status not in ('PARTIALLY_APPROVED', 'APPROVED') then return 'TOSS_SELLER_PENDING'; end if;
    end if;
    return null;
  elsif p_payee_type = 'brand' then
    select * into b from public.brands where id = p_brand_id;
    if not found then return 'SETTLE_INFO_INCOMPLETE'; end if;
    if not public.brand_settle_info_complete(b) then return 'SETTLE_INFO_INCOMPLETE'; end if;
    if v_toss then
      if coalesce(b.manager_phone, '') = '' then return 'PHONE_MISSING'; end if;
      if b.toss_seller_status is null or b.toss_seller_status not in ('PARTIALLY_APPROVED', 'APPROVED') then return 'TOSS_SELLER_PENDING'; end if;
    end if;
    return null;
  end if;
  return null;
end;
$$;

-- ------------------------------------------------------------
-- admin_payout_json — 0020 + 토스 필드 (admin_settlement_json · app_admin_settlements 가 그대로 싣는다)
-- ------------------------------------------------------------
create or replace function public.admin_payout_json(po public.payouts)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object('id', po.id, 'payee_type', po.payee_type, 'status', po.status, 'amount', po.amount, 'wht', po.wht,
                            'hold_code', po.hold_code, 'hold_reason', po.hold_reason, 'bank_snapshot', po.bank_snapshot,
                            'paid_at', po.paid_at, 'memo', po.memo, 'created_at', po.created_at,
                            'toss_payout_id', po.toss_payout_id, 'toss_payout_status', po.toss_payout_status,
                            'toss_requested_at', po.toss_requested_at, 'toss_schedule_date', po.toss_schedule_date, 'toss_error', po.toss_error)
$$;

-- ------------------------------------------------------------
-- admin_payouts_recheck(p_seller_id, p_brand_id) — 보류 ↔ 대기 양방향 재검사. 돌려주는 값 { released, held }
--   held → pending 은 0029 admin_payouts_auto_release 그대로(스레드 메시지 포함).
--   pending → held 는 toss 모드에서 셀러 상태가 뒤로 갔을 때(KYC_REQUIRED 등) · 모드 전환 때. 진행 중(REQUESTED·IN_PROGRESS) 지급은 건드리지 않는다.
--   운영자 보류(MANUAL)는 어느 쪽으로도 건드리지 않는다.
-- ------------------------------------------------------------
create or replace function public.admin_payouts_recheck(p_seller_id uuid, p_brand_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  po         public.payouts%rowtype;
  v_hold     text;
  v_released integer := 0;
  v_held     integer := 0;
  r          record;
begin
  if p_seller_id is null and p_brand_id is null then
    -- 전체(모드 전환): 보류 중인 파트너마다 0029 자동 해제를 돌린다
    for r in select distinct seller_id, brand_id from public.payouts where status = 'held' and hold_code is not null and hold_code <> 'MANUAL' loop
      v_released := v_released + public.admin_payouts_auto_release(r.seller_id, r.brand_id);
    end loop;
  else
    v_released := public.admin_payouts_auto_release(p_seller_id, p_brand_id);
  end if;
  for po in
    select * from public.payouts
     where status = 'pending'
       and (toss_payout_status is null or toss_payout_status not in ('REQUESTED', 'IN_PROGRESS'))
       and ((p_seller_id is not null and seller_id = p_seller_id)
         or (p_brand_id  is not null and brand_id  = p_brand_id)
         or (p_seller_id is null and p_brand_id is null))
     order by created_at, id
     for update
  loop
    v_hold := public.admin_payout_hold_reason(po.payee_type, po.seller_id, po.brand_id);
    if v_hold is not null then
      update public.payouts set status = 'held', hold_code = v_hold, hold_reason = public.admin_hold_label(v_hold) where id = po.id;
      perform public.admin_settlement_sync_status(po.settlement_id);
      v_held := v_held + 1;
    end if;
  end loop;
  return jsonb_build_object('released', v_released, 'held', v_held);
end;
$$;
revoke all on function public.admin_payouts_recheck(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_payouts_recheck(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- 자동 해제 트리거 — 0030 과 같고 감시 열에 settle_phone · toss_seller_status 를 더했다. 함수 본문은 recheck(양방향)로 바꾼다.
-- ------------------------------------------------------------
create or replace function public.sellers_payout_auto_release()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  begin
    perform public.admin_payouts_recheck(new.id, null);
  exception when others then
    raise warning 'payout auto release failed (seller %): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists sellers_payout_auto_release on public.sellers;
create trigger sellers_payout_auto_release
  after update of bank_info, settle_type, biz_no, tax_info, rrn_set_at, biz_doc_url, settle_phone, toss_seller_status on public.sellers
  for each row
  when (old.bank_info   is distinct from new.bank_info
     or old.settle_type is distinct from new.settle_type
     or old.biz_no      is distinct from new.biz_no
     or old.tax_info    is distinct from new.tax_info
     or old.rrn_set_at  is distinct from new.rrn_set_at
     or old.biz_doc_url is distinct from new.biz_doc_url
     or old.settle_phone is distinct from new.settle_phone
     or old.toss_seller_status is distinct from new.toss_seller_status)
  execute function public.sellers_payout_auto_release();

create or replace function public.brands_payout_auto_release()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  begin
    perform public.admin_payouts_recheck(null, new.id);
  exception when others then
    raise warning 'payout auto release failed (brand %): %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists brands_payout_auto_release on public.brands;
create trigger brands_payout_auto_release
  after update of bank_info, biz_no, manager_phone, toss_seller_status on public.brands
  for each row
  when (old.bank_info is distinct from new.bank_info
     or old.biz_no    is distinct from new.biz_no
     or old.manager_phone is distinct from new.manager_phone
     or old.toss_seller_status is distinct from new.toss_seller_status)
  execute function public.brands_payout_auto_release();

-- ------------------------------------------------------------
-- app_set_settle_phone(p_seller_id, p_phone) — 본인인증 휴대폰 번호(숫자만 8~15). 빈 값이면 지운다.
--   { ok:true, phone_masked } | { ok:false, code:'NOT_FOUND' | 'BAD_PHONE' }
-- ------------------------------------------------------------
create or replace function public.app_set_settle_phone(p_seller_id uuid, p_phone text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if not exists (select 1 from public.sellers where id = p_seller_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_digits <> '' and v_digits !~ '^\d{8,15}$' then
    return jsonb_build_object('ok', false, 'code', 'BAD_PHONE');
  end if;
  update public.sellers set settle_phone = nullif(v_digits, '') where id = p_seller_id;
  return jsonb_build_object('ok', true, 'phone_masked', case when v_digits = '' then null else repeat('*', greatest(length(v_digits) - 4, 0)) || right(v_digits, 4) end);
end;
$$;
revoke all on function public.app_set_settle_phone(uuid, text) from public, anon, authenticated;
grant execute on function public.app_set_settle_phone(uuid, text) to service_role;

-- ------------------------------------------------------------
-- app_partner_seller_sync(p_payee_type, p_payee_id, p_toss_seller_id, p_status, p_raw)
--   토스 셀러 등록/수정/웹훅 결과를 적는다. p_payee_type 'seller'(인플루언서 · referrer 도 sellers) | 'brand'.
--   p_status null + p_raw.error → 실패 기록(toss_seller_error · 상태는 유지). 상태가 바뀌면 트리거가 보류를 재검사한다.
--   { ok:true, previous, status, toss_seller_id } | { ok:false, code:'NOT_FOUND' | 'BAD_STATUS' | 'BAD_TYPE' }
-- ------------------------------------------------------------
create or replace function public.app_partner_seller_sync(p_payee_type text, p_payee_id uuid, p_toss_seller_id text, p_status text, p_raw jsonb default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_prev   text;
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_err    jsonb := case when v_status is null and p_raw is not null then
                      jsonb_strip_nulls(jsonb_build_object('code', p_raw ->> 'code', 'message', p_raw ->> 'message', 'at', now()))
                    else null end;
begin
  if v_status is not null and v_status not in ('APPROVAL_REQUIRED', 'PARTIALLY_APPROVED', 'KYC_REQUIRED', 'APPROVED') then
    return jsonb_build_object('ok', false, 'code', 'BAD_STATUS');
  end if;
  if p_payee_type in ('seller', 'referrer') then
    select toss_seller_status into v_prev from public.sellers where id = p_payee_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
    update public.sellers
       set toss_seller_id        = coalesce(nullif(btrim(coalesce(p_toss_seller_id, '')), ''), toss_seller_id),
           toss_seller_status    = coalesce(v_status, toss_seller_status),
           toss_seller_synced_at = now(),
           toss_seller_error     = v_err
     where id = p_payee_id;
  elsif p_payee_type = 'brand' then
    select toss_seller_status into v_prev from public.brands where id = p_payee_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
    update public.brands
       set toss_seller_id        = coalesce(nullif(btrim(coalesce(p_toss_seller_id, '')), ''), toss_seller_id),
           toss_seller_status    = coalesce(v_status, toss_seller_status),
           toss_seller_synced_at = now(),
           toss_seller_error     = v_err
     where id = p_payee_id;
  else
    return jsonb_build_object('ok', false, 'code', 'BAD_TYPE');
  end if;
  insert into public.payout_events (source, event_type, toss_seller_id, payload, handled, result)
  values ('seller_sync', coalesce(p_raw ->> 'eventType', 'seller_sync'), p_toss_seller_id, coalesce(p_raw, '{}'::jsonb), true,
          case when v_err is not null then 'error: ' || coalesce(v_err ->> 'code', '?') else coalesce(v_prev, '-') || ' → ' || coalesce(v_status, v_prev, '-') end);
  return jsonb_build_object('ok', true, 'previous', v_prev, 'status', coalesce(v_status, v_prev), 'toss_seller_id', p_toss_seller_id, 'error', v_err);
end;
$$;
revoke all on function public.app_partner_seller_sync(text, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_partner_seller_sync(text, uuid, text, text, jsonb) to service_role;

-- ------------------------------------------------------------
-- app_payout_mark_requested(p_payout_id, p_toss_payout_id, p_status, p_schedule_date, p_raw) — 지급 요청 결과 기록
--   pending · 진행 중 아님 · 보류 아님 일 때만. 토스 응답 상태(REQUESTED 등)와 지급 예정일을 적고 payout_events('request').
--   { ok:true, payout } | { ok:false, code:'NOT_FOUND' | 'WRONG_STATUS' | 'IN_FLIGHT' | 'BAD_STATUS' }
-- ------------------------------------------------------------
create or replace function public.app_payout_mark_requested(p_payout_id uuid, p_toss_payout_id text, p_status text, p_schedule_date date default null, p_raw jsonb default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  po public.payouts%rowtype;
begin
  if p_status not in ('REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELED', 'REJECTED', 'DELETED') then
    return jsonb_build_object('ok', false, 'code', 'BAD_STATUS');
  end if;
  select * into po from public.payouts where id = p_payout_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if po.status <> 'pending' then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', po.status); end if;
  if po.toss_payout_status in ('REQUESTED', 'IN_PROGRESS') and po.toss_payout_id is distinct from p_toss_payout_id then
    return jsonb_build_object('ok', false, 'code', 'IN_FLIGHT', 'toss_payout_id', po.toss_payout_id);
  end if;
  update public.payouts
     set toss_payout_id     = p_toss_payout_id,
         toss_payout_status = p_status,
         toss_requested_at  = now(),
         toss_schedule_date = coalesce(p_schedule_date, current_date),
         toss_error         = case when p_status in ('FAILED', 'CANCELED', 'REJECTED', 'DELETED')
                                   then jsonb_strip_nulls(jsonb_build_object('status', p_status, 'code', p_raw #>> '{error,code}', 'message', p_raw #>> '{error,message}', 'at', now()))
                                   else null end
   where id = po.id
  returning * into po;
  insert into public.payout_events (source, event_type, payout_id, toss_payout_id, payload, handled, result)
  values ('request', 'request', po.id, p_toss_payout_id, coalesce(p_raw, '{}'::jsonb), true, p_status);
  return jsonb_build_object('ok', true, 'payout', public.admin_payout_json(po));
end;
$$;
revoke all on function public.app_payout_mark_requested(uuid, text, text, date, jsonb) from public, anon, authenticated;
grant execute on function public.app_payout_mark_requested(uuid, text, text, date, jsonb) to service_role;

-- ------------------------------------------------------------
-- app_payout_sync_status(p_toss_payout_id, p_status, p_raw) — 웹훅 payout.changed / 재조회 결과 반영 (멱등)
--   COMPLETED → app_admin_payout_mark_paid 와 같은 전이(paid · paid_at · 스레드 payout_paid · 정산 상태 파생) · 메모 '토스 지급대행 <id>'
--   FAILED · CANCELED · REJECTED · DELETED → status 는 pending 그대로 · toss_error 기록(재요청 가능). 이미 paid 면 토스 상태만 적는다.
--   { ok:true, payout, settlement_status, changed } | { ok:false, code:'NOT_FOUND' | 'BAD_STATUS' }
-- ------------------------------------------------------------
create or replace function public.app_payout_sync_status(p_toss_payout_id text, p_status text, p_raw jsonb default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  po        public.payouts%rowtype;
  v_res     jsonb;
  v_changed boolean := false;
  v_sstatus text;
begin
  if p_status not in ('REQUESTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELED', 'REJECTED', 'DELETED') then
    return jsonb_build_object('ok', false, 'code', 'BAD_STATUS');
  end if;
  select * into po from public.payouts where toss_payout_id = p_toss_payout_id for update;
  if not found then
    insert into public.payout_events (source, event_type, toss_payout_id, payload, handled, result)
    values ('webhook', coalesce(p_raw ->> 'eventType', 'payout.changed'), p_toss_payout_id, coalesce(p_raw, '{}'::jsonb), true, 'ignored: unknown payout');
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  v_changed := po.toss_payout_status is distinct from p_status;
  update public.payouts
     set toss_payout_status = p_status,
         toss_error = case when p_status in ('FAILED', 'CANCELED', 'REJECTED', 'DELETED')
                           then jsonb_strip_nulls(jsonb_build_object('status', p_status, 'code', p_raw #>> '{error,code}', 'message', p_raw #>> '{error,message}', 'at', now()))
                           when p_status = 'COMPLETED' then null else toss_error end
   where id = po.id
  returning * into po;
  if p_status = 'COMPLETED' and po.status = 'pending' then
    v_res := public.app_admin_payout_mark_paid(po.id, null, '토스 지급대행 ' || p_toss_payout_id);
    select * into po from public.payouts where id = po.id;
  end if;
  v_sstatus := (select status from public.settlements where id = po.settlement_id);
  insert into public.payout_events (source, event_type, payout_id, toss_payout_id, payload, handled, result)
  values ('webhook', coalesce(p_raw ->> 'eventType', 'payout.changed'), po.id, p_toss_payout_id, coalesce(p_raw, '{}'::jsonb), true,
          p_status || case when v_res is not null then ' → paid' when v_changed then '' else ' (no change)' end);
  return jsonb_build_object('ok', true, 'payout', public.admin_payout_json(po), 'settlement_status', v_sstatus, 'changed', v_changed, 'paid', v_res is not null);
end;
$$;
revoke all on function public.app_payout_sync_status(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.app_payout_sync_status(text, text, jsonb) to service_role;

-- ------------------------------------------------------------
-- app_payout_mode_set(p_mode) — 'manual' | 'toss'. 바꾼 뒤 전체 지급(진행 중 · MANUAL 제외)을 재검사한다.
--   { ok:true, previous, mode, released, held } | { ok:false, code:'BAD_MODE' }
-- ------------------------------------------------------------
create or replace function public.app_payout_mode_set(p_mode text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_prev text := public.payout_mode();
  v_re   jsonb;
begin
  if p_mode not in ('manual', 'toss') then return jsonb_build_object('ok', false, 'code', 'BAD_MODE'); end if;
  insert into public.platform_settings (key, value, description)
  values ('payout_mode', to_jsonb(p_mode), '정산 지급 방식 — manual(이체 파일 · 기본) | toss(토스 지급대행 · 0040)')
  on conflict (key) do update set value = excluded.value;
  v_re := public.admin_payouts_recheck(null, null);
  insert into public.payout_events (source, event_type, payload, handled, result)
  values ('mode', 'mode', jsonb_build_object('previous', v_prev, 'mode', p_mode) || v_re, true, v_prev || ' → ' || p_mode);
  return jsonb_build_object('ok', true, 'previous', v_prev, 'mode', p_mode) || v_re;
end;
$$;
revoke all on function public.app_payout_mode_set(text) from public, anon, authenticated;
grant execute on function public.app_payout_mode_set(text) to service_role;

-- ------------------------------------------------------------
-- app_admin_payouts_toss_queue() — 토스로 보낼 수 있는 지급 대기 행 + 진행 중 행 (관리자 화면 · 스크립트)
--   계좌 원문은 싣지 않는다(토스 셀러 id 로 보내므로 필요 없다). { ok, mode, balance?:null, rows:[…] }
--   row: payout_id · settlement_id · campaign_code · title · payee_type · payee_id · payee_code · payee_name · amount · toss_seller_id · toss_seller_status
--        · toss_payout_id · toss_payout_status · toss_schedule_date · toss_error · requestable(bool) · reason(text|null)
-- ------------------------------------------------------------
create or replace function public.app_admin_payouts_toss_queue()
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'mode', public.payout_mode(),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'payout_id', po.id, 'settlement_id', po.settlement_id, 'campaign_code', c.code, 'title', st.title,
               'payee_type', po.payee_type, 'payee_id', coalesce(po.seller_id, po.brand_id),
               'payee_code', coalesce(s.code, b.code), 'payee_name', coalesce(s.name, b.name),
               'amount', po.amount, 'status', po.status, 'hold_code', po.hold_code,
               'toss_seller_id', coalesce(s.toss_seller_id, b.toss_seller_id), 'toss_seller_status', coalesce(s.toss_seller_status, b.toss_seller_status),
               'toss_seller_error', coalesce(s.toss_seller_error, b.toss_seller_error),
               'toss_payout_id', po.toss_payout_id, 'toss_payout_status', po.toss_payout_status, 'toss_schedule_date', po.toss_schedule_date,
               'toss_requested_at', po.toss_requested_at, 'toss_error', po.toss_error,
               'requestable', (po.status = 'pending'
                               and (po.toss_payout_status is null or po.toss_payout_status in ('FAILED', 'CANCELED', 'REJECTED', 'DELETED'))
                               and coalesce(s.toss_seller_id, b.toss_seller_id) is not null
                               and coalesce(s.toss_seller_status, b.toss_seller_status) in ('PARTIALLY_APPROVED', 'APPROVED')
                               and po.amount > 0),
               'reason', case when po.status <> 'pending' then po.status
                              when po.toss_payout_status in ('REQUESTED', 'IN_PROGRESS') then 'IN_FLIGHT'
                              when po.amount <= 0 then 'ZERO'
                              when coalesce(s.toss_seller_id, b.toss_seller_id) is null then 'NO_TOSS_SELLER'
                              when coalesce(s.toss_seller_status, b.toss_seller_status) not in ('PARTIALLY_APPROVED', 'APPROVED') then 'TOSS_SELLER_PENDING'
                              else null end
             ) order by st.settled_at, po.payee_type desc)
        from public.payouts po
        join public.settlements st on st.id = po.settlement_id
        join public.campaigns c on c.id = st.campaign_id
        left join public.sellers s on s.id = po.seller_id
        left join public.brands  b on b.id = po.brand_id
       where po.status in ('pending', 'held')
          or (po.status = 'paid' and po.toss_payout_status is not null and po.paid_at > now() - interval '30 days')
    ), '[]'::jsonb)
  )
$$;
revoke all on function public.app_admin_payouts_toss_queue() from public, anon, authenticated;
grant execute on function public.app_admin_payouts_toss_queue() to service_role;
