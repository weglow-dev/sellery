-- ============================================================
-- 0033 — 미발송 샘플 환불 요청 (인플루언서 → 관리자)
--
-- 배경: 0024 가 "영업일 5일 미발송" 건을 관리자 큐에 모으지만, 환불은 **인플루언서가 요청한 경우에만**
--   실행한다(운영 확인 2026-10-02 · docs/sample-policy.md). 그런데 두 가지가 없었다:
--     1. 인플루언서가 요청할 수단 — 화면 안내는 "고객센터로 요청" 뿐이고 창구는 mailto 하나였다.
--     2. 관리자가 "요청이 왔는지" 아는 방법 — 큐는 기한만 보고 요청 여부를 알 수 없었다.
--   메일로 받으면 관리자가 캠페인과 수동으로 맞춰야 하고, 요청 기록이 남지 않는다.
--
-- 흐름
--   인플루언서  app_seller_request_sample_refund  → campaign_events(sample_refund_requested) 1행
--   관리자      app_admin_sample_refund_due       → 행마다 requested_at · requested_body 를 함께 반환
--                                                 → "요청 있음" 만 환불하면 된다
--
-- 기록 위치는 `campaign_events`(0003) — 스레드에 그대로 보이므로 브랜드도 "환불 요청이 들어왔다" 를 안다
--   (발송을 서두르게 하는 효과. 별도 알림을 만들지 않는다).
--   `event_type` 은 자유 텍스트라 제약 변경이 없다(0003:256).
--
-- 기한 판정은 0024 와 **같은 함수**를 쓴다(`business_days_after` · `platform_sample_ship_days`) —
--   화면과 큐가 다른 날짜를 보여주지 않게.
-- ============================================================

-- ------------------------------------------------------------
-- app_seller_request_sample_refund(p_seller_id, p_campaign_id) — 인플루언서가 미발송 환불을 요청한다
--   가드: 내 캠페인 · SAMPLE_PURCHASED · 발송 전(tracking_no·sample_shipped_at 없음)
--         · 결제 CONFIRMED · **영업일 N일 경과**(그 전에는 권리가 없다) · 멱등(이미 요청했으면 already)
--   반환 { ok:true, already, requested_at, due_on } | { ok:false, code }
--     NOT_FOUND(내 것이 아니거나 없음) · NOT_PURCHASED · ALREADY_SHIPPED · NO_PAYMENT · TOO_EARLY(due_on 함께)
-- ------------------------------------------------------------
create or replace function public.app_seller_request_sample_refund(p_seller_id uuid, p_campaign_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c          public.campaigns;
  pp         public.partner_payments;
  v_days     integer := public.platform_sample_ship_days();
  v_today    date := (now() at time zone 'Asia/Seoul')::date;
  v_due      date;
  v_exist    public.campaign_events;
  v_name     text;
begin
  select * into c from public.campaigns where id = p_campaign_id and seller_id = p_seller_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if c.status <> 'SAMPLE_PURCHASED' or c.purchased is not true then
    return jsonb_build_object('ok', false, 'code', 'NOT_PURCHASED', 'status', c.status);
  end if;

  if c.tracking_no is not null or c.sample_shipped_at is not null then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_SHIPPED');
  end if;

  -- 결제 행 (0024 큐와 같은 조건: kind='sample' · CONFIRMED)
  select * into pp from public.partner_payments
    where campaign_id = c.id and kind = 'sample' and status = 'CONFIRMED'
    order by created_at limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NO_PAYMENT');
  end if;

  -- 기한 — 0024 와 같은 계산
  v_due := public.business_days_after((pp.created_at at time zone 'Asia/Seoul')::date, v_days);
  if v_due > v_today then
    return jsonb_build_object('ok', false, 'code', 'TOO_EARLY', 'due_on', v_due, 'today', v_today, 'ship_days', v_days);
  end if;

  -- 이미 요청했나 (멱등)
  select * into v_exist from public.campaign_events
    where campaign_id = c.id and event_type = 'sample_refund_requested'
    order by created_at limit 1;
  if found then
    return jsonb_build_object('ok', true, 'already', true, 'requested_at', v_exist.created_at, 'due_on', v_due);
  end if;

  select s.name into v_name from public.sellers s where s.id = p_seller_id;

  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (c.id, 'system', 'system', 'seller',
          format('%s 님이 미발송 환불을 요청했습니다 — 결제 후 영업일 %s일(기한 %s)이 지났고 아직 발송되지 않았습니다.',
                 coalesce(v_name, '인플루언서'), v_days, to_char(v_due, 'MM/DD')),
          'sample_refund_requested',
          jsonb_build_object('due_on', v_due, 'ship_days', v_days, 'payment_id', pp.id));

  return jsonb_build_object('ok', true, 'already', false, 'requested_at', now(), 'due_on', v_due);
end;
$$;

revoke all on function public.app_seller_request_sample_refund(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_seller_request_sample_refund(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_seller_sample_refund_state(p_seller_id, p_campaign_id) — 화면 표시용 상태 (읽기)
--   캠페인 상세가 "기한 안내만" / "요청 버튼" / "요청 접수됨" 중 무엇을 보여줄지 정한다.
--   기한 계산을 화면에서 다시 하지 않는다 — 요청 RPC·관리자 큐와 **같은 함수**를 쓴다.
--   반환 { ok:true, applicable, ship_days, due_on, eligible, requested_at }
--     applicable  구매 샘플 + 발송 전 + 결제 CONFIRMED (false 면 블록을 숨긴다)
--     eligible    기한이 지났나 (요청 버튼을 켜는 조건)
-- ------------------------------------------------------------
create or replace function public.app_seller_sample_refund_state(p_seller_id uuid, p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  c        public.campaigns;
  pp       public.partner_payments;
  v_days   integer := public.platform_sample_ship_days();
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_due    date;
  v_req    timestamptz;
begin
  select * into c from public.campaigns where id = p_campaign_id and seller_id = p_seller_id;
  if not found or c.status <> 'SAMPLE_PURCHASED' or c.purchased is not true
     or c.tracking_no is not null or c.sample_shipped_at is not null then
    return jsonb_build_object('ok', true, 'applicable', false, 'ship_days', v_days);
  end if;

  select * into pp from public.partner_payments
    where campaign_id = c.id and kind = 'sample' and status = 'CONFIRMED'
    order by created_at limit 1;
  if not found then
    return jsonb_build_object('ok', true, 'applicable', false, 'ship_days', v_days);
  end if;

  v_due := public.business_days_after((pp.created_at at time zone 'Asia/Seoul')::date, v_days);
  select e.created_at into v_req from public.campaign_events e
    where e.campaign_id = c.id and e.event_type = 'sample_refund_requested'
    order by e.created_at limit 1;

  return jsonb_build_object('ok', true, 'applicable', true, 'ship_days', v_days,
    'due_on', v_due, 'eligible', (v_due <= v_today), 'requested_at', v_req);
end;
$$;

revoke all on function public.app_seller_sample_refund_state(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_seller_sample_refund_state(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_admin_sample_refund_due() 재정의 — 행마다 요청 여부를 함께 준다
--   0024 와 같은 대상·조건. `requested_at`(null = 요청 없음) · `requested_body` 만 추가한다.
--   관리자는 "요청 있음" 만 환불한다(SAMPLE_REFUND_NOTICE).
-- ------------------------------------------------------------
create or replace function public.app_admin_sample_refund_due()
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_days  integer := public.platform_sample_ship_days();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_rows  jsonb;
begin
  select coalesce(jsonb_agg(t.x order by t.days_over desc, t.paid_on), '[]'::jsonb) into v_rows
  from (
    select jsonb_build_object(
             'campaign_id', c.id, 'campaign_code', c.code,
             'payment_id', pp.id,
             'seller', jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle),
             'brand', jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name),
             'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name),
             'amount_total', pp.amount_total, 'amount_cash', pp.amount_cash, 'amount_cel', pp.amount_cel,
             'paid_on', (pp.created_at at time zone 'Asia/Seoul')::date,
             'due_on', public.business_days_after((pp.created_at at time zone 'Asia/Seoul')::date, v_days),
             'days_over', v_today - public.business_days_after((pp.created_at at time zone 'Asia/Seoul')::date, v_days),
             -- 0033: 인플루언서 환불 요청 (null = 요청 없음 → 환불하지 않는다)
             'requested_at', ev.created_at,
             'requested_body', ev.body) as x,
           v_today - public.business_days_after((pp.created_at at time zone 'Asia/Seoul')::date, v_days) as days_over,
           (pp.created_at at time zone 'Asia/Seoul')::date as paid_on
      from public.partner_payments pp
      join public.campaigns c on c.id = pp.campaign_id
      join public.sellers   s on s.id = c.seller_id
      join public.brands    b on b.id = c.brand_id
      join public.products  p on p.id = c.product_id
      left join lateral (
        select e.created_at, e.body from public.campaign_events e
         where e.campaign_id = c.id and e.event_type = 'sample_refund_requested'
         order by e.created_at limit 1
      ) ev on true
     where pp.kind = 'sample'
       and pp.status = 'CONFIRMED'
       and c.status = 'SAMPLE_PURCHASED'
       and c.tracking_no is null
       and c.sample_shipped_at is null
       and public.business_days_after((pp.created_at at time zone 'Asia/Seoul')::date, v_days) <= v_today) t;

  return jsonb_build_object('ok', true, 'today', v_today, 'ship_days', v_days, 'rows', v_rows);
end;
$$;

revoke all on function public.app_admin_sample_refund_due() from public, anon, authenticated;
grant execute on function public.app_admin_sample_refund_due() to service_role;
