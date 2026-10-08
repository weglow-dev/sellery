-- ============================================================
-- 0047 — 등급별 월 무상 샘플 한도 폐지 (대표 결정 2026-10-08)
--
-- 결정: 무상 샘플의 "등급별 월 한도(스타터·브론즈 1회 · 실버·골드 2회 · 플래티넘 이상 5회)" 를 **없앤다**.
--       남는 무상 조건은 두 가지뿐이다.
--         (1) 내 등급 ≥ 상품의 무상 기준 등급 (products.sample_free_grade · 비면 platform_settings.sample_default_free_grade → 판매가 리터럴)
--         (2) 같은 상품은 무상 1회만 (had_free — seller×product 캠페인 중 purchased=false and invited=false and status ∉ (REJECTED, DECLINED))
--       샘플 구매(🥬 + 현금) · 브랜드 직접 제안(invited) · 환급 옵션 · 독점 잠김 · 진행 중 차단은 그대로다.
--
-- 바뀌는 것
--   · app_sample_quote: 이달 사용분(sampleUsed) · 잔여(sampleLeft) 계산을 **하지 않는다**. mode 판정은 locked → active → free(등급 ok and not had_free) → buy.
--     reason 에서 'QUOTA_EXHAUSTED' 가 사라진다(buy 의 reason 은 'GRADE_BELOW' | 'HAD_FREE' 뿐).
--     jsonb 키 quota · extra · used · left 는 **호환을 위해 남기되 중립값**으로 돌려준다 — quota: null · extra: 0 · used: 0 · left: null.
--     (packages/db/src/partner/sample-rules.ts 의 parseSampleQuote 는 이 키를 nullable 로 읽고 어떤 문구에도 쓰지 않는다.)
--   · app_sample_quotes · app_request_free_sample: 본문은 app_sample_quote 에 위임하므로 **그대로**(재정의 없음). 계약 설명(comment)만 갱신한다 —
--     app_request_free_sample 의 NOT_FREE reason 은 이제 GRADE_BELOW | HAD_FREE 뿐이다.
--   · grade_tiers.perk: "샘플 월 N회" 문구를 뺀다(인플루언서 콘솔 /ranking 의 혜택 열 · supabase/seed.sql 도 같은 값).
--
-- 남겨 두는 것(미사용 · 삭제하지 않음)
--   · grade_tiers.sample_quota 컬럼(0001 · not null check ≥ 0) · sellers.sample_extra 컬럼(0001) — 읽는 곳이 없어졌다. 지우려면 별도 마이그레이션.
--   · 0016 의 브랜드 직접 제안(invited) · 0012 샘플 구매(purchased) 플래그 — had_free 집계에서 제외하는 규칙은 그대로.
--
-- 실행: 0046 이후. 재실행 가능(create or replace · update).
-- 숫자·규칙의 정답은 docs/sample-policy.md(이 결정으로 §4 "월 한도" 삭제) · packages/core/src/helpers.ts(데모 sampleBtn 도 같이 고침).
-- ============================================================

-- ------------------------------------------------------------
-- app_sample_quote(p_seller_id, p_product_id, p_use_cel) — 샘플 견적 (0011 과 같은 계약 · 월 한도만 제거)
--   반환(jsonb, 키는 항상 존재 · 값은 null 가능):
--     mode            'free' | 'buy' | 'locked' | 'active' | 'unlisted'
--     reason          free: null · buy: 'GRADE_BELOW' | 'HAD_FREE' · locked: 'EXCLUSIVE_LOCKED' · active: 'ALREADY_ACTIVE'
--                     · unlisted: 'NOT_LISTED'(삭제·미노출·없는 상품) | 'NOT_FOUND'(없는 인플루언서)
--     free            boolean (= mode 'free')
--     price cel cash  샘플 구매가 · 🥬 개수 · 현금(토스 청구액). unlisted 면 null
--     use_cel method balance cel_won                    0011 과 동일
--     free_grade seller_grade free_eligible had_free   무상 기준 등급 · 인플루언서 등급 · 등급 충족 · 상품당 무상 1회 사용 여부
--     quota extra used left                             **호환용 중립값** — null · 0 · 0 · null (0047 — 월 한도 없음)
--     buy_mode fixed_price refund · exclusive_grade exclusive_locked · campaign_code campaign_status · seller_id product_id   0011 과 동일
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
  v_had_free     boolean := false;
  v_free_ok      boolean := false;
  v_locked       boolean := false;
  v_active_code  text;
  v_active_status text;
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
  select gt.sort_order into v_grade_idx from public.grade_tiers gt where gt.name = v_grade;
  if v_grade_idx is null then
    -- 등급 표에 없는 값 — 스타터로 취급
    select gt.name, gt.sort_order into v_grade, v_grade_idx
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

  -- (0047) 이달 사용분·잔여 계산은 없다 — 월 한도 폐지.

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

  -- mode 판정 (sampleBtn 분기 순서: 독점 잠김 → 진행 중 → 무상 → 구매) — 무상 = 등급 충족 and 상품당 1회 미사용
  if v_locked then
    v_mode := 'locked'; v_reason := 'EXCLUSIVE_LOCKED';
  elsif v_active_code is not null then
    v_mode := 'active'; v_reason := 'ALREADY_ACTIVE';
  elsif v_free_ok and not v_had_free then
    v_mode := 'free'; v_reason := null;
  else
    v_mode := 'buy';
    v_reason := case when not v_free_ok then 'GRADE_BELOW' else 'HAD_FREE' end;
  end if;

  return jsonb_build_object(
    'mode', v_mode, 'reason', v_reason, 'free', v_mode = 'free',
    'price', v_price, 'cel', v_cel, 'cash', v_cash, 'use_cel', v_use_cel,
    'method', case when v_cel > 0 then 'cel' else 'cash' end,
    'balance', v_balance, 'cel_won', v_cel_won,
    'free_grade', v_free_grade, 'seller_grade', v_grade, 'free_eligible', v_free_ok, 'had_free', v_had_free,
    -- 0047 호환용 중립값 — 월 한도 없음
    'quota', null, 'extra', 0, 'used', 0, 'left', null,
    'buy_mode', v_buy_mode, 'fixed_price', v_fixed, 'refund', v_refund,
    'exclusive_grade', p.exclusive_grade, 'exclusive_locked', v_locked,
    'campaign_code', v_active_code, 'campaign_status', v_active_status,
    'seller_id', s.id, 'product_id', p.id);
end;
$$;
revoke all on function public.app_sample_quote(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.app_sample_quote(uuid, uuid, boolean) to service_role;

comment on function public.app_sample_quote(uuid, uuid, boolean) is
  '샘플 견적 — 무상 = 등급 ≥ 상품 무상 기준 등급 and 상품당 1회 미사용 (0047: 등급별 월 한도 폐지 · quota/extra/used/left 는 호환용 중립값)';
comment on function public.app_sample_quotes(uuid, uuid[], boolean) is
  '갤러리용 일괄 견적 { "<product uuid>": app_sample_quote(...) } (0011 · 0047 로 월 한도 없음)';
comment on function public.app_request_free_sample(uuid, uuid, jsonb) is
  '무상 샘플 요청 — quote.mode = free 일 때만 campaigns(SAMPLE_REQUESTED) 생성. NOT_FREE 의 reason 은 GRADE_BELOW | HAD_FREE 뿐 (0047: 월 한도 폐지)';

-- ------------------------------------------------------------
-- grade_tiers.perk — "샘플 월 N회" 제거 (supabase/seed.sql · packages/core/src/constants.ts GRADES.perk 와 같은 값)
-- ------------------------------------------------------------
update public.grade_tiers set perk = v.perk
  from (values
    ('블랙',     '수수료 +3%p · 전담 매니저 · 판매 기간 우선권 · 독점권 우선 협상'),
    ('다이아',   '수수료 +2%p · 독점권 신청 · 판매 기간 우선권 · 스카우트 최상단'),
    ('플래티넘', '수수료 +1.5%p · 신상품 우선 제안권 · 판매 기간 우선권'),
    ('골드',     '수수료 +1%p'),
    ('실버',     '수수료 +0.5%p'),
    ('브론즈',   '수수료 +0.3%p'),
    ('스타터',   '기본 수수료율')
  ) as v(name, perk)
 where public.grade_tiers.name = v.name;

comment on column public.grade_tiers.sample_quota is '(0047 미사용) 옛 월 무상 샘플 한도 — 월 한도 폐지로 읽는 곳 없음. 삭제는 별도 마이그레이션';
comment on column public.sellers.sample_extra is '(0047 미사용) 옛 월 한도 추가분 — 월 한도 폐지로 읽는 곳 없음';
