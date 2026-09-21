-- ============================================================
-- 0013 — 인플루언서 콘솔 5단계 "매출 · 정산 자료": pgcrypto · 주민등록번호 암호화(sellers.rrn_enc) · 열람 로그(sensitive_access_log) ·
--        세금계산서 정보(sellers.tax_info) · settlements.sample_cel_cover · 정산 정보 등록/조회 · 실시간 매출 · 정산 내역 함수
--
-- 근거: docs/inf-console-plan.md §5.9(계좌 등록 · 원천징수 자료 — 송금은 범위 밖) · §4.9(민감 컬럼은 콘솔 응답에서 마스킹, 원문은 service role 만) ·
--       §6 `/sales` `/settle` · §7 "5. 매출 · 정산 자료"(계획서의 "0012" — 0012 는 4단계 partner_payments 가 썼으므로 **0013**) ·
--       docs/settlement-policy.md §3(calc) · §7(세금) · §8.3(지급 보류) · §9(샘플 구매분) · §11.2(인플루언서 정산 표) · docs/data-model.md §4(스냅샷 규칙).
-- 실행: 0012 이후. 재실행 가능(create extension if not exists / add column if not exists / create or replace / create table if not exists).
-- 범위: **인플루언서가 보는 것과 등록하는 것만.** 정산 실행(settlements insert · payouts · m3_sales 증분 · 🥬 earned) 은 관리자 콘솔(6단계 이후)
--       — 여기서는 만들지 않는다. 화면(/sales · /settle) 은 다음 PR(PR-B). 이 파일 + @sellery/db/server/partner/{sales,settle}.server.ts +
--       @sellery/db/partner/settle-rules.ts 가 계약이다.
--
-- 숫자·규칙의 정답은 packages/core/src/{constants,helpers,actions}.ts 다. 이 SQL 은 그 규칙을 옮긴 것이고, 바꿀 때는 둘을 함께 고친다.
--
-- | 규칙 | 코어 원본 | 여기서 |
-- |---|---|---|
-- | 확정 매출 net = Σ(status≠CANCELED) − Σ(REFUNDED) · sample_net = Σ(is_sample & PAID) | calc() gross/refund/net/sampleNet | app_seller_sales · (정산 뒤에는 settlements 스냅샷) |
-- | 인플루언서 기본 수수료 sf = (net − sample_net) × 요율 · 요율은 상품 commission_rate(확정 시 rate_locked 가 있으면 그 값) | calc().sf · p.rate | app_seller_sales.my_rate · my_fee |
-- | 등급 보너스 gBonus = (net − sample_net) × bonus_pp/100 (플랫폼 부담) | gradeBonusOf · GRADES[].bonus | grade_tiers.bonus_pp (sellers.grade 캐시 → 비면 grade_for_sales) |
-- | 추천 부스트 boost = net × 0.01 — 피추천 인플루언서의 LIVE/CLEARING/SETTLED 캠페인을 생성일순으로 세어 첫 5회 | isRefBoost · REF_BOOST · REF_TIMES | platform_settings ref_boost · ref_times, row_number() over (created_at) |
-- | 세전 합계 sfTotal = sf + gBonus + boost · 원천징수 = settle_type='biz' 면 0, 그 외(personal · null) 3.3% · 실수령 = sfTotal × (1 − wht) | sfTotal · sellerWht · WHT | platform_settings wht_rate — §5.9 "항상 3.3%" 버그를 재현하지 않는다 |
-- | 정산 기준일 = 종료일 + 21 | settleDue · CLEAR_DAYS | platform_settings clear_days (settlements.due_on 이 있으면 그 값) |
-- | 반올림: 라인마다 독립 원 단위 half-up (JS Math.round) | 0004 헤더 반올림 계약 | round(numeric) |
-- | 정산 정보: 은행·계좌·예금주 필수, 사업자면 사업자등록번호 필수 · 은행은 BANKS 목록 | saveSettleInfo · BANKS | app_set_settle_info — sellers_biz_requires_bizno 제약과 일치 |
-- | 지급 보류 = 계좌 미등록 (bank_info.account 없음) | runSettle holdS | app_seller_settle_info.has_bank_info · settlements.hold_seller |
-- | 샘플 환급(refund 옵션) 은 정산 실행 시 1회 · 현금분은 지급액 가산(원천징수 없음) · 🥬 는 원장 복원 | runSettle refundCash | settlements.sample_refund_cash/cel (0004) — 표시만 |
-- | 🥬 결제분 브랜드 보전 celCover = Σ sample_purchase 원장 × 20,000 (플랫폼 비용) | vAdminRevenue celCover · §5.5 | settlements.sample_cel_cover (열만 — 정산 실행이 채운다) |
--
-- 설계 요점
--   · 전부 security definer · service_role 만 execute(0007 패턴). 콘솔은 requireSeller() 의 seller.id 만 넘긴다.
--   · **콘솔 응답에는 계좌 원문·주민번호가 없다** — bank_info 는 마스킹(뒤 4자리)·biz_no 는 마스킹(뒤 5자리)·주민번호는 "등록됨" + 성별 자리 마스크만.
--     원문 열람은 app_seller_rrn_decrypt 뿐이고, 호출마다 sensitive_access_log 1행을 남긴다(운영 스크립트 · 지급명세서 제출용).
--   · 암호화 키는 **DB 에 없다** — 서버 env `RRN_ENC_KEY`(§5.9) 를 함수 인자 p_key 로 받아 extensions.pgp_sym_encrypt/decrypt 에 그대로 쓴다.
--     키가 비면 {ok:false, code:'RRN_KEY_MISSING'} (저장·복호 모두). 키 회전은 decrypt(옛 키) → set(새 키) 를 운영 스크립트가 행마다.
--   · 함수는 예외 대신 {ok, code} 를 돌려준다(0010~0012 관례). 라우트가 code 를 문구로(packages/db/src/partner/settle-rules.ts).
--   · RLS 변경 없음. sensitive_access_log 는 RLS on + revoke all(anon·authenticated) — 0007 default privileges 로 service_role 만.
--   · 사업자등록증 파일은 0006 의 비공개 버킷 partner-docs 에 서버가 올리고 sellers.biz_doc_url 에는 **object path 만**(0001 주석 그대로 — 별도 열을 만들지 않는다).
-- ============================================================

-- ------------------------------------------------------------
-- 확장 · 컬럼
-- ------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

alter table public.sellers add column if not exists rrn_enc    bytea;        -- pgp_sym_encrypt(주민등록번호 13자리, RRN_ENC_KEY) — service role 전용, 콘솔에는 등록 여부만
alter table public.sellers add column if not exists rrn_mask   text;         -- '******-1******' (성별 자리만) — 복호 없이 보여줄 마스크
alter table public.sellers add column if not exists rrn_set_at timestamptz;  -- 등록 시각 (has_rrn = rrn_set_at is not null — SellerSummary 가 bytea 를 읽지 않게)
alter table public.sellers add column if not exists tax_info   jsonb;        -- 사업자 세금계산서 정보 { company, ceo, biz_type, biz_item, email } (settle_type='biz')
comment on column public.sellers.rrn_enc    is '주민등록번호 pgp_sym_encrypt(RRN_ENC_KEY) — 0013. 복호는 app_seller_rrn_decrypt 만(열람 로그)';
comment on column public.sellers.rrn_mask   is '주민등록번호 마스크 ******-N****** — 0013';
comment on column public.sellers.rrn_set_at is '주민등록번호 등록 시각 — null 이면 미등록 — 0013';
comment on column public.sellers.tax_info   is '세금계산서 발행 정보 {company, ceo, biz_type, biz_item, email} — settle_type=biz — 0013';

-- 🥬 결제분 브랜드 원화 보전 (§5.5 celCover) — 정산 실행이 채운다. 인플루언서 화면에는 보이지 않는다(플랫폼 비용).
alter table public.settlements add column if not exists sample_cel_cover bigint not null default 0 check (sample_cel_cover >= 0);
comment on column public.settlements.sample_cel_cover is '샘플 🥬 결제분 브랜드 원화 보전 Σ(sample_purchase 원장 × 20,000) — 플랫폼 비용, platform_fee 에서 차감 — 0013';

-- ------------------------------------------------------------
-- sensitive_access_log — 민감 컬럼 원문 열람 로그 (§5.9). 복호 함수가 호출마다 1행. 삭제·수정 없음(append-only 는 운영 규칙).
-- ------------------------------------------------------------
create table if not exists public.sensitive_access_log (
  id          bigint generated always as identity primary key,
  seller_id   uuid references public.sellers (id) on delete set null,
  field       text not null check (field in ('rrn','bank_info')),   -- 열람한 컬럼
  actor       text not null,                                        -- 운영자 식별(이메일·스크립트 이름) — 호출자가 넘긴다
  purpose     text not null,                                        -- '지급명세서 2026-09' 등
  at          timestamptz not null default now()
);
create index if not exists sensitive_access_log_seller_idx on public.sensitive_access_log (seller_id, at desc);
alter table public.sensitive_access_log enable row level security;
revoke all on public.sensitive_access_log from anon, authenticated;

-- ------------------------------------------------------------
-- 주민등록번호 형식 검증 — 13자리 · 생년월일 유효 · 뒷자리 첫 숫자 1~8 · 검증숫자(가중치 2,3,4,5,6,7,8,9,2,3,4,5 · (11 − Σ mod 11) mod 10).
-- 주의: 2020-10 이후 신규 부여분은 검증숫자 규칙이 폐지됐다(임의 번호). 인플루언서(성인)에게는 사실상 영향 없으나, 거부되는 실사례가 나오면
--       app_set_seller_rrn 의 p_skip_checksum 으로 운영자가 우회한다(콘솔은 항상 false).
-- ------------------------------------------------------------
create or replace function public.partner_rrn_valid(p_rrn text, p_skip_checksum boolean default false)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  d      text := regexp_replace(coalesce(p_rrn, ''), '[^0-9]', '', 'g');
  w      integer[] := array[2,3,4,5,6,7,8,9,2,3,4,5];
  s      integer := 0;
  i      integer;
  g      integer;
  yy     integer;
  mm     integer;
  dd     integer;
  century integer;
begin
  if length(d) <> 13 then return false; end if;
  g := substr(d, 7, 1)::integer;
  if g < 1 or g > 8 then return false; end if;
  yy := substr(d, 1, 2)::integer; mm := substr(d, 3, 2)::integer; dd := substr(d, 5, 2)::integer;
  century := case when g in (1,2,5,6) then 1900 when g in (3,4,7,8) then 2000 else 1900 end;
  begin
    perform make_date(century + yy, mm, dd);
  exception when others then
    return false;
  end;
  if p_skip_checksum then return true; end if;
  for i in 1..12 loop
    s := s + substr(d, i, 1)::integer * w[i];
  end loop;
  return ((11 - (s % 11)) % 10) = substr(d, 13, 1)::integer;
end;
$$;
revoke all on function public.partner_rrn_valid(text, boolean) from public, anon, authenticated;
grant execute on function public.partner_rrn_valid(text, boolean) to service_role;

-- ------------------------------------------------------------
-- 계좌 마스킹 — 숫자만 남기고 뒤 4자리 외 '*' ('3333012345678' → '*********5678'). 4자리 이하면 전부 '*'.
-- 사업자등록번호 마스킹 — '512-21-00987' → '***-**-00987'.
-- ------------------------------------------------------------
create or replace function public.partner_mask_account(p_account text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
           when p_account is null then null
           when length(regexp_replace(p_account, '[^0-9]', '', 'g')) <= 4 then repeat('*', length(regexp_replace(p_account, '[^0-9]', '', 'g')))
           else repeat('*', length(regexp_replace(p_account, '[^0-9]', '', 'g')) - 4) || right(regexp_replace(p_account, '[^0-9]', '', 'g'), 4)
         end
$$;
revoke all on function public.partner_mask_account(text) from public, anon, authenticated;
grant execute on function public.partner_mask_account(text) to service_role;

create or replace function public.partner_mask_biz_no(p_biz_no text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
           when p_biz_no is null then null
           when regexp_replace(p_biz_no, '[^0-9]', '', 'g') ~ '^\d{10}$' then '***-**-' || right(regexp_replace(p_biz_no, '[^0-9]', '', 'g'), 5)
           else repeat('*', greatest(length(p_biz_no) - 5, 0)) || right(p_biz_no, least(length(p_biz_no), 5))
         end
$$;
revoke all on function public.partner_mask_biz_no(text) from public, anon, authenticated;
grant execute on function public.partner_mask_biz_no(text) to service_role;

-- ------------------------------------------------------------
-- app_seller_settle_info(p_seller_id) — /settle 상단 폼 프리필 · 경고. **원문 없음.**
--   { ok, settle_type, has_bank_info, bank, holder, account_masked, has_tax_info, tax_info{company,ceo,biz_type,biz_item,email},
--     biz_no_masked, has_biz_doc, has_rrn, rrn_mask, rrn_set_at, wht_rate }
--   wht_rate: settle_type='biz' → 0, 그 외 platform_settings.wht_rate (sellerWht).
-- ------------------------------------------------------------
create or replace function public.app_seller_settle_info(p_seller_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  s        public.sellers%rowtype;
  v_wht    numeric := 0.033;
begin
  select * into s from public.sellers where id = p_seller_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select coalesce((ps.value #>> '{}')::numeric, 0.033) into v_wht from public.platform_settings ps where ps.key = 'wht_rate';
  if not found then v_wht := 0.033; end if;
  return jsonb_build_object(
    'ok', true,
    'settle_type', s.settle_type,
    'has_bank_info', (s.bank_info is not null and coalesce(s.bank_info ->> 'account', '') <> ''),
    'bank', s.bank_info ->> 'bank',
    'holder', s.bank_info ->> 'holder',
    'account_masked', public.partner_mask_account(s.bank_info ->> 'account'),
    'has_tax_info', (s.tax_info is not null and coalesce(s.tax_info ->> 'company', '') <> ''),
    'tax_info', case when s.tax_info is null then null else jsonb_build_object(
      'company', s.tax_info ->> 'company', 'ceo', s.tax_info ->> 'ceo',
      'biz_type', s.tax_info ->> 'biz_type', 'biz_item', s.tax_info ->> 'biz_item', 'email', s.tax_info ->> 'email') end,
    'biz_no_masked', public.partner_mask_biz_no(s.biz_no),
    'has_biz_doc', (s.biz_doc_url is not null and s.biz_doc_url <> ''),
    'has_rrn', (s.rrn_set_at is not null),
    'rrn_mask', s.rrn_mask,
    'rrn_set_at', s.rrn_set_at,
    'wht_rate', case when s.settle_type = 'biz' then 0 else v_wht end
  );
end;
$$;
revoke all on function public.app_seller_settle_info(uuid) from public, anon, authenticated;
grant execute on function public.app_seller_settle_info(uuid) to service_role;

-- ------------------------------------------------------------
-- app_set_settle_info(p_seller_id, p_settle_type, p_bank, p_tax) — /settle 폼 저장 (saveSettleInfo).
--   p_bank { bank, account, holder } — 셋 다 필수. bank 는 BANKS 목록(packages/core/src/constants.ts BANKS — '선택' 제외) 안. account 는 숫자·'-' 만, 숫자 8~16자리.
--   p_tax  { biz_no, company, ceo, biz_type, biz_item, email } — settle_type='biz' 면 biz_no 필수(사업자등록번호 10자리, '000-00-00000' 로 정규화).
--          'personal' 이면 무시하고 tax_info 는 유지하지 않는다(null) — biz_no 도 null (sellers_biz_requires_bizno 는 biz 일 때만 요구).
--   결과: 실패 {ok:false, code: BAD_TYPE|BANK_REQUIRED|BAD_BANK|BAD_ACCOUNT|HOLDER_REQUIRED|BIZ_NO_REQUIRED|BAD_BIZ_NO|NOT_FOUND}
--         성공 app_seller_settle_info 와 같은 모양 + saved:true.
--   bank_info 원문은 sellers 에 평문 jsonb 로 남긴다(§5.9 의도적 결정 — 정산 지급 수단 확정 때 bank_account_enc 로 옮길지 결정).
-- ------------------------------------------------------------
create or replace function public.app_set_settle_info(p_seller_id uuid, p_settle_type text, p_bank jsonb, p_tax jsonb default null)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  s          public.sellers%rowtype;
  v_bank     text := btrim(coalesce(p_bank ->> 'bank', ''));
  v_account  text := regexp_replace(coalesce(p_bank ->> 'account', ''), '[^0-9]', '', 'g');
  v_holder   text := btrim(coalesce(p_bank ->> 'holder', ''));
  v_biz_no   text := regexp_replace(coalesce(p_tax ->> 'biz_no', ''), '[^0-9]', '', 'g');
  v_tax      jsonb := null;
  v_banks    text[] := array['국민','신한','우리','하나','농협','카카오뱅크','토스뱅크','기업','SC제일'];   -- = core BANKS 에서 '선택' 제외
begin
  if p_settle_type is null or p_settle_type not in ('personal','biz') then
    return jsonb_build_object('ok', false, 'code', 'BAD_TYPE');
  end if;
  select * into s from public.sellers where id = p_seller_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if v_bank = '' or v_bank = '선택' then return jsonb_build_object('ok', false, 'code', 'BANK_REQUIRED'); end if;
  if not (v_bank = any (v_banks)) then return jsonb_build_object('ok', false, 'code', 'BAD_BANK'); end if;
  if v_account !~ '^\d{8,16}$' then return jsonb_build_object('ok', false, 'code', 'BAD_ACCOUNT'); end if;
  if v_holder = '' or length(v_holder) > 40 then return jsonb_build_object('ok', false, 'code', 'HOLDER_REQUIRED'); end if;

  if p_settle_type = 'biz' then
    if v_biz_no = '' then return jsonb_build_object('ok', false, 'code', 'BIZ_NO_REQUIRED'); end if;
    if v_biz_no !~ '^\d{10}$' then return jsonb_build_object('ok', false, 'code', 'BAD_BIZ_NO'); end if;
    v_biz_no := substr(v_biz_no, 1, 3) || '-' || substr(v_biz_no, 4, 2) || '-' || substr(v_biz_no, 6, 5);
    v_tax := jsonb_strip_nulls(jsonb_build_object(
      'company',  nullif(left(btrim(coalesce(p_tax ->> 'company', '')), 60), ''),
      'ceo',      nullif(left(btrim(coalesce(p_tax ->> 'ceo', '')), 40), ''),
      'biz_type', nullif(left(btrim(coalesce(p_tax ->> 'biz_type', '')), 40), ''),
      'biz_item', nullif(left(btrim(coalesce(p_tax ->> 'biz_item', '')), 40), ''),
      'email',    nullif(left(lower(btrim(coalesce(p_tax ->> 'email', ''))), 120), '')));
    if v_tax = '{}'::jsonb then v_tax := null; end if;
  else
    v_biz_no := null;
  end if;

  update public.sellers
     set settle_type = p_settle_type,
         bank_info   = jsonb_build_object('bank', v_bank, 'account', v_account, 'holder', v_holder),
         biz_no      = v_biz_no,
         tax_info    = v_tax
   where id = s.id;

  return public.app_seller_settle_info(s.id) || jsonb_build_object('saved', true);
end;
$$;
revoke all on function public.app_set_settle_info(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.app_set_settle_info(uuid, text, jsonb, jsonb) to service_role;

-- ------------------------------------------------------------
-- app_set_seller_rrn(p_seller_id, p_rrn, p_key, p_skip_checksum) — 주민등록번호 저장 (원천징수 자료). **평문은 어디에도 남지 않는다.**
--   p_key = 서버 env RRN_ENC_KEY (콘솔이 넘긴다). 비면 RRN_KEY_MISSING. 형식 불량 BAD_RRN. 성공 { ok, has_rrn:true, rrn_mask, rrn_set_at }.
--   같은 번호를 다시 저장해도 갱신(rrn_set_at 갱신) — 멱등.
-- ------------------------------------------------------------
create or replace function public.app_set_seller_rrn(p_seller_id uuid, p_rrn text, p_key text, p_skip_checksum boolean default false)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  d        text := regexp_replace(coalesce(p_rrn, ''), '[^0-9]', '', 'g');
  v_mask   text;
  v_now    timestamptz := now();
begin
  if p_key is null or btrim(p_key) = '' then
    return jsonb_build_object('ok', false, 'code', 'RRN_KEY_MISSING');
  end if;
  if not public.partner_rrn_valid(d, coalesce(p_skip_checksum, false)) then
    return jsonb_build_object('ok', false, 'code', 'BAD_RRN');
  end if;
  v_mask := '******-' || substr(d, 7, 1) || '******';
  update public.sellers
     set rrn_enc    = extensions.pgp_sym_encrypt(d, p_key),
         rrn_mask   = v_mask,
         rrn_set_at = v_now
   where id = p_seller_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'has_rrn', true, 'rrn_mask', v_mask, 'rrn_set_at', v_now);
end;
$$;
revoke all on function public.app_set_seller_rrn(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.app_set_seller_rrn(uuid, text, text, boolean) to service_role;

-- ------------------------------------------------------------
-- app_seller_rrn_decrypt(p_seller_id, p_key, p_actor, p_purpose) — 원문 복호 (지급명세서 제출 · 운영 스크립트 전용, 콘솔은 호출하지 않는다).
--   호출마다 sensitive_access_log 1행(field='rrn') — 성공·실패(키 불일치) 모두 남긴다. 키 불일치·손상은 RRN_DECRYPT_FAILED.
--   { ok, rrn:'000000-0000000', rrn_set_at, log_id }
-- ------------------------------------------------------------
create or replace function public.app_seller_rrn_decrypt(p_seller_id uuid, p_key text, p_actor text, p_purpose text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  s        public.sellers%rowtype;
  v_plain  text;
  v_log_id bigint;
begin
  if p_key is null or btrim(p_key) = '' then
    return jsonb_build_object('ok', false, 'code', 'RRN_KEY_MISSING');
  end if;
  if coalesce(btrim(p_actor), '') = '' or coalesce(btrim(p_purpose), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'ACTOR_REQUIRED');
  end if;
  select * into s from public.sellers where id = p_seller_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  insert into public.sensitive_access_log (seller_id, field, actor, purpose)
    values (s.id, 'rrn', btrim(p_actor), btrim(p_purpose))
    returning id into v_log_id;
  if s.rrn_enc is null then
    return jsonb_build_object('ok', false, 'code', 'NO_RRN', 'log_id', v_log_id);
  end if;
  begin
    v_plain := extensions.pgp_sym_decrypt(s.rrn_enc, p_key);
  exception when others then
    return jsonb_build_object('ok', false, 'code', 'RRN_DECRYPT_FAILED', 'log_id', v_log_id);
  end;
  return jsonb_build_object('ok', true, 'rrn', substr(v_plain, 1, 6) || '-' || substr(v_plain, 7, 7), 'rrn_set_at', s.rrn_set_at, 'log_id', v_log_id);
end;
$$;
revoke all on function public.app_seller_rrn_decrypt(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.app_seller_rrn_decrypt(uuid, text, text, text) to service_role;

-- ------------------------------------------------------------
-- app_seller_sales(p_seller_id) — /sales 실시간 매출 (vSales 의 인플루언서 관점 · calc() 의 인플루언서 가시 라인만).
--   대상: 본인 LIVE · CLEARING 캠페인 (정산 전 — SETTLED 는 app_seller_settlements 의 스냅샷으로).
--   { ok, today:'YYYY-MM-DD'(KST), settle_type, wht_rate, rates{platform_rate, ref_boost, ref_times, clear_days},
--     campaigns:[{ campaign_id, campaign_code, status, product{code,name,emoji,thumb_url,sale_price}, brand{code,name},
--                  start_date, end_date, due_on, qty, sold_qty,
--                  paid_count, refund_count, gross, canceled, refunded, net, sample_net, qty_sold, today_orders, today_gross,
--                  my_rate, grade, grade_bonus_pp, ref_boost_applied, my_fee, grade_bonus, ref_boost, my_fee_total, wht, my_payout_est,
--                  daily:[{d, gross}](최근 7일 KST 일별 PAID 합 — 막대), recent:[{code, buyer_masked, qty, amount, status, paid_at}](최근 8건) }],
--     totals{ net, my_fee_total, wht, my_payout_est, today_gross, today_orders, paid_count, refund_count } }
--   금액은 라인마다 독립 반올림한 정수(0004 계약). "today" 는 Asia/Seoul 달력일 — orders.paid_at 도 같은 시간대로 자른다.
--   buyer_masked: orders.buyer_name 은 시드부터 마스킹 값('김*은')이지만, 앱이 실명을 넣는 경로(체크아웃)가 있으므로 여기서 다시 가운데를 가린다.
-- ------------------------------------------------------------
create or replace function public.partner_mask_name(p_name text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
           when p_name is null or p_name = '' then '고객'
           when length(p_name) = 1 then p_name
           when length(p_name) = 2 then left(p_name, 1) || '*'
           else left(p_name, 1) || repeat('*', length(p_name) - 2) || right(p_name, 1)
         end
$$;
revoke all on function public.partner_mask_name(text) from public, anon, authenticated;
grant execute on function public.partner_mask_name(text) to service_role;

create or replace function public.app_seller_sales(p_seller_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  s              public.sellers%rowtype;
  v_today        date := (now() at time zone 'Asia/Seoul')::date;
  v_wht          numeric := 0.033;
  v_wht_eff      numeric;
  v_platform     numeric := 0.10;
  v_ref_boost    numeric := 0.01;
  v_ref_times    integer := 5;
  v_clear_days   integer := 21;
  v_grade        text;
  v_bonus_pp     numeric := 0;
  v_rows         jsonb := '[]'::jsonb;
  v_tot_net      numeric := 0;
  v_tot_fee      numeric := 0;
  v_tot_wht      numeric := 0;
  v_tot_pay      numeric := 0;
  v_tot_today    numeric := 0;
  v_tot_today_n  integer := 0;
  v_tot_paid     integer := 0;
  v_tot_ref      integer := 0;
  c              record;
  v_rate         numeric;
  v_sf           numeric;
  v_gb           numeric;
  v_boost        numeric;
  v_fee_total    numeric;
  v_wht_amt      numeric;
  v_payout       numeric;
  v_daily        jsonb;
  v_recent       jsonb;
begin
  select * into s from public.sellers where id = p_seller_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  select coalesce((value #>> '{}')::numeric, v_wht)      into v_wht        from public.platform_settings where key = 'wht_rate';
  select coalesce((value #>> '{}')::numeric, v_platform) into v_platform   from public.platform_settings where key = 'platform_rate';
  select coalesce((value #>> '{}')::numeric, v_ref_boost) into v_ref_boost from public.platform_settings where key = 'ref_boost';
  select coalesce((value #>> '{}')::integer, v_ref_times) into v_ref_times from public.platform_settings where key = 'ref_times';
  select coalesce((value #>> '{}')::integer, v_clear_days) into v_clear_days from public.platform_settings where key = 'clear_days';
  v_wht_eff := case when s.settle_type = 'biz' then 0 else v_wht end;

  v_grade := coalesce(s.grade, public.grade_for_sales(s.m3_sales));
  select gt.bonus_pp into v_bonus_pp from public.grade_tiers gt where gt.name = v_grade;
  v_bonus_pp := coalesce(v_bonus_pp, 0);

  for c in
    with done as (
      -- isRefBoost: 본인의 LIVE/CLEARING/SETTLED 캠페인을 생성일순으로 — 첫 ref_times 건에만 +1%p
      select x.id, row_number() over (order by x.created_at, x.id) as rn
        from public.campaigns x
       where x.seller_id = s.id and x.status in ('LIVE','CLEARING','SETTLED')
    )
    select cp.id, cp.code, cp.status, cp.start_date, cp.end_date, cp.qty, cp.sold_qty,
           coalesce(cp.rate_locked, p.commission_rate) as rate,
           p.code as product_code, p.name as product_name, p.emoji, p.thumb_url, p.sale_price,
           b.code as brand_code, b.name as brand_name,
           (s.referred_by is not null and d.rn is not null and d.rn <= v_ref_times) as ref_applied,
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
      join public.brands   b on b.id = cp.brand_id
      left join done d on d.id = cp.id
     where cp.seller_id = s.id and cp.status in ('LIVE','CLEARING')
     order by cp.start_date desc nulls last, cp.created_at desc
  loop
    v_rate      := coalesce(c.rate, 0);
    v_sf        := (c.gross - c.refunded - c.sample_net) * v_rate;
    v_gb        := (c.gross - c.refunded - c.sample_net) * v_bonus_pp / 100;
    v_boost     := case when c.ref_applied then (c.gross - c.refunded) * v_ref_boost else 0 end;
    v_fee_total := v_sf + v_gb + v_boost;
    v_wht_amt   := v_fee_total * v_wht_eff;
    v_payout    := v_fee_total - v_wht_amt;

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
      'product', jsonb_build_object('code', c.product_code, 'name', c.product_name, 'emoji', coalesce(c.emoji, '📦'), 'thumb_url', c.thumb_url, 'sale_price', c.sale_price),
      'brand', jsonb_build_object('code', c.brand_code, 'name', c.brand_name),
      'start_date', c.start_date, 'end_date', c.end_date,
      'due_on', case when c.end_date is null then null else c.end_date + v_clear_days end,
      'qty', c.qty, 'sold_qty', c.sold_qty,
      'paid_count', c.paid_count, 'refund_count', c.refund_count,
      'gross', round(c.gross), 'canceled', round(c.canceled), 'refunded', round(c.refunded),
      'net', round(c.gross - c.refunded), 'sample_net', round(c.sample_net), 'qty_sold', c.qty_sold,
      'today_orders', c.today_orders, 'today_gross', round(c.today_gross),
      'my_rate', v_rate, 'grade', v_grade, 'grade_bonus_pp', v_bonus_pp, 'ref_boost_applied', c.ref_applied,
      'my_fee', round(v_sf), 'grade_bonus', round(v_gb), 'ref_boost', round(v_boost),
      'my_fee_total', round(v_fee_total), 'wht', round(v_wht_amt), 'my_payout_est', round(v_payout),
      'daily', v_daily, 'recent', v_recent
    );

    v_tot_net     := v_tot_net + (c.gross - c.refunded);
    v_tot_fee     := v_tot_fee + v_fee_total;
    v_tot_wht     := v_tot_wht + v_wht_amt;
    v_tot_pay     := v_tot_pay + v_payout;
    v_tot_today   := v_tot_today + c.today_gross;
    v_tot_today_n := v_tot_today_n + c.today_orders;
    v_tot_paid    := v_tot_paid + c.paid_count;
    v_tot_ref     := v_tot_ref + c.refund_count;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'today', to_char(v_today, 'YYYY-MM-DD'),
    'settle_type', s.settle_type,
    'wht_rate', v_wht_eff,
    'grade', v_grade,
    'grade_bonus_pp', v_bonus_pp,
    'rates', jsonb_build_object('platform_rate', v_platform, 'ref_boost', v_ref_boost, 'ref_times', v_ref_times, 'clear_days', v_clear_days),
    'campaigns', v_rows,
    'totals', jsonb_build_object(
      'net', round(v_tot_net), 'my_fee_total', round(v_tot_fee), 'wht', round(v_tot_wht), 'my_payout_est', round(v_tot_pay),
      'today_gross', round(v_tot_today), 'today_orders', v_tot_today_n, 'paid_count', v_tot_paid, 'refund_count', v_tot_ref)
  );
end;
$$;
revoke all on function public.app_seller_sales(uuid) from public, anon, authenticated;
grant execute on function public.app_seller_sales(uuid) to service_role;

-- ------------------------------------------------------------
-- app_seller_settlements(p_seller_id) — /settle 하단 표 (vSellerSettle · settlement-policy §11.2). 읽기 전용.
--   settlements 스냅샷(정산 실행 뒤) + 아직 정산 전인 LIVE/CLEARING 캠페인(예정 행 — 금액은 app_seller_sales 와 같은 식) 을 한 표로.
--   { ok, has_bank_info, settle_type, wht_rate, rows:[{
--       kind:'settled'|'pending', campaign_id, campaign_code, status, product{code,name,emoji,thumb_url}, brand{code,name}, start_date, end_date,
--       net, sample_net, my_rate, grade, grade_bonus_pp, ref_boost_applied, my_fee, grade_bonus, ref_boost, my_fee_total, wht_rate, wht,
--       sample_refund_cel, sample_refund_cash, my_payout, hold_seller, settlement_status, due_on, settled_at,
--       payout{ status, amount, paid_at, hold_reason } | null }],
--     totals{ settled_payout, pending_payout } }
--   settled 행은 settlements 의 저장값을 그대로(재계산하지 않는다 — 0004 반올림 계약). platform_fee/platform_net 은 싣지 않는다(관리자 전용).
--   SETTLED 인데 settlements 행이 없는 캠페인(시드 c6) 은 kind:'settled' + 금액 null 로 나온다 — 화면은 "명세 준비 중".
-- ------------------------------------------------------------
create or replace function public.app_seller_settlements(p_seller_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  s            public.sellers%rowtype;
  v_wht        numeric := 0.033;
  v_wht_eff    numeric;
  v_clear_days integer := 21;
  v_ref_boost  numeric := 0.01;
  v_ref_times  integer := 5;
  v_grade      text;
  v_bonus_pp   numeric := 0;
  v_rows       jsonb := '[]'::jsonb;
  v_settled    numeric := 0;
  v_pending    numeric := 0;
  c            record;
  v_net        numeric;
  v_base       numeric;
  v_rate       numeric;
  v_sf         numeric;
  v_gb         numeric;
  v_boost      numeric;
  v_fee_total  numeric;
  v_wht_amt    numeric;
  v_payout     numeric;
begin
  select * into s from public.sellers where id = p_seller_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  select coalesce((value #>> '{}')::numeric, v_wht)        into v_wht        from public.platform_settings where key = 'wht_rate';
  select coalesce((value #>> '{}')::integer, v_clear_days) into v_clear_days from public.platform_settings where key = 'clear_days';
  select coalesce((value #>> '{}')::numeric, v_ref_boost)  into v_ref_boost  from public.platform_settings where key = 'ref_boost';
  select coalesce((value #>> '{}')::integer, v_ref_times)  into v_ref_times  from public.platform_settings where key = 'ref_times';
  v_wht_eff := case when s.settle_type = 'biz' then 0 else v_wht end;
  v_grade := coalesce(s.grade, public.grade_for_sales(s.m3_sales));
  select gt.bonus_pp into v_bonus_pp from public.grade_tiers gt where gt.name = v_grade;
  v_bonus_pp := coalesce(v_bonus_pp, 0);

  for c in
    with done as (
      select x.id, row_number() over (order by x.created_at, x.id) as rn
        from public.campaigns x
       where x.seller_id = s.id and x.status in ('LIVE','CLEARING','SETTLED')
    )
    select cp.id, cp.code, cp.status, cp.start_date, cp.end_date, cp.settled_at as c_settled_at,
           coalesce(cp.rate_locked, p.commission_rate) as rate,
           p.code as product_code, p.name as product_name, p.emoji, p.thumb_url,
           b.code as brand_code, b.name as brand_name,
           (s.referred_by is not null and d.rn is not null and d.rn <= v_ref_times) as ref_applied,
           st.id as settlement_id, st.net as st_net, st.sample_net as st_sample_net, st.seller_rate, st.seller_grade, st.seller_bonus_pp,
           st.ref_boost_applied as st_ref_applied, st.wht_rate as st_wht_rate,
           st.seller_fee, st.seller_bonus, st.ref_boost as st_ref_boost, st.seller_fee_total, st.seller_wht,
           st.sample_refund_cel, st.sample_refund_cash, st.seller_payout, st.hold_seller, st.status as st_status, st.due_on, st.settled_at,
           po.status as po_status, po.amount as po_amount, po.paid_at as po_paid_at, po.hold_reason as po_hold_reason,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status <> 'CANCELED'), 0)::numeric
             - coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'REFUNDED'), 0)::numeric as live_net,
           coalesce((select sum(o.amount) from public.orders o where o.campaign_id = cp.id and o.status = 'PAID' and o.is_sample), 0)::numeric as live_sample_net
      from public.campaigns cp
      join public.products p on p.id = cp.product_id
      join public.brands   b on b.id = cp.brand_id
      left join done d on d.id = cp.id
      left join public.settlements st on st.campaign_id = cp.id
      left join public.payouts po on po.settlement_id = st.id and po.payee_type = 'seller'
     where cp.seller_id = s.id and cp.status in ('LIVE','CLEARING','SETTLED')
     order by coalesce(cp.end_date, cp.start_date) desc nulls last, cp.created_at desc
  loop
    if c.settlement_id is not null then
      v_rows := v_rows || jsonb_build_object(
        'kind', 'settled', 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
        'product', jsonb_build_object('code', c.product_code, 'name', c.product_name, 'emoji', coalesce(c.emoji, '📦'), 'thumb_url', c.thumb_url),
        'brand', jsonb_build_object('code', c.brand_code, 'name', c.brand_name),
        'start_date', c.start_date, 'end_date', c.end_date,
        'net', c.st_net, 'sample_net', c.st_sample_net, 'my_rate', c.seller_rate, 'grade', c.seller_grade, 'grade_bonus_pp', c.seller_bonus_pp,
        'ref_boost_applied', c.st_ref_applied,
        'my_fee', c.seller_fee, 'grade_bonus', c.seller_bonus, 'ref_boost', c.st_ref_boost, 'my_fee_total', c.seller_fee_total,
        'wht_rate', c.st_wht_rate, 'wht', c.seller_wht,
        'sample_refund_cel', c.sample_refund_cel, 'sample_refund_cash', c.sample_refund_cash,
        'my_payout', c.seller_payout, 'hold_seller', c.hold_seller, 'settlement_status', c.st_status,
        'due_on', c.due_on, 'settled_at', c.settled_at,
        'payout', case when c.po_status is null then null else jsonb_build_object('status', c.po_status, 'amount', c.po_amount, 'paid_at', c.po_paid_at, 'hold_reason', c.po_hold_reason) end
      );
      v_settled := v_settled + coalesce(c.seller_payout, 0);
    elsif c.status = 'SETTLED' then
      -- 스냅샷 없는 SETTLED (시드 c6 parity — 0004 헤더) : 금액 null
      v_rows := v_rows || jsonb_build_object(
        'kind', 'settled', 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
        'product', jsonb_build_object('code', c.product_code, 'name', c.product_name, 'emoji', coalesce(c.emoji, '📦'), 'thumb_url', c.thumb_url),
        'brand', jsonb_build_object('code', c.brand_code, 'name', c.brand_name),
        'start_date', c.start_date, 'end_date', c.end_date,
        'net', null, 'sample_net', null, 'my_rate', c.rate, 'grade', null, 'grade_bonus_pp', null, 'ref_boost_applied', null,
        'my_fee', null, 'grade_bonus', null, 'ref_boost', null, 'my_fee_total', null, 'wht_rate', null, 'wht', null,
        'sample_refund_cel', null, 'sample_refund_cash', null, 'my_payout', null, 'hold_seller', null, 'settlement_status', null,
        'due_on', case when c.end_date is null then null else c.end_date + v_clear_days end, 'settled_at', c.c_settled_at, 'payout', null
      );
    else
      v_net       := c.live_net;
      v_base      := c.live_net - c.live_sample_net;
      v_rate      := coalesce(c.rate, 0);
      v_sf        := v_base * v_rate;
      v_gb        := v_base * v_bonus_pp / 100;
      v_boost     := case when c.ref_applied then v_net * v_ref_boost else 0 end;
      v_fee_total := v_sf + v_gb + v_boost;
      v_wht_amt   := v_fee_total * v_wht_eff;
      v_payout    := v_fee_total - v_wht_amt;
      v_rows := v_rows || jsonb_build_object(
        'kind', 'pending', 'campaign_id', c.id, 'campaign_code', c.code, 'status', c.status,
        'product', jsonb_build_object('code', c.product_code, 'name', c.product_name, 'emoji', coalesce(c.emoji, '📦'), 'thumb_url', c.thumb_url),
        'brand', jsonb_build_object('code', c.brand_code, 'name', c.brand_name),
        'start_date', c.start_date, 'end_date', c.end_date,
        'net', round(v_net), 'sample_net', round(c.live_sample_net), 'my_rate', v_rate, 'grade', v_grade, 'grade_bonus_pp', v_bonus_pp,
        'ref_boost_applied', c.ref_applied,
        'my_fee', round(v_sf), 'grade_bonus', round(v_gb), 'ref_boost', round(v_boost), 'my_fee_total', round(v_fee_total),
        'wht_rate', v_wht_eff, 'wht', round(v_wht_amt),
        'sample_refund_cel', null, 'sample_refund_cash', null,
        'my_payout', round(v_payout), 'hold_seller', not (s.bank_info is not null and coalesce(s.bank_info ->> 'account', '') <> ''),
        'settlement_status', null,
        'due_on', case when c.end_date is null then null else c.end_date + v_clear_days end, 'settled_at', null, 'payout', null
      );
      v_pending := v_pending + v_payout;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'has_bank_info', (s.bank_info is not null and coalesce(s.bank_info ->> 'account', '') <> ''),
    'settle_type', s.settle_type,
    'wht_rate', v_wht_eff,
    'rows', v_rows,
    'totals', jsonb_build_object('settled_payout', round(v_settled), 'pending_payout', round(v_pending))
  );
end;
$$;
revoke all on function public.app_seller_settlements(uuid) from public, anon, authenticated;
grant execute on function public.app_seller_settlements(uuid) to service_role;
