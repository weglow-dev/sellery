-- ============================================================
-- 0104 · MYR 세금계산서 수취 확인 (작업 순서 7-4 · 2026-11-12)
--
--   크리에이터(사업자)가 MYR 에 세금계산서를 정발행하고 콘솔에 승인번호를 적는다 → 운영이 홈택스에서 대조하고 확인 → 그때 지급 가능.
--   세무 답변(2026-11-12):
--     · 발행 금액 = 상계 뒤 금액(정산금 − 제조금액 상계) — 정산금 60% 는 부가세 포함 합계(2026-11-09)라 이 금액이 세금계산서 합계다.
--       세액 = 합계 ÷ 11 원 미만 버림 · 공급가액 = 합계 − 세액(myr_tax_invoice_amounts). 이체 금액은 그대로(지급 건 금액).
--     · 보증금 환급은 세금계산서에 넣지 않는다 — 합계 = 지급 건 줄의 (정산금 − 상계) 합(myr_payout_invoice_total). 이체는 보증금 환급 포함.
--     · 작성일자 = 정산월 말일 · 발행 기한 = 다음 달 10일(myr_tax_invoice_write_date · myr_tax_invoice_due). 기한이 지나도 보류는 그대로 · "기한 지남" 표시만.
--   세금계산서 표(myr_tax_invoices) — 지급 건 하나에 하나 · 승인번호 · 제출 때 합계 · 상태 submitted(확인 중) · accepted(확인 완료) · returned(다시 제출 요청 + 사유).
--   보류 이유 tax_invoice — 지급 건 단위 보류 이유(myr_payout_hold_reason)가 크리에이터 쪽 이유(0102 myr_seller_hold_reason) 다음으로 본다.
--     합계가 0원보다 크고 확인 완료(+ 제출 합계 = 지금 합계)가 아니면 지급 보류 → 운영이 확인하면 자동 상태(0102 myr_payout_refresh)로 지급 대기.
--   크리에이터 제출(myr_app_seller_tax_invoice_submit · 콘솔 /api/my/settle/invoice) · 운영 목록 · 확인 · 다시 제출 요청(myr_tax_invoice_list · accept · return —
--   운영 콘솔 전까지 packages/db/scripts/myr-settle.mjs invoices · invoice-ok · invoice-return). 이력은 myr_tax_invoice_logs.
--   정산 탭 달 상세 · 회차 보고는 같은 응답(myr_payout_invoice_json)을 쓴다.
--   테스트: supabase/tests/myr_tax_invoice.test.sql
-- ============================================================

create table if not exists public.myr_tax_invoices (
  id           uuid primary key default gen_random_uuid(),
  payout_id    uuid not null unique references public.myr_payouts (id) on delete restrict,
  approval_no  text not null unique,                 -- 국세청 승인번호(하이픈 없이 · myr_tax_invoice_no)
  total        integer not null check (total > 0),   -- 제출 때 세금계산서 합계(myr_payout_invoice_total) — 운영 확인 때 지금 합계와 대조
  status       text not null default 'submitted' check (status in ('submitted', 'accepted', 'returned')),
  return_note  text,                                 -- 다시 제출 요청 사유(크리에이터에게 보인다)
  submitted_at timestamptz not null default now(),
  checked_at   timestamptz,
  checked_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint myr_tax_invoices_returned check ((status = 'returned') = (return_note is not null))
);
alter table public.myr_tax_invoices enable row level security;
revoke all on public.myr_tax_invoices from anon, authenticated;

create table if not exists public.myr_tax_invoice_logs (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.myr_tax_invoices (id) on delete restrict,
  action      text not null check (action in ('submit', 'accept', 'return')),   -- 제출(다시 제출 포함) · 확인 · 다시 제출 요청
  approval_no text,
  total       integer,
  note        text,
  actor       text not null,
  created_at  timestamptz not null default now()
);
create index if not exists myr_tax_invoice_logs_invoice_idx on public.myr_tax_invoice_logs (invoice_id, created_at);
alter table public.myr_tax_invoice_logs enable row level security;
revoke all on public.myr_tax_invoice_logs from anon, authenticated;

alter table public.myr_payouts drop constraint if exists myr_payouts_hold_reason_check;
alter table public.myr_payouts add constraint myr_payouts_hold_reason_check check (hold_reason is null or hold_reason in ('settle_info', 'tax_invoice', 'manual'));

-- ---------- 판정 함수 ----------

-- 지급 건의 정산월(회차 달) — 작성일자 · 발행 기한이 같이 쓴다
create or replace function public.myr_payout_month(p public.myr_payouts)
returns date
language sql
stable
as $$
  select u.month from public.myr_settlement_runs u where u.id = p.run_id
$$;
revoke all on function public.myr_payout_month(public.myr_payouts) from public, anon, authenticated;

-- 세금계산서 합계 = 지급 건 줄의 (정산금 − 상계) 합 — 줄 지급액(myr_settlement_row_payout)에서 보증금 환급만 0 으로(보증금은 세금계산서에 넣지 않는다)
create or replace function public.myr_payout_invoice_total(p public.myr_payouts)
returns integer
language sql
stable
as $$
  select coalesce(sum(public.myr_settlement_row_payout(r.settle, r.offset_amount, 0)), 0)::integer
    from public.myr_settlement_rows r where r.payout_id = p.id
$$;
revoke all on function public.myr_payout_invoice_total(public.myr_payouts) from public, anon, authenticated;

-- 합계(부가세 포함) → 공급가액 · 세액. 세액 = 합계 ÷ 11 원 미만 버림 · 공급가액 = 나머지(합이 원 단위까지 합계와 같다)
create or replace function public.myr_tax_invoice_amounts(p_total integer)
returns table (supply integer, tax integer)
language sql
immutable
as $$
  select p_total - p_total / 11, p_total / 11
$$;
revoke all on function public.myr_tax_invoice_amounts(integer) from public, anon, authenticated;

-- 세금계산서가 필요한 지급 건 — 합계가 0원보다 크다(전부 상계 · 보증금 환급만이면 필요 없다)
create or replace function public.myr_payout_needs_invoice(p public.myr_payouts)
returns boolean
language sql
stable
as $$
  select public.myr_payout_invoice_total(p) > 0
$$;
revoke all on function public.myr_payout_needs_invoice(public.myr_payouts) from public, anon, authenticated;

-- 지급 건의 세금계산서(없으면 빈 행)
create or replace function public.myr_tax_invoice_of(p_payout_id uuid)
returns public.myr_tax_invoices
language sql
stable
as $$
  select i.* from public.myr_tax_invoices i where i.payout_id = p_payout_id
$$;
revoke all on function public.myr_tax_invoice_of(uuid) from public, anon, authenticated;

-- 운영 확인 완료
create or replace function public.myr_tax_invoice_accepted(i public.myr_tax_invoices)
returns boolean
language sql
immutable
as $$
  select coalesce(i.status = 'accepted', false)
$$;
revoke all on function public.myr_tax_invoice_accepted(public.myr_tax_invoices) from public, anon, authenticated;

-- 크리에이터가 제출할 차례 — 아직 없음 · 다시 제출 요청
create or replace function public.myr_tax_invoice_waiting_creator(i public.myr_tax_invoices)
returns boolean
language sql
immutable
as $$
  select i.id is null or i.status = 'returned'
$$;
revoke all on function public.myr_tax_invoice_waiting_creator(public.myr_tax_invoices) from public, anon, authenticated;

-- 제출 때 합계 = 지금 합계(다르면 다시 발행해야 한다)
create or replace function public.myr_tax_invoice_matches(i public.myr_tax_invoices, p public.myr_payouts)
returns boolean
language sql
stable
as $$
  select coalesce(i.total = public.myr_payout_invoice_total(p), false)
$$;
revoke all on function public.myr_tax_invoice_matches(public.myr_tax_invoices, public.myr_payouts) from public, anon, authenticated;

-- 세금계산서 쪽으로 지급해도 되는 지급 건 — 필요 없거나, 확인 완료이고 금액이 맞다
create or replace function public.myr_payout_invoice_ok(p public.myr_payouts)
returns boolean
language sql
stable
as $$
  select not public.myr_payout_needs_invoice(p)
      or (select public.myr_tax_invoice_accepted(i) and public.myr_tax_invoice_matches(i, p) from public.myr_tax_invoice_of(p.id) i)
$$;
revoke all on function public.myr_payout_invoice_ok(public.myr_payouts) from public, anon, authenticated;

-- 지급 건 보류 이유(없으면 null) — 크리에이터 쪽 이유(사업자 · 정산 정보) 먼저 · 다음 세금계산서
create or replace function public.myr_payout_hold_reason(p public.myr_payouts)
returns text
language sql
stable
as $$
  select coalesce(public.myr_seller_hold_reason(p.seller_id), case when not public.myr_payout_invoice_ok(p) then 'tax_invoice' end)
$$;
revoke all on function public.myr_payout_hold_reason(public.myr_payouts) from public, anon, authenticated;

-- 0102 정의 — 보류 이유는 지급 건 단위(myr_payout_hold_reason · 세금계산서 포함)
create or replace function public.myr_payout_auto_state(p public.myr_payouts)
returns table (status text, hold_reason text)
language sql
stable
as $$
  with x as (select public.myr_payout_has_amount(p) as amt, public.myr_payout_hold_reason(p) as why)
  select case when not x.amt then 'none' when x.why is not null then 'held' else 'pending' end,
         case when x.amt then x.why end
    from x
$$;
revoke all on function public.myr_payout_auto_state(public.myr_payouts) from public, anon, authenticated;

-- 0102 정의 + 세금계산서 확인 전
create or replace function public.myr_payout_hold_label(p_code text)
returns text
language sql
immutable
as $$
  select case p_code when 'settle_info' then '사업자 · 정산 정보 확인 전' when 'tax_invoice' then '세금계산서 확인 전' when 'manual' then '운영팀 확인 중' end
$$;
revoke all on function public.myr_payout_hold_label(text) from public, anon, authenticated;

-- 세금계산서 상태 문구 — 정산 탭 · 운영 목록이 같이 쓴다(없으면 제출 전)
create or replace function public.myr_tax_invoice_status_label(p_status text)
returns text
language sql
immutable
as $$
  select case p_status when 'submitted' then '확인 중' when 'accepted' then '확인 완료' when 'returned' then '다시 제출 필요' else '제출 전' end
$$;
revoke all on function public.myr_tax_invoice_status_label(text) from public, anon, authenticated;

-- 작성일자 = 정산월 말일(한국 날짜)
create or replace function public.myr_tax_invoice_write_date(p_month date)
returns date
language sql
stable
as $$
  select public.myr_kst_date(public.myr_settlement_month_end(p_month)) - 1
$$;
revoke all on function public.myr_tax_invoice_write_date(date) from public, anon, authenticated;

-- 발행 기한 = 다음 달 10일
create or replace function public.myr_tax_invoice_due(p_month date)
returns date
language sql
stable
as $$
  select public.myr_kst_date(public.myr_settlement_month_end(p_month)) + 9
$$;
revoke all on function public.myr_tax_invoice_due(date) from public, anon, authenticated;

-- 발행 기한 지남 — 필요 · 지급 전 · 크리에이터가 제출할 차례인데 오늘(KST)이 기한 뒤
create or replace function public.myr_tax_invoice_overdue(p public.myr_payouts, p_now timestamptz)
returns boolean
language sql
stable
as $$
  select public.myr_payout_needs_invoice(p) and not public.myr_payout_is_paid(p)
     and public.myr_tax_invoice_waiting_creator(public.myr_tax_invoice_of(p.id))
     and public.myr_kst_date(p_now) > public.myr_tax_invoice_due(public.myr_payout_month(p))
$$;
revoke all on function public.myr_tax_invoice_overdue(public.myr_payouts, timestamptz) from public, anon, authenticated;

-- 승인번호 정리 — 하이픈 · 공백을 빼고 소문자. 앞 8자리 숫자(날짜) + 영문 소문자 · 숫자 16자리(국세청 24자리)가 아니면 null.
--   입력 형식 규칙이라 콘솔(packages/myr-core/src/tax-invoice.ts normalizeApprovalNo)에도 같은 규칙이 있다(백엔드 원칙 1 예외)
create or replace function public.myr_tax_invoice_no(p text)
returns text
language sql
immutable
as $$
  select case when x ~ '^[0-9]{8}[0-9a-z]{16}$' then x end
    from (select lower(regexp_replace(coalesce(p, ''), '[\s-]', '', 'g')) as x) y
$$;
revoke all on function public.myr_tax_invoice_no(text) from public, anon, authenticated;

-- 지급 건의 세금계산서 응답 — 정산 탭 달 상세 · 운영 목록 · 회차 보고가 같이 쓴다(금액 · 날짜 · 상태 · 버튼 조건을 화면이 다시 계산하지 않는다)
create or replace function public.myr_payout_invoice_json(p public.myr_payouts, p_now timestamptz default now())
returns jsonb
language sql
stable
as $$
  select case when p.id is not null then jsonb_build_object(
    'needed', public.myr_payout_needs_invoice(p),
    -- 지급 전이거나 이미 낸 세금계산서가 있으면 보여 준다(0104 전에 지급 완료된 건은 숨긴다)
    'show', public.myr_payout_needs_invoice(p) and (i.id is not null or not public.myr_payout_is_paid(p)),
    'total', public.myr_payout_invoice_total(p), 'supply', a.supply, 'tax', a.tax,
    'write_date', public.myr_tax_invoice_write_date(public.myr_payout_month(p)),
    'due_date', public.myr_tax_invoice_due(public.myr_payout_month(p)),
    'overdue', public.myr_tax_invoice_overdue(p, p_now),
    -- 크리에이터가 할 일(제출 전 · 다시 제출 필요 · 지급 전) — 정산 탭 달 카드 칩
    'todo', public.myr_payout_needs_invoice(p) and not public.myr_payout_is_paid(p) and public.myr_tax_invoice_waiting_creator(i),
    'status', coalesce(i.status, 'none'), 'status_label', public.myr_tax_invoice_status_label(i.status),
    'approval_no', i.approval_no, 'return_note', i.return_note, 'submitted_at', i.submitted_at, 'checked_at', i.checked_at,
    -- 낸 뒤 합계가 바뀌었다(다시 발행해야 한다)
    'amount_changed', i.id is not null and not public.myr_tax_invoice_matches(i, p),
    'can_submit', public.myr_payout_needs_invoice(p) and not public.myr_payout_is_paid(p) and not public.myr_tax_invoice_accepted(i)) end
    from public.myr_tax_invoice_of(p.id) i
    cross join lateral public.myr_tax_invoice_amounts(public.myr_payout_invoice_total(p)) a
$$;
revoke all on function public.myr_payout_invoice_json(public.myr_payouts, timestamptz) from public, anon, authenticated;

-- ---------- 크리에이터 제출(콘솔 /api/my/settle/invoice) ----------
create or replace function public.myr_app_seller_tax_invoice_submit(p_user uuid, p_month date, p_approval_no text, p_now timestamptz default now())
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_seller uuid;
  v        public.myr_payouts%rowtype;
  v_inv    public.myr_tax_invoices%rowtype;
  v_no     text := public.myr_tax_invoice_no(p_approval_no);
begin
  select s.id into v_seller from public.sellers s where s.user_id = p_user and p_user is not null;
  if v_seller is null or p_month is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  v := public.myr_payout_of((public.myr_settlement_run_of(p_month)).id, v_seller);
  if v.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select * into v from public.myr_payouts where id = v.id for update;
  if not public.myr_payout_needs_invoice(v) then return jsonb_build_object('ok', false, 'code', 'NOT_NEEDED'); end if;
  if public.myr_payout_is_paid(v) then return jsonb_build_object('ok', false, 'code', 'ALREADY_PAID'); end if;
  v_inv := public.myr_tax_invoice_of(v.id);
  if public.myr_tax_invoice_accepted(v_inv) then return jsonb_build_object('ok', false, 'code', 'ALREADY_ACCEPTED'); end if;
  if v_no is null then return jsonb_build_object('ok', false, 'code', 'BAD_NO'); end if;
  if exists (select 1 from public.myr_tax_invoices o where o.approval_no = v_no and o.payout_id <> v.id) then
    return jsonb_build_object('ok', false, 'code', 'DUPLICATE_NO');
  end if;
  insert into public.myr_tax_invoices (payout_id, approval_no, total, status, return_note, submitted_at, checked_at, checked_by, updated_at)
  values (v.id, v_no, public.myr_payout_invoice_total(v), 'submitted', null, p_now, null, null, now())
  on conflict (payout_id) do update
     set approval_no = excluded.approval_no, total = excluded.total, status = 'submitted', return_note = null,
         submitted_at = excluded.submitted_at, checked_at = null, checked_by = null, updated_at = now()
  returning * into v_inv;
  insert into public.myr_tax_invoice_logs (invoice_id, action, approval_no, total, actor) values (v_inv.id, 'submit', v_no, v_inv.total, 'seller:' || p_user::text);
  perform public.myr_payout_refresh(v.id);
  select * into v from public.myr_payouts where id = v.id;
  return jsonb_build_object('ok', true, 'invoice', public.myr_payout_invoice_json(v, p_now));
end;
$$;
revoke all on function public.myr_app_seller_tax_invoice_submit(uuid, date, text, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_tax_invoice_submit(uuid, date, text, timestamptz) to service_role;

-- ---------- 운영 목록 · 확인 · 다시 제출 요청(스크립트 myr-settle.mjs invoices · invoice-ok · invoice-return) ----------

-- 세금계산서가 필요한 지급 건 — p_month null 이면 모든 달 · p_status = none(제출 전) · submitted · accepted · returned · null 이면 전부.
--   홈택스 대조용으로 크리에이터 상호 · 사업자등록번호 원문을 싣는다(service_role 만)
create or replace function public.myr_tax_invoice_list(p_month date default null, p_status text default null, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'month', to_char(public.myr_payout_month(p), 'YYYY-MM'),
           'seller', jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'company', s.tax_info ->> 'company', 'biz_no', s.biz_no),
           'payout_status', p.status, 'payout_label', public.myr_payout_status_label(p.status),
           'invoice', x.j)
         order by public.myr_payout_month(p), s.handle), '[]'::jsonb)
    from public.myr_payouts p
    join public.sellers s on s.id = p.seller_id
    cross join lateral (select public.myr_payout_invoice_json(p, p_now) as j) x
   where (p_month is null or p.run_id = (public.myr_settlement_run_of(p_month)).id)
     and (x.j ->> 'show')::boolean
     and (p_status is null or x.j ->> 'status' = p_status)
$$;
revoke all on function public.myr_tax_invoice_list(date, text, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_tax_invoice_list(date, text, timestamptz) to service_role;

create or replace function public.myr_tax_invoice_accept(p_month date, p_handle text, p_actor text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v     public.myr_payouts%rowtype;
  v_inv public.myr_tax_invoices%rowtype;
begin
  v := public.myr_payout_find(p_month, p_handle);
  if v.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select * into v from public.myr_payouts where id = v.id for update;
  if public.myr_payout_is_paid(v) then return jsonb_build_object('ok', false, 'code', 'ALREADY_PAID'); end if;
  v_inv := public.myr_tax_invoice_of(v.id);
  if public.myr_tax_invoice_accepted(v_inv) then return jsonb_build_object('ok', false, 'code', 'ALREADY_ACCEPTED'); end if;
  if public.myr_tax_invoice_waiting_creator(v_inv) then return jsonb_build_object('ok', false, 'code', 'NOT_SUBMITTED'); end if;
  if not public.myr_tax_invoice_matches(v_inv, v) then
    return jsonb_build_object('ok', false, 'code', 'AMOUNT_CHANGED', 'submitted_total', v_inv.total, 'total', public.myr_payout_invoice_total(v));
  end if;
  update public.myr_tax_invoices set status = 'accepted', checked_at = now(), checked_by = coalesce(p_actor, 'script'), updated_at = now()
   where id = v_inv.id returning * into v_inv;
  insert into public.myr_tax_invoice_logs (invoice_id, action, approval_no, total, actor) values (v_inv.id, 'accept', v_inv.approval_no, v_inv.total, coalesce(p_actor, 'script'));
  perform public.myr_payout_refresh(v.id);
  select * into v from public.myr_payouts where id = v.id;
  return jsonb_build_object('ok', true, 'status', v.status, 'hold_reason', v.hold_reason, 'hold_label', public.myr_payout_hold_label(v.hold_reason), 'payable', public.myr_payout_payable(v));
end;
$$;
revoke all on function public.myr_tax_invoice_accept(date, text, text) from public, anon, authenticated;
grant execute on function public.myr_tax_invoice_accept(date, text, text) to service_role;

-- 다시 제출 요청 — 확인 중 · 확인 완료(지급 전)에서. 사유 필수 · 크리에이터에게 사유가 보인다 · 지급 건은 다시 보류
create or replace function public.myr_tax_invoice_return(p_month date, p_handle text, p_note text, p_actor text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v      public.myr_payouts%rowtype;
  v_inv  public.myr_tax_invoices%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
begin
  v := public.myr_payout_find(p_month, p_handle);
  if v.id is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_note = '' then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;
  select * into v from public.myr_payouts where id = v.id for update;
  if public.myr_payout_is_paid(v) then return jsonb_build_object('ok', false, 'code', 'ALREADY_PAID'); end if;
  v_inv := public.myr_tax_invoice_of(v.id);
  if public.myr_tax_invoice_waiting_creator(v_inv) then return jsonb_build_object('ok', false, 'code', 'NOT_SUBMITTED'); end if;
  update public.myr_tax_invoices set status = 'returned', return_note = v_note, checked_at = now(), checked_by = coalesce(p_actor, 'script'), updated_at = now()
   where id = v_inv.id returning * into v_inv;
  insert into public.myr_tax_invoice_logs (invoice_id, action, approval_no, total, note, actor) values (v_inv.id, 'return', v_inv.approval_no, v_inv.total, v_note, coalesce(p_actor, 'script'));
  perform public.myr_payout_refresh(v.id);
  select * into v from public.myr_payouts where id = v.id;
  return jsonb_build_object('ok', true, 'status', v.status, 'hold_reason', v.hold_reason);
end;
$$;
revoke all on function public.myr_tax_invoice_return(date, text, text, text) from public, anon, authenticated;
grant execute on function public.myr_tax_invoice_return(date, text, text, text) to service_role;

-- ---------- 회차 보고 · 정산 탭에 세금계산서 ----------
-- 0103 정의 + 지급 건 세금계산서(myr_payout_invoice_json)
create or replace function public.myr_settlement_report(p_month date)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'month', to_char(u.month, 'YYYY-MM'), 'cutoff_at', u.cutoff_at, 'created_by', u.created_by,
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
               'seller', jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'settle_status', s.myr_settle_status),
               'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name),
               'status', r.status, 'pct', r.pct, 'sales', r.sales, 'refund_adj', r.refund_adj, 'carry_in', r.carry_in, 'base', r.base,
               'carry_out', r.carry_out, 'settle', r.settle, 'mfg_before', r.mfg_before, 'offset', r.offset_amount, 'mfg_after', r.mfg_after,
               'deposit_refund', r.deposit_refund, 'payout', r.payout, 'confirmed_at', r.confirmed_at,
               'lines', public.myr_settlement_row_lines(r),
               'refund_lines', (select count(*) from public.myr_settlement_items i where i.row_id = r.id and i.kind = 'refund_adj'))
             order by s.handle, p.code)
             from public.myr_settlement_rows r
             join public.sellers s on s.id = r.seller_id
             join public.myr_products p on p.id = r.product_id
            where r.run_id = u.id), '[]'::jsonb),
    -- 지급 건(0101) — 이 회차에서 나가는 크리에이터별 금액 · 상태 · 합계는 myr_payout_amount 로만 센다(스크립트가 줄을 직접 더하지 않게)
    'payouts', coalesce((select jsonb_agg(jsonb_build_object(
               'seller', jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'settle_status', s.myr_settle_status),
               'status', p.status, 'status_label', public.myr_payout_status_label(p.status),
               'hold_reason', p.hold_reason, 'hold_label', public.myr_payout_hold_label(p.hold_reason), 'hold_note', p.hold_note,
               'payable', public.myr_payout_payable(p), 'amount', public.myr_payout_amount(p),
               'paid_on', p.paid_on, 'paid_amount', p.paid_amount, 'paid_note', p.paid_note, 'paid_bank', p.paid_bank,
               'invoice', public.myr_payout_invoice_json(p),
               'rows', (select count(*) from public.myr_settlement_rows r where r.payout_id = p.id))
             order by s.handle)
             from public.myr_payouts p join public.sellers s on s.id = p.seller_id where p.run_id = u.id), '[]'::jsonb),
    'payout_total', coalesce((select sum(public.myr_payout_amount(p)) from public.myr_payouts p where p.run_id = u.id), 0))
    from public.myr_settlement_run_of(p_month) u
   where u.id is not null
$$;
revoke all on function public.myr_settlement_report(date) from public, anon, authenticated;
grant execute on function public.myr_settlement_report(date) to service_role;

-- 0103 정의 + 달마다 세금계산서(myr_payout_invoice_json · 지급 건이 없으면 null)
create or replace function public.myr_app_seller_settlements_of_user(p_user uuid, p_now timestamptz default now())
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'settle_status', s.myr_settle_status,
    -- 다음 정산 보류 이유(크리에이터 쪽 · myr_seller_hold_reason) — 배너 · 다음 정산 상태
    'next_hold', case when public.myr_seller_hold_reason(s.id) is not null
                      then jsonb_build_object('code', public.myr_seller_hold_reason(s.id), 'label', public.myr_payout_hold_label(public.myr_seller_hold_reason(s.id))) end,
    'preview', pv.v,
    'ledgers', lg.v,
    -- 제조금액 · 보증금 탭 머리 — 남은 제조금액 합 · 돌려받을 보증금 합(상품별 값의 합 · 화면이 더하지 않는다)
    'ledger_total', jsonb_build_object(
      'remaining', coalesce((select sum((e ->> 'remaining')::int) from jsonb_array_elements(lg.v) e), 0),
      'deposit_held', coalesce((select sum((e ->> 'deposit_held')::int) from jsonb_array_elements(lg.v) e), 0)),
    -- 월별 내역(최근 순) — 카드 하나 = 그 회차. 지급액은 그 회차 내 지급 건 금액(myr_payout_amount · 0101).
    --   카드 줄 = myr_settlement_card_rows. 내 줄이 다른 회차 지급 건에서 나갔으면 released_in(합계 제외),
    --   확정됐지만 아직 지급 건이 없으면 next_payout(다음 정산에서 지급 · 합계 제외). 합계는 이 회차 지급 건에 담긴 줄만(counted)
    'months', coalesce((select jsonb_agg(m.j order by m.month desc) from (
                 select u.month, jsonb_build_object(
                   'month', to_char(u.month, 'YYYY-MM'),
                   'settled_at', u.cutoff_at,
                   'pay_at', public.myr_settlement_pay_at(u.month),
                   'payout_status', (public.myr_payout_of(u.id, s.id)).status,
                   -- 이체한 날(지급 완료일 때 · 0103) — 화면은 이 날을 지급일로 보여 준다
                   'paid_on', (public.myr_payout_of(u.id, s.id)).paid_on,
                   'payout_label', coalesce(public.myr_payout_status_label((public.myr_payout_of(u.id, s.id)).status), public.myr_payout_status_label('none')),
                   -- 보류 이유(크리에이터에게는 문구만 · 운영 메모는 싣지 않는다)
                   'hold', case when (public.myr_payout_of(u.id, s.id)).hold_reason is not null
                                then jsonb_build_object('code', (public.myr_payout_of(u.id, s.id)).hold_reason, 'label', public.myr_payout_hold_label((public.myr_payout_of(u.id, s.id)).hold_reason)) end,
                   -- 세금계산서(0104) — 합계 · 공급가액 · 세액 · 작성일자 · 발행 기한 · 상태 · 제출 가능
                   'invoice', public.myr_payout_invoice_json(public.myr_payout_of(u.id, s.id), p_now),
                   'total', jsonb_build_object(
                     'sales', coalesce(sum(x.sales) filter (where x.counted), 0), 'refund_adj', coalesce(sum(x.refund_adj) filter (where x.counted), 0),
                     'net_sales', public.myr_settlement_net_sales(coalesce(sum(x.sales) filter (where x.counted), 0)::int, coalesce(sum(x.refund_adj) filter (where x.counted), 0)::int),
                     'settle', coalesce(sum(x.settle) filter (where x.counted), 0),
                     'offset', coalesce(sum(x.offset_amount) filter (where x.counted), 0), 'deposit_refund', coalesce(sum(x.deposit_refund) filter (where x.counted), 0),
                     'payout', public.myr_payout_amount(public.myr_payout_of(u.id, s.id)),
                     'held', count(*) filter (where x.status = 'held')),
                   'rows', jsonb_agg(jsonb_build_object(
                     'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url),
                     'status', x.status, 'origin', to_char(x.origin, 'YYYY-MM'), 'released_in', to_char(x.released_in, 'YYYY-MM'), 'next_payout', x.next_payout,
                     'counted', x.counted, 'releasable', x.releasable,
                     'pct', x.pct, 'sales', x.sales, 'refund_adj', x.refund_adj, 'carry_in', x.carry_in, 'carry_out', x.carry_out,
                     'settle', x.settle, 'offset', x.offset_amount, 'mfg_after', x.mfg_after, 'deposit_refund', x.deposit_refund, 'payout', x.payout)
                     order by x.origin nulls first, p.name)) as j
                   from public.myr_settlement_runs u
                   cross join lateral (
                     -- 카드 줄 = myr_settlement_card_rows(그 회차의 내 줄 + 그 회차 지급 건에 담긴 지난 달 줄)
                     select r.product_id, r.status, case when c.origin then ro.month end as origin,
                            (select l.month from public.myr_settlement_runs l where l.id = c.paid_later_run) as released_in,
                            public.myr_settlement_row_payable(r) as next_payout, c.counted, public.myr_settlement_row_releasable(r) as releasable,
                            r.pct, r.sales, r.refund_adj, r.carry_in, r.carry_out, r.settle, r.offset_amount, r.mfg_after, r.deposit_refund, r.payout
                       from public.myr_settlement_card_rows(s.id, u.id) c
                       join public.myr_settlement_rows r on r.id = c.row_id
                       join public.myr_settlement_runs ro on ro.id = r.run_id
                   ) x
                   join public.myr_products p on p.id = x.product_id
                  group by u.id, u.month, u.cutoff_at) m), '[]'::jsonb))
    from public.sellers s
    cross join lateral (select public.myr_settlement_preview(s.id, p_now) as v) pv
    cross join lateral (
      -- 제조 원장 — 원장이 있거나 · 정산 줄이 있거나 · 팔린 적이 있는 내 상품(원장 없이 팔렸으면 "제조금액 확인 중"으로 보인다)
      select coalesce((select jsonb_agg(jsonb_build_object(
                 'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url),
                 'has_ledger', public.myr_mfg_has_ledger(p.id),
                 'batches', coalesce((select jsonb_agg(jsonb_build_object('seq', b.seq, 'amount', b.amount, 'deposit_amount', b.deposit_amount,
                                                                          'deposit_paid', public.myr_mfg_batch_deposit_paid(b), 'deposit_refunded', public.myr_mfg_batch_deposit_refunded(b))
                                                       order by b.seq)
                                        from public.myr_mfg_batches b where b.product_id = p.id and public.myr_mfg_batch_live(b)), '[]'::jsonb),
                 'total', public.myr_mfg_total(p.id),
                 'offset', public.myr_mfg_offset_total(p.id),
                 'remaining', public.myr_mfg_remaining(p.id),
                 -- 갚은 비율(0103 · myr_mfg_repaid_pct) — 원장 카드 글자 · 막대
                 'repaid_pct', public.myr_mfg_repaid_pct(p.id),
                 -- 상환 완료 = 원장이 있고 남은 제조금액 0(myr_mfg_paid_off) — 화면이 remaining 을 비교하지 않는다
                 'paid_off', public.myr_mfg_has_ledger(p.id) and public.myr_mfg_paid_off(public.myr_mfg_remaining(p.id)),
                 -- 보증금 합 — myr_mfg_deposits 하나(맡김 = 입금 확인 · 환급 전 · 전체 = 환급 전 · 입금 전 포함) · 화면이 빼고 더하지 않는다
                 'deposit_paid', d.paid, 'deposit_unpaid', d.unpaid, 'deposit_refunded', d.refunded, 'deposit_held', d.held, 'deposit_total', d.total, 'deposit_state', d.state,
                 -- 다음 정산 상환 예정 = 다음 정산 예상 줄(보류 해제분 포함)의 그 상품 상계 합
                 'next_offset', coalesce((select sum((e ->> 'offset')::int) from jsonb_array_elements(pv.v -> 'rows') e where e #>> '{product,id}' = p.id::text), 0))
               order by p.created_at)
               from public.myr_products p
               cross join lateral public.myr_mfg_deposits(p.id) d
              where p.seller_id = s.id and p.deleted_at is null
                and (public.myr_mfg_has_ledger(p.id) or exists (select 1 from public.myr_settlement_rows r where r.product_id = p.id)
                     or exists (select 1 from public.myr_order_items i join public.myr_orders o on o.id = i.order_id
                                 where i.product_id = p.id and o.paid_at is not null and public.myr_line_valid(i)))), '[]'::jsonb) as v
    ) lg
   where s.user_id = p_user and p_user is not null
$$;
revoke all on function public.myr_app_seller_settlements_of_user(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_app_seller_settlements_of_user(uuid, timestamptz) to service_role;

-- 이미 있는 지급 건도 자동 상태로(세금계산서가 필요한데 확인 전이면 지급 보류 · 이유 tax_invoice) — 지급 완료 · 운영 보류는 그대로
do $$
declare
  v record;
begin
  for v in select id from public.myr_payouts loop
    perform public.myr_payout_refresh(v.id);
  end loop;
end;
$$;
