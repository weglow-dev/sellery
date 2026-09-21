-- ============================================================
-- 0015 — 브랜드 콘솔 2단계: 상품 등록·수정·노출·삭제 · 브랜드 시점 캠페인 읽기 · 샘플 승인/거절/발송 · 상품 검수(운영)
--        product_code_seq · campaigns.sample_courier / sample_shipped_at
--        app_brand_upsert_product · app_brand_set_listing · app_brand_delete_product
--        app_brand_requests · app_brand_campaigns · app_brand_campaign
--        app_brand_approve_sample · app_brand_reject_sample · app_brand_ship_sample
--        app_admin_review_product (운영 스크립트 전용)
--
-- 근거: docs/brand-console-plan.md §0 결정 7·9·15 · §1(상태 기계 브랜드 차례) · §4 "0015 2단계" · §5(/products · /requests · /campaigns) · §8(재고 가드 · 옵션가 잠금)
--       · 인플루언서 0011(캠페인 생성 · campaign_events 관례) 의 브랜드 짝.
-- 실행: 0014 이후. 재실행 가능(add column if not exists / create sequence if not exists / create or replace).
--       0001~0014 파일은 수정하지 않는다 — products(0002) · campaigns(0003) 정의는 그대로 두고 컬럼·기본값·함수만 **추가**한다.
--
-- 숫자·규칙의 정답은 packages/core/src/{constants,helpers,actions}.ts 다. 이 파일의 SQL 은 그 규칙을 그대로 옮긴 것이고, 바꿀 때는 둘을 함께 고친다.
--
-- | 규칙 | 코어 원본 | 여기서 |
-- |---|---|---|
-- | 인플루언서 수수료율 = max(5%, 총 요율 − 플랫폼 10%p) — 브랜드가 입력하는 것은 **총 요율(%)** | createProduct/saveProduct `Math.max(5, totalRate − PLAT_RATE*100)/100` | app_brand_upsert_product: `greatest(min_seller_rate, total_rate/100 − 0.10)` · 총 요율 ≤ 10 은 INVALID_INPUT(total_rate) |
-- | 새 상품은 `pending`(관리자 검수 뒤 `listed`) | createProduct `status:'pending'` | insert 기본값 그대로 |
-- | 잠금 = SCHEDULE_CONFIRMED / LIVE / CLEARING 캠페인 존재 → 소비자가·판매가·수수료율 불변 | saveProduct `locked` | product_is_locked() → LOCKED_FIELD{field}. **옵션도 불변**(§8 — 고객 결제 단가가 옵션가) |
-- | 미잠금에서 판매가·수수료율이 바뀌면 listed → pending 재검수 · rejected 는 저장 시 pending | saveProduct `changed && status==='listed'` · `rejected → pending` | rereview:true |
-- | 재고는 배정량(SCHEDULE_CONFIRMED / LIVE qty 합) 아래로 못 내린다 — **데모에 없던 가드**(§8 · period-policy §4) | allocated · stockLeft | product_allocated() → STOCK_BELOW_ALLOCATED{allocated} |
-- | 옵션 비면 1개 / 2개 −5% / 3개 −10% 자동 | optsOf | 저장은 `[]` — 읽을 때 0008 resolve_product_options 가 만든다(판매가가 바뀌어도 자동 옵션이 따라간다) |
-- | 샘플 정책 4열 all-or-none · 독점 기준 등급은 상위 4단계 | spOf · GRADES.slice(0,4) | 0002 제약과 같은 검사 → INVALID_INPUT(sample_policy · exclusive_grade) |
-- | 독점 인플루언서가 확정된 상품은 독점 오퍼를 해제하지 못한다 | saveProduct `else if (!p.exclusiveSellerId) delete p.exclusive` | exclusive_seller_id 가 있으면 입력의 해제를 무시(데모와 동일 · 조용히 유지) |
-- | 이미지 ≤ 4장 | createProduct `imgs.slice(0,4)` | INVALID_INPUT(image_urls) |
-- | 노출 토글은 listed ⇄ paused 만 | toggleListing `pending/rejected → return` | NOT_REVIEWED{status} |
-- | 삭제는 종결(REJECTED / PASSED / DECLINED)만 있는 상품 — SETTLED 도 이력이라 막는다 | deleteProduct | HAS_ACTIVE_CAMPAIGNS{count} · deleted_at=now() (0002 헤더의 소프트 삭제) |
-- | 샘플 승인 = SAMPLE_REQUESTED → SAMPLE_APPROVED · 거절 = → REJECTED | approveSample · rejectSample (transition) | app_brand_approve_sample · app_brand_reject_sample(decision_reason) |
-- | 샘플 발송 = SAMPLE_APPROVED 또는 SAMPLE_PURCHASED → SAMPLE_SHIPPED · **택배사 + 송장 필수**(데모의 자동 송장 생성 없음 — 결정 7) | shipSample | app_brand_ship_sample: BAD_COURIER · BAD_TRACKING · sample_courier / tracking_no / sample_shipped_at |
-- | 검수 승인 시 재고 0 이면 기본 재고 | approveProduct `p.stock || 500` | platform_settings.default_stock_on_approve(없으면 500) |
-- | 시스템 메시지 원문 | actions.ts approveSample · rejectSample · shipSample (pushSys) | campaign_events.body 평문(<b> 제거) + event_type + payload (0011 관례) |
--
-- 설계 요점
--   · 전부 security definer · service_role 만 execute(0007 패턴). 콘솔은 requireBrand() 로 얻은 brand.id 만 넘긴다 — 클라이언트가 보낸 id·금액은 믿지 않는다.
--   · 소유권은 `products.brand_id` / `campaigns.brand_id`(0003 트리거가 채우는 비정규화 열). 남의 것은 NOT_FOUND 로 — 존재 여부를 구분하지 않는다(라우트 404).
--   · 상태 전이는 `campaigns for update` → 상태 검사 → update → campaign_events(kind='system') 1행을 한 트랜잭션에(§4). 멱등: 이미 목표 상태면 {ok:true, already:true}.
--   · 읽기 3종(app_brand_requests · app_brand_campaigns · app_brand_campaign)은 인플루언서 요약(이름·핸들·플랫폼·아바타·등급·팔로워·메인 채널 인증 여부)과
--     상품 요약을 SQL 에서 조립한다 — hidden 인플루언서라도 **나에게 샘플을 요청한 당사자**이므로 브랜드에게는 신원을 보인다(스카우트 갤러리의 ○○○ 규칙은 6단계).
--     sample_shipping(수취인 개인정보)은 상세(app_brand_campaign)에서만, 발송 목적으로 노출한다(0011 헤더).
--   · 함수는 예외 대신 {ok, code} 를 돌려준다(0010~0014 관례). 라우트는 code 를 문구로 바꾼다(packages/db/src/brand/{product,campaign}-rules.ts).
--   · RLS 변경 없음. 상품 이미지는 0006 의 공개 버킷 public-assets(products/<brand>/…) 를 그대로 쓴다 — 새 버킷 없음.
-- ============================================================

-- ------------------------------------------------------------
-- 컬럼 · 시퀀스
-- ------------------------------------------------------------
-- 상품 코드 기본값 — 시드 p1~p10 과 겹치지 않게 100 부터 (0003 campaign_code_seq · 0014 brand_code_seq 와 같은 방식)
create sequence if not exists public.product_code_seq start 100;
alter table public.products alter column code set default ('p' || nextval('public.product_code_seq'));

-- 샘플 발송 택배사 — 0004 orders.courier 와 같은 목록(@sellery/db carriers.ts COURIERS). 인플루언서 상세의 조회 링크(trackingUrlOf) 용.
alter table public.campaigns add column if not exists sample_courier text;
alter table public.campaigns drop constraint if exists campaigns_sample_courier_check;
alter table public.campaigns add constraint campaigns_sample_courier_check
  check (sample_courier is null or sample_courier in ('CJ대한통운','우체국택배','한진택배','롯데택배','로젠택배'));
comment on column public.campaigns.sample_courier is '샘플 발송 택배사 (0015 · orders.courier 와 같은 목록) — app_brand_ship_sample 이 채운다';

-- 샘플 발송 시각 — 데모는 상태만 바꿨다. 인플루언서 상세 "발송 M/D" · 발송 뒤 취소 불가 판정(0012 refund 는 상태로 판정) 참고용.
alter table public.campaigns add column if not exists sample_shipped_at timestamptz;
comment on column public.campaigns.sample_shipped_at is '샘플 발송 처리 시각 (0015 app_brand_ship_sample)';

-- ------------------------------------------------------------
-- 헬퍼 — 배정량 · 잠금 (helpers.ts allocated · saveProduct locked). 서버 전용.
-- ------------------------------------------------------------
-- allocated(pid, exceptCid): 확정·진행 중(SCHEDULE_CONFIRMED / LIVE) 캠페인 qty 합 — 0003 campaigns_period_idx 와 같은 집합
create or replace function public.product_allocated(p_product_id uuid, p_except_campaign_id uuid default null)
returns integer
language sql stable
set search_path = public
as $$
  select coalesce(sum(c.qty), 0)::integer
    from public.campaigns c
   where c.product_id = p_product_id
     and c.status in ('SCHEDULE_CONFIRMED', 'LIVE')
     and (p_except_campaign_id is null or c.id <> p_except_campaign_id)
$$;
revoke all on function public.product_allocated(uuid, uuid) from public, anon, authenticated;
grant execute on function public.product_allocated(uuid, uuid) to service_role;

-- locked: 확정·진행·환불 기간(SCHEDULE_CONFIRMED / LIVE / CLEARING) 캠페인이 하나라도 있으면 가격·요율·옵션 불변
create or replace function public.product_is_locked(p_product_id uuid)
returns boolean
language sql stable
set search_path = public
as $$
  select exists (
    select 1 from public.campaigns c
     where c.product_id = p_product_id
       and c.status in ('SCHEDULE_CONFIRMED', 'LIVE', 'CLEARING'))
$$;
revoke all on function public.product_is_locked(uuid) from public, anon, authenticated;
grant execute on function public.product_is_locked(uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_upsert_product(p_brand_id, p_product_id, p_input) — 상품 등록(p_product_id null) · 수정
--   p_input(jsonb) 키 — 폼(@sellery/db brand/product-rules parseProductInput) 이 정규화한 값. 함수가 같은 조건을 다시 검사한다.
--     name             text 1~80                      (필수)
--     description      text ≤ 300                     (비면 null — 데모 '—' 는 표시용)
--     emoji            text ≤ 8                       (비면 '📦')
--     category         categories.name                (필수 — 데모 기본값 '건기식' 은 FK 위반, §4)
--     consumer_price   int ≥ 0                        (필수)
--     sale_price       int > 0                        (필수)
--     total_rate       numeric 총 수수료율(%) > 10     (필수 — 플랫폼 10%p 포함, 데모 폼 값 그대로) → commission_rate = greatest(min_seller_rate, total/100 − 0.10)
--     stock            int ≥ 0                        (비면 0)
--     sample_text      text ≤ 60                      (비면 '무상 1개')
--     sample_policy    {free_grade, buy_mode 'auto'|'fixed', fixed_price ≥ 0, refund bool} 또는 null (all-or-none · 0002 제약)
--     exclusive_grade  '블랙'|'다이아'|'플래티넘'|'골드' 또는 null · exclusive_label text ≤ 80 (비면 '<등급> 등급 독점권')
--     options          [{n text 1~60, price int > 0}] ≤ 20 (비면 [] — 읽을 때 resolve_product_options 가 자동 옵션)
--     thumb_url        text ≤ 500 또는 null · image_urls text[] ≤ 4 (각 ≤ 500) — 서버가 Storage 에 올린 뒤 URL 만 넘긴다
--   반환:
--     { ok:true,  product_id, code, status, created:true }                          새 상품 (status 'pending')
--     { ok:true,  product_id, code, status, created:false, rereview:bool, locked:bool }  수정 (rereview = listed 였는데 판매가·요율이 바뀌어 pending 으로)
--     { ok:false, code:'NOT_FOUND' }                                                 내 상품이 아님 · 삭제됨 · 없는 id
--     { ok:false, code:'INVALID_INPUT', field }                                      name · category · consumer_price · sale_price · total_rate · stock · sample_text · sample_policy
--                                                                                    · exclusive_grade · exclusive_label · options · image_urls · thumb_url · emoji · description
--     { ok:false, code:'LOCKED_FIELD', field }                                       진행 캠페인 있는데 consumer_price · sale_price · total_rate(commission_rate) · options 변경
--     { ok:false, code:'STOCK_BELOW_ALLOCATED', allocated, stock }                   재고를 배정량 아래로
-- ------------------------------------------------------------
create or replace function public.app_brand_upsert_product(p_brand_id uuid, p_product_id uuid, p_input jsonb)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p              public.products%rowtype;
  v_create       boolean := p_product_id is null;
  v_name         text;
  v_desc         text;
  v_emoji        text;
  v_category     text;
  v_cp           integer;
  v_gp           integer;
  v_total        numeric;
  v_rate         numeric(5,4);
  v_min_rate     numeric := 0.05;
  v_stock        integer;
  v_sample_text  text;
  v_sp           jsonb;
  v_sp_grade     text;
  v_sp_mode      text;
  v_sp_fixed     integer;
  v_sp_refund    boolean;
  v_ex_grade     text;
  v_ex_label     text;
  v_opts         jsonb := '[]'::jsonb;
  v_opt          jsonb;
  v_opt_n        text;
  v_opt_price    integer;
  v_thumb        text;
  v_imgs         text[] := '{}';
  v_img          text;
  v_locked       boolean := false;
  v_allocated    integer := 0;
  v_status       text;
  v_rereview     boolean := false;
  v_id           uuid;
  v_code         text;
begin
  if p_input is null or jsonb_typeof(p_input) <> 'object' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'input');
  end if;

  -- 0. 수정 대상 잠금 (동시 저장 직렬화) · 소유 확인
  if not v_create then
    select * into p from public.products
     where id = p_product_id and brand_id = p_brand_id and deleted_at is null
     for update;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
    end if;
    v_locked := public.product_is_locked(p.id);
  end if;

  -- 1. 검증 · 정규화 (순서 = 폼 필드 순서)
  v_name := left(regexp_replace(btrim(coalesce(p_input ->> 'name', '')), '\s+', ' ', 'g'), 81);
  if v_name = '' or length(v_name) > 80 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'name');
  end if;

  v_desc := nullif(regexp_replace(btrim(coalesce(p_input ->> 'description', '')), '\s+', ' ', 'g'), '');
  if v_desc is not null and length(v_desc) > 300 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'description');
  end if;

  v_emoji := nullif(btrim(coalesce(p_input ->> 'emoji', '')), '');
  if v_emoji is not null and length(v_emoji) > 8 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'emoji');
  end if;
  v_emoji := coalesce(v_emoji, case when v_create then '📦' else p.emoji end, '📦');

  v_category := btrim(coalesce(p_input ->> 'category', ''));
  if v_category = '' or not exists (select 1 from public.categories ct where ct.name = v_category) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'category');
  end if;

  begin
    v_cp := (p_input ->> 'consumer_price')::integer;
    v_gp := (p_input ->> 'sale_price')::integer;
    v_total := (p_input ->> 'total_rate')::numeric;
    v_stock := coalesce((p_input ->> 'stock')::integer, 0);
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'number');
  end;
  if v_cp is null or v_cp < 0 or v_cp > 100000000 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'consumer_price');
  end if;
  if v_gp is null or v_gp <= 0 or v_gp > 100000000 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'sale_price');
  end if;
  -- 총 요율(%) — 플랫폼 10%p 보다 커야 한다(데모 폼 rateCalc 의 경고). 상한 없음(§8 — 힌트 11~50 은 문구).
  if v_total is null or v_total <= 10 or v_total > 100 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'total_rate');
  end if;
  select coalesce((ps.value #>> '{}')::numeric, 0.05) into v_min_rate from public.platform_settings ps where ps.key = 'min_seller_rate';
  v_min_rate := coalesce(v_min_rate, 0.05);
  v_rate := round(greatest(v_min_rate, v_total / 100 - 0.10), 4);
  if v_stock < 0 or v_stock > 10000000 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'stock');
  end if;

  v_sample_text := nullif(regexp_replace(btrim(coalesce(p_input ->> 'sample_text', '')), '\s+', ' ', 'g'), '');
  if v_sample_text is not null and length(v_sample_text) > 60 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'sample_text');
  end if;
  v_sample_text := coalesce(v_sample_text, '무상 1개');

  -- 샘플 정책 — 객체면 네 키 전부, 아니면 전부 null (0002 products_sample_policy_all_or_none)
  v_sp := p_input -> 'sample_policy';
  if v_sp is not null and jsonb_typeof(v_sp) = 'object' and coalesce(v_sp ->> 'free_grade', '') <> '' then
    v_sp_grade := v_sp ->> 'free_grade';
    v_sp_mode  := coalesce(v_sp ->> 'buy_mode', 'auto');
    begin
      v_sp_fixed := coalesce((v_sp ->> 'fixed_price')::integer, 0);
    exception when others then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'sample_policy');
    end;
    v_sp_refund := coalesce((v_sp ->> 'refund')::boolean, false);
    if not exists (select 1 from public.grade_tiers gt where gt.name = v_sp_grade)
       or v_sp_mode not in ('auto', 'fixed')
       or v_sp_fixed < 0 or v_sp_fixed > 100000000
       or (v_sp_mode = 'fixed' and v_sp_fixed <= 0) then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'sample_policy');
    end if;
  else
    v_sp_grade := null; v_sp_mode := null; v_sp_fixed := null; v_sp_refund := null;
  end if;

  -- 독점 오퍼 — 상위 4단계만 (0002 products_exclusive_grade_top4)
  v_ex_grade := nullif(btrim(coalesce(p_input ->> 'exclusive_grade', '')), '');
  if v_ex_grade is not null and v_ex_grade not in ('블랙', '다이아', '플래티넘', '골드') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'exclusive_grade');
  end if;
  v_ex_label := nullif(regexp_replace(btrim(coalesce(p_input ->> 'exclusive_label', '')), '\s+', ' ', 'g'), '');
  if v_ex_label is not null and length(v_ex_label) > 80 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'exclusive_label');
  end if;
  if v_ex_grade is not null then
    v_ex_label := coalesce(v_ex_label, v_ex_grade || ' 등급 독점권');
  else
    v_ex_label := null;
  end if;
  -- 독점 인플루언서가 확정된 상품은 오퍼를 해제하지 못한다 — 데모와 같이 기존 값을 유지한다
  if not v_create and p.exclusive_seller_id is not null and v_ex_grade is null then
    v_ex_grade := p.exclusive_grade;
    v_ex_label := p.exclusive_label;
  end if;

  -- 옵션 — [{n, price}] ≤ 20 · 비면 []
  if p_input ? 'options' and p_input -> 'options' is not null and jsonb_typeof(p_input -> 'options') <> 'null' then
    if jsonb_typeof(p_input -> 'options') <> 'array' or jsonb_array_length(p_input -> 'options') > 20 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'options');
    end if;
    for v_opt in select value from jsonb_array_elements(p_input -> 'options') loop
      if jsonb_typeof(v_opt) <> 'object' then
        return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'options');
      end if;
      v_opt_n := left(regexp_replace(btrim(coalesce(v_opt ->> 'n', '')), '\s+', ' ', 'g'), 61);
      begin
        v_opt_price := (v_opt ->> 'price')::integer;
      exception when others then
        return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'options');
      end;
      if v_opt_n = '' or length(v_opt_n) > 60 or v_opt_price is null or v_opt_price <= 0 or v_opt_price > 100000000 then
        return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'options');
      end if;
      v_opts := v_opts || jsonb_build_object('n', v_opt_n, 'price', v_opt_price);
    end loop;
  end if;

  -- 이미지 — URL 문자열만 (Storage 업로드는 서버가 먼저 한다) · 썸네일 ≤ 500 · 상세 ≤ 4장
  v_thumb := nullif(btrim(coalesce(p_input ->> 'thumb_url', '')), '');
  if v_thumb is not null and (length(v_thumb) > 500 or v_thumb ~ '\s') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'thumb_url');
  end if;
  if p_input ? 'image_urls' and jsonb_typeof(p_input -> 'image_urls') = 'array' then
    if jsonb_array_length(p_input -> 'image_urls') > 4 then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'image_urls');
    end if;
    for v_img in select value #>> '{}' from jsonb_array_elements(p_input -> 'image_urls') loop
      v_img := btrim(coalesce(v_img, ''));
      if v_img = '' or length(v_img) > 500 or v_img ~ '\s' then
        return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'image_urls');
      end if;
      v_imgs := v_imgs || v_img;
    end loop;
  elsif p_input ? 'image_urls' and jsonb_typeof(p_input -> 'image_urls') not in ('null') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'image_urls');
  end if;

  -- 2. 등록
  if v_create then
    insert into public.products (brand_id, name, description, emoji, thumb_url, image_urls, category,
                                 consumer_price, sale_price, commission_rate, sample_text, stock, status,
                                 exclusive_grade, exclusive_label,
                                 sample_free_grade, sample_buy_mode, sample_fixed_price, sample_refund, options)
    values (p_brand_id, v_name, v_desc, v_emoji, v_thumb, v_imgs, v_category,
            v_cp, v_gp, v_rate, v_sample_text, v_stock, 'pending',
            v_ex_grade, v_ex_label,
            v_sp_grade, v_sp_mode, v_sp_fixed, v_sp_refund, v_opts)
    returning id, code into v_id, v_code;
    return jsonb_build_object('ok', true, 'product_id', v_id, 'code', v_code, 'status', 'pending', 'created', true);
  end if;

  -- 3. 수정 — 잠금 가드 (saveProduct locked) · 옵션은 §8 결정으로 전체 불변
  if v_locked then
    if v_cp <> p.consumer_price then
      return jsonb_build_object('ok', false, 'code', 'LOCKED_FIELD', 'field', 'consumer_price');
    end if;
    if v_gp <> p.sale_price then
      return jsonb_build_object('ok', false, 'code', 'LOCKED_FIELD', 'field', 'sale_price');
    end if;
    if v_rate <> p.commission_rate then
      return jsonb_build_object('ok', false, 'code', 'LOCKED_FIELD', 'field', 'total_rate');
    end if;
    if v_opts <> coalesce(p.options, '[]'::jsonb) then
      return jsonb_build_object('ok', false, 'code', 'LOCKED_FIELD', 'field', 'options');
    end if;
  end if;

  -- 재고 가드 (§8 STOCK_BELOW_ALLOCATED) — 잠금 여부와 무관
  v_allocated := public.product_allocated(p.id);
  if v_stock < v_allocated then
    return jsonb_build_object('ok', false, 'code', 'STOCK_BELOW_ALLOCATED', 'allocated', v_allocated, 'stock', v_stock);
  end if;

  -- 재검수 판정 (saveProduct: 미잠금 · listed · 판매가 또는 요율 변경) · rejected 는 저장하면 pending
  v_status := p.status;
  if p.status = 'listed' and not v_locked and (v_gp <> p.sale_price or v_rate <> p.commission_rate) then
    v_status := 'pending'; v_rereview := true;
  elsif p.status = 'rejected' then
    v_status := 'pending';
  end if;

  update public.products
     set name = v_name, description = v_desc, emoji = v_emoji, category = v_category,
         thumb_url = coalesce(v_thumb, p.thumb_url),                    -- 새 썸네일이 없으면 유지 (데모 `if (f.thumb)`)
         image_urls = case when array_length(v_imgs, 1) is null then p.image_urls else v_imgs end,   -- 빈 배열이면 유지 (데모 `if (f.imgs.length)`)
         consumer_price = v_cp, sale_price = v_gp, commission_rate = v_rate,
         sample_text = v_sample_text, stock = v_stock,
         sample_free_grade = v_sp_grade, sample_buy_mode = v_sp_mode, sample_fixed_price = v_sp_fixed, sample_refund = v_sp_refund,
         exclusive_grade = v_ex_grade, exclusive_label = v_ex_label,
         options = v_opts,
         status = v_status,
         reject_reason = case when v_status = 'pending' then null else p.reject_reason end
   where id = p.id;

  return jsonb_build_object('ok', true, 'product_id', p.id, 'code', p.code, 'status', v_status,
    'created', false, 'rereview', v_rereview, 'locked', v_locked);
end;
$$;
revoke all on function public.app_brand_upsert_product(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.app_brand_upsert_product(uuid, uuid, jsonb) to service_role;

-- ------------------------------------------------------------
-- app_brand_set_listing(p_brand_id, p_product_id, p_listed) — 노출 토글 (toggleListing): listed ⇄ paused 만
--   반환:
--     { ok:true,  product_id, code, status, already:bool }     already = 이미 목표 상태
--     { ok:false, code:'NOT_FOUND' }
--     { ok:false, code:'NOT_REVIEWED', status }                pending · rejected (검수 전에는 토글 불가)
-- ------------------------------------------------------------
create or replace function public.app_brand_set_listing(p_brand_id uuid, p_product_id uuid, p_listed boolean)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p        public.products%rowtype;
  v_target text := case when coalesce(p_listed, false) then 'listed' else 'paused' end;
begin
  select * into p from public.products
   where id = p_product_id and brand_id = p_brand_id and deleted_at is null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if p.status not in ('listed', 'paused') then
    return jsonb_build_object('ok', false, 'code', 'NOT_REVIEWED', 'status', p.status);
  end if;
  if p.status = v_target then
    return jsonb_build_object('ok', true, 'product_id', p.id, 'code', p.code, 'status', p.status, 'already', true);
  end if;
  update public.products set status = v_target where id = p.id;
  return jsonb_build_object('ok', true, 'product_id', p.id, 'code', p.code, 'status', v_target, 'already', false);
end;
$$;
revoke all on function public.app_brand_set_listing(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.app_brand_set_listing(uuid, uuid, boolean) to service_role;

-- ------------------------------------------------------------
-- app_brand_delete_product(p_brand_id, p_product_id) — 소프트 삭제 (deleteProduct): 종결(REJECTED/PASSED/DECLINED) 아닌 캠페인이 있으면 불가
--   반환:
--     { ok:true,  product_id, code }
--     { ok:false, code:'NOT_FOUND' }                          내 상품 아님 · 이미 삭제됨
--     { ok:false, code:'HAS_ACTIVE_CAMPAIGNS', count }        → 라우트는 "노출 중단을 사용하세요" 안내
-- ------------------------------------------------------------
create or replace function public.app_brand_delete_product(p_brand_id uuid, p_product_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p       public.products%rowtype;
  v_n     integer;
begin
  select * into p from public.products
   where id = p_product_id and brand_id = p_brand_id and deleted_at is null
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select count(*)::integer into v_n from public.campaigns c
   where c.product_id = p.id and c.status not in ('REJECTED', 'PASSED', 'DECLINED');
  if v_n > 0 then
    return jsonb_build_object('ok', false, 'code', 'HAS_ACTIVE_CAMPAIGNS', 'count', v_n);
  end if;
  update public.products set deleted_at = now() where id = p.id;
  return jsonb_build_object('ok', true, 'product_id', p.id, 'code', p.code);
end;
$$;
revoke all on function public.app_brand_delete_product(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_brand_delete_product(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- brand_campaign_json(c) — 브랜드 시점 캠페인 1행 → jsonb (읽기 3종 공용 · 서버 전용)
--   campaign: id code status created_at updated_at invited auto_proposed regongu purchased sample_price sample_cel sample_cash sample_method
--             sample_courier tracking_no sample_shipped_at received_at test_due proposed_start proposed_end proposed_qty start_date end_date qty sold_qty
--             decision_reason settled_at has_shipping(bool — 수취인 원문은 상세에서만)
--   product : id code name emoji thumb_url category sale_price consumer_price commission_rate sample_text status
--   seller  : id code name handle platform avatar_url grade followers hidden
--             primary_channel {platform, handle, url, followers, verified} (없으면 null) — 이름·핸들·verified 채널까지만(이메일·정산 없음)
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
    'decision_reason', c.decision_reason, 'settled_at', c.settled_at,
    'has_shipping', c.sample_shipping is not null,
    'product', (select jsonb_build_object(
                  'id', p.id, 'code', p.code, 'name', p.name, 'emoji', p.emoji, 'thumb_url', p.thumb_url, 'category', p.category,
                  'sale_price', p.sale_price, 'consumer_price', p.consumer_price, 'commission_rate', p.commission_rate,
                  'sample_text', p.sample_text, 'status', p.status)
                  from public.products p where p.id = c.product_id),
    'seller', (select jsonb_build_object(
                  'id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle, 'platform', s.platform, 'avatar_url', s.avatar_url,
                  'grade', coalesce(s.grade, public.grade_for_sales(s.m3_sales)), 'followers', s.followers, 'hidden', s.hidden,
                  'primary_channel', (select jsonb_build_object('platform', ch.platform, 'handle', ch.handle, 'url', ch.url,
                                                                'followers', ch.followers, 'verified', ch.verified)
                                        from public.seller_channels ch where ch.seller_id = s.id and ch.is_primary limit 1))
                  from public.sellers s where s.id = c.seller_id))
$$;
revoke all on function public.brand_campaign_json(public.campaigns) from public, anon, authenticated;
grant execute on function public.brand_campaign_json(public.campaigns) to service_role;

-- ------------------------------------------------------------
-- app_brand_requests(p_brand_id, p_statuses) — 처리 대기 큐 (/brand/requests · 홈 "승인·처리 대기")
--   기본 = 브랜드 차례 상태(ST[*].turn==='brand'): SAMPLE_REQUESTED · SAMPLE_APPROVED · SAMPLE_PURCHASED · SCHEDULE_PROPOSED — 오래된 것부터.
--   반환: jsonb 배열(brand_campaign_json) — 빈 큐는 []
-- ------------------------------------------------------------
create or replace function public.app_brand_requests(p_brand_id uuid, p_statuses text[] default null)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(public.brand_campaign_json(c) order by c.created_at asc), '[]'::jsonb)
    from public.campaigns c
   where c.brand_id = p_brand_id
     and c.status = any (coalesce(p_statuses, array['SAMPLE_REQUESTED', 'SAMPLE_APPROVED', 'SAMPLE_PURCHASED', 'SCHEDULE_PROPOSED']))
$$;
revoke all on function public.app_brand_requests(uuid, text[]) from public, anon, authenticated;
grant execute on function public.app_brand_requests(uuid, text[]) to service_role;

-- app_brand_campaigns(p_brand_id) — 내 브랜드 캠페인 전부 (최신순) — /brand/campaigns 칩 필터는 앱이 status 로 나눈다
create or replace function public.app_brand_campaigns(p_brand_id uuid)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select coalesce(jsonb_agg(public.brand_campaign_json(c) order by c.created_at desc), '[]'::jsonb)
    from public.campaigns c
   where c.brand_id = p_brand_id
$$;
revoke all on function public.app_brand_campaigns(uuid) from public, anon, authenticated;
grant execute on function public.app_brand_campaigns(uuid) to service_role;

-- app_brand_campaign(p_brand_id, p_campaign_id) — 상세: 행 + sample_shipping(발송용 수취인 원문) + events(시간순). 내 것이 아니면 SQL null
create or replace function public.app_brand_campaign(p_brand_id uuid, p_campaign_id uuid)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select public.brand_campaign_json(c)
         || jsonb_build_object(
              'sample_shipping', c.sample_shipping,
              'events', coalesce((
                select jsonb_agg(jsonb_build_object(
                         'id', e.id, 'kind', e.kind, 'sender', e.sender, 'body', e.body, 'event_type', e.event_type,
                         'payload', e.payload, 'leak_flag', e.leak_flag, 'created_at', e.created_at)
                       order by e.created_at asc)
                  from public.campaign_events e where e.campaign_id = c.id), '[]'::jsonb))
    from public.campaigns c
   where c.id = p_campaign_id and c.brand_id = p_brand_id
$$;
revoke all on function public.app_brand_campaign(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_brand_campaign(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_approve_sample(p_brand_id, p_campaign_id) — SAMPLE_REQUESTED → SAMPLE_APPROVED · 이벤트 'sample_approved'
--   반환:
--     { ok:true,  already:false, campaign_id, campaign_code, status:'SAMPLE_APPROVED' }
--     { ok:true,  already:true,  campaign_id, campaign_code, status:'SAMPLE_APPROVED' }   이미 승인됨(이중 클릭)
--     { ok:false, code:'NOT_FOUND' }                                   내 브랜드 캠페인 아님 · 없는 id
--     { ok:false, code:'WRONG_STATUS', status }                        SAMPLE_REQUESTED 가 아님
-- ------------------------------------------------------------
create or replace function public.app_brand_approve_sample(p_brand_id uuid, p_campaign_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c public.campaigns%rowtype;
begin
  select * into c from public.campaigns where id = p_campaign_id and brand_id = p_brand_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if c.status = 'SAMPLE_APPROVED' then
    return jsonb_build_object('ok', true, 'already', true, 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status);
  end if;
  if c.status <> 'SAMPLE_REQUESTED' then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;

  update public.campaigns set status = 'SAMPLE_APPROVED' where id = c.id;

  -- 프로토타입 approveSample 의 pushSys 원문 (평문)
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (c.id, 'system', 'system', 'brand',
          '브랜드가 샘플 요청을 승인했습니다 · 배송지 전달됨',
          'sample_approved',
          jsonb_build_object('has_shipping', c.sample_shipping is not null));

  return jsonb_build_object('ok', true, 'already', false, 'campaign_id', c.id, 'campaign_code', c.code, 'status', 'SAMPLE_APPROVED');
end;
$$;
revoke all on function public.app_brand_approve_sample(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_brand_approve_sample(uuid, uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_reject_sample(p_brand_id, p_campaign_id, p_reason) — SAMPLE_REQUESTED → REJECTED · decision_reason · 이벤트 'sample_rejected'
--   p_reason: 선택(≤ 200자 · 공백 정리). 비면 decision_reason null.
--   반환:
--     { ok:true,  already:false, campaign_id, campaign_code, status:'REJECTED' }
--     { ok:true,  already:true,  … }                                   이미 REJECTED
--     { ok:false, code:'NOT_FOUND' } · { ok:false, code:'WRONG_STATUS', status }
-- ------------------------------------------------------------
create or replace function public.app_brand_reject_sample(p_brand_id uuid, p_campaign_id uuid, p_reason text default null)
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
  if c.status = 'REJECTED' then
    return jsonb_build_object('ok', true, 'already', true, 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status);
  end if;
  if c.status <> 'SAMPLE_REQUESTED' then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;

  v_reason := nullif(left(regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g'), 200), '');

  update public.campaigns set status = 'REJECTED', decision_reason = v_reason where id = c.id;

  -- 프로토타입 rejectSample 의 pushSys 원문 + 사유(입력이 있을 때만)
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (c.id, 'system', 'system', 'brand',
          '브랜드가 샘플 요청을 거절했습니다' || coalesce(' · 사유: ' || v_reason, ''),
          'sample_rejected',
          jsonb_strip_nulls(jsonb_build_object('reason', v_reason)));

  return jsonb_build_object('ok', true, 'already', false, 'campaign_id', c.id, 'campaign_code', c.code, 'status', 'REJECTED');
end;
$$;
revoke all on function public.app_brand_reject_sample(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_brand_reject_sample(uuid, uuid, text) to service_role;

-- ------------------------------------------------------------
-- app_brand_ship_sample(p_brand_id, p_campaign_id, p_courier, p_tracking_no) — SAMPLE_APPROVED · SAMPLE_PURCHASED → SAMPLE_SHIPPED
--   택배사 = 5개 목록(campaigns_sample_courier_check) · 송장 = 영숫자·하이픈 6~30자(공백 제거). 자동 생성 없음(결정 7).
--   반환:
--     { ok:true,  already:false, campaign_id, campaign_code, status:'SAMPLE_SHIPPED', courier, tracking_no }
--     { ok:true,  already:true,  …, courier, tracking_no }             이미 발송됨 — 기존 송장 그대로(정정은 운영자)
--     { ok:false, code:'NOT_FOUND' }
--     { ok:false, code:'BAD_COURIER' } · { ok:false, code:'BAD_TRACKING' }
--     { ok:false, code:'WRONG_STATUS', status }                        SAMPLE_APPROVED · SAMPLE_PURCHASED 가 아님
-- ------------------------------------------------------------
create or replace function public.app_brand_ship_sample(p_brand_id uuid, p_campaign_id uuid, p_courier text, p_tracking_no text)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c          public.campaigns%rowtype;
  v_courier  text := btrim(coalesce(p_courier, ''));
  v_tracking text := regexp_replace(coalesce(p_tracking_no, ''), '\s', '', 'g');
begin
  select * into c from public.campaigns where id = p_campaign_id and brand_id = p_brand_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if c.status = 'SAMPLE_SHIPPED' then
    return jsonb_build_object('ok', true, 'already', true, 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
      'courier', c.sample_courier, 'tracking_no', c.tracking_no);
  end if;
  if c.status not in ('SAMPLE_APPROVED', 'SAMPLE_PURCHASED') then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;
  if v_courier not in ('CJ대한통운', '우체국택배', '한진택배', '롯데택배', '로젠택배') then
    return jsonb_build_object('ok', false, 'code', 'BAD_COURIER');
  end if;
  if v_tracking !~ '^[A-Za-z0-9-]{6,30}$' or v_tracking !~ '\d' then
    return jsonb_build_object('ok', false, 'code', 'BAD_TRACKING');
  end if;

  update public.campaigns
     set status = 'SAMPLE_SHIPPED', sample_courier = v_courier, tracking_no = v_tracking, sample_shipped_at = now()
   where id = c.id;

  -- 프로토타입 shipSample 의 pushSys 원문("샘플 발송 · 운송장 <b>N</b>") + 택배사
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, body, event_type, payload)
  values (c.id, 'system', 'system', 'brand',
          format('샘플 발송 · %s 운송장 %s', v_courier, v_tracking),
          'sample_shipped',
          jsonb_build_object('courier', v_courier, 'tracking_no', v_tracking));

  return jsonb_build_object('ok', true, 'already', false, 'campaign_id', c.id, 'campaign_code', c.code, 'status', 'SAMPLE_SHIPPED',
    'courier', v_courier, 'tracking_no', v_tracking);
end;
$$;
revoke all on function public.app_brand_ship_sample(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.app_brand_ship_sample(uuid, uuid, text, text) to service_role;

-- ------------------------------------------------------------
-- app_admin_review_product(p_product_id, p_decision, p_reason) — 상품 검수 (운영 스크립트 partner-admin.mjs review-product · 관리자 콘솔 이전)
--   approve : pending · rejected · paused → listed · reject_reason null · stock 0 이면 platform_settings.default_stock_on_approve(없으면 500) (approveProduct)
--   reject  : → rejected + reject_reason(필수 · ≤ 200자) (rejectProduct — 0002 products_reject_reason_when_rejected)
--   pause   : listed → paused (정지 브랜드 상품 내리기 — §8)
--   반환:
--     { ok:true,  already:bool, product_id, code, status, stock }
--     { ok:false, code:'NOT_FOUND' }                    없는 id · 삭제됨
--     { ok:false, code:'BAD_DECISION' }                 approve · reject · pause 밖
--     { ok:false, code:'BAD_REASON' }                   reject 인데 사유 없음
--     { ok:false, code:'WRONG_STATUS', status }         pause 인데 listed 가 아님
-- ------------------------------------------------------------
create or replace function public.app_admin_review_product(p_product_id uuid, p_decision text, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  p           public.products%rowtype;
  v_decision  text := lower(btrim(coalesce(p_decision, '')));
  v_reason    text := nullif(left(regexp_replace(btrim(coalesce(p_reason, '')), '\s+', ' ', 'g'), 200), '');
  v_default   integer;
  v_stock     integer;
begin
  if v_decision not in ('approve', 'reject', 'pause') then
    return jsonb_build_object('ok', false, 'code', 'BAD_DECISION');
  end if;
  select * into p from public.products where id = p_product_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if v_decision = 'approve' then
    if p.status = 'listed' then
      return jsonb_build_object('ok', true, 'already', true, 'product_id', p.id, 'code', p.code, 'status', p.status, 'stock', p.stock);
    end if;
    select coalesce((ps.value #>> '{}')::integer, 500) into v_default from public.platform_settings ps where ps.key = 'default_stock_on_approve';
    v_default := coalesce(v_default, 500);
    v_stock := case when p.stock = 0 then v_default else p.stock end;
    update public.products set status = 'listed', reject_reason = null, stock = v_stock where id = p.id;
    return jsonb_build_object('ok', true, 'already', false, 'product_id', p.id, 'code', p.code, 'status', 'listed', 'stock', v_stock);
  elsif v_decision = 'reject' then
    if v_reason is null then
      return jsonb_build_object('ok', false, 'code', 'BAD_REASON');
    end if;
    if p.status = 'rejected' and p.reject_reason = v_reason then
      return jsonb_build_object('ok', true, 'already', true, 'product_id', p.id, 'code', p.code, 'status', p.status, 'stock', p.stock);
    end if;
    update public.products set status = 'rejected', reject_reason = v_reason where id = p.id;
    return jsonb_build_object('ok', true, 'already', false, 'product_id', p.id, 'code', p.code, 'status', 'rejected', 'stock', p.stock);
  else
    if p.status = 'paused' then
      return jsonb_build_object('ok', true, 'already', true, 'product_id', p.id, 'code', p.code, 'status', p.status, 'stock', p.stock);
    end if;
    if p.status <> 'listed' then
      return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', p.status);
    end if;
    update public.products set status = 'paused' where id = p.id;
    return jsonb_build_object('ok', true, 'already', false, 'product_id', p.id, 'code', p.code, 'status', 'paused', 'stock', p.stock);
  end if;
end;
$$;
revoke all on function public.app_admin_review_product(uuid, text, text) from public, anon, authenticated;
grant execute on function public.app_admin_review_product(uuid, text, text) to service_role;
