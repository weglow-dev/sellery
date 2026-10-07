-- ============================================================
-- 0040 — 관리자 긴급 판매 중단 · 재개 (LIVE ⇄ CLEARING)
--
-- 배경: 진행 중인 판매(LIVE)를 멈추는 경로가 어디에도 없었다.
--   · 관리자 상품 검수의 [노출 중단]·[반려]는 `products.status` 만 바꾼다(0015 `app_admin_review_product`)
--     — 그리고 고객 측 단일 소스 `campaign_card()`(0008:231-234)는 `p.status` 를 보지 않으므로
--     진행 중인 판매 링크는 그대로 열리고 결제까지 끝난다. 화면 안내도 그 사실을 적고 있다
--     (관리자 상품 상세: "중단하면 새 제안이 막히고 진행 중인 판매에는 영향이 없습니다").
--   · 유일한 대체 수단이 브랜드 전체 정지(`brands.active=false`)였는데, 그러면 그 브랜드의
--     **모든** 캠페인이 동시에 죽고 결제 중이던 고객은 `NOT_LIVE` 로 자동취소된다.
--   건강기능식품은 표시광고·성분 이슈로 당장 한 건만 내려야 하는 상황이 생긴다. 그 레버를 만든다.
--
-- 설계 결정
--   1. **새 상태를 만들지 않고 `LIVE → CLEARING`** 을 쓴다. CLEARING 은 이미 "판매 기간 종료 ·
--      교환/환불 기간" 이고, 게이트가 전부 `status = 'LIVE'` 를 요구하므로 중단이 즉시 반영된다:
--        · 서버 결제 게이트 `gateIsLive`(packages/payments/.../checkout-sync.server.ts:831-836)
--        · 화면 구매 판정 `isBuyable`(packages/db/src/campaign.ts:332-343)
--        · 종료 표시·정가 복귀 `isEnded`(packages/db/src/campaign.ts:283-290 · #87)
--      판매 링크 자체는 열린 채로 "판매 종료" 가 된다 — 이미 산 고객의 주문 조회·CS 경로를 끊지 않는다.
--   2. **`end_date` 는 건드리지 않는다.** 정산 예정일이 `end_date + clear_days`(0020:416·550·746)라
--      종료일을 당기면 지급일도 당겨진다. 긴급 중단은 환불이 쏟아지는 상황이므로 돈이 먼저 나가면 안 된다.
--      원래 예정 종료일이 그대로 남아 기록으로도 맞다.
--   3. **재개(CLEARING → LIVE)를 같이 넣는다.** 되돌릴 수 없는 레버는 급할 때 못 누른다.
--      정산 전 · 기간이 남아 있고 · 상품이 `listed` 일 때만 열어 준다.
--   4. 사유는 **필수**다. `campaign_events` 에 남으므로 인플루언서·브랜드 스레드에도 보인다
--      (관리자 정지 사유가 Slack 으로만 가고 사라지는 문제와 같은 실수를 반복하지 않는다).
--
-- 함수: app_admin_end_sale(campaign, reason, actor) · app_admin_resume_sale(campaign, actor)
--   0007 패턴 — security definer · service_role 만 execute. 라우트의 `requireAdmin()` 이 게이트다.
--   관례대로 예외 대신 `{ok, code}` 를 돌려준다(0010~0039).
-- ============================================================

-- ------------------------------------------------------------
-- app_admin_end_sale(p_campaign_id, p_reason, p_actor_user_id)
--   LIVE → CLEARING + 이벤트 `ended_by_admin`(사유 포함). 멱등 — 이미 CLEARING 이면 already.
--   반환: { ok:true, already, campaign_id, campaign_code, status, due_on }
--       | { ok:false, code:'NOT_FOUND' | 'BAD_REASON' | 'WRONG_STATUS', status? }
-- ------------------------------------------------------------
create or replace function public.app_admin_end_sale(
  p_campaign_id   uuid,
  p_reason        text,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c        public.campaigns%rowtype;
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_reason text := nullif(btrim(regexp_replace(coalesce(p_reason, ''), '\s+', ' ', 'g')), '');
  v_due    date;
begin
  v_reason := left(v_reason, 200);
  if v_reason is null then
    return jsonb_build_object('ok', false, 'code', 'BAD_REASON');
  end if;

  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- 이미 중단·종료된 건 (스케줄러가 먼저 종료시킨 경우도 여기로 온다)
  if c.status = 'CLEARING' then
    return jsonb_build_object('ok', true, 'already', true, 'campaign_id', c.id,
                              'campaign_code', c.code, 'status', c.status,
                              'due_on', case when c.end_date is null then null
                                             else c.end_date + public.platform_clear_days() end);
  end if;
  if c.status <> 'LIVE' then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;

  v_due := case when c.end_date is null then null else c.end_date + public.platform_clear_days() end;

  update public.campaigns set status = 'CLEARING' where id = c.id;

  insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
  values (c.id, 'system', 'system', 'admin', p_actor_user_id,
          format('셀러리 관리자가 판매를 중단했습니다 · 구매가 즉시 막히고 교환/환불 기간이 시작됩니다%s · 사유: %s',
                 case when v_due is null then ''
                      else format(' · 정산 예정 %s/%s', extract(month from v_due)::int, extract(day from v_due)::int) end,
                 v_reason),
          'ended_by_admin',
          jsonb_build_object('reason', v_reason, 'end_date', c.end_date, 'due_on', v_due,
                             'today', v_today, 'sold_qty', c.sold_qty, 'by', 'admin'));

  return jsonb_build_object('ok', true, 'already', false, 'campaign_id', c.id,
                            'campaign_code', c.code, 'status', 'CLEARING', 'due_on', v_due);
end;
$$;
revoke all on function public.app_admin_end_sale(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.app_admin_end_sale(uuid, text, uuid) to service_role;

comment on function public.app_admin_end_sale(uuid, text, uuid) is
  '관리자 긴급 판매 중단 (0040) — LIVE → CLEARING. end_date 는 유지(정산일을 당기지 않는다). 사유 필수 · 이벤트 ended_by_admin';

-- ------------------------------------------------------------
-- app_admin_resume_sale(p_campaign_id, p_actor_user_id)
--   CLEARING → LIVE + 이벤트 `resumed_by_admin`. 잘못 누른 중단을 되돌리는 용도.
--   조건: 정산 전(settlements 없음) · `end_date >= 오늘` · `start_date <= 오늘` · 상품이 `listed`
--         — 기간이 끝난 건을 되살리면 스케줄러가 다음 틱에 다시 CLEARING 으로 보낸다(무의미).
--   반환: { ok:true, already, campaign_id, campaign_code, status }
--       | { ok:false, code:'NOT_FOUND' | 'WRONG_STATUS' | 'ALREADY_SETTLED' | 'PERIOD_OVER' | 'NOT_LISTED', status? }
-- ------------------------------------------------------------
create or replace function public.app_admin_resume_sale(
  p_campaign_id   uuid,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c        public.campaigns%rowtype;
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_pstat  text;
begin
  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if c.status = 'LIVE' then
    return jsonb_build_object('ok', true, 'already', true, 'campaign_id', c.id,
                              'campaign_code', c.code, 'status', c.status);
  end if;
  if c.status <> 'CLEARING' then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;

  -- 정산이 끝난 건은 되살리지 않는다(지급·원장이 이미 확정) — 상태가 SETTLED 로 가 있지 않더라도 방어한다
  if exists (select 1 from public.settlements s where s.campaign_id = c.id) then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_SETTLED', 'status', c.status);
  end if;

  if c.end_date is null or c.end_date < v_today or c.start_date is null or c.start_date > v_today then
    return jsonb_build_object('ok', false, 'code', 'PERIOD_OVER', 'status', c.status);
  end if;

  select p.status into v_pstat
    from public.products p
   where p.id = c.product_id and p.deleted_at is null;
  if v_pstat is distinct from 'listed' then
    return jsonb_build_object('ok', false, 'code', 'NOT_LISTED', 'status', c.status);
  end if;

  update public.campaigns set status = 'LIVE' where id = c.id;

  insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
  values (c.id, 'system', 'system', 'admin', p_actor_user_id,
          format('셀러리 관리자가 판매를 재개했습니다 · %s 까지 다시 구매할 수 있습니다',
                 format('%s/%s', extract(month from c.end_date)::int, extract(day from c.end_date)::int)),
          'resumed_by_admin',
          jsonb_build_object('start_date', c.start_date, 'end_date', c.end_date,
                             'today', v_today, 'by', 'admin'));

  return jsonb_build_object('ok', true, 'already', false, 'campaign_id', c.id,
                            'campaign_code', c.code, 'status', 'LIVE');
end;
$$;
revoke all on function public.app_admin_resume_sale(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_admin_resume_sale(uuid, uuid) to service_role;

comment on function public.app_admin_resume_sale(uuid, uuid) is
  '관리자 판매 재개 (0040) — CLEARING → LIVE. 정산 전 · 기간 내 · 상품 listed 일 때만. 이벤트 resumed_by_admin';
