-- ============================================================
-- 0078 — MYR 교환·환불 요청(승인형 CS · docs/myr.md §4.2.1 7번 · §6.4 · 결정 7 · 2026-11-06)
--
--   발주(배송준비중) 전 줄은 고객 셀프 즉시 환불(0061 · 0077) 그대로. **배송준비중 이후 줄**은 고객이 "요청" 을 남기고,
--   크리에이터가 처리 방법을 골라 승인하거나 반려한다. 승인 뒤 회수 · 재발송은 운영(이벗 회수 API(E4) 전까지 `myr-ops.mjs`), 환불은 서버(refundItems).
--
--   비용 정책(2026-11-06 대표 승인 · 콘솔 시안 POLICY_BY_REASON):
--     단순 변심  — 수령 7일 · 미개봉 · **환불만**(교환 없음) · 왕복 배송비(platform_settings 'myr_claim_return_fee' · 기본 6,000) 고객 부담 = 환불액에서 뺀다 · 회수 뒤 환불
--                 한 번에 보낸 요청(batch — 한 박스로 돌려보낸다)은 배송비를 한 번만 뺀다(myr_refund_request_fee_due)
--     파손 · 누액 — 사진 필수 · 회수 없이 전액 환불 또는 재발송 · MYR 부담
--     오배송     — 사진 필수 · MYR 부담 · 회수 뒤 환불 또는 재발송 + 회수
--
--   myr_refund_requests     요청 1건 = 주문 줄 1개 · 수량 · 종류(refund|exchange) · 사유 · 고객 상세 · 사진(myr-refunds 경로)
--                           상태 pending(처리 대기) → progress(진행 중) → done(완료) | rejected(반려). 줄마다 진행 중인 요청은 하나.
--                           승인하면 처리 방법(resolution)이 할 일을 정한다: needs_collect(회수) · needs_reship(재발송) · needs_refund(환불, deduction 차감)
--                           세 가지가 다 끝나면 done(myr_refund_request_finish 하나가 판정).
--   myr_refund_request_options(kind, reason)   처리 방법 선택지 — **판정은 여기 하나**(콘솔은 JSON 의 options 로 그린다 · 승인 RPC 가 같은 함수로 검사)
--   myr_refund_request_step(r)                 지금 단계 decide | collect | refund | reship | null — 화면 · 운영 목록 · 크론이 같은 값을 본다
--
--   고객(샵):  myr_app_claim_open(order, actor, kind, reason, lines)  · myr_app_claims_for_order(order) · myr_app_claims_of_user(user, limit)(마이 목록)
--             myr_order_claim_status(order) — 주문의 열린 요청 상태 pending | progress | null · myr_order_json + claim_status(주문 상태 칩 · 0077 정의 재정의)
--   크리에이터: myr_app_seller_claims_of_user(user) · myr_app_seller_claim_of_user(user, code) · myr_app_seller_claims_waiting_of_user(user)
--             myr_app_claim_decide(code, user, decision, resolution, message)
--   서버:     myr_app_claim_refunded(code, amount)   refundItems 성공 뒤 기록
--             myr_app_claims_refund_due(age, limit)  환불할 차례인데 아직 안 된 요청 — 샵 크론이 환불(콘솔 승인 뒤 · 회수 확인 직후 실패 · 결제 키는 샵에만)
--   운영:     myr_app_admin_claims(open_only) · myr_app_admin_claim_collected(code) · myr_app_admin_claim_reship(code, courier, tracking)
--   0068 myr_refund_photo_orphans — 요청에 실린 사진은 고아가 아니다(재정의)
--
--   권한: 새 RPC 는 service role 만(anon · authenticated EXECUTE 회수). 고객 · 크리에이터 id 는 앱 서버가 세션에서 정해 넘긴다(결정 3).
--   테스트: supabase/tests/myr_refund_requests.test.sql. 재실행 가능.
-- ============================================================

insert into public.platform_settings (key, value, description)
values ('myr_claim_return_fee', '6000'::jsonb, 'MYR 단순 변심 교환·환불의 왕복 배송비(원) — 고객 부담 · 환불액에서 뺀다 (docs/myr.md §9-15 · 0078)')
on conflict (key) do nothing;

create or replace function public.myr_claim_return_fee()
returns integer
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select (ps.value #>> '{}')::int from public.platform_settings ps where ps.key = 'myr_claim_return_fee'), 6000)
$$;
revoke all on function public.myr_claim_return_fee() from public, anon, authenticated;
grant execute on function public.myr_claim_return_fee() to service_role;

create sequence if not exists public.myr_refund_request_code_seq start 2001;

create table if not exists public.myr_refund_requests (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique default ('rq' || nextval('public.myr_refund_request_code_seq')),
  order_id           uuid not null references public.myr_orders (id) on delete cascade,
  order_item_id      uuid not null references public.myr_order_items (id) on delete cascade,
  seller_id          uuid not null references public.sellers (id) on delete restrict,
  product_id         uuid not null references public.myr_products (id) on delete restrict,
  batch              uuid not null default gen_random_uuid(),   -- 한 번에 보낸 요청 묶음(왕복 배송비는 묶음에 한 번)
  kind               text not null check (kind in ('refund','exchange')),
  qty                integer not null check (qty between 1 and 9),
  reason             text not null check (reason in ('단순 변심','파손 · 누액','오배송')),
  note               text,
  photos             text[] not null default '{}',
  status             text not null default 'pending' check (status in ('pending','progress','done','rejected')),
  resolution         text check (resolution in ('refund','partial','reship','reship_collect')),
  message            text,                       -- 크리에이터가 고객에게 남긴 말(승인 · 반려)
  decided_at         timestamptz,
  decided_by         uuid references auth.users (id) on delete set null,
  needs_collect      boolean not null default false,
  collected_at       timestamptz,
  needs_reship       boolean not null default false,
  reship_courier     text,
  reship_tracking_no text,
  reshipped_at       timestamptz,
  needs_refund       boolean not null default false,
  deduction          integer not null default 0 check (deduction >= 0),
  refund_amount      integer,
  refunded_at        timestamptz,
  done_at            timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint myr_refund_requests_decided check (status = 'pending' or decided_at is not null),
  constraint myr_refund_requests_resolution check ((status in ('progress','done')) = (resolution is not null))
);
comment on table public.myr_refund_requests is 'MYR 교환·환불 요청 — 배송준비중 이후 줄 · 크리에이터 승인/반려 · 회수 · 재발송 · 환불 (0078)';
create unique index if not exists myr_refund_requests_open_line on public.myr_refund_requests (order_item_id) where status in ('pending','progress');
create index if not exists myr_refund_requests_seller_idx on public.myr_refund_requests (seller_id, status, created_at desc);
create index if not exists myr_refund_requests_order_idx on public.myr_refund_requests (order_id);
create index if not exists myr_refund_requests_batch_idx on public.myr_refund_requests (batch);
create index if not exists myr_refund_requests_open_idx on public.myr_refund_requests (status, created_at) where status in ('pending','progress');

drop trigger if exists myr_refund_requests_updated_at on public.myr_refund_requests;
create trigger myr_refund_requests_updated_at before update on public.myr_refund_requests
  for each row execute function public.set_updated_at();

alter table public.myr_refund_requests enable row level security;
revoke all on public.myr_refund_requests from anon, authenticated;
grant all on public.myr_refund_requests to service_role;
grant usage, select on sequence public.myr_refund_request_code_seq to service_role;

-- ------------------------------------------------------------
-- 규칙 — 처리 방법 선택지 · 지금 단계 · 끝났나
-- ------------------------------------------------------------
-- 첫 값이 요청 종류 그대로의 처리(콘솔 기본 선택). 단순 변심은 환불만(교환 요청은 받지 않는다 — open 이 막는다)
create or replace function public.myr_refund_request_options(p_kind text, p_reason text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case p_reason
    when '단순 변심' then array['partial','refund']
    when '파손 · 누액' then case when p_kind = 'exchange' then array['reship','refund'] else array['refund','reship'] end
    when '오배송' then case when p_kind = 'exchange' then array['reship_collect','refund'] else array['refund','reship_collect'] end
    else array[]::text[] end
$$;
revoke all on function public.myr_refund_request_options(text, text) from public, anon, authenticated;

-- 지금 단계 — 처리 대기면 decide, 진행 중이면 회수 → 환불 → 재발송 중 남은 첫 일, 끝났거나 반려면 null
create or replace function public.myr_refund_request_step(r public.myr_refund_requests)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when r.status = 'pending' then 'decide'
    when r.status <> 'progress' then null
    when r.needs_collect and r.collected_at is null then 'collect'
    when r.needs_refund and r.refunded_at is null then 'refund'
    when r.needs_reship and r.reshipped_at is null then 'reship'
    else null end
$$;
revoke all on function public.myr_refund_request_step(public.myr_refund_requests) from public, anon, authenticated;

-- 진행 중인 요청의 할 일이 다 끝났으면 done — 상태를 바꾸는 RPC 가 마지막에 부른다
create or replace function public.myr_refund_request_finish(p_id uuid)
returns text
language plpgsql
volatile
security definer set search_path = public
as $$
declare r public.myr_refund_requests%rowtype;
begin
  select * into r from public.myr_refund_requests where id = p_id for update;
  if r.status = 'progress' and public.myr_refund_request_step(r) is null then
    update public.myr_refund_requests set status = 'done', done_at = now() where id = p_id;
    return 'done';
  end if;
  return r.status;
end;
$$;
revoke all on function public.myr_refund_request_finish(uuid) from public, anon, authenticated;

-- 이 요청이 부분 환불로 승인되면 뺄 왕복 배송비 — 같은 묶음(batch)에서 이미 뺀 요청이 있으면 0(한 박스로 돌려보낸다)
create or replace function public.myr_refund_request_fee_due(r public.myr_refund_requests)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select case when r.deduction > 0 then r.deduction
              when exists (select 1 from public.myr_refund_requests q where q.batch = r.batch and q.id <> r.id and q.deduction > 0) then 0
              else public.myr_claim_return_fee() end
$$;
revoke all on function public.myr_refund_request_fee_due(public.myr_refund_requests) from public, anon, authenticated;

-- ------------------------------------------------------------
-- JSON — 고객 · 크리에이터 · 운영이 같은 모양. 연락처는 가린다(010-****-1234) · 배송지는 싣지 않는다
-- ------------------------------------------------------------
create or replace function public.myr_refund_request_json(r public.myr_refund_requests)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', r.id, 'code', r.code, 'status', r.status, 'step', public.myr_refund_request_step(r),
    'kind', r.kind, 'reason', r.reason, 'qty', r.qty, 'note', r.note, 'photos', to_jsonb(r.photos),
    'options', to_jsonb(public.myr_refund_request_options(r.kind, r.reason)),
    'resolution', r.resolution, 'message', r.message, 'decided_at', r.decided_at,
    'needs_collect', r.needs_collect, 'collected_at', r.collected_at,
    'needs_reship', r.needs_reship, 'reship_courier', r.reship_courier, 'reship_tracking_no', r.reship_tracking_no, 'reshipped_at', r.reshipped_at,
    'needs_refund', r.needs_refund, 'deduction', r.deduction, 'return_fee', public.myr_refund_request_fee_due(r),
    'refund_amount', r.refund_amount, 'refunded_at', r.refunded_at, 'done_at', r.done_at, 'created_at', r.created_at,
    'amount', i.unit_price * r.qty,
    'buyer_name', o.buyer_name,
    'buyer_phone', case when length(regexp_replace(coalesce(o.buyer_phone, o.shipping ->> 'phone', ''), '\D', '', 'g')) >= 10
                        then left(regexp_replace(coalesce(o.buyer_phone, o.shipping ->> 'phone'), '\D', '', 'g'), 3) || '-****-' || right(regexp_replace(coalesce(o.buyer_phone, o.shipping ->> 'phone'), '\D', '', 'g'), 4)
                        else null end,
    'order', jsonb_build_object('id', o.id, 'code', o.code, 'paid_at', o.paid_at, 'is_member', o.user_id is not null,
                                'item', jsonb_build_object('id', i.id, 'name', i.product_name, 'option', i.option_name, 'qty', i.qty, 'unit_price', i.unit_price,
                                                           'refunded_qty', i.refunded_qty, 'status', i.status, 'ship_status', i.ship_status,
                                                           'shipped_at', i.shipped_at, 'delivered_at', i.delivered_at)),
    'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'tile', p.tile, 'icon', p.icon, 'thumb_url', p.thumb_url) from public.myr_products p where p.id = r.product_id),
    'seller', (select jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle) from public.sellers s where s.id = r.seller_id))
    from public.myr_orders o
    join public.myr_order_items i on i.id = r.order_item_id
   where o.id = r.order_id
$$;
revoke all on function public.myr_refund_request_json(public.myr_refund_requests) from public, anon, authenticated;
grant execute on function public.myr_refund_request_json(public.myr_refund_requests) to service_role;

-- ------------------------------------------------------------
-- 고객 — 요청 남기기(줄마다 1건) · 주문의 요청 목록
-- ------------------------------------------------------------
-- p_actor_id = 회원 user id 또는 비회원 customer id(0061 precheck 와 같은 소유 규칙) · p_lines = [{ item_id, qty, note?, photos?: [path…] }]
-- 거부: BAD_KIND · BAD_REASON · EXCHANGE_NOT_ALLOWED(단순 변심 교환) · NOT_FOUND(없거나 남의 주문) · WRONG_STATUS · NOTHING · BAD_ITEMS(items[{ item_id, reason }])
--   줄 reason: NOT_IN_ORDER · CANCELED · BAD_QTY · TOO_MANY · NOT_PREPARED(결제완료 줄 = 셀프 환불로) · OPEN_EXISTS · PHOTO_REQUIRED · BAD_PHOTOS
create or replace function public.myr_app_claim_open(p_order_id uuid, p_actor_id uuid, p_kind text, p_reason text, p_lines jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  o          public.myr_orders%rowtype;
  i          public.myr_order_items%rowtype;
  l          jsonb;
  v_id       uuid;
  v_qty      integer;
  v_note     text;
  v_photos   text[];
  v_problems jsonb := '[]'::jsonb;
  v_seen     uuid[] := '{}';
  v_out      jsonb := '[]'::jsonb;
  v_code     text;
  v_batch    uuid := gen_random_uuid();
begin
  if p_kind is null or p_kind not in ('refund','exchange') then return jsonb_build_object('ok', false, 'code', 'BAD_KIND'); end if;
  if p_reason is null or p_reason not in ('단순 변심','파손 · 누액','오배송') then return jsonb_build_object('ok', false, 'code', 'BAD_REASON'); end if;
  if p_reason = '단순 변심' and p_kind = 'exchange' then return jsonb_build_object('ok', false, 'code', 'EXCHANGE_NOT_ALLOWED'); end if;
  select * into o from public.myr_orders where id = p_order_id for update;
  if not found or p_actor_id is null or not (o.user_id = p_actor_id or (o.user_id is null and o.customer_id = p_actor_id)) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if o.status not in ('PAID','PARTIAL_REFUNDED') then return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', o.status); end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then return jsonb_build_object('ok', false, 'code', 'NOTHING'); end if;
  if jsonb_array_length(p_lines) > 20 then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS'); end if;

  -- 1) 검사(하나라도 걸리면 아무것도 만들지 않는다)
  for l in select * from jsonb_array_elements(p_lines) loop
    if (l ->> 'item_id') !~ '^[0-9a-f-]{36}$' or (l ->> 'qty') !~ '^\d{1,2}$' then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS'); end if;
    v_id := (l ->> 'item_id')::uuid;
    v_qty := (l ->> 'qty')::int;
    v_photos := coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(l -> 'photos') = 'array' then l -> 'photos' else '[]'::jsonb end) x where x <> ''), '{}');
    select * into i from public.myr_order_items where id = v_id and order_id = o.id;
    if not found or v_id = any (v_seen) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'NOT_IN_ORDER');
    elsif i.status = 'CANCELED' then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'CANCELED');
    elsif v_qty < 1 then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'BAD_QTY');
    elsif v_qty > i.qty - i.refunded_qty then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'TOO_MANY');
    elsif i.ship_status = 'PAID' then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'NOT_PREPARED');
    elsif exists (select 1 from public.myr_refund_requests q where q.order_item_id = v_id and q.status in ('pending','progress')) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'OPEN_EXISTS');
    elsif cardinality(v_photos) > 3 or exists (select 1 from unnest(v_photos) p where p !~ ('^' || o.id::text || '/' || v_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')) then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'BAD_PHOTOS');
    elsif p_reason in ('파손 · 누액','오배송') and cardinality(v_photos) = 0 then
      v_problems := v_problems || jsonb_build_object('item_id', v_id, 'reason', 'PHOTO_REQUIRED');
    end if;
    v_seen := v_seen || v_id;
  end loop;
  if jsonb_array_length(v_problems) > 0 then return jsonb_build_object('ok', false, 'code', 'BAD_ITEMS', 'items', v_problems); end if;

  -- 2) 만들기
  for l in select * from jsonb_array_elements(p_lines) loop
    v_id := (l ->> 'item_id')::uuid;
    v_note := nullif(btrim(left(l ->> 'note', 300)), '');
    v_photos := coalesce((select array_agg(x) from jsonb_array_elements_text(case when jsonb_typeof(l -> 'photos') = 'array' then l -> 'photos' else '[]'::jsonb end) x where x <> ''), '{}');
    insert into public.myr_refund_requests (batch, order_id, order_item_id, seller_id, product_id, kind, qty, reason, note, photos)
    select v_batch, o.id, i2.id, i2.seller_id, i2.product_id, p_kind, (l ->> 'qty')::int, p_reason, v_note, v_photos
      from public.myr_order_items i2 where i2.id = v_id
    returning code into v_code;
    v_out := v_out || jsonb_build_object('code', v_code, 'item_id', v_id);
  end loop;
  return jsonb_build_object('ok', true, 'order_code', o.code, 'requests', v_out);
end;
$$;
revoke all on function public.myr_app_claim_open(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.myr_app_claim_open(uuid, uuid, text, text, jsonb) to service_role;

-- 주문의 요청(최근순) — 샵 주문 상세 · 환불 신청 페이지. 소유 확인은 라우트(주문을 연 세션 · 조회 토큰)
create or replace function public.myr_app_claims_for_order(p_order_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select jsonb_agg(public.myr_refund_request_json(r) order by r.created_at desc) from public.myr_refund_requests r where r.order_id = p_order_id), '[]'::jsonb)
$$;
revoke all on function public.myr_app_claims_for_order(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_claims_for_order(uuid) to service_role;

-- 회원의 요청(최근순) — 마이 "교환 · 환불 요청". 상세는 주문 상세 카드(myr_app_claims_for_order)로 간다
create or replace function public.myr_app_claims_of_user(p_user uuid, p_limit integer default 50)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select jsonb_agg(public.myr_refund_request_json(r) order by r.created_at desc)
      from (select r.* from public.myr_refund_requests r join public.myr_orders o on o.id = r.order_id
             where o.user_id = p_user and p_user is not null
             order by r.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) r
  ), '[]'::jsonb)
$$;
revoke all on function public.myr_app_claims_of_user(uuid, integer) from public, anon, authenticated;
grant execute on function public.myr_app_claims_of_user(uuid, integer) to service_role;

-- 주문의 열린 요청 상태 — 처리 대기가 하나라도 있으면 pending, 아니면 진행 중이 있으면 progress, 없으면 null.
-- 고객 주문 상태 칩(statusLabel)이 배송 상태보다 먼저 본다 — 판정은 이 함수 하나
create or replace function public.myr_order_claim_status(p_order_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select case when bool_or(r.status = 'pending') then 'pending' when bool_or(r.status = 'progress') then 'progress' end
    from public.myr_refund_requests r
   where r.order_id = p_order_id and r.status in ('pending', 'progress')
$$;
revoke all on function public.myr_order_claim_status(uuid) from public, anon, authenticated;

-- 0077 정의 + claim_status
create or replace function public.myr_order_json(o public.myr_orders, p_full boolean)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id, 'code', o.code, 'status', o.status,
    'amount', o.amount, 'items_amount', o.items_amount, 'shipping_fee', o.shipping_fee, 'refund_amount', o.refund_amount,
    'order_name', o.order_name, 'payment_method', o.payment_method, 'paid_at', o.paid_at, 'created_at', o.created_at,
    'deposit_due_at', o.deposit_due_at,
    'deposit', case when o.status = 'WAITING_DEPOSIT' and jsonb_typeof(o.raw_payment -> 'virtualAccount') = 'object'
                 then jsonb_build_object('bank', o.raw_payment -> 'virtualAccount' ->> 'bankCode', 'account', o.raw_payment -> 'virtualAccount' ->> 'accountNumber',
                                         'holder', o.raw_payment -> 'virtualAccount' ->> 'customerName', 'due', o.raw_payment -> 'virtualAccount' ->> 'dueDate')
                 else null end,
    'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at, 'delivered_at', o.delivered_at,
    'ship_status', public.myr_order_ship_status(o.id),
    'claim_status', public.myr_order_claim_status(o.id),
    'guest', o.user_id is null, 'buyer_name', o.buyer_name,
    'shipping', case when p_full then o.shipping else null end,
    'buyer_email', case when p_full then o.buyer_email else null end,
    'refund_reason', case when p_full and o.refund_amount > 0 then o.refund_reason else null end,
    'refunded_at', case when p_full and o.refund_amount > 0 then o.refunded_at else null end,
    'items', coalesce((select jsonb_agg(public.myr_order_item_json(i) order by i.created_at, i.id) from public.myr_order_items i where i.order_id = o.id), '[]'::jsonb))
$$;
revoke all on function public.myr_order_json(public.myr_orders, boolean) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 크리에이터 — 계정으로 바로(0072 · 0075 와 같은 방식 · 게이트와 동시에 보낸다)
-- ------------------------------------------------------------
create or replace function public.myr_app_seller_claims_of_user(p_user uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select jsonb_agg(public.myr_refund_request_json(r) order by (r.status = 'pending') desc, (r.status = 'progress') desc, r.created_at desc)
      from (select r.* from public.myr_refund_requests r join public.sellers s on s.id = r.seller_id
             where s.user_id = p_user order by (r.status = 'pending') desc, (r.status = 'progress') desc, r.created_at desc limit 200) r
  ), '[]'::jsonb)
$$;
revoke all on function public.myr_app_seller_claims_of_user(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_claims_of_user(uuid) to service_role;

create or replace function public.myr_app_seller_claim_of_user(p_user uuid, p_code text)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select public.myr_refund_request_json(r)
    from public.myr_refund_requests r join public.sellers s on s.id = r.seller_id
   where s.user_id = p_user and r.code = lower(btrim(p_code))
$$;
revoke all on function public.myr_app_seller_claim_of_user(uuid, text) from public, anon, authenticated;
grant execute on function public.myr_app_seller_claim_of_user(uuid, text) to service_role;

create or replace function public.myr_app_seller_claims_waiting_of_user(p_user uuid)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select count(*)::int from public.myr_refund_requests r join public.sellers s on s.id = r.seller_id
   where s.user_id = p_user and r.status = 'pending'
$$;
revoke all on function public.myr_app_seller_claims_waiting_of_user(uuid) from public, anon, authenticated;
grant execute on function public.myr_app_seller_claims_waiting_of_user(uuid) to service_role;

-- 승인 · 반려 — 내 상품 요청만(남의 요청은 NOT_FOUND) · 처리 대기만 · 처리 방법은 myr_refund_request_options 안에서 · 메시지 필수(1~1000자)
-- 거부: NOT_FOUND · NOT_PENDING · BAD_DECISION · BAD_RESOLUTION · BAD_MESSAGE
-- 반환 { ok, request, refund_now } — refund_now = 회수 없이 바로 환불할 차례(콘솔 서버가 refundItems → myr_app_claim_refunded)
create or replace function public.myr_app_claim_decide(p_code text, p_user uuid, p_decision text, p_resolution text, p_message text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  r      public.myr_refund_requests%rowtype;
  i      public.myr_order_items%rowtype;
  v_msg  text := btrim(coalesce(p_message, ''));
  v_fee  integer;
begin
  select r2.* into r from public.myr_refund_requests r2 join public.sellers s on s.id = r2.seller_id
   where s.user_id = p_user and r2.code = lower(btrim(coalesce(p_code, ''))) for update of r2;
  if not found or p_user is null then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if r.status <> 'pending' then return jsonb_build_object('ok', false, 'code', 'NOT_PENDING', 'status', r.status); end if;
  -- 같은 묶음의 다른 요청을 동시에 승인해도 배송비가 두 번 빠지지 않게 묶음을 잠근다
  perform 1 from public.myr_refund_requests q where q.batch = r.batch for update;
  if p_decision is null or p_decision not in ('approve','reject') then return jsonb_build_object('ok', false, 'code', 'BAD_DECISION'); end if;
  if length(v_msg) < 1 or length(v_msg) > 1000 then return jsonb_build_object('ok', false, 'code', 'BAD_MESSAGE'); end if;

  if p_decision = 'reject' then
    update public.myr_refund_requests set status = 'rejected', message = v_msg, decided_at = now(), decided_by = p_user, done_at = now() where id = r.id
      returning * into r;
    return jsonb_build_object('ok', true, 'request', public.myr_refund_request_json(r), 'refund_now', false);
  end if;

  if p_resolution is null or not (p_resolution = any (public.myr_refund_request_options(r.kind, r.reason))) then
    return jsonb_build_object('ok', false, 'code', 'BAD_RESOLUTION');
  end if;
  select * into i from public.myr_order_items where id = r.order_item_id;
  v_fee := public.myr_refund_request_fee_due(r);
  -- 차감 뒤 0원 이하가 되면 부분 환불은 안 된다(같은 묶음에서 이미 뺐으면 v_fee = 0 → 전액과 같다)
  if p_resolution = 'partial' and i.unit_price * r.qty <= v_fee then return jsonb_build_object('ok', false, 'code', 'BAD_RESOLUTION'); end if;

  update public.myr_refund_requests
     set status = 'progress', resolution = p_resolution, message = v_msg, decided_at = now(), decided_by = p_user,
         needs_refund  = p_resolution in ('refund','partial'),
         needs_reship  = p_resolution in ('reship','reship_collect'),
         -- 파손 · 누액은 회수 없이(사진으로 확인) · 단순 변심 · 오배송 환불과 회수 후 재발송은 회수
         needs_collect = case when p_resolution = 'reship_collect' or p_resolution = 'partial' then true
                              when p_resolution = 'refund' then r.reason <> '파손 · 누액'
                              else false end,
         deduction     = case when p_resolution = 'partial' then v_fee else 0 end
   where id = r.id
   returning * into r;
  return jsonb_build_object('ok', true, 'request', public.myr_refund_request_json(r), 'refund_now', public.myr_refund_request_step(r) = 'refund');
end;
$$;
revoke all on function public.myr_app_claim_decide(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_claim_decide(text, uuid, text, text, text) to service_role;

-- ------------------------------------------------------------
-- 서버 — 환불 기록(refundItems 가 토스 취소 · 줄 기록을 마친 뒤) · 환불할 차례인데 남은 요청
-- ------------------------------------------------------------
-- 거부: NOT_FOUND · NOT_READY(환불할 차례가 아님 — 처리 대기 · 반려 · 회수 전 · 환불 없는 처리) · 이미 기록했으면 already
create or replace function public.myr_app_claim_refunded(p_code text, p_amount integer)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare r public.myr_refund_requests%rowtype; v_status text;
begin
  select * into r from public.myr_refund_requests where code = lower(btrim(coalesce(p_code, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if r.refunded_at is not null then return jsonb_build_object('ok', true, 'already', true, 'status', r.status); end if;
  if public.myr_refund_request_step(r) is distinct from 'refund' then return jsonb_build_object('ok', false, 'code', 'NOT_READY', 'status', r.status); end if;
  update public.myr_refund_requests set refunded_at = now(), refund_amount = greatest(coalesce(p_amount, 0), 0) where id = r.id;
  v_status := public.myr_refund_request_finish(r.id);
  return jsonb_build_object('ok', true, 'already', false, 'status', v_status);
end;
$$;
revoke all on function public.myr_app_claim_refunded(text, integer) from public, anon, authenticated;
grant execute on function public.myr_app_claim_refunded(text, integer) to service_role;

-- 환불할 차례인데 p_age 넘게 남은 요청(승인 · 회수 확인 직후 환불이 실패했을 때) — 샵 크론이 다시 시도한다. 오래된 순
create or replace function public.myr_app_claims_refund_due(p_age interval default interval '5 minutes', p_limit integer default 20)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object('code', r.code, 'order_id', r.order_id, 'item_id', r.order_item_id, 'seller_id', r.seller_id, 'qty', r.qty,
                                        'reason', r.reason, 'note', r.note, 'photos', to_jsonb(r.photos), 'deduction', r.deduction) order by r.updated_at)
      from (select * from public.myr_refund_requests r
             where r.status = 'progress' and public.myr_refund_request_step(r) = 'refund' and r.updated_at < now() - p_age
             order by r.updated_at limit greatest(coalesce(p_limit, 20), 1)) r
  ), '[]'::jsonb)
$$;
revoke all on function public.myr_app_claims_refund_due(interval, integer) from public, anon, authenticated;
grant execute on function public.myr_app_claims_refund_due(interval, integer) to service_role;

-- ------------------------------------------------------------
-- 운영(콘솔 전까지 myr-ops.mjs → 샵 /api/ops/claims) — 목록 · 회수 확인 · 재발송 송장
-- ------------------------------------------------------------
create or replace function public.myr_app_admin_claims(p_open_only boolean default true)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce((
    select jsonb_agg(public.myr_refund_request_json(r) order by r.created_at)
      from (select * from public.myr_refund_requests r
             where (not coalesce(p_open_only, true)) or r.status in ('pending','progress')
             order by r.created_at desc limit 500) r
  ), '[]'::jsonb)
$$;
revoke all on function public.myr_app_admin_claims(boolean) from public, anon, authenticated;
grant execute on function public.myr_app_admin_claims(boolean) to service_role;

-- 회수 확인 — 회수가 필요한 진행 중 요청만. 반환 { ok, already, refund_now, request } · 거부 NOT_FOUND · NOT_READY
create or replace function public.myr_app_admin_claim_collected(p_code text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare r public.myr_refund_requests%rowtype;
begin
  select * into r from public.myr_refund_requests where code = lower(btrim(coalesce(p_code, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if r.collected_at is not null then
    return jsonb_build_object('ok', true, 'already', true, 'refund_now', public.myr_refund_request_step(r) = 'refund', 'request', public.myr_refund_request_json(r));
  end if;
  if r.status <> 'progress' or not r.needs_collect then return jsonb_build_object('ok', false, 'code', 'NOT_READY', 'status', r.status); end if;
  update public.myr_refund_requests set collected_at = now() where id = r.id;
  perform public.myr_refund_request_finish(r.id);
  select * into r from public.myr_refund_requests where id = r.id;
  return jsonb_build_object('ok', true, 'already', false, 'refund_now', public.myr_refund_request_step(r) = 'refund', 'request', public.myr_refund_request_json(r));
end;
$$;
revoke all on function public.myr_app_admin_claim_collected(text) from public, anon, authenticated;
grant execute on function public.myr_app_admin_claim_collected(text) to service_role;

-- 재발송 송장 — 재발송이 필요한 진행 중 요청만(회수 전에도 된다 — 오배송은 먼저 보내고 회수할 수 있다) · 택배사 · 운송장 규칙은 0069 와 같다
-- 반환 { ok, already, request } · 거부 NOT_FOUND · NOT_READY · BAD_COURIER · BAD_TRACKING
create or replace function public.myr_app_admin_claim_reship(p_code text, p_courier text, p_tracking_no text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  r          public.myr_refund_requests%rowtype;
  v_courier  text := btrim(coalesce(p_courier, ''));
  v_tracking text := regexp_replace(coalesce(p_tracking_no, ''), '[\s-]', '', 'g');
begin
  if v_courier not in ('CJ대한통운','우체국택배','한진택배','롯데택배','로젠택배') then return jsonb_build_object('ok', false, 'code', 'BAD_COURIER'); end if;
  if v_tracking !~ '^\d{8,30}$' then return jsonb_build_object('ok', false, 'code', 'BAD_TRACKING'); end if;
  select * into r from public.myr_refund_requests where code = lower(btrim(coalesce(p_code, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if r.reshipped_at is not null and r.reship_tracking_no = v_tracking and r.reship_courier = v_courier then
    return jsonb_build_object('ok', true, 'already', true, 'request', public.myr_refund_request_json(r));
  end if;
  if r.status not in ('progress','done') or not r.needs_reship then return jsonb_build_object('ok', false, 'code', 'NOT_READY', 'status', r.status); end if;
  update public.myr_refund_requests set reship_courier = v_courier, reship_tracking_no = v_tracking, reshipped_at = coalesce(reshipped_at, now()) where id = r.id;
  perform public.myr_refund_request_finish(r.id);
  select * into r from public.myr_refund_requests where id = r.id;
  return jsonb_build_object('ok', true, 'already', false, 'request', public.myr_refund_request_json(r));
end;
$$;
revoke all on function public.myr_app_admin_claim_reship(text, text, text) from public, anon, authenticated;
grant execute on function public.myr_app_admin_claim_reship(text, text, text) to service_role;

-- ------------------------------------------------------------
-- 0068 재정의 — 요청에 실린 사진도 고아가 아니다(요청이 처리되기 전에 지워지면 크리에이터가 못 본다)
-- ------------------------------------------------------------
create or replace function public.myr_refund_photo_orphans(p_age interval default interval '24 hours', p_limit integer default 100)
returns setof text
language sql
stable
security definer set search_path = public
as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'myr-refunds'
     and o.created_at < now() - p_age
     and not exists (select 1 from public.myr_order_items i where o.name = any (i.refund_photos))
     and not exists (select 1 from public.myr_refund_requests q where o.name = any (q.photos))
   order by o.created_at
   limit greatest(coalesce(p_limit, 100), 1)
$$;
revoke all on function public.myr_refund_photo_orphans(interval, integer) from public, anon, authenticated;
grant execute on function public.myr_refund_photo_orphans(interval, integer) to service_role;
