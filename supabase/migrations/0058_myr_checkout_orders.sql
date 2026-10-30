-- ============================================================
-- 0058 MYR 결제·주문 — docs/myr.md §3 · §6.2 · §6.7 · §7 S4/S5 (2026-10-30)
--
-- 셀러리 0008/0009/0021 의 체크아웃·주문을 MYR 구조로 옮긴다: **결제 1건 = 체크아웃 1건 = 주문 1건, 줄 N개(셀러 여러 명)**.
--   · myr_checkouts(승인 전 결제 세션 · 상태 기계·멱등 선점·만료는 0008 그대로) + myr_checkout_items(줄)
--   · myr_orders(고객에게 보이는 주문 1건 · 운송장은 주문 단위 — 물류센터 일괄 발송, 결정 8) + myr_order_items(줄 = 정산·환불·CS 단위)
--   · 가상계좌는 처음부터 연다(§6.7): 승인 결과 WAITING_FOR_DEPOSIT 이면 주문을 WAITING_DEPOSIT 으로 만들고 재고를 예약(sold_qty 포함),
--     입금 콜백 → myr_app_deposit_done → PAID · 기한 만료 → myr_app_deposit_expire → CANCELED(재고 반환).
--   · 단가·배송비는 서버가 정한다: 단가 = myr_products.options[option_index].price(옵션 없으면 price) · 배송비 = myr_shipping_fee(합계)
--     (platform_settings 'myr_shipping' {free_over, fee} · 샵 화면의 FREE_SHIPPING/SHIPPING_FEE 는 표시용 거울 — 바꾸면 둘 다).
--   · sold_qty 는 myr_order_items 트리거가 상품별로 재계산(WAITING_DEPOSIT·PAID·PARTIAL_REFUNDED 주문의 qty − refunded_qty).
--   · 비회원: customers 비회원 행은 0021 app_guest_customer_upsert 를 그대로 쓰고, 토큰 발급·검증·조회만 myr_orders 를 보는 myr_app_guest_* 로.
--     0021 purge_checkout_pii 가 "주문 없는 비회원 행" 을 지울 때 myr_orders 도 보도록 여기서 재정의한다(두 샵이 customers 를 공유).
--   · 줄 단위 환불 RPC(myr_app_refund_precheck/record) 는 다음 마이그레이션 — 이 파일은 "주문이 생기기까지".
--
-- 권한(docs/myr.md §3.1 규칙 2): 표 전부 service role 만(RLS on · 정책 없음 · anon/authenticated grant 없음). 함수 전부 security definer ·
--   revoke from public, anon, authenticated · grant to service_role. actor 는 서버 세션에서 — p_user_id(회원) 또는 비회원 쿠키가 가리키는 세션 id.
-- 반환은 { ok, code } — 실패 code: BAD_LINES · LINES_REJECTED(items[{code, reason, left}]) · AMOUNT_TOO_SMALL · NO_BUYER ·
--   NOT_FOUND · CONFIRMING · EXPIRED · PAYMENT_KEY_CONFLICT · PAYMENT_MISMATCH · SOLD_OUT · NOT_AVAILABLE · WRONG_STATUS
-- 테스트: supabase/tests/myr_checkout_orders.test.sql (npm run test:db). 실행: 0057 이후. 재실행 가능.
-- ============================================================

create sequence if not exists public.myr_order_code_seq start 1001;

-- ------------------------------------------------------------
-- 배송비 규칙 — platform_settings 'myr_shipping' (§9-11 · 기본 50,000 이상 무료 · 아니면 3,000)
-- ------------------------------------------------------------
insert into public.platform_settings (key, value, description)
values ('myr_shipping', '{"free_over": 50000, "fee": 3000}'::jsonb, 'MYR 샵 배송비 — 상품 합계가 free_over 이상이면 0, 아니면 fee (docs/myr.md §9-11 · 샵 lib/data.ts FREE_SHIPPING/SHIPPING_FEE 와 같은 값)')
on conflict (key) do nothing;

create or replace function public.myr_shipping_fee(p_items_amount integer)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select case
    when p_items_amount <= 0 then 0
    when p_items_amount >= coalesce((select (ps.value ->> 'free_over')::int from public.platform_settings ps where ps.key = 'myr_shipping'), 50000) then 0
    else coalesce((select (ps.value ->> 'fee')::int from public.platform_settings ps where ps.key = 'myr_shipping'), 3000)
  end
$$;
revoke all on function public.myr_shipping_fee(integer) from public, anon, authenticated;
grant execute on function public.myr_shipping_fee(integer) to service_role;

-- ============================================================
-- myr_checkouts — 토스 결제 1건 = 체크아웃 1건 (승인 전). PENDING → CONFIRMING → CONFIRMED | FAILED | EXPIRED
-- ============================================================
create table if not exists public.myr_checkouts (
  id              uuid primary key default gen_random_uuid(),
  toss_order_id   text not null unique check (toss_order_id ~ '^[A-Za-z0-9_-]{6,64}$'),   -- 서버 생성 'myr_…'
  user_id         uuid references auth.users (id) on delete set null,          -- null = 비회원
  customer_id     uuid references public.customers (id) on delete set null,
  buyer_name      text not null,
  buyer_phone     text,
  buyer_email     text,
  shipping        jsonb not null,                       -- { recipient, phone, address1, address2?, postcode?, memo? }
  items_amount    integer not null check (items_amount >= 0),
  shipping_fee    integer not null default 0 check (shipping_fee >= 0),
  amount          integer generated always as (items_amount + shipping_fee) stored,   -- 토스에 보내고 confirm 이 대조하는 값
  order_name      text not null check (char_length(order_name) between 1 and 100),
  status          text not null default 'PENDING' check (status in ('PENDING','CONFIRMING','CONFIRMED','FAILED','EXPIRED')),
  payment_key     text,
  payment_method  text,
  approved_at     timestamptz,
  raw_payment     jsonb,
  fail_code       text,
  fail_message    text,
  expires_at      timestamptz not null default (now() + interval '30 minutes'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint myr_checkouts_confirmed_has_payment check (status <> 'CONFIRMED' or (payment_key is not null and approved_at is not null))
);
create index if not exists myr_checkouts_user_idx    on public.myr_checkouts (user_id, created_at desc);
create index if not exists myr_checkouts_pending_idx on public.myr_checkouts (expires_at) where status in ('PENDING','CONFIRMING');
create unique index if not exists myr_checkouts_payment_key_uidx on public.myr_checkouts (payment_key) where payment_key is not null;
drop trigger if exists myr_checkouts_updated_at on public.myr_checkouts;
create trigger myr_checkouts_updated_at before update on public.myr_checkouts for each row execute function public.set_updated_at();
alter table public.myr_checkouts enable row level security;
revoke all on public.myr_checkouts from anon, authenticated;

create table if not exists public.myr_checkout_items (
  id            uuid primary key default gen_random_uuid(),
  checkout_id   uuid not null references public.myr_checkouts (id) on delete cascade,
  product_id    uuid not null references public.myr_products (id) on delete restrict,
  seller_id     uuid not null references public.sellers (id) on delete restrict,   -- 서버가 products 에서 복사
  product_name  text not null,                                                      -- 스냅샷
  option_index  integer not null default 0 check (option_index >= 0),
  option_name   text not null default '',
  qty           integer not null check (qty between 1 and 9),
  unit_price    integer not null check (unit_price >= 0),                           -- 서버 값
  amount        integer generated always as (qty * unit_price) stored,
  created_at    timestamptz not null default now(),
  unique (checkout_id, product_id, option_index)
);
create index if not exists myr_checkout_items_product_idx on public.myr_checkout_items (product_id);
alter table public.myr_checkout_items enable row level security;
revoke all on public.myr_checkout_items from anon, authenticated;

-- ============================================================
-- myr_orders — 결제된(또는 입금 대기) 주문 1건 · myr_order_items — 줄(정산·환불·CS 단위)
-- ============================================================
create table if not exists public.myr_orders (
  id                   uuid primary key default gen_random_uuid(),
  code                 text not null unique default ('myr' || nextval('public.myr_order_code_seq')),   -- 주문번호 (화면은 대문자 MYR1001)
  checkout_id          uuid unique references public.myr_checkouts (id) on delete set null,
  user_id              uuid references auth.users (id) on delete set null,
  customer_id          uuid references public.customers (id) on delete set null,
  status               text not null check (status in ('WAITING_DEPOSIT','PAID','PARTIAL_REFUNDED','REFUNDED','CANCELED')),
  buyer_name           text not null,
  buyer_phone          text,
  buyer_email          text,
  shipping             jsonb not null,                   -- 수취인 원문 — admin 만 (셀러 응답에는 넣지 않는다)
  order_name           text not null,
  items_amount         integer not null check (items_amount >= 0),
  shipping_fee         integer not null default 0 check (shipping_fee >= 0),
  amount               integer generated always as (items_amount + shipping_fee) stored,
  refund_amount        integer not null default 0 check (refund_amount >= 0),   -- 줄 환불 누적 (토스 cancels[] 합과 대조)
  payment_key          text,
  payment_method       text,
  paid_at              timestamptz,                      -- WAITING_DEPOSIT 은 null · 입금되면 채움
  deposit_due_at       timestamptz,                      -- 가상계좌 입금 기한 (토스 virtualAccount.dueDate)
  raw_payment          jsonb,
  raw_cancel           jsonb,
  courier              text,
  tracking_no          text,
  shipped_at           timestamptz,
  delivered_at         timestamptz,
  exchange_courier     text,
  exchange_tracking_no text,
  exchange_shipped_at  timestamptz,
  refunded_at          timestamptz,
  refund_reason        text,
  refund_actor         text check (refund_actor is null or refund_actor in ('customer','seller','admin','system')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint myr_orders_paid_has_paid_at check (status not in ('PAID','PARTIAL_REFUNDED','REFUNDED') or paid_at is not null)
);
create index if not exists myr_orders_user_idx        on public.myr_orders (user_id, created_at desc) where user_id is not null;
create index if not exists myr_orders_customer_idx    on public.myr_orders (customer_id);
create index if not exists myr_orders_payment_key_idx on public.myr_orders (payment_key) where payment_key is not null;
create index if not exists myr_orders_status_idx      on public.myr_orders (status, created_at desc);
create index if not exists myr_orders_deposit_idx     on public.myr_orders (deposit_due_at) where status = 'WAITING_DEPOSIT';
drop trigger if exists myr_orders_updated_at on public.myr_orders;
create trigger myr_orders_updated_at before update on public.myr_orders for each row execute function public.set_updated_at();
alter table public.myr_orders enable row level security;
revoke all on public.myr_orders from anon, authenticated;

create table if not exists public.myr_order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.myr_orders (id) on delete cascade,
  product_id          uuid not null references public.myr_products (id) on delete restrict,
  seller_id           uuid not null references public.sellers (id) on delete restrict,
  product_name        text not null,
  option_index        integer not null default 0 check (option_index >= 0),
  option_name         text not null default '',
  qty                 integer not null check (qty between 1 and 9),
  unit_price          integer not null check (unit_price >= 0),
  amount              integer generated always as (qty * unit_price) stored,
  seller_margin_rate  numeric(5,4),                      -- 상품의 마진율 스냅샷 (정산 기준 · 결정 10)
  status              text not null default 'PAID' check (status in ('PAID','PARTIAL_REFUNDED','REFUNDED','CANCELED')),
  refunded_qty        integer not null default 0 check (refunded_qty >= 0 and refunded_qty <= qty),
  refund_amount       integer not null default 0 check (refund_amount >= 0),
  refunded_at         timestamptz,
  refund_reason       text,
  refund_actor        text check (refund_actor is null or refund_actor in ('customer','seller','admin','system')),
  created_at          timestamptz not null default now()
);
create index if not exists myr_order_items_order_idx   on public.myr_order_items (order_id);
create index if not exists myr_order_items_seller_idx  on public.myr_order_items (seller_id, created_at desc);
create index if not exists myr_order_items_product_idx on public.myr_order_items (product_id);
alter table public.myr_order_items enable row level security;
revoke all on public.myr_order_items from anon, authenticated;

-- ------------------------------------------------------------
-- sold_qty 캐시 — 상품별 Σ(qty − refunded_qty) (WAITING_DEPOSIT·PAID·PARTIAL_REFUNDED 주문 · CANCELED 줄 제외). 줄 트리거 + 주문 상태 트리거.
-- ------------------------------------------------------------
create or replace function public.myr_recalc_product_sold_qty(p_product_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  update public.myr_products p
     set sold_qty = coalesce((
       select sum(i.qty - i.refunded_qty)
         from public.myr_order_items i
         join public.myr_orders o on o.id = i.order_id
        where i.product_id = p_product_id
          and o.status in ('WAITING_DEPOSIT','PAID','PARTIAL_REFUNDED')
          and i.status <> 'CANCELED'), 0)
   where p.id = p_product_id
$$;
revoke all on function public.myr_recalc_product_sold_qty(uuid) from public, anon, authenticated;

create or replace function public.myr_order_items_sync_sold_qty()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op in ('INSERT','UPDATE') then perform public.myr_recalc_product_sold_qty(new.product_id); end if;
  if tg_op in ('DELETE','UPDATE') then
    if tg_op = 'DELETE' or old.product_id is distinct from new.product_id then perform public.myr_recalc_product_sold_qty(old.product_id); end if;
  end if;
  return null;
end;
$$;
drop trigger if exists myr_order_items_sync_sold_qty on public.myr_order_items;
create trigger myr_order_items_sync_sold_qty
  after insert or update or delete on public.myr_order_items
  for each row execute function public.myr_order_items_sync_sold_qty();

create or replace function public.myr_orders_sync_sold_qty()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.myr_recalc_product_sold_qty(i.product_id) from (select distinct product_id from public.myr_order_items where order_id = new.id) i;
  end if;
  return null;
end;
$$;
drop trigger if exists myr_orders_sync_sold_qty on public.myr_orders;
create trigger myr_orders_sync_sold_qty
  after update of status on public.myr_orders
  for each row execute function public.myr_orders_sync_sold_qty();

-- ------------------------------------------------------------
-- 소프트 예약 — 진행 중(PENDING/CONFIRMING · 미만료) 체크아웃 줄의 qty 합 (상품별)
-- ------------------------------------------------------------
create or replace function public.myr_app_checkout_reserved(p_product_id uuid)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select coalesce(sum(ci.qty), 0)::int
    from public.myr_checkout_items ci
    join public.myr_checkouts c on c.id = ci.checkout_id
   where ci.product_id = p_product_id
     and c.status in ('PENDING','CONFIRMING')
     and c.expires_at > now()
$$;
revoke all on function public.myr_app_checkout_reserved(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_checkout_reserved(uuid) to service_role;

-- 체크아웃 요약(PII 없음) — claim/create 반환 · reconcile 입력
create or replace function public.myr_checkout_brief(c public.myr_checkouts)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'id', c.id, 'status', c.status, 'amount', c.amount, 'items_amount', c.items_amount, 'shipping_fee', c.shipping_fee,
    'order_name', c.order_name, 'user_id', c.user_id, 'toss_order_id', c.toss_order_id, 'payment_key', c.payment_key,
    'fail_code', c.fail_code, 'fail_message', c.fail_message, 'updated_at', c.updated_at, 'expires_at', c.expires_at)
$$;
revoke all on function public.myr_checkout_brief(public.myr_checkouts) from public, anon, authenticated;

-- ============================================================
-- myr_app_create_checkout(user, customer, buyer, shipping, lines, toss_order_id, prev_checkout) — 세션 + 줄 insert (한 트랜잭션)
--   lines = [{ code, option_index?, qty }] 1~20줄 · 같은 (code, option_index) 는 합친다(상한 9 초과면 BAD_LINES).
--   줄마다: listed·미삭제·셀러 active(아니면 NOT_AVAILABLE) · 옵션 범위(BAD_OPTION) · 단가 = options[i].price 또는 price ·
--     잔여 = stock − sold_qty − 소프트 예약 + 본인 PENDING 예약(곧 SUPERSEDED) ≥ qty (아니면 SOLD_OUT · left)
--   **한 줄이라도 미달이면 아무것도 만들지 않고** { ok:false, code:'LINES_REJECTED', items:[{code, reason, left?}] }.
--   금액 = Σ(단가 × qty) ≥ 100(AMOUNT_TOO_SMALL) · 배송비 = myr_shipping_fee(금액).
--   supersede: 회원이면 같은 user 의 PENDING 전부, 비회원이면 p_prev_checkout_id(쿠키가 가리키는 1건 · user_id null) → EXPIRED/SUPERSEDED.
--   buyer = { name(필수), phone, email } · 반환 { ok:true, checkout: brief }
-- ============================================================
create or replace function public.myr_app_create_checkout(
  p_user_id uuid, p_customer_id uuid, p_buyer jsonb, p_shipping jsonb, p_lines jsonb, p_toss_order_id text, p_prev_checkout_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c_max_qty   constant integer := 9;
  c_max_lines constant integer := 20;
  l            jsonb;
  v_code       text;
  v_opt        integer;
  v_qty        integer;
  v_merged     jsonb := '{}'::jsonb;            -- key "code#opt" → qty
  v_key        text;
  v_problems   jsonb := '[]'::jsonb;
  v_rows       jsonb := '[]'::jsonb;            -- 통과한 줄 [{product_id, seller_id, product_name, option_index, option_name, qty, unit_price}]
  p            public.myr_products%rowtype;
  s            public.sellers%rowtype;
  v_unit       integer;
  v_optname    text;
  v_left       integer;
  v_own        integer;
  v_items_amt  integer := 0;
  v_fee        integer;
  v_name       text;
  v_n          integer := 0;
  v_order_name text;
  c            public.myr_checkouts%rowtype;
  r            jsonb;
begin
  if p_buyer is null or coalesce(btrim(p_buyer ->> 'name'), '') = '' then return jsonb_build_object('ok', false, 'code', 'NO_BUYER'); end if;
  if p_shipping is null or jsonb_typeof(p_shipping) <> 'object' then return jsonb_build_object('ok', false, 'code', 'BAD_SHIPPING'); end if;
  if p_toss_order_id is null or p_toss_order_id !~ '^[A-Za-z0-9_-]{6,64}$' then return jsonb_build_object('ok', false, 'code', 'BAD_ORDER_ID'); end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > c_max_lines then
    return jsonb_build_object('ok', false, 'code', 'BAD_LINES');
  end if;

  -- 1) 같은 (code, option_index) 합치기 + 형식 검사
  for l in select * from jsonb_array_elements(p_lines) loop
    v_code := lower(btrim(coalesce(l ->> 'code', '')));
    v_opt  := case when (l ->> 'option_index') is null then 0 when (l ->> 'option_index') ~ '^\d{1,3}$' then (l ->> 'option_index')::int else -1 end;
    v_qty  := case when (l ->> 'qty') ~ '^\d{1,3}$' then (l ->> 'qty')::int else -1 end;
    if v_code !~ '^[a-z0-9][a-z0-9-]{0,47}$' or v_opt < 0 or v_qty < 1 or v_qty > c_max_qty then
      return jsonb_build_object('ok', false, 'code', 'BAD_LINES');
    end if;
    v_key := v_code || '#' || v_opt;
    v_qty := v_qty + coalesce((v_merged ->> v_key)::int, 0);
    if v_qty > c_max_qty then return jsonb_build_object('ok', false, 'code', 'BAD_LINES'); end if;
    v_merged := v_merged || jsonb_build_object(v_key, v_qty);
  end loop;

  -- 2) 줄마다 상품 검증 · 단가 · 잔여
  for v_key, v_qty in select key, value::int from jsonb_each_text(v_merged) order by key loop
    v_code := split_part(v_key, '#', 1);
    v_opt  := split_part(v_key, '#', 2)::int;
    select * into p from public.myr_products where code = v_code and deleted_at is null;
    if not found then
      v_problems := v_problems || jsonb_build_object('code', v_code, 'reason', 'NOT_FOUND');
      continue;
    end if;
    select * into s from public.sellers where id = p.seller_id;
    if p.status <> 'listed' or not coalesce(s.active, false) then
      v_problems := v_problems || jsonb_build_object('code', v_code, 'reason', 'NOT_AVAILABLE');
      continue;
    end if;
    if jsonb_typeof(p.options) = 'array' and jsonb_array_length(p.options) > 0 then
      if v_opt >= jsonb_array_length(p.options) or (p.options -> v_opt ->> 'price') !~ '^\d{1,9}$' then
        v_problems := v_problems || jsonb_build_object('code', v_code, 'reason', 'BAD_OPTION');
        continue;
      end if;
      v_unit := (p.options -> v_opt ->> 'price')::int;
      v_optname := coalesce(p.options -> v_opt ->> 'n', '');
    else
      if v_opt <> 0 then
        v_problems := v_problems || jsonb_build_object('code', v_code, 'reason', 'BAD_OPTION');
        continue;
      end if;
      v_unit := p.price;
      v_optname := '';
    end if;
    -- 본인 PENDING 예약분(곧 SUPERSEDED) 은 되돌린다
    if p_user_id is not null then
      select coalesce(sum(ci.qty), 0) into v_own from public.myr_checkout_items ci join public.myr_checkouts c2 on c2.id = ci.checkout_id
       where ci.product_id = p.id and c2.user_id = p_user_id and c2.status = 'PENDING' and c2.expires_at > now();
    elsif p_prev_checkout_id is not null then
      select coalesce(sum(ci.qty), 0) into v_own from public.myr_checkout_items ci join public.myr_checkouts c2 on c2.id = ci.checkout_id
       where ci.product_id = p.id and c2.id = p_prev_checkout_id and c2.user_id is null and c2.status = 'PENDING' and c2.expires_at > now();
    else
      v_own := 0;
    end if;
    v_left := p.stock - p.sold_qty - greatest(public.myr_app_checkout_reserved(p.id) - v_own, 0);
    if v_left < v_qty then
      v_problems := v_problems || jsonb_build_object('code', v_code, 'reason', 'SOLD_OUT', 'left', greatest(v_left, 0));
      continue;
    end if;
    v_rows := v_rows || jsonb_build_object('product_id', p.id, 'seller_id', p.seller_id, 'product_name', p.name, 'option_index', v_opt,
                                           'option_name', v_optname, 'qty', v_qty, 'unit_price', v_unit);
    v_items_amt := v_items_amt + v_unit * v_qty;
    v_n := v_n + 1;
    if v_name is null then v_name := p.name; end if;
  end loop;

  if jsonb_array_length(v_problems) > 0 then return jsonb_build_object('ok', false, 'code', 'LINES_REJECTED', 'items', v_problems); end if;
  if v_items_amt < 100 then return jsonb_build_object('ok', false, 'code', 'AMOUNT_TOO_SMALL'); end if;
  v_fee := public.myr_shipping_fee(v_items_amt);
  v_order_name := left(v_name || case when v_n > 1 then ' 외 ' || (v_n - 1) || '건' else '' end, 100);

  -- 3) supersede (모든 검증 뒤 · insert 직전)
  if p_user_id is not null then
    update public.myr_checkouts set status = 'EXPIRED', fail_code = 'SUPERSEDED', fail_message = '새 결제 시도로 대체되었습니다'
     where user_id = p_user_id and status = 'PENDING';
  elsif p_prev_checkout_id is not null then
    update public.myr_checkouts set status = 'EXPIRED', fail_code = 'SUPERSEDED', fail_message = '새 결제 시도로 대체되었습니다'
     where id = p_prev_checkout_id and user_id is null and status = 'PENDING';
  end if;

  -- 4) insert
  insert into public.myr_checkouts (toss_order_id, user_id, customer_id, buyer_name, buyer_phone, buyer_email, shipping, items_amount, shipping_fee, order_name)
  values (p_toss_order_id, p_user_id, p_customer_id, left(btrim(p_buyer ->> 'name'), 50), nullif(p_buyer ->> 'phone', ''), nullif(p_buyer ->> 'email', ''),
          p_shipping, v_items_amt, v_fee, v_order_name)
  returning * into c;
  for r in select * from jsonb_array_elements(v_rows) loop
    insert into public.myr_checkout_items (checkout_id, product_id, seller_id, product_name, option_index, option_name, qty, unit_price)
    values (c.id, (r ->> 'product_id')::uuid, (r ->> 'seller_id')::uuid, r ->> 'product_name', (r ->> 'option_index')::int, r ->> 'option_name', (r ->> 'qty')::int, (r ->> 'unit_price')::int);
  end loop;
  return jsonb_build_object('ok', true, 'checkout', public.myr_checkout_brief(c));
end;
$$;
revoke all on function public.myr_app_create_checkout(uuid, uuid, jsonb, jsonb, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.myr_app_create_checkout(uuid, uuid, jsonb, jsonb, jsonb, text, uuid) to service_role;

-- ============================================================
-- myr_app_claim_checkout(toss_order_id, payment_key, stale) — confirm 선점 (0008 app_claim_checkout 그대로)
--   { ok:true, claimed:true|false, checkout } · { ok:false, code: NOT_FOUND | CONFIRMING | EXPIRED | <fail_code> | PAYMENT_KEY_CONFLICT }
-- ============================================================
create or replace function public.myr_app_claim_checkout(p_toss_order_id text, p_payment_key text, p_stale interval default interval '20 seconds')
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c public.myr_checkouts%rowtype;
begin
  select * into c from public.myr_checkouts where toss_order_id = p_toss_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if c.status = 'CONFIRMED' then return jsonb_build_object('ok', true, 'claimed', false, 'checkout', public.myr_checkout_brief(c)); end if;
  if c.status in ('FAILED','EXPIRED') then return jsonb_build_object('ok', false, 'code', coalesce(c.fail_code, c.status), 'message', c.fail_message); end if;
  if c.status = 'CONFIRMING' and not (c.updated_at < now() - p_stale and (c.payment_key is null or c.payment_key = p_payment_key)) then
    return jsonb_build_object('ok', false, 'code', 'CONFIRMING');
  end if;
  if c.status = 'PENDING' and c.expires_at <= now() then
    update public.myr_checkouts set status = 'EXPIRED', fail_code = 'EXPIRED', fail_message = '결제 시간이 만료되었습니다' where id = c.id;
    return jsonb_build_object('ok', false, 'code', 'EXPIRED', 'message', '결제 시간이 만료되었습니다');
  end if;
  begin
    update public.myr_checkouts set status = 'CONFIRMING', payment_key = p_payment_key where id = c.id returning * into c;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'PAYMENT_KEY_CONFLICT');
  end;
  return jsonb_build_object('ok', true, 'claimed', true, 'checkout', public.myr_checkout_brief(c));
end;
$$;
revoke all on function public.myr_app_claim_checkout(text, text, interval) from public, anon, authenticated;
grant execute on function public.myr_app_claim_checkout(text, text, interval) to service_role;

-- ============================================================
-- myr_app_confirm_checkout(checkout_id, payment_key, payment, recover) — 승인 확정 → 주문 1건 + 줄 N개 (한 트랜잭션)
--   토스 payment 가 DONE(즉시 결제) 또는 WAITING_FOR_DEPOSIT(가상계좌 → 주문 WAITING_DEPOSIT · 재고 예약) 인지 호출자가 확인한 뒤 부른다.
--   함수 안 방어선: orderId=toss_order_id · totalAmount=amount · paymentKey 일치(PAYMENT_MISMATCH) · 줄의 상품 행을 **id 순서로 for update**
--   → listed·미삭제(NOT_AVAILABLE) · stock − sold_qty ≥ qty(SOLD_OUT · items[{code,left}]) 전부 통과해야 insert.
--   { ok:true, already, order_id, order_code, status } · ok:false 는 돈이 잡힌 뒤이므로 호출자가 토스 전액 취소 뒤 FAILED 로.
--   p_recover(웹훅·reconcile): FAILED/EXPIRED 인데 주문이 없는 세션도 검사를 통과하면 만든다(CANCEL_PENDING 은 제외).
-- ============================================================
create or replace function public.myr_app_confirm_checkout(p_checkout_id uuid, p_payment_key text, p_payment jsonb, p_recover boolean default false)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c          public.myr_checkouts%rowtype;
  o_id       uuid;
  o_code     text;
  o_status   text;
  v_status   text;
  v_is_va    boolean;
  v_appr     timestamptz;
  v_due      timestamptz;
  v_problems jsonb := '[]'::jsonb;
  pr         record;
  v_need     integer;
  v_left     integer;
begin
  select * into c from public.myr_checkouts where id = p_checkout_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;

  if c.status = 'CONFIRMED' then
    select o.id, o.code, o.status into o_id, o_code, o_status from public.myr_orders o where o.checkout_id = c.id;
    return jsonb_build_object('ok', true, 'already', true, 'order_id', o_id, 'order_code', o_code, 'status', o_status);
  end if;
  if c.status not in ('PENDING','CONFIRMING') then
    select o.id, o.code, o.status into o_id, o_code, o_status from public.myr_orders o where o.checkout_id = c.id;
    if found then return jsonb_build_object('ok', true, 'already', true, 'order_id', o_id, 'order_code', o_code, 'status', o_status); end if;
    if not p_recover or c.fail_code = 'CANCEL_PENDING' then
      return jsonb_build_object('ok', false, 'code', coalesce(c.fail_code, c.status), 'message', c.fail_message);
    end if;
  end if;

  if p_payment is null
     or p_payment ->> 'status' not in ('DONE','WAITING_FOR_DEPOSIT')
     or p_payment ->> 'orderId' is distinct from c.toss_order_id
     or (p_payment ->> 'totalAmount')::bigint is distinct from c.amount::bigint
     or p_payment ->> 'paymentKey' is distinct from p_payment_key then
    return jsonb_build_object('ok', false, 'code', 'PAYMENT_MISMATCH');
  end if;
  v_is_va := p_payment ->> 'method' = '가상계좌' or (p_payment ? 'virtualAccount' and jsonb_typeof(p_payment -> 'virtualAccount') <> 'null');
  v_status := case when p_payment ->> 'status' = 'WAITING_FOR_DEPOSIT' then 'WAITING_DEPOSIT' else 'PAID' end;
  if v_status = 'WAITING_DEPOSIT' and not v_is_va then return jsonb_build_object('ok', false, 'code', 'PAYMENT_MISMATCH'); end if;
  v_appr := coalesce((p_payment ->> 'approvedAt')::timestamptz, (p_payment ->> 'requestedAt')::timestamptz, now());
  v_due  := case when v_status = 'WAITING_DEPOSIT' then (p_payment -> 'virtualAccount' ->> 'dueDate')::timestamptz else null end;

  -- 상품 행 잠금(id 순) → 상태·재고 재검사. 같은 상품을 담은 동시 confirm 은 여기서 직렬화된다.
  for pr in
    select p.id, p.code, p.status, p.deleted_at, p.stock, p.sold_qty, s.active as seller_active,
           (select sum(ci.qty) from public.myr_checkout_items ci where ci.checkout_id = c.id and ci.product_id = p.id) as need
      from public.myr_products p
      left join public.sellers s on s.id = p.seller_id
     where p.id in (select product_id from public.myr_checkout_items where checkout_id = c.id)
     order by p.id
       for update of p
  loop
    v_need := coalesce(pr.need, 0);
    if pr.status <> 'listed' or pr.deleted_at is not null or not coalesce(pr.seller_active, false) then
      v_problems := v_problems || jsonb_build_object('code', pr.code, 'reason', 'NOT_AVAILABLE');
    else
      v_left := pr.stock - pr.sold_qty;
      if v_left < v_need then v_problems := v_problems || jsonb_build_object('code', pr.code, 'reason', 'SOLD_OUT', 'left', greatest(v_left, 0)); end if;
    end if;
  end loop;
  if jsonb_array_length(v_problems) > 0 then
    return jsonb_build_object('ok', false,
      'code', case when exists (select 1 from jsonb_array_elements(v_problems) e where e ->> 'reason' = 'SOLD_OUT') then 'SOLD_OUT' else 'NOT_AVAILABLE' end,
      'items', v_problems);
  end if;

  insert into public.myr_orders (checkout_id, user_id, customer_id, status, buyer_name, buyer_phone, buyer_email, shipping, order_name,
                                 items_amount, shipping_fee, payment_key, payment_method, paid_at, deposit_due_at, raw_payment)
  values (c.id, c.user_id, c.customer_id, v_status, c.buyer_name, c.buyer_phone, c.buyer_email, c.shipping, c.order_name,
          c.items_amount, c.shipping_fee, p_payment_key, p_payment ->> 'method', case when v_status = 'PAID' then v_appr else null end, v_due, p_payment)
  returning id, code into o_id, o_code;

  insert into public.myr_order_items (order_id, product_id, seller_id, product_name, option_index, option_name, qty, unit_price, seller_margin_rate)
  select o_id, ci.product_id, ci.seller_id, ci.product_name, ci.option_index, ci.option_name, ci.qty, ci.unit_price, p.seller_margin_rate
    from public.myr_checkout_items ci
    join public.myr_products p on p.id = ci.product_id
   where ci.checkout_id = c.id;
  -- myr_order_items_sync_sold_qty 가 같은 트랜잭션에서 sold_qty 를 갱신한다.

  update public.myr_checkouts
     set status = 'CONFIRMED', payment_key = p_payment_key, payment_method = p_payment ->> 'method', approved_at = v_appr,
         raw_payment = p_payment, fail_code = null, fail_message = null
   where id = c.id;
  return jsonb_build_object('ok', true, 'already', false, 'order_id', o_id, 'order_code', o_code, 'status', v_status);
end;
$$;
revoke all on function public.myr_app_confirm_checkout(uuid, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.myr_app_confirm_checkout(uuid, text, jsonb, boolean) to service_role;

-- ============================================================
-- 가상계좌 — myr_app_deposit_done(order, payment) WAITING_DEPOSIT → PAID · myr_app_deposit_expire(order, payment) WAITING_DEPOSIT → CANCELED(줄도 · 재고 반환)
--   { ok:true, already } · { ok:false, code: NOT_FOUND | WRONG_STATUS | PAYMENT_MISMATCH }
-- ============================================================
create or replace function public.myr_app_deposit_done(p_order_id uuid, p_payment jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o public.myr_orders%rowtype;
begin
  select * into o from public.myr_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if o.status in ('PAID','PARTIAL_REFUNDED','REFUNDED') then return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'status', o.status); end if;
  if o.status <> 'WAITING_DEPOSIT' then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if p_payment is null or p_payment ->> 'status' is distinct from 'DONE' or p_payment ->> 'paymentKey' is distinct from o.payment_key
     or (p_payment ->> 'totalAmount')::bigint is distinct from o.amount::bigint then
    return jsonb_build_object('ok', false, 'code', 'PAYMENT_MISMATCH');
  end if;
  update public.myr_orders
     set status = 'PAID', paid_at = coalesce((p_payment ->> 'approvedAt')::timestamptz, now()), raw_payment = p_payment, payment_method = coalesce(p_payment ->> 'method', payment_method)
   where id = o.id;
  return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'status', 'PAID');
end;
$$;
revoke all on function public.myr_app_deposit_done(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_deposit_done(uuid, jsonb) to service_role;

create or replace function public.myr_app_deposit_expire(p_order_id uuid, p_payment jsonb default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o public.myr_orders%rowtype;
begin
  select * into o from public.myr_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if o.status = 'CANCELED' then return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'status', o.status); end if;
  if o.status <> 'WAITING_DEPOSIT' then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  update public.myr_order_items set status = 'CANCELED' where order_id = o.id;
  update public.myr_orders set status = 'CANCELED', raw_cancel = p_payment, refund_actor = 'system', refund_reason = '가상계좌 입금 기한 만료', refunded_at = now() where id = o.id;
  return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'status', 'CANCELED');
end;
$$;
revoke all on function public.myr_app_deposit_expire(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_deposit_expire(uuid, jsonb) to service_role;

-- reconcile 입력: 입금 기한이 지난 WAITING_DEPOSIT 주문 (토스 재조회로 종결)
create or replace function public.myr_app_deposit_due(p_limit integer default 100)
returns setof jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object('id', o.id, 'code', o.code, 'payment_key', o.payment_key, 'checkout_id', o.checkout_id, 'deposit_due_at', o.deposit_due_at)
    from public.myr_orders o
   where o.status = 'WAITING_DEPOSIT' and o.deposit_due_at is not null and o.deposit_due_at < now()
   order by o.deposit_due_at
   limit p_limit
$$;
revoke all on function public.myr_app_deposit_due(integer) from public, anon, authenticated;
grant execute on function public.myr_app_deposit_due(integer) to service_role;

-- ============================================================
-- 만료 · 고착 · PII 파기 (0008 expire_checkout_sessions / stale_checkout_sessions / purge_checkout_pii 의 MYR 판)
-- ============================================================
create or replace function public.myr_expire_checkouts(p_grace interval default interval '1 hour')
returns integer
language plpgsql
volatile
security definer set search_path = public
as $$
declare n integer;
begin
  update public.myr_checkouts set status = 'EXPIRED', fail_code = coalesce(fail_code, 'EXPIRED')
   where (status = 'PENDING' or (status = 'CONFIRMING' and payment_key is null)) and expires_at < now() - p_grace;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.myr_expire_checkouts(interval) from public, anon, authenticated;
grant execute on function public.myr_expire_checkouts(interval) to service_role;

create or replace function public.myr_stale_checkouts(p_age interval default interval '2 minutes', p_limit integer default 100)
returns setof jsonb
language sql
stable
security definer set search_path = public
as $$
  select public.myr_checkout_brief(c)
    from public.myr_checkouts c
   where (c.status = 'CONFIRMING' and c.payment_key is not null and c.updated_at < now() - p_age)
      or (c.status = 'FAILED' and c.fail_code = 'CANCEL_PENDING' and c.payment_key is not null)
   order by c.updated_at
   limit p_limit
$$;
revoke all on function public.myr_stale_checkouts(interval, integer) from public, anon, authenticated;
grant execute on function public.myr_stale_checkouts(interval, integer) to service_role;

create or replace function public.myr_purge_checkout_pii(p_older_than interval default interval '30 days')
returns integer
language plpgsql
volatile
security definer set search_path = public
as $$
declare n integer;
begin
  update public.myr_checkouts
     set buyer_name = '(삭제)', buyer_phone = null, buyer_email = null, shipping = '{}'::jsonb, raw_payment = null
   where status in ('FAILED','EXPIRED') and updated_at < now() - p_older_than and buyer_name <> '(삭제)';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.myr_purge_checkout_pii(interval) from public, anon, authenticated;
grant execute on function public.myr_purge_checkout_pii(interval) to service_role;

-- 0021 purge_checkout_pii 재정의 — "주문 없는 비회원 customers 행" 판정에 myr_orders 도 본다 (두 샵이 customers 를 공유 · 시그니처 동일)
create or replace function public.purge_checkout_pii(p_older_than interval default interval '30 days')
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n1 integer;
  n2 integer;
begin
  update public.checkout_sessions
     set buyer_name = '(삭제)', buyer_phone = null, buyer_email = null, shipping = '{}'::jsonb, raw_payment = null
   where status in ('FAILED','EXPIRED') and updated_at < now() - p_older_than and buyer_name <> '(삭제)';
  get diagnostics n1 = row_count;
  delete from public.customers cu
   where cu.guest and cu.user_id is null and cu.created_at < now() - p_older_than
     and not exists (select 1 from public.orders o where o.customer_id = cu.id)
     and not exists (select 1 from public.myr_orders mo where mo.customer_id = cu.id);
  get diagnostics n2 = row_count;
  return n1 + n2;
end;
$$;
revoke all on function public.purge_checkout_pii(interval) from public, anon, authenticated;

-- ============================================================
-- 비회원 조회 토큰 — 0021 app_guest_token_issue / app_guest_order_verify / app_guest_order_lookup 의 myr_orders 판 (guest_token_rotate 재사용)
-- ============================================================
create or replace function public.myr_app_guest_token_issue(p_order_code text)
returns text
language plpgsql
volatile
security definer set search_path = public
as $$
declare v_cid uuid;
begin
  select cu.id into v_cid from public.myr_orders o join public.customers cu on cu.id = o.customer_id
   where lower(o.code) = lower(btrim(coalesce(p_order_code, ''))) and cu.guest limit 1;
  if v_cid is null then return null; end if;
  return public.guest_token_rotate(v_cid);
end;
$$;
revoke all on function public.myr_app_guest_token_issue(text) from public, anon, authenticated;
grant execute on function public.myr_app_guest_token_issue(text) to service_role;

create or replace function public.myr_app_guest_order_verify(p_order_code text, p_token text)
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select o.id from public.myr_orders o join public.customers cu on cu.id = o.customer_id
   where lower(o.code) = lower(btrim(coalesce(p_order_code, ''))) and cu.guest and cu.lookup_token_hash is not null
     and p_token ~ '^[0-9a-f]{64}$' and cu.lookup_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
   limit 1
$$;
revoke all on function public.myr_app_guest_order_verify(text, text) from public, anon, authenticated;
grant execute on function public.myr_app_guest_order_verify(text, text) to service_role;

create or replace function public.myr_app_guest_order_lookup(p_order_code text, p_phone text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_oid uuid; v_ocode text; v_cid uuid; v_token text;
begin
  if p_order_code is null or p_phone is null or p_phone !~ '^[0-9]{8,15}$' then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select o.id, o.code, cu.id into v_oid, v_ocode, v_cid
    from public.myr_orders o join public.customers cu on cu.id = o.customer_id
   where lower(o.code) = lower(btrim(p_order_code)) and cu.guest
     and (cu.phone_norm = p_phone or regexp_replace(coalesce(o.buyer_phone, ''), '[^0-9]', '', 'g') = p_phone
          or regexp_replace(coalesce(o.shipping ->> 'phone', ''), '[^0-9]', '', 'g') = p_phone)
   limit 1;
  if v_oid is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  v_token := public.guest_token_rotate(v_cid);
  return jsonb_build_object('ok', true, 'order_id', v_oid, 'order_code', v_ocode, 'customer_id', v_cid, 'token', v_token);
end;
$$;
revoke all on function public.myr_app_guest_order_lookup(text, text) from public, anon, authenticated;
grant execute on function public.myr_app_guest_order_lookup(text, text) to service_role;

comment on table public.myr_checkouts is 'MYR 결제 세션(승인 전) — 결제 1건 · 줄 N개 (docs/myr.md §6.2 · 0058)';
comment on table public.myr_orders is 'MYR 주문 — 결제 1건 = 주문 1건 · 운송장 주문 단위 · WAITING_DEPOSIT(가상계좌) 포함 (docs/myr.md §3 · §6.7 · 0058)';
comment on table public.myr_order_items is 'MYR 주문 줄 — 셀러별 정산·환불·CS 단위 · seller_margin_rate 스냅샷 (0058)';
