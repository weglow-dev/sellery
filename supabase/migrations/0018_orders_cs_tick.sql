-- ============================================================
-- 0018 — 브랜드 콘솔 4단계 PR-A: 캠페인 자동 전이(스케줄러) · 브랜드 주문 표 · 운송장 등록(단건/일괄) · 발주서 행 ·
--        브랜드 환불 가드 · 고객 문의(CS) 접수/조회/답글/종료
--        campaigns.po_exported_at · app_campaign_tick / app_campaign_tick_one · app_brand_orders · app_brand_ship_order / app_brand_ship_orders
--        · app_brand_po_rows · app_brand_refund_precheck · app_cs_open / app_cs_thread / app_cs_customer_reply / app_cs_list_for_user
--        · app_brand_cs_list / app_brand_cs_thread / app_brand_cs_reply / app_brand_cs_close · cs_conversation_json / cs_message_json
--
-- 근거: docs/brand-console-plan.md §4 "4단계"(계획서의 0017 번호는 초대 게이트 수정(0017)에 쓰여 **0018** 로) · §5 `/brand/orders` `/brand/cs` · §6 행 4 · §8(수취인 개인정보 · CS 접수 위치)
--       · docs/app-plan.md §7(환불 관례 · 크론 `api/cron/campaign-tick` · `CRON_SECRET`) · CLAUDE.md "고객 CS 는 브랜드로 바로".
-- 실행: 0017 이후. 재실행 가능(add column if not exists / create or replace / drop function if exists).
--       0001~0017 파일은 수정하지 않는다 — orders(0004 · 0008) · cs_conversations/cs_messages(0005) · campaigns(0003) 정의는 그대로 두고 컬럼·함수만 **추가**한다.
--       0008 app_refund_precheck / app_refund_record 는 손대지 않고 브랜드 가드(app_brand_refund_precheck)가 앞에서 감싼다.
--
-- 숫자·규칙의 정답은 packages/core/src/{constants,helpers,actions}.ts 다. 이 파일의 SQL 은 그 규칙을 그대로 옮긴 것이고, 바꿀 때는 둘을 함께 고친다.
--
-- | 규칙 | 코어 원본 | 여기서 |
-- |---|---|---|
-- | SCHEDULE_CONFIRMED → LIVE (start ≤ 오늘) · LIVE → CLEARING (end < 오늘) — 오늘은 Asia/Seoul 달력일 | helpers.ts autoTick | app_campaign_tick() · app_campaign_tick_one(id) · 이벤트 went_live / ended{due_on} · 멱등(두 번 돌려도 0건) |
-- | 정산 예정일 = 종료일 + 21 | settleDue · CLEAR_DAYS | platform_settings clear_days(없으면 21) → ended.payload.due_on (열 없음 — 0004 settlements.due_on 은 정산 실행 때) |
-- | 브랜드 주문 표 = 내 상품 캠페인의 주문 · 미발송 우선 | vBrandOrders(brandCids) | app_brand_orders(brand, filter, campaign) — **is_sample 제외**(샘플 발송은 0015 campaigns.sample_* · 샘플 주문은 인플루언서 구매 기록) · buyer_email 마스킹 · shipping 원문(발송 목적, §8) |
-- | 운송장 저장 = PAID 주문에 courier/tracking 기록 · 상태 전이 없음(0004 판정 규칙) · 정정은 덮어쓰기 | saveTrackOne · applyTrackCSV | app_brand_ship_order — NOT_FOUND · SAMPLE · NOT_PAID{status} · BAD_COURIER · BAD_TRACKING · already(같은 값) · replaced(다른 값 덮어씀) · shipped_at=now() |
-- | 일괄 = CSV 행마다 주문번호(대소문자 무시)+택배사+송장 · 실패 행은 사유, 나머지 적용(부분 성공) | applyTrackCSV | app_brand_ship_orders(brand, rows jsonb) — 행 ≤ 500(BAD_ROWS) · 행별 {order_code, ok, code, already} |
-- | 발주서 = 내 캠페인 PAID 주문(수취인·주소 포함) · 발송 이벤트 po_sent | poCSV · poEmail | app_brand_po_rows(brand, campaign|null) — 행 + 캠페인별 po_exported_at(첫 내보내기에만 이벤트 po_sent) |
-- | 브랜드 환불 = PAID · 비샘플 · 캠페인 ≠ SETTLED · **발송 전만**(발송 후는 교환·반품 CS 로 — 결정, isRefundable SHIPPED 와 동일) | refund · isRefundable | app_brand_refund_precheck(brand, order) → 소유(NOT_FOUND) · SAMPLE · SHIPPED 뒤 0008 app_refund_precheck(order,'brand') 에 위임. 토스 취소 → app_refund_record(actor 'brand') 는 앱(@sellery/payments brand-refund) |
-- | 고객 문의는 관리자를 거치지 않고 브랜드로 직행 · 주문번호는 원문 보관 + 같은 캠페인 범위에서 해석 | submitCS · csBrandId · CS_TYPES | app_cs_open — brand_id 는 캠페인에서 파생 · order_code → order_id(대소문자 무시) · 이벤트 cs_received · 비회원은 client_token |
-- | 답변 → ANSWERED + replied_at · 종료 → CLOSED · 고객 재문의 → OPEN | saveCSReply · csClose | app_brand_cs_reply(→ ANSWERED · 이벤트 cs_replied) · app_brand_cs_close · app_cs_customer_reply(ANSWERED → OPEN · CLOSED 면 거부) |
--
-- 설계 요점
--   · 전부 security definer · service_role 만 execute(0007 패턴). 콘솔은 requireBrand() 의 brand.id 만 넘긴다 — 클라이언트가 보낸 id·금액은 믿지 않는다.
--   · 소유권은 campaigns.brand_id(주문 · 발주 · 환불) · cs_conversations.brand_id(문의). 남의 것은 NOT_FOUND — 존재 여부를 구분하지 않는다(라우트 404).
--   · 스케줄러는 예외 대신 집계 jsonb 를 돌려주고 캠페인마다 for update 로 잠근다. 같은 캠페인이 같은 틱에 LIVE 를 거쳐 CLEARING 까지 가는 경우(시작·종료가 모두 과거)도
--     데모 autoTick 의 forEach 와 같이 두 이벤트를 순서대로 남긴다.
--   · 고객 측 함수(app_cs_*)의 인증은 client_token(비회원 · 브라우저 저장 비밀값) 또는 user_id(회원 — /account) 둘 중 하나. 레이트리밋은 앱(@sellery/db rateLimit).
--   · 함수는 예외 대신 {ok, code} 를 돌려준다(0010~0017 관례). 라우트는 code 를 문구로 바꾼다(packages/db/src/brand/order-rules.ts · cs/cs-rules.ts).
--   · RLS 변경 없음.
-- ============================================================

-- ------------------------------------------------------------
-- 컬럼
-- ------------------------------------------------------------
-- 발주서 첫 내보내기 시각 — CSV 다운로드마다 이벤트를 남기지 않기 위해 캠페인당 1회만 po_sent 를 기록한다(데모 poEmail 은 매번 toast).
alter table public.campaigns add column if not exists po_exported_at timestamptz;
comment on column public.campaigns.po_exported_at is '발주서(발주 CSV) 첫 내보내기 시각 (0018 app_brand_po_rows) — 이벤트 po_sent 는 이때 1회';

-- ------------------------------------------------------------
-- 헬퍼 — 정산 유예일(platform_settings clear_days · 없으면 21) · 판매 기간 종료 시스템 문구
-- ------------------------------------------------------------
create or replace function public.platform_clear_days()
returns integer
language sql stable
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'clear_days'), 21)
$$;
revoke all on function public.platform_clear_days() from public, anon, authenticated;
grant execute on function public.platform_clear_days() to service_role;

-- ------------------------------------------------------------
-- app_campaign_tick_one(p_campaign_id) — 캠페인 1건의 스케줄러 전이 (운영 스크립트 · 테스트 · 틱 내부용)
--   SCHEDULE_CONFIRMED · start_date ≤ 오늘(KST) → LIVE + 이벤트 went_live
--   LIVE · end_date < 오늘(KST)               → CLEARING + 이벤트 ended{end_date, due_on}
--   같은 호출에서 두 전이가 연달아 일어날 수 있다(시작·종료가 모두 지난 확정 캠페인).
--   반환: { ok:true, campaign_code, from, to, went_live:bool, ended:bool, today }   (전이 없음이면 from = to)
--       | { ok:false, code:'NOT_FOUND' }
-- ------------------------------------------------------------
create or replace function public.app_campaign_tick_one(p_campaign_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c          public.campaigns%rowtype;
  v_today    date := (now() at time zone 'Asia/Seoul')::date;
  v_from     text;
  v_live     boolean := false;
  v_ended    boolean := false;
  v_due      date;
begin
  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  v_from := c.status;

  if c.status = 'SCHEDULE_CONFIRMED' and c.start_date is not null and c.start_date <= v_today then
    update public.campaigns set status = 'LIVE' where id = c.id;
    c.status := 'LIVE';
    v_live := true;
    -- 프로토타입 autoTick 의 pushSys 원문
    insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
    values (c.id, 'system', 'system', 'system',
            '판매 시작 시각 도래 — 판매 링크 자동 활성화 (스케줄러)',
            'went_live',
            jsonb_build_object('start_date', c.start_date, 'end_date', c.end_date, 'today', v_today));
  end if;

  if c.status = 'LIVE' and c.end_date is not null and c.end_date < v_today then
    v_due := c.end_date + public.platform_clear_days();
    update public.campaigns set status = 'CLEARING' where id = c.id;
    c.status := 'CLEARING';
    v_ended := true;
    insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
    values (c.id, 'system', 'system', 'system',
            format('판매 기간 종료 (스케줄러) · 교환/환불 기간 시작 · 정산 예정 %s/%s',
                   extract(month from v_due)::int, extract(day from v_due)::int),
            'ended',
            jsonb_build_object('end_date', c.end_date, 'due_on', v_due, 'today', v_today, 'sold_qty', c.sold_qty));
  end if;

  return jsonb_build_object('ok', true, 'campaign_id', c.id, 'campaign_code', c.code, 'from', v_from, 'to', c.status,
                            'went_live', v_live, 'ended', v_ended, 'today', v_today);
end;
$$;
revoke all on function public.app_campaign_tick_one(uuid) from public, anon, authenticated;
grant execute on function public.app_campaign_tick_one(uuid) to service_role;

-- ------------------------------------------------------------
-- app_campaign_tick() — 전체 스케줄러 틱 (크론 /api/cron/campaign-tick · partner-admin.mjs tick). 멱등.
--   대상: SCHEDULE_CONFIRMED · start_date ≤ 오늘  /  LIVE · end_date < 오늘  (0003 campaigns_period_idx 집합)
--   반환: { ok:true, today, went_live:n, ended:n, went_live_codes:[…], ended_codes:[…] }
-- ------------------------------------------------------------
create or replace function public.app_campaign_tick()
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  r        record;
  res      jsonb;
  v_live   text[] := '{}';
  v_ended  text[] := '{}';
begin
  for r in
    select id from public.campaigns
     where (status = 'SCHEDULE_CONFIRMED' and start_date is not null and start_date <= v_today)
        or (status = 'LIVE' and end_date is not null and end_date < v_today)
     order by start_date, code
  loop
    res := public.app_campaign_tick_one(r.id);
    if (res->>'went_live')::boolean then v_live := v_live || (res->>'campaign_code'); end if;
    if (res->>'ended')::boolean then v_ended := v_ended || (res->>'campaign_code'); end if;
  end loop;
  return jsonb_build_object('ok', true, 'today', v_today,
                            'went_live', coalesce(array_length(v_live, 1), 0), 'ended', coalesce(array_length(v_ended, 1), 0),
                            'went_live_codes', to_jsonb(v_live), 'ended_codes', to_jsonb(v_ended));
end;
$$;
revoke all on function public.app_campaign_tick() from public, anon, authenticated;
grant execute on function public.app_campaign_tick() to service_role;

-- ------------------------------------------------------------
-- brand_order_json(orders) — 브랜드 주문 표 1행 (발송 목적: 수취인·연락처·주소 원문 · 구매자 이메일은 마스킹)
-- ------------------------------------------------------------
create or replace function public.brand_order_json(o public.orders)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', o.id, 'code', o.code, 'status', o.status,
    'buyer_name', o.buyer_name,
    'buyer_phone', o.buyer_phone,
    'buyer_email', case when o.buyer_email is null then null
                        when position('@' in o.buyer_email) > 1
                          then left(o.buyer_email, 1) || '***' || substr(o.buyer_email, position('@' in o.buyer_email))
                        else '***' end,
    'qty', o.qty, 'unit_price', o.unit_price, 'amount', o.amount, 'option_name', o.option_name, 'order_name', o.order_name,
    'is_sample', o.is_sample,
    'shipping', o.shipping,
    'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at,
    'shipped', (o.status = 'PAID' and o.tracking_no is not null),
    'payment_method', o.payment_method, 'paid_at', o.paid_at,
    'refunded_at', o.refunded_at, 'refund_amount', o.refund_amount, 'refund_actor', o.refund_actor, 'refund_reason', o.refund_reason,
    'campaign', (select jsonb_build_object('id', c.id, 'code', c.code, 'status', c.status, 'start_date', c.start_date, 'end_date', c.end_date,
                   'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'emoji', p.emoji, 'thumb_url', p.thumb_url)
                                 from public.products p where p.id = c.product_id),
                   'seller', (select jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle)
                                from public.sellers s where s.id = c.seller_id))
                   from public.campaigns c where c.id = o.campaign_id))
$$;
revoke all on function public.brand_order_json(public.orders) from public, anon, authenticated;
grant execute on function public.brand_order_json(public.orders) to service_role;

-- ------------------------------------------------------------
-- app_brand_orders(p_brand_id, p_filter, p_campaign_id, p_limit) — 브랜드 주문 표 (is_sample 제외)
--   p_filter: 'all' | 'unshipped'(PAID · 송장 없음) | 'shipped'(PAID · 송장 있음) | 'refunded'(REFUNDED · CANCELED)
--   정렬: 미발송 PAID 먼저 → 주문일 최신순. 행은 p_limit(기본 500 · 최대 2000)까지, totals 는 필터 무관 전체 집계.
--   반환: { ok:true, filter, rows:[brand_order_json…], totals:{count, unshipped, shipped, refunded, paid_amount, refund_amount} }
--       | { ok:false, code:'BAD_FILTER' }
-- ------------------------------------------------------------
create or replace function public.app_brand_orders(p_brand_id uuid, p_filter text default 'all', p_campaign_id uuid default null, p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_filter text := lower(btrim(coalesce(p_filter, 'all')));
  v_limit  integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
  v_rows   jsonb;
  v_totals jsonb;
begin
  if v_filter not in ('all', 'unshipped', 'shipped', 'refunded') then
    return jsonb_build_object('ok', false, 'code', 'BAD_FILTER');
  end if;

  select coalesce(jsonb_agg(public.brand_order_json(o) order by
           (o.status = 'PAID' and o.tracking_no is null) desc, o.paid_at desc, o.code desc), '[]'::jsonb)
    into v_rows
    from (
      select o.*
        from public.orders o
        join public.campaigns c on c.id = o.campaign_id
       where c.brand_id = p_brand_id
         and not o.is_sample
         and (p_campaign_id is null or c.id = p_campaign_id)
         and case v_filter
               when 'unshipped' then o.status = 'PAID' and o.tracking_no is null
               when 'shipped'   then o.status = 'PAID' and o.tracking_no is not null
               when 'refunded'  then o.status in ('REFUNDED', 'CANCELED')
               else true end
       order by (o.status = 'PAID' and o.tracking_no is null) desc, o.paid_at desc, o.code desc
       limit v_limit
    ) o;

  select jsonb_build_object(
           'count', count(*),
           'unshipped', count(*) filter (where o.status = 'PAID' and o.tracking_no is null),
           'shipped', count(*) filter (where o.status = 'PAID' and o.tracking_no is not null),
           'refunded', count(*) filter (where o.status in ('REFUNDED', 'CANCELED')),
           'paid_amount', coalesce(sum(o.amount) filter (where o.status = 'PAID'), 0),
           'refund_amount', coalesce(sum(coalesce(o.refund_amount, o.amount)) filter (where o.status in ('REFUNDED', 'CANCELED')), 0))
    into v_totals
    from public.orders o
    join public.campaigns c on c.id = o.campaign_id
   where c.brand_id = p_brand_id
     and not o.is_sample
     and (p_campaign_id is null or c.id = p_campaign_id);

  return jsonb_build_object('ok', true, 'filter', v_filter, 'rows', v_rows, 'totals', v_totals);
end;
$$;
revoke all on function public.app_brand_orders(uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.app_brand_orders(uuid, text, uuid, integer) to service_role;

-- ------------------------------------------------------------
-- app_brand_ship_order(p_brand_id, p_order_id, p_courier, p_tracking_no) — 운송장 등록 · 정정 (상태 전이 없음)
--   PAID 주문만 · 내 캠페인 · 샘플 주문 제외 · 택배사 5개 · 송장 영숫자·하이픈 6~30자(숫자 포함) — 0015 app_brand_ship_sample 과 같은 검사
--   이미 송장이 있으면: 같은 값 → already(변경 없음) · 다른 값 → 덮어쓰기(replaced:true · shipped_at 갱신) — 정정 용도(계획서 §4)
--   반환: { ok:true, already:bool, replaced:bool, order_id, order_code, courier, tracking_no, shipped_at }
--       | { ok:false, code:'NOT_FOUND' } · { ok:false, code:'SAMPLE' } · { ok:false, code:'NOT_PAID', status }
--       | { ok:false, code:'BAD_COURIER' } · { ok:false, code:'BAD_TRACKING' }
-- ------------------------------------------------------------
create or replace function public.app_brand_ship_order(p_brand_id uuid, p_order_id uuid, p_courier text, p_tracking_no text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  ord        public.orders%rowtype;
  v_courier  text := btrim(coalesce(p_courier, ''));
  v_tracking text := regexp_replace(coalesce(p_tracking_no, ''), '\s', '', 'g');
  v_now      timestamptz := now();
begin
  select o.* into ord
    from public.orders o
    join public.campaigns c on c.id = o.campaign_id
   where o.id = p_order_id and c.brand_id = p_brand_id
     for update of o;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if ord.is_sample then
    return jsonb_build_object('ok', false, 'code', 'SAMPLE');
  end if;
  if ord.status <> 'PAID' then
    return jsonb_build_object('ok', false, 'code', 'NOT_PAID', 'status', ord.status);
  end if;
  if v_courier not in ('CJ대한통운', '우체국택배', '한진택배', '롯데택배', '로젠택배') then
    return jsonb_build_object('ok', false, 'code', 'BAD_COURIER');
  end if;
  if v_tracking !~ '^[A-Za-z0-9-]{6,30}$' or v_tracking !~ '\d' then
    return jsonb_build_object('ok', false, 'code', 'BAD_TRACKING');
  end if;
  if ord.tracking_no is not null and ord.tracking_no = v_tracking and ord.courier = v_courier then
    return jsonb_build_object('ok', true, 'already', true, 'replaced', false, 'order_id', ord.id, 'order_code', ord.code,
                              'courier', ord.courier, 'tracking_no', ord.tracking_no, 'shipped_at', ord.shipped_at);
  end if;

  update public.orders
     set courier = v_courier, tracking_no = v_tracking, shipped_at = v_now
   where id = ord.id;

  return jsonb_build_object('ok', true, 'already', false, 'replaced', ord.tracking_no is not null, 'order_id', ord.id, 'order_code', ord.code,
                            'courier', v_courier, 'tracking_no', v_tracking, 'shipped_at', v_now);
end;
$$;
revoke all on function public.app_brand_ship_order(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.app_brand_ship_order(uuid, uuid, text, text) to service_role;

-- ------------------------------------------------------------
-- app_brand_ship_orders(p_brand_id, p_rows) — 운송장 일괄 등록 (CSV 업로드). 행마다 {order_code, courier, tracking_no}.
--   주문번호는 대소문자 무시(화면·CSV 양식은 대문자 'O2001'). 실패 행은 code 로 돌려주고 나머지는 적용한다(부분 성공 · 한 트랜잭션이지만 예외 없음).
--   반환: { ok:true, applied:n, already:n, failed:n, results:[{order_code, ok, already?, code?, status?}] }
--       | { ok:false, code:'BAD_ROWS' }   배열이 아니거나 비었거나 500행 초과
-- ------------------------------------------------------------
create or replace function public.app_brand_ship_orders(p_brand_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  r         jsonb;
  v_code    text;
  v_oid     uuid;
  res       jsonb;
  results   jsonb := '[]'::jsonb;
  n_ok      integer := 0;
  n_already integer := 0;
  n_fail    integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 or jsonb_array_length(p_rows) > 500 then
    return jsonb_build_object('ok', false, 'code', 'BAD_ROWS');
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_code := btrim(coalesce(r->>'order_code', ''));
    if v_code = '' then
      results := results || jsonb_build_object('order_code', v_code, 'ok', false, 'code', 'NOT_FOUND');
      n_fail := n_fail + 1;
      continue;
    end if;
    select o.id into v_oid
      from public.orders o
      join public.campaigns c on c.id = o.campaign_id
     where c.brand_id = p_brand_id and lower(o.code) = lower(v_code)
     limit 1;
    if v_oid is null then
      results := results || jsonb_build_object('order_code', v_code, 'ok', false, 'code', 'NOT_FOUND');
      n_fail := n_fail + 1;
      continue;
    end if;
    res := public.app_brand_ship_order(p_brand_id, v_oid, r->>'courier', r->>'tracking_no');
    if (res->>'ok')::boolean then
      if (res->>'already')::boolean then n_already := n_already + 1; else n_ok := n_ok + 1; end if;
      results := results || jsonb_build_object('order_code', res->>'order_code', 'ok', true, 'already', (res->>'already')::boolean,
                                               'courier', res->>'courier', 'tracking_no', res->>'tracking_no');
    else
      n_fail := n_fail + 1;
      results := results || (jsonb_build_object('order_code', v_code, 'ok', false, 'code', res->>'code') || coalesce(jsonb_strip_nulls(jsonb_build_object('status', res->>'status')), '{}'::jsonb));
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'applied', n_ok, 'already', n_already, 'failed', n_fail, 'results', results);
end;
$$;
revoke all on function public.app_brand_ship_orders(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.app_brand_ship_orders(uuid, jsonb) to service_role;

-- ------------------------------------------------------------
-- app_brand_po_rows(p_brand_id, p_campaign_id) — 발주서 행 (CSV 는 앱 @sellery/db brand/order-rules poCsv 가 만든다 · BOM+CRLF)
--   대상: 내 캠페인의 PAID · 비샘플 주문 (p_campaign_id null 이면 브랜드 전체). 발송 여부와 무관(송장 열로 표시).
--   부수 효과: 대상 캠페인 가운데 po_exported_at 이 비어 있으면 now() 로 채우고 이벤트 po_sent 1행(캠페인당 1회). 재호출은 이벤트 없음.
--   반환: { ok:true, exported_at, campaigns:[{id, code, product_name, seller_handle, first_export:bool}], rows:[{order_code, paid_at, recipient, phone, postcode,
--           address1, address2, memo, product_name, option_name, qty, amount, campaign_code, seller_handle, courier, tracking_no}] }
--       | { ok:false, code:'NOT_FOUND' }   p_campaign_id 가 내 캠페인이 아님
-- ------------------------------------------------------------
create or replace function public.app_brand_po_rows(p_brand_id uuid, p_campaign_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_now   timestamptz := now();
  v_camps jsonb := '[]'::jsonb;
  v_rows  jsonb;
  r       record;
  v_first boolean;
begin
  if p_campaign_id is not null and not exists (select 1 from public.campaigns where id = p_campaign_id and brand_id = p_brand_id) then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  for r in
    select c.id, c.code, c.po_exported_at, p.name as product_name, s.handle as seller_handle
      from public.campaigns c
      join public.products p on p.id = c.product_id
      join public.sellers s on s.id = c.seller_id
     where c.brand_id = p_brand_id
       and (p_campaign_id is null or c.id = p_campaign_id)
       and exists (select 1 from public.orders o where o.campaign_id = c.id and o.status = 'PAID' and not o.is_sample)
     order by c.start_date nulls last, c.code
  loop
    v_first := r.po_exported_at is null;
    if v_first then
      update public.campaigns set po_exported_at = v_now where id = r.id;
      -- 프로토타입 endCamp/poEmail 의 "📦 최종 발주서 … 발송" 을 첫 내보내기 기록으로
      insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
      values (r.id, 'system', 'system', 'system', '발주서 내보내기 — 브랜드가 주문·수취인 목록을 내려받았습니다', 'po_sent',
              jsonb_build_object('exported_at', v_now));
    end if;
    v_camps := v_camps || jsonb_build_object('id', r.id, 'code', r.code, 'product_name', r.product_name, 'seller_handle', r.seller_handle, 'first_export', v_first);
  end loop;

  select coalesce(jsonb_agg(jsonb_build_object(
           'order_code', o.code,
           'paid_at', o.paid_at,
           'recipient', coalesce(o.shipping->>'recipient', o.buyer_name),
           'phone', coalesce(o.shipping->>'phone', o.buyer_phone),
           'postcode', o.shipping->>'postcode',
           'address1', o.shipping->>'address1',
           'address2', o.shipping->>'address2',
           'memo', o.shipping->>'memo',
           'product_name', p.name,
           'option_name', o.option_name,
           'qty', o.qty,
           'unit_price', o.unit_price,
           'amount', o.amount,
           'campaign_code', c.code,
           'seller_handle', s.handle,
           'courier', o.courier,
           'tracking_no', o.tracking_no)
           order by c.code, o.paid_at, o.code), '[]'::jsonb)
    into v_rows
    from public.orders o
    join public.campaigns c on c.id = o.campaign_id
    join public.products p on p.id = c.product_id
    join public.sellers s on s.id = c.seller_id
   where c.brand_id = p_brand_id
     and (p_campaign_id is null or c.id = p_campaign_id)
     and o.status = 'PAID' and not o.is_sample;

  return jsonb_build_object('ok', true, 'exported_at', v_now, 'campaigns', v_camps, 'rows', v_rows);
end;
$$;
revoke all on function public.app_brand_po_rows(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_brand_po_rows(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_refund_precheck(p_brand_id, p_order_id) — 브랜드 환불 가드 (토스 취소 전 · 상태 변경 없음)
--   소유(내 캠페인) → NOT_FOUND · 샘플 → SAMPLE · **발송 후 → SHIPPED**(브랜드도 원클릭 환불은 발송 전만 — 발송 후는 교환·반품 CS 로. 계획서 §4 "발송 후도 가능" 대신 채택한 결정,
--   @sellery/db order-status isRefundable 과 같은 순서) · 그 뒤 0008 app_refund_precheck(p_order_id, 'brand')(PAID · 캠페인 ≠ SETTLED · payment_key).
--   기록은 앱이 토스 취소 뒤 0008 app_refund_record(order, 'brand', …) 로 남긴다(orders → REFUNDED · 이벤트 refunded · refund_actor='brand').
--   반환: 0008 과 동일 { ok:true, order_code, amount, payment_key, campaign_status } | { ok:false, code:'NOT_FOUND'|'SAMPLE'|'SHIPPED'|'SETTLED'|'REFUNDED'|'CANCELED'|'BAD_ACTOR' }
-- ------------------------------------------------------------
create or replace function public.app_brand_refund_precheck(p_brand_id uuid, p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  ord public.orders%rowtype;
begin
  select o.* into ord
    from public.orders o
    join public.campaigns c on c.id = o.campaign_id
   where o.id = p_order_id and c.brand_id = p_brand_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if ord.status <> 'PAID' then
    return jsonb_build_object('ok', false, 'code', ord.status);
  end if;
  if ord.is_sample then
    return jsonb_build_object('ok', false, 'code', 'SAMPLE');
  end if;
  if ord.tracking_no is not null then
    return jsonb_build_object('ok', false, 'code', 'SHIPPED');
  end if;
  return public.app_refund_precheck(p_order_id, 'brand');
end;
$$;
revoke all on function public.app_brand_refund_precheck(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_brand_refund_precheck(uuid, uuid) to service_role;

-- ============================================================
-- 고객 문의 (CS) — 0005 cs_conversations / cs_messages. 브랜드로 직행 · 관리자 열람은 이후.
-- ============================================================

-- 대화 1건 json — 브랜드 목록·상세 · 고객 스레드 공용. client_token 은 싣지 않는다(접수 응답에서만 1회 노출).
create or replace function public.cs_conversation_json(x public.cs_conversations)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', x.id, 'code', x.code, 'status', x.status, 'type', x.type,
    'buyer_name', x.buyer_name, 'order_code', x.order_code, 'order_id', x.order_id,
    'order', (select jsonb_build_object('code', o.code, 'status', o.status, 'qty', o.qty, 'amount', o.amount, 'option_name', o.option_name,
                                        'courier', o.courier, 'tracking_no', o.tracking_no, 'shipped_at', o.shipped_at, 'paid_at', o.paid_at)
                from public.orders o where o.id = x.order_id),
    'is_member', x.user_id is not null,
    'last_preview', x.last_preview, 'last_message_at', x.last_message_at,
    'replied_at', x.replied_at, 'closed_at', x.closed_at, 'created_at', x.created_at, 'updated_at', x.updated_at,
    'message_count', (select count(*) from public.cs_messages m where m.conversation_id = x.id),
    'campaign', (select jsonb_build_object('id', c.id, 'code', c.code, 'status', c.status,
                   'brand', (select jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name) from public.brands b where b.id = c.brand_id),
                   'product', (select jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'emoji', p.emoji, 'thumb_url', p.thumb_url)
                                 from public.products p where p.id = c.product_id),
                   'seller', (select jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle)
                                from public.sellers s where s.id = c.seller_id))
                   from public.campaigns c where c.id = x.campaign_id))
$$;
revoke all on function public.cs_conversation_json(public.cs_conversations) from public, anon, authenticated;
grant execute on function public.cs_conversation_json(public.cs_conversations) to service_role;

create or replace function public.cs_message_json(m public.cs_messages)
returns jsonb
language sql immutable
set search_path = public
as $$
  select jsonb_build_object('id', m.id, 'conversation_id', m.conversation_id, 'sender', m.sender, 'actor_role', m.actor_role,
                            'body', m.body, 'created_at', m.created_at)
$$;
revoke all on function public.cs_message_json(public.cs_messages) from public, anon, authenticated;
grant execute on function public.cs_message_json(public.cs_messages) to service_role;

-- 스레드 = 대화 + 메시지 시간순
create or replace function public.cs_thread_json(x public.cs_conversations)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'conversation', public.cs_conversation_json(x),
    'messages', coalesce((select jsonb_agg(public.cs_message_json(m) order by m.created_at, m.id)
                            from public.cs_messages m where m.conversation_id = x.id), '[]'::jsonb))
$$;
revoke all on function public.cs_thread_json(public.cs_conversations) from public, anon, authenticated;
grant execute on function public.cs_thread_json(public.cs_conversations) to service_role;

-- 본문 정규화 — 제어문자 제거(개행·탭 유지) · 앞뒤 공백 · 연속 빈 줄 축소. 비면 ''.
create or replace function public.cs_normalize_body(p_body text)
returns text
language sql immutable
as $$
  select btrim(regexp_replace(regexp_replace(coalesce(p_body, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'),
                              '\n{3,}', E'\n\n', 'g'))
$$;
revoke all on function public.cs_normalize_body(text) from public, anon, authenticated;
grant execute on function public.cs_normalize_body(text) to service_role;

-- ------------------------------------------------------------
-- app_cs_open(p_campaign_id, p_customer_id, p_user_id, p_buyer_name, p_type, p_body, p_order_code) — 고객 문의 접수 (shop 짝)
--   캠페인 LIVE · CLEARING · SETTLED 만(판매 링크가 살아 있거나 판매한 적이 있는 캠페인) → 그 외 WRONG_STATUS{status} · 없는 id NOT_FOUND
--   p_type ∈ CS_TYPES(0005 제약) → BAD_TYPE · p_body 1~2000자(정규화 후) → BAD_BODY{max} · p_buyer_name ≤ 40(비면 '고객')
--   p_order_code: 원문 보관(≤ 32자) + 같은 캠페인의 orders.code 와 대소문자 무시로 해석 → order_id (못 찾으면 null · 실패 아님)
--   brand_id 는 캠페인에서 파생(csBrandId). 이벤트 cs_received. 반환의 client_token 은 비회원 조회 비밀값 — 응답 뒤 앱이 쿠키/로컬에 보관.
--   반환: { ok:true, conversation_id, conversation_code, client_token, brand_id, brand_name, order_id, order_matched:bool }
--       | { ok:false, code:'NOT_FOUND' | 'WRONG_STATUS'(status) | 'BAD_TYPE' | 'BAD_BODY'(max) }
-- ------------------------------------------------------------
create or replace function public.app_cs_open(p_campaign_id uuid, p_customer_id uuid, p_user_id uuid, p_buyer_name text, p_type text, p_body text,
                                              p_order_code text default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c        public.campaigns%rowtype;
  v_body   text := public.cs_normalize_body(p_body);
  v_type   text := btrim(coalesce(p_type, ''));
  v_name   text := nullif(left(regexp_replace(btrim(coalesce(p_buyer_name, '')), '\s+', ' ', 'g'), 40), '');
  v_ocode  text := nullif(left(btrim(coalesce(p_order_code, '')), 32), '');
  v_oid    uuid;
  v_brand  text;
  x        public.cs_conversations%rowtype;
begin
  select * into c from public.campaigns where id = p_campaign_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if c.status not in ('LIVE', 'CLEARING', 'SETTLED') then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;
  if v_type not in ('배송 문의', '교환·반품', '상품 문의', '기타') then
    return jsonb_build_object('ok', false, 'code', 'BAD_TYPE');
  end if;
  if v_body = '' or char_length(v_body) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'BAD_BODY', 'max', 2000);
  end if;

  if v_ocode is not null then
    select id into v_oid from public.orders where campaign_id = c.id and lower(code) = lower(v_ocode) limit 1;
  end if;

  insert into public.cs_conversations (campaign_id, brand_id, order_code, order_id, customer_id, user_id, buyer_name, type, status, last_preview, last_message_at)
  values (c.id, c.brand_id, v_ocode, v_oid, p_customer_id, p_user_id, coalesce(v_name, '고객'), v_type, 'OPEN', left(v_body, 80), now())
  returning * into x;

  insert into public.cs_messages (conversation_id, sender, actor_role, actor_user_id, body)
  values (x.id, 'customer', 'customer', p_user_id, v_body);

  select name into v_brand from public.brands where id = c.brand_id;

  -- 프로토타입 submitCS 의 pushSys 원문(<b> 제거)
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (c.id, 'system', 'system', 'system',
          format('구매 고객이 %s 문의를 남겼습니다 — %s 고객 문의함으로 전달되었습니다', v_type, coalesce(v_brand, '브랜드')),
          'cs_received',
          jsonb_strip_nulls(jsonb_build_object('conversation_id', x.id, 'conversation_code', x.code, 'type', v_type, 'order_code', v_ocode, 'order_matched', v_oid is not null)));

  return jsonb_build_object('ok', true, 'conversation_id', x.id, 'conversation_code', x.code, 'client_token', x.client_token,
                            'brand_id', c.brand_id, 'brand_name', v_brand, 'order_id', v_oid, 'order_matched', v_oid is not null);
end;
$$;
revoke all on function public.app_cs_open(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.app_cs_open(uuid, uuid, uuid, text, text, text, text) to service_role;

-- 고객 측 대화 찾기 — code + (client_token 일치 또는 user_id 일치). 없으면 null.
create or replace function public.cs_find_for_customer(p_conversation_code text, p_client_token uuid, p_user_id uuid)
returns public.cs_conversations
language sql stable
set search_path = public
as $$
  select x.* from public.cs_conversations x
   where lower(x.code) = lower(btrim(coalesce(p_conversation_code, '')))
     and ((p_client_token is not null and x.client_token = p_client_token)
       or (p_user_id is not null and x.user_id = p_user_id))
   limit 1
$$;
revoke all on function public.cs_find_for_customer(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.cs_find_for_customer(text, uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_cs_thread(p_conversation_code, p_client_token, p_user_id) — 고객이 자기 문의 스레드 읽기 (토큰 또는 회원 user_id)
--   반환: cs_thread_json | null(NOT_FOUND — 코드·토큰 불일치를 구분하지 않는다)
-- ------------------------------------------------------------
create or replace function public.app_cs_thread(p_conversation_code text, p_client_token uuid default null, p_user_id uuid default null)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select public.cs_thread_json(x) from public.cs_find_for_customer(p_conversation_code, p_client_token, p_user_id) x where x.id is not null
$$;
revoke all on function public.app_cs_thread(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_cs_thread(text, uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_cs_list_for_user(p_user_id) — 회원 고객의 문의 목록 (/account/orders "판매자 문의" 행) — 최신순 · 최대 100
-- ------------------------------------------------------------
create or replace function public.app_cs_list_for_user(p_user_id uuid)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select coalesce((select jsonb_agg(public.cs_conversation_json(x) order by x.last_message_at desc)
                     from (select * from public.cs_conversations where user_id = p_user_id order by last_message_at desc limit 100) x), '[]'::jsonb)
$$;
revoke all on function public.app_cs_list_for_user(uuid) from public, anon, authenticated;
grant execute on function public.app_cs_list_for_user(uuid) to service_role;

-- ------------------------------------------------------------
-- app_cs_customer_reply(p_conversation_code, p_client_token, p_user_id, p_body) — 고객 추가 문의 (ANSWERED → OPEN · OPEN 유지)
--   CLOSED 면 거부(CLOSED) — 새 문의로 접수하도록 안내. 본문 1~2000자.
--   반환: { ok:true, conversation_id, conversation_code, status:'OPEN', message } | { ok:false, code:'NOT_FOUND' | 'CLOSED' | 'BAD_BODY'(max) }
-- ------------------------------------------------------------
create or replace function public.app_cs_customer_reply(p_conversation_code text, p_client_token uuid, p_user_id uuid, p_body text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  x       public.cs_conversations%rowtype;
  v_body  text := public.cs_normalize_body(p_body);
  m       public.cs_messages%rowtype;
begin
  select * into x from public.cs_find_for_customer(p_conversation_code, p_client_token, p_user_id);
  if x.id is null then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  perform 1 from public.cs_conversations where id = x.id for update;
  if x.status = 'CLOSED' then
    return jsonb_build_object('ok', false, 'code', 'CLOSED');
  end if;
  if v_body = '' or char_length(v_body) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'BAD_BODY', 'max', 2000);
  end if;

  insert into public.cs_messages (conversation_id, sender, actor_role, actor_user_id, body)
  values (x.id, 'customer', 'customer', p_user_id, v_body)
  returning * into m;

  update public.cs_conversations
     set status = 'OPEN', last_preview = left(v_body, 80), last_message_at = m.created_at
   where id = x.id;

  return jsonb_build_object('ok', true, 'conversation_id', x.id, 'conversation_code', x.code, 'status', 'OPEN', 'message', public.cs_message_json(m));
end;
$$;
revoke all on function public.app_cs_customer_reply(text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_cs_customer_reply(text, uuid, uuid, text) to service_role;

-- ------------------------------------------------------------
-- app_brand_cs_list(p_brand_id, p_status) — 브랜드 문의함. p_status null 이면 전부(OPEN 먼저 → 최근 메시지순), 아니면 그 상태만. 최대 500.
--   반환: [cs_conversation_json…]
-- ------------------------------------------------------------
create or replace function public.app_brand_cs_list(p_brand_id uuid, p_status text default null)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select coalesce((select jsonb_agg(public.cs_conversation_json(x)
                                    order by (x.status = 'OPEN') desc, (x.status = 'ANSWERED') desc, x.last_message_at desc)
                     from (select * from public.cs_conversations
                            where brand_id = p_brand_id and (p_status is null or status = p_status)
                            order by (status = 'OPEN') desc, (status = 'ANSWERED') desc, last_message_at desc
                            limit 500) x), '[]'::jsonb)
$$;
revoke all on function public.app_brand_cs_list(uuid, text) from public, anon, authenticated;
grant execute on function public.app_brand_cs_list(uuid, text) to service_role;

-- ------------------------------------------------------------
-- app_brand_cs_thread(p_brand_id, p_conversation_id) — 브랜드 문의 상세(대화 + 메시지). 남의 것·없는 id 는 null(라우트 404).
-- ------------------------------------------------------------
create or replace function public.app_brand_cs_thread(p_brand_id uuid, p_conversation_id uuid)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select public.cs_thread_json(x) from public.cs_conversations x where x.id = p_conversation_id and x.brand_id = p_brand_id
$$;
revoke all on function public.app_brand_cs_thread(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_brand_cs_thread(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_cs_reply(p_brand_id, p_conversation_id, p_actor_user_id, p_body) — 브랜드 답변 → ANSWERED · replied_at · last_preview · 이벤트 cs_replied
--   CLOSED 면 거부(CLOSED — 종료된 문의는 답변 불가 · 필요하면 고객이 새 문의). ANSWERED 에서 추가 답변도 허용(답변 수정 대신 메시지 추가).
--   반환: { ok:true, conversation_id, conversation_code, status:'ANSWERED', message } | { ok:false, code:'NOT_FOUND' | 'CLOSED' | 'BAD_BODY'(max) }
-- ------------------------------------------------------------
create or replace function public.app_brand_cs_reply(p_brand_id uuid, p_conversation_id uuid, p_actor_user_id uuid, p_body text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  x       public.cs_conversations%rowtype;
  v_body  text := public.cs_normalize_body(p_body);
  m       public.cs_messages%rowtype;
begin
  select * into x from public.cs_conversations where id = p_conversation_id and brand_id = p_brand_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if x.status = 'CLOSED' then
    return jsonb_build_object('ok', false, 'code', 'CLOSED');
  end if;
  if v_body = '' or char_length(v_body) > 2000 then
    return jsonb_build_object('ok', false, 'code', 'BAD_BODY', 'max', 2000);
  end if;

  insert into public.cs_messages (conversation_id, sender, actor_role, actor_user_id, body)
  values (x.id, 'brand', 'brand', p_actor_user_id, v_body)
  returning * into m;

  update public.cs_conversations
     set status = 'ANSWERED', replied_at = m.created_at, last_preview = left(v_body, 80), last_message_at = m.created_at
   where id = x.id;

  -- 프로토타입 saveCSReply 의 pushSys 원문
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (x.campaign_id, 'system', 'system', 'brand',
          format('브랜드가 고객 문의에 답변했습니다 (%s)', x.type),
          'cs_replied',
          jsonb_build_object('conversation_id', x.id, 'conversation_code', x.code, 'type', x.type));

  return jsonb_build_object('ok', true, 'conversation_id', x.id, 'conversation_code', x.code, 'status', 'ANSWERED', 'message', public.cs_message_json(m));
end;
$$;
revoke all on function public.app_brand_cs_reply(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_brand_cs_reply(uuid, uuid, uuid, text) to service_role;

-- ------------------------------------------------------------
-- app_brand_cs_close(p_brand_id, p_conversation_id) — 처리 종료 → CLOSED · closed_at. 멱등(already).
--   반환: { ok:true, already:bool, conversation_id, conversation_code, status:'CLOSED' } | { ok:false, code:'NOT_FOUND' }
-- ------------------------------------------------------------
create or replace function public.app_brand_cs_close(p_brand_id uuid, p_conversation_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  x public.cs_conversations%rowtype;
begin
  select * into x from public.cs_conversations where id = p_conversation_id and brand_id = p_brand_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if x.status = 'CLOSED' then
    return jsonb_build_object('ok', true, 'already', true, 'conversation_id', x.id, 'conversation_code', x.code, 'status', x.status);
  end if;
  update public.cs_conversations set status = 'CLOSED', closed_at = now() where id = x.id;
  return jsonb_build_object('ok', true, 'already', false, 'conversation_id', x.id, 'conversation_code', x.code, 'status', 'CLOSED');
end;
$$;
revoke all on function public.app_brand_cs_close(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_brand_cs_close(uuid, uuid) to service_role;
