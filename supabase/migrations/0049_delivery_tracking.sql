-- ============================================================
-- 0049 — 택배 자동 추적 (스마트택배 API · 대표 결정 2026-10-08)
--
-- 배경: 샘플(캠페인 SAMPLE_SHIPPED)과 고객 주문(PAID + 송장)은 "배송 완료" 를 아무도 기록하지 않았다.
--   · 샘플은 인플루언서가 [수령 확인] 을 눌러야 TESTING 으로 넘어가는데, 받고도 안 누르면 브랜드가 기다린다.
--   · 고객 주문은 캠페인이 SETTLED 가 되기 전까지 화면이 '배송 중' 이다(order-status.ts shipLabel).
--   → 매시 크론(shop `/api/cron/tracking`)이 스마트택배(info.sweettracker.co.kr) 에 송장을 조회해
--     (a) 샘플 배송 완료 → `app_receive_sample` 와 같은 전이를 **actor system** 으로 자동 실행(TESTING · test_due)
--     (b) 주문 배송 완료 → `orders.delivered_at` 기록 → 고객·브랜드 화면 '배송 완료'
--     마지막 조회 스냅샷(tracking_status · tracking_last · tracking_checked_at)을 두 표에 남겨 화면이 API 없이 그린다.
--
-- 호출 절약(요금제 월 5,000회 · 다른 서비스와 공유 · 2026-10-08 확인): 발송 ≤ 14일 · 배송 중 소포당 3시간에 1회(하루 ≤8회) · NOT_FOUND 는 6시간
--   · 완료·14일 경과(TIMEOUT) 면 중단. 크론은 매시 돌지만 간격은 여기서 판정한다.
--   스마트택배 호출 자체는 앱(packages/db/src/server/tracking.server.ts)이 한다 — DB 는 "조회 대상 고르기" 와 "결과 기록 + 전이" 만.
--
-- 컬럼 (두 표 같은 이름)
--   tracking_status      'IN_TRANSIT' · 'DELIVERED' · 'NOT_FOUND'(택배사 미등록 송장 — 발송 직후 흔함) · 'ERROR'(API 오류) · 'TIMEOUT'(14일 경과 — 더 조회하지 않음)
--   tracking_last        마지막 배송 이벤트 {at, where, kind, level} (화면 "배송 중 · 간선상차 · 서울집중 (10/8 14:00)")
--   tracking_checked_at  마지막 조회 시각(조회 간격 판정)
--   orders.delivered_at · campaigns.sample_delivered_at   배송 완료 시각(택배사 기준 · 없으면 조회 시각)
--   송장을 정정하면(tracking_no 변경) 트리거가 스냅샷·완료 시각을 비워 다시 조회한다.
--
-- 함수 (service_role 만)
--   app_tracking_due(p_limit, p_max_age_days)   14일 경과분을 TIMEOUT 으로 닫고, 조회할 소포(샘플 먼저 · 오래 안 본 순)를 돌려준다
--   app_tracking_record(p_kind, p_id, p_status, p_last, p_delivered_at, p_source)   스냅샷 기록 + DELIVERED 면 샘플 → TESTING / 주문 → delivered_at
--     샘플 전이는 0011 app_receive_sample 와 같은 규칙(test_due = KST 오늘 + platform_settings.test_days(기본 14)) · 이벤트 sample_received{auto:true, source}
--     · 수동 [수령 확인] 은 그대로 남아 먼저 누르면(TESTING) already 로 끝난다(멱등).
-- 실행: 0048 이후. 재실행 가능.
-- ============================================================

-- ------------------------------------------------------------
-- 컬럼
-- ------------------------------------------------------------
alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders add column if not exists tracking_status text;
alter table public.orders add column if not exists tracking_last jsonb;
alter table public.orders add column if not exists tracking_checked_at timestamptz;
alter table public.orders drop constraint if exists orders_tracking_status_check;
alter table public.orders add constraint orders_tracking_status_check
  check (tracking_status is null or tracking_status in ('IN_TRANSIT', 'DELIVERED', 'NOT_FOUND', 'ERROR', 'TIMEOUT'));
comment on column public.orders.delivered_at is '택배 배송 완료 시각 (0049 스마트택배 자동 추적 · 택배사 이벤트 시각, 없으면 조회 시각)';
comment on column public.orders.tracking_status is '마지막 추적 상태 IN_TRANSIT·DELIVERED·NOT_FOUND·ERROR·TIMEOUT (0049)';
comment on column public.orders.tracking_last is '마지막 배송 이벤트 {at, where, kind, level} (0049)';
comment on column public.orders.tracking_checked_at is '마지막 추적 조회 시각 (0049 · 조회 간격 판정)';

alter table public.campaigns add column if not exists sample_delivered_at timestamptz;
alter table public.campaigns add column if not exists tracking_status text;
alter table public.campaigns add column if not exists tracking_last jsonb;
alter table public.campaigns add column if not exists tracking_checked_at timestamptz;
alter table public.campaigns drop constraint if exists campaigns_tracking_status_check;
alter table public.campaigns add constraint campaigns_tracking_status_check
  check (tracking_status is null or tracking_status in ('IN_TRANSIT', 'DELIVERED', 'NOT_FOUND', 'ERROR', 'TIMEOUT'));
comment on column public.campaigns.sample_delivered_at is '샘플 택배 배송 완료 시각 (0049 · 자동 수령 전이의 근거)';
comment on column public.campaigns.tracking_status is '샘플 송장 마지막 추적 상태 (0049)';
comment on column public.campaigns.tracking_last is '샘플 송장 마지막 배송 이벤트 {at, where, kind, level} (0049)';
comment on column public.campaigns.tracking_checked_at is '샘플 송장 마지막 추적 조회 시각 (0049)';

-- 조회 대상 선별용 부분 인덱스 — 미완료 소포만
create index if not exists orders_tracking_due_idx on public.orders (tracking_checked_at)
  where status = 'PAID' and tracking_no is not null and delivered_at is null and (tracking_status is null or tracking_status <> 'TIMEOUT');
create index if not exists campaigns_tracking_due_idx on public.campaigns (tracking_checked_at)
  where status = 'SAMPLE_SHIPPED' and tracking_no is not null and (tracking_status is null or tracking_status <> 'TIMEOUT');

-- 송장 정정(브랜드 [수정] · app_brand_ship_order replaced · app_brand_ship_sample 재발송) → 스냅샷 초기화
create or replace function public.tracking_reset_on_tracking_no_change()
returns trigger
language plpgsql
as $$
begin
  if new.tracking_no is distinct from old.tracking_no then
    new.tracking_status := null;
    new.tracking_last := null;
    new.tracking_checked_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_tracking_reset on public.orders;
create trigger orders_tracking_reset
  before update of tracking_no on public.orders
  for each row execute function public.tracking_reset_on_tracking_no_change();

drop trigger if exists campaigns_tracking_reset on public.campaigns;
create trigger campaigns_tracking_reset
  before update of tracking_no on public.campaigns
  for each row execute function public.tracking_reset_on_tracking_no_change();

-- ------------------------------------------------------------
-- app_tracking_due — 조회 대상
--   1) 발송 뒤 p_max_age_days 지난 미완료 소포는 TIMEOUT 으로 닫는다(더 조회하지 않음 · 화면은 송장 조회 링크만)
--   2) 샘플(SAMPLE_SHIPPED · 송장 있음) → 주문(PAID · 송장 있음 · 미완료) 순으로, 한 번도 안 봤거나 간격이 지난 것만
--      간격: 기본 3시간(배송 중 · 하루 ≤8회) · NOT_FOUND 는 6시간(택배사 등록 전 송장 — 반복 호출 낭비 방지). 매시 크론 + 55분 여유 = 정각 어긋남 흡수
--   반환 {ok, timed_out:{samples, orders}, samples:[{kind:'sample', id, code, courier, tracking_no, shipped_at, tracking_status}], orders:[…]}
-- ------------------------------------------------------------
create or replace function public.app_tracking_due(p_limit integer default 50, p_max_age_days integer default 14)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_limit     integer := greatest(1, least(coalesce(p_limit, 50), 500));
  v_age       interval := make_interval(days => greatest(1, coalesce(p_max_age_days, 14)));
  v_to_s      integer := 0;
  v_to_o      integer := 0;
  v_samples   jsonb;
  v_orders    jsonb;
  v_left      integer;
begin
  -- 1) TIMEOUT
  with t as (
    update public.campaigns c
       set tracking_status = 'TIMEOUT', tracking_checked_at = now()
     where c.status = 'SAMPLE_SHIPPED' and c.tracking_no is not null
       and coalesce(c.tracking_status, '') <> 'TIMEOUT'
       and coalesce(c.sample_shipped_at, c.updated_at) < now() - v_age
     returning 1)
  select count(*) into v_to_s from t;

  with t as (
    update public.orders o
       set tracking_status = 'TIMEOUT', tracking_checked_at = now()
     where o.status = 'PAID' and o.tracking_no is not null and o.delivered_at is null
       and coalesce(o.tracking_status, '') <> 'TIMEOUT'
       and coalesce(o.shipped_at, o.updated_at) < now() - v_age
     returning 1)
  select count(*) into v_to_o from t;

  -- 2) 샘플 먼저
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', 'sample', 'id', c.id, 'code', c.code, 'courier', c.sample_courier, 'tracking_no', c.tracking_no,
           'shipped_at', coalesce(c.sample_shipped_at, c.updated_at), 'tracking_status', c.tracking_status)
         order by c.tracking_checked_at nulls first, c.sample_shipped_at), '[]'::jsonb)
    into v_samples
    from (
      select c.*
        from public.campaigns c
       where c.status = 'SAMPLE_SHIPPED' and c.tracking_no is not null
         and coalesce(c.tracking_status, '') <> 'TIMEOUT'
         and (c.tracking_checked_at is null
              or c.tracking_checked_at < now() - (case when c.tracking_status = 'NOT_FOUND' then interval '6 hours' else interval '2 hours 55 minutes' end))
       order by c.tracking_checked_at nulls first, c.sample_shipped_at
       limit v_limit) c;

  v_left := v_limit - jsonb_array_length(v_samples);

  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', 'order', 'id', o.id, 'code', o.code, 'courier', o.courier, 'tracking_no', o.tracking_no,
           'shipped_at', coalesce(o.shipped_at, o.updated_at), 'tracking_status', o.tracking_status)
         order by o.tracking_checked_at nulls first, o.shipped_at), '[]'::jsonb)
    into v_orders
    from (
      select o.*
        from public.orders o
       where o.status = 'PAID' and o.tracking_no is not null and o.delivered_at is null
         and coalesce(o.tracking_status, '') <> 'TIMEOUT'
         and (o.tracking_checked_at is null
              or o.tracking_checked_at < now() - (case when o.tracking_status = 'NOT_FOUND' then interval '6 hours' else interval '2 hours 55 minutes' end))
       order by o.tracking_checked_at nulls first, o.shipped_at
       limit greatest(v_left, 0)) o;

  return jsonb_build_object('ok', true,
    'timed_out', jsonb_build_object('samples', v_to_s, 'orders', v_to_o),
    'samples', v_samples, 'orders', v_orders);
end;
$$;
revoke all on function public.app_tracking_due(integer, integer) from public, anon, authenticated;
grant execute on function public.app_tracking_due(integer, integer) to service_role;

-- ------------------------------------------------------------
-- app_tracking_record — 조회 결과 기록 (+ 배송 완료 처리)
--   p_kind 'sample' | 'order' · p_status IN_TRANSIT·DELIVERED·NOT_FOUND·ERROR · p_last {at, where, kind, level} · p_delivered_at 택배사 완료 시각(없으면 now())
--   sample + DELIVERED: SAMPLE_SHIPPED → TESTING (0011 app_receive_sample 와 같은 규칙 · actor system · payload {auto:true, source})
--     이미 TESTING 이상(수동 수령 확인이 먼저)이면 스냅샷만 남기고 already
--   order  + DELIVERED: delivered_at 이 비어 있을 때만 기록(newly_delivered)
--   반환 {ok, kind, code, status, delivered, newly_delivered, transitioned, already, test_due}
-- ------------------------------------------------------------
create or replace function public.app_tracking_record(
  p_kind text, p_id uuid, p_status text, p_last jsonb default null, p_delivered_at timestamptz default null, p_source text default 'sweettracker')
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c          public.campaigns%rowtype;
  o          public.orders%rowtype;
  v_status   text := upper(coalesce(p_status, ''));
  v_deliv    boolean;
  v_at       timestamptz := coalesce(p_delivered_at, now());
  v_days     integer;
  v_due      date;
  v_newly    boolean := false;
  v_trans    boolean := false;
  v_already  boolean := false;
begin
  if v_status not in ('IN_TRANSIT', 'DELIVERED', 'NOT_FOUND', 'ERROR') then
    return jsonb_build_object('ok', false, 'code', 'BAD_STATUS', 'status', p_status);
  end if;
  v_deliv := v_status = 'DELIVERED';

  if p_kind = 'order' then
    select * into o from public.orders where id = p_id for update;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;
    v_newly := v_deliv and o.delivered_at is null;
    update public.orders
       set tracking_status = v_status, tracking_last = p_last, tracking_checked_at = now(),
           delivered_at = case when v_newly then v_at else delivered_at end
     where id = o.id;
    return jsonb_build_object('ok', true, 'kind', 'order', 'code', o.code, 'status', v_status,
      'delivered', v_deliv, 'newly_delivered', v_newly, 'transitioned', false, 'already', false);
  end if;

  if p_kind <> 'sample' then
    return jsonb_build_object('ok', false, 'code', 'BAD_KIND', 'kind', p_kind);
  end if;

  select * into c from public.campaigns where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  v_newly := v_deliv and c.sample_delivered_at is null;
  update public.campaigns
     set tracking_status = v_status, tracking_last = p_last, tracking_checked_at = now(),
         sample_delivered_at = case when v_newly then v_at else sample_delivered_at end
   where id = c.id;

  if not v_deliv then
    return jsonb_build_object('ok', true, 'kind', 'sample', 'code', c.code, 'status', v_status,
      'delivered', false, 'newly_delivered', false, 'transitioned', false, 'already', false);
  end if;

  if c.status <> 'SAMPLE_SHIPPED' then
    -- 수동 [수령 확인] 이 먼저였거나(TESTING~) 그 사이 종결(DECLINED …) — 전이 없이 스냅샷만
    v_already := true;
  else
    -- TEST_DAYS(packages/core/src/constants.ts 14) · 0011 은 상수 14 — platform_settings.test_days 가 있으면 그 값(안내 문구와 같은 소스)
    select case when jsonb_typeof(ps.value) = 'number' then (ps.value)::text::integer else null end
      into v_days
      from public.platform_settings ps where ps.key = 'test_days';
    v_days := coalesce(v_days, 14);
    v_due := (now() at time zone 'Asia/Seoul')::date + v_days;

    update public.campaigns
       set status = 'TESTING', received_at = now(), test_due = v_due
     where id = c.id;

    insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
    values (c.id, 'system', 'system', 'system',
            format('택배 배송 완료가 확인돼 테스트 단계로 넘어갔어요 · 테스트 기한 %s', to_char(v_due, 'FMMM/FMDD')),
            'sample_received',
            jsonb_build_object('test_due', v_due, 'auto', true, 'source', coalesce(p_source, 'sweettracker'), 'delivered_at', v_at));
    v_trans := true;
  end if;

  return jsonb_build_object('ok', true, 'kind', 'sample', 'code', c.code, 'status', v_status,
    'delivered', true, 'newly_delivered', v_newly, 'transitioned', v_trans, 'already', v_already,
    'campaign_status', case when v_trans then 'TESTING' else c.status end, 'test_due', case when v_trans then v_due else c.test_due end);
end;
$$;
revoke all on function public.app_tracking_record(text, uuid, text, jsonb, timestamptz, text) from public, anon, authenticated;
grant execute on function public.app_tracking_record(text, uuid, text, jsonb, timestamptz, text) to service_role;
