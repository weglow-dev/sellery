-- ============================================================
-- 0019 — 브랜드 콘솔 5단계 PR-A "실시간 매출 · 정산 내역 · 정산 정보 · 브랜드 정보 · 등급 카드"
--        brands.description · brands.tax_info · app_brand_sales · app_brand_settlements · app_brand_settle_info / app_set_brand_settle_info
--        · app_brand_profile / app_set_brand_profile · app_brand_grade_card · app_brand_grade_recalc · brand_normalize_phone
--
-- 근거: docs/brand-console-plan.md §4 "0019 5단계" · §5 `/brand/sales` `/brand/settle` `/brand/my` · §6 행 5 · §8(정산 표 "플랫폼+PG" 열 = pfGross − bBoost − bDisc ·
--       정산 정보 완비 조건 4개 · 세금계산서 발행은 범위 밖 · 자동 발주 저장 미구현) · docs/settlement-policy.md §3(calc) · §4.2(BG_DISC) · §5(브랜드 추천) · §8.3(holdB)
--       · §11.3(브랜드 정산 표) · docs/grade-policy.md §5(브랜드 등급 · freeRefLeft) · docs/points-policy.md · docs/data-model.md §4(스냅샷 규칙).
-- 실행: 0018 이후. 재실행 가능(add column if not exists / create or replace / drop function if exists).
--       0001~0018 파일은 수정하지 않는다 — brands(0001 · 0014) · settlements/payouts(0004) 정의는 그대로 두고 컬럼·함수만 **추가**한다.
-- 범위: **브랜드가 보는 것과 등록하는 것만.** 정산 실행(settlements insert · payouts · brands.grade 갱신 · 🥬 earned) 은 관리자 콘솔(6단계 이후) —
--       여기서는 만들지 않는다. 화면(/brand/sales · /brand/settle · /brand/my) 은 다음 PR(PR-B). 이 파일 + @sellery/db/server/brand/{sales,settle,profile}.server.ts +
--       @sellery/db/brand/settle-rules.ts 가 계약이다. 인플루언서 짝은 0013(app_seller_sales · app_seller_settlements · app_set_settle_info).
--
-- 숫자·규칙의 정답은 packages/core/src/{constants,helpers,actions}.ts 다. 이 SQL 은 그 규칙을 옮긴 것이고, 바꿀 때는 둘을 함께 고친다.
--
-- | 규칙 | 코어 원본 | 여기서 |
-- |---|---|---|
-- | 확정 매출 net = Σ(status≠CANCELED) − Σ(REFUNDED) · sample_net = Σ(is_sample & PAID) | calc() gross/refund/net/sampleNet | app_brand_sales · app_brand_settlements(pending) · (정산 뒤에는 settlements 스냅샷) |
-- | PG pg = net × 1.9% (브랜드 정산에서 차감) | calc().pg · PG_RATE | platform_settings pg_rate |
-- | 인플루언서 기본 수수료 sf = (net − sample_net) × 요율(확정 시 rate_locked) — 브랜드가 부담하는 인플루언서 몫 | calc().sf · p.rate | seller_fee |
-- | 등급 보너스 gBonus · 추천 부스트 boost — **플랫폼 부담**(브랜드 정산액에 없음 · 표시만 "인플루언서 수령") | gradeBonusOf · isRefBoost | seller_bonus · ref_boost · seller_fee_total (참고 열) |
-- | 플랫폼 수수료 총액 pfGross = net × 10% — 브랜드는 항상 10% 를 낸다 | calc().pfGross · PLAT_RATE | platform_fee_gross |
-- | 브랜드 등급 할인 bDisc = net × BG_DISC[등급] (플랫폼 부담 · 브랜드 정산액에 가산) — 등급은 brand_grade_for_gmv(brand_gmv) **실시간**(데모 bgname) | bDiscOf · BG_DISC | brand_grade_tiers.fee_discount → brand_discount |
-- | 브랜드 추천 할인 bBoost = net × 1% — 피추천 브랜드의 LIVE/CLEARING/SETTLED 캠페인을 생성일순으로 세어 첫 3회 | isBrandRefBoost · BREF_DISC · BREF_TIMES | platform_settings brand_ref_disc · brand_ref_times, row_number() over (created_at) → brand_ref_boost |
-- | 브랜드 정산액 brandPay = net − pg − sf − pfGross + bBoost + bDisc | calc().brandPay | brand_payout_est(매출) · brand_payout(스냅샷) |
-- | 정산 표 "플랫폼+PG" 열 = (pfGross − bBoost − bDisc) + pg — 브랜드 실제 부담(데모 표는 pf 를 써서 행 합이 안 맞았다 — settlement-policy §11.3 · plan §8) | — (결정) | platform_pg |
-- | 정산 기준일 = 종료일 + 21 | settleDue · CLEAR_DAYS | platform_clear_days() (settlements.due_on 이 있으면 그 값) |
-- | 반올림: 라인마다 독립 원 단위 half-up (JS Math.round · PG round(numeric)) | 0004 헤더 반올림 계약 | round(numeric) |
-- | 지급 보류 holdB = 정산 정보 미완비 — **은행·계좌·예금주·사업자등록번호 4개** 가 하나의 조건(plan §8 — 데모는 세 화면이 세 조건, settlement-policy §8.3) | runSettle holdB · vBrandMy ok | settle_info_complete → pending 행 hold_brand · settlements.hold_brand(스냅샷) |
-- | 정산 정보: 은행 BANKS 목록 · 계좌 숫자 8~16 · 예금주 1~40자 · 사업자번호 10자리(가입 때 있으면 불변) · 통신판매업 신고번호 ≤ 40자 · 세금계산서 수신 이메일 형식 | saveBrandInfo · BANKS | app_set_brand_settle_info — BAD_BANK · BAD_ACCOUNT · HOLDER_REQUIRED · BAD_BIZ_NO · BIZ_NO_LOCKED · BIZ_NO_TAKEN · BAD_MAIL_ORDER · BAD_EMAIL |
-- | 브랜드 정보: 상호 1~40 · 카테고리 enum · 담당자 1~30 · 연락처 형식(0014 와 같은 정규화) · 소개 ≤ 500 · 로고 URL(https) | saveBrandInfo · 0014 create_brand_from_signup | app_set_brand_profile — INVALID_INPUT{field} · 사업자번호는 여기서 못 바꾼다 |
-- | 브랜드 등급 = 누적 GMV(gmv_base + Σ PAID 주문 · 샘플 포함) 로 내림차순 첫 매치 · 다음 등급까지 남은 금액 | bGmv · bgradeOf · BGRADES | brand_gmv() · brand_grade_for_gmv() · app_brand_grade_card next{grade,min_gmv,remaining} |
-- | 무료 열람 = 다이아·블랙 월 5회 − 이달 사용(free_ref_used{'YYYY-MM': n}) · 그 외 0 | freeRefLeft | brand_grade_tiers.free_ref_per_month · free_ref_used(KST 달력월) |
-- | 🥬 잔액 | celBal | celery_balances(owner_type='brand') |
-- | brands.grade 캐시 갱신 | (데모는 매 렌더 재계산) | app_brand_grade_recalc — **운영 스크립트 · 정산 실행 전용**(틱·화면은 부르지 않는다 — 화면은 실시간 값을 쓴다) |
--
-- 설계 요점
--   · 전부 security definer · service_role 만 execute(0007 패턴). 콘솔은 requireBrand() 의 brand.id 만 넘긴다 — 클라이언트가 보낸 id·금액은 믿지 않는다.
--   · 소유권은 campaigns.brand_id(매출 · 정산 표). settlements 스냅샷 행은 저장값 그대로 싣고(재계산 없음 — 0004 반올림 계약), platform_fee/platform_net/sample_cel_cover 는 싣지 않는다(관리자 전용 — data-model §5.2).
--   · **콘솔 응답에는 계좌 원문이 없다** — bank_info 는 마스킹(뒤 4자리) · biz_no 는 마스킹(뒤 5자리). 0013 partner_mask_* 재사용.
--   · 인플루언서 신원(이름·핸들·플랫폼·등급)은 브랜드에게 노출된다(0015 brand_campaign_json 과 같은 기준 — 캠페인 당사자). 구매자명은 partner_mask_name 으로 가린다.
--   · 매출 화면의 등급 할인은 **실시간 등급**(brand_grade_for_gmv(brand_gmv)) 으로 계산한다(데모 bDiscOf 와 동일). brands.grade 캐시는 정산 실행이 갱신하므로 예상액과 스냅샷이
--     등급 경계에서 다를 수 있다 — 스냅샷이 정답(brand_discount_rate 저장).
--   · 샘플 구매만 있고 아직 LIVE 전인 캠페인(SAMPLE_PURCHASED 등)은 두 표에 싣지 않는다 — 인플루언서 짝(0013)과 동일. 데모 브랜드 정산 표는 실었으나(§11.3) 그 대금은 정산 실행 규칙(§9)이 정한다(열린 결정, plan §8).
--   · 자동 발주(po_enabled/po_email)는 **읽기만**(plan §8 "저장만 있는 토글은 오해") — app_set_brand_settle_info 는 받지 않는다.
--   · 함수는 예외 대신 {ok, code} 를 돌려준다(0010~0018 관례). 라우트는 code 를 문구로 바꾼다(packages/db/src/brand/settle-rules.ts).
--   · RLS 변경 없음. 사업자등록증 파일은 0006 의 비공개 버킷 partner-docs 에 서버가 `brands/<id>/biz-doc.<ext>` 로 올리고 brands.biz_doc_url 에는 **object path 만**(0001 주석 그대로).
--     로고는 공개 버킷 public-assets `brands/<id>/logo-<uuid>.<ext>` → 공개 URL 을 logo_url 에(상품 이미지와 같은 패턴).
-- ============================================================

-- ------------------------------------------------------------
-- 컬럼
-- ------------------------------------------------------------
alter table public.brands add column if not exists description text;   -- 브랜드 소개(≤ 500자) — 고객 판매 페이지 · 인플루언서 상품 상세의 브랜드 소개 후보
alter table public.brands add column if not exists tax_info    jsonb;  -- 세금계산서 수신 정보 { company, ceo, biz_type, biz_item, email } — sellers.tax_info(0013) 와 같은 모양
comment on column public.brands.description is '브랜드 소개 ≤ 500자 — 0019 app_set_brand_profile';
comment on column public.brands.tax_info    is '세금계산서 수신 정보 {company, ceo, biz_type, biz_item, email} — 0019 app_set_brand_settle_info. 발행 자체는 운영팀(plan §8)';

-- ------------------------------------------------------------
-- 헬퍼 — 담당자 연락처 정규화 (0014 create_brand_from_signup 안의 인라인 로직을 함수로 · 형식이 어긋나면 null)
--   '01012345678' → '010-1234-5678' · '0212345678' → '02-1234-5678'
-- ------------------------------------------------------------
create or replace function public.brand_normalize_phone(p_raw text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_raw text := btrim(coalesce(p_raw, ''));
  v_d   text;
begin
  if v_raw !~ '^0\d{1,2}-?\d{3,4}-?\d{4}$' then
    return null;
  end if;
  v_d := regexp_replace(v_raw, '\D', '', 'g');
  if left(v_d, 2) = '02' then
    return '02-' || left(substr(v_d, 3), length(v_d) - 6) || '-' || right(v_d, 4);
  end if;
  return left(v_d, 3) || '-' || left(substr(v_d, 4), length(v_d) - 7) || '-' || right(v_d, 4);
end;
$$;
revoke all on function public.brand_normalize_phone(text) from public, anon, authenticated;
grant execute on function public.brand_normalize_phone(text) to service_role;

-- 정산 정보 완비 = 은행·계좌·예금주·사업자등록번호 (plan §8 — hold_brand 해제 조건 하나로)
create or replace function public.brand_settle_info_complete(b public.brands)
returns boolean
language sql
immutable
set search_path = public
as $$
  select b.bank_info is not null
     and coalesce(b.bank_info ->> 'bank', '') <> ''
     and coalesce(b.bank_info ->> 'account', '') <> ''
     and coalesce(b.bank_info ->> 'holder', '') <> ''
     and coalesce(b.biz_no, '') <> ''
$$;
revoke all on function public.brand_settle_info_complete(public.brands) from public, anon, authenticated;
grant execute on function public.brand_settle_info_complete(public.brands) to service_role;

-- ------------------------------------------------------------
-- app_brand_settle_info(p_brand_id) — /brand/settle 상단 폼 프리필 · 경고. **원문 없음.**
--   { ok, has_bank_info, bank, holder, account_masked, has_biz_no, biz_no_masked, mail_order_no, has_biz_doc,
--     has_tax_info, tax_info{company,ceo,biz_type,biz_item,email}, po_enabled, po_email, settle_info_complete }
-- ------------------------------------------------------------
create or replace function public.app_brand_settle_info(p_brand_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  b public.brands%rowtype;
begin
  select * into b from public.brands where id = p_brand_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  return jsonb_build_object(
    'ok', true,
    'has_bank_info', (b.bank_info is not null and coalesce(b.bank_info ->> 'account', '') <> ''),
    'bank', b.bank_info ->> 'bank',
    'holder', b.bank_info ->> 'holder',
    'account_masked', public.partner_mask_account(b.bank_info ->> 'account'),
    'has_biz_no', (coalesce(b.biz_no, '') <> ''),
    'biz_no_masked', public.partner_mask_biz_no(b.biz_no),
    'mail_order_no', b.mail_order_no,
    'has_biz_doc', (b.biz_doc_url is not null and b.biz_doc_url <> ''),
    'has_tax_info', (b.tax_info is not null and coalesce(b.tax_info ->> 'email', '') <> ''),
    'tax_info', case when b.tax_info is null then null else jsonb_build_object(
      'company', b.tax_info ->> 'company', 'ceo', b.tax_info ->> 'ceo',
      'biz_type', b.tax_info ->> 'biz_type', 'biz_item', b.tax_info ->> 'biz_item', 'email', b.tax_info ->> 'email') end,
    'po_enabled', b.po_enabled,
    'po_email', b.po_email,
    'settle_info_complete', public.brand_settle_info_complete(b)
  );
end;
$$;
revoke all on function public.app_brand_settle_info(uuid) from public, anon, authenticated;
grant execute on function public.app_brand_settle_info(uuid) to service_role;

-- ------------------------------------------------------------
-- app_set_brand_settle_info(p_brand_id, p_bank, p_tax) — /brand/settle 폼 저장 (데모 saveBrandInfo 의 정산 부분).
--   p_bank { bank, account, holder } — 셋 다 필수. bank 는 BANKS 목록(core BANKS − '선택'). account 숫자 8~16자리. holder 1~40자.
--   p_tax  { biz_no, mail_order_no, company, ceo, biz_type, biz_item, email } — 전부 선택.
--          biz_no: brands.biz_no 가 비어 있으면 여기서 채운다(10자리 · '000-00-00000' 정규화 · 유니크). 이미 있으면 **바꿀 수 없다**(같은 값은 무시 · 다르면 BIZ_NO_LOCKED — 자연 키 · 0014).
--          mail_order_no ≤ 40자. company ≤ 60 · ceo/biz_type/biz_item ≤ 40 · email 형식(≤ 120, 소문자). 세금계산서 정보가 전부 비면 tax_info = null.
--   결과: 실패 {ok:false, code: BANK_REQUIRED|BAD_BANK|BAD_ACCOUNT|HOLDER_REQUIRED|BAD_BIZ_NO|BIZ_NO_LOCKED|BIZ_NO_TAKEN|BAD_MAIL_ORDER|BAD_EMAIL|NOT_FOUND}
--         성공 app_brand_settle_info 와 같은 모양 + saved:true.
--   bank_info 원문은 brands 에 평문 jsonb 로 남는다(0013 결정과 동일 — 지급 수단 확정 때 암호화 여부 결정).
-- ------------------------------------------------------------
create or replace function public.app_set_brand_settle_info(p_brand_id uuid, p_bank jsonb, p_tax jsonb default null)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  b          public.brands%rowtype;
  v_bank     text := btrim(coalesce(p_bank ->> 'bank', ''));
  v_account  text := regexp_replace(coalesce(p_bank ->> 'account', ''), '[^0-9]', '', 'g');
  v_holder   text := btrim(coalesce(p_bank ->> 'holder', ''));
  v_biz_in   text := regexp_replace(coalesce(p_tax ->> 'biz_no', ''), '[^0-9]', '', 'g');
  v_biz_no   text;
  v_mail     text := nullif(btrim(coalesce(p_tax ->> 'mail_order_no', '')), '');
  v_email    text := nullif(lower(btrim(coalesce(p_tax ->> 'email', ''))), '');
  v_tax      jsonb := null;
  v_banks    text[] := array['국민','신한','우리','하나','농협','카카오뱅크','토스뱅크','기업','SC제일'];   -- = core BANKS 에서 '선택' 제외 (0013 과 동일)
begin
  select * into b from public.brands where id = p_brand_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_bank = '' or v_bank = '선택' then return jsonb_build_object('ok', false, 'code', 'BANK_REQUIRED'); end if;
  if not (v_bank = any (v_banks)) then return jsonb_build_object('ok', false, 'code', 'BAD_BANK'); end if;
  if v_account !~ '^\d{8,16}$' then return jsonb_build_object('ok', false, 'code', 'BAD_ACCOUNT'); end if;
  if v_holder = '' or length(v_holder) > 40 then return jsonb_build_object('ok', false, 'code', 'HOLDER_REQUIRED'); end if;

  -- 사업자등록번호 — 가입 때 채워졌으면 불변(자연 키). 비어 있는 계정(연결 경로)만 여기서 채운다.
  v_biz_no := b.biz_no;
  if v_biz_in <> '' then
    if v_biz_in !~ '^\d{10}$' then return jsonb_build_object('ok', false, 'code', 'BAD_BIZ_NO'); end if;
    v_biz_in := substr(v_biz_in, 1, 3) || '-' || substr(v_biz_in, 4, 2) || '-' || substr(v_biz_in, 6, 5);
    if b.biz_no is null then
      if exists (select 1 from public.brands x where x.biz_no = v_biz_in and x.id <> b.id) then
        return jsonb_build_object('ok', false, 'code', 'BIZ_NO_TAKEN');
      end if;
      v_biz_no := v_biz_in;
    elsif b.biz_no <> v_biz_in then
      return jsonb_build_object('ok', false, 'code', 'BIZ_NO_LOCKED');
    end if;
  end if;

  if v_mail is not null and length(v_mail) > 40 then return jsonb_build_object('ok', false, 'code', 'BAD_MAIL_ORDER'); end if;
  if v_email is not null and (length(v_email) > 120 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    return jsonb_build_object('ok', false, 'code', 'BAD_EMAIL');
  end if;

  v_tax := jsonb_strip_nulls(jsonb_build_object(
    'company',  nullif(left(btrim(coalesce(p_tax ->> 'company', '')), 60), ''),
    'ceo',      nullif(left(btrim(coalesce(p_tax ->> 'ceo', '')), 40), ''),
    'biz_type', nullif(left(btrim(coalesce(p_tax ->> 'biz_type', '')), 40), ''),
    'biz_item', nullif(left(btrim(coalesce(p_tax ->> 'biz_item', '')), 40), ''),
    'email',    v_email));
  if v_tax = '{}'::jsonb then v_tax := null; end if;

  update public.brands
     set bank_info     = jsonb_build_object('bank', v_bank, 'account', v_account, 'holder', v_holder),
         biz_no        = v_biz_no,
         mail_order_no = v_mail,
         tax_info      = v_tax
   where id = b.id;

  return public.app_brand_settle_info(b.id) || jsonb_build_object('saved', true);
end;
$$;
revoke all on function public.app_set_brand_settle_info(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.app_set_brand_settle_info(uuid, jsonb, jsonb) to service_role;

-- ------------------------------------------------------------
-- app_brand_profile(p_brand_id) — /brand/my 브랜드 정보 카드 · 폼 프리필. 사업자번호는 마스킹, 계좌는 싣지 않는다.
--   { ok, id, code, name, category, manager_name, manager_phone, email, description, logo_url, biz_no_masked, ref_code, active, created_at }
-- ------------------------------------------------------------
create or replace function public.app_brand_profile(p_brand_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  b public.brands%rowtype;
begin
  select * into b from public.brands where id = p_brand_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  return jsonb_build_object(
    'ok', true,
    'id', b.id, 'code', b.code, 'name', b.name, 'category', b.category,
    'manager_name', b.manager_name, 'manager_phone', b.manager_phone, 'email', b.email,
    'description', b.description, 'logo_url', b.logo_url,
    'biz_no_masked', public.partner_mask_biz_no(b.biz_no),
    'ref_code', b.ref_code, 'active', b.active, 'created_at', b.created_at
  );
end;
$$;
revoke all on function public.app_brand_profile(uuid) from public, anon, authenticated;
grant execute on function public.app_brand_profile(uuid) to service_role;

-- ------------------------------------------------------------
-- app_set_brand_profile(p_brand_id, p_input) — /brand/my 브랜드 정보 저장 (데모 saveBrandInfo 의 정보 부분 + logoPick).
--   p_input { name, category, manager_name, manager_phone, description, logo_url } — **키가 있는 것만** 바꾼다(없는 키는 유지).
--     name 1~40자 · category ∈ ('건강기능식품','이너뷰티') · manager_name 1~30자 · manager_phone 형식(brand_normalize_phone · 빈 문자열은 null 로)
--     · description ≤ 500자(빈 문자열은 null) · logo_url https URL ≤ 500자(null · '' 은 로고 제거). 사업자번호·이메일·추천 코드는 여기서 못 바꾼다.
--   결과: 실패 {ok:false, code:'INVALID_INPUT', field} | NOT_FOUND · 성공 app_brand_profile 과 같은 모양 + saved:true.
-- ------------------------------------------------------------
create or replace function public.app_set_brand_profile(p_brand_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  b        public.brands%rowtype;
  v_name   text;
  v_cat    text;
  v_mgr    text;
  v_phone  text;
  v_desc   text;
  v_logo   text;
begin
  select * into b from public.brands where id = p_brand_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  v_name := b.name; v_cat := b.category; v_mgr := b.manager_name; v_phone := b.manager_phone; v_desc := b.description; v_logo := b.logo_url;

  if p_input ? 'name' then
    v_name := btrim(coalesce(p_input ->> 'name', ''));
    if v_name = '' or char_length(v_name) > 40 then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'name'); end if;
  end if;
  if p_input ? 'category' then
    v_cat := p_input ->> 'category';
    if v_cat is null or v_cat not in ('건강기능식품', '이너뷰티') then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'category'); end if;
  end if;
  if p_input ? 'manager_name' then
    v_mgr := btrim(coalesce(p_input ->> 'manager_name', ''));
    if v_mgr = '' or char_length(v_mgr) > 30 then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'manager_name'); end if;
  end if;
  if p_input ? 'manager_phone' then
    if btrim(coalesce(p_input ->> 'manager_phone', '')) = '' then
      v_phone := null;
    else
      v_phone := public.brand_normalize_phone(p_input ->> 'manager_phone');
      if v_phone is null then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'manager_phone'); end if;
    end if;
  end if;
  if p_input ? 'description' then
    v_desc := nullif(btrim(coalesce(p_input ->> 'description', '')), '');
    if v_desc is not null and char_length(v_desc) > 500 then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'description'); end if;
  end if;
  if p_input ? 'logo_url' then
    v_logo := nullif(btrim(coalesce(p_input ->> 'logo_url', '')), '');
    if v_logo is not null and (length(v_logo) > 500 or v_logo !~ '^https://[^\s]+$') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'field', 'logo_url');
    end if;
  end if;

  update public.brands
     set name = v_name, category = v_cat, manager_name = v_mgr, manager_phone = v_phone, description = v_desc, logo_url = v_logo
   where id = b.id;

  return public.app_brand_profile(b.id) || jsonb_build_object('saved', true);
end;
$$;
revoke all on function public.app_set_brand_profile(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.app_set_brand_profile(uuid, jsonb) to service_role;

-- ------------------------------------------------------------
-- app_brand_grade_card(p_brand_id) — 홈 · /brand/my 등급 카드 (데모 brandGradeHtml · pyrHtml · freeRefLeft · celBal). 읽기 전용 · 실시간.
--   { ok, gmv, grade, grade_cached, sort_order, top_pct, fee_discount, perk,
--     next{ grade, min_gmv, remaining } | null(블랙),
--     free_ref_per_month, free_ref_used_this_month, free_ref_left, celery_balance, celery_per_won,
--     tiers:[{ name, sort_order, min_gmv, fee_discount, top_pct, free_ref_per_month, perk }](블랙 → 스타터) }
--   grade 는 brand_grade_for_gmv(brand_gmv) — brands.grade 캐시(grade_cached)와 다를 수 있다(정산 실행이 갱신). 이달은 Asia/Seoul 달력월.
-- ------------------------------------------------------------
create or replace function public.app_brand_grade_card(p_brand_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  b          public.brands%rowtype;
  v_gmv      bigint;
  v_grade    text;
  t          public.brand_grade_tiers%rowtype;
  nx         public.brand_grade_tiers%rowtype;
  v_ym       text := to_char((now() at time zone 'Asia/Seoul')::date, 'YYYY-MM');
  v_used     integer;
  v_bal      integer := 0;
  v_per_won  bigint := 5000000;
  v_tiers    jsonb;
begin
  select * into b from public.brands where id = p_brand_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  v_gmv   := public.brand_gmv(b.id);
  v_grade := public.brand_grade_for_gmv(v_gmv);
  select * into t from public.brand_grade_tiers where name = v_grade;
  select * into nx from public.brand_grade_tiers where sort_order = t.sort_order - 1;
  v_used := coalesce((b.free_ref_used ->> v_ym)::integer, 0);
  select coalesce(cb.balance, 0) into v_bal from public.celery_balances cb where cb.owner_type = 'brand' and cb.brand_id = b.id;
  if not found then v_bal := 0; end if;
  select coalesce((value #>> '{}')::bigint, v_per_won) into v_per_won from public.platform_settings where key = 'celery_per_won';
  if not found then v_per_won := 5000000; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', g.name, 'sort_order', g.sort_order, 'min_gmv', g.min_gmv, 'fee_discount', g.fee_discount,
           'top_pct', g.top_pct, 'free_ref_per_month', g.free_ref_per_month, 'perk', g.perk) order by g.sort_order), '[]'::jsonb)
    into v_tiers from public.brand_grade_tiers g;

  return jsonb_build_object(
    'ok', true,
    'gmv', v_gmv,
    'grade', v_grade,
    'grade_cached', b.grade,
    'sort_order', t.sort_order,
    'top_pct', t.top_pct,
    'fee_discount', t.fee_discount,
    'perk', t.perk,
    'next', case when nx.name is null then null else jsonb_build_object('grade', nx.name, 'min_gmv', nx.min_gmv, 'remaining', greatest(nx.min_gmv - v_gmv, 0)) end,
    'free_ref_per_month', t.free_ref_per_month,
    'free_ref_used_this_month', v_used,
    'free_ref_left', greatest(t.free_ref_per_month - v_used, 0),
    'celery_balance', v_bal,
    'celery_per_won', v_per_won,
    'tiers', v_tiers
  );
end;
$$;
revoke all on function public.app_brand_grade_card(uuid) from public, anon, authenticated;
grant execute on function public.app_brand_grade_card(uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_grade_recalc(p_brand_id) — brands.grade 캐시 갱신. **운영 스크립트 · 정산 실행(관리자 6단계) 전용** — 틱·화면은 부르지 않는다.
--   { ok, gmv, grade, previous, changed }
-- ------------------------------------------------------------
create or replace function public.app_brand_grade_recalc(p_brand_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  b       public.brands%rowtype;
  v_gmv   bigint;
  v_grade text;
begin
  select * into b from public.brands where id = p_brand_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  v_gmv   := public.brand_gmv(b.id);
  v_grade := public.brand_grade_for_gmv(v_gmv);
  update public.brands set grade = v_grade where id = b.id and grade is distinct from v_grade;
  return jsonb_build_object('ok', true, 'gmv', v_gmv, 'grade', v_grade, 'previous', b.grade, 'changed', (b.grade is distinct from v_grade));
end;
$$;
revoke all on function public.app_brand_grade_recalc(uuid) from public, anon, authenticated;
grant execute on function public.app_brand_grade_recalc(uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_sales(p_brand_id) — /brand/sales 실시간 매출 (데모 vSales 의 브랜드 관점 · 0013 app_seller_sales 의 브랜드 판). 읽기 전용.
--   { ok, today, brand_grade, brand_discount_rate, settle_info_complete,
--     rates{ pg_rate, platform_rate, brand_ref_disc, brand_ref_times, clear_days },
--     campaigns:[{ campaign_id, campaign_code, status,
--                  seller{ id, code, name, handle, platform, avatar_url, grade }, product{ code, name, emoji, thumb_url, sale_price },
--                  start_date, end_date, due_on, qty, sold_qty,
--                  paid_count, refund_count, gross, canceled, refunded, net, sample_net, qty_sold, today_orders, today_gross,
--                  seller_rate, seller_grade, seller_bonus_pp, ref_boost_applied, brand_ref_applied,
--                  pg_fee, seller_fee, seller_bonus, ref_boost, seller_fee_total,
--                  platform_fee_gross, brand_discount, brand_ref_boost, platform_pg, brand_payout_est,
--                  daily:[{d, gross}](최근 7일 KST 일별 PAID 합), recent:[{code, buyer_masked, qty, amount, status, paid_at}](최근 8건) }],
--     totals{ net, pg_fee, seller_fee, platform_pg, brand_payout_est, today_gross, today_orders, paid_count, refund_count } }
--   브랜드가 부담하는 인플루언서 몫은 seller_fee(기본 요율분)뿐이다. seller_bonus(등급) · ref_boost(추천) 는 플랫폼 부담 — "인플루언서 수령 seller_fee_total" 참고 열.
--   금액은 라인마다 독립 반올림한 정수(0004 계약). totals 는 반올림 전 합을 마지막에 반올림한다(행 합과 ±1 차이 가능).
-- ------------------------------------------------------------
create or replace function public.app_brand_sales(p_brand_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  b              public.brands%rowtype;
  v_today        date := (now() at time zone 'Asia/Seoul')::date;
  v_pg           numeric := 0.019;
  v_platform     numeric := 0.10;
  v_ref_boost    numeric := 0.01;
  v_ref_times    integer := 5;
  v_bref_disc    numeric := 0.01;
  v_bref_times   integer := 3;
  v_clear_days   integer := 21;
  v_bgrade       text;
  v_bdisc_rate   numeric := 0;
  v_rows         jsonb := '[]'::jsonb;
  v_tot_net      numeric := 0;
  v_tot_pg       numeric := 0;
  v_tot_sf       numeric := 0;
  v_tot_ppg      numeric := 0;
  v_tot_pay      numeric := 0;
  v_tot_today    numeric := 0;
  v_tot_today_n  integer := 0;
  v_tot_paid     integer := 0;
  v_tot_ref      integer := 0;
  c              record;
  v_net          numeric;
  v_base         numeric;
  v_rate         numeric;
  v_pgf          numeric;
  v_sf           numeric;
  v_gb           numeric;
  v_boost        numeric;
  v_pfg          numeric;
  v_bdisc        numeric;
  v_bboost       numeric;
  v_ppg          numeric;
  v_payout       numeric;
  v_daily        jsonb;
  v_recent       jsonb;
begin
  select * into b from public.brands where id = p_brand_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select coalesce((value #>> '{}')::numeric, v_pg)         into v_pg         from public.platform_settings where key = 'pg_rate';
  select coalesce((value #>> '{}')::numeric, v_platform)   into v_platform   from public.platform_settings where key = 'platform_rate';
  select coalesce((value #>> '{}')::numeric, v_ref_boost)  into v_ref_boost  from public.platform_settings where key = 'ref_boost';
  select coalesce((value #>> '{}')::integer, v_ref_times)  into v_ref_times  from public.platform_settings where key = 'ref_times';
  select coalesce((value #>> '{}')::numeric, v_bref_disc)  into v_bref_disc  from public.platform_settings where key = 'brand_ref_disc';
  select coalesce((value #>> '{}')::integer, v_bref_times) into v_bref_times from public.platform_settings where key = 'brand_ref_times';
  v_clear_days := public.platform_clear_days();

  -- 브랜드 등급 할인 — 실시간 등급 (데모 bDiscOf(bgname(b)))
  v_bgrade := public.brand_grade_for_gmv(public.brand_gmv(b.id));
  select coalesce(gt.fee_discount, 0) into v_bdisc_rate from public.brand_grade_tiers gt where gt.name = v_bgrade;
  v_bdisc_rate := coalesce(v_bdisc_rate, 0);

  for c in
    with bdone as (
      -- isBrandRefBoost: 이 브랜드의 LIVE/CLEARING/SETTLED 캠페인을 생성일순으로 — 첫 brand_ref_times 건에만 −1%p
      select x.id, row_number() over (order by x.created_at, x.id) as rn
        from public.campaigns x
       where x.brand_id = b.id and x.status in ('LIVE','CLEARING','SETTLED')
    ), sdone as (
      -- isRefBoost(인플루언서 추천 부스트 · 플랫폼 부담 · 표시용): 인플루언서별 LIVE/CLEARING/SETTLED 순번
      select x.id, row_number() over (partition by x.seller_id order by x.created_at, x.id) as rn
        from public.campaigns x
       where x.status in ('LIVE','CLEARING','SETTLED')
         and x.seller_id in (select y.seller_id from public.campaigns y where y.brand_id = b.id and y.status in ('LIVE','CLEARING'))
    )
    select cp.id, cp.code, cp.status, cp.start_date, cp.end_date, cp.qty, cp.sold_qty,
           coalesce(cp.rate_locked, p.commission_rate) as rate,
           p.code as product_code, p.name as product_name, p.emoji, p.thumb_url, p.sale_price,
           s.id as seller_id, s.code as seller_code, s.name as seller_name, s.handle as seller_handle, s.platform as seller_platform, s.avatar_url as seller_avatar,
           coalesce(s.grade, public.grade_for_sales(s.m3_sales)) as seller_grade,
           (s.referred_by is not null and sd.rn is not null and sd.rn <= v_ref_times) as ref_applied,
           (b.referred_by is not null and bd.rn is not null and bd.rn <= v_bref_times) as bref_applied,
           coalesce((select count(*) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and not o.is_sample), 0)::integer as paid_count,
           coalesce((select count(*) from public.orders o where o.campaign_id = cp.id and o.status = 'REFUNDED'), 0)::integer as refund_count,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status <> 'CANCELED'), 0)::numeric as gross,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'CANCELED'), 0)::numeric as canceled,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'REFUNDED'), 0)::numeric as refunded,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and o.is_sample), 0)::numeric as sample_net,
           coalesce((select sum(o.qty) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and not o.is_sample), 0)::integer as qty_sold,
           coalesce((select count(*) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and not o.is_sample
                        and (o.paid_at at time zone 'Asia/Seoul')::date = v_today), 0)::integer as today_orders,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and not o.is_sample
                        and (o.paid_at at time zone 'Asia/Seoul')::date = v_today), 0)::numeric as today_gross
      from public.campaigns cp
      join public.products p on p.id = cp.product_id
      join public.sellers  s on s.id = cp.seller_id
      left join bdone bd on bd.id = cp.id
      left join sdone sd on sd.id = cp.id
     where cp.brand_id = b.id and cp.status in ('LIVE','CLEARING')
     order by cp.start_date desc nulls last, cp.created_at desc
  loop
    v_net    := c.gross - c.refunded;
    v_base   := v_net - c.sample_net;
    v_rate   := coalesce(c.rate, 0);
    v_pgf    := v_net * v_pg;
    v_sf     := v_base * v_rate;
    select coalesce(gt.bonus_pp, 0) into v_gb from public.grade_tiers gt where gt.name = c.seller_grade;
    v_gb     := v_base * coalesce(v_gb, 0) / 100;
    v_boost  := case when c.ref_applied then v_net * v_ref_boost else 0 end;
    v_pfg    := v_net * v_platform;
    v_bdisc  := v_net * v_bdisc_rate;
    v_bboost := case when c.bref_applied then v_net * v_bref_disc else 0 end;
    v_ppg    := v_pfg - v_bboost - v_bdisc + v_pgf;
    v_payout := v_net - v_pgf - v_sf - v_pfg + v_bboost + v_bdisc;

    select coalesce(jsonb_agg(jsonb_build_object('d', to_char(g.d, 'YYYY-MM-DD'), 'gross', coalesce(x.gross, 0)) order by g.d), '[]'::jsonb)
      into v_daily
      from generate_series(v_today - 6, v_today, interval '1 day') as g(d)
      left join (
        select (o.paid_at at time zone 'Asia/Seoul')::date as d, sum(o.amount)::bigint as gross
          from public.orders o
         where o.campaign_id = c.id and o.status = 'PAID' and not o.is_sample
           and (o.paid_at at time zone 'Asia/Seoul')::date between v_today - 6 and v_today
         group by 1
      ) x on x.d = g.d::date;

    select coalesce(jsonb_agg(r order by r.paid_at desc), '[]'::jsonb) into v_recent
      from (
        select o.code, public.partner_mask_name(o.buyer_name) as buyer_masked, o.qty, o.amount, o.status, o.paid_at
          from public.orders o
         where o.campaign_id = c.id and not o.is_sample and o.status <> 'CANCELED'
         order by o.paid_at desc
         limit 8
      ) r;

    v_rows := v_rows || jsonb_build_object(
      'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
      'seller', jsonb_build_object('id', c.seller_id, 'code', c.seller_code, 'name', c.seller_name, 'handle', c.seller_handle,
                                   'platform', c.seller_platform, 'avatar_url', c.seller_avatar, 'grade', c.seller_grade),
      'product', jsonb_build_object('code', c.product_code, 'name', c.product_name, 'emoji', coalesce(c.emoji, '📦'), 'thumb_url', c.thumb_url, 'sale_price', c.sale_price),
      'start_date', c.start_date, 'end_date', c.end_date,
      'due_on', case when c.end_date is null then null else c.end_date + v_clear_days end,
      'qty', c.qty, 'sold_qty', c.sold_qty,
      'paid_count', c.paid_count, 'refund_count', c.refund_count,
      'gross', round(c.gross), 'canceled', round(c.canceled), 'refunded', round(c.refunded),
      'net', round(v_net), 'sample_net', round(c.sample_net), 'qty_sold', c.qty_sold,
      'today_orders', c.today_orders, 'today_gross', round(c.today_gross),
      'seller_rate', v_rate, 'seller_grade', c.seller_grade,
      'seller_bonus_pp', (select coalesce(gt.bonus_pp, 0) from public.grade_tiers gt where gt.name = c.seller_grade),
      'ref_boost_applied', c.ref_applied, 'brand_ref_applied', c.bref_applied,
      'pg_fee', round(v_pgf), 'seller_fee', round(v_sf), 'seller_bonus', round(v_gb), 'ref_boost', round(v_boost),
      'seller_fee_total', round(v_sf + v_gb + v_boost),
      'platform_fee_gross', round(v_pfg), 'brand_discount', round(v_bdisc), 'brand_ref_boost', round(v_bboost),
      'platform_pg', round(v_ppg), 'brand_payout_est', round(v_payout),
      'daily', v_daily, 'recent', v_recent
    );

    v_tot_net     := v_tot_net + v_net;
    v_tot_pg      := v_tot_pg + v_pgf;
    v_tot_sf      := v_tot_sf + v_sf;
    v_tot_ppg     := v_tot_ppg + v_ppg;
    v_tot_pay     := v_tot_pay + v_payout;
    v_tot_today   := v_tot_today + c.today_gross;
    v_tot_today_n := v_tot_today_n + c.today_orders;
    v_tot_paid    := v_tot_paid + c.paid_count;
    v_tot_ref     := v_tot_ref + c.refund_count;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'brand_grade', v_bgrade,
    'brand_discount_rate', v_bdisc_rate,
    'settle_info_complete', public.brand_settle_info_complete(b),
    'rates', jsonb_build_object('pg_rate', v_pg, 'platform_rate', v_platform, 'brand_ref_disc', v_bref_disc, 'brand_ref_times', v_bref_times, 'clear_days', v_clear_days),
    'campaigns', v_rows,
    'totals', jsonb_build_object(
      'net', round(v_tot_net), 'pg_fee', round(v_tot_pg), 'seller_fee', round(v_tot_sf), 'platform_pg', round(v_tot_ppg), 'brand_payout_est', round(v_tot_pay),
      'today_gross', round(v_tot_today), 'today_orders', v_tot_today_n, 'paid_count', v_tot_paid, 'refund_count', v_tot_ref)
  );
end;
$$;
revoke all on function public.app_brand_sales(uuid) from public, anon, authenticated;
grant execute on function public.app_brand_sales(uuid) to service_role;

-- ------------------------------------------------------------
-- app_brand_settlements(p_brand_id) — /brand/settle 하단 표 (데모 vBrandSettle · settlement-policy §11.3 + plan §8 열 결정). 읽기 전용.
--   settlements 스냅샷(정산 실행 뒤) + 아직 정산 전인 LIVE/CLEARING 캠페인(예정 행 — 금액은 app_brand_sales 와 같은 식) 을 한 표로.
--   { ok, settle_info_complete, has_bank_info, rows:[{
--       kind:'settled'|'pending', campaign_id, campaign_code, status, seller{code,name,handle,platform,grade}, product{code,name,emoji,thumb_url}, start_date, end_date,
--       net, sample_net, seller_rate, pg_fee, seller_fee, seller_bonus, ref_boost, seller_fee_total,
--       platform_fee_gross, brand_grade, brand_discount_rate, brand_discount, brand_ref_applied, brand_ref_boost, platform_pg, brand_payout,
--       hold_brand, settlement_status, due_on, settled_at, paid_at,
--       payout{ status, amount, paid_at, hold_reason } | null }],
--     totals{ settled_payout, pending_payout, held_payout } }
--   settled 행은 settlements 의 저장값 그대로(재계산하지 않는다 — 0004 반올림 계약). platform_pg 만 저장값으로 조립: platform_fee_gross − brand_ref_boost − brand_discount + pg_fee.
--   platform_fee/platform_net/sample_cel_cover 는 싣지 않는다(관리자 전용). 인플루언서 원천징수·실수령도 싣지 않는다(상대 파트너 몫 — access §2).
--   SETTLED 인데 settlements 행이 없는 캠페인(시드 c6) 은 kind:'settled' + 금액 null 로 나온다 — 화면은 "명세 준비 중".
-- ------------------------------------------------------------
create or replace function public.app_brand_settlements(p_brand_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  b            public.brands%rowtype;
  v_pg         numeric := 0.019;
  v_platform   numeric := 0.10;
  v_ref_boost  numeric := 0.01;
  v_ref_times  integer := 5;
  v_bref_disc  numeric := 0.01;
  v_bref_times integer := 3;
  v_clear_days integer := 21;
  v_bgrade     text;
  v_bdisc_rate numeric := 0;
  v_complete   boolean;
  v_rows       jsonb := '[]'::jsonb;
  v_settled    numeric := 0;
  v_pending    numeric := 0;
  v_held       numeric := 0;
  c            record;
  v_net        numeric;
  v_base       numeric;
  v_rate       numeric;
  v_pgf        numeric;
  v_sf         numeric;
  v_gb         numeric;
  v_boost      numeric;
  v_pfg        numeric;
  v_bdisc      numeric;
  v_bboost     numeric;
  v_ppg        numeric;
  v_payout     numeric;
begin
  select * into b from public.brands where id = p_brand_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select coalesce((value #>> '{}')::numeric, v_pg)         into v_pg         from public.platform_settings where key = 'pg_rate';
  select coalesce((value #>> '{}')::numeric, v_platform)   into v_platform   from public.platform_settings where key = 'platform_rate';
  select coalesce((value #>> '{}')::numeric, v_ref_boost)  into v_ref_boost  from public.platform_settings where key = 'ref_boost';
  select coalesce((value #>> '{}')::integer, v_ref_times)  into v_ref_times  from public.platform_settings where key = 'ref_times';
  select coalesce((value #>> '{}')::numeric, v_bref_disc)  into v_bref_disc  from public.platform_settings where key = 'brand_ref_disc';
  select coalesce((value #>> '{}')::integer, v_bref_times) into v_bref_times from public.platform_settings where key = 'brand_ref_times';
  v_clear_days := public.platform_clear_days();
  v_bgrade := public.brand_grade_for_gmv(public.brand_gmv(b.id));
  select coalesce(gt.fee_discount, 0) into v_bdisc_rate from public.brand_grade_tiers gt where gt.name = v_bgrade;
  v_bdisc_rate := coalesce(v_bdisc_rate, 0);
  v_complete := public.brand_settle_info_complete(b);

  for c in
    with bdone as (
      select x.id, row_number() over (order by x.created_at, x.id) as rn
        from public.campaigns x
       where x.brand_id = b.id and x.status in ('LIVE','CLEARING','SETTLED')
    ), sdone as (
      select x.id, row_number() over (partition by x.seller_id order by x.created_at, x.id) as rn
        from public.campaigns x
       where x.status in ('LIVE','CLEARING','SETTLED')
         and x.seller_id in (select y.seller_id from public.campaigns y where y.brand_id = b.id and y.status in ('LIVE','CLEARING','SETTLED'))
    )
    select cp.id, cp.code, cp.status, cp.start_date, cp.end_date, cp.settled_at as c_settled_at,
           coalesce(cp.rate_locked, p.commission_rate) as rate,
           p.code as product_code, p.name as product_name, p.emoji, p.thumb_url,
           s.code as seller_code, s.name as seller_name, s.handle as seller_handle, s.platform as seller_platform,
           coalesce(s.grade, public.grade_for_sales(s.m3_sales)) as seller_grade,
           (select coalesce(gt.bonus_pp, 0) from public.grade_tiers gt where gt.name = coalesce(s.grade, public.grade_for_sales(s.m3_sales))) as seller_bonus_pp,
           (s.referred_by is not null and sd.rn is not null and sd.rn <= v_ref_times) as ref_applied,
           (b.referred_by is not null and bd.rn is not null and bd.rn <= v_bref_times) as bref_applied,
           st.id as settlement_id, st.net as st_net, st.sample_net as st_sample_net, st.seller_rate as st_seller_rate,
           st.pg_fee as st_pg_fee, st.seller_fee as st_seller_fee, st.seller_bonus as st_seller_bonus, st.ref_boost as st_ref_boost, st.seller_fee_total as st_seller_fee_total,
           st.platform_fee_gross as st_pfg, st.brand_grade as st_brand_grade, st.brand_discount_rate as st_bdisc_rate, st.brand_discount as st_bdisc,
           st.brand_ref_applied as st_bref_applied, st.brand_ref_boost as st_bboost, st.brand_payout as st_brand_payout,
           st.hold_brand as st_hold_brand, st.status as st_status, st.due_on as st_due_on, st.settled_at as st_settled_at, st.paid_at as st_paid_at,
           po.status as po_status, po.amount as po_amount, po.paid_at as po_paid_at, po.hold_reason as po_hold_reason,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status <> 'CANCELED'), 0)::numeric
             - coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'REFUNDED'), 0)::numeric as live_net,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and o.is_sample), 0)::numeric as live_sample_net
      from public.campaigns cp
      join public.products p on p.id = cp.product_id
      join public.sellers  s on s.id = cp.seller_id
      left join bdone bd on bd.id = cp.id
      left join sdone sd on sd.id = cp.id
      left join public.settlements st on st.campaign_id = cp.id
      left join public.payouts po on po.settlement_id = st.id and po.payee_type = 'brand'
     where cp.brand_id = b.id and cp.status in ('LIVE','CLEARING','SETTLED')
     order by coalesce(cp.end_date, cp.start_date) desc nulls last, cp.created_at desc
  loop
    if c.settlement_id is not null then
      v_rows := v_rows || jsonb_build_object(
        'kind', 'settled', 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
        'seller', jsonb_build_object('code', c.seller_code, 'name', c.seller_name, 'handle', c.seller_handle, 'platform', c.seller_platform, 'grade', c.seller_grade),
        'product', jsonb_build_object('code', c.product_code, 'name', c.product_name, 'emoji', coalesce(c.emoji, '📦'), 'thumb_url', c.thumb_url),
        'start_date', c.start_date, 'end_date', c.end_date,
        'net', c.st_net, 'sample_net', c.st_sample_net, 'seller_rate', c.st_seller_rate,
        'pg_fee', c.st_pg_fee, 'seller_fee', c.st_seller_fee, 'seller_bonus', c.st_seller_bonus, 'ref_boost', c.st_ref_boost, 'seller_fee_total', c.st_seller_fee_total,
        'platform_fee_gross', c.st_pfg, 'brand_grade', c.st_brand_grade, 'brand_discount_rate', c.st_bdisc_rate, 'brand_discount', c.st_bdisc,
        'brand_ref_applied', c.st_bref_applied, 'brand_ref_boost', c.st_bboost,
        'platform_pg', c.st_pfg - c.st_bboost - c.st_bdisc + c.st_pg_fee,
        'brand_payout', c.st_brand_payout,
        'hold_brand', c.st_hold_brand, 'settlement_status', c.st_status,
        'due_on', c.st_due_on, 'settled_at', c.st_settled_at, 'paid_at', c.st_paid_at,
        'payout', case when c.po_status is null then null else jsonb_build_object('status', c.po_status, 'amount', c.po_amount, 'paid_at', c.po_paid_at, 'hold_reason', c.po_hold_reason) end
      );
      v_settled := v_settled + coalesce(c.st_brand_payout, 0);
      if c.st_hold_brand or c.po_status = 'held' then v_held := v_held + coalesce(c.st_brand_payout, 0); end if;
    elsif c.status = 'SETTLED' then
      -- 스냅샷 없는 SETTLED (시드 c6 parity — 0004 헤더) : 금액 null
      v_rows := v_rows || jsonb_build_object(
        'kind', 'settled', 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
        'seller', jsonb_build_object('code', c.seller_code, 'name', c.seller_name, 'handle', c.seller_handle, 'platform', c.seller_platform, 'grade', c.seller_grade),
        'product', jsonb_build_object('code', c.product_code, 'name', c.product_name, 'emoji', coalesce(c.emoji, '📦'), 'thumb_url', c.thumb_url),
        'start_date', c.start_date, 'end_date', c.end_date,
        'net', null, 'sample_net', null, 'seller_rate', c.rate,
        'pg_fee', null, 'seller_fee', null, 'seller_bonus', null, 'ref_boost', null, 'seller_fee_total', null,
        'platform_fee_gross', null, 'brand_grade', null, 'brand_discount_rate', null, 'brand_discount', null,
        'brand_ref_applied', null, 'brand_ref_boost', null, 'platform_pg', null, 'brand_payout', null,
        'hold_brand', null, 'settlement_status', null,
        'due_on', case when c.end_date is null then null else c.end_date + v_clear_days end, 'settled_at', c.c_settled_at, 'paid_at', null, 'payout', null
      );
    else
      v_net    := c.live_net;
      v_base   := c.live_net - c.live_sample_net;
      v_rate   := coalesce(c.rate, 0);
      v_pgf    := v_net * v_pg;
      v_sf     := v_base * v_rate;
      v_gb     := v_base * coalesce(c.seller_bonus_pp, 0) / 100;
      v_boost  := case when c.ref_applied then v_net * v_ref_boost else 0 end;
      v_pfg    := v_net * v_platform;
      v_bdisc  := v_net * v_bdisc_rate;
      v_bboost := case when c.bref_applied then v_net * v_bref_disc else 0 end;
      v_ppg    := v_pfg - v_bboost - v_bdisc + v_pgf;
      v_payout := v_net - v_pgf - v_sf - v_pfg + v_bboost + v_bdisc;
      v_rows := v_rows || jsonb_build_object(
        'kind', 'pending', 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
        'seller', jsonb_build_object('code', c.seller_code, 'name', c.seller_name, 'handle', c.seller_handle, 'platform', c.seller_platform, 'grade', c.seller_grade),
        'product', jsonb_build_object('code', c.product_code, 'name', c.product_name, 'emoji', coalesce(c.emoji, '📦'), 'thumb_url', c.thumb_url),
        'start_date', c.start_date, 'end_date', c.end_date,
        'net', round(v_net), 'sample_net', round(c.live_sample_net), 'seller_rate', v_rate,
        'pg_fee', round(v_pgf), 'seller_fee', round(v_sf), 'seller_bonus', round(v_gb), 'ref_boost', round(v_boost), 'seller_fee_total', round(v_sf + v_gb + v_boost),
        'platform_fee_gross', round(v_pfg), 'brand_grade', v_bgrade, 'brand_discount_rate', v_bdisc_rate, 'brand_discount', round(v_bdisc),
        'brand_ref_applied', c.bref_applied, 'brand_ref_boost', round(v_bboost),
        'platform_pg', round(v_ppg), 'brand_payout', round(v_payout),
        'hold_brand', not v_complete, 'settlement_status', null,
        'due_on', case when c.end_date is null then null else c.end_date + v_clear_days end, 'settled_at', null, 'paid_at', null, 'payout', null
      );
      v_pending := v_pending + v_payout;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'settle_info_complete', v_complete,
    'has_bank_info', (b.bank_info is not null and coalesce(b.bank_info ->> 'account', '') <> ''),
    'rows', v_rows,
    'totals', jsonb_build_object('settled_payout', round(v_settled), 'pending_payout', round(v_pending), 'held_payout', round(v_held))
  );
end;
$$;
revoke all on function public.app_brand_settlements(uuid) from public, anon, authenticated;
grant execute on function public.app_brand_settlements(uuid) to service_role;
