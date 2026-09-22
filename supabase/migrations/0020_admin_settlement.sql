-- ============================================================
-- 0020 — 관리자 콘솔 "정산 · 돈" PR-A: 정산 실행 · 지급 처리 · 이체 파일 · 주문/결제 정합성/문의 열람
--        sellers.m3_sales_base · payouts.hold_code · sensitive_access_log.brand_id
--        · seller_confirmed_sales · app_seller_grade_recalc · admin_payout_hold_reason · admin_bank_snapshot
--        · app_admin_settle_preview · app_admin_settle_run · app_admin_settle_run_due
--        · app_admin_payout_mark_paid / _hold / _release · app_admin_payout_export · app_admin_rrn_export
--        · app_admin_settlements · app_admin_orders · app_admin_order · app_admin_payments_health · app_admin_cs_list · app_admin_cs_thread
--
-- 근거: docs/settlement-policy.md §3(calc) · §5(추천) · §7(세금) · §8.2(정산 실행이 하는 일) · §8.3(지급 보류) · §9(샘플 구매분) · §11.4(관리자 정산 실행)
--       · docs/data-model.md §4(스냅샷 규칙 · 반올림 계약) · §5.2 · docs/points-policy.md(획득 ₩500만당 1🥬) · docs/grade-policy.md
--       · docs/inf-console-plan.md §5.9(원천징수 자료 — 주민번호 없으면 지급 보류) · docs/brand-console-plan.md §8(정산 정보 완비 4개)
--       · 0004(settlements · payouts) · 0005(celery_ledger · referral_earnings) · 0013(app_seller_settlements · rrn · sensitive_access_log · sample_cel_cover)
--       · 0018(platform_clear_days · brand_order_json · cs_*_json) · 0019(app_brand_settlements · brand_settle_info_complete · app_brand_grade_recalc).
-- 실행: 0019 이후. 재실행 가능(add column if not exists / create or replace / update … where 조건).
--       0001~0019 파일은 수정하지 않는다 — 컬럼·함수만 **추가**한다. 0021 부터는 관리자 콘솔 파트너 관리(다른 작업자) 몫이라 번호를 겹치지 않는다.
-- 범위: **관리자가 돈을 움직이는 것과 그 근거를 읽는 것만.** 화면은 PR-B(apps/admin (console)/settle · orders · payments · cs).
--       이 파일 + @sellery/db/server/admin/{settle,orders,payments,cs}.server.ts + @sellery/db/admin/settle-rules.ts + @sellery/payments/server/admin-refund.server.ts 가 계약이다.
--
-- 숫자·규칙의 정답은 packages/core/src/{constants,helpers,actions}.ts 다. 이 SQL 은 그 규칙을 옮긴 것이고, 바꿀 때는 둘을 함께 고친다.
-- 0013 app_seller_settlements · 0019 app_brand_settlements 의 "pending" 행과 **같은 숫자**가 여기 스냅샷으로 들어간다(같은 식 · 같은 반올림).
--
-- | 규칙 | 코어 원본 | 여기서 |
-- |---|---|---|
-- | gross = Σ(status≠CANCELED) · refunds = Σ REFUNDED(+ PAID 인데 refund_amount>0 인 토스 부분취소분 — 0008 헤더 "정산 calc 이관 슬라이스에서 차감") · net = gross − refunds · sample_net = Σ(is_sample & PAID) | calc() gross/refund/net/sampleNet | app_admin_settle_preview(live) → settlements.gross/refunds/net/sample_net |
-- | pg = net × pg_rate · sf = (net − sample_net) × 요율(rate_locked → commission_rate) · gBonus = (net − sample_net) × bonus_pp/100 | calc().pg/sf/gBonus · p.rate · gradeBonusOf | pg_fee · seller_fee · seller_bonus (grade_tiers.bonus_pp · sellers.grade 캐시 → 비면 grade_for_sales) |
-- | boost = net × 0.01 · refReward = net × 0.02 — 피추천 인플루언서의 LIVE/CLEARING/SETTLED 캠페인 생성일순 첫 5회 | isRefBoost · REF_BOOST · REF_RATE · REF_TIMES | ref_boost · ref_reward · ref_boost_applied (platform_settings ref_boost · ref_rate · ref_times) |
-- | bBoost = net × 0.01 · bReward = net × 0.01 — 피추천 브랜드 첫 3회 | isBrandRefBoost · BREF_DISC · BREF_RATE · BREF_TIMES | brand_ref_boost · brand_ref_reward · brand_ref_applied (brand_ref_disc · brand_ref_rate · brand_ref_times) |
-- | bDisc = net × BG_DISC[브랜드 등급] — 등급은 실행 시점 brand_grade_for_gmv(brand_gmv) (데모 bgname 실시간 · 0019 와 동일) | bDiscOf · BG_DISC | brand_discount · brand_grade · brand_discount_rate (brand_grade_tiers.fee_discount) |
-- | pfGross = net × 10% · costs = gBonus+boost+refReward+bBoost+bReward+bDisc · pf = pfGross − costs · vat = pf − pf/1.1 (pf>0) · pfNet = pf − vat | calc() | platform_fee_gross · platform_fee · vat · platform_net (costs 는 비저장 — 0004 헤더) |
-- | sfTotal = sf + gBonus + boost · brandPay = net − pg − sf − pfGross + bBoost + bDisc | calc() | seller_fee_total · brand_payout |
-- | 원천징수 = settle_type='biz' 면 0, 그 외(personal · null) wht_rate · 실수령 = sfTotal − wht + 샘플 환급 현금 | sellerWht · WHT · runSettle refundCash | wht_rate · seller_wht · seller_payout |
-- | 샘플 환급(상품 sample_refund · 구매 캠페인 · 미환급) = 🥬 원장 복원(sample_refund) + 현금은 지급액 가산(원천징수 없음) · 캠페인 sample_refunded=true | runSettle · spOf(p).refund | sample_refund_cel · sample_refund_cash · celery_ledger(sample_refund) |
-- | 🥬 결제분 브랜드 원화 보전 = sample_cel × 20,000 (플랫폼 비용 · 브랜드에는 원화로 정산) | vAdminRevenue celCover · §9 | settlements.sample_cel_cover (0013 열) |
-- | 정산 기준일 = 종료일 + 21 · 도래(≤ 오늘 KST)한 CLEARING 만 실행 (p_force 는 운영 예외) | settleDue · runSettleAll · vAdminSettle | due_on · NOT_DUE |
-- | 반올림: 라인마다 독립 원 단위 half-up · 저장값끼리 ±수 원 어긋날 수 있음 · 지급액은 저장값이 계약 | 0004 헤더 반올림 계약 | round(numeric) — 0013/0019 와 같은 함수 |
-- | 지급 보류(인플루언서) = 계좌 미등록(BANK_MISSING) · 개인인데 주민번호 미등록(RRN_MISSING — §5.9 원천징수 자료) · 사업자인데 사업자번호/세금계산서 정보 없음(TAX_INFO_MISSING) | runSettle holdS(계좌만) + §5.9 | admin_payout_hold_reason → payouts.status 'held' · hold_code · hold_reason(문구) · settlements.hold_seller |
-- | 지급 보류(브랜드) = 은행·계좌·예금주·사업자등록번호 4개 미완비(SETTLE_INFO_INCOMPLETE) | runSettle holdB · brand_settle_info_complete(0019) | settlements.hold_brand · payouts(brand) |
-- | 보류여도 정산 자체는 실행·기록(SETTLED) · 정보 등록 후 다음 배치 = app_admin_payout_release 가 완비 재검사 후 pending | §8.3 | held ↔ pending |
-- | 🥬 획득 = 확정 매출 ₩500만당 1 — 원장 earned 행의 합이 floor(기준액/500만) 이 되도록 **차분만** 적재(마이너스 회수 없음). 인플루언서 기준액 = m3_sales_base + Σ settlements.net(전 기간) · 브랜드 = brand_gmv() | celEarned · CELERY_PER · 0005 헤더 "획득분도 원장" | celery_ledger(earned · ref_type 'settlement') |
-- | 인플루언서 등급 = 최근 3개월 확정 매출(gradeOf) — m3_sales = m3_sales_base(이관 시점 값 · 감소 없음) + Σ settlements.net(settled_at ≥ 오늘 − 3개월) → sellers_sync_grade 트리거가 grade 갱신 | gradeOf · runSettle m3Sales 증분 · data-model §9.1-6(롤링 90일 채택) | app_seller_grade_recalc |
-- | 브랜드 등급 캐시 갱신 | (데모 매 렌더) | app_brand_grade_recalc(0019) — 정산 실행이 호출 |
-- | 추천 보상 기록 + 스레드 메시지 | runSettle refEarnings/brandRefEarnings · pushSys | referral_earnings(settlement_id) · campaign_events(ref_reward · brand_ref_reward) |
-- | 정산 완료 스레드 메시지 · 보류 메시지 · 환급 메시지 원문(<b> 제거) | runSettle pushSys | campaign_events(settled · payout_held · sample_refunded) |
-- | 지급 완료 = 운영자 이체 후 표시 · 양측 paid 면 정산 paid | §5.9 "payouts.status → paid 전이는 운영자" | app_admin_payout_mark_paid · admin_settlement_sync_status |
-- | 이체 파일 = 계좌 **원문** — 호출마다 sensitive_access_log(field 'bank_info') 1행/지급건 · 콘솔 화면에는 원문을 싣지 않는다(CSV 다운로드만) | §4.9 · 0013 열람 로그 | app_admin_payout_export(p_actor · p_purpose) |
-- | 원천징수 자료 = 주민번호 복호(0013 app_seller_rrn_decrypt · 호출마다 로그) | §5.9 | app_admin_rrn_export(p_settlement_ids · p_key) |
-- | 관리자 환불 = 발송 전 제한 없음 · SETTLED/샘플은 0008 app_refund_record 의 adjust(CANCELED + refund_needs_adjust) | refund 액션(SETTLED 불가 → 조정) | TS admin-refund.server.ts (SQL 추가 없음 — 0008 app_refund_precheck/record 재사용) |
--
-- 설계 요점
--   · 전부 security definer · service_role 만 execute(0007 패턴). 관리자 콘솔은 requireAdmin() 을 통과한 뒤 service role 로 호출한다 — 클라이언트가 보낸 금액은 없다(전부 서버 계산).
--   · 함수는 예외 대신 {ok, code} 를 돌려준다(0010~0019 관례). 코드: NOT_FOUND · WRONG_STATUS{status} · NOT_DUE{due_on} · NO_SNAPSHOT · HELD · ALREADY_PAID · STILL_INCOMPLETE{hold_code} · BAD_STATUS · ACTOR_REQUIRED · RRN_KEY_MISSING.
--   · 정산 실행은 한 함수 = 한 트랜잭션. campaigns for update 로 직렬화. SETTLED 면 {ok, already:true} (settlements 유니크가 이중 실행을 막는 마지막 방어선).
--   · payouts.bank_snapshot 은 **마스킹**(bank · account_masked · holder) — 원문은 sellers/brands.bank_info 만 갖고, 이체 파일이 그때의 원문을 읽는다(정보가 바뀌면 최신 계좌로 보낸다 · 0013 결정 "계좌는 평문 jsonb").
--   · 스냅샷 없는 SETTLED(시드 c6) 는 건드리지 않는다 — preview 는 NO_SNAPSHOT, run 은 already.
--   · 오늘 = Asia/Seoul 달력일(0018 과 동일).
-- ============================================================

-- ------------------------------------------------------------
-- 컬럼
-- ------------------------------------------------------------
-- 이관 시점 "최근 3개월 확정 매출" — 시드·이관 값은 정산 스냅샷이 없어 롤링 창으로 재계산할 수 없으므로 고정 기저로 남긴다(감소 없음 — 시드 parity).
alter table public.sellers add column if not exists m3_sales_base bigint not null default 0 check (m3_sales_base >= 0);
comment on column public.sellers.m3_sales_base is '이관 시점 최근 3개월 확정 매출 기저 — m3_sales = base + Σ settlements.net(최근 3개월) · 🥬 획득 기준액 = base + Σ settlements.net(전 기간) — 0020 app_seller_grade_recalc';
-- 백필: 아직 정산 스냅샷이 없는 인플루언서의 현재 m3_sales 가 곧 기저(0020 이전에는 정산 실행이 없었다). 재실행해도 이미 정산이 있는 행은 건드리지 않는다.
update public.sellers s
   set m3_sales_base = s.m3_sales
 where s.m3_sales_base = 0
   and s.m3_sales > 0
   and not exists (select 1 from public.settlements st join public.campaigns c on c.id = st.campaign_id where c.seller_id = s.id);

-- 보류 사유 코드(안정 식별자) — hold_reason(0004) 은 사람이 읽는 문구로 계속 쓴다(0013 app_seller_settlements · 0019 app_brand_settlements 가 그대로 노출).
alter table public.payouts add column if not exists hold_code text
  check (hold_code is null or hold_code in ('BANK_MISSING','RRN_MISSING','TAX_INFO_MISSING','SETTLE_INFO_INCOMPLETE','MANUAL'));
comment on column public.payouts.hold_code is '지급 보류 사유 코드 (0020 admin_payout_hold_reason) — 문구는 hold_reason';

-- 이체 파일이 브랜드 계좌 원문도 읽으므로 로그에 brand_id 를 둔다(0013 은 seller_id 만).
alter table public.sensitive_access_log add column if not exists brand_id uuid references public.brands (id) on delete set null;
create index if not exists sensitive_access_log_brand_idx on public.sensitive_access_log (brand_id, at desc);
comment on column public.sensitive_access_log.brand_id is '브랜드 계좌 원문 열람(field bank_info · 이체 파일) — 0020';

-- ------------------------------------------------------------
-- seller_confirmed_sales(p_seller_id, p_since) — 정산 스냅샷 기준 확정 매출 Σ settlements.net (p_since null = 전 기간)
-- ------------------------------------------------------------
create or replace function public.seller_confirmed_sales(p_seller_id uuid, p_since timestamptz default null)
returns bigint
language sql stable
set search_path = public
as $$
  select coalesce(sum(st.net), 0)::bigint
    from public.settlements st
    join public.campaigns c on c.id = st.campaign_id
   where c.seller_id = p_seller_id
     and (p_since is null or st.settled_at >= p_since)
$$;
revoke all on function public.seller_confirmed_sales(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.seller_confirmed_sales(uuid, timestamptz) to service_role;

-- ------------------------------------------------------------
-- app_seller_grade_recalc(p_seller_id) — sellers.m3_sales 재계산(기저 + 최근 3개월 스냅샷 net) → 트리거 sellers_sync_grade 가 grade 갱신.
--   **정산 실행 · 운영 스크립트 전용**(0019 app_brand_grade_recalc 와 같은 자리). { ok, previous_grade, grade, previous_m3_sales, m3_sales, changed }
-- ------------------------------------------------------------
create or replace function public.app_seller_grade_recalc(p_seller_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  s      public.sellers%rowtype;
  v_m3   bigint;
  v_grade text;
begin
  select * into s from public.sellers where id = p_seller_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  v_m3 := s.m3_sales_base + public.seller_confirmed_sales(s.id, now() - interval '3 months');
  update public.sellers set m3_sales = v_m3 where id = s.id and m3_sales is distinct from v_m3;
  select grade into v_grade from public.sellers where id = s.id;
  return jsonb_build_object('ok', true, 'previous_grade', s.grade, 'grade', v_grade,
                            'previous_m3_sales', s.m3_sales, 'm3_sales', v_m3,
                            'changed', (s.grade is distinct from v_grade));
end;
$$;
revoke all on function public.app_seller_grade_recalc(uuid) from public, anon, authenticated;
grant execute on function public.app_seller_grade_recalc(uuid) to service_role;

-- ------------------------------------------------------------
-- admin_payout_hold_reason(p_payee_type, p_seller_id, p_brand_id) — 지급 보류 사유 코드 (없으면 null)
--   seller: 계좌 없음 → BANK_MISSING · 개인(biz 아님)인데 주민번호 없음 → RRN_MISSING · 사업자인데 사업자번호/세금계산서 정보 없음 → TAX_INFO_MISSING
--   brand : brand_settle_info_complete 아니면 SETTLE_INFO_INCOMPLETE
-- admin_hold_label(code) — 문구
-- ------------------------------------------------------------
create or replace function public.admin_hold_label(p_code text)
returns text
language sql immutable
set search_path = public
as $$
  select case p_code
           when 'BANK_MISSING'           then '정산 계좌 미등록'
           when 'RRN_MISSING'            then '주민등록번호 미등록 — 원천징수 자료'
           when 'TAX_INFO_MISSING'       then '사업자 세금계산서 정보 미등록'
           when 'SETTLE_INFO_INCOMPLETE' then '정산 정보 미완비 — 은행·계좌·예금주·사업자등록번호'
           when 'MANUAL'                 then '운영자 보류'
           else p_code end
$$;
revoke all on function public.admin_hold_label(text) from public, anon, authenticated;
grant execute on function public.admin_hold_label(text) to service_role;

create or replace function public.admin_payout_hold_reason(p_payee_type text, p_seller_id uuid, p_brand_id uuid)
returns text
language plpgsql stable
security definer set search_path = public
as $$
declare
  s public.sellers%rowtype;
  b public.brands%rowtype;
begin
  if p_payee_type = 'seller' then
    select * into s from public.sellers where id = p_seller_id;
    if not found then return 'BANK_MISSING'; end if;
    if s.bank_info is null or coalesce(s.bank_info ->> 'account', '') = '' then return 'BANK_MISSING'; end if;
    if s.settle_type = 'biz' then
      if coalesce(s.biz_no, '') = '' or s.tax_info is null or coalesce(s.tax_info ->> 'company', '') = '' then return 'TAX_INFO_MISSING'; end if;
    elsif s.rrn_set_at is null then
      return 'RRN_MISSING';
    end if;
    return null;
  elsif p_payee_type = 'brand' then
    select * into b from public.brands where id = p_brand_id;
    if not found then return 'SETTLE_INFO_INCOMPLETE'; end if;
    if not public.brand_settle_info_complete(b) then return 'SETTLE_INFO_INCOMPLETE'; end if;
    return null;
  end if;
  return null;
end;
$$;
revoke all on function public.admin_payout_hold_reason(text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_payout_hold_reason(text, uuid, uuid) to service_role;

-- 마스킹 계좌 스냅샷 { bank, account_masked, holder } (원문 없음)
create or replace function public.admin_bank_snapshot(p_bank_info jsonb)
returns jsonb
language sql immutable
set search_path = public
as $$
  select case when p_bank_info is null then null
              else jsonb_build_object('bank', p_bank_info ->> 'bank',
                                      'account_masked', public.partner_mask_account(p_bank_info ->> 'account'),
                                      'holder', p_bank_info ->> 'holder') end
$$;
revoke all on function public.admin_bank_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.admin_bank_snapshot(jsonb) to service_role;

-- ------------------------------------------------------------
-- admin_payout_json(payouts) — 지급 1행 (콘솔 · 목록 · 미리보기 공용 · 원문 없음)
-- ------------------------------------------------------------
create or replace function public.admin_payout_json(po public.payouts)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object('id', po.id, 'payee_type', po.payee_type, 'status', po.status, 'amount', po.amount, 'wht', po.wht,
                            'hold_code', po.hold_code, 'hold_reason', po.hold_reason, 'bank_snapshot', po.bank_snapshot,
                            'paid_at', po.paid_at, 'memo', po.memo, 'created_at', po.created_at)
$$;
revoke all on function public.admin_payout_json(public.payouts) from public, anon, authenticated;
grant execute on function public.admin_payout_json(public.payouts) to service_role;

-- ------------------------------------------------------------
-- admin_settlement_json(settlements) — 스냅샷 1행 전체(관리자 전용 platform_fee/platform_net/sample_cel_cover 포함) + 당사자 · 지급 2행
--   app_admin_settle_preview(SETTLED) 와 app_admin_settlements 가 같은 모양을 쓴다. 키는 settlements 컬럼명 그대로.
-- ------------------------------------------------------------
create or replace function public.admin_settlement_json(st public.settlements)
returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'source', 'snapshot',
    'settlement_id', st.id,
    'campaign_id', st.campaign_id,
    'campaign_code', c.code, 'campaign_status', c.status, 'title', st.title,
    'start_date', c.start_date, 'end_date', c.end_date, 'due_on', st.due_on,
    'seller', jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle, 'grade', s.grade, 'settle_type', s.settle_type),
    'brand', jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'grade', b.grade),
    'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'emoji', coalesce(p.emoji, '📦'), 'thumb_url', p.thumb_url),
    'paid_count', st.paid_count, 'refund_count', st.refund_count,
    'gross', st.gross, 'refunds', st.refunds, 'net', st.net, 'sample_net', st.sample_net,
    'pg_rate', st.pg_rate, 'platform_rate', st.platform_rate, 'seller_rate', st.seller_rate,
    'seller_grade', st.seller_grade, 'seller_bonus_pp', st.seller_bonus_pp, 'brand_grade', st.brand_grade, 'brand_discount_rate', st.brand_discount_rate,
    'wht_rate', st.wht_rate,
    'ref_boost_applied', st.ref_boost_applied, 'brand_ref_applied', st.brand_ref_applied,
    'ref_boost_rate', st.ref_boost_rate, 'ref_reward_rate', st.ref_reward_rate, 'brand_ref_disc_rate', st.brand_ref_disc_rate, 'brand_ref_reward_rate', st.brand_ref_reward_rate,
    'pg_fee', st.pg_fee, 'seller_fee', st.seller_fee, 'seller_bonus', st.seller_bonus, 'ref_boost', st.ref_boost, 'ref_reward', st.ref_reward,
    'brand_ref_boost', st.brand_ref_boost, 'brand_ref_reward', st.brand_ref_reward, 'brand_discount', st.brand_discount
  ) || jsonb_build_object(
    'platform_fee_gross', st.platform_fee_gross,
    'costs', st.seller_bonus + st.ref_boost + st.ref_reward + st.brand_ref_boost + st.brand_ref_reward + st.brand_discount,
    'platform_fee', st.platform_fee, 'vat', st.vat, 'platform_net', st.platform_net,
    'seller_fee_total', st.seller_fee_total, 'seller_wht', st.seller_wht,
    'sample_refund_cel', st.sample_refund_cel, 'sample_refund_cash', st.sample_refund_cash, 'sample_cel_cover', st.sample_cel_cover,
    'brand_payout', st.brand_payout, 'seller_payout', st.seller_payout,
    'hold_seller', st.hold_seller, 'hold_brand', st.hold_brand,
    'holds', jsonb_build_object(
      'seller', (select case when po.hold_code is null and po.status <> 'held' then null
                             else jsonb_build_object('code', coalesce(po.hold_code, 'MANUAL'), 'label', coalesce(po.hold_reason, public.admin_hold_label(coalesce(po.hold_code, 'MANUAL')))) end
                   from public.payouts po where po.settlement_id = st.id and po.payee_type = 'seller'),
      'brand',  (select case when po.hold_code is null and po.status <> 'held' then null
                             else jsonb_build_object('code', coalesce(po.hold_code, 'MANUAL'), 'label', coalesce(po.hold_reason, public.admin_hold_label(coalesce(po.hold_code, 'MANUAL')))) end
                   from public.payouts po where po.settlement_id = st.id and po.payee_type = 'brand')),
    'settlement', jsonb_build_object('id', st.id, 'status', st.status, 'settled_at', st.settled_at, 'paid_at', st.paid_at, 'memo', st.memo),
    'payouts', jsonb_build_object(
      'seller', (select public.admin_payout_json(po) from public.payouts po where po.settlement_id = st.id and po.payee_type = 'seller'),
      'brand',  (select public.admin_payout_json(po) from public.payouts po where po.settlement_id = st.id and po.payee_type = 'brand')),
    'eligible', false, 'reason', 'SETTLED'
  )
    from public.campaigns c
    join public.sellers  s on s.id = c.seller_id
    join public.brands   b on b.id = c.brand_id
    join public.products p on p.id = c.product_id
   where c.id = st.campaign_id
$$;
revoke all on function public.admin_settlement_json(public.settlements) from public, anon, authenticated;
grant execute on function public.admin_settlement_json(public.settlements) to service_role;

-- ------------------------------------------------------------
-- app_admin_settle_preview(p_campaign_id) — 정산 미리보기 (읽기 전용). calc() 전체 + 보류 판정 + 실행 가능 여부.
--   LIVE · CLEARING → 실시간 계산(source 'live') · SETTLED → 스냅샷(source 'snapshot' · 없으면 { ok:true, source:'none', reason:'NO_SNAPSHOT' })
--   그 외 상태 → { ok:false, code:'WRONG_STATUS', status }. 없는 id → NOT_FOUND.
--   eligible = CLEARING 이고 due_on ≤ 오늘(KST). reason: null | 'NOT_DUE' | 'WRONG_STATUS'(LIVE) | 'SETTLED' | 'NO_SNAPSHOT'
--   금액 키는 settlements 컬럼명 그대로(라인마다 round). holds{seller|brand: {code,label}|null}. sample_refund_* 는 실행 시 환급될 값(조건 미충족이면 0).
-- ------------------------------------------------------------
create or replace function public.app_admin_settle_preview(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  c            public.campaigns%rowtype;
  s            public.sellers%rowtype;
  b            public.brands%rowtype;
  p            public.products%rowtype;
  st           public.settlements%rowtype;
  v_today      date := (now() at time zone 'Asia/Seoul')::date;
  v_pg         numeric := 0.019;
  v_platform   numeric := 0.10;
  v_wht        numeric := 0.033;
  v_ref_boost  numeric := 0.01;
  v_ref_rate   numeric := 0.02;
  v_ref_times  integer := 5;
  v_bref_disc  numeric := 0.01;
  v_bref_rate  numeric := 0.01;
  v_bref_times integer := 3;
  v_cel_won    integer := 20000;
  v_clear_days integer;
  v_rate       numeric;
  v_sgrade     text;
  v_bonus_pp   numeric := 0;
  v_bgrade     text;
  v_bdisc_rate numeric := 0;
  v_wht_eff    numeric;
  v_ref_applied  boolean;
  v_bref_applied boolean;
  v_paid_count   integer;
  v_refund_count integer;
  v_gross      numeric;
  v_refunds    numeric;
  v_partial    numeric;
  v_net        numeric;
  v_sample_net numeric;
  v_base       numeric;
  v_pgf numeric; v_sf numeric; v_gb numeric; v_boost numeric; v_reward numeric; v_bboost numeric; v_breward numeric; v_bdisc numeric;
  v_pfg numeric; v_costs numeric; v_pf numeric; v_vat numeric; v_pfnet numeric; v_sf_total numeric; v_wht_amt numeric; v_brand_pay numeric; v_seller_pay numeric;
  v_ref_cel    integer := 0;
  v_ref_cash   integer := 0;
  v_hold_s     text;
  v_hold_b     text;
  v_due        date;
  v_eligible   boolean;
  v_reason     text;
begin
  select * into c from public.campaigns where id = p_campaign_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;

  if c.status = 'SETTLED' then
    select * into st from public.settlements where campaign_id = c.id;
    if not found then
      return jsonb_build_object('ok', true, 'source', 'none', 'campaign_id', c.id, 'campaign_code', c.code, 'campaign_status', c.status,
                                'settled_at', c.settled_at, 'eligible', false, 'reason', 'NO_SNAPSHOT');
    end if;
    return jsonb_build_object('ok', true) || public.admin_settlement_json(st);
  end if;
  if c.status not in ('LIVE', 'CLEARING') then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;

  select * into s from public.sellers  where id = c.seller_id;
  select * into b from public.brands   where id = c.brand_id;
  select * into p from public.products where id = c.product_id;

  v_pg := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'pg_rate'), v_pg);
  v_platform := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'platform_rate'), v_platform);
  v_wht := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'wht_rate'), v_wht);
  v_ref_boost := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'ref_boost'), v_ref_boost);
  v_ref_rate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'ref_rate'), v_ref_rate);
  v_ref_times := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'ref_times'), v_ref_times);
  v_bref_disc := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'brand_ref_disc'), v_bref_disc);
  v_bref_rate := coalesce((select (value #>> '{}')::numeric from public.platform_settings where key = 'brand_ref_rate'), v_bref_rate);
  v_bref_times := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'brand_ref_times'), v_bref_times);
  v_cel_won := coalesce((select (value #>> '{}')::integer from public.platform_settings where key = 'sample_cel_won'), v_cel_won);
  v_clear_days := public.platform_clear_days();

  v_rate   := coalesce(c.rate_locked, p.commission_rate, 0);
  v_sgrade := coalesce(s.grade, public.grade_for_sales(s.m3_sales));
  select coalesce(gt.bonus_pp, 0) into v_bonus_pp from public.grade_tiers gt where gt.name = v_sgrade;
  v_bonus_pp := coalesce(v_bonus_pp, 0);
  v_bgrade := public.brand_grade_for_gmv(public.brand_gmv(b.id));
  select coalesce(gt.fee_discount, 0) into v_bdisc_rate from public.brand_grade_tiers gt where gt.name = v_bgrade;
  v_bdisc_rate := coalesce(v_bdisc_rate, 0);
  v_wht_eff := case when s.settle_type = 'biz' then 0 else v_wht end;

  -- isRefBoost / isBrandRefBoost — 생성일순 첫 N 회 (0013 · 0019 와 같은 창)
  select (s.referred_by is not null and d.rn <= v_ref_times) into v_ref_applied
    from (select x.id, row_number() over (order by x.created_at, x.id) as rn
            from public.campaigns x where x.seller_id = s.id and x.status in ('LIVE','CLEARING','SETTLED')) d
   where d.id = c.id;
  v_ref_applied := coalesce(v_ref_applied, false);
  select (b.referred_by is not null and d.rn <= v_bref_times) into v_bref_applied
    from (select x.id, row_number() over (order by x.created_at, x.id) as rn
            from public.campaigns x where x.brand_id = b.id and x.status in ('LIVE','CLEARING','SETTLED')) d
   where d.id = c.id;
  v_bref_applied := coalesce(v_bref_applied, false);

  -- 주문 집계 (calc: gross = ≠CANCELED · refund = REFUNDED · + 토스 부분취소분(PAID & refund_amount>0))
  select count(*) filter (where o.status = 'PAID'),
         count(*) filter (where o.status = 'REFUNDED'),
         coalesce(sum(o.amount) filter (where o.status <> 'CANCELED'), 0),
         coalesce(sum(o.amount) filter (where o.status = 'REFUNDED'), 0),
         coalesce(sum(o.refund_amount) filter (where o.status = 'PAID' and coalesce(o.refund_amount, 0) > 0), 0),
         coalesce(sum(o.amount) filter (where o.status = 'PAID' and o.is_sample), 0)
    into v_paid_count, v_refund_count, v_gross, v_refunds, v_partial, v_sample_net
    from public.orders o where o.campaign_id = c.id;
  v_refunds := v_refunds + v_partial;
  v_net  := v_gross - v_refunds;
  v_base := v_net - v_sample_net;

  v_pgf     := v_net * v_pg;
  v_sf      := v_base * v_rate;
  v_gb      := v_base * v_bonus_pp / 100;
  v_boost   := case when v_ref_applied  then v_net * v_ref_boost else 0 end;
  v_reward  := case when v_ref_applied  then v_net * v_ref_rate  else 0 end;
  v_bboost  := case when v_bref_applied then v_net * v_bref_disc else 0 end;
  v_breward := case when v_bref_applied then v_net * v_bref_rate else 0 end;
  v_bdisc   := v_net * v_bdisc_rate;
  v_pfg     := v_net * v_platform;
  v_costs   := v_gb + v_boost + v_reward + v_bboost + v_breward + v_bdisc;
  v_pf      := v_pfg - v_costs;
  v_vat     := case when v_pf > 0 then v_pf - v_pf / 1.1 else 0 end;
  v_pfnet   := v_pf - v_vat;
  v_sf_total := v_sf + v_gb + v_boost;
  v_wht_amt  := v_sf_total * v_wht_eff;
  v_brand_pay := v_net - v_pgf - v_sf - v_pfg + v_bboost + v_bdisc;

  -- 샘플 구매 환급(§9 refund 옵션) — 실행 시 1회
  if coalesce(p.sample_refund, false) and c.purchased and not c.sample_refunded then
    v_ref_cel  := coalesce(c.sample_cel, 0);
    v_ref_cash := coalesce(c.sample_cash, 0);
  end if;
  v_seller_pay := v_sf_total - v_wht_amt + v_ref_cash;

  v_hold_s := public.admin_payout_hold_reason('seller', s.id, null);
  v_hold_b := public.admin_payout_hold_reason('brand', null, b.id);
  v_due := case when c.end_date is null then null else c.end_date + v_clear_days end;
  v_eligible := (c.status = 'CLEARING' and v_due is not null and v_due <= v_today);
  v_reason := case when c.status <> 'CLEARING' then 'WRONG_STATUS' when not v_eligible then 'NOT_DUE' else null end;

  return jsonb_build_object(
    'ok', true, 'source', 'live',
    'settlement_id', null,
    'campaign_id', c.id, 'campaign_code', c.code, 'campaign_status', c.status,
    'title', p.name || ' · ' || s.handle,
    'start_date', c.start_date, 'end_date', c.end_date, 'due_on', v_due, 'today', v_today,
    'seller', jsonb_build_object('id', s.id, 'code', s.code, 'name', s.name, 'handle', s.handle, 'grade', v_sgrade, 'settle_type', s.settle_type,
                                 'referred_by', s.referred_by, 'has_bank_info', (s.bank_info is not null and coalesce(s.bank_info ->> 'account', '') <> ''),
                                 'has_rrn', (s.rrn_set_at is not null)),
    'brand', jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name, 'grade', v_bgrade, 'referred_by', b.referred_by,
                                'settle_info_complete', public.brand_settle_info_complete(b)),
    'product', jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'emoji', coalesce(p.emoji, '📦'), 'thumb_url', p.thumb_url, 'sample_refund', coalesce(p.sample_refund, false)),
    'paid_count', v_paid_count, 'refund_count', v_refund_count,
    'gross', round(v_gross), 'refunds', round(v_refunds), 'partial_refunds', round(v_partial), 'net', round(v_net), 'sample_net', round(v_sample_net),
    'pg_rate', v_pg, 'platform_rate', v_platform, 'seller_rate', v_rate,
    'seller_grade', v_sgrade, 'seller_bonus_pp', v_bonus_pp, 'brand_grade', v_bgrade, 'brand_discount_rate', v_bdisc_rate,
    'wht_rate', v_wht_eff,
    'ref_boost_applied', v_ref_applied, 'brand_ref_applied', v_bref_applied,
    'ref_boost_rate', case when v_ref_applied then v_ref_boost else 0 end,
    'ref_reward_rate', case when v_ref_applied then v_ref_rate else 0 end,
    'brand_ref_disc_rate', case when v_bref_applied then v_bref_disc else 0 end,
    'brand_ref_reward_rate', case when v_bref_applied then v_bref_rate else 0 end
  ) || jsonb_build_object(
    'pg_fee', round(v_pgf), 'seller_fee', round(v_sf), 'seller_bonus', round(v_gb), 'ref_boost', round(v_boost), 'ref_reward', round(v_reward),
    'brand_ref_boost', round(v_bboost), 'brand_ref_reward', round(v_breward), 'brand_discount', round(v_bdisc),
    'platform_fee_gross', round(v_pfg), 'costs', round(v_costs), 'platform_fee', round(v_pf), 'vat', round(v_vat), 'platform_net', round(v_pfnet),
    'seller_fee_total', round(v_sf_total), 'seller_wht', round(v_wht_amt),
    'sample_refund_cel', v_ref_cel, 'sample_refund_cash', v_ref_cash, 'sample_cel_cover', coalesce(c.sample_cel, 0)::bigint * v_cel_won,
    'brand_payout', round(v_brand_pay), 'seller_payout', round(v_seller_pay),
    'hold_seller', (v_hold_s is not null), 'hold_brand', (v_hold_b is not null),
    'holds', jsonb_build_object(
      'seller', case when v_hold_s is null then null else jsonb_build_object('code', v_hold_s, 'label', public.admin_hold_label(v_hold_s)) end,
      'brand',  case when v_hold_b is null then null else jsonb_build_object('code', v_hold_b, 'label', public.admin_hold_label(v_hold_b)) end),
    'settlement', null, 'payouts', jsonb_build_object('seller', null, 'brand', null),
    'eligible', v_eligible, 'reason', v_reason
  );
end;
$$;
revoke all on function public.app_admin_settle_preview(uuid) from public, anon, authenticated;
grant execute on function public.app_admin_settle_preview(uuid) to service_role;

-- ------------------------------------------------------------
-- admin_settlement_sync_status(p_settlement_id) — 지급 2행에서 정산 상태 파생: 둘 다 paid → paid(+paid_at) · 하나라도 held → held · 그 외 pending
-- ------------------------------------------------------------
create or replace function public.admin_settlement_sync_status(p_settlement_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_n_paid integer; v_n_held integer; v_n integer; v_status text;
begin
  select count(*), count(*) filter (where status = 'paid'), count(*) filter (where status = 'held')
    into v_n, v_n_paid, v_n_held
    from public.payouts where settlement_id = p_settlement_id;
  v_status := case when v_n > 0 and v_n_paid = v_n then 'paid' when v_n_held > 0 then 'held' else 'pending' end;
  update public.settlements
     set status = v_status,
         paid_at = case when v_status = 'paid' then coalesce(paid_at, now()) else null end,
         hold_seller = exists (select 1 from public.payouts po where po.settlement_id = p_settlement_id and po.payee_type = 'seller' and po.status = 'held'),
         hold_brand  = exists (select 1 from public.payouts po where po.settlement_id = p_settlement_id and po.payee_type = 'brand'  and po.status = 'held')
   where id = p_settlement_id;
  return v_status;
end;
$$;
revoke all on function public.admin_settlement_sync_status(uuid) from public, anon, authenticated;
grant execute on function public.admin_settlement_sync_status(uuid) to service_role;

-- ------------------------------------------------------------
-- app_admin_settle_run(p_campaign_id, p_actor_user_id, p_force) — 정산 실행 (runSettle · 한 트랜잭션)
--   CLEARING 이고 due_on ≤ 오늘(KST) 이어야 한다(p_force=true 면 기준일 무시 — 운영 예외 · 결과 forced:true).
--   1 settlements 스냅샷(app_admin_settle_preview 의 live 값 그대로 · 라인 독립 반올림)
--   2 payouts 2행 — seller: amount = seller_payout(원천징수 후 + 샘플 환급 현금) · wht · brand: amount = brand_payout · 보류면 held + hold_code/hold_reason · bank_snapshot 마스킹
--   3 campaigns → SETTLED · settled_at(= settlements.settled_at) · sample_refunded
--   4 celery_ledger: 샘플 🥬 환급(sample_refund) · 획득 earned 차분(인플루언서 · 브랜드)
--   5 referral_earnings + 이벤트 ref_reward / brand_ref_reward
--   6 sellers.m3_sales(app_seller_grade_recalc) · brands.grade(app_brand_grade_recalc)
--   7 campaign_events: settled · payout_held · sample_refunded
--   반환: { ok:true, already:false, forced, settlement_id, campaign_code, net, seller_payout, brand_payout, holds, payouts{seller,brand},
--           celery{ sample_refund_cel, seller_earned, brand_earned }, referral{ seller_reward, brand_reward }, grades{ seller{previous,grade,m3_sales}, brand{previous,grade,gmv} } }
--       | { ok:true, already:true, settlement_id|null, campaign_code }
--       | { ok:false, code:'NOT_FOUND' | 'WRONG_STATUS'{status} | 'NOT_DUE'{due_on, today} }
-- ------------------------------------------------------------
create or replace function public.app_admin_settle_run(p_campaign_id uuid, p_actor_user_id uuid default null, p_force boolean default false)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  c          public.campaigns%rowtype;
  k          jsonb;
  v_now      timestamptz := now();
  v_today    date := (now() at time zone 'Asia/Seoul')::date;
  v_due      date;
  v_sid      uuid;
  v_seller_id uuid;
  v_brand_id  uuid;
  v_hold_s   text;
  v_hold_b   text;
  v_po_s     public.payouts%rowtype;
  v_po_b     public.payouts%rowtype;
  v_ref_cel  integer;
  v_ref_cash integer;
  v_per_won  bigint := 5000000;
  v_basis    bigint;
  v_have     integer;
  v_earn_s   integer := 0;
  v_earn_b   integer := 0;
  v_reward   bigint;
  v_breward  bigint;
  v_ref_name text;
  v_grade_s  jsonb;
  v_grade_b  jsonb;
  v_sf_total bigint;
  v_wht      bigint;
  v_wht_rate numeric;
  v_settled_body text;
begin
  select * into c from public.campaigns where id = p_campaign_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if c.status = 'SETTLED' then
    select id into v_sid from public.settlements where campaign_id = c.id;
    return jsonb_build_object('ok', true, 'already', true, 'settlement_id', v_sid, 'campaign_code', c.code);
  end if;
  if c.status <> 'CLEARING' then
    return jsonb_build_object('ok', false, 'code', 'WRONG_STATUS', 'status', c.status);
  end if;
  v_due := case when c.end_date is null then null else c.end_date + public.platform_clear_days() end;
  if not coalesce(p_force, false) and (v_due is null or v_due > v_today) then
    return jsonb_build_object('ok', false, 'code', 'NOT_DUE', 'due_on', v_due, 'today', v_today);
  end if;

  k := public.app_admin_settle_preview(c.id);
  if (k ->> 'ok')::boolean is distinct from true or (k ->> 'source') <> 'live' then
    return jsonb_build_object('ok', false, 'code', coalesce(k ->> 'code', 'BAD_STATE'));
  end if;
  v_seller_id := c.seller_id;
  v_brand_id  := c.brand_id;
  v_hold_s := k #>> '{holds,seller,code}';
  v_hold_b := k #>> '{holds,brand,code}';
  v_ref_cel  := (k ->> 'sample_refund_cel')::integer;
  v_ref_cash := (k ->> 'sample_refund_cash')::integer;
  v_sf_total := (k ->> 'seller_fee_total')::bigint;
  v_wht      := (k ->> 'seller_wht')::bigint;
  v_wht_rate := (k ->> 'wht_rate')::numeric;
  v_per_won := coalesce((select (value #>> '{}')::bigint from public.platform_settings where key = 'celery_per_won'), v_per_won);
  v_per_won := coalesce(v_per_won, 5000000);

  -- 1 스냅샷
  insert into public.settlements (
    campaign_id, title, paid_count, refund_count, gross, refunds, net, sample_net,
    pg_rate, platform_rate, seller_rate, seller_grade, seller_bonus_pp, brand_grade, brand_discount_rate, wht_rate,
    ref_boost_applied, brand_ref_applied, ref_boost_rate, ref_reward_rate, brand_ref_disc_rate, brand_ref_reward_rate,
    pg_fee, seller_fee, seller_bonus, ref_boost, ref_reward, brand_ref_boost, brand_ref_reward, brand_discount,
    platform_fee_gross, platform_fee, vat, platform_net, seller_fee_total, seller_wht,
    sample_refund_cel, sample_refund_cash, sample_cel_cover, brand_payout, seller_payout,
    hold_seller, hold_brand, status, due_on, settled_at, memo)
  values (
    c.id, k ->> 'title', (k ->> 'paid_count')::integer, (k ->> 'refund_count')::integer,
    (k ->> 'gross')::bigint, (k ->> 'refunds')::bigint, (k ->> 'net')::bigint, (k ->> 'sample_net')::bigint,
    (k ->> 'pg_rate')::numeric, (k ->> 'platform_rate')::numeric, (k ->> 'seller_rate')::numeric,
    k ->> 'seller_grade', (k ->> 'seller_bonus_pp')::numeric, k ->> 'brand_grade', (k ->> 'brand_discount_rate')::numeric, v_wht_rate,
    (k ->> 'ref_boost_applied')::boolean, (k ->> 'brand_ref_applied')::boolean,
    (k ->> 'ref_boost_rate')::numeric, (k ->> 'ref_reward_rate')::numeric, (k ->> 'brand_ref_disc_rate')::numeric, (k ->> 'brand_ref_reward_rate')::numeric,
    (k ->> 'pg_fee')::bigint, (k ->> 'seller_fee')::bigint, (k ->> 'seller_bonus')::bigint, (k ->> 'ref_boost')::bigint, (k ->> 'ref_reward')::bigint,
    (k ->> 'brand_ref_boost')::bigint, (k ->> 'brand_ref_reward')::bigint, (k ->> 'brand_discount')::bigint,
    (k ->> 'platform_fee_gross')::bigint, (k ->> 'platform_fee')::bigint, (k ->> 'vat')::bigint, (k ->> 'platform_net')::bigint,
    v_sf_total, v_wht,
    v_ref_cel, v_ref_cash, (k ->> 'sample_cel_cover')::bigint, (k ->> 'brand_payout')::bigint, (k ->> 'seller_payout')::bigint,
    (v_hold_s is not null), (v_hold_b is not null),
    case when v_hold_s is not null or v_hold_b is not null then 'held' else 'pending' end,
    v_due, v_now,
    case when coalesce(p_force, false) then '기준일 전 강제 실행' else null end)
  returning id into v_sid;

  -- 2 지급 2행
  insert into public.payouts (settlement_id, payee_type, seller_id, amount, wht, status, hold_code, hold_reason, bank_snapshot)
  select v_sid, 'seller', s.id, greatest((k ->> 'seller_payout')::bigint, 0), v_wht,
         case when v_hold_s is null then 'pending' else 'held' end, v_hold_s,
         case when v_hold_s is null then null else public.admin_hold_label(v_hold_s) end,
         public.admin_bank_snapshot(s.bank_info)
    from public.sellers s where s.id = v_seller_id
  returning * into v_po_s;
  insert into public.payouts (settlement_id, payee_type, brand_id, amount, wht, status, hold_code, hold_reason, bank_snapshot)
  select v_sid, 'brand', b.id, greatest((k ->> 'brand_payout')::bigint, 0), 0,
         case when v_hold_b is null then 'pending' else 'held' end, v_hold_b,
         case when v_hold_b is null then null else public.admin_hold_label(v_hold_b) end,
         public.admin_bank_snapshot(b.bank_info)
    from public.brands b where b.id = v_brand_id
  returning * into v_po_b;

  -- 3 캠페인
  update public.campaigns
     set status = 'SETTLED', settled_at = v_now,
         sample_refunded = sample_refunded or (v_ref_cel > 0 or v_ref_cash > 0)
   where id = c.id;

  -- 4 🥬 — 샘플 환급 · 획득 차분
  if v_ref_cel > 0 then
    perform public.celery_spend('seller', v_seller_id, v_ref_cel, 'sample_refund', '샘플 구매 환급 · ' || (k #>> '{product,name}'), 'settlement', v_sid);
  end if;
  if v_ref_cel > 0 or v_ref_cash > 0 then
    insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
    values (c.id, 'system', 'system', 'admin', p_actor_user_id,
            '🎁 샘플 구매액 환급 — ' || concat_ws(' + ', case when v_ref_cel > 0 then '🥬 ' || v_ref_cel end,
                                                        case when v_ref_cash > 0 then '₩' || to_char(v_ref_cash, 'FM999,999,999,999') end)
              || ' (판매 확정 조건 충족)',
            'sample_refunded', jsonb_build_object('cel', v_ref_cel, 'cash', v_ref_cash, 'settlement_id', v_sid));
  end if;

  select s.m3_sales_base + public.seller_confirmed_sales(s.id, null) into v_basis from public.sellers s where s.id = v_seller_id;
  select coalesce(sum(delta), 0)::integer into v_have from public.celery_ledger where owner_type = 'seller' and seller_id = v_seller_id and reason = 'earned';
  v_earn_s := greatest(floor(v_basis / v_per_won::numeric)::integer - v_have, 0);
  if v_earn_s > 0 then
    perform public.celery_spend('seller', v_seller_id, v_earn_s, 'earned',
                                '매출 달성 획득 · ' || c.code || ' 정산 (확정 매출 ₩' || to_char(v_per_won, 'FM999,999,999,999') || '당 1🥬)', 'settlement', v_sid);
  end if;
  v_basis := public.brand_gmv(v_brand_id);
  select coalesce(sum(delta), 0)::integer into v_have from public.celery_ledger where owner_type = 'brand' and brand_id = v_brand_id and reason = 'earned';
  v_earn_b := greatest(floor(v_basis / v_per_won::numeric)::integer - v_have, 0);
  if v_earn_b > 0 then
    perform public.celery_spend('brand', v_brand_id, v_earn_b, 'earned',
                                '매출 달성 획득 · ' || c.code || ' 정산 (누적 확정 GMV ₩' || to_char(v_per_won, 'FM999,999,999,999') || '당 1🥬)', 'settlement', v_sid);
  end if;

  -- 5 추천 보상
  v_reward  := (k ->> 'ref_reward')::bigint;
  v_breward := (k ->> 'brand_ref_reward')::bigint;
  if v_reward > 0 and (k #>> '{seller,referred_by}') is not null then
    insert into public.referral_earnings (side, referrer_seller_id, referred_seller_id, campaign_id, settlement_id, rate, amount, memo, earned_on)
    values ('seller', (k #>> '{seller,referred_by}')::uuid, v_seller_id, c.id, v_sid, (k ->> 'ref_reward_rate')::numeric, v_reward::integer,
            '추천 보상 · ' || c.code, v_today);
    select name into v_ref_name from public.sellers where id = (k #>> '{seller,referred_by}')::uuid;
    insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
    values (c.id, 'system', 'system', 'admin', p_actor_user_id,
            '추천 보상 지급 — 추천인 ' || coalesce(v_ref_name, '') || '에게 확정 매출의 ' || round((k ->> 'ref_reward_rate')::numeric * 100) || '% ₩'
              || to_char(v_reward, 'FM999,999,999,999') || ' (플랫폼 부담)',
            'ref_reward', jsonb_build_object('referrer_seller_id', k #>> '{seller,referred_by}', 'amount', v_reward, 'settlement_id', v_sid));
  else
    v_reward := 0;
  end if;
  if v_breward > 0 and (k #>> '{brand,referred_by}') is not null then
    insert into public.referral_earnings (side, referrer_brand_id, referred_brand_id, campaign_id, settlement_id, rate, amount, memo, earned_on)
    values ('brand', (k #>> '{brand,referred_by}')::uuid, v_brand_id, c.id, v_sid, (k ->> 'brand_ref_reward_rate')::numeric, v_breward::integer,
            '브랜드 추천 보상 · ' || c.code, v_today);
    select name into v_ref_name from public.brands where id = (k #>> '{brand,referred_by}')::uuid;
    insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
    values (c.id, 'system', 'system', 'admin', p_actor_user_id,
            '브랜드 추천 보상 — 추천 브랜드 ' || coalesce(v_ref_name, '') || '에게 확정 매출의 ' || round((k ->> 'brand_ref_reward_rate')::numeric * 100) || '% ₩'
              || to_char(v_breward, 'FM999,999,999,999') || ' · 신규 브랜드 수수료 −' || round((k ->> 'brand_ref_disc_rate')::numeric * 100) || '%p 적용 (플랫폼 부담)',
            'brand_ref_reward', jsonb_build_object('referrer_brand_id', k #>> '{brand,referred_by}', 'amount', v_breward, 'settlement_id', v_sid));
  else
    v_breward := 0;
  end if;

  -- 6 등급
  v_grade_s := public.app_seller_grade_recalc(v_seller_id);
  v_grade_b := public.app_brand_grade_recalc(v_brand_id);

  -- 7 스레드
  if v_hold_s is not null or v_hold_b is not null then
    insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
    values (c.id, 'system', 'system', 'admin', p_actor_user_id,
            '⏸ 지급 보류 — ' || concat_ws(' · ', case when v_hold_s is not null then '인플루언서: ' || public.admin_hold_label(v_hold_s) end,
                                                case when v_hold_b is not null then '브랜드: ' || public.admin_hold_label(v_hold_b) end)
              || '. 정산 정보를 등록하면 다음 지급 배치에 포함됩니다.',
            'payout_held', jsonb_build_object('seller', v_hold_s, 'brand', v_hold_b, 'settlement_id', v_sid));
  end if;
  v_settled_body := '정산 완료 · 브랜드 ₩' || to_char((k ->> 'brand_payout')::bigint, 'FM999,999,999,999')
    || case when (k ->> 'brand_ref_applied')::boolean then ' (추천 할인 −' || round((k ->> 'brand_ref_disc_rate')::numeric * 100) || '%p 포함)' else '' end
    || case when (k ->> 'brand_discount')::bigint > 0 then ' (등급 할인 포함)' else '' end
    || ' · 인플루언서 ₩' || to_char(v_sf_total, 'FM999,999,999,999')
    || case when (k ->> 'seller_bonus')::bigint > 0 then ' (' || (k ->> 'seller_grade') || ' 보너스 포함)' else '' end
    || case when (k ->> 'ref_boost_applied')::boolean then ' (추천 부스트 +' || round((k ->> 'ref_boost_rate')::numeric * 100) || '%p 포함)' else '' end
    || ' → ' || case when v_wht_rate > 0 then '원천징수 ' || to_char(v_wht_rate * 100, 'FM990.9') || '% 공제 후 ₩' || to_char(v_sf_total - v_wht, 'FM999,999,999,999')
                     else '사업자 정산(세금계산서) ₩' || to_char(v_sf_total, 'FM999,999,999,999') end
    || ' · 명세 발행';
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
  values (c.id, 'system', 'system', 'admin', p_actor_user_id, v_settled_body, 'settled',
          jsonb_build_object('settlement_id', v_sid, 'net', (k ->> 'net')::bigint, 'brand_payout', (k ->> 'brand_payout')::bigint,
                             'seller_fee_total', v_sf_total, 'seller_wht', v_wht, 'seller_payout', (k ->> 'seller_payout')::bigint,
                             'hold_seller', (v_hold_s is not null), 'hold_brand', (v_hold_b is not null), 'forced', coalesce(p_force, false),
                             'due_on', v_due, 'settled_on', v_today));

  return jsonb_build_object(
    'ok', true, 'already', false, 'forced', coalesce(p_force, false),
    'settlement_id', v_sid, 'campaign_id', c.id, 'campaign_code', c.code,
    'net', (k ->> 'net')::bigint, 'seller_fee_total', v_sf_total, 'seller_wht', v_wht,
    'seller_payout', (k ->> 'seller_payout')::bigint, 'brand_payout', (k ->> 'brand_payout')::bigint,
    'platform_fee', (k ->> 'platform_fee')::bigint, 'platform_net', (k ->> 'platform_net')::bigint,
    'holds', k -> 'holds',
    'payouts', jsonb_build_object('seller', public.admin_payout_json(v_po_s), 'brand', public.admin_payout_json(v_po_b)),
    'celery', jsonb_build_object('sample_refund_cel', v_ref_cel, 'sample_refund_cash', v_ref_cash, 'seller_earned', v_earn_s, 'brand_earned', v_earn_b),
    'referral', jsonb_build_object('seller_reward', v_reward, 'brand_reward', v_breward),
    'grades', jsonb_build_object('seller', v_grade_s, 'brand', v_grade_b),
    'settled_at', v_now, 'due_on', v_due
  );
end;
$$;
revoke all on function public.app_admin_settle_run(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.app_admin_settle_run(uuid, uuid, boolean) to service_role;

-- ------------------------------------------------------------
-- app_admin_settle_run_due(p_actor_user_id) — 기준일 도래 CLEARING 전부 실행 (runSettleAll · "정산 실행(도래분)" 버튼 · 크론 후보). 건별 결과.
--   { ok:true, today, count, settled:n, failed:n, results:[app_admin_settle_run 결과 + campaign_code] }
-- ------------------------------------------------------------
create or replace function public.app_admin_settle_run_due(p_actor_user_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_today   date := (now() at time zone 'Asia/Seoul')::date;
  v_days    integer := public.platform_clear_days();
  r         record;
  res       jsonb;
  v_results jsonb := '[]'::jsonb;
  v_ok      integer := 0;
  v_fail    integer := 0;
begin
  for r in
    select id, code from public.campaigns
     where status = 'CLEARING' and end_date is not null and end_date + v_days <= v_today
     order by end_date, code
  loop
    res := public.app_admin_settle_run(r.id, p_actor_user_id, false);
    if (res ->> 'ok')::boolean and not coalesce((res ->> 'already')::boolean, false) then v_ok := v_ok + 1; elsif not (res ->> 'ok')::boolean then v_fail := v_fail + 1; end if;
    v_results := v_results || (res || jsonb_build_object('campaign_code', r.code));
  end loop;
  return jsonb_build_object('ok', true, 'today', v_today, 'count', jsonb_array_length(v_results), 'settled', v_ok, 'failed', v_fail, 'results', v_results);
end;
$$;
revoke all on function public.app_admin_settle_run_due(uuid) from public, anon, authenticated;
grant execute on function public.app_admin_settle_run_due(uuid) to service_role;

-- ------------------------------------------------------------
-- app_admin_payout_mark_paid(p_payout_id, p_actor_user_id, p_memo) — 운영자 이체 후 지급 완료 표시. pending → paid(+paid_at · memo) · 정산 상태 동기화.
--   { ok:true, already:bool, payout, settlement_status } | { ok:false, code:'NOT_FOUND' | 'HELD'{hold_code} }
-- ------------------------------------------------------------
create or replace function public.app_admin_payout_mark_paid(p_payout_id uuid, p_actor_user_id uuid default null, p_memo text default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  po       public.payouts%rowtype;
  v_status text;
  v_cid    uuid;
begin
  select * into po from public.payouts where id = p_payout_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if po.status = 'paid' then
    return jsonb_build_object('ok', true, 'already', true, 'payout', public.admin_payout_json(po),
                              'settlement_status', (select status from public.settlements where id = po.settlement_id));
  end if;
  if po.status = 'held' then
    return jsonb_build_object('ok', false, 'code', 'HELD', 'hold_code', po.hold_code);
  end if;
  update public.payouts
     set status = 'paid', paid_at = now(), memo = coalesce(nullif(left(btrim(coalesce(p_memo, '')), 200), ''), memo)
   where id = po.id
  returning * into po;
  v_status := public.admin_settlement_sync_status(po.settlement_id);
  select campaign_id into v_cid from public.settlements where id = po.settlement_id;
  insert into public.campaign_events (campaign_id, kind, sender, actor_role, actor_user_id, body, event_type, payload)
  values (v_cid, 'system', 'system', 'admin', p_actor_user_id,
          '💸 ' || case when po.payee_type = 'seller' then '인플루언서' else '브랜드' end || ' 정산금 지급 완료 · ₩' || to_char(po.amount, 'FM999,999,999,999'),
          'payout_paid', jsonb_build_object('payout_id', po.id, 'payee_type', po.payee_type, 'amount', po.amount, 'settlement_status', v_status));
  return jsonb_build_object('ok', true, 'already', false, 'payout', public.admin_payout_json(po), 'settlement_status', v_status);
end;
$$;
revoke all on function public.app_admin_payout_mark_paid(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.app_admin_payout_mark_paid(uuid, uuid, text) to service_role;

-- ------------------------------------------------------------
-- app_admin_payout_hold(p_payout_id, p_reason) — 운영자 보류 (pending → held · hold_code 'MANUAL' · 사유 문구)
--   { ok:true, already:bool, payout, settlement_status } | { ok:false, code:'NOT_FOUND' | 'ALREADY_PAID' }
-- ------------------------------------------------------------
create or replace function public.app_admin_payout_hold(p_payout_id uuid, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  po public.payouts%rowtype;
begin
  select * into po from public.payouts where id = p_payout_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if po.status = 'paid' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_PAID');
  end if;
  if po.status = 'held' then
    return jsonb_build_object('ok', true, 'already', true, 'payout', public.admin_payout_json(po),
                              'settlement_status', (select status from public.settlements where id = po.settlement_id));
  end if;
  update public.payouts
     set status = 'held', hold_code = 'MANUAL',
         hold_reason = coalesce(nullif(left(btrim(coalesce(p_reason, '')), 200), ''), public.admin_hold_label('MANUAL'))
   where id = po.id
  returning * into po;
  return jsonb_build_object('ok', true, 'already', false, 'payout', public.admin_payout_json(po),
                            'settlement_status', public.admin_settlement_sync_status(po.settlement_id));
end;
$$;
revoke all on function public.app_admin_payout_hold(uuid, text) from public, anon, authenticated;
grant execute on function public.app_admin_payout_hold(uuid, text) to service_role;

-- ------------------------------------------------------------
-- app_admin_payout_release(p_payout_id) — 보류 해제 (held → pending). 정산 정보 완비를 **다시 검사**한다 — 아직 미완비면 STILL_INCOMPLETE{hold_code}.
--   해제 시 bank_snapshot 을 현재 계좌(마스킹)로 갱신. { ok:true, already:bool, payout, settlement_status } | { ok:false, code:'NOT_FOUND' | 'ALREADY_PAID' | 'STILL_INCOMPLETE' }
-- ------------------------------------------------------------
create or replace function public.app_admin_payout_release(p_payout_id uuid)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  po      public.payouts%rowtype;
  v_hold  text;
  v_bank  jsonb;
begin
  select * into po from public.payouts where id = p_payout_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  if po.status = 'paid' then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_PAID');
  end if;
  if po.status = 'pending' then
    return jsonb_build_object('ok', true, 'already', true, 'payout', public.admin_payout_json(po),
                              'settlement_status', (select status from public.settlements where id = po.settlement_id));
  end if;
  v_hold := public.admin_payout_hold_reason(po.payee_type, po.seller_id, po.brand_id);
  if v_hold is not null then
    return jsonb_build_object('ok', false, 'code', 'STILL_INCOMPLETE', 'hold_code', v_hold, 'label', public.admin_hold_label(v_hold));
  end if;
  if po.payee_type = 'seller' then
    select public.admin_bank_snapshot(bank_info) into v_bank from public.sellers where id = po.seller_id;
  else
    select public.admin_bank_snapshot(bank_info) into v_bank from public.brands where id = po.brand_id;
  end if;
  update public.payouts
     set status = 'pending', hold_code = null, hold_reason = null, bank_snapshot = v_bank
   where id = po.id
  returning * into po;
  return jsonb_build_object('ok', true, 'already', false, 'payout', public.admin_payout_json(po),
                            'settlement_status', public.admin_settlement_sync_status(po.settlement_id));
end;
$$;
revoke all on function public.app_admin_payout_release(uuid) from public, anon, authenticated;
grant execute on function public.app_admin_payout_release(uuid) to service_role;

-- ------------------------------------------------------------
-- app_admin_payout_export(p_status, p_actor, p_purpose) — 이체 파일 행(계좌 **원문**). service role 전용 · 지급건마다 sensitive_access_log(field 'bank_info') 1행.
--   p_status 'pending'(기본) | 'held' | 'paid' | 'all'. p_actor(운영자 식별) · p_purpose 필수(ACTOR_REQUIRED).
--   계좌는 지급 시점의 sellers/brands.bank_info 원문(스냅샷은 마스킹이라) — 정보가 아직 없으면 account null.
--   { ok:true, status, count, logged, rows:[{ payout_id, settlement_id, campaign_code, title, payee_type, payee_code, payee_name, settle_type, bank, account, holder, biz_no,
--                                            amount, wht, status, hold_code, due_on, settled_at, paid_at, memo }] }
-- ------------------------------------------------------------
create or replace function public.app_admin_payout_export(p_status text default 'pending', p_actor text default null, p_purpose text default null)
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, 'pending')));
  v_rows   jsonb;
  v_logged integer := 0;
begin
  if coalesce(btrim(p_actor), '') = '' or coalesce(btrim(p_purpose), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'ACTOR_REQUIRED');
  end if;
  if v_status not in ('pending', 'held', 'paid', 'all') then
    return jsonb_build_object('ok', false, 'code', 'BAD_STATUS');
  end if;

  with sel as (
    select po.*, st.campaign_id, st.title, st.due_on, st.settled_at, c.code as campaign_code
      from public.payouts po
      join public.settlements st on st.id = po.settlement_id
      join public.campaigns c on c.id = st.campaign_id
     where (v_status = 'all' or po.status = v_status)
     order by st.settled_at, po.payee_type desc
  ), logged as (
    insert into public.sensitive_access_log (seller_id, brand_id, field, actor, purpose)
    select sel.seller_id, sel.brand_id, 'bank_info', btrim(p_actor), btrim(p_purpose) from sel
    returning id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'payout_id', sel.id, 'settlement_id', sel.settlement_id, 'campaign_code', sel.campaign_code, 'title', sel.title,
           'payee_type', sel.payee_type,
           'payee_code', coalesce(s.code, b.code), 'payee_name', coalesce(s.name, b.name), 'settle_type', case when sel.payee_type = 'seller' then s.settle_type else 'biz' end,
           'bank', coalesce(s.bank_info, b.bank_info) ->> 'bank',
           'account', coalesce(s.bank_info, b.bank_info) ->> 'account',
           'holder', coalesce(s.bank_info, b.bank_info) ->> 'holder',
           'biz_no', coalesce(s.biz_no, b.biz_no),
           'amount', sel.amount, 'wht', sel.wht, 'status', sel.status, 'hold_code', sel.hold_code,
           'due_on', sel.due_on, 'settled_at', sel.settled_at, 'paid_at', sel.paid_at, 'memo', sel.memo)
           order by sel.settled_at, sel.payee_type desc), '[]'::jsonb),
         (select count(*) from logged)
    into v_rows, v_logged
    from sel
    left join public.sellers s on s.id = sel.seller_id
    left join public.brands  b on b.id = sel.brand_id;

  return jsonb_build_object('ok', true, 'status', v_status, 'count', jsonb_array_length(v_rows), 'logged', v_logged, 'rows', v_rows);
end;
$$;
revoke all on function public.app_admin_payout_export(text, text, text) from public, anon, authenticated;
grant execute on function public.app_admin_payout_export(text, text, text) to service_role;

-- ------------------------------------------------------------
-- app_admin_rrn_export(p_settlement_ids, p_actor, p_key, p_purpose) — 원천징수(지급명세서) 자료: 정산건별 인플루언서 주민번호 복호(0013 app_seller_rrn_decrypt · 호출마다 로그).
--   p_key = 서버 env RRN_ENC_KEY. 개인(personal · null)만 복호하고 사업자(biz)는 rrn null + code 'BIZ'. 없으면 NO_RRN · 키 불일치 RRN_DECRYPT_FAILED (행별 code).
--   { ok:true, count, rows:[{ settlement_id, campaign_code, seller_code, seller_name, settle_type, rrn|null, code|null, seller_fee_total, seller_wht, seller_payout, settled_at }] }
--   | { ok:false, code:'RRN_KEY_MISSING' | 'ACTOR_REQUIRED' }
-- ------------------------------------------------------------
create or replace function public.app_admin_rrn_export(p_settlement_ids uuid[], p_actor text, p_key text, p_purpose text default '지급명세서')
returns jsonb
language plpgsql
volatile
security definer set search_path = public
as $$
declare
  r      record;
  d      jsonb;
  v_rows jsonb := '[]'::jsonb;
begin
  if p_key is null or btrim(p_key) = '' then
    return jsonb_build_object('ok', false, 'code', 'RRN_KEY_MISSING');
  end if;
  if coalesce(btrim(p_actor), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'ACTOR_REQUIRED');
  end if;
  for r in
    select st.id as settlement_id, c.code as campaign_code, s.id as seller_id, s.code as seller_code, s.name as seller_name, s.settle_type,
           st.seller_fee_total, st.seller_wht, st.seller_payout, st.settled_at
      from public.settlements st
      join public.campaigns c on c.id = st.campaign_id
      join public.sellers s on s.id = c.seller_id
     where st.id = any (p_settlement_ids)
     order by st.settled_at
  loop
    if r.settle_type = 'biz' then
      d := jsonb_build_object('ok', false, 'code', 'BIZ');
    else
      d := public.app_seller_rrn_decrypt(r.seller_id, p_key, p_actor, coalesce(p_purpose, '지급명세서') || ' · ' || r.campaign_code);
    end if;
    v_rows := v_rows || jsonb_build_object(
      'settlement_id', r.settlement_id, 'campaign_code', r.campaign_code, 'seller_code', r.seller_code, 'seller_name', r.seller_name, 'settle_type', r.settle_type,
      'rrn', case when (d ->> 'ok')::boolean then d ->> 'rrn' else null end,
      'code', case when (d ->> 'ok')::boolean then null else d ->> 'code' end,
      'seller_fee_total', r.seller_fee_total, 'seller_wht', r.seller_wht, 'seller_payout', r.seller_payout, 'settled_at', r.settled_at);
  end loop;
  return jsonb_build_object('ok', true, 'count', jsonb_array_length(v_rows), 'rows', v_rows);
end;
$$;
revoke all on function public.app_admin_rrn_export(uuid[], text, text, text) from public, anon, authenticated;
grant execute on function public.app_admin_rrn_export(uuid[], text, text, text) to service_role;

-- ------------------------------------------------------------
-- app_admin_settlements(p_status, p_limit) — 관리자 정산 화면 데이터 (vAdminSettle 대기 목록 + 완료 표)
--   queue: CLEARING 캠페인 전부(app_admin_settle_preview live 요약 — eligible · due_on · 보류 예고) · 기준일 순
--   rows : settlements 스냅샷(admin_settlement_json) — p_status null|'pending'|'held'|'paid' · 최신순 · 최대 p_limit(기본 200 · 상한 1000)
--   counts: { due_now, clearing, pending, held, paid, payouts_pending, payouts_held }
-- ------------------------------------------------------------
create or replace function public.app_admin_settlements(p_status text default null, p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_limit  integer := least(greatest(coalesce(p_limit, 200), 1), 1000);
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_days   integer := public.platform_clear_days();
  v_queue  jsonb := '[]'::jsonb;
  v_rows   jsonb;
  v_counts jsonb;
  r        record;
  k        jsonb;
begin
  if v_status is not null and v_status not in ('pending', 'held', 'paid') then
    return jsonb_build_object('ok', false, 'code', 'BAD_STATUS');
  end if;

  for r in
    select id from public.campaigns where status = 'CLEARING' order by end_date nulls last, code
  loop
    k := public.app_admin_settle_preview(r.id);
    if (k ->> 'ok')::boolean then
      v_queue := v_queue || jsonb_build_object(
        'campaign_id', k -> 'campaign_id', 'campaign_code', k -> 'campaign_code', 'title', k -> 'title',
        'seller', k -> 'seller', 'brand', k -> 'brand', 'product', k -> 'product',
        'start_date', k -> 'start_date', 'end_date', k -> 'end_date', 'due_on', k -> 'due_on', 'eligible', k -> 'eligible', 'reason', k -> 'reason',
        'paid_count', k -> 'paid_count', 'refund_count', k -> 'refund_count',
        'net', k -> 'net', 'brand_payout', k -> 'brand_payout', 'seller_fee_total', k -> 'seller_fee_total', 'seller_wht', k -> 'seller_wht',
        'seller_payout', k -> 'seller_payout', 'platform_fee', k -> 'platform_fee', 'platform_net', k -> 'platform_net',
        'hold_seller', k -> 'hold_seller', 'hold_brand', k -> 'hold_brand', 'holds', k -> 'holds');
    end if;
  end loop;

  select coalesce(jsonb_agg(public.admin_settlement_json(st) order by st.settled_at desc), '[]'::jsonb)
    into v_rows
    from (select * from public.settlements where (v_status is null or status = v_status) order by settled_at desc limit v_limit) st;

  select jsonb_build_object(
           'due_now', (select count(*) from public.campaigns where status = 'CLEARING' and end_date is not null and end_date + v_days <= v_today),
           'clearing', (select count(*) from public.campaigns where status = 'CLEARING'),
           'pending', (select count(*) from public.settlements where status = 'pending'),
           'held', (select count(*) from public.settlements where status = 'held'),
           'paid', (select count(*) from public.settlements where status = 'paid'),
           'payouts_pending', (select count(*) from public.payouts where status = 'pending'),
           'payouts_held', (select count(*) from public.payouts where status = 'held'),
           'payouts_pending_amount', (select coalesce(sum(amount), 0) from public.payouts where status = 'pending'))
    into v_counts;

  return jsonb_build_object('ok', true, 'today', v_today, 'status', v_status, 'queue', v_queue, 'rows', v_rows, 'counts', v_counts);
end;
$$;
revoke all on function public.app_admin_settlements(text, integer) from public, anon, authenticated;
grant execute on function public.app_admin_settlements(text, integer) to service_role;

-- ------------------------------------------------------------
-- admin_order_json(orders) — 관리자 주문 1행 = brand_order_json(0018) + 브랜드 · 결제 키 유무 · 샘플 플래그(열람 전용)
-- ------------------------------------------------------------
create or replace function public.admin_order_json(o public.orders)
returns jsonb
language sql stable
set search_path = public
as $$
  select public.brand_order_json(o) || jsonb_build_object(
    'brand', (select jsonb_build_object('id', b.id, 'code', b.code, 'name', b.name) from public.brands b join public.campaigns c on c.brand_id = b.id where c.id = o.campaign_id),
    'has_payment_key', (o.payment_key is not null),
    'payment_key', o.payment_key,
    'checkout_session_id', o.checkout_session_id,
    'user_id', o.user_id,
    'created_at', o.created_at)
$$;
revoke all on function public.admin_order_json(public.orders) from public, anon, authenticated;
grant execute on function public.admin_order_json(public.orders) to service_role;

-- ------------------------------------------------------------
-- app_admin_orders(p_filter, p_q, p_limit) — 전 브랜드 주문 표 (열람 전용 · 샘플 포함)
--   p_filter: 'all' | 'paid' | 'unshipped' | 'shipped' | 'refunded'(REFUNDED · CANCELED) | 'sample' | 'manual'(PAID 인데 payment_key 없음 — 시드·수기) | 'partial'(PAID & refund_amount>0)
--   p_q: 주문번호 · 구매자명 · 캠페인 코드 · 상품명 · 인플루언서 핸들 · 브랜드명 · 토스 paymentKey (대소문자 무시 · 부분 일치)
--   { ok:true, filter, q, rows:[admin_order_json…], totals:{ count, paid, unshipped, shipped, refunded, sample, manual, paid_amount, refund_amount } }
-- ------------------------------------------------------------
create or replace function public.app_admin_orders(p_filter text default 'all', p_q text default null, p_limit integer default 200)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_filter text := lower(btrim(coalesce(p_filter, 'all')));
  v_q      text := nullif(lower(btrim(coalesce(p_q, ''))), '');
  v_limit  integer := least(greatest(coalesce(p_limit, 200), 1), 2000);
  v_rows   jsonb;
  v_totals jsonb;
begin
  if v_filter not in ('all', 'paid', 'unshipped', 'shipped', 'refunded', 'sample', 'manual', 'partial') then
    return jsonb_build_object('ok', false, 'code', 'BAD_FILTER');
  end if;

  select coalesce(jsonb_agg(public.admin_order_json(o) order by o.paid_at desc, o.code desc), '[]'::jsonb)
    into v_rows
    from (
      select o.*
        from public.orders o
        join public.campaigns c on c.id = o.campaign_id
        join public.products p on p.id = c.product_id
        join public.sellers  s on s.id = c.seller_id
        join public.brands   b on b.id = c.brand_id
       where case v_filter
               when 'paid'      then o.status = 'PAID'
               when 'unshipped' then o.status = 'PAID' and o.tracking_no is null and not o.is_sample
               when 'shipped'   then o.status = 'PAID' and o.tracking_no is not null
               when 'refunded'  then o.status in ('REFUNDED', 'CANCELED')
               when 'sample'    then o.is_sample
               when 'manual'    then o.status = 'PAID' and o.payment_key is null
               when 'partial'   then o.status = 'PAID' and coalesce(o.refund_amount, 0) > 0
               else true end
         and (v_q is null
              or lower(o.code) like '%' || v_q || '%'
              or lower(o.buyer_name) like '%' || v_q || '%'
              or lower(c.code) = v_q
              or lower(p.name) like '%' || v_q || '%'
              or lower(s.handle) like '%' || v_q || '%'
              or lower(b.name) like '%' || v_q || '%'
              or lower(coalesce(o.payment_key, '')) = v_q)
       order by o.paid_at desc, o.code desc
       limit v_limit
    ) o;

  select jsonb_build_object(
           'count', count(*),
           'paid', count(*) filter (where o.status = 'PAID'),
           'unshipped', count(*) filter (where o.status = 'PAID' and o.tracking_no is null and not o.is_sample),
           'shipped', count(*) filter (where o.status = 'PAID' and o.tracking_no is not null),
           'refunded', count(*) filter (where o.status in ('REFUNDED', 'CANCELED')),
           'sample', count(*) filter (where o.is_sample),
           'manual', count(*) filter (where o.status = 'PAID' and o.payment_key is null),
           'partial', count(*) filter (where o.status = 'PAID' and coalesce(o.refund_amount, 0) > 0),
           'paid_amount', coalesce(sum(o.amount) filter (where o.status = 'PAID'), 0),
           'refund_amount', coalesce(sum(coalesce(o.refund_amount, o.amount)) filter (where o.status in ('REFUNDED', 'CANCELED')), 0))
    into v_totals
    from public.orders o;

  return jsonb_build_object('ok', true, 'filter', v_filter, 'q', v_q, 'rows', v_rows, 'totals', v_totals);
end;
$$;
revoke all on function public.app_admin_orders(text, text, integer) from public, anon, authenticated;
grant execute on function public.app_admin_orders(text, text, integer) to service_role;

-- ------------------------------------------------------------
-- app_admin_order(p_order_id) — 주문 1건 상세: 주문 + 결제 세션(checkout_sessions 요약 · 원문 제외) + 결제 이벤트(payment_events 최근 20) + 스레드 이벤트(이 주문 관련 최근 20) + 문의(cs_conversations)
--   { ok:true, order, session|null, payment_events:[…], campaign_events:[…], cs:[cs_conversation_json…] } | { ok:false, code:'NOT_FOUND' }
-- ------------------------------------------------------------
create or replace function public.app_admin_order(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  return jsonb_build_object(
    'ok', true,
    'order', public.admin_order_json(o) || jsonb_build_object('raw_cancel', o.raw_cancel, 'payment_status', o.raw_payment ->> 'status', 'refund_reason', o.refund_reason),
    'session', (select jsonb_build_object('id', cs.id, 'toss_order_id', cs.toss_order_id, 'status', cs.status, 'amount', cs.amount, 'payment_key', cs.payment_key,
                                          'payment_method', cs.payment_method, 'approved_at', cs.approved_at, 'fail_code', cs.fail_code, 'fail_message', cs.fail_message,
                                          'expires_at', cs.expires_at, 'created_at', cs.created_at)
                  from public.checkout_sessions cs where cs.id = o.checkout_session_id),
    'payment_events', coalesce((select jsonb_agg(jsonb_build_object('id', pe.id, 'source', pe.source, 'event_type', pe.event_type, 'handled', pe.handled,
                                                                    'result', pe.result, 'received_at', pe.received_at) order by pe.received_at desc)
                                  from (select * from public.payment_events pe
                                         where (o.payment_key is not null and pe.payment_key = o.payment_key)
                                            or (o.checkout_session_id is not null and pe.toss_order_id = (select toss_order_id from public.checkout_sessions where id = o.checkout_session_id))
                                         order by pe.received_at desc limit 20) pe), '[]'::jsonb),
    'campaign_events', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'event_type', e.event_type, 'body', e.body, 'payload', e.payload, 'created_at', e.created_at)
                                                  order by e.created_at desc)
                                   from (select * from public.campaign_events e
                                          where e.campaign_id = o.campaign_id and e.kind = 'system' and e.payload ->> 'order_code' = o.code
                                          order by e.created_at desc limit 20) e), '[]'::jsonb),
    'cs', coalesce((select jsonb_agg(public.cs_conversation_json(x) order by x.last_message_at desc)
                      from public.cs_conversations x where x.order_id = o.id), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.app_admin_order(uuid) from public, anon, authenticated;
grant execute on function public.app_admin_order(uuid) to service_role;

-- ------------------------------------------------------------
-- app_admin_payments_health() — 결제 정합성 카운트 (운영 큐 · 화면 상단 카드)
--   checkout_sessions: pending · confirming · stale_confirming(CONFIRMING 2분 초과) · expired_due(PENDING 인데 만료 시각 경과 — expire 크론 대상) · cancel_pending(FAILED · fail_code CANCEL_PENDING)
--   payment_events: unhandled · unhandled_oldest · last_received_at
--   partner_payments: pending · confirming · cancel_pending · refunded
--   orders: paid_without_key(시드·수기) · partial_refund · canceled_adjust(정산 후 조정 큐 CANCELED) · refund_needs_adjust(이벤트 수)
--   settlements/payouts: pending · held · paid · payouts_pending · payouts_held
--   reconcile: last_at(payment_events source 'webhook' 외 'confirm'/'cancel' 의 최근 시각 — reconcile 잡의 기록이 없으면 null)
-- ------------------------------------------------------------
create or replace function public.app_admin_payments_health()
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'ok', true,
    'now', now(),
    'checkout_sessions', jsonb_build_object(
      'pending', (select count(*) from public.checkout_sessions where status = 'PENDING'),
      'confirming', (select count(*) from public.checkout_sessions where status = 'CONFIRMING'),
      'stale_confirming', (select count(*) from public.checkout_sessions where status = 'CONFIRMING' and updated_at < now() - interval '2 minutes'),
      'expired_due', (select count(*) from public.checkout_sessions where status = 'PENDING' and expires_at < now()),
      'cancel_pending', (select count(*) from public.checkout_sessions where status = 'FAILED' and fail_code = 'CANCEL_PENDING'),
      'confirmed_24h', (select count(*) from public.checkout_sessions where status = 'CONFIRMED' and approved_at >= now() - interval '24 hours')),
    'payment_events', jsonb_build_object(
      'unhandled', (select count(*) from public.payment_events where not handled),
      'unhandled_oldest', (select min(received_at) from public.payment_events where not handled),
      'last_received_at', (select max(received_at) from public.payment_events),
      'errors_7d', (select count(*) from public.payment_events where result like 'error:%' and received_at >= now() - interval '7 days')),
    'partner_payments', jsonb_build_object(
      'pending', (select count(*) from public.partner_payments where status = 'PENDING'),
      'confirming', (select count(*) from public.partner_payments where status = 'CONFIRMING'),
      'cancel_pending', (select count(*) from public.partner_payments where status = 'FAILED' and fail_code = 'CANCEL_PENDING'),
      'refunded', (select count(*) from public.partner_payments where status = 'REFUNDED')),
    'orders', jsonb_build_object(
      'paid', (select count(*) from public.orders where status = 'PAID'),
      'paid_without_key', (select count(*) from public.orders where status = 'PAID' and payment_key is null),
      'partial_refund', (select count(*) from public.orders where status = 'PAID' and coalesce(refund_amount, 0) > 0),
      'canceled_adjust', (select count(*) from public.orders where status = 'CANCELED'),
      'refund_needs_adjust', (select count(*) from public.campaign_events where event_type = 'refund_needs_adjust'),
      'refund_after_ship', (select count(*) from public.campaign_events where event_type = 'refund_after_ship')),
    'settlements', jsonb_build_object(
      'pending', (select count(*) from public.settlements where status = 'pending'),
      'held', (select count(*) from public.settlements where status = 'held'),
      'paid', (select count(*) from public.settlements where status = 'paid'),
      'payouts_pending', (select count(*) from public.payouts where status = 'pending'),
      'payouts_held', (select count(*) from public.payouts where status = 'held'),
      'due_now', (select count(*) from public.campaigns where status = 'CLEARING' and end_date is not null
                   and end_date + public.platform_clear_days() <= (now() at time zone 'Asia/Seoul')::date)),
    'reconcile', jsonb_build_object(
      'last_at', (select max(received_at) from public.payment_events where event_type = 'reconcile'),
      'last_result', (select result from public.payment_events where event_type = 'reconcile' order by received_at desc limit 1))
  )
$$;
revoke all on function public.app_admin_payments_health() from public, anon, authenticated;
grant execute on function public.app_admin_payments_health() to service_role;

-- ------------------------------------------------------------
-- app_admin_cs_list(p_status, p_limit) — 전 브랜드 문의함 (열람 전용 — 답변·종료는 브랜드 콘솔 · CLAUDE.md "관리자는 열람만")
--   p_status null|OPEN|ANSWERED|CLOSED · OPEN 먼저 → 최근 메시지순 · 최대 p_limit(기본 200 · 상한 1000). [cs_conversation_json…] — campaign.brand 포함(0018)
-- app_admin_cs_thread(p_conversation_id) — 대화 + 메시지 (없으면 null)
-- ------------------------------------------------------------
create or replace function public.app_admin_cs_list(p_status text default null, p_limit integer default 200)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select coalesce((select jsonb_agg(public.cs_conversation_json(x)
                                    order by (x.status = 'OPEN') desc, (x.status = 'ANSWERED') desc, x.last_message_at desc)
                     from (select * from public.cs_conversations
                            where (p_status is null or status = upper(btrim(p_status)))
                            order by (status = 'OPEN') desc, (status = 'ANSWERED') desc, last_message_at desc
                            limit least(greatest(coalesce(p_limit, 200), 1), 1000)) x), '[]'::jsonb)
$$;
revoke all on function public.app_admin_cs_list(text, integer) from public, anon, authenticated;
grant execute on function public.app_admin_cs_list(text, integer) to service_role;

create or replace function public.app_admin_cs_thread(p_conversation_id uuid)
returns jsonb
language sql stable
security definer set search_path = public
as $$
  select public.cs_thread_json(x) from public.cs_conversations x where x.id = p_conversation_id
$$;
revoke all on function public.app_admin_cs_thread(uuid) from public, anon, authenticated;
grant execute on function public.app_admin_cs_thread(uuid) to service_role;
