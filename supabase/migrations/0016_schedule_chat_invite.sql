-- ============================================================
-- 0016 — 브랜드 콘솔 3단계(인플루언서 짝): 판매 일정 제안 · 브랜드 일정 확정/반려 · 테스트 후 패스 · 캠페인 스레드 채팅(양쪽) · 브랜드 직접 제안(초대) · 초대 수락/거절
--        seller_is_priority · campaign_period_block · campaign_period_holders · campaign_leak_detected · campaign_post_chat · campaign_normalize_shipping · campaign_event_json
--        app_propose_schedule · app_pass_campaign · app_seller_schedule_context                      (인플루언서)
--        app_brand_confirm_schedule · app_brand_reject_schedule                                        (브랜드)
--        app_campaign_chat                                                                              (두 콘솔 공용)
--        app_brand_invite_candidates · app_brand_invite_seller · app_accept_invite · app_decline_invite (브랜드 초대 · 인플루언서 응답)
--        brand_campaign_json 재정의(price_locked · rate_locked · stock · stock_left · seller.is_priority 추가)
--
-- 근거: docs/brand-console-plan.md §1(상태 기계 — TESTING/INVITED 는 인플루언서 차례 · SCHEDULE_PROPOSED 는 브랜드 차례) · §4 "0016 3단계" · §5(/campaigns/[code] 양쪽 콘솔)
--       · §6 행 3(완료 기준 a~f) · docs/period-policy.md(기간 공유 · 플래티넘 이상 우선 기간 · 재고 배정 · 진행 중 가격/요율 잠금) · docs/sample-policy.md §10(패스)
--       · 인플루언서 0011(app_receive_sample · sample_shipping) · 브랜드 0015(app_brand_*_sample · brand_campaign_json) 의 다음 걸음.
-- 실행: 0015 이후. 재실행 가능(create or replace 만 — 컬럼·테이블 추가 없음. 0003 이 예약한 proposed_* · start_date/end_date/qty · price_locked/rate_locked · invited · decision_reason · campaign_events.leak_flag 를 그대로 쓴다).
--       0001~0015 파일은 수정하지 않는다.
--
-- 숫자·규칙의 정답은 packages/core/src/{constants,helpers,actions}.ts 다. 이 파일의 SQL 은 그 규칙을 그대로 옮긴 것이고, 바꿀 때는 둘을 함께 고친다.
--
-- | 규칙 | 코어 원본 | 여기서 |
-- |---|---|---|
-- | 우선권 등급 = 플래티넘 이상(PRIORITY_TIER) — "이상" 은 tierIdx ≤ | isPriority · tierIdx · PRIORITY_TIER | seller_is_priority(seller_id) = grade_tiers.is_priority (sellers.grade 캐시 → 비면 grade_for_sales(m3_sales)) — 단일 소스(0001 헤더) |
-- | 기간은 기본 공유. 우선권 인플루언서가 **확정·진행(SCHEDULE_CONFIRMED / LIVE)** 중인 겹치는 기간에는 우선권 등급만 새로 진입 — 제안·확정 두 시점에 검사 | periodHolders · periodBlock (proposeSchedule · confirmSchedule) | campaign_period_block(product, start, end, except, seller) → PERIOD_BLOCKED{by, handle, grade, start, end} (겹침 = not (end < c.start or start > c.end) · 자기 캠페인 제외) |
-- | 배정 수량 ≤ 재고 − 배정량(SCHEDULE_CONFIRMED / LIVE qty 합, 자기 제외) — 제안·확정 두 시점 | allocated · stockLeft (proposeSchedule · confirmSchedule) | 0015 product_allocated(product, except) → 제안 QTY_EXCEEDS_STOCK{left} · 확정 STOCK_SHORT{left} (products 행 for update 로 동시 제안 직렬화) |
-- | 종료일 = 시작일 + 기간 − 1 · 기간 선택지 3/5/7일 · 시작일은 오늘 이후 | proposeSchedule `en = addD(st, len-1)` · ScheduleModal 3·5·7 | 입력은 (start, end). len = end − start + 1 이 1 ≤ len ≤ max(platform_settings.period_len_days)(기본 7) · start ≥ 오늘(KST) → BAD_PERIOD{field} |
-- | 제안 = TESTING → SCHEDULE_PROPOSED(proposed_*) · 재제안은 SCHEDULE_PROPOSED 에서 덮어쓰기 | proposeSchedule | app_propose_schedule (재판매 우선권 즉시 확정 `regongu && passActive` 은 재판매 기능과 함께 이후 — 여기 없음) |
-- | 확정 = SCHEDULE_PROPOSED → SCHEDULE_CONFIRMED · start/end/qty ← proposed_* · **확정 시점 판매가·수수료율 스냅샷**(0003 price_locked/rate_locked — 데모는 saveProduct 잠금으로 대신) | confirmSchedule · saveProduct locked | app_brand_confirm_schedule: price_locked = products.sale_price · rate_locked = products.commission_rate(등급 보너스는 정산 시 — 0004) · 시작일이 지났으면 PERIOD_PAST(데모에 없던 가드 — 실시간 경과) |
-- | 반려 = SCHEDULE_PROPOSED → TESTING(test_due 유지) · 인플루언서 재제안 | rejectSchedule | app_brand_reject_schedule(p_reason ≤200) — proposed_* 는 남겨 폼 프리필 · decision_reason 은 확정·재제안 때 지운다 |
-- | 패스 = TESTING → PASSED(종결 · 페널티 없음 · 상품당 무상 1회는 소진) | passCamp | app_pass_campaign |
-- | 채팅: 본문 저장 + 연락처/카톡 패턴 감지 → 경고 | pushChat `/01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}\|카톡\|카카오톡\|kakao/i` + warn 행 | campaign_leak_detected(body) 같은 정규식(대소문자 무시) → 해당 chat 행 leak_flag=true **+ 시스템 경고 1행 leak_warned**(계획서 §4 — 0003 헤더의 "앱이 렌더링" 대신 행으로 남겨 두 콘솔이 같은 스레드를 본다) · 본문 1~1000자 |
-- | 브랜드 직접 제안 = 새 캠페인 INVITED(invited=true) + 시스템 메시지 + (선택) 첫 채팅 · 노출 중(listed) 상품만 · 독점 확정 상품은 다른 인플루언서에게 불가 · 진행 중 쌍 불가 | confirmInvite · inviteModal | app_brand_invite_seller: NOT_LISTED{status} · EXCLUSIVE_LOCKED · ALREADY_ACTIVE{campaign_code} · 데모에 없던 중복 가드는 0003 campaigns_active_pair_uidx 가 원래 강제 |
-- | 다이아·블랙 제안권 🥬 10 차감(grade_tiers.invite_cost_cel) — **6단계 게이트**. 3단계는 우선권 등급(플래티넘 이상, is_priority) 전체를 초대 대상에서 제외한다(계획서 §6 행 6 · 데모는 플래티넘 무료 — §8 열린 결정) · 익명(hidden) 인플루언서는 갤러리 열람(6단계) 뒤에 | confirmInvite `celSpend(…, 10)` · topSeller/unlockRef | PRIORITY_INVITE_GATED{grade, cost_cel} · SELLER_HIDDEN · cel_used = 0 |
-- | 수락 = INVITED → SAMPLE_APPROVED(샘플 요청·승인 생략 — 월 한도 미차감은 invited=true 로 0011 sampleUsed 가 제외) · 배송지 전달 · 노출 중단 상품은 불가 · 독점 확정 상품은 불가 | acceptInvite | app_accept_invite(p_shipping 없으면 sellers.sample_address) → sample_shipping · NOT_LISTED · EXCLUSIVE_LOCKED · BAD_SHIPPING{field}(0011 과 같은 검증) |
-- | 거절 = INVITED → DECLINED(🥬 환급은 cel_used > 0 일 때 — 6단계) | declineInvite | app_decline_invite(p_reason ≤200) — cel_used 는 이 단계에서 항상 0 |
-- | 시스템 메시지 원문 | actions.ts 각 pushSys | campaign_events.body 평문(<b>·이모지 제거) + event_type + payload (0011·0015 관례) |
--
-- 설계 요점
--   · 전부 security definer · service_role 만 execute(0007 패턴). 콘솔은 requireSeller()/requireBrand() 의 id 만 넘긴다 — 클라이언트가 보낸 id·날짜·수량은 함수가 다시 검사한다.
--   · 소유권: 인플루언서 함수는 campaigns.seller_id, 브랜드 함수는 campaigns.brand_id(0003 트리거 비정규화). 남의 것은 NOT_FOUND — 존재 여부를 구분하지 않는다(라우트 404).
--   · 상태 전이는 `campaigns for update` → 상태 검사 → (재고 검사는 `products for update` 뒤) → update → campaign_events(kind='system') 1행을 한 트랜잭션에. 멱등: 이미 목표 상태면 {ok:true, already:true}.
--   · 시간은 전부 Asia/Seoul 달력일(0011 app_receive_sample 과 같은 기준). 시스템 전이(SCHEDULE_CONFIRMED → LIVE · LIVE → CLEARING)는 여기 없음(관리자·크론).
--   · 함수는 예외 대신 {ok, code} 를 돌려준다. 라우트는 code 를 문구로 바꾼다(packages/db/src/partner/{schedule,chat}-rules.ts · brand/{invite,campaign}-rules.ts).
--   · RLS · 컬럼 변경 없음.
-- ============================================================

-- ------------------------------------------------------------
-- 헬퍼 (서버 전용)
-- ------------------------------------------------------------

-- isPriority(seller): 등급(캐시 → m3_sales 재계산) 의 grade_tiers.is_priority. 없는 인플루언서·등급 표 밖은 false.
create or replace function public.seller_is_priority(p_seller_id uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select coalesce((
    select gt.is_priority
      from public.sellers s
      left join public.grade_tiers gt on gt.name = coalesce(s.grade, public.grade_for_sales(s.m3_sales))
     where s.id = p_seller_id), false)
$$;
revoke all on function public.seller_is_priority(uuid) from public, anon, authenticated;
grant execute on function public.seller_is_priority(uuid) to service_role;

-- periodHolders(pid, s, e, exceptCid): 같은 상품 · SCHEDULE_CONFIRMED / LIVE · 기간이 겹치는 캠페인 (시작일순) — 일정 제안 폼의 "이미 잡힌 기간" 표시용
--   [{campaign_id, campaign_code, status, start, end, qty, seller_id, name, handle, grade, is_priority}]
create or replace function public.campaign_period_holders(p_product_id uuid, p_start date, p_end date, p_except_campaign_id uuid default null)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
           'start', c.start_date, 'end', c.end_date, 'qty', c.qty,
           'seller_id', s.id, 'name', s.name, 'handle', s.handle,
           'grade', coalesce(s.grade, public.grade_for_sales(s.m3_sales)),
           'is_priority', public.seller_is_priority(s.id))
         order by c.start_date, c.created_at), '[]'::jsonb)
    from public.campaigns c
    join public.sellers s on s.id = c.seller_id
   where c.product_id = p_product_id
     and (p_except_campaign_id is null or c.id <> p_except_campaign_id)
     and c.status in ('SCHEDULE_CONFIRMED', 'LIVE')
     and (p_start is null or p_end is null or not (p_end < c.start_date or p_start > c.end_date))
$$;
revoke all on function public.campaign_period_holders(uuid, date, date, uuid) from public, anon, authenticated;
grant execute on function public.campaign_period_holders(uuid, date, date, uuid) to service_role;

-- periodBlock(pid, s, e, exceptCid, sellerId): 내가 우선권이면 null. 아니면 겹치는 확정·진행 캠페인 중 우선권 인플루언서의 것 1건(시작일순) → {campaign_id, campaign_code, seller_id, name, handle, grade, start, end}. 없으면 null.
create or replace function public.campaign_period_block(p_product_id uuid, p_start date, p_end date, p_except_campaign_id uuid, p_seller_id uuid)
returns jsonb
language sql stable
set search_path = public
as $$
  select case when public.seller_is_priority(p_seller_id) then null else (
    select jsonb_build_object(
             'campaign_id', c.id, 'campaign_code', c.code, 'seller_id', s.id, 'name', s.name, 'handle', s.handle,
             'grade', coalesce(s.grade, public.grade_for_sales(s.m3_sales)), 'start', c.start_date, 'end', c.end_date)
      from public.campaigns c
      join public.sellers s on s.id = c.seller_id
     where c.product_id = p_product_id
       and (p_except_campaign_id is null or c.id <> p_except_campaign_id)
       and c.status in ('SCHEDULE_CONFIRMED', 'LIVE')
       and not (p_end < c.start_date or p_start > c.end_date)
       and public.seller_is_priority(s.id)
     order by c.start_date, c.created_at
     limit 1) end
$$;
revoke all on function public.campaign_period_block(uuid, date, date, uuid, uuid) from public, anon, authenticated;
grant execute on function public.campaign_period_block(uuid, date, date, uuid, uuid) to service_role;

-- pushChat 의 감지 정규식 그대로 (packages/db/src/partner/chat-rules.ts LEAK_RE 와 같은 값 — 바꾸면 둘 다)
create or replace function public.campaign_leak_detected(p_body text)
returns boolean
language sql immutable
set search_path = public
as $$
  select coalesce(p_body, '') ~* '01[016789][-[:space:].]?[0-9]{3,4}[-[:space:].]?[0-9]{4}|카톡|카카오톡|kakao'
$$;
revoke all on function public.campaign_leak_detected(text) from public, anon, authenticated;
grant execute on function public.campaign_leak_detected(text) to service_role;

-- campaign_events 1행 → jsonb (0015 app_brand_campaign 의 events 원소와 같은 키 + actor_role)
create or replace function public.campaign_event_json(e public.campaign_events)
returns jsonb
language sql immutable
set search_path = public
as $$
  select jsonb_build_object(
    'id', e.id, 'campaign_id', e.campaign_id, 'kind', e.kind, 'sender', e.sender, 'actor_role', e.actor_role,
    'body', e.body, 'event_type', e.event_type, 'payload', e.payload, 'leak_flag', e.leak_flag, 'created_at', e.created_at)
$$;
revoke all on function public.campaign_event_json(public.campaign_events) from public, anon, authenticated;
grant execute on function public.campaign_event_json(public.campaign_events) to service_role;

-- 채팅 1행 insert (+ 감지 시 경고 행). 소유·상태 검사는 호출자가 이미 끝냈다. 반환 {event, leak_flag, warn_event_id}
create or replace function public.campaign_post_chat(p_campaign_id uuid, p_role text, p_actor_user_id uuid, p_body text)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  e       public.campaign_events%rowtype;
  v_leak  boolean := public.campaign_leak_detected(p_body);
  v_warn  uuid;
begin
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload, leak_flag)
  values (p_campaign_id, 'chat', p_role, p_role, p_actor_user_id, p_body, null, '{}'::jsonb, v_leak)
  returning * into e;
  if v_leak then
    -- 프로토타입 pushChat 의 warn 행 원문
    insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
    values (p_campaign_id, 'system', 'system', 'system',
            '연락처/외부 메신저 공유가 감지되었습니다. 플랫폼 밖 거래는 정산·분쟁 보호를 받지 못합니다.',
            'leak_warned', jsonb_build_object('event_id', e.id, 'role', p_role))
    returning id into v_warn;
  end if;
  return jsonb_build_object('event', public.campaign_event_json(e), 'leak_flag', v_leak, 'warn_event_id', v_warn);
end;
$$;
revoke all on function public.campaign_post_chat(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.campaign_post_chat(uuid, text, uuid, text) to service_role;

-- 배송지 검증·정규화 (0011 app_request_free_sample 과 같은 조건·상한) → {ok:true, shipping} | {ok:false, field}
create or replace function public.campaign_normalize_shipping(p_shipping jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_recipient  text;
  v_phone      text;
  v_postcode   text;
  v_addr1      text;
  v_addr2      text;
  v_memo       text;
begin
  if p_shipping is null or jsonb_typeof(p_shipping) <> 'object' then
    return jsonb_build_object('ok', false, 'field', 'shipping');
  end if;
  v_recipient := left(regexp_replace(btrim(coalesce(p_shipping ->> 'recipient', '')), '\s+', ' ', 'g'), 40);
  v_phone     := regexp_replace(coalesce(p_shipping ->> 'phone', ''), '\D', '', 'g');
  v_postcode  := left(btrim(coalesce(p_shipping ->> 'postcode', '')), 10);
  v_addr1     := left(regexp_replace(btrim(coalesce(p_shipping ->> 'address1', '')), '\s+', ' ', 'g'), 200);
  v_addr2     := nullif(left(regexp_replace(btrim(coalesce(p_shipping ->> 'address2', '')), '\s+', ' ', 'g'), 200), '');
  v_memo      := nullif(left(regexp_replace(btrim(coalesce(p_shipping ->> 'memo', '')), '\s+', ' ', 'g'), 200), '');
  if v_recipient = '' then return jsonb_build_object('ok', false, 'field', 'recipient'); end if;
  if v_phone !~ '^\d{8,15}$' then return jsonb_build_object('ok', false, 'field', 'phone'); end if;
  if v_postcode = '' then return jsonb_build_object('ok', false, 'field', 'postcode'); end if;
  if v_addr1 = '' then return jsonb_build_object('ok', false, 'field', 'address1'); end if;
  return jsonb_build_object('ok', true, 'shipping', jsonb_strip_nulls(jsonb_build_object(
    'recipient', v_recipient, 'phone', v_phone, 'postcode', v_postcode,
    'address1', v_addr1, 'address2', v_addr2, 'memo', v_memo)));
end;
$$;
revoke all on function public.campaign_normalize_shipping(jsonb) from public, anon, authenticated;
grant execute on function public.campaign_normalize_shipping(jsonb) to service_role;

-- 기간 상한 — platform_settings.period_len_days 가 배열([3,5,7])이면 최대값, 숫자면 그 값, 없으면 7
create or replace function public.period_len_max()
returns integer
language sql stable
set search_path = public
as $$
  select coalesce((
    select case
             when jsonb_typeof(ps.value) = 'array'  then (select max((x.value #>> '{}')::integer) from jsonb_array_elements(ps.value) x)
             when jsonb_typeof(ps.value) = 'number' then (ps.value #>> '{}')::integer
           end
      from public.platform_settings ps where ps.key = 'period_len_days'), 7)
$$;
revoke all on function public.period_len_max() from public, anon, authenticated;
grant execute on function public.period_len_max() to service_role;

-- ------------------------------------------------------------
-- app_propose_schedule(p_seller_id, p_campaign_id, p_start, p_end, p_qty) — 판매 일정 제안 (proposeSchedule)
--   TESTING → SCHEDULE_PROPOSED · SCHEDULE_PROPOSED 에서는 재제안(덮어쓰기 + 새 이벤트, reproposed:true)
--   반환:
--     { ok:true,  campaign_id, campaign_code, status:'SCHEDULE_PROPOSED', start, end, len, qty, left, reproposed:bool }
--     { ok:false, code:'NOT_FOUND' }                                   본인 캠페인 아님 · 없는 id
--     { ok:false, code:'WRONG_STATUS', status }                        TESTING · SCHEDULE_PROPOSED 가 아님
--     { ok:false, code:'BAD_PERIOD', field:'start'|'end'|'len', today, max_len }   시작일 < 오늘(KST) · 종료일 < 시작일 · 기간 1~max 밖
--     { ok:false, code:'BAD_QTY' }                                     수량 ≤ 0 · null
--     { ok:false, code:'QTY_EXCEEDS_STOCK', left, stock, allocated }   잔여(재고 − 배정량, 자기 제외) 초과
--     { ok:false, code:'PERIOD_BLOCKED', by, handle, grade, start, end, campaign_code }   플래티넘 이상이 잡은 기간 (나는 그 아래)
-- ------------------------------------------------------------
create or replace function public.app_propose_schedule(p_seller_id uuid, p_campaign_id uuid, p_start date, p_end date, p_qty integer)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c          public.campaigns%rowtype;
  p          public.products%rowtype;
  v_today    date := (now() at time zone 'Asia/Seoul')::date;
  v_max_len  integer := public.period_len_max();
  v_len      integer;
  v_alloc    integer;
  v_left     integer;
  v_block    jsonb;
  v_repro    boolean;
begin
  select * into c from public.campaigns where id = p_campaign_id and seller_id = p_seller_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if c.status not in ('TESTING', 'SCHEDULE_PROPOSED') then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;
  v_repro := c.status = 'SCHEDULE_PROPOSED';

  -- 기간 (proposeSchedule: 시작일 필수 · en = st + len − 1 · 선택지 3/5/7)
  if p_start is null or p_start < v_today then
    return jsonb_build_object('ok', false, 'code', 'BAD_PERIOD', 'field', 'start', 'today', v_today, 'max_len', v_max_len);
  end if;
  if p_end is null or p_end < p_start then
    return jsonb_build_object('ok', false, 'code', 'BAD_PERIOD', 'field', 'end', 'today', v_today, 'max_len', v_max_len);
  end if;
  v_len := (p_end - p_start) + 1;
  if v_len > v_max_len then
    return jsonb_build_object('ok', false, 'code', 'BAD_PERIOD', 'field', 'len', 'today', v_today, 'max_len', v_max_len);
  end if;
  if p_qty is null or p_qty <= 0 then
    return jsonb_build_object('ok', false, 'code', 'BAD_QTY');
  end if;

  -- 우선 기간 (periodBlock — 데모 판정 순서: 기간 → 수량)
  v_block := public.campaign_period_block(c.product_id, p_start, p_end, c.id, c.seller_id);
  if v_block is not null then
    return jsonb_build_object('ok', false, 'code', 'PERIOD_BLOCKED',
      'by', v_block ->> 'name', 'handle', v_block ->> 'handle', 'grade', v_block ->> 'grade',
      'start', v_block -> 'start', 'end', v_block -> 'end', 'campaign_code', v_block ->> 'campaign_code');
  end if;

  -- 재고 (stockLeft — 상품 행 잠금으로 같은 상품의 동시 제안·확정을 직렬화)
  select * into p from public.products where id = c.product_id for update;
  v_alloc := public.product_allocated(p.id, c.id);
  v_left  := greatest(0, coalesce(p.stock, 0) - v_alloc);
  if p_qty > v_left then
    return jsonb_build_object('ok', false, 'code', 'QTY_EXCEEDS_STOCK', 'left', v_left, 'stock', coalesce(p.stock, 0), 'allocated', v_alloc);
  end if;

  update public.campaigns
     set status = 'SCHEDULE_PROPOSED', proposed_start = p_start, proposed_end = p_end, proposed_qty = p_qty,
         decision_reason = null
   where id = c.id;

  -- 프로토타입 proposeSchedule 의 pushSys 원문 (평문 · M/D)
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (c.id, 'system', 'system', 'seller',
          format('인플루언서가 판매 일정을 %s제안했습니다 · %s – %s · 재고 %s',
                 case when v_repro then '다시 ' else '' end,
                 to_char(p_start, 'FMMM/FMDD'), to_char(p_end, 'FMMM/FMDD'), to_char(p_qty, 'FM999,999,999')),
          'schedule_proposed',
          jsonb_build_object('start', p_start, 'end', p_end, 'len', v_len, 'qty', p_qty, 'reproposed', v_repro));

  return jsonb_build_object('ok', true, 'campaign_id', c.id, 'campaign_code', c.code, 'status', 'SCHEDULE_PROPOSED',
    'start', p_start, 'end', p_end, 'len', v_len, 'qty', p_qty, 'left', v_left, 'reproposed', v_repro);
end;
$$;
revoke all on function public.app_propose_schedule(uuid, uuid, date, date, integer) from public, anon, authenticated;
grant execute on function public.app_propose_schedule(uuid, uuid, date, date, integer) to service_role;

-- ------------------------------------------------------------
-- app_pass_campaign(p_seller_id, p_campaign_id) — 테스트 후 패스 (passCamp): TESTING → PASSED · 이벤트 'passed'
--   반환: { ok:true, already:bool, campaign_id, campaign_code, status:'PASSED' } · { ok:false, code:'NOT_FOUND' } · { ok:false, code:'WRONG_STATUS', status }
-- ------------------------------------------------------------
create or replace function public.app_pass_campaign(p_seller_id uuid, p_campaign_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c public.campaigns%rowtype;
begin
  select * into c from public.campaigns where id = p_campaign_id and seller_id = p_seller_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if c.status = 'PASSED' then
    return jsonb_build_object('ok', true, 'already', true, 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status);
  end if;
  if c.status <> 'TESTING' then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;

  update public.campaigns set status = 'PASSED' where id = c.id;

  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (c.id, 'system', 'system', 'seller', '인플루언서가 테스트 후 패스를 선택했습니다', 'passed', '{}'::jsonb);

  return jsonb_build_object('ok', true, 'already', false, 'campaign_id', c.id, 'campaign_code', c.code, 'status', 'PASSED');
end;
$$;
revoke all on function public.app_pass_campaign(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_pass_campaign(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_seller_schedule_context(p_seller_id, p_campaign_id) — 일정 제안 폼 컨텍스트 (ScheduleModal 의 stockLeft · 기간 선택지 · 이미 잡힌 기간)
--   반환: { ok:true, campaign_id, campaign_code, status, today, len_choices:[3,5,7], max_len, stock, allocated, stock_left, is_priority,
--           proposed:{start,end,qty}|null, holders:[campaign_period_holders(전체 확정·진행 기간)], price_locked, rate_locked }
--         { ok:false, code:'NOT_FOUND' }
-- ------------------------------------------------------------
create or replace function public.app_seller_schedule_context(p_seller_id uuid, p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  c         public.campaigns%rowtype;
  p         public.products%rowtype;
  v_alloc   integer;
  v_choices jsonb;
begin
  select * into c from public.campaigns where id = p_campaign_id and seller_id = p_seller_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into p from public.products where id = c.product_id;
  v_alloc := public.product_allocated(p.id, c.id);
  select case when jsonb_typeof(ps.value) = 'array' then ps.value else null end into v_choices
    from public.platform_settings ps where ps.key = 'period_len_days';
  return jsonb_build_object(
    'ok', true, 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
    'today', (now() at time zone 'Asia/Seoul')::date,
    'len_choices', coalesce(v_choices, '[3,5,7]'::jsonb), 'max_len', public.period_len_max(),
    'stock', coalesce(p.stock, 0), 'allocated', v_alloc, 'stock_left', greatest(0, coalesce(p.stock, 0) - v_alloc),
    'is_priority', public.seller_is_priority(c.seller_id),
    'proposed', case when c.proposed_start is not null
                     then jsonb_build_object('start', c.proposed_start, 'end', c.proposed_end, 'qty', c.proposed_qty) end,
    'holders', public.campaign_period_holders(c.product_id, null, null, c.id),
    'price_locked', c.price_locked, 'rate_locked', c.rate_locked);
end;
$$;
revoke all on function public.app_seller_schedule_context(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_seller_schedule_context(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_confirm_schedule(p_brand_id, p_campaign_id) — 일정 승인 (confirmSchedule): SCHEDULE_PROPOSED → SCHEDULE_CONFIRMED
--   start_date/end_date/qty ← proposed_* · price_locked/rate_locked ← 상품 현재 판매가·수수료율 · 확정 시점에 우선 기간·재고 재검사
--   반환:
--     { ok:true,  already:false, campaign_id, campaign_code, status:'SCHEDULE_CONFIRMED', start, end, qty, price_locked, rate_locked, priority:bool }
--     { ok:true,  already:true,  … }                                    이미 확정
--     { ok:false, code:'NOT_FOUND' } · { ok:false, code:'WRONG_STATUS', status }
--     { ok:false, code:'PERIOD_PAST', start, today }                     제안 시작일이 이미 지남 → 반려하고 재제안 요청 (데모에 없던 가드)
--     { ok:false, code:'PERIOD_BLOCKED', by, handle, grade, start, end, campaign_code }   제안 뒤 플래티넘 이상이 선점 → 반려 권고
--     { ok:false, code:'STOCK_SHORT', left, qty, stock, allocated }      잔여 재고 < 제안 수량 → 재고를 늘리거나 반려
-- ------------------------------------------------------------
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

  return jsonb_build_object('ok', true, 'already', false, 'campaign_id', c.id, 'campaign_code', c.code, 'status', 'SCHEDULE_CONFIRMED',
    'start', c.proposed_start, 'end', c.proposed_end, 'qty', c.proposed_qty,
    'price_locked', p.sale_price, 'rate_locked', p.commission_rate, 'priority', v_prio);
end;
$$;
revoke all on function public.app_brand_confirm_schedule(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_brand_confirm_schedule(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_reject_schedule(p_brand_id, p_campaign_id, p_reason) — 일정 반려 (rejectSchedule): SCHEDULE_PROPOSED → TESTING (test_due 유지 · proposed_* 는 프리필용으로 유지)
--   p_reason 선택(≤ 200자). decision_reason 에 저장(다음 제안·확정 때 null 로).
--   반환: { ok:true, already:bool, campaign_id, campaign_code, status:'TESTING' } · { ok:false, code:'NOT_FOUND' } · { ok:false, code:'WRONG_STATUS', status }
--         already = 이미 TESTING (이중 클릭)
-- ------------------------------------------------------------
create or replace function public.app_brand_reject_schedule(p_brand_id uuid, p_campaign_id uuid, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c        public.campaigns%rowtype;
  v_reason text;
begin
  select * into c from public.campaigns where id = p_campaign_id and brand_id = p_brand_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if c.status = 'TESTING' then
    return jsonb_build_object('ok', true, 'already', true, 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status);
  end if;
  if c.status <> 'SCHEDULE_PROPOSED' then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;

  v_reason := nullif(left(regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g'), 200), '');

  update public.campaigns set status = 'TESTING', decision_reason = v_reason where id = c.id;

  -- 프로토타입 rejectSchedule 의 pushSys 원문 + 사유
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (c.id, 'system', 'system', 'brand',
          '브랜드가 일정을 반려했습니다 · 다른 기간으로 재제안해주세요' || coalesce(' · 사유: ' || v_reason, ''),
          'schedule_rejected',
          jsonb_strip_nulls(jsonb_build_object('reason', v_reason, 'start', c.proposed_start, 'end', c.proposed_end, 'qty', c.proposed_qty)));

  return jsonb_build_object('ok', true, 'already', false, 'campaign_id', c.id, 'campaign_code', c.code, 'status', 'TESTING');
end;
$$;
revoke all on function public.app_brand_reject_schedule(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_brand_reject_schedule(uuid, uuid, text) to service_role;

-- ------------------------------------------------------------
-- app_campaign_chat(p_actor_role, p_actor_id, p_actor_user_id, p_campaign_id, p_body) — 캠페인 스레드 채팅 (두 콘솔 공용 · sendChat/pushChat)
--   p_actor_role 'seller' → campaigns.seller_id = p_actor_id · 'brand' → campaigns.brand_id = p_actor_id (관리자 대행 발신은 관리자 콘솔에서).
--   본문: 앞뒤 공백 제거 · 제어문자(개행·탭 제외) 제거 · 1~1000자. 어떤 상태에서도 가능(종결 뒤 문의도 스레드에 남긴다 — 데모 동일).
--   반환:
--     { ok:true,  campaign_id, campaign_code, event:{id, kind:'chat', sender, actor_role, body, leak_flag, created_at, …}, leak_flag, warn_event_id }
--     { ok:false, code:'BAD_ROLE' } · { ok:false, code:'NOT_FOUND' } · { ok:false, code:'BAD_BODY', field:'body', max:1000 }
-- ------------------------------------------------------------
create or replace function public.app_campaign_chat(p_actor_role text, p_actor_id uuid, p_actor_user_id uuid, p_campaign_id uuid, p_body text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c       public.campaigns%rowtype;
  v_body  text;
  r       jsonb;
begin
  if p_actor_role not in ('seller', 'brand') then
    return jsonb_build_object('ok', false, 'code', 'BAD_ROLE');
  end if;
  select * into c from public.campaigns
   where id = p_campaign_id
     and ((p_actor_role = 'seller' and seller_id = p_actor_id) or (p_actor_role = 'brand' and brand_id = p_actor_id));
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  v_body := btrim(regexp_replace(coalesce(p_body, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g'));
  if v_body = '' or length(v_body) > 1000 then
    return jsonb_build_object('ok', false, 'code', 'BAD_BODY', 'field', 'body', 'max', 1000);
  end if;

  r := public.campaign_post_chat(c.id, p_actor_role, p_actor_user_id, v_body);
  return jsonb_build_object('ok', true, 'campaign_id', c.id, 'campaign_code', c.code) || r;
end;
$$;
revoke all on function public.app_campaign_chat(text, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_campaign_chat(text, uuid, uuid, uuid, text) to service_role;

-- ------------------------------------------------------------
-- app_brand_invite_candidates(p_brand_id, p_product_id) — 초대 대상 인플루언서 목록 (inviteModal · 갤러리의 3단계 부분집합)
--   조건: sellers.active · hidden=false(익명 스카우트는 6단계) · 우선권 등급 아님(플래티넘 이상은 6단계 🥬 게이트) · 메인 채널 verified
--         · 같은 상품 진행 중 캠페인 없음 · 독점 확정 상품이면 그 인플루언서만. 팔로워 내림차순 50명.
--   반환: { ok:true, product:{id, code, name, category, status, exclusive_seller_id}, candidates:[{id, code, name, handle, platform, avatar_url, grade, followers, category, category_fit, primary_channel}] }
--         { ok:false, code:'NOT_FOUND' }(내 상품 아님 · 삭제) · { ok:false, code:'NOT_LISTED', status }
-- ------------------------------------------------------------
create or replace function public.app_brand_invite_candidates(p_brand_id uuid, p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  p        public.products%rowtype;
  v_group  text;
  v_list   jsonb;
begin
  select * into p from public.products where id = p_product_id and brand_id = p_brand_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if p.status <> 'listed' then
    return jsonb_build_object('ok', false, 'code', 'NOT_LISTED', 'status', p.status);
  end if;
  select ct.group_name into v_group from public.categories ct where ct.name = p.category;

  select coalesce(jsonb_agg(row_json order by (row_json ->> 'followers')::integer desc, row_json ->> 'name'), '[]'::jsonb) into v_list
    from (
      select jsonb_build_object(
               'id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle, 'platform', s.platform, 'avatar_url', s.avatar_url,
               'grade', coalesce(s.grade, public.grade_for_sales(s.m3_sales)), 'followers', s.followers,
               'category', s.category,
               'category_fit', (v_group is not null and exists (select 1 from public.categories cs where cs.name = s.category and cs.group_name = v_group)),
               'primary_channel', (select jsonb_build_object('platform', ch.platform, 'handle', ch.handle, 'url', ch.url, 'followers', ch.followers, 'verified', ch.verified)
                                     from public.seller_channels ch where ch.seller_id = s.id and ch.is_primary limit 1)) as row_json
        from public.sellers s
       where s.active and not s.hidden
         and not public.seller_is_priority(s.id)
         and exists (select 1 from public.seller_channels ch where ch.seller_id = s.id and ch.is_primary and ch.verified)
         and not exists (select 1 from public.campaigns c where c.seller_id = s.id and c.product_id = p.id
                                                          and c.status not in ('REJECTED', 'PASSED', 'DECLINED', 'SETTLED'))
         and (p.exclusive_seller_id is null or p.exclusive_seller_id = s.id)
       order by s.followers desc, s.name
       limit 50) t;

  return jsonb_build_object('ok', true,
    'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'category', p.category, 'status', p.status, 'exclusive_seller_id', p.exclusive_seller_id),
    'candidates', v_list);
end;
$$;
revoke all on function public.app_brand_invite_candidates(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_brand_invite_candidates(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_invite_seller(p_brand_id, p_seller_id, p_product_id, p_message, p_actor_user_id) — 브랜드 직접 제안 (confirmInvite)
--   새 캠페인 INVITED(invited=true · cel_used=0) + 시스템 메시지 'invited' + (p_message 가 있으면) 브랜드 채팅 1행(감지 규칙 동일)
--   반환:
--     { ok:true,  campaign_id, campaign_code, status:'INVITED', seller:{id, name, handle, grade} }
--     { ok:false, code:'NOT_FOUND' }                                    내 상품 아님 · 삭제
--     { ok:false, code:'NOT_LISTED', status }                           노출 중이 아님 (inviteModal 은 listed 만 선택지)
--     { ok:false, code:'SELLER_NOT_FOUND' }                             없는·정지된 인플루언서
--     { ok:false, code:'SELLER_HIDDEN' }                                익명 인플루언서 — 갤러리 열람(6단계) 뒤
--     { ok:false, code:'PRIORITY_INVITE_GATED', grade, cost_cel }       플래티넘 이상 — 🥬 제안권(6단계)
--     { ok:false, code:'EXCLUSIVE_LOCKED' }                             다른 인플루언서에게 독점 확정
--     { ok:false, code:'ALREADY_ACTIVE', campaign_code, campaign_status }   같은 쌍 진행 중 (campaigns_active_pair_uidx)
--     { ok:false, code:'BAD_MESSAGE', max:500 }                         메시지 > 500자
-- ------------------------------------------------------------
create or replace function public.app_brand_invite_seller(p_brand_id uuid, p_seller_id uuid, p_product_id uuid, p_message text default null, p_actor_user_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  b          public.brands%rowtype;
  p          public.products%rowtype;
  s          public.sellers%rowtype;
  v_grade    text;
  v_prio     boolean;
  v_cost     integer;
  v_msg      text;
  v_active   record;
  v_cid      uuid;
  v_code     text;
begin
  select * into b from public.brands where id = p_brand_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select * into p from public.products where id = p_product_id and brand_id = p_brand_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if p.status <> 'listed' then
    return jsonb_build_object('ok', false, 'code', 'NOT_LISTED', 'status', p.status);
  end if;
  select * into s from public.sellers where id = p_seller_id for update;
  if not found or not s.active then
    return jsonb_build_object('ok', false, 'code', 'SELLER_NOT_FOUND');
  end if;
  v_grade := coalesce(s.grade, public.grade_for_sales(s.m3_sales));
  select gt.is_priority, gt.invite_cost_cel into v_prio, v_cost from public.grade_tiers gt where gt.name = v_grade;
  if coalesce(v_prio, false) then
    return jsonb_build_object('ok', false, 'code', 'PRIORITY_INVITE_GATED', 'grade', v_grade, 'cost_cel', coalesce(v_cost, 0));
  end if;
  if s.hidden then
    return jsonb_build_object('ok', false, 'code', 'SELLER_HIDDEN');
  end if;
  if p.exclusive_seller_id is not null and p.exclusive_seller_id <> s.id then
    return jsonb_build_object('ok', false, 'code', 'EXCLUSIVE_LOCKED');
  end if;
  select c.code, c.status into v_active from public.campaigns c
   where c.seller_id = s.id and c.product_id = p.id and c.status not in ('REJECTED', 'PASSED', 'DECLINED', 'SETTLED')
   order by c.created_at desc limit 1;
  if found then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_ACTIVE', 'campaign_code', v_active.code, 'campaign_status', v_active.status);
  end if;
  v_msg := nullif(btrim(regexp_replace(coalesce(p_message, ''), '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', 'g')), '');
  if v_msg is not null and length(v_msg) > 500 then
    return jsonb_build_object('ok', false, 'code', 'BAD_MESSAGE', 'max', 500);
  end if;

  begin
    insert into public.campaigns (seller_id, product_id, status, invited, cel_used)
    values (s.id, p.id, 'INVITED', true, 0)
    returning id, code into v_cid, v_code;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_ACTIVE');
  end;

  -- 프로토타입 confirmInvite 의 pushSys 원문
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
  values (v_cid, 'system', 'system', 'brand', p_actor_user_id,
          format('브랜드 %s가 %s 판매를 직접 제안했습니다 · 인플루언서 수락 대기', b.name, p.name),
          'invited',
          jsonb_strip_nulls(jsonb_build_object('brand_name', b.name, 'product_name', p.name, 'seller_grade', v_grade, 'message', v_msg)));
  if v_msg is not null then
    perform public.campaign_post_chat(v_cid, 'brand', p_actor_user_id, v_msg);
  end if;

  return jsonb_build_object('ok', true, 'campaign_id', v_cid, 'campaign_code', v_code, 'status', 'INVITED',
    'seller', jsonb_build_object('id', s.id, 'name', s.name, 'handle', s.handle, 'grade', v_grade));
end;
$$;
revoke all on function public.app_brand_invite_seller(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.app_brand_invite_seller(uuid, uuid, uuid, text, uuid) to service_role;

-- ------------------------------------------------------------
-- app_accept_invite(p_seller_id, p_campaign_id, p_shipping) — 제안 수락 (acceptInvite): INVITED → SAMPLE_APPROVED · sample_shipping · 이벤트 'invite_accepted'
--   배송지: p_shipping(폼) → 없으면 sellers.sample_address → 둘 다 없으면 BAD_SHIPPING. 폼 값은 sellers.sample_address 에도 저장(0011 과 동일).
--   반환:
--     { ok:true,  already:bool, campaign_id, campaign_code, status:'SAMPLE_APPROVED' }
--     { ok:false, code:'NOT_FOUND' } · { ok:false, code:'WRONG_STATUS', status }
--     { ok:false, code:'NOT_LISTED', status }                            노출 중단·검수 중 상품 ("브랜드에 문의하세요")
--     { ok:false, code:'EXCLUSIVE_LOCKED' }                              다른 인플루언서에게 독점 확정
--     { ok:false, code:'BAD_SHIPPING', field }                           recipient · phone · postcode · address1 · shipping
-- ------------------------------------------------------------
create or replace function public.app_accept_invite(p_seller_id uuid, p_campaign_id uuid, p_shipping jsonb default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c        public.campaigns%rowtype;
  s        public.sellers%rowtype;
  p        public.products%rowtype;
  v_norm   jsonb;
  v_ship   jsonb;
  v_from_form boolean := false;
begin
  select * into c from public.campaigns where id = p_campaign_id and seller_id = p_seller_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if c.status = 'SAMPLE_APPROVED' and c.invited then
    return jsonb_build_object('ok', true, 'already', true, 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status);
  end if;
  if c.status <> 'INVITED' then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;
  select * into s from public.sellers where id = c.seller_id for update;
  select * into p from public.products where id = c.product_id;
  if p.deleted_at is not null or p.status <> 'listed' then
    return jsonb_build_object('ok', false, 'code', 'NOT_LISTED', 'status', p.status);
  end if;
  if p.exclusive_seller_id is not null and p.exclusive_seller_id <> s.id then
    return jsonb_build_object('ok', false, 'code', 'EXCLUSIVE_LOCKED');
  end if;

  if p_shipping is not null and jsonb_typeof(p_shipping) = 'object' then
    v_norm := public.campaign_normalize_shipping(p_shipping);
    v_from_form := true;
  elsif s.sample_address is not null then
    v_norm := public.campaign_normalize_shipping(s.sample_address);
  else
    return jsonb_build_object('ok', false, 'code', 'BAD_SHIPPING', 'field', 'shipping');
  end if;
  if not (v_norm ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'code', 'BAD_SHIPPING', 'field', v_norm ->> 'field');
  end if;
  v_ship := v_norm -> 'shipping';

  update public.campaigns set status = 'SAMPLE_APPROVED', sample_shipping = v_ship where id = c.id;
  if v_from_form then
    update public.sellers set sample_address = v_ship where id = s.id;
  end if;

  -- 프로토타입 acceptInvite 의 pushSys 원문 (+ 익명 신원 공개)
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (c.id, 'system', 'system', 'seller',
          '인플루언서가 제안을 수락했습니다 · 샘플 발송 단계로 이동 (배송지 전달됨)'
            || case when s.hidden then format(' · 익명 인플루언서 신원 공개 — %s %s', s.name, s.handle) else '' end,
          'invite_accepted',
          jsonb_build_object('seller_name', s.name, 'handle', s.handle, 'revealed', s.hidden, 'has_shipping', true));

  return jsonb_build_object('ok', true, 'already', false, 'campaign_id', c.id, 'campaign_code', c.code, 'status', 'SAMPLE_APPROVED');
end;
$$;
revoke all on function public.app_accept_invite(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.app_accept_invite(uuid, uuid, jsonb) to service_role;

-- ------------------------------------------------------------
-- app_decline_invite(p_seller_id, p_campaign_id, p_reason) — 제안 거절 (declineInvite): INVITED → DECLINED · decision_reason · 이벤트 'invite_declined'
--   cel_used > 0 (다이아·블랙 제안권) 의 🥬 환급은 6단계(celery_ledger invite_refund) — 이 단계의 초대는 cel_used = 0.
--   반환: { ok:true, already:bool, campaign_id, campaign_code, status:'DECLINED' } · { ok:false, code:'NOT_FOUND' } · { ok:false, code:'WRONG_STATUS', status }
-- ------------------------------------------------------------
create or replace function public.app_decline_invite(p_seller_id uuid, p_campaign_id uuid, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c        public.campaigns%rowtype;
  v_reason text;
begin
  select * into c from public.campaigns where id = p_campaign_id and seller_id = p_seller_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if c.status = 'DECLINED' then
    return jsonb_build_object('ok', true, 'already', true, 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status);
  end if;
  if c.status <> 'INVITED' then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;

  v_reason := nullif(left(regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g'), 200), '');

  update public.campaigns set status = 'DECLINED', decision_reason = v_reason where id = c.id;

  -- 프로토타입 declineInvite 의 pushSys 원문 (🥬 환급 문구는 6단계)
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (c.id, 'system', 'system', 'seller',
          '인플루언서가 제안을 거절했습니다' || coalesce(' · 사유: ' || v_reason, ''),
          'invite_declined',
          jsonb_strip_nulls(jsonb_build_object('reason', v_reason, 'cel_used', c.cel_used)));

  return jsonb_build_object('ok', true, 'already', false, 'campaign_id', c.id, 'campaign_code', c.code, 'status', 'DECLINED');
end;
$$;
revoke all on function public.app_decline_invite(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_decline_invite(uuid, uuid, text) to service_role;

-- ------------------------------------------------------------
-- brand_campaign_json 재정의 (0015 + 3단계 열) — 기존 키는 그대로, 추가:
--   price_locked · rate_locked(확정 스냅샷) · stock(상품 재고) · stock_left(재고 − 배정량, 자기 캠페인 제외 — 일정 승인 패널의 "잔여 재고") · seller.is_priority
-- ------------------------------------------------------------
create or replace function public.brand_campaign_json(c public.campaigns)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id, 'code', c.code, 'status', c.status, 'created_at', c.created_at, 'updated_at', c.updated_at,
    'invited', c.invited, 'auto_proposed', c.auto_proposed, 'regongu', c.regongu,
    'purchased', c.purchased, 'sample_price', c.sample_price, 'sample_cel', c.sample_cel, 'sample_cash', c.sample_cash, 'sample_method', c.sample_method,
    'sample_courier', c.sample_courier, 'tracking_no', c.tracking_no, 'sample_shipped_at', c.sample_shipped_at,
    'received_at', c.received_at, 'test_due', c.test_due,
    'proposed_start', c.proposed_start, 'proposed_end', c.proposed_end, 'proposed_qty', c.proposed_qty,
    'start_date', c.start_date, 'end_date', c.end_date, 'qty', c.qty, 'sold_qty', c.sold_qty,
    'price_locked', c.price_locked, 'rate_locked', c.rate_locked,
    'decision_reason', c.decision_reason, 'settled_at', c.settled_at,
    'has_shipping', c.sample_shipping is not null,
    'stock', (select coalesce(p.stock, 0) from public.products p where p.id = c.product_id),
    'stock_left', (select greatest(0, coalesce(p.stock, 0) - public.product_allocated(p.id, c.id)) from public.products p where p.id = c.product_id),
    'product', (select jsonb_build_object(
                  'id', p.id, 'code', p.code, 'name', p.name, 'emoji', p.emoji, 'thumb_url', p.thumb_url, 'category', p.category,
                  'sale_price', p.sale_price, 'consumer_price', p.consumer_price, 'commission_rate', p.commission_rate,
                  'sample_text', p.sample_text, 'status', p.status)
                  from public.products p where p.id = c.product_id),
    'seller', (select jsonb_build_object(
                  'id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle, 'platform', s.platform, 'avatar_url', s.avatar_url,
                  'grade', coalesce(s.grade, public.grade_for_sales(s.m3_sales)), 'followers', s.followers, 'hidden', s.hidden,
                  'is_priority', public.seller_is_priority(s.id),
                  'primary_channel', (select jsonb_build_object('platform', ch.platform, 'handle', ch.handle, 'url', ch.url,
                                                                'followers', ch.followers, 'verified', ch.verified)
                                        from public.seller_channels ch where ch.seller_id = s.id and ch.is_primary limit 1))
                  from public.sellers s where s.id = c.seller_id))
$$;
revoke all on function public.brand_campaign_json(public.campaigns) from public, anon, authenticated;
grant execute on function public.brand_campaign_json(public.campaigns) to service_role;
