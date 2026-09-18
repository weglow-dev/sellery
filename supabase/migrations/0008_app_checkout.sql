-- ============================================================
-- 0008 — 앱 체크아웃(슬라이스 1): 승인 전 주문 checkout_sessions · orders 결제/환불 컬럼 · payment_events ·
--        campaign_card 보강(확정 옵션·정책 상수·서버 기준일) · 서버 전용 RPC(app_claim_checkout / app_confirm_checkout /
--        app_refund_precheck / app_refund_record / expire_checkout_sessions) · 공개 집계 RPC(public_stats)
--
-- 상태: **미적용 — 앱 구현 PR 에서 `supabase db push`** (0001~0006 은 클라우드 프로젝트 sellery 에 적용 완료).
-- 실행: 0006 이후. 재실행 가능(if not exists / add column if not exists / drop … if exists / create or replace).
--       0001~0006 파일은 수정하지 않는다 — 0004 의 orders 정의는 그대로 두고 컬럼·인덱스·grant 만 **추가**한다.
-- 근거: docs/app-plan.md §5 (데이터 계약 확정). glo 0001(orders pending 모델)·0003(raw_cancel) 을 참고하되
--       셀러리는 orders 를 "결제된 주문" 으로 유지하고 승인 전 상태를 별도 테이블에 둔다 (app-plan §0 결정 4).
--
-- 설계 요점
--   · orders.status 열거('PAID','REFUNDED','CANCELED')·paid_at not null·amount generated·sold_qty 트리거는 손대지 않는다.
--     정산 calc()·발주 CSV·관리자 목록이 전부 "orders = 결제된 주문" 을 가정하므로 미결제 시도를 orders 에 넣지 않는다.
--   · 토스 orderId(6~64자 [A-Za-z0-9_-]) 는 orders.code('o2000', 5자) 가 아니라 checkout_sessions.toss_order_id 다.
--   · 모든 쓰기는 service role — 새 테이블은 RLS on + revoke all, 정책 없음. 서버 전용 함수는 execute 회수.
--   · 승인 확정(app_confirm_checkout) 은 세션 행 → 캠페인 행 순서로 for update 잠금 후 재고를 재검사하고 orders 를 1행 insert 한다.
--     sold_qty 는 0004 트리거가 같은 트랜잭션에서 갱신하므로 초과 판매가 막힌다. 함수는 예외 대신 {ok, code} 를 돌려준다 —
--     라우트가 실패 코드에 따라 토스 취소 여부를 분기해야 하기 때문이다.
--   · 선점(app_claim_checkout) 은 PENDING → CONFIRMING 전이와 payment_key 저장을 한 문장으로 묶는다. 라우트가 토스 confirm 호출
--     전에 죽어 CONFIRMING 에 고착된 세션은 일정 시간(기본 20초) 뒤 재선점할 수 있다 — 고객 새로고침이 곧 복구 경로다.
--   · 돈이 토스에서 이미 움직인 뒤(승인 DONE · 콘솔 취소) 의 DB 기록은 현실을 거부하지 않는다: app_confirm_checkout 은 p_payment 를
--     세션과 대조해 불일치를 PAYMENT_MISMATCH 로 돌려주고(라우트가 전액 취소), app_refund_record 는 NOT_FOUND/already 외 가드 없이
--     기록한다(가드는 app_refund_precheck 가 토스 호출 **전**에 평가). 정산 후·샘플 주문의 콘솔 취소는 status='CANCELED'(조정 큐).
--   · 만료(expire_checkout_sessions) 는 PENDING(+ payment_key 없는 CONFIRMING) 만 EXPIRED 로 바꾼다. payment_key 가 있는 CONFIRMING 은
--     돈이 잡혔을 수 있으므로 토스 재조회(GET /v1/payments/{paymentKey}) 로만 종결한다 — app-plan §7.5 reconcile 잡.
--   · campaign_card 의 channels 는 seller_is_public(seller) 일 때만 채운다 — 0001 seller_channels 정책(hidden 인플루언서의 채널 =
--     신원)과 같은 범위. hidden 인플루언서의 공개 캠페인은 이름·핸들·아바타·등급만 노출되고 인증 모달의 채널 목록은 비어 있다.
-- ============================================================

-- ============================================================
-- checkout_sessions — 토스 결제 1건 = 세션 1건 (승인 전 주문). 서비스 롤 전용.
--   PENDING(생성) → CONFIRMING(confirm 선점) → CONFIRMED(orders 생성) | FAILED(승인 실패·금액 불일치·재고 부족·가상계좌) | EXPIRED(만료)
--   가상계좌 WAITING_FOR_DEPOSIT 은 슬라이스 1 에서 지원하지 않는다(위젯에서 제외 + confirm 이 즉시 취소 후 FAILED) —
--   별도 상태값을 두지 않는다. 필요해지면 다음 마이그레이션에서 check 를 넓힌다.
-- ============================================================
create table if not exists public.checkout_sessions (
  id              uuid primary key default gen_random_uuid(),
  toss_order_id   text not null unique
                    check (toss_order_id ~ '^[A-Za-z0-9_-]{6,64}$'),   -- 토스 orderId (서버 생성 'slry_…')
  user_id         uuid references auth.users (id) on delete set null,   -- 슬라이스 1 은 앱이 필수로 채움 (비회원 대비 nullable)
  customer_id     uuid references public.customers (id) on delete set null,
  campaign_id     uuid not null references public.campaigns (id) on delete restrict,   -- 세션당 캠페인 1건 (장바구니 다건은 후속)
  option_index    integer check (option_index is null or option_index >= 0),          -- campaign_card().product.options 의 인덱스
  option_name     text not null,                      -- 옵션명 스냅샷 (orders.option_name 과 같은 의미)
  qty             integer not null check (qty between 1 and 10),
  unit_price      integer not null check (unit_price >= 0),                            -- 서버 스냅샷 (클라이언트 값 아님)
  amount          integer generated always as (qty * unit_price) stored,              -- 토스 amount 대조 기준 (>= 100 은 앱 가드)
  order_name      text not null check (char_length(order_name) between 1 and 100),   -- 토스 orderName
  buyer_name      text not null,
  buyer_phone     text,
  buyer_email     text,
  shipping        jsonb not null,                     -- { recipient, phone, postcode, address1, address2, memo } — orders.shipping 과 동일 키
  status          text not null default 'PENDING'
                    check (status in ('PENDING','CONFIRMING','CONFIRMED','FAILED','EXPIRED')),
  payment_key     text,                               -- 토스 paymentKey (선점 시점에 저장 — app_claim_checkout. 실패 응답에 있으면 그것도 기록)
  payment_method  text,                               -- 토스 method ('카드','간편결제' …)
  approved_at     timestamptz,                        -- 토스 approvedAt
  raw_payment     jsonb,                              -- confirm/조회 응답 원문 (실패 응답 포함)
  fail_code       text,                               -- AMOUNT_MISMATCH · PAYMENT_MISMATCH · SOLD_OUT · NOT_LIVE · EXPIRED · VIRTUAL_ACCOUNT_NOT_SUPPORTED
                                                      -- · CANCEL_PENDING(토스 취소 실패 — reconcile 잡이 재시도) · 토스 code …
  fail_message    text,
  link_code       text,                               -- 유입 쿠키 slry_linkctx 값 (분석용, 선택)
  expires_at      timestamptz not null default (now() + interval '30 minutes'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint checkout_sessions_confirmed_has_payment
    check (status <> 'CONFIRMED' or (payment_key is not null and approved_at is not null))
);

create index if not exists checkout_sessions_user_idx     on public.checkout_sessions (user_id, created_at desc);
create index if not exists checkout_sessions_customer_idx on public.checkout_sessions (customer_id);
create index if not exists checkout_sessions_campaign_idx on public.checkout_sessions (campaign_id, status);   -- 소프트 예약 합계(app_checkout_reserved)
create index if not exists checkout_sessions_pending_idx  on public.checkout_sessions (expires_at)
  where status in ('PENDING','CONFIRMING');                                            -- expire_checkout_sessions() · reconcile 잡
create unique index if not exists checkout_sessions_payment_key_uidx on public.checkout_sessions (payment_key)
  where payment_key is not null;                                                       -- 웹훅 paymentKey 역조회 · 선점 시 타 세션과의 충돌 검출

drop trigger if exists checkout_sessions_updated_at on public.checkout_sessions;
create trigger checkout_sessions_updated_at
  before update on public.checkout_sessions
  for each row execute function public.set_updated_at();

alter table public.checkout_sessions enable row level security;
revoke all on public.checkout_sessions from anon, authenticated;
-- 정책 없음. 성공/실패 페이지·/api/payments/confirm 도 서버가 service role 로 읽되, 먼저 auth.getUser() 로 요청자를 확인하고
-- session.user_id = user.id 가 아니면 403(세션 정보 미노출) 으로 끊는다 — app-plan §7.1 검증 순서. 웹훅만 사용자 컨텍스트 없이
-- 토스 재조회를 인증으로 삼는다.
-- 개인정보 보존: FAILED/EXPIRED 세션의 buyer_*/shipping 은 purge_checkout_pii() 가 지운다(app-plan §5.1).

-- ============================================================
-- orders — 결제/환불 컬럼 추가 (0004 정의 유지, 추가만)
-- ============================================================
alter table public.orders add column if not exists checkout_session_id uuid references public.checkout_sessions (id) on delete set null;
alter table public.orders add column if not exists order_name    text;       -- 토스 orderName · 내 주문 표시 스냅샷 (상품명이 바뀌어도 주문 당시 표기)
alter table public.orders add column if not exists buyer_phone   text;       -- 알림톡 (인플루언서 응답에서는 제거 — access §4.3)
alter table public.orders add column if not exists buyer_email   text;       -- 영수증
alter table public.orders add column if not exists refund_amount integer check (refund_amount is null or refund_amount >= 0);   -- 토스 cancels[].cancelAmount 합
--   status='PAID' 인데 refund_amount > 0 이면 토스 콘솔 **부분취소**(PARTIAL_CANCELED) 다 — 슬라이스 1 은 REFUNDED 로 바꾸지 않고
--   금액만 기록한다(sold_qty·정산과 어긋나지 않게). 정산 calc 이관 슬라이스에서 refund_amount 를 net 에서 차감한다(app-plan §7.3).
alter table public.orders add column if not exists refund_actor  text
  check (refund_actor is null or refund_actor in ('customer','brand','admin','system'));
alter table public.orders add column if not exists raw_cancel    jsonb;      -- 토스 취소 응답 원문 (glo 0003)
-- paid_at not null default now() 는 유지(승인 시 approvedAt 을 명시 세팅). approved_at/canceled_at 은 만들지 않는다.
-- orders_refunded_has_amount 제약은 두지 않는다 — 시드 REFUNDED 행(refund_amount null)이 있다. 앱이 채운다.

-- 세션 ↔ 주문 1:1 (멱등 조회 키). 시드·샘플 주문은 null. 장바구니 다건 결제로 확장할 때 이 유니크를 푼다.
create unique index if not exists orders_checkout_session_uidx on public.orders (checkout_session_id)
  where checkout_session_id is not null;
-- 웹훅·취소의 paymentKey 조회. 유니크는 두지 않는다(다건 결제 확장 시 여러 주문이 같은 paymentKey 를 가진다).
create index if not exists orders_payment_key_idx on public.orders (payment_key) where payment_key is not null;
-- 내 주문 목록 정렬
create index if not exists orders_user_paid_idx on public.orders (user_id, paid_at desc) where user_id is not null;

-- 본인 주문의 표시용 컬럼 추가 grant (정책 orders_select_own 은 0004 그대로). 본인 행이라 새는 것이 없다.
-- shipping(배송지 원문) 은 0004 주석·access-model §4 대로 서버 응답으로만 — 내 주문 화면은 service role 조인(app-plan §6.1)이라 불필요.
grant select (order_name, refund_amount, refund_reason) on public.orders to authenticated;

-- customers: 가입일 표시(내 주문 계정 카드) — 본인 행만 (customers_select_own).
grant select (created_at) on public.customers to authenticated;

-- ============================================================
-- payment_events — 토스 웹훅·승인·취소 원문 로그 (감사·재처리용). 서비스 롤 전용. glo 에는 없는 추가 항목.
-- ============================================================
create table if not exists public.payment_events (
  id              uuid primary key default gen_random_uuid(),
  source          text not null default 'webhook'
                    check (source in ('webhook','deposit_callback','confirm','cancel')),
  event_type      text,                               -- 토스 eventType (PAYMENT_STATUS_CHANGED 등) / 'confirm' / 'cancel'
  toss_order_id   text,
  payment_key     text,
  payload         jsonb not null,
  handled         boolean not null default false,
  result          text,                               -- 처리 결과 요약 ('confirmed','refunded','refunded_orphan','partial_cancel_manual',
                                                      --   'needs_manual_adjust','ignored','error: …'). handled=false 행은 운영 큐.
  received_at     timestamptz not null default now()
);
-- 웹훅은 서명이 없는 공개 엔드포인트다. 라우트는 본문 크기 상한(64KB)·형식 검사(eventType 문자열, orderId/paymentKey
-- ^[A-Za-z0-9_-]{6,64}$)·세션/주문 매칭을 통과한 뒤에만 이 표에 남긴다 — 모르는 주문은 payload 를 자르고 result='ignored'.

create index if not exists payment_events_order_idx    on public.payment_events (toss_order_id);
create index if not exists payment_events_key_idx      on public.payment_events (payment_key);
create index if not exists payment_events_received_idx on public.payment_events (received_at desc);

alter table public.payment_events enable row level security;
revoke all on public.payment_events from anon, authenticated;

-- ============================================================
-- resolve_product_options(options, sale_price) — 옵션 확정 (optsOf L27-31 의 SQL 판, 단일 소스)
--   products.options 가 비어 있으면 platform_settings 'option_bundle_defaults'
--   ({"bundles":[{"n":1,"disc":0},{"n":2,"disc":0.05},{"n":3,"disc":0.10}],"round":100}) 로
--   [{n:'1개',price:gp},{n:'2개 세트 · 5% 추가 할인',price:round(gp*2*0.95/100)*100},{n:'3개 세트 · 10% 추가 할인',…}] 를 만든다.
--   라벨 규칙은 프로토타입 문자열 그대로(disc=0 → '{n}개', 그 외 → '{n}개 세트 · {disc%}% 추가 할인'). 반올림은 양수라 JS Math.round 와 일치.
--   앱은 이 배열을 그대로 쓴다 — 가격 규칙을 앱 코드에 복제하지 않는다. 서버 전용(RPC 노출 없음, campaign_card 안에서만 호출).
-- ============================================================
create or replace function public.resolve_product_options(p_options jsonb, p_sale_price integer)
returns jsonb
language sql stable
set search_path = public
as $$
  select case
    when p_options is not null and jsonb_typeof(p_options) = 'array' and jsonb_array_length(p_options) > 0
      then p_options
    else coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'n', case when coalesce((e.b ->> 'disc')::numeric, 0) = 0
                             then (e.b ->> 'n')::int || '개'
                           else (e.b ->> 'n')::int || '개 세트 · '
                                || round((e.b ->> 'disc')::numeric * 100)::int || '% 추가 할인' end,
                 'price', (round((p_sale_price * (e.b ->> 'n')::int * (1 - coalesce((e.b ->> 'disc')::numeric, 0)))
                                 / d.round_unit) * d.round_unit)::int)
               order by e.ord)
        from (select coalesce((ps.value ->> 'round')::int, 100) as round_unit, ps.value -> 'bundles' as bundles
                from public.platform_settings ps
               where ps.key = 'option_bundle_defaults') d
        cross join lateral jsonb_array_elements(d.bundles) with ordinality as e(b, ord)
    ), jsonb_build_array(jsonb_build_object('n', '1개', 'price', p_sale_price)))
  end
$$;
revoke all on function public.resolve_product_options(jsonb, integer) from public, anon, authenticated;

-- ============================================================
-- campaign_card(code) 보강 — 시그니처·기존 필드 동일(하위 호환). 추가:
--   · product.options : 항상 비어 있지 않은 확정 배열 (resolve_product_options)
--   · product.options_raw : 브랜드 등록 원본 (디버깅·브랜드 센터용)
--   · campaign.today : 서버 기준일 (Asia/Seoul) — D-day·구매 가능 판정을 클라이언트 시계에 의존하지 않기 위해
--   · settings : { clear_days, link_protect_days, home_feature_days } — platform_settings 는 service role 전용이라 여기서 동봉
-- ============================================================
create or replace function public.campaign_card(p_code text)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id, 'code', c.code, 'status', c.status,
      'start_date', c.start_date, 'end_date', c.end_date,
      'qty',      case when c.status = 'SETTLED' then null else c.qty end,
      'sold_qty', case when c.status = 'SETTLED' then null else c.sold_qty end,
      'home_featured_at', c.home_featured_at,
      'today', (now() at time zone 'Asia/Seoul')::date),
    'product', jsonb_build_object(
      'id', p.id, 'code', p.code, 'name', p.name, 'description', p.description, 'emoji', p.emoji,
      'thumb_url', p.thumb_url, 'image_urls', to_jsonb(p.image_urls), 'category', p.category,
      'consumer_price', p.consumer_price, 'sale_price', p.sale_price,
      'options', public.resolve_product_options(p.options, p.sale_price),
      'options_raw', p.options,
      'status', p.status),
    'seller', jsonb_build_object(
      'id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle, 'platform', s.platform,
      'avatar_url', s.avatar_url, 'grade', s.grade),
    'brand', jsonb_build_object(
      'id', b.id, 'code', b.code, 'name', b.name, 'logo_url', b.logo_url, 'grade', b.grade,
      'biz_no', b.biz_no, 'mail_order_no', b.mail_order_no),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object('platform', ch.platform, 'handle', ch.handle, 'url', ch.url)
                       order by ch.is_primary desc, ch.created_at)
        from public.seller_channels ch
       where ch.seller_id = s.id and ch.verified
         and public.seller_is_public(s.id)), '[]'::jsonb),   -- 0001 seller_channels 정책과 같은 범위 (hidden 이면 빈 배열)
    'settings', jsonb_build_object(
      'clear_days',        coalesce((select (ps.value #>> '{}')::int from public.platform_settings ps where ps.key = 'clear_days'), 21),
      'link_protect_days', coalesce((select (ps.value #>> '{}')::int from public.platform_settings ps where ps.key = 'link_protect_days'), 7),
      'home_feature_days', coalesce((select (ps.value #>> '{}')::int from public.platform_settings ps where ps.key = 'home_feature_days'), 7))
  )
  from public.campaigns c
  join public.products p on p.id = c.product_id
  join public.sellers  s on s.id = c.seller_id
  join public.brands   b on b.id = c.brand_id
  where c.code = p_code
    and c.status in ('SCHEDULE_CONFIRMED','LIVE','CLEARING','SETTLED')
    and s.active and b.active
    and p.deleted_at is null
$$;
revoke all on function public.campaign_card(text) from public;
grant execute on function public.campaign_card(text) to anon, authenticated;

-- ============================================================
-- app_checkout_reserved(campaign_id) — 소프트 예약 합계: 진행 중(PENDING/CONFIRMING · 미만료) 세션의 qty 합 (서비스 롤 전용)
--   /api/checkout 과 confirm 사전 확인은 left = qty − sold_qty − reserved 로 판정해 잔여가 없으면 결제창을 열지 않는다.
--   하드 예약(sold_qty 선점)은 "orders = 결제된 주문" 가정을 깨므로 하지 않는다 — 최종 방어선은 app_confirm_checkout 의 잠금 재검사.
-- ============================================================
create or replace function public.app_checkout_reserved(p_campaign_id uuid)
returns integer
language sql stable
security definer set search_path = public
as $$
  select coalesce(sum(cs.qty), 0)::int
    from public.checkout_sessions cs
   where cs.campaign_id = p_campaign_id
     and cs.status in ('PENDING','CONFIRMING')
     and cs.expires_at > now()
$$;
revoke all on function public.app_checkout_reserved(uuid) from public, anon, authenticated;

-- 세션 요약(PII 없음) — app_claim_checkout 반환용
create or replace function public.checkout_session_brief(s public.checkout_sessions)
returns jsonb
language sql immutable
as $$
  select jsonb_build_object(
    'id', s.id, 'status', s.status, 'amount', s.amount, 'qty', s.qty, 'campaign_id', s.campaign_id,
    'user_id', s.user_id, 'toss_order_id', s.toss_order_id, 'payment_key', s.payment_key,
    'fail_code', s.fail_code, 'updated_at', s.updated_at, 'expires_at', s.expires_at)
$$;
revoke all on function public.checkout_session_brief(public.checkout_sessions) from public, anon, authenticated;

-- ============================================================
-- app_claim_checkout(toss_order_id, payment_key, stale) — confirm 선점 (서비스 롤 전용)
--   PENDING(미만료) → CONFIRMING + payment_key 저장. CONFIRMING 인데 updated_at 이 p_stale(기본 20초) 보다 오래됐고
--   payment_key 가 같으면(또는 없으면) 고착 세션으로 보고 재선점한다 — 라우트가 토스 confirm 호출 전후에 죽은 경우의 복구 경로.
--   반환:
--     { ok:true,  claimed:true,  session:{…} }                 선점 성공(또는 재선점) — 이어서 토스 confirm(또는 재조회) 진행
--     { ok:true,  claimed:false, session:{…} }                 이미 CONFIRMED(멱등) — 라우트는 app_confirm_checkout 으로 기존 주문 반환
--     { ok:false, code:'NOT_FOUND' }
--     { ok:false, code:'CONFIRMING' }                          다른 요청이 진행 중(신선한 CONFIRMING) → 409
--     { ok:false, code:'EXPIRED' | 'FAILED'(fail_code 우선), message }   종결 세션 → 400
--     { ok:false, code:'PAYMENT_KEY_CONFLICT' }                같은 paymentKey 가 다른 세션에 이미 있음(unique 인덱스) → 400, 토스 미호출
--   session 에는 id, status, amount, qty, campaign_id, user_id, toss_order_id, payment_key, fail_code 만 담는다 (PII 없음).
-- ============================================================
create or replace function public.app_claim_checkout(p_toss_order_id text, p_payment_key text, p_stale interval default interval '20 seconds')
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  s public.checkout_sessions%rowtype;
begin
  select * into s from public.checkout_sessions where toss_order_id = p_toss_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if s.status = 'CONFIRMED' then
    return jsonb_build_object('ok', true, 'claimed', false, 'session', public.checkout_session_brief(s));
  end if;

  if s.status in ('FAILED','EXPIRED') then
    return jsonb_build_object('ok', false, 'code', coalesce(s.fail_code, s.status), 'message', s.fail_message);
  end if;

  if s.status = 'CONFIRMING'
     and not (s.updated_at < now() - p_stale
              and (s.payment_key is null or s.payment_key = p_payment_key)) then
    return jsonb_build_object('ok', false, 'code', 'CONFIRMING');
  end if;

  if s.status = 'PENDING' and s.expires_at <= now() then
    update public.checkout_sessions
       set status = 'EXPIRED', fail_code = 'EXPIRED', fail_message = '결제 시간이 만료되었습니다'
     where id = s.id;
    return jsonb_build_object('ok', false, 'code', 'EXPIRED', 'message', '결제 시간이 만료되었습니다');
  end if;

  begin
    update public.checkout_sessions
       set status = 'CONFIRMING', payment_key = p_payment_key
     where id = s.id
     returning * into s;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'PAYMENT_KEY_CONFLICT');
  end;

  return jsonb_build_object('ok', true, 'claimed', true, 'session', public.checkout_session_brief(s));
end;
$$;
revoke all on function public.app_claim_checkout(text, text, interval) from public, anon, authenticated;

-- ============================================================
-- app_confirm_checkout(session_id, payment_key, payment, recover) — 승인 확정 (서비스 롤 전용, 한 트랜잭션)
--   라우트(또는 웹훅·reconcile 잡)가 토스 confirm/재조회로 status='DONE' 을 확인한 **뒤** 호출한다. 반환:
--     { ok:true,  already:false, order_id, order_code }   주문 생성됨
--     { ok:true,  already:true,  order_id, order_code }   이미 CONFIRMED (멱등 — 성공 페이지 새로고침·StrictMode 이중 호출)
--     { ok:false, code:'NOT_FOUND' | 'PAYMENT_MISMATCH' | 'VIRTUAL_ACCOUNT_NOT_SUPPORTED' | 'NOT_LIVE' | 'SOLD_OUT'(left)
--                 | <세션 fail_code 또는 status>(FAILED/EXPIRED, recover=false), message }
--   함수 안의 방어선(호출자마다 반복하지 않도록): p_payment.status='DONE' · orderId=toss_order_id · totalAmount=amount ·
--   paymentKey=p_payment_key(PAYMENT_MISMATCH) · method≠가상계좌 · 캠페인 LIVE 이고 start_date ≤ today(KST) ≤ end_date · 재고.
--   p_recover=true(웹훅·reconcile 전용): FAILED/EXPIRED 인데 주문이 없는 세션도 위 검사를 통과하면 주문을 만든다
--   (돈은 잡혔는데 주문이 없는 상태의 복구). 단 fail_code='CANCEL_PENDING'(취소 의도가 확정된 세션)은 복구하지 않는다.
--   ok:false 인 PAYMENT_MISMATCH / VIRTUAL_ACCOUNT_NOT_SUPPORTED / NOT_LIVE / SOLD_OUT 은 돈이 이미 잡힌 뒤이므로 호출자가 반드시
--   토스 전액 취소 후 세션을 FAILED 로 갱신한다(취소 실패 시 fail_code='CANCEL_PENDING').
-- ============================================================
drop function if exists public.app_confirm_checkout(uuid, text, jsonb);   -- 이전 초안 시그니처(적용된 적 없음) — 기본값 인자와의 오버로드 모호성 방지
create or replace function public.app_confirm_checkout(p_session_id uuid, p_payment_key text, p_payment jsonb, p_recover boolean default false)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  s        public.checkout_sessions%rowtype;
  c        public.campaigns%rowtype;
  v_oid    uuid;
  v_ocode  text;
  v_appr   timestamptz;
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
begin
  select * into s from public.checkout_sessions where id = p_session_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if s.status = 'CONFIRMED' then
    select o.id, o.code into v_oid, v_ocode from public.orders o where o.checkout_session_id = s.id;
    return jsonb_build_object('ok', true, 'already', true, 'order_id', v_oid, 'order_code', v_ocode);
  end if;

  if s.status not in ('PENDING','CONFIRMING') then
    -- 세션은 종결됐는데 주문이 이미 있으면(과거 경합) 멱등 반환
    select o.id, o.code into v_oid, v_ocode from public.orders o where o.checkout_session_id = s.id;
    if found then
      return jsonb_build_object('ok', true, 'already', true, 'order_id', v_oid, 'order_code', v_ocode);
    end if;
    if not p_recover or s.fail_code = 'CANCEL_PENDING' then
      return jsonb_build_object('ok', false, 'code', coalesce(s.fail_code, s.status), 'message', s.fail_message);
    end if;
  end if;

  -- 토스 응답 원문을 세션과 대조 (라우트·웹훅·reconcile 어느 호출자든 여기서 한 번 더 막힌다)
  if p_payment is null
     or p_payment ->> 'status' is distinct from 'DONE'
     or p_payment ->> 'orderId' is distinct from s.toss_order_id
     or (p_payment ->> 'totalAmount')::bigint is distinct from s.amount::bigint
     or p_payment ->> 'paymentKey' is distinct from p_payment_key then
    return jsonb_build_object('ok', false, 'code', 'PAYMENT_MISMATCH');
  end if;
  if p_payment ->> 'method' = '가상계좌' or p_payment ? 'virtualAccount' then
    return jsonb_build_object('ok', false, 'code', 'VIRTUAL_ACCOUNT_NOT_SUPPORTED');
  end if;

  -- 캠페인 행 잠금 → 기간·상태·재고 재검사. 같은 캠페인의 동시 confirm 은 여기서 직렬화된다.
  -- 슬라이스 1 에는 LIVE→CLEARING 스케줄러가 없으므로(app-plan §12) end_date 를 여기서 직접 본다 — 마지막 방어선.
  select * into c from public.campaigns where id = s.campaign_id for update;
  if not found or c.status <> 'LIVE'
     or c.start_date > v_today or c.end_date < v_today then
    return jsonb_build_object('ok', false, 'code', 'NOT_LIVE');
  end if;
  if c.qty - c.sold_qty < s.qty then
    return jsonb_build_object('ok', false, 'code', 'SOLD_OUT', 'left', greatest(c.qty - c.sold_qty, 0));
  end if;

  v_appr := coalesce((p_payment ->> 'approvedAt')::timestamptz, now());

  insert into public.orders (
    campaign_id, customer_id, user_id, status, buyer_name, buyer_phone, buyer_email,
    qty, unit_price, option_name, is_sample, shipping, order_name,
    payment_key, payment_method, paid_at, raw_payment, checkout_session_id)
  values (
    s.campaign_id, s.customer_id, s.user_id, 'PAID', s.buyer_name, s.buyer_phone, s.buyer_email,
    s.qty, s.unit_price, s.option_name, false, s.shipping, s.order_name,
    p_payment_key, p_payment ->> 'method', v_appr, p_payment, s.id)
  returning id, code into v_oid, v_ocode;
  -- orders_sync_sold_qty (0004, after insert) 가 같은 트랜잭션에서 campaigns.sold_qty 를 갱신한다.

  update public.checkout_sessions
     set status = 'CONFIRMED',
         payment_key = p_payment_key,
         payment_method = p_payment ->> 'method',
         approved_at = v_appr,
         raw_payment = p_payment,
         fail_code = null,
         fail_message = null
   where id = s.id;

  return jsonb_build_object('ok', true, 'already', false, 'order_id', v_oid, 'order_code', v_ocode);
end;
$$;
revoke all on function public.app_confirm_checkout(uuid, text, jsonb, boolean) from public, anon, authenticated;

-- ============================================================
-- app_refund_precheck(order_id, actor) — 환불 가드만 (잠금 없음 · 상태 변경 없음). 서비스 롤 전용.
--   라우트가 토스 취소 **전** 에 호출한다. 가드(flows §2.3 + glo isCancelable):
--     PAID 만 · 샘플 불가 · 캠페인 SETTLED 불가 · actor='customer' 는 발송 전(tracking_no null)만 · 부분환불 미지원 표시.
--   반환: { ok:true, order_code, amount, payment_key, campaign_status }
--       | { ok:false, code:'BAD_ACTOR'|'NOT_FOUND'|'SAMPLE'|'SETTLED'|'SHIPPED'|'REFUNDED'|'CANCELED' }
--   가드와 기록(app_refund_record)을 나눈 이유: 토스가 취소를 확정한 뒤에는 DB 가 현실을 거부하면 안 되기 때문 —
--   가드 통과 후 토스 취소 사이에 송장이 입력되거나 정산이 끝나도 record 는 기록한다.
-- ============================================================
drop function if exists public.app_refund_order(uuid, text, text, integer, jsonb);   -- 이전 초안(적용된 적 없음) — precheck/record 로 분리
create or replace function public.app_refund_precheck(p_order_id uuid, p_actor text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  o        public.orders%rowtype;
  v_cstat  text;
begin
  if p_actor is null or p_actor not in ('customer','brand','admin','system') then
    return jsonb_build_object('ok', false, 'code', 'BAD_ACTOR');
  end if;
  select * into o from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if o.status <> 'PAID' then
    return jsonb_build_object('ok', false, 'code', o.status);        -- 'REFUNDED' | 'CANCELED'
  end if;
  if o.is_sample then
    return jsonb_build_object('ok', false, 'code', 'SAMPLE');
  end if;
  select status into v_cstat from public.campaigns where id = o.campaign_id;
  if v_cstat = 'SETTLED' then
    return jsonb_build_object('ok', false, 'code', 'SETTLED');
  end if;
  if p_actor = 'customer' and o.tracking_no is not null then
    return jsonb_build_object('ok', false, 'code', 'SHIPPED');
  end if;
  return jsonb_build_object('ok', true, 'order_code', o.code, 'amount', o.amount,
                            'payment_key', o.payment_key, 'campaign_status', v_cstat);
end;
$$;
revoke all on function public.app_refund_precheck(uuid, text) from public, anon, authenticated;

-- ============================================================
-- app_refund_record(order_id, actor, reason, amount, raw, partial) — 토스가 취소를 **확정한 뒤** 의 기록 (서비스 롤 전용, 한 트랜잭션)
--   NOT_FOUND / already(이미 REFUNDED·CANCELED) 외 가드 없음 — 돈이 이미 돌아갔으면 무조건 기록한다.
--   · 전액(partial=false):
--       - 일반: PAID → REFUNDED + refund_* + raw_cancel + campaign_events 'refunded' (sold_qty 는 트리거가 감소)
--       - 캠페인 SETTLED 또는 is_sample(0004 orders_sample_not_refunded 로 REFUNDED 불가): status='CANCELED'(0004 열거의 미사용값)
--         로 기록하고 campaign_events 'refund_needs_adjust' 를 남긴다 — 정산 후 조정 큐. 반환 adjust:true.
--       - actor='customer' 인데 기록 시점에 tracking_no 가 생겼으면(가드 통과 후 브랜드가 송장 입력한 경합) REFUNDED 로 기록하고
--         campaign_events 'refund_after_ship'(회수 필요) 를 추가로 남긴다. 반환 after_ship:true.
--   · 부분(partial=true, 토스 콘솔 PARTIAL_CANCELED): 주문 PAID 유지 + refund_amount(부분 합)·refund_actor·raw_cancel 만 기록 +
--       campaign_events 'partial_refund'. sold_qty·status 는 건드리지 않는다(정산 calc 이관 슬라이스가 refund_amount 를 차감).
--       반환 partial:true. 슬라이스 1 운영 규칙: 토스 콘솔 부분취소는 하지 않는다(필요하면 전액 취소 후 재결제).
--   반환: { ok:true, already:bool, order_code, amount, status, adjust?:true, after_ship?:true, partial?:true }
--       | { ok:false, code:'BAD_ACTOR'|'NOT_FOUND' }
-- ============================================================
create or replace function public.app_refund_record(p_order_id uuid, p_actor text, p_reason text, p_amount integer, p_raw jsonb,
                                                    p_partial boolean default false)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  o          public.orders%rowtype;
  v_cstat    text;
  v_amt      integer;
  v_masked   text;
  v_status   text;
  v_adjust   boolean := false;
  v_aftership boolean := false;
  v_reason   text := left(coalesce(p_reason, ''), 200);
begin
  if p_actor is null or p_actor not in ('customer','brand','admin','system') then
    return jsonb_build_object('ok', false, 'code', 'BAD_ACTOR');
  end if;

  select * into o from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if o.status in ('REFUNDED','CANCELED') then
    return jsonb_build_object('ok', true, 'already', true, 'order_code', o.code, 'amount', o.refund_amount, 'status', o.status);
  end if;

  -- 스레드 표시명은 마스킹('김준호' → '김*호') — 인플루언서 화면 규칙 (access §2.6)
  v_masked := case when char_length(coalesce(o.buyer_name, '')) >= 2
                   then left(o.buyer_name, 1) || '*' || substr(o.buyer_name, 3)
                   else coalesce(o.buyer_name, '고객') end;

  -- 부분취소: 상태 불변, 금액만 기록
  if p_partial then
    v_amt := coalesce(p_amount, 0);
    update public.orders
       set refund_amount = v_amt,
           refund_actor  = p_actor,
           refund_reason = v_reason,
           raw_cancel    = p_raw
     where id = o.id;
    insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
    values (o.campaign_id, 'system', 'system', 'system',
            '↩ 부분 환불(토스 콘솔) · ' || v_masked || ' · ₩' || to_char(v_amt, 'FM999,999,999,999') || ' — 정산 수동 확인 필요',
            'partial_refund',
            jsonb_build_object('order_code', o.code, 'amount', o.amount, 'refund_amount', v_amt,
                               'actor', p_actor, 'reason', v_reason, 'buyer_masked', v_masked));
    return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'amount', v_amt, 'status', o.status, 'partial', true);
  end if;

  v_amt := coalesce(p_amount, o.amount);
  select status into v_cstat from public.campaigns where id = o.campaign_id;

  -- 정산 후·샘플 주문: REFUNDED 로 둘 수 없으므로(정산 스냅샷 확정 · orders_sample_not_refunded) CANCELED = 조정 큐
  if v_cstat = 'SETTLED' or o.is_sample then
    v_status := 'CANCELED';
    v_adjust := true;
  else
    v_status := 'REFUNDED';
  end if;
  if p_actor = 'customer' and o.tracking_no is not null then
    v_aftership := true;
  end if;

  update public.orders
     set status        = v_status,
         refunded_at   = now(),
         refund_reason = v_reason,
         refund_amount = v_amt,
         refund_actor  = p_actor,
         raw_cancel    = p_raw
   where id = o.id;
  -- orders_sync_sold_qty 가 sold_qty 를 재계산한다(PAID 합).

  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (
    o.campaign_id, 'system', 'system', 'system',
    case when p_actor = 'customer' then '↩ 고객 환불 신청 · ' else '↩ 환불 처리 · ' end
      || v_masked || ' · ₩' || to_char(v_amt, 'FM999,999,999,999')
      || case when v_adjust then ' (정산 후 — 조정 필요)' else ' (정산액 차감)' end,
    case when v_adjust then 'refund_needs_adjust' else 'refunded' end,
    jsonb_build_object('order_code', o.code, 'amount', o.amount, 'refund_amount', v_amt,
                       'actor', p_actor, 'reason', v_reason, 'buyer_masked', v_masked,
                       'status', v_status, 'campaign_status', v_cstat, 'is_sample', o.is_sample));

  if v_aftership then
    insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
    values (o.campaign_id, 'system', 'system', 'system',
            '⚠ 발송 후 환불 · ' || v_masked || ' · 송장 ' || coalesce(o.tracking_no, '') || ' — 회수 필요',
            'refund_after_ship',
            jsonb_build_object('order_code', o.code, 'courier', o.courier, 'tracking_no', o.tracking_no, 'buyer_masked', v_masked));
  end if;

  return jsonb_build_object('ok', true, 'already', false, 'order_code', o.code, 'amount', v_amt, 'status', v_status,
                            'adjust', v_adjust, 'after_ship', v_aftership);
end;
$$;
revoke all on function public.app_refund_record(uuid, text, text, integer, jsonb, boolean) from public, anon, authenticated;

-- ============================================================
-- expire_checkout_sessions(grace) — 만료 세션 정리 (서비스 롤 / 크론). confirm(app_claim_checkout) 은 expires_at 을 직접 보므로
--   지연 정리라도 무방. 대상은 **PENDING** 과 payment_key 가 없는 CONFIRMING 만 — payment_key 가 있는 CONFIRMING 은 토스에서
--   승인이 처리됐을 수 있어 여기서 EXPIRED 로 덮지 않는다. 그런 세션은 reconcile 잡(app-plan §7.5)이
--   GET /v1/payments/{paymentKey} 재조회로 종결한다: DONE → app_confirm_checkout(recover) 또는 토스 취소, 그 외 → FAILED.
-- ============================================================
create or replace function public.expire_checkout_sessions(p_grace interval default interval '1 hour')
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  update public.checkout_sessions
     set status = 'EXPIRED', fail_code = coalesce(fail_code, 'EXPIRED')
   where (status = 'PENDING' or (status = 'CONFIRMING' and payment_key is null))
     and expires_at < now() - p_grace;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.expire_checkout_sessions(interval) from public, anon, authenticated;

-- ============================================================
-- stale_checkout_sessions(age, limit) — reconcile 잡 입력: payment_key 가 있는 CONFIRMING(고착) + fail_code='CANCEL_PENDING'(취소 재시도)
--   서비스 롤 전용. 라우트/크론이 이 목록을 돌며 토스 재조회·취소를 수행한다(app-plan §7.5).
-- ============================================================
create or replace function public.stale_checkout_sessions(p_age interval default interval '2 minutes', p_limit integer default 100)
returns setof jsonb
language sql stable
security definer set search_path = public
as $$
  select public.checkout_session_brief(cs)
    from public.checkout_sessions cs
   where (cs.status = 'CONFIRMING' and cs.payment_key is not null and cs.updated_at < now() - p_age)
      or (cs.status = 'FAILED' and cs.fail_code = 'CANCEL_PENDING' and cs.payment_key is not null)
   order by cs.updated_at
   limit p_limit
$$;
revoke all on function public.stale_checkout_sessions(interval, integer) from public, anon, authenticated;

-- ============================================================
-- purge_checkout_pii(older_than) — 개인정보 파기 (서비스 롤 / 크론). 결제에 이르지 못한 세션(FAILED/EXPIRED)의 실명·연락처·배송지를
--   p_older_than(기본 30일) 뒤 지운다. 행은 남긴다(감사·통계 — 금액·상태·fail_code 만). CONFIRMED 세션은 주문의 거래기록
--   (전자상거래법 5년) 이므로 여기서 다루지 않는다. app-plan §5.1.
-- ============================================================
create or replace function public.purge_checkout_pii(p_older_than interval default interval '30 days')
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  update public.checkout_sessions
     set buyer_name = '(삭제)', buyer_phone = null, buyer_email = null,
         shipping = '{}'::jsonb, raw_payment = null
   where status in ('FAILED','EXPIRED')
     and updated_at < now() - p_older_than
     and buyer_name <> '(삭제)';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.purge_checkout_pii(interval) from public, anon, authenticated;

-- ============================================================
-- public_stats() — 고객 홈 상단 집계 (플랫폼 합계만 — 개별 판매 실적 노출 없음, access §3). anon 호출 가능.
--   today_qty: 오늘(KST) PAID 비샘플 주문 수량 합 · gmv: Σ brands.gmv_base + Σ PAID 주문금액 (platformGmv L1529 계열)
--   sellers: 공개 인플루언서 수 · brands: active 브랜드 수 · today: 서버 기준일
-- ============================================================
create or replace function public.public_stats()
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'today_qty', coalesce((select sum(o.qty)
                             from public.orders o
                            where o.status = 'PAID' and not o.is_sample
                              and (o.paid_at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date), 0),
    'gmv', coalesce((select sum(b.gmv_base) from public.brands b), 0)
         + coalesce((select sum(o.amount) from public.orders o where o.status = 'PAID'), 0),
    'sellers', (select count(*) from public.sellers s where s.active and not s.hidden),
    'brands',  (select count(*) from public.brands b where b.active),
    'today',   (now() at time zone 'Asia/Seoul')::date)
$$;
revoke all on function public.public_stats() from public;
grant execute on function public.public_stats() to anon, authenticated;
