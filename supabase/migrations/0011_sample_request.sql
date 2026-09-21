-- ============================================================
-- 0011 — 인플루언서 콘솔 3단계 "돈 없이 첫 캠페인": 샘플 견적 · 무상 샘플 요청 · 샘플 수령 확인 · campaigns.sample_shipping
--
-- 근거: docs/inf-console-plan.md §5.3(🥬+현금 규칙 · app_sample_quote 계약) · §5.4(0011 초안 중 3단계 부분집합) · §6(/products · /campaigns 화면) ·
--       §7 "3. 돈 없이 첫 캠페인"(완료 기준 a~d) · docs/sample-policy.md · docs/grade-policy.md.
-- 실행: 0010 이후. 재실행 가능(add column if not exists / create or replace).
-- 범위: 계획서의 "0011a" — 결제 테이블(partner_payments · app_begin/claim/confirm/fail/cancel_sample_purchase · celery_spend ·
--       expire/stale · recalc_campaign_sold_qty 재정의)은 **0012** 로 미룬다(4단계). 파일명이 `0011a_` 가 아닌 이유: Supabase CLI 는
--       `<숫자>_<이름>.sql` 만 마이그레이션으로 인식한다.
--
-- 숫자·규칙의 정답은 packages/core/src/{constants,helpers}.ts 다. 이 파일의 SQL 은 그 규칙을 그대로 옮긴 것이고, 바꿀 때는 둘을 함께 고친다.
--
-- | 규칙 | 코어 원본 | 여기서 |
-- |---|---|---|
-- | 등급 판정(스타터~블랙 7단계 · sort_order = tierIdx · "이상" = sort_order ≤) | GRADES · tierIdx · gname | sellers.grade(캐시) → grade_tiers.sort_order, 캐시가 비면 grade_for_sales(m3_sales) |
-- | 월 무상 한도 1/2/5 | sampleQuota | grade_tiers.sample_quota (+ sellers.sample_extra) |
-- | 이달 사용분 = 이달 생성 캠페인 중 invited·purchased 가 아닌 건수(상태 무관) | sampleUsed | campaigns.created_at 의 Asia/Seoul 달력월 |
-- | 상품별 무상 기준 등급 기본값: 판매가 <30,000 브론즈 · <80,000 실버 · 그 외 골드 | spOf | products.sample_free_grade, 비면 platform_settings.sample_default_free_grade → 실패 시 리터럴 |
-- | 무상 조건 = 등급 ≥ 기준 and 상품당 무상 1회 미사용 and 이달 잔여 > 0 (판정 순서 = 실패 사유 순서) | freeEligible · hadFreeSample · sampleLeft · sampleBtn | app_sample_quote mode/reason |
-- | 상품당 무상 1회 = 같은 seller×product 캠페인 중 purchased=false and invited=false and status ∉ (REJECTED, DECLINED) 가 존재 | hadFreeSample | had_free |
-- | 진행 중 = status ∉ (REJECTED, PASSED, DECLINED, SETTLED) — 0003 campaigns_active_pair_uidx 와 같은 집합 | ACTIVE_BLOCKERS | mode 'active' · 요청 시 ALREADY_ACTIVE |
-- | 독점 잠김 = products.exclusive_seller_id 가 있고 본인이 아님 (exclusive_grade 는 표시용 — 독점권 신청 자격이지 샘플 잠금이 아니다) | sampleBtn · exGradeOf | mode 'locked' · exclusive_grade |
-- | 샘플 가격 = 지정가(buy_mode='fixed' and fixed_price>0) 아니면 round(판매가 × (1 − 인플루언서 수수료율) / 10) × 10 | samplePrice | price (등급 보너스는 반영하지 않는다 — 코어와 동일 · 계획서 §5.3 의 "권장 반영" 은 미결) |
-- | 🥬 분할: cel = min(floor(price / 20,000), 잔액) · cash = price − cel×20,000 · 0<cash<100 이면 cel−1 (토스 최소 금액 §5.3) | sampleSplit · SAMPLE_CEL_WON | platform_settings.sample_cel_won(기본 20000) — 0003 campaigns_sample_split_consistent 의 20000 과 같은 값 |
-- | 테스트 기한 = 수령일 + 14 | TEST_DAYS · receiveSample | app_receive_sample 의 상수 14 (platform_settings.test_days 는 안내용) |
-- | 시스템 메시지 원문 | actions.ts reqSample · receiveSample (pushSys) | campaign_events.body 평문(<b> 제거) + event_type · payload |
--
-- 설계 요점
--   · 셋 다 security definer · service_role 만 execute(0007 패턴). 콘솔은 requireSeller() 로 얻은 seller.id 만 넘긴다 — 클라이언트가 보낸 id·금액은 믿지 않는다.
--   · app_sample_quote 는 **표시와 결제 생성(0012)이 같은 함수**를 쓴다(표시 금액 ≠ 청구 금액 방지). stable — 쓰지 않는다.
--   · app_request_free_sample 은 sellers 행을 `for update` 로 잠근 뒤 견적을 다시 계산한다 — 같은 인플루언서의 이중 제출은 직렬화되어
--     두 번째가 ALREADY_ACTIVE(또는 한도 소진 NOT_FREE) 로 끝난다. campaigns_active_pair_uidx 의 unique_violation 도 같은 코드로 돌려준다.
--   · 함수는 예외 대신 {ok, code} 를 돌려준다(0010 관례). 라우트는 code 를 문구로 바꾼다(packages/db/src/partner/sample-rules.ts).
--   · RLS 변경 없음 — 콘솔 읽기는 전부 service role + seller_id 필터(§4.4). sample_shipping 은 공개 grant 에 넣지 않는다(수취인 개인정보).
-- ============================================================

-- ------------------------------------------------------------
-- 컬럼 추가
-- ------------------------------------------------------------
-- 샘플 배송지 스냅샷 — { recipient, phone, postcode, address1, address2?, memo? } (orders.shipping · sellers.sample_address 와 같은 키).
-- 무상 요청(app_request_free_sample) 과 샘플 구매 확정(0012) 이 채운다. 브랜드 콘솔의 샘플 발송 화면이 읽는다.
alter table public.campaigns add column if not exists sample_shipping jsonb;
comment on column public.campaigns.sample_shipping is '샘플 배송지 스냅샷 {recipient, phone, postcode, address1, address2?, memo?} — 0011 (service role 전용)';

-- ------------------------------------------------------------
-- app_sample_quote(p_seller_id, p_product_id, p_use_cel) — 샘플 견적 (§5.3)
--   반환(jsonb, 키는 항상 존재 · 값은 null 가능):
--     mode            'free' | 'buy' | 'locked' | 'active' | 'unlisted'
--     reason          free: null · buy: 'GRADE_BELOW' | 'HAD_FREE' | 'QUOTA_EXHAUSTED' · locked: 'EXCLUSIVE_LOCKED' · active: 'ALREADY_ACTIVE'
--                     · unlisted: 'NOT_LISTED'(삭제·미노출·없는 상품) | 'NOT_FOUND'(없는 인플루언서)
--     free            boolean (= mode 'free') — 계획서 §5.3 응답 키
--     price cel cash  샘플 구매가 · 🥬 개수 · 현금(토스 청구액). mode 가 free/buy/locked/active 면 채워지고 unlisted 면 null
--     use_cel         입력 p_use_cel 이 실제 적용됐는지(cel 이 0 으로 떨어지면 false)
--     method          'cel' | 'cash'  (cel > 0 이면 'cel')
--     balance cel_won 🥬 잔액 · 🥬 1개의 원화(20000)
--     free_grade seller_grade free_eligible had_free   무상 기준 등급 · 인플루언서 등급 · 등급 충족 · 상품당 무상 1회 사용 여부
--     quota extra used left                             월 한도 · 추가분 · 이달 사용 · 잔여
--     buy_mode fixed_price refund                       'auto' | 'fixed' · 지정가 · 판매 확정 시 환급 옵션
--     exclusive_grade exclusive_locked                  독점권 오퍼 등급(표시용) · 다른 인플루언서에게 독점 확정됨
--     campaign_code campaign_status                     mode 'active' 일 때 진행 중 캠페인
--     seller_id product_id
-- ------------------------------------------------------------
create or replace function public.app_sample_quote(p_seller_id uuid, p_product_id uuid, p_use_cel boolean default false)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  s              public.sellers%rowtype;
  p              public.products%rowtype;
  v_grade        text;
  v_grade_idx    integer;
  v_free_grade   text;
  v_free_idx     integer;
  v_buy_mode     text;
  v_fixed        integer;
  v_refund       boolean;
  v_def          jsonb;
  t              jsonb;
  v_cel_won      integer;
  v_price        integer;
  v_cel          integer := 0;
  v_cash         integer;
  v_use_cel      boolean := coalesce(p_use_cel, false);
  v_balance      integer := 0;
  v_quota        integer := 0;
  v_used         integer := 0;
  v_left         integer := 0;
  v_had_free     boolean := false;
  v_free_ok      boolean := false;
  v_locked       boolean := false;
  v_active_code  text;
  v_active_status text;
  v_month        timestamp;
  v_mode         text;
  v_reason       text;
begin
  select * into s from public.sellers where id = p_seller_id;
  if not found then
    return jsonb_build_object('mode', 'unlisted', 'reason', 'NOT_FOUND', 'free', false,
      'price', null, 'cel', null, 'cash', null, 'seller_id', p_seller_id, 'product_id', p_product_id);
  end if;

  select * into p from public.products where id = p_product_id;
  if not found or p.deleted_at is not null or p.status <> 'listed' then
    return jsonb_build_object('mode', 'unlisted', 'reason', 'NOT_LISTED', 'free', false,
      'price', null, 'cel', null, 'cash', null, 'seller_id', s.id, 'product_id', p_product_id);
  end if;

  -- 등급 (sellers.grade 캐시 → 비면 m3_sales 로 재계산) · tierIdx = grade_tiers.sort_order (0 = 블랙)
  v_grade := coalesce(s.grade, public.grade_for_sales(s.m3_sales));
  select gt.sort_order, gt.sample_quota into v_grade_idx, v_quota from public.grade_tiers gt where gt.name = v_grade;
  if v_grade_idx is null then
    -- 등급 표에 없는 값 — 스타터로 취급
    select gt.name, gt.sort_order, gt.sample_quota into v_grade, v_grade_idx, v_quota
      from public.grade_tiers gt order by gt.sort_order desc limit 1;
  end if;

  -- 상품 샘플 정책 (spOf): 네 컬럼이 전부면 그대로, 아니면 platform_settings.sample_default_free_grade → 리터럴 폴백
  if p.sample_free_grade is not null then
    v_free_grade := p.sample_free_grade;
    v_buy_mode   := coalesce(p.sample_buy_mode, 'auto');
    v_fixed      := coalesce(p.sample_fixed_price, 0);
    v_refund     := coalesce(p.sample_refund, false);
  else
    select ps.value into v_def from public.platform_settings ps where ps.key = 'sample_default_free_grade';
    if v_def is not null and jsonb_typeof(v_def -> 'tiers') = 'array' then
      for t in select value from jsonb_array_elements(v_def -> 'tiers') loop
        if (t ->> 'below') is null or p.sale_price < (t ->> 'below')::integer then
          v_free_grade := t ->> 'grade';
          exit;
        end if;
      end loop;
    end if;
    if v_free_grade is null or not exists (select 1 from public.grade_tiers gt where gt.name = v_free_grade) then
      v_free_grade := case when p.sale_price < 30000 then '브론즈' when p.sale_price < 80000 then '실버' else '골드' end;
    end if;
    v_buy_mode := coalesce(v_def ->> 'buyMode', 'auto');
    v_fixed    := coalesce((v_def ->> 'fixedPrice')::integer, 0);
    v_refund   := coalesce((v_def ->> 'refund')::boolean, false);
  end if;
  select gt.sort_order into v_free_idx from public.grade_tiers gt where gt.name = v_free_grade;
  v_free_ok := v_free_idx is not null and v_grade_idx <= v_free_idx;

  -- 이달 사용분 (sampleUsed) · 잔여 (sampleLeft) — Asia/Seoul 달력월
  v_month := date_trunc('month', now() at time zone 'Asia/Seoul');
  select count(*)::integer into v_used
    from public.campaigns c
   where c.seller_id = s.id
     and not c.invited and not c.purchased
     and (c.created_at at time zone 'Asia/Seoul') >= v_month
     and (c.created_at at time zone 'Asia/Seoul') <  v_month + interval '1 month';
  v_left := greatest(0, v_quota + coalesce(s.sample_extra, 0) - v_used);

  -- 상품당 무상 1회 (hadFreeSample)
  v_had_free := exists (
    select 1 from public.campaigns c
     where c.seller_id = s.id and c.product_id = p.id
       and not c.purchased and not c.invited
       and c.status not in ('REJECTED', 'DECLINED'));

  -- 진행 중 캠페인 (ACTIVE_BLOCKERS 의 여집합)
  select c.code, c.status into v_active_code, v_active_status
    from public.campaigns c
   where c.seller_id = s.id and c.product_id = p.id
     and c.status not in ('REJECTED', 'PASSED', 'DECLINED', 'SETTLED')
   order by c.created_at desc
   limit 1;

  v_locked := p.exclusive_seller_id is not null and p.exclusive_seller_id <> s.id;

  -- 가격 (samplePrice) — 지정가는 0 보다 클 때만
  if v_buy_mode = 'fixed' and v_fixed > 0 then
    v_price := v_fixed;
  else
    v_price := (round(p.sale_price * (1 - p.commission_rate) / 10))::integer * 10;
  end if;

  -- 🥬 분할 (sampleSplit + 토스 최소 금액 100원 보정)
  select coalesce((ps.value #>> '{}')::integer, 20000) into v_cel_won from public.platform_settings ps where ps.key = 'sample_cel_won';
  v_cel_won := coalesce(v_cel_won, 20000);
  select coalesce(cb.balance, 0) into v_balance from public.celery_balances cb where cb.owner_type = 'seller' and cb.seller_id = s.id;
  v_balance := coalesce(v_balance, 0);
  if v_use_cel then
    v_cel  := least(floor(v_price::numeric / v_cel_won)::integer, greatest(v_balance, 0));
    v_cash := v_price - v_cel * v_cel_won;
    if v_cel > 0 and v_cash > 0 and v_cash < 100 then
      v_cel  := v_cel - 1;
      v_cash := v_price - v_cel * v_cel_won;
    end if;
    if v_cel <= 0 then
      v_cel := 0; v_cash := v_price; v_use_cel := false;
    end if;
  else
    v_cel := 0; v_cash := v_price;
  end if;

  -- mode 판정 (sampleBtn 분기 순서: 독점 잠김 → 진행 중 → 무상 → 구매)
  if v_locked then
    v_mode := 'locked'; v_reason := 'EXCLUSIVE_LOCKED';
  elsif v_active_code is not null then
    v_mode := 'active'; v_reason := 'ALREADY_ACTIVE';
  elsif v_free_ok and not v_had_free and v_left > 0 then
    v_mode := 'free'; v_reason := null;
  else
    v_mode := 'buy';
    v_reason := case when not v_free_ok then 'GRADE_BELOW' when v_had_free then 'HAD_FREE' else 'QUOTA_EXHAUSTED' end;
  end if;

  return jsonb_build_object(
    'mode', v_mode, 'reason', v_reason, 'free', v_mode = 'free',
    'price', v_price, 'cel', v_cel, 'cash', v_cash, 'use_cel', v_use_cel,
    'method', case when v_cel > 0 then 'cel' else 'cash' end,
    'balance', v_balance, 'cel_won', v_cel_won,
    'free_grade', v_free_grade, 'seller_grade', v_grade, 'free_eligible', v_free_ok, 'had_free', v_had_free,
    'quota', v_quota, 'extra', coalesce(s.sample_extra, 0), 'used', v_used, 'left', v_left,
    'buy_mode', v_buy_mode, 'fixed_price', v_fixed, 'refund', v_refund,
    'exclusive_grade', p.exclusive_grade, 'exclusive_locked', v_locked,
    'campaign_code', v_active_code, 'campaign_status', v_active_status,
    'seller_id', s.id, 'product_id', p.id);
end;
$$;
revoke all on function public.app_sample_quote(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.app_sample_quote(uuid, uuid, boolean) to service_role;

-- 갤러리용 일괄 견적 — { "<product uuid>": quote, … } (상품 카드마다 버튼 문구). 한 번의 RPC 로 N 상품.
create or replace function public.app_sample_quotes(p_seller_id uuid, p_product_ids uuid[], p_use_cel boolean default false)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select coalesce(jsonb_object_agg(pid::text, public.app_sample_quote(p_seller_id, pid, p_use_cel)), '{}'::jsonb)
    from unnest(coalesce(p_product_ids, '{}'::uuid[])) as pid
$$;
revoke all on function public.app_sample_quotes(uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.app_sample_quotes(uuid, uuid[], boolean) to service_role;

-- ------------------------------------------------------------
-- app_request_free_sample(p_seller_id, p_product_id, p_shipping) — 무상 샘플 요청 (한 트랜잭션)
--   quote.mode = 'free' 일 때만: campaigns(SAMPLE_REQUESTED, sample_shipping) + campaign_events('sample_requested') + sellers.sample_address 갱신.
--   반환:
--     { ok:true,  campaign_id, campaign_code, status:'SAMPLE_REQUESTED' }
--     { ok:false, code:'BAD_SHIPPING', field:'recipient'|'phone'|'postcode'|'address1'|'shipping' }   수취인·연락처(숫자 8~15)·우편번호·주소 필수
--     { ok:false, code:'NOT_FOUND' }                                    인플루언서 행 없음 · 정지(active=false)
--     { ok:false, code:'UNLISTED' }                                     상품 없음 · 삭제 · 미노출
--     { ok:false, code:'LOCKED' }                                       다른 인플루언서에게 독점 확정
--     { ok:false, code:'ALREADY_ACTIVE', campaign_code, campaign_status }  같은 상품 진행 중(이중 제출 포함)
--     { ok:false, code:'NOT_FREE', reason, price, cel, cash, quote }     등급 미달 · 상품당 1회 소진 · 이달 한도 소진 → 라우트는 [샘플 구매 ₩N] 으로
--   배송지는 정규화해 저장한다: 공백 정리 · 연락처 숫자만 · address2/memo 는 비면 키 제거 · 길이 상한(40/15/10/200/200/200).
-- ------------------------------------------------------------
create or replace function public.app_request_free_sample(p_seller_id uuid, p_product_id uuid, p_shipping jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  s            public.sellers%rowtype;
  p            public.products%rowtype;
  q            jsonb;
  v_recipient  text;
  v_phone      text;
  v_postcode   text;
  v_addr1      text;
  v_addr2      text;
  v_memo       text;
  v_ship       jsonb;
  v_cid        uuid;
  v_code       text;
begin
  -- 1. 배송지 검증 · 정규화
  if p_shipping is null or jsonb_typeof(p_shipping) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'BAD_SHIPPING', 'field', 'shipping');
  end if;
  v_recipient := left(regexp_replace(btrim(coalesce(p_shipping ->> 'recipient', '')), '\s+', ' ', 'g'), 40);
  v_phone     := regexp_replace(coalesce(p_shipping ->> 'phone', ''), '\D', '', 'g');
  v_postcode  := left(btrim(coalesce(p_shipping ->> 'postcode', '')), 10);
  v_addr1     := left(regexp_replace(btrim(coalesce(p_shipping ->> 'address1', '')), '\s+', ' ', 'g'), 200);
  v_addr2     := nullif(left(regexp_replace(btrim(coalesce(p_shipping ->> 'address2', '')), '\s+', ' ', 'g'), 200), '');
  v_memo      := nullif(left(regexp_replace(btrim(coalesce(p_shipping ->> 'memo', '')), '\s+', ' ', 'g'), 200), '');
  if v_recipient = '' then
    return jsonb_build_object('ok', false, 'code', 'BAD_SHIPPING', 'field', 'recipient');
  end if;
  if v_phone !~ '^\d{8,15}$' then
    return jsonb_build_object('ok', false, 'code', 'BAD_SHIPPING', 'field', 'phone');
  end if;
  if v_postcode = '' then
    return jsonb_build_object('ok', false, 'code', 'BAD_SHIPPING', 'field', 'postcode');
  end if;
  if v_addr1 = '' then
    return jsonb_build_object('ok', false, 'code', 'BAD_SHIPPING', 'field', 'address1');
  end if;
  v_ship := jsonb_strip_nulls(jsonb_build_object(
    'recipient', v_recipient, 'phone', v_phone, 'postcode', v_postcode,
    'address1', v_addr1, 'address2', v_addr2, 'memo', v_memo));

  -- 2. 인플루언서 행 잠금 — 같은 인플루언서의 동시 요청을 직렬화 (이중 제출 → 두 번째는 ALREADY_ACTIVE / NOT_FREE)
  select * into s from public.sellers where id = p_seller_id for update;
  if not found or not s.active then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  -- 3. 견적 재계산 (잠금 뒤)
  q := public.app_sample_quote(s.id, p_product_id, false);
  if q ->> 'mode' = 'unlisted' then
    return jsonb_build_object('ok', false, 'code', 'UNLISTED');
  elsif q ->> 'mode' = 'locked' then
    return jsonb_build_object('ok', false, 'code', 'LOCKED');
  elsif q ->> 'mode' = 'active' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_ACTIVE',
      'campaign_code', q ->> 'campaign_code', 'campaign_status', q ->> 'campaign_status');
  elsif q ->> 'mode' <> 'free' then
    return jsonb_build_object('ok', false, 'code', 'NOT_FREE', 'reason', q ->> 'reason',
      'price', q -> 'price', 'cel', q -> 'cel', 'cash', q -> 'cash', 'quote', q);
  end if;

  select * into p from public.products where id = p_product_id;

  -- 4. 캠페인 생성 (brand_id 는 campaigns_fill_brand 트리거가 채운다)
  begin
    insert into public.campaigns (seller_id, product_id, status, sample_shipping)
    values (s.id, p.id, 'SAMPLE_REQUESTED', v_ship)
    returning id, code into v_cid, v_code;
  exception when unique_violation then
    -- campaigns_active_pair_uidx — 잠금 밖에서 만들어진 진행 중 캠페인
    return jsonb_build_object('ok', false, 'code', 'ALREADY_ACTIVE');
  end;

  -- 5. 스레드 시스템 메시지 (프로토타입 reqSample 의 pushSys 원문 · 평문)
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (v_cid, 'system', 'system', 'seller',
          format('인플루언서 %s(%s)가 샘플을 요청했습니다', s.name, s.handle),
          'sample_requested',
          jsonb_build_object('seller_name', s.name, 'handle', s.handle, 'product_name', p.name));

  -- 6. 배송지 기본값 갱신 (다음 요청·결제 폼 프리필)
  update public.sellers set sample_address = v_ship where id = s.id;

  return jsonb_build_object('ok', true, 'campaign_id', v_cid, 'campaign_code', v_code, 'status', 'SAMPLE_REQUESTED');
end;
$$;
revoke all on function public.app_request_free_sample(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.app_request_free_sample(uuid, uuid, jsonb) to service_role;

-- ------------------------------------------------------------
-- app_receive_sample(p_seller_id, p_campaign_id) — 샘플 수령 확인: SAMPLE_SHIPPED → TESTING · test_due = 오늘(KST) + 14 · 이벤트 'sample_received'
--   반환:
--     { ok:true,  already:false, campaign_id, campaign_code, status:'TESTING', test_due:'YYYY-MM-DD' }
--     { ok:true,  already:true,  campaign_id, campaign_code, status:'TESTING', test_due }     이미 TESTING (멱등 — 새로고침·이중 클릭)
--     { ok:false, code:'NOT_FOUND' }                                   본인 캠페인이 아님 · 없는 id (구분하지 않는다 — 라우트는 404)
--     { ok:false, code:'NOT_SHIPPED', status }                         SAMPLE_SHIPPED 가 아닌 상태
-- ------------------------------------------------------------
create or replace function public.app_receive_sample(p_seller_id uuid, p_campaign_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c        public.campaigns%rowtype;
  -- TEST_DAYS (packages/core/src/constants.ts) = 14 · platform_settings.test_days 는 안내용 — 바꾸려면 셋을 함께 바꾼다
  v_days   constant integer := 14;
  v_due    date;
begin
  select * into c from public.campaigns where id = p_campaign_id and seller_id = p_seller_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if c.status = 'TESTING' then
    return jsonb_build_object('ok', true, 'already', true, 'campaign_id', c.id, 'campaign_code', c.code,
      'status', c.status, 'test_due', c.test_due);
  end if;
  if c.status <> 'SAMPLE_SHIPPED' then
    return jsonb_build_object('ok', false, 'code', 'NOT_SHIPPED', 'status', c.status);
  end if;

  v_due := (now() at time zone 'Asia/Seoul')::date + v_days;
  update public.campaigns
     set status = 'TESTING', received_at = now(), test_due = v_due
   where id = c.id;

  -- 프로토타입 receiveSample 의 pushSys 원문 (평문 · M/D)
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (c.id, 'system', 'system', 'seller',
          format('인플루언서가 샘플을 수령했습니다 · 테스트 기한 %s', to_char(v_due, 'FMMM/FMDD')),
          'sample_received',
          jsonb_build_object('test_due', v_due));

  return jsonb_build_object('ok', true, 'already', false, 'campaign_id', c.id, 'campaign_code', c.code,
    'status', 'TESTING', 'test_due', v_due);
end;
$$;
revoke all on function public.app_receive_sample(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_receive_sample(uuid, uuid) to service_role;
