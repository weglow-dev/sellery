-- 0054 일정 확정 당일 시작 → 즉시 LIVE (대표 QA 2026-10-12)
-- 브랜드가 "오늘 시작" 제안을 확정하면 지금까지는 SCHEDULE_CONFIRMED 로 두고 매시 5분 크론(app_campaign_tick)이 LIVE 로 올렸다 →
-- 확정 직후 최대 1시간 동안 고객 판매 페이지가 "오픈 준비 중" 이었다. 확정 함수 끝에서 app_campaign_tick_one(0018) 을 바로 부른다
-- (went_live 이벤트·전이 로직은 그 함수 하나에만 둔다). 응답 status 는 실제 상태(LIVE | SCHEDULE_CONFIRMED).
-- 0016 본문 그대로 + 위 블록만 추가.
create or replace function public.app_brand_confirm_schedule(p_brand_id uuid, p_campaign_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c        public.campaigns%rowtype;
  p        public.products%rowtype;
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_alloc  integer;
  v_left   integer;
  v_block  jsonb;
  v_prio   boolean;
  v_tick   jsonb;   -- 0054
  v_status text := 'SCHEDULE_CONFIRMED';
begin
  select * into c from public.campaigns where id = p_campaign_id and brand_id = p_brand_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if c.status = 'SCHEDULE_CONFIRMED' then
    return jsonb_build_object('ok', true, 'already', true, 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
      'start', c.start_date, 'end', c.end_date, 'qty', c.qty, 'price_locked', c.price_locked, 'rate_locked', c.rate_locked,
      'priority', public.seller_is_priority(c.seller_id));
  end if;
  if c.status <> 'SCHEDULE_PROPOSED' then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;
  if c.proposed_start < v_today then
    return jsonb_build_object('ok', false, 'code', 'PERIOD_PAST', 'start', c.proposed_start, 'today', v_today);
  end if;

  -- 확정 시점 재검사 (confirmSchedule: periodBlock → stockLeft)
  v_block := public.campaign_period_block(c.product_id, c.proposed_start, c.proposed_end, c.id, c.seller_id);
  if v_block is not null then
    return jsonb_build_object('ok', false, 'code', 'PERIOD_BLOCKED',
      'by', v_block ->> 'name', 'handle', v_block ->> 'handle', 'grade', v_block ->> 'grade',
      'start', v_block -> 'start', 'end', v_block -> 'end', 'campaign_code', v_block ->> 'campaign_code');
  end if;
  select * into p from public.products where id = c.product_id for update;
  v_alloc := public.product_allocated(p.id, c.id);
  v_left  := greatest(0, coalesce(p.stock, 0) - v_alloc);
  if c.proposed_qty > v_left then
    return jsonb_build_object('ok', false, 'code', 'STOCK_SHORT', 'left', v_left, 'qty', c.proposed_qty, 'stock', coalesce(p.stock, 0), 'allocated', v_alloc);
  end if;
  v_prio := public.seller_is_priority(c.seller_id);

  update public.campaigns
     set status = 'SCHEDULE_CONFIRMED',
         start_date = c.proposed_start, end_date = c.proposed_end, qty = c.proposed_qty,
         price_locked = p.sale_price, rate_locked = p.commission_rate,
         decision_reason = null
   where id = c.id;

  -- 프로토타입 confirmSchedule 의 pushSys 원문 ("브랜드가 일정을 승인했습니다 · M/D – M/D 기간 확정"). schedule_confirmed_priority 는 재판매 우선권 즉시 확정용으로 남겨 둔다.
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (c.id, 'system', 'system', 'brand',
          format('브랜드가 일정을 승인했습니다 · %s – %s 기간 확정 · 배정 재고 %s',
                 to_char(c.proposed_start, 'FMMM/FMDD'), to_char(c.proposed_end, 'FMMM/FMDD'), to_char(c.proposed_qty, 'FM999,999,999')),
          'schedule_confirmed',
          jsonb_build_object('start', c.proposed_start, 'end', c.proposed_end, 'qty', c.proposed_qty,
                             'price_locked', p.sale_price, 'rate_locked', p.commission_rate, 'priority', v_prio));

  -- 0054: 시작일이 오늘이면 다음 정시 크론(campaign-tick · 매시 5분)을 기다리지 않고 바로 LIVE 로 — 고객 페이지가 "오픈 준비 중" 으로 남던 문제(2026-10-12 대표 QA)
  if c.proposed_start <= v_today then
    v_tick := public.app_campaign_tick_one(c.id);
    if coalesce((v_tick ->> 'went_live')::boolean, false) then
      v_status := 'LIVE';
    end if;
  end if;

  return jsonb_build_object('ok', true, 'already', false, 'campaign_id', c.id, 'campaign_code', c.code, 'status', v_status,
    'start', c.proposed_start, 'end', c.proposed_end, 'qty', c.proposed_qty,
    'price_locked', p.sale_price, 'rate_locked', p.commission_rate, 'priority', v_prio);
end;
$$;
revoke all on function public.app_brand_confirm_schedule(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_brand_confirm_schedule(uuid, uuid) to service_role;
