-- ============================================================
-- 0087 — MYR 정산 계산 · 확정(docs/myr.md §9-6 작업 순서 5 · 2026-11-10 대표 결정)
--
--   정책(§9-6): 판매가(공구가로 팔렸으면 공구가 — 줄 단가) × 60% · 매월 1일에 **배송 완료일(KST)이 지난달 이하이고 아직 정산 안 된 줄** ·
--     정산 뒤 환불은 다음 회차에서 뺀다 · 제조금액은 **상품별**로 먼저 상계 · 남은 제조금액이 0 이 되는 회차에 **입금 확인된 보증금** 환급 ·
--     재생산은 제조 차수로 더한다.
--   결정(2026-11-10): ① 크론이 매월 1일 13:00(KST)에 계산하고 **바로 확정** — 제조 원장이 없는 상품만 **보류**(운영이 제조금액을 넣고 그 상품만 확정)
--     ② 원 미만 버림(상품 · 회차 합계에 60%) ③ 보증금 환급은 입금 확인된 것만 ④ 환불이 더 커서 마이너스면 다음 회차로 이월(지급 0)
--     ⑤ 사업자 정보 미확인 크리에이터도 계산 · 확정은 하고 지급만 보류(작업 순서 7).
--
--   비율: platform_settings 'myr_settlement' { pct: 60, deposit_pct: 25 } — 회차 줄에 그때 비율을 남긴다. 화면 표시용 거울은 @sellery/myr-core/settlement-rules.
--
--   표
--     myr_mfg_batches       제조 원장(상품 × 차수) — 제조금액 · 보증금(= 제조금액 × deposit_pct% 버림) · 보증금 입금 확인 · 환급된 회차 줄 · 무효 처리(지우지 않는다)
--                           제조금액 0원 차수 = "제조금액 없음"을 운영이 명시한 것(보류를 풀 때 쓴다)
--     myr_settlement_runs   회차(정산월 1개 = 1행) · 계산 시각(cutoff)
--     myr_settlement_rows   회차 × 상품 — 판매 · 정산 뒤 환불 · 이월 · 정산금 · (확정이면) 상계 · 남은 제조금액 · 보증금 환급 · 지급액
--     myr_settlement_items  회차 줄 × 주문 줄 — sale(처음 정산될 때 · 그때 환불액 스냅샷) · refund_adj(정산 뒤 늘어난 환불)
--
--   함수(service role 만)
--     myr_settlement_run(month, actor, now)        회차 계산 + 확정(멱등 — 이미 있으면 already) · 지난달 이전만 · 더 늦은 회차가 있으면 OUT_OF_ORDER
--     myr_settlement_confirm_held(product, actor)  보류 줄 확정(그 상품의 보류 줄을 정산월 순서로) — 제조 원장이 없으면 NO_MFG
--     myr_settlement_report(month)                 회차 보고(크리에이터 · 상품 · 금액 · 줄 수) — 운영 스크립트 · 어드민
--     myr_mfg_add(product, amount, note, actor) · myr_mfg_deposit(product, seq, paid_at) · myr_mfg_void(product, seq, reason, actor) · myr_mfg_ledger(product)
--     myr_mfg_pending()                            보류 줄이 있는 상품 + 판매 중인데 제조 원장이 없는 상품
--   판정(누가 정산되는지 · 얼마인지)은 이 파일의 함수에만 둔다(백엔드 원칙 1) — 크리에이터 정산 탭(6) · 어드민(8)은 여기 결과를 읽는다.
--   테스트: supabase/tests/myr_settlements.test.sql. 재실행 가능.
-- ============================================================

insert into public.platform_settings (key, value, description)
values ('myr_settlement', '{"pct": 60, "deposit_pct": 25}', 'MYR 정산 — 판매가 × pct%(65 − PG 5) · 보증금 = 제조금액 × deposit_pct%(docs/myr.md §9-6)')
on conflict (key) do nothing;

create or replace function public.myr_settlement_pct()
returns integer
language sql
stable
as $$
  select coalesce((select (value ->> 'pct')::integer from public.platform_settings where key = 'myr_settlement'), 60)
$$;
revoke all on function public.myr_settlement_pct() from public, anon, authenticated;

create or replace function public.myr_deposit_pct()
returns integer
language sql
stable
as $$
  select coalesce((select (value ->> 'deposit_pct')::integer from public.platform_settings where key = 'myr_settlement'), 25)
$$;
revoke all on function public.myr_deposit_pct() from public, anon, authenticated;

-- 정산월(1일) → KST 월 경계 [시작, 끝)
create or replace function public.myr_month_start(p_month date)
returns timestamptz
language sql
immutable
as $$
  select (date_trunc('month', p_month)::timestamp) at time zone 'Asia/Seoul'
$$;
revoke all on function public.myr_month_start(date) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 표
-- ------------------------------------------------------------
create table if not exists public.myr_settlement_runs (
  id          uuid primary key default gen_random_uuid(),
  month       date not null unique check (month = date_trunc('month', month)::date),   -- 정산월(그 달 1일)
  cutoff_at   timestamptz not null,                                                       -- 계산 시각 — 이 뒤 환불은 다음 회차 차감
  created_by  text not null,                                                              -- cron · script · admin:<uuid>
  created_at  timestamptz not null default now()
);
alter table public.myr_settlement_runs enable row level security;
revoke all on public.myr_settlement_runs from anon, authenticated;

create table if not exists public.myr_settlement_rows (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references public.myr_settlement_runs (id) on delete restrict,
  product_id     uuid not null references public.myr_products (id) on delete restrict,
  seller_id      uuid not null references public.sellers (id) on delete restrict,
  pct            integer not null check (pct between 0 and 100),
  sales          integer not null,                     -- 이번에 처음 정산되는 줄: Σ(줄 금액 − 그때 환불액)
  refund_adj     integer not null check (refund_adj >= 0),   -- 지난 회차에 정산한 줄의 늘어난 환불
  carry_in       integer not null check (carry_in <= 0),     -- 지난 회차에서 넘어온 마이너스
  base           integer not null,                     -- sales − refund_adj + carry_in
  carry_out      integer not null check (carry_out <= 0),    -- least(base, 0) — 다음 회차로
  settle         integer not null check (settle >= 0),       -- floor(greatest(base,0) × pct / 100)
  status         text not null check (status in ('confirmed', 'held')),
  mfg_before     integer,                              -- 확정 때 남은 제조금액
  offset_amount  integer check (offset_amount is null or offset_amount >= 0),
  mfg_after      integer,
  deposit_refund integer check (deposit_refund is null or deposit_refund >= 0),
  payout         integer check (payout is null or payout >= 0),
  confirmed_at   timestamptz,
  confirmed_by   text,
  created_at     timestamptz not null default now(),
  unique (run_id, product_id),
  constraint myr_settlement_rows_confirmed check (status = 'held' or (mfg_before is not null and offset_amount is not null and mfg_after is not null
                                                                       and deposit_refund is not null and payout is not null and confirmed_at is not null))
);
create index if not exists myr_settlement_rows_product_idx on public.myr_settlement_rows (product_id, created_at);
create index if not exists myr_settlement_rows_seller_idx on public.myr_settlement_rows (seller_id, created_at);
alter table public.myr_settlement_rows enable row level security;
revoke all on public.myr_settlement_rows from anon, authenticated;

create table if not exists public.myr_settlement_items (
  id               uuid primary key default gen_random_uuid(),
  row_id           uuid not null references public.myr_settlement_rows (id) on delete restrict,
  order_item_id    uuid not null references public.myr_order_items (id) on delete restrict,
  kind             text not null check (kind in ('sale', 'refund_adj')),
  amount           integer not null,                   -- sale: 줄 금액 − 그때 환불액 · refund_adj: 늘어난 환불(양수)
  refund_snapshot  integer not null check (refund_snapshot >= 0),   -- 이 시점의 줄 환불 누적 — 다음 회차는 이것과 비교한다
  created_at       timestamptz not null default now()
);
create unique index if not exists myr_settlement_items_sale_uidx on public.myr_settlement_items (order_item_id) where kind = 'sale';
create index if not exists myr_settlement_items_row_idx on public.myr_settlement_items (row_id);
create index if not exists myr_settlement_items_item_idx on public.myr_settlement_items (order_item_id);
alter table public.myr_settlement_items enable row level security;
revoke all on public.myr_settlement_items from anon, authenticated;

create table if not exists public.myr_mfg_batches (
  id                     uuid primary key default gen_random_uuid(),
  product_id             uuid not null references public.myr_products (id) on delete restrict,
  seller_id              uuid not null references public.sellers (id) on delete restrict,
  seq                    integer not null check (seq >= 1),
  amount                 integer not null check (amount >= 0),          -- 제조금액(부가세 포함 · 0 = 제조금액 없음을 명시)
  deposit_amount         integer not null check (deposit_amount >= 0),  -- 보증금 = amount × deposit_pct% 버림(입력 때 고정)
  deposit_paid_at        timestamptz,                                   -- 보증금 입금 확인 — 환급은 이것이 있는 차수만
  deposit_refund_row_id  uuid references public.myr_settlement_rows (id) on delete restrict,   -- 환급된 회차 줄
  note                   text,
  created_by             text not null,
  created_at             timestamptz not null default now(),
  voided_at              timestamptz,
  voided_by              text,
  void_reason            text,
  unique (product_id, seq)
);
create index if not exists myr_mfg_batches_product_idx on public.myr_mfg_batches (product_id) where voided_at is null;
alter table public.myr_mfg_batches enable row level security;
revoke all on public.myr_mfg_batches from anon, authenticated;

-- ------------------------------------------------------------
-- 제조 원장 — 남은 제조금액 = 유효 차수 합계 − 확정된 상계 합계
-- ------------------------------------------------------------
create or replace function public.myr_mfg_remaining(p_product_id uuid)
returns integer
language sql
stable
as $$
  select greatest(
    coalesce((select sum(b.amount) from public.myr_mfg_batches b where b.product_id = p_product_id and b.voided_at is null), 0)
    - coalesce((select sum(r.offset_amount) from public.myr_settlement_rows r where r.product_id = p_product_id and r.status = 'confirmed'), 0), 0)::integer
$$;
revoke all on function public.myr_mfg_remaining(uuid) from public, anon, authenticated;

create or replace function public.myr_mfg_has_ledger(p_product_id uuid)
returns boolean
language sql
stable
as $$
  select exists (select 1 from public.myr_mfg_batches b where b.product_id = p_product_id and b.voided_at is null)
$$;
revoke all on function public.myr_mfg_has_ledger(uuid) from public, anon, authenticated;

create or replace function public.myr_mfg_batch_json(b public.myr_mfg_batches)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object('seq', b.seq, 'amount', b.amount, 'deposit_amount', b.deposit_amount, 'deposit_paid_at', b.deposit_paid_at,
                            'deposit_refunded', b.deposit_refund_row_id is not null, 'note', b.note, 'created_by', b.created_by, 'created_at', b.created_at,
                            'voided_at', b.voided_at, 'void_reason', b.void_reason)
$$;
revoke all on function public.myr_mfg_batch_json(public.myr_mfg_batches) from public, anon, authenticated;

-- 차수 추가(재생산 포함) — { ok, batch, remaining } · NOT_FOUND | BAD_AMOUNT
create or replace function public.myr_mfg_add(p_product_id uuid, p_amount integer, p_note text, p_actor text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p public.myr_products%rowtype;
  b public.myr_mfg_batches%rowtype;
begin
  select * into p from public.myr_products where id = p_product_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if p_amount is null or p_amount < 0 then return jsonb_build_object('ok', false, 'code', 'BAD_AMOUNT'); end if;
  insert into public.myr_mfg_batches (product_id, seller_id, seq, amount, deposit_amount, note, created_by)
  values (p.id, p.seller_id, coalesce((select max(seq) from public.myr_mfg_batches where product_id = p.id), 0) + 1,
          p_amount, (p_amount::bigint * public.myr_deposit_pct() / 100)::integer, nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_actor, 'script'))
  returning * into b;
  return jsonb_build_object('ok', true, 'batch', public.myr_mfg_batch_json(b), 'remaining', public.myr_mfg_remaining(p.id));
end;
$$;
revoke all on function public.myr_mfg_add(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.myr_mfg_add(uuid, integer, text, text) to service_role;

-- 보증금 입금 확인 — { ok, batch } · NOT_FOUND | VOIDED | ALREADY_PAID
create or replace function public.myr_mfg_deposit(p_product_id uuid, p_seq integer, p_paid_at timestamptz default now())
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  b public.myr_mfg_batches%rowtype;
begin
  select * into b from public.myr_mfg_batches where product_id = p_product_id and seq = p_seq for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if b.voided_at is not null then return jsonb_build_object('ok', false, 'code', 'VOIDED'); end if;
  if b.deposit_paid_at is not null then return jsonb_build_object('ok', false, 'code', 'ALREADY_PAID'); end if;
  update public.myr_mfg_batches set deposit_paid_at = coalesce(p_paid_at, now()) where id = b.id returning * into b;
  return jsonb_build_object('ok', true, 'batch', public.myr_mfg_batch_json(b));
end;
$$;
revoke all on function public.myr_mfg_deposit(uuid, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_mfg_deposit(uuid, integer, timestamptz) to service_role;

-- 잘못 넣은 차수 무효(지우지 않는다) — 이미 상계에 쓰였으면(무효로 남은 제조금액이 상계 합계보다 작아지면) USED · 보증금이 환급됐으면 REFUNDED
--   { ok, remaining } · NOT_FOUND | ALREADY_VOIDED | REASON_REQUIRED | REFUNDED | USED
create or replace function public.myr_mfg_void(p_product_id uuid, p_seq integer, p_reason text, p_actor text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  b public.myr_mfg_batches%rowtype;
  v_total integer;
  v_offset integer;
begin
  perform 1 from public.myr_products where id = p_product_id for update;
  select * into b from public.myr_mfg_batches where product_id = p_product_id and seq = p_seq for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if b.voided_at is not null then return jsonb_build_object('ok', false, 'code', 'ALREADY_VOIDED'); end if;
  if coalesce(btrim(p_reason), '') = '' then return jsonb_build_object('ok', false, 'code', 'REASON_REQUIRED'); end if;
  if b.deposit_refund_row_id is not null then return jsonb_build_object('ok', false, 'code', 'REFUNDED'); end if;
  select coalesce(sum(amount), 0) into v_total from public.myr_mfg_batches where product_id = p_product_id and voided_at is null and id <> b.id;
  select coalesce(sum(offset_amount), 0) into v_offset from public.myr_settlement_rows where product_id = p_product_id and status = 'confirmed';
  if v_total < v_offset then return jsonb_build_object('ok', false, 'code', 'USED'); end if;
  update public.myr_mfg_batches set voided_at = now(), voided_by = coalesce(p_actor, 'script'), void_reason = btrim(p_reason) where id = b.id;
  return jsonb_build_object('ok', true, 'remaining', public.myr_mfg_remaining(p_product_id));
end;
$$;
revoke all on function public.myr_mfg_void(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.myr_mfg_void(uuid, integer, text, text) to service_role;

-- 원장 보기 — { product, batches[], total, offset, remaining, deposit_paid, deposit_refunded }
create or replace function public.myr_mfg_ledger(p_product_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'seller_id', p.seller_id),
    'batches', coalesce((select jsonb_agg(public.myr_mfg_batch_json(b) order by b.seq) from public.myr_mfg_batches b where b.product_id = p.id), '[]'::jsonb),
    'total', coalesce((select sum(b.amount) from public.myr_mfg_batches b where b.product_id = p.id and b.voided_at is null), 0),
    'offset', coalesce((select sum(r.offset_amount) from public.myr_settlement_rows r where r.product_id = p.id and r.status = 'confirmed'), 0),
    'remaining', public.myr_mfg_remaining(p.id),
    'deposit_paid', coalesce((select sum(b.deposit_amount) from public.myr_mfg_batches b where b.product_id = p.id and b.voided_at is null and b.deposit_paid_at is not null), 0),
    'deposit_refunded', coalesce((select sum(b.deposit_amount) from public.myr_mfg_batches b where b.product_id = p.id and b.deposit_refund_row_id is not null), 0))
    from public.myr_products p where p.id = p_product_id
$$;
revoke all on function public.myr_mfg_ledger(uuid) from public, anon, authenticated;
grant execute on function public.myr_mfg_ledger(uuid) to service_role;

-- ------------------------------------------------------------
-- 확정(내부) — 상계 · 남은 제조금액 · 보증금 환급 · 지급액. 남은 제조금액이 0 이 되면(이미 0 이어도) 입금 확인되고 아직 환급 안 된 보증금을 이 줄에서 환급
-- ------------------------------------------------------------
create or replace function public.myr_settlement_apply(p_row_id uuid, p_actor text)
returns void
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  r        public.myr_settlement_rows%rowtype;
  v_before integer;
  v_offset integer;
  v_refund integer;
begin
  select * into r from public.myr_settlement_rows where id = p_row_id for update;
  perform 1 from public.myr_mfg_batches where product_id = r.product_id for update;
  v_before := public.myr_mfg_remaining(r.product_id);
  v_offset := least(r.settle, v_before);
  v_refund := 0;
  if v_before - v_offset = 0 then
    select coalesce(sum(deposit_amount), 0) into v_refund from public.myr_mfg_batches
     where product_id = r.product_id and voided_at is null and deposit_paid_at is not null and deposit_refund_row_id is null;
    update public.myr_mfg_batches set deposit_refund_row_id = r.id
     where product_id = r.product_id and voided_at is null and deposit_paid_at is not null and deposit_refund_row_id is null;
  end if;
  update public.myr_settlement_rows
     set status = 'confirmed', mfg_before = v_before, offset_amount = v_offset, mfg_after = v_before - v_offset,
         deposit_refund = v_refund, payout = r.settle - v_offset + v_refund, confirmed_at = now(), confirmed_by = coalesce(p_actor, 'script')
   where id = r.id;
end;
$$;
revoke all on function public.myr_settlement_apply(uuid, text) from public, anon, authenticated, service_role;   -- 검사 없이 확정하는 내부 함수 — run · confirm_held 만 부른다

-- ------------------------------------------------------------
-- 회차 계산 + 확정 — { ok, already, month, rows, confirmed, held, payout } · NOT_CLOSED(이번 달 이후) | BAD_MONTH | OUT_OF_ORDER
--   p_month 는 그 달 아무 날(1일로 맞춘다). p_now 는 테스트용.
-- ------------------------------------------------------------
create or replace function public.myr_settlement_run(p_month date, p_actor text default 'cron', p_now timestamptz default now())
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_month   date := date_trunc('month', p_month)::date;
  v_end     timestamptz;
  v_run     public.myr_settlement_runs%rowtype;
  v_pct     integer := public.myr_settlement_pct();
  pr        record;
  v_carry   integer;
  v_base    integer;
  v_row_id  uuid;
  v_held    boolean;
begin
  if p_month is null then return jsonb_build_object('ok', false, 'code', 'BAD_MONTH'); end if;
  v_end := public.myr_month_start((v_month + interval '1 month')::date);
  if v_end > p_now then return jsonb_build_object('ok', false, 'code', 'NOT_CLOSED'); end if;
  perform pg_advisory_xact_lock(hashtext('myr_settlement_run'));
  select * into v_run from public.myr_settlement_runs where month = v_month;
  if found then return jsonb_build_object('ok', true, 'already', true, 'month', to_char(v_month, 'YYYY-MM')); end if;
  if exists (select 1 from public.myr_settlement_runs where month > v_month) then return jsonb_build_object('ok', false, 'code', 'OUT_OF_ORDER'); end if;

  insert into public.myr_settlement_runs (month, cutoff_at, created_by) values (v_month, p_now, coalesce(p_actor, 'cron')) returning * into v_run;

  -- 이번 회차 대상: (a) 처음 정산되는 줄 — 결제된 주문 · 취소 아님 · 배송 완료가 이 달 끝 이전 · sale 기록 없음
  --                 (b) 정산 뒤 환불 — sale 기록이 있는 줄의 환불 누적이 마지막 스냅샷보다 늘었다
  create temp table if not exists _myr_settle_new (order_item_id uuid, product_id uuid, seller_id uuid, kind text, amount integer, refund_snapshot integer) on commit drop;
  truncate _myr_settle_new;
  insert into _myr_settle_new
  select i.id, i.product_id, i.seller_id, 'sale', i.amount - i.refund_amount, i.refund_amount
    from public.myr_order_items i
    join public.myr_orders o on o.id = i.order_id
   where o.paid_at is not null and o.status in ('PAID', 'PARTIAL_REFUNDED', 'REFUNDED')
     and i.status <> 'CANCELED' and i.delivered_at is not null and i.delivered_at < v_end
     and not exists (select 1 from public.myr_settlement_items s where s.order_item_id = i.id and s.kind = 'sale');
  -- 환불이 있는 줄만 보고(refund_amount > 0), 스냅샷은 줄마다 한 번 모은다(줄마다 하위 조회하면 정산한 줄이 쌓일수록 느려진다)
  insert into _myr_settle_new
  select i.id, i.product_id, i.seller_id, 'refund_adj', i.refund_amount - last.snap, i.refund_amount
    from public.myr_order_items i
    join (select s.order_item_id, max(s.refund_snapshot) as snap from public.myr_settlement_items s group by s.order_item_id) last on last.order_item_id = i.id
   where i.refund_amount > 0 and i.refund_amount > last.snap;

  for pr in
    select n.product_id, min(n.seller_id::text)::uuid as seller_id,
           coalesce(sum(n.amount) filter (where n.kind = 'sale'), 0)::integer as sales,
           coalesce(sum(n.amount) filter (where n.kind = 'refund_adj'), 0)::integer as refund_adj
      from _myr_settle_new n group by n.product_id order by n.product_id
  loop
    select coalesce((select r.carry_out from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
                      where r.product_id = pr.product_id order by u.month desc limit 1), 0) into v_carry;
    v_base := pr.sales - pr.refund_adj + v_carry;
    v_held := not public.myr_mfg_has_ledger(pr.product_id)
              or exists (select 1 from public.myr_settlement_rows r where r.product_id = pr.product_id and r.status = 'held');
    insert into public.myr_settlement_rows (run_id, product_id, seller_id, pct, sales, refund_adj, carry_in, base, carry_out, settle, status)
    values (v_run.id, pr.product_id, pr.seller_id, v_pct, pr.sales, pr.refund_adj, v_carry, v_base, least(v_base, 0),
            (greatest(v_base, 0)::bigint * v_pct / 100)::integer, 'held')
    returning id into v_row_id;
    insert into public.myr_settlement_items (row_id, order_item_id, kind, amount, refund_snapshot)
    select v_row_id, n.order_item_id, n.kind, n.amount, n.refund_snapshot from _myr_settle_new n where n.product_id = pr.product_id;
    if not v_held then perform public.myr_settlement_apply(v_row_id, coalesce(p_actor, 'cron')); end if;
  end loop;

  -- 이월만 남은 상품(이번 회차 판매 · 환불 없음)은 줄을 만들지 않는다 — 다음에 줄이 생길 때 마지막 carry_out 을 가져간다
  return jsonb_build_object('ok', true, 'already', false, 'month', to_char(v_month, 'YYYY-MM'),
    'rows', (select count(*) from public.myr_settlement_rows where run_id = v_run.id),
    'confirmed', (select count(*) from public.myr_settlement_rows where run_id = v_run.id and status = 'confirmed'),
    'held', (select count(*) from public.myr_settlement_rows where run_id = v_run.id and status = 'held'),
    'payout', coalesce((select sum(payout) from public.myr_settlement_rows where run_id = v_run.id and status = 'confirmed'), 0));
end;
$$;
revoke all on function public.myr_settlement_run(date, text, timestamptz) from public, anon, authenticated;
grant execute on function public.myr_settlement_run(date, text, timestamptz) to service_role;

-- 보류 확정 — 그 상품의 보류 줄을 정산월 순서로 확정 · { ok, confirmed, payout } · NOT_FOUND | NO_MFG | NOTHING_HELD
create or replace function public.myr_settlement_confirm_held(p_product_id uuid, p_actor text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  r     record;
  v_n   integer := 0;
  v_pay integer := 0;
begin
  perform 1 from public.myr_products where id = p_product_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if not public.myr_mfg_has_ledger(p_product_id) then return jsonb_build_object('ok', false, 'code', 'NO_MFG'); end if;
  for r in select x.id from public.myr_settlement_rows x join public.myr_settlement_runs u on u.id = x.run_id
            where x.product_id = p_product_id and x.status = 'held' order by u.month loop
    perform public.myr_settlement_apply(r.id, coalesce(p_actor, 'script'));
    v_n := v_n + 1;
    v_pay := v_pay + (select payout from public.myr_settlement_rows where id = r.id);
  end loop;
  if v_n = 0 then return jsonb_build_object('ok', false, 'code', 'NOTHING_HELD'); end if;
  return jsonb_build_object('ok', true, 'confirmed', v_n, 'payout', v_pay);
end;
$$;
revoke all on function public.myr_settlement_confirm_held(uuid, text) from public, anon, authenticated;
grant execute on function public.myr_settlement_confirm_held(uuid, text) to service_role;

-- 회차 보고 — 크리에이터 · 상품별 줄(운영 스크립트 · 어드민 · 크리에이터 정산 탭은 seller 로 걸러 같은 모양을 쓴다) · 없으면 null
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
               'lines', (select count(*) from public.myr_settlement_items i where i.row_id = r.id and i.kind = 'sale'),
               'refund_lines', (select count(*) from public.myr_settlement_items i where i.row_id = r.id and i.kind = 'refund_adj'))
             order by s.handle, p.code)
             from public.myr_settlement_rows r
             join public.sellers s on s.id = r.seller_id
             join public.myr_products p on p.id = r.product_id
            where r.run_id = u.id), '[]'::jsonb))
    from public.myr_settlement_runs u
   where u.month = date_trunc('month', p_month)::date
$$;
revoke all on function public.myr_settlement_report(date) from public, anon, authenticated;
grant execute on function public.myr_settlement_report(date) to service_role;

-- 제조 원장 대기 — 보류 줄이 있는 상품(정산금 합계) + 판매 중인데 원장이 없는 상품(다음 회차에 보류될 후보) · 운영 스크립트 · 어드민 "원장 입력 대기"
create or replace function public.myr_mfg_pending()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'held', coalesce((select jsonb_agg(jsonb_build_object('product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name),
                                                          'seller', jsonb_build_object('name', s.name, 'handle', s.handle),
                                                          'months', h.months, 'settle', h.settle) order by p.code)
                        from (select r.product_id, jsonb_agg(to_char(u.month, 'YYYY-MM') order by u.month) as months, sum(r.settle)::integer as settle
                                from public.myr_settlement_rows r join public.myr_settlement_runs u on u.id = r.run_id
                               where r.status = 'held' group by r.product_id) h
                        join public.myr_products p on p.id = h.product_id
                        join public.sellers s on s.id = p.seller_id), '[]'::jsonb),
    'no_ledger', coalesce((select jsonb_agg(jsonb_build_object('product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name),
                                                               'seller', jsonb_build_object('name', s.name, 'handle', s.handle), 'status', p.status) order by p.code)
                             from public.myr_products p join public.sellers s on s.id = p.seller_id
                            where p.deleted_at is null and p.status in ('listed', 'paused', 'ended')
                              and not public.myr_mfg_has_ledger(p.id)), '[]'::jsonb))
$$;
revoke all on function public.myr_mfg_pending() from public, anon, authenticated;
grant execute on function public.myr_mfg_pending() to service_role;
