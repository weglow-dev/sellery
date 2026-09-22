/**
 * 관리자 정산 · 지급 규칙 — 순수 모듈 (브라우저 `.svelte` 와 서버 양쪽에서 import). DB 호출은 `../server/admin/{settle,orders,payments,cs}.server.ts`.
 *
 * 숫자의 정답은 `packages/core/src/constants.ts` 와 `packages/core/src/helpers.ts` `calc()` · `sellerWht()` · `settleDue()` · `actions.ts` `runSettle()` 다.
 * 여기는 그 **전체**를 TS 로 옮긴 것이고(인플루언서 조각 = `../partner/settle-rules.ts` `calcSellerShare` · 브랜드 조각 = `../brand/settle-rules.ts` `calcBrandPay`),
 * 0020 `app_admin_settle_preview` · `app_admin_settle_run` 이 같은 식을 SQL 로 계산한다 — 넷을 함께 고친다(docs/settlement-policy.md §3 · §5 · §7 · §8 · §9).
 *
 *   calcSettlement({ gross, refunds, sampleNet, rate, bonusPp, refBoost, brandRefBoost, brandDiscRate, whtRate, sampleRefundCel, sampleRefundCash, … })
 *     → 모든 라인(net · pg · sf · gBonus · boost · refReward · bBoost · bReward · bDisc · pfGross · costs · pf · vat · pfNet · sfTotal · wht · brandPay · sellerPayout …)
 *       라인마다 독립 반올림(0004 반올림 계약 · JS Math.round = PG round(numeric) — 양수). 인플루언서 쪽 라인은 calcSellerShare, 브랜드 쪽 라인은 calcBrandPay 와 같다.
 *   sellerHoldReason · brandHoldReason — 0020 admin_payout_hold_reason 과 같은 판정 (BANK_MISSING · RRN_MISSING · TAX_INFO_MISSING · SETTLE_INFO_INCOMPLETE)
 *   settleDue(endDate) — 종료일 + CLEAR_DAYS (partner/settle-rules 재수출)
 *   parseSettlePreview · parseSettleRunResult · parseSettleRunDueResult · parseAdminSettlements · parsePayoutActionResult · parsePayoutExport · parseRrnExport
 *   · parsePaymentsHealth · parseAdminOrders · parseAdminOrder — RPC jsonb 를 타입으로
 *   payoutCsv · rrnCsv — 이체 파일 · 지급명세서 CSV (BOM + CRLF · 엑셀)
 *   HOLD_LABELS · ADMIN_SETTLE_FAIL_MESSAGES · settlementStatusChip · payoutStatusChip · settleRunSummary — 화면 문구
 */
import { BREF_DISC, BREF_RATE, CLEAR_DAYS, PG_RATE, PLAT_RATE, REF_BOOST, REF_RATE, SAMPLE_CEL_WON, WHT } from "@sellery/core/constants";
import { parseBrandOrderRow, type BrandOrderRow } from "../brand/order-rules";
import { fmtNum } from "../campaign";
import { md } from "../dates";
import type { StatusTone } from "../order-status";
import { sellerWhtRate, settleDue } from "../partner/settle-rules";

export { sellerWhtRate, settleDue };

/* ---------------- 보류 사유 · 문구 ---------------- */

export const HOLD_CODES = ["BANK_MISSING", "RRN_MISSING", "TAX_INFO_MISSING", "SETTLE_INFO_INCOMPLETE", "MANUAL"] as const;
export type HoldCode = (typeof HOLD_CODES)[number];

/** 0020 admin_hold_label 과 같은 문구 */
export const HOLD_LABELS: Record<HoldCode, string> = {
  BANK_MISSING: "정산 계좌 미등록",
  RRN_MISSING: "주민등록번호 미등록 — 원천징수 자료",
  TAX_INFO_MISSING: "사업자 세금계산서 정보 미등록",
  SETTLE_INFO_INCOMPLETE: "정산 정보 미완비 — 은행·계좌·예금주·사업자등록번호",
  MANUAL: "운영자 보류",
};

export function isHoldCode(v: unknown): v is HoldCode {
  return typeof v === "string" && (HOLD_CODES as readonly string[]).includes(v);
}

export function holdLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return isHoldCode(code) ? HOLD_LABELS[code] : code;
}

/** 0020 함수 실패 코드 → 화면 문구 */
export const ADMIN_SETTLE_FAIL_MESSAGES: Record<string, string> = {
  NOT_FOUND: "캠페인(또는 지급 건)을 찾을 수 없어요",
  WRONG_STATUS: "교환·환불 기간(CLEARING)인 캠페인만 정산할 수 있어요",
  NOT_DUE: "정산 기준일(D+21)이 아직 오지 않았어요 — 기준일 전 실행은 '강제 실행'으로",
  NO_SNAPSHOT: "정산 완료 캠페인이지만 명세 스냅샷이 없어요 (이관 데이터)",
  HELD: "지급 보류 중인 건은 지급 완료로 바꿀 수 없어요 — 먼저 보류를 해제하세요",
  ALREADY_PAID: "이미 지급 완료된 건이에요",
  STILL_INCOMPLETE: "정산 정보가 아직 미완비예요 — 파트너가 등록한 뒤 다시 해제하세요",
  BAD_STATUS: "지원하지 않는 상태 필터예요",
  BAD_FILTER: "지원하지 않는 필터예요",
  ACTOR_REQUIRED: "운영자 식별과 목적을 입력해야 원문을 내려받을 수 있어요",
  RRN_KEY_MISSING: "주민등록번호 복호 키가 설정되지 않았어요 (RRN_ENC_KEY)",
  BAD_STATE: "정산을 계산할 수 없는 상태예요",
  DB_ERROR: "처리에 실패했어요 — 잠시 후 다시 시도해주세요",
};

export function adminSettleFailMessage(code: string | null | undefined): string {
  return (code && ADMIN_SETTLE_FAIL_MESSAGES[code]) || ADMIN_SETTLE_FAIL_MESSAGES.DB_ERROR;
}

/* ---------------- 계산 (calc() 전체) ---------------- */

export type SettlementInput = {
  /** Σ unit×qty (status ≠ CANCELED) — 샘플 구매 주문 포함 */
  gross: number;
  /** Σ REFUNDED (+ 토스 부분취소 refund_amount) */
  refunds?: number;
  /** 인플루언서 본인 샘플 구매 주문 합 (PAID · is_sample) — 기본 수수료·등급 보너스에서만 제외 */
  sampleNet?: number;
  /** 인플루언서 수수료율 (commission_rate · 확정 시 rate_locked) */
  rate: number;
  /** 인플루언서 등급 보너스 %p */
  bonusPp?: number;
  /** 피추천 인플루언서 첫 5회 — +1%p 부스트 · 추천인 2% */
  refBoost?: boolean;
  /** 피추천 브랜드 첫 3회 — −1%p · 추천 브랜드 1% */
  brandRefBoost?: boolean;
  /** 브랜드 등급 수수료 할인율 (BG_DISC[등급]) */
  brandDiscRate?: number;
  /** 원천징수율 — sellerWhtRate(settleType). 기본 WHT */
  whtRate?: number;
  /** 샘플 구매 환급(상품 refund 옵션 · 구매 캠페인 · 미환급) — 🥬 / 현금 */
  sampleRefundCel?: number;
  sampleRefundCash?: number;
  /** 캠페인 샘플 결제 🥬 (브랜드 원화 보전 = cel × SAMPLE_CEL_WON) */
  sampleCel?: number;
  pgRate?: number;
  platformRate?: number;
  refBoostRate?: number;
  refRewardRate?: number;
  brandRefDiscRate?: number;
  brandRefRewardRate?: number;
  sampleCelWon?: number;
};

/** 키는 settlements 컬럼명(스네이크)이 아니라 calc() 이름 — SQL 스냅샷과의 대응은 settlement-policy §3 · data-model §4 표 */
export type Settlement = {
  gross: number;
  refunds: number;
  net: number;
  sampleNet: number;
  base: number;
  pg: number;
  sf: number;
  gBonus: number;
  boost: number;
  refReward: number;
  bBoost: number;
  bReward: number;
  bDisc: number;
  pfGross: number;
  costs: number;
  pf: number;
  vat: number;
  pfNet: number;
  sfTotal: number;
  wht: number;
  sampleRefundCel: number;
  sampleRefundCash: number;
  sampleCelCover: number;
  brandPay: number;
  /** 인플루언서 실수령 = sfTotal − wht + 샘플 환급 현금 */
  sellerPayout: number;
  /** 브랜드 실제 부담 "플랫폼+PG" = pfGross − bBoost − bDisc + pg (0019 platform_pg) */
  platformPg: number;
};

const n = (v: unknown, d = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : d);

/** `calc()` 전체 + `sellerWht` + 샘플 환급 — 라인마다 독립 반올림(저장값끼리 ±1원 어긋날 수 있음 · 0004 계약) */
export function calcSettlement(input: SettlementInput): Settlement {
  const gross = n(input.gross);
  const refunds = n(input.refunds);
  const sampleNet = n(input.sampleNet);
  const rate = n(input.rate);
  const bonusPp = n(input.bonusPp);
  const pgRate = input.pgRate === undefined ? PG_RATE : n(input.pgRate);
  const platformRate = input.platformRate === undefined ? PLAT_RATE : n(input.platformRate);
  const refBoostRate = input.refBoostRate === undefined ? REF_BOOST : n(input.refBoostRate);
  const refRewardRate = input.refRewardRate === undefined ? REF_RATE : n(input.refRewardRate);
  const brandRefDiscRate = input.brandRefDiscRate === undefined ? BREF_DISC : n(input.brandRefDiscRate);
  const brandRefRewardRate = input.brandRefRewardRate === undefined ? BREF_RATE : n(input.brandRefRewardRate);
  const brandDiscRate = n(input.brandDiscRate);
  const whtRate = input.whtRate === undefined ? WHT : n(input.whtRate);
  const sampleCelWon = input.sampleCelWon === undefined ? SAMPLE_CEL_WON : n(input.sampleCelWon);
  const sampleRefundCel = Math.max(0, Math.round(n(input.sampleRefundCel)));
  const sampleRefundCash = Math.max(0, n(input.sampleRefundCash));

  const net = gross - refunds;
  const base = net - sampleNet;
  const pg = net * pgRate;
  const sf = base * rate;
  const gBonus = (base * bonusPp) / 100;
  const boost = input.refBoost ? net * refBoostRate : 0;
  const refReward = input.refBoost ? net * refRewardRate : 0;
  const bBoost = input.brandRefBoost ? net * brandRefDiscRate : 0;
  const bReward = input.brandRefBoost ? net * brandRefRewardRate : 0;
  const bDisc = net * brandDiscRate;
  const pfGross = net * platformRate;
  const costs = gBonus + boost + refReward + bBoost + bReward + bDisc;
  const pf = pfGross - costs;
  const vat = pf > 0 ? pf - pf / 1.1 : 0;
  const pfNet = pf - vat;
  const sfTotal = sf + gBonus + boost;
  const wht = sfTotal * whtRate;
  const brandPay = net - pg - sf - pfGross + bBoost + bDisc;
  const sellerPayout = sfTotal - wht + sampleRefundCash;
  const platformPg = pfGross - bBoost - bDisc + pg;
  const r = Math.round;
  return {
    gross: r(gross),
    refunds: r(refunds),
    net: r(net),
    sampleNet: r(sampleNet),
    base: r(base),
    pg: r(pg),
    sf: r(sf),
    gBonus: r(gBonus),
    boost: r(boost),
    refReward: r(refReward),
    bBoost: r(bBoost),
    bReward: r(bReward),
    bDisc: r(bDisc),
    pfGross: r(pfGross),
    costs: r(costs),
    pf: r(pf),
    vat: r(vat),
    pfNet: r(pfNet),
    sfTotal: r(sfTotal),
    wht: r(wht),
    sampleRefundCel,
    sampleRefundCash: r(sampleRefundCash),
    sampleCelCover: Math.max(0, Math.round(n(input.sampleCel))) * sampleCelWon,
    brandPay: r(brandPay),
    sellerPayout: r(sellerPayout),
    platformPg: r(platformPg),
  };
}

/* ---------------- 보류 판정 (admin_payout_hold_reason) ---------------- */

export type SellerHoldInput = {
  hasBankInfo: boolean;
  settleType: string | null | undefined;
  hasRrn: boolean;
  /** 사업자: 사업자번호 + 세금계산서 정보(company) */
  hasBizNo?: boolean;
  hasTaxInfo?: boolean;
};

/** 인플루언서 지급 보류 — 계좌 → (사업자면 세금계산서 정보 · 개인이면 주민번호) 순. 없으면 null */
export function sellerHoldReason(s: SellerHoldInput): HoldCode | null {
  if (!s.hasBankInfo) return "BANK_MISSING";
  if (s.settleType === "biz") return s.hasBizNo && s.hasTaxInfo ? null : "TAX_INFO_MISSING";
  return s.hasRrn ? null : "RRN_MISSING";
}

/** 브랜드 지급 보류 — 은행·계좌·예금주·사업자등록번호 4개 (0019 brand_settle_info_complete) */
export function brandHoldReason(b: { settleInfoComplete: boolean }): HoldCode | null {
  return b.settleInfoComplete ? null : "SETTLE_INFO_INCOMPLETE";
}

/* ---------------- RPC jsonb → 타입 ---------------- */

type J = Record<string, unknown>;
const obj = (v: unknown): J | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown, d = 0): number => n(v, d);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const bool = (v: unknown): boolean => v === true;
const boolOrNull = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

export type HoldInfo = { code: string; label: string };
function parseHold(v: unknown): HoldInfo | null {
  const o = obj(v);
  if (!o) return null;
  const code = str(o.code) ?? "MANUAL";
  return { code, label: str(o.label) ?? holdLabel(code) ?? code };
}

export type PayoutStatus = "pending" | "held" | "paid";
export type SettlementStatus = PayoutStatus;
const payoutStatus = (v: unknown): PayoutStatus => (v === "held" || v === "paid" ? v : "pending");

export type PayoutView = {
  id: string;
  payee_type: "seller" | "brand";
  status: PayoutStatus;
  amount: number;
  wht: number;
  hold_code: string | null;
  hold_reason: string | null;
  bank_snapshot: { bank: string | null; account_masked: string | null; holder: string | null } | null;
  paid_at: string | null;
  memo: string | null;
  created_at: string | null;
};

export function parsePayout(raw: unknown): PayoutView | null {
  const o = obj(raw);
  if (!o || typeof o.id !== "string") return null;
  const bs = obj(o.bank_snapshot);
  return {
    id: o.id,
    payee_type: o.payee_type === "brand" ? "brand" : "seller",
    status: payoutStatus(o.status),
    amount: num(o.amount),
    wht: num(o.wht),
    hold_code: str(o.hold_code),
    hold_reason: str(o.hold_reason),
    bank_snapshot: bs ? { bank: str(bs.bank), account_masked: str(bs.account_masked), holder: str(bs.holder) } : null,
    paid_at: str(o.paid_at),
    memo: str(o.memo),
    created_at: str(o.created_at),
  };
}

export type SettlePartySeller = {
  id: string;
  code: string | null;
  name: string;
  handle: string | null;
  grade: string | null;
  settle_type: string | null;
  has_bank_info: boolean | null;
  has_rrn: boolean | null;
};
export type SettlePartyBrand = { id: string; code: string | null; name: string; grade: string | null; settle_info_complete: boolean | null };
export type SettleProduct = { id: string; code: string | null; name: string; emoji: string; thumb_url: string | null; sample_refund: boolean | null };

/**
 * 0020 app_admin_settle_preview 결과 — source 'live'(LIVE·CLEARING 실시간) | 'snapshot'(SETTLED 스냅샷) | 'none'(스냅샷 없는 SETTLED — 시드 c6)
 * 금액 키는 settlements 컬럼명. 'none' 이면 금액은 전부 0 · settlement null.
 */
export type SettlePreview = {
  source: "live" | "snapshot" | "none";
  settlement_id: string | null;
  campaign_id: string;
  campaign_code: string;
  campaign_status: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  due_on: string | null;
  seller: SettlePartySeller | null;
  brand: SettlePartyBrand | null;
  product: SettleProduct | null;
  paid_count: number;
  refund_count: number;
  gross: number;
  refunds: number;
  partial_refunds: number;
  net: number;
  sample_net: number;
  pg_rate: number;
  platform_rate: number;
  seller_rate: number;
  seller_grade: string | null;
  seller_bonus_pp: number;
  brand_grade: string | null;
  brand_discount_rate: number;
  wht_rate: number;
  ref_boost_applied: boolean;
  brand_ref_applied: boolean;
  ref_boost_rate: number;
  ref_reward_rate: number;
  brand_ref_disc_rate: number;
  brand_ref_reward_rate: number;
  pg_fee: number;
  seller_fee: number;
  seller_bonus: number;
  ref_boost: number;
  ref_reward: number;
  brand_ref_boost: number;
  brand_ref_reward: number;
  brand_discount: number;
  platform_fee_gross: number;
  costs: number;
  platform_fee: number;
  vat: number;
  platform_net: number;
  seller_fee_total: number;
  seller_wht: number;
  sample_refund_cel: number;
  sample_refund_cash: number;
  sample_cel_cover: number;
  brand_payout: number;
  seller_payout: number;
  hold_seller: boolean;
  hold_brand: boolean;
  holds: { seller: HoldInfo | null; brand: HoldInfo | null };
  settlement: { id: string; status: SettlementStatus; settled_at: string | null; paid_at: string | null; memo: string | null } | null;
  payouts: { seller: PayoutView | null; brand: PayoutView | null };
  eligible: boolean;
  reason: string | null;
};

function parseSeller(v: unknown): SettlePartySeller | null {
  const o = obj(v);
  if (!o || typeof o.id !== "string") return null;
  return {
    id: o.id,
    code: str(o.code),
    name: str(o.name) ?? "",
    handle: str(o.handle),
    grade: str(o.grade),
    settle_type: str(o.settle_type),
    has_bank_info: boolOrNull(o.has_bank_info),
    has_rrn: boolOrNull(o.has_rrn),
  };
}
function parseBrand(v: unknown): SettlePartyBrand | null {
  const o = obj(v);
  if (!o || typeof o.id !== "string") return null;
  return { id: o.id, code: str(o.code), name: str(o.name) ?? "", grade: str(o.grade), settle_info_complete: boolOrNull(o.settle_info_complete) };
}
function parseProduct(v: unknown): SettleProduct | null {
  const o = obj(v);
  if (!o || typeof o.id !== "string") return null;
  return { id: o.id, code: str(o.code), name: str(o.name) ?? "", emoji: str(o.emoji) ?? "📦", thumb_url: str(o.thumb_url), sample_refund: boolOrNull(o.sample_refund) };
}

export function parseSettlePreview(raw: unknown): SettlePreview | null {
  const o = obj(raw);
  if (!o || o.ok !== true) return null;
  const source = o.source === "snapshot" ? "snapshot" : o.source === "none" ? "none" : "live";
  const holds = obj(o.holds) ?? {};
  const st = obj(o.settlement);
  const po = obj(o.payouts) ?? {};
  return {
    source,
    settlement_id: str(o.settlement_id),
    campaign_id: str(o.campaign_id) ?? "",
    campaign_code: str(o.campaign_code) ?? "",
    campaign_status: str(o.campaign_status) ?? "",
    title: str(o.title),
    start_date: str(o.start_date),
    end_date: str(o.end_date),
    due_on: str(o.due_on),
    seller: parseSeller(o.seller),
    brand: parseBrand(o.brand),
    product: parseProduct(o.product),
    paid_count: num(o.paid_count),
    refund_count: num(o.refund_count),
    gross: num(o.gross),
    refunds: num(o.refunds),
    partial_refunds: num(o.partial_refunds),
    net: num(o.net),
    sample_net: num(o.sample_net),
    pg_rate: num(o.pg_rate, PG_RATE),
    platform_rate: num(o.platform_rate, PLAT_RATE),
    seller_rate: num(o.seller_rate),
    seller_grade: str(o.seller_grade),
    seller_bonus_pp: num(o.seller_bonus_pp),
    brand_grade: str(o.brand_grade),
    brand_discount_rate: num(o.brand_discount_rate),
    wht_rate: num(o.wht_rate),
    ref_boost_applied: bool(o.ref_boost_applied),
    brand_ref_applied: bool(o.brand_ref_applied),
    ref_boost_rate: num(o.ref_boost_rate),
    ref_reward_rate: num(o.ref_reward_rate),
    brand_ref_disc_rate: num(o.brand_ref_disc_rate),
    brand_ref_reward_rate: num(o.brand_ref_reward_rate),
    pg_fee: num(o.pg_fee),
    seller_fee: num(o.seller_fee),
    seller_bonus: num(o.seller_bonus),
    ref_boost: num(o.ref_boost),
    ref_reward: num(o.ref_reward),
    brand_ref_boost: num(o.brand_ref_boost),
    brand_ref_reward: num(o.brand_ref_reward),
    brand_discount: num(o.brand_discount),
    platform_fee_gross: num(o.platform_fee_gross),
    costs: num(o.costs),
    platform_fee: num(o.platform_fee),
    vat: num(o.vat),
    platform_net: num(o.platform_net),
    seller_fee_total: num(o.seller_fee_total),
    seller_wht: num(o.seller_wht),
    sample_refund_cel: num(o.sample_refund_cel),
    sample_refund_cash: num(o.sample_refund_cash),
    sample_cel_cover: num(o.sample_cel_cover),
    brand_payout: num(o.brand_payout),
    seller_payout: num(o.seller_payout),
    hold_seller: bool(o.hold_seller),
    hold_brand: bool(o.hold_brand),
    holds: { seller: parseHold(holds.seller), brand: parseHold(holds.brand) },
    settlement: st && typeof st.id === "string" ? { id: st.id, status: payoutStatus(st.status), settled_at: str(st.settled_at), paid_at: str(st.paid_at), memo: str(st.memo) } : null,
    payouts: { seller: parsePayout(po.seller), brand: parsePayout(po.brand) },
    eligible: bool(o.eligible),
    reason: str(o.reason),
  };
}

/** 0020 app_admin_settle_run */
export type SettleRunResult =
  | {
      ok: true;
      already: false;
      forced: boolean;
      settlement_id: string;
      campaign_code: string;
      net: number;
      seller_fee_total: number;
      seller_wht: number;
      seller_payout: number;
      brand_payout: number;
      platform_fee: number;
      platform_net: number;
      holds: { seller: HoldInfo | null; brand: HoldInfo | null };
      payouts: { seller: PayoutView | null; brand: PayoutView | null };
      celery: { sample_refund_cel: number; sample_refund_cash: number; seller_earned: number; brand_earned: number };
      referral: { seller_reward: number; brand_reward: number };
      grades: {
        seller: { previous_grade: string | null; grade: string | null; previous_m3_sales: number; m3_sales: number; changed: boolean } | null;
        brand: { previous: string | null; grade: string | null; gmv: number; changed: boolean } | null;
      };
      settled_at: string | null;
      due_on: string | null;
    }
  | { ok: true; already: true; settlement_id: string | null; campaign_code: string }
  | { ok: false; code: string; status?: string | null; due_on?: string | null };

export function parseSettleRunResult(raw: unknown): SettleRunResult {
  const o = obj(raw);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok !== true) return { ok: false, code: str(o.code) ?? "DB_ERROR", status: str(o.status), due_on: str(o.due_on) };
  if (o.already === true) return { ok: true, already: true, settlement_id: str(o.settlement_id), campaign_code: str(o.campaign_code) ?? "" };
  const holds = obj(o.holds) ?? {};
  const po = obj(o.payouts) ?? {};
  const cel = obj(o.celery) ?? {};
  const ref = obj(o.referral) ?? {};
  const g = obj(o.grades) ?? {};
  const gs = obj(g.seller);
  const gb = obj(g.brand);
  return {
    ok: true,
    already: false,
    forced: bool(o.forced),
    settlement_id: str(o.settlement_id) ?? "",
    campaign_code: str(o.campaign_code) ?? "",
    net: num(o.net),
    seller_fee_total: num(o.seller_fee_total),
    seller_wht: num(o.seller_wht),
    seller_payout: num(o.seller_payout),
    brand_payout: num(o.brand_payout),
    platform_fee: num(o.platform_fee),
    platform_net: num(o.platform_net),
    holds: { seller: parseHold(holds.seller), brand: parseHold(holds.brand) },
    payouts: { seller: parsePayout(po.seller), brand: parsePayout(po.brand) },
    celery: { sample_refund_cel: num(cel.sample_refund_cel), sample_refund_cash: num(cel.sample_refund_cash), seller_earned: num(cel.seller_earned), brand_earned: num(cel.brand_earned) },
    referral: { seller_reward: num(ref.seller_reward), brand_reward: num(ref.brand_reward) },
    grades: {
      seller: gs ? { previous_grade: str(gs.previous_grade), grade: str(gs.grade), previous_m3_sales: num(gs.previous_m3_sales), m3_sales: num(gs.m3_sales), changed: bool(gs.changed) } : null,
      brand: gb ? { previous: str(gb.previous), grade: str(gb.grade), gmv: num(gb.gmv), changed: bool(gb.changed) } : null,
    },
    settled_at: str(o.settled_at),
    due_on: str(o.due_on),
  };
}

export type SettleRunDueResult = { ok: true; today: string; count: number; settled: number; failed: number; results: (SettleRunResult & { campaign_code: string })[] } | { ok: false; code: string };

export function parseSettleRunDueResult(raw: unknown): SettleRunDueResult {
  const o = obj(raw);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok !== true) return { ok: false, code: str(o.code) ?? "DB_ERROR" };
  return {
    ok: true,
    today: str(o.today) ?? "",
    count: num(o.count),
    settled: num(o.settled),
    failed: num(o.failed),
    results: arr(o.results).map((x) => {
      const r = parseSettleRunResult(x);
      const code = str(obj(x)?.campaign_code) ?? ("campaign_code" in r ? r.campaign_code : "");
      return { ...r, campaign_code: code } as SettleRunResult & { campaign_code: string };
    }),
  };
}

/** 0020 app_admin_settlements — 대기 큐(CLEARING · live 요약) + 스냅샷 표 + 카운트 */
export type SettleQueueRow = {
  campaign_id: string;
  campaign_code: string;
  title: string | null;
  seller: SettlePartySeller | null;
  brand: SettlePartyBrand | null;
  product: SettleProduct | null;
  start_date: string | null;
  end_date: string | null;
  due_on: string | null;
  eligible: boolean;
  reason: string | null;
  paid_count: number;
  refund_count: number;
  net: number;
  brand_payout: number;
  seller_fee_total: number;
  seller_wht: number;
  seller_payout: number;
  platform_fee: number;
  platform_net: number;
  hold_seller: boolean;
  hold_brand: boolean;
  holds: { seller: HoldInfo | null; brand: HoldInfo | null };
};

export type AdminSettlements = {
  today: string;
  status: SettlementStatus | null;
  queue: SettleQueueRow[];
  rows: SettlePreview[];
  counts: { due_now: number; clearing: number; pending: number; held: number; paid: number; payouts_pending: number; payouts_held: number; payouts_pending_amount: number };
};

export function parseAdminSettlements(raw: unknown): AdminSettlements | null {
  const o = obj(raw);
  if (!o || o.ok !== true) return null;
  const c = obj(o.counts) ?? {};
  const st = str(o.status);
  return {
    today: str(o.today) ?? "",
    status: st === "pending" || st === "held" || st === "paid" ? st : null,
    queue: arr(o.queue)
      .map((x) => {
        const q = obj(x);
        if (!q) return null;
        const holds = obj(q.holds) ?? {};
        return {
          campaign_id: str(q.campaign_id) ?? "",
          campaign_code: str(q.campaign_code) ?? "",
          title: str(q.title),
          seller: parseSeller(q.seller),
          brand: parseBrand(q.brand),
          product: parseProduct(q.product),
          start_date: str(q.start_date),
          end_date: str(q.end_date),
          due_on: str(q.due_on),
          eligible: bool(q.eligible),
          reason: str(q.reason),
          paid_count: num(q.paid_count),
          refund_count: num(q.refund_count),
          net: num(q.net),
          brand_payout: num(q.brand_payout),
          seller_fee_total: num(q.seller_fee_total),
          seller_wht: num(q.seller_wht),
          seller_payout: num(q.seller_payout),
          platform_fee: num(q.platform_fee),
          platform_net: num(q.platform_net),
          hold_seller: bool(q.hold_seller),
          hold_brand: bool(q.hold_brand),
          holds: { seller: parseHold(holds.seller), brand: parseHold(holds.brand) },
        } satisfies SettleQueueRow;
      })
      .filter((x): x is SettleQueueRow => x !== null),
    rows: arr(o.rows)
      .map((x) => parseSettlePreview({ ok: true, ...(obj(x) ?? {}) }))
      .filter((x): x is SettlePreview => x !== null),
    counts: {
      due_now: num(c.due_now),
      clearing: num(c.clearing),
      pending: num(c.pending),
      held: num(c.held),
      paid: num(c.paid),
      payouts_pending: num(c.payouts_pending),
      payouts_held: num(c.payouts_held),
      payouts_pending_amount: num(c.payouts_pending_amount),
    },
  };
}

/** app_admin_payout_mark_paid · _hold · _release */
export type PayoutActionResult =
  | { ok: true; already: boolean; payout: PayoutView | null; settlement_status: SettlementStatus | null }
  | { ok: false; code: string; hold_code?: string | null; label?: string | null };

export function parsePayoutActionResult(raw: unknown): PayoutActionResult {
  const o = obj(raw);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok !== true) return { ok: false, code: str(o.code) ?? "DB_ERROR", hold_code: str(o.hold_code), label: str(o.label) };
  const ss = str(o.settlement_status);
  return { ok: true, already: bool(o.already), payout: parsePayout(o.payout), settlement_status: ss === "pending" || ss === "held" || ss === "paid" ? ss : null };
}

/** app_admin_payout_export — 계좌 원문 행 (콘솔 화면에 싣지 않는다 · CSV 다운로드 응답 전용) */
export type PayoutExportRow = {
  payout_id: string;
  settlement_id: string;
  campaign_code: string;
  title: string | null;
  payee_type: "seller" | "brand";
  payee_code: string | null;
  payee_name: string | null;
  settle_type: string | null;
  bank: string | null;
  account: string | null;
  holder: string | null;
  biz_no: string | null;
  amount: number;
  wht: number;
  status: PayoutStatus;
  hold_code: string | null;
  due_on: string | null;
  settled_at: string | null;
  paid_at: string | null;
  memo: string | null;
};

export type PayoutExport = { ok: true; status: string; count: number; logged: number; rows: PayoutExportRow[] } | { ok: false; code: string };

export function parsePayoutExport(raw: unknown): PayoutExport {
  const o = obj(raw);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok !== true) return { ok: false, code: str(o.code) ?? "DB_ERROR" };
  return {
    ok: true,
    status: str(o.status) ?? "pending",
    count: num(o.count),
    logged: num(o.logged),
    rows: arr(o.rows)
      .map((x) => {
        const r = obj(x);
        if (!r) return null;
        return {
          payout_id: str(r.payout_id) ?? "",
          settlement_id: str(r.settlement_id) ?? "",
          campaign_code: str(r.campaign_code) ?? "",
          title: str(r.title),
          payee_type: r.payee_type === "brand" ? "brand" : "seller",
          payee_code: str(r.payee_code),
          payee_name: str(r.payee_name),
          settle_type: str(r.settle_type),
          bank: str(r.bank),
          account: str(r.account),
          holder: str(r.holder),
          biz_no: str(r.biz_no),
          amount: num(r.amount),
          wht: num(r.wht),
          status: payoutStatus(r.status),
          hold_code: str(r.hold_code),
          due_on: str(r.due_on),
          settled_at: str(r.settled_at),
          paid_at: str(r.paid_at),
          memo: str(r.memo),
        } satisfies PayoutExportRow;
      })
      .filter((x): x is PayoutExportRow => x !== null),
  };
}

/** app_admin_rrn_export — 지급명세서 자료 (주민번호 원문 · 개인만) */
export type RrnExportRow = {
  settlement_id: string;
  campaign_code: string;
  seller_code: string | null;
  seller_name: string | null;
  settle_type: string | null;
  rrn: string | null;
  code: string | null;
  seller_fee_total: number;
  seller_wht: number;
  seller_payout: number;
  settled_at: string | null;
};

export type RrnExport = { ok: true; count: number; rows: RrnExportRow[] } | { ok: false; code: string };

export function parseRrnExport(raw: unknown): RrnExport {
  const o = obj(raw);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok !== true) return { ok: false, code: str(o.code) ?? "DB_ERROR" };
  return {
    ok: true,
    count: num(o.count),
    rows: arr(o.rows)
      .map((x) => {
        const r = obj(x);
        if (!r) return null;
        return {
          settlement_id: str(r.settlement_id) ?? "",
          campaign_code: str(r.campaign_code) ?? "",
          seller_code: str(r.seller_code),
          seller_name: str(r.seller_name),
          settle_type: str(r.settle_type),
          rrn: str(r.rrn),
          code: str(r.code),
          seller_fee_total: num(r.seller_fee_total),
          seller_wht: num(r.seller_wht),
          seller_payout: num(r.seller_payout),
          settled_at: str(r.settled_at),
        } satisfies RrnExportRow;
      })
      .filter((x): x is RrnExportRow => x !== null),
  };
}

/** app_admin_payments_health */
export type PaymentsHealth = {
  now: string;
  checkout_sessions: { pending: number; confirming: number; stale_confirming: number; expired_due: number; cancel_pending: number; confirmed_24h: number };
  payment_events: { unhandled: number; unhandled_oldest: string | null; last_received_at: string | null; errors_7d: number };
  partner_payments: { pending: number; confirming: number; cancel_pending: number; refunded: number };
  orders: { paid: number; paid_without_key: number; partial_refund: number; canceled_adjust: number; refund_needs_adjust: number; refund_after_ship: number };
  settlements: { pending: number; held: number; paid: number; payouts_pending: number; payouts_held: number; due_now: number };
  reconcile: { last_at: string | null; last_result: string | null };
};

export function parsePaymentsHealth(raw: unknown): PaymentsHealth | null {
  const o = obj(raw);
  if (!o || o.ok !== true) return null;
  const cs = obj(o.checkout_sessions) ?? {};
  const pe = obj(o.payment_events) ?? {};
  const pp = obj(o.partner_payments) ?? {};
  const od = obj(o.orders) ?? {};
  const st = obj(o.settlements) ?? {};
  const rc = obj(o.reconcile) ?? {};
  return {
    now: str(o.now) ?? "",
    checkout_sessions: {
      pending: num(cs.pending),
      confirming: num(cs.confirming),
      stale_confirming: num(cs.stale_confirming),
      expired_due: num(cs.expired_due),
      cancel_pending: num(cs.cancel_pending),
      confirmed_24h: num(cs.confirmed_24h),
    },
    payment_events: { unhandled: num(pe.unhandled), unhandled_oldest: str(pe.unhandled_oldest), last_received_at: str(pe.last_received_at), errors_7d: num(pe.errors_7d) },
    partner_payments: { pending: num(pp.pending), confirming: num(pp.confirming), cancel_pending: num(pp.cancel_pending), refunded: num(pp.refunded) },
    orders: {
      paid: num(od.paid),
      paid_without_key: num(od.paid_without_key),
      partial_refund: num(od.partial_refund),
      canceled_adjust: num(od.canceled_adjust),
      refund_needs_adjust: num(od.refund_needs_adjust),
      refund_after_ship: num(od.refund_after_ship),
    },
    settlements: { pending: num(st.pending), held: num(st.held), paid: num(st.paid), payouts_pending: num(st.payouts_pending), payouts_held: num(st.payouts_held), due_now: num(st.due_now) },
    reconcile: { last_at: str(rc.last_at), last_result: str(rc.last_result) },
  };
}

/** 운영 큐가 비어 있는가 — 카드 색 결정용 */
export function paymentsHealthIssues(h: PaymentsHealth): { key: string; label: string; count: number }[] {
  const out: { key: string; label: string; count: number }[] = [];
  const push = (key: string, label: string, count: number) => {
    if (count > 0) out.push({ key, label, count });
  };
  push("stale_confirming", "승인 확인 중 2분 초과 세션", h.checkout_sessions.stale_confirming);
  push("cancel_pending", "토스 취소 실패(재시도 대기) 세션", h.checkout_sessions.cancel_pending);
  push("unhandled_events", "미처리 결제 이벤트", h.payment_events.unhandled);
  push("partner_confirming", "샘플 결제 승인 확인 중", h.partner_payments.confirming);
  push("partner_cancel_pending", "샘플 결제 취소 실패", h.partner_payments.cancel_pending);
  push("partial_refund", "부분취소 주문(정산 수동 확인)", h.orders.partial_refund);
  push("refund_needs_adjust", "정산 후 환불 조정 큐", h.orders.refund_needs_adjust);
  push("due_now", "정산 기준일 도래", h.settlements.due_now);
  push("payouts_held", "지급 보류", h.settlements.payouts_held);
  return out;
}

/** app_admin_orders — 브랜드 주문 행 + 브랜드 · 결제 키 */
export type AdminOrderRow = BrandOrderRow & {
  brand: { id: string; code: string | null; name: string } | null;
  /** 인플루언서 샘플 구매 주문 (0018 brand_order_json is_sample — 브랜드 표는 제외하지만 관리자 표는 포함) */
  is_sample: boolean;
  has_payment_key: boolean;
  payment_key: string | null;
  checkout_session_id: string | null;
  user_id: string | null;
  created_at: string | null;
};

export const ADMIN_ORDER_FILTERS = ["all", "paid", "unshipped", "shipped", "refunded", "sample", "manual", "partial"] as const;
export type AdminOrderFilter = (typeof ADMIN_ORDER_FILTERS)[number];
export const ADMIN_ORDER_FILTER_LABEL: Record<AdminOrderFilter, string> = {
  all: "전체",
  paid: "결제완료",
  unshipped: "미발송",
  shipped: "발송",
  refunded: "환불·취소",
  sample: "샘플 구매",
  manual: "결제키 없음(시드·수기)",
  partial: "부분취소",
};
export function isAdminOrderFilter(v: unknown): v is AdminOrderFilter {
  return typeof v === "string" && (ADMIN_ORDER_FILTERS as readonly string[]).includes(v);
}

export type AdminOrders = {
  filter: AdminOrderFilter;
  q: string | null;
  rows: AdminOrderRow[];
  totals: { count: number; paid: number; unshipped: number; shipped: number; refunded: number; sample: number; manual: number; partial: number; paid_amount: number; refund_amount: number };
};

export function parseAdminOrderRow(json: unknown): AdminOrderRow | null {
  const base = parseBrandOrderRow(json);
  const o = obj(json);
  if (!base || !o) return null;
  const b = obj(o.brand);
  return {
    ...base,
    brand: b && typeof b.id === "string" ? { id: b.id, code: str(b.code), name: str(b.name) ?? "" } : null,
    is_sample: bool(o.is_sample),
    has_payment_key: bool(o.has_payment_key),
    payment_key: str(o.payment_key),
    checkout_session_id: str(o.checkout_session_id),
    user_id: str(o.user_id),
    created_at: str(o.created_at),
  };
}

export function parseAdminOrders(raw: unknown): AdminOrders | null {
  const o = obj(raw);
  if (!o || o.ok !== true) return null;
  const t = obj(o.totals) ?? {};
  const f = str(o.filter);
  return {
    filter: isAdminOrderFilter(f) ? f : "all",
    q: str(o.q),
    rows: arr(o.rows)
      .map(parseAdminOrderRow)
      .filter((x): x is AdminOrderRow => x !== null),
    totals: {
      count: num(t.count),
      paid: num(t.paid),
      unshipped: num(t.unshipped),
      shipped: num(t.shipped),
      refunded: num(t.refunded),
      sample: num(t.sample),
      manual: num(t.manual),
      partial: num(t.partial),
      paid_amount: num(t.paid_amount),
      refund_amount: num(t.refund_amount),
    },
  };
}

export type AdminOrderDetail = {
  order: AdminOrderRow & { payment_status: string | null; refund_reason: string | null };
  session: {
    id: string;
    toss_order_id: string | null;
    status: string | null;
    amount: number;
    payment_key: string | null;
    payment_method: string | null;
    approved_at: string | null;
    fail_code: string | null;
    fail_message: string | null;
    expires_at: string | null;
    created_at: string | null;
  } | null;
  payment_events: { id: string; source: string | null; event_type: string | null; handled: boolean; result: string | null; received_at: string | null }[];
  campaign_events: { id: string; event_type: string | null; body: string; payload: J; created_at: string | null }[];
  cs: unknown[];
};

export function parseAdminOrder(raw: unknown): AdminOrderDetail | null {
  const o = obj(raw);
  if (!o || o.ok !== true) return null;
  const ord = parseAdminOrderRow(o.order);
  if (!ord) return null;
  const oo = obj(o.order) ?? {};
  const s = obj(o.session);
  return {
    order: { ...ord, payment_status: str(oo.payment_status), refund_reason: str(oo.refund_reason) },
    session:
      s && typeof s.id === "string"
        ? {
            id: s.id,
            toss_order_id: str(s.toss_order_id),
            status: str(s.status),
            amount: num(s.amount),
            payment_key: str(s.payment_key),
            payment_method: str(s.payment_method),
            approved_at: str(s.approved_at),
            fail_code: str(s.fail_code),
            fail_message: str(s.fail_message),
            expires_at: str(s.expires_at),
            created_at: str(s.created_at),
          }
        : null,
    payment_events: arr(o.payment_events)
      .map((x) => {
        const e = obj(x);
        return e && typeof e.id === "string" ? { id: e.id, source: str(e.source), event_type: str(e.event_type), handled: bool(e.handled), result: str(e.result), received_at: str(e.received_at) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    campaign_events: arr(o.campaign_events)
      .map((x) => {
        const e = obj(x);
        return e && typeof e.id === "string" ? { id: e.id, event_type: str(e.event_type), body: str(e.body) ?? "", payload: obj(e.payload) ?? {}, created_at: str(e.created_at) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    cs: arr(o.cs),
  };
}

/* ---------------- CSV (BOM + CRLF · 엑셀) ---------------- */

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export const PAYOUT_CSV_HEADER = ["지급ID", "정산ID", "캠페인", "제목", "대상", "코드", "이름", "정산유형", "은행", "계좌번호", "예금주", "사업자번호", "지급액", "원천징수", "상태", "보류사유", "기준일", "정산일", "지급일", "메모"] as const;

/** 이체 파일 — 계좌 원문 포함(다운로드 전용 · 화면 표시 금지). 계좌번호는 엑셀이 숫자로 뭉개지 않게 `="…"` 로 감싼다. */
export function payoutCsv(rows: readonly PayoutExportRow[]): string {
  return toCsv(
    PAYOUT_CSV_HEADER,
    rows.map((r) => [
      r.payout_id,
      r.settlement_id,
      r.campaign_code,
      r.title,
      r.payee_type === "seller" ? "인플루언서" : "브랜드",
      r.payee_code,
      r.payee_name,
      r.settle_type === "biz" ? "사업자" : r.settle_type === "personal" ? "개인" : "",
      r.bank,
      r.account ? `="${r.account}"` : "",
      r.holder,
      r.biz_no,
      r.amount,
      r.wht,
      payoutStatusChip(r.status).label,
      holdLabel(r.hold_code) ?? "",
      r.due_on,
      r.settled_at ? r.settled_at.slice(0, 10) : "",
      r.paid_at ? r.paid_at.slice(0, 10) : "",
      r.memo,
    ]),
  );
}

export const RRN_CSV_HEADER = ["정산ID", "캠페인", "인플루언서코드", "이름", "정산유형", "주민등록번호", "비고", "수수료합계(세전)", "원천징수", "실수령", "정산일"] as const;

export function rrnCsv(rows: readonly RrnExportRow[]): string {
  return toCsv(
    RRN_CSV_HEADER,
    rows.map((r) => [
      r.settlement_id,
      r.campaign_code,
      r.seller_code,
      r.seller_name,
      r.settle_type === "biz" ? "사업자" : "개인",
      r.rrn ? `="${r.rrn}"` : "",
      r.code === "BIZ" ? "사업자(세금계산서)" : r.code === "NO_RRN" ? "미등록" : (r.code ?? ""),
      r.seller_fee_total,
      r.seller_wht,
      r.seller_payout,
      r.settled_at ? r.settled_at.slice(0, 10) : "",
    ]),
  );
}

/* ---------------- 문구 ---------------- */

export function payoutStatusChip(status: PayoutStatus | string): { label: string; tone: StatusTone } {
  if (status === "paid") return { label: "지급 완료", tone: "green" };
  if (status === "held") return { label: "지급 보류", tone: "red" };
  return { label: "지급 대기", tone: "blue" };
}

export function settlementStatusChip(status: SettlementStatus | string | null): { label: string; tone: StatusTone } {
  if (status === "paid") return { label: "지급 완료", tone: "green" };
  if (status === "held") return { label: "일부 보류", tone: "red" };
  if (status === "pending") return { label: "지급 대기", tone: "blue" };
  return { label: "명세 준비 중", tone: "gray" };
}

/** 대기 큐 한 줄 — 프로토타입 vAdminSettle "확정 ₩net → 브랜드 ₩brandPay + 인플루언서 ₩sellerPayout · 정산 기준일 …" */
export function settleQueueLine(q: Pick<SettleQueueRow, "net" | "brand_payout" | "seller_payout" | "due_on" | "eligible">): string {
  const due = q.due_on ? `정산 기준일 ${md(q.due_on)}${q.eligible ? " · 실행 가능" : ""}` : "기준일 미정";
  return `확정 ₩${fmtNum(q.net)} → 브랜드 ₩${fmtNum(q.brand_payout)} + 인플루언서 ₩${fmtNum(q.seller_payout)} · ${due}`;
}

/** 정산 실행 결과 한 줄 (토스트 · 스크립트 stdout) */
export function settleRunSummary(r: SettleRunResult): string {
  if (!r.ok) return adminSettleFailMessage(r.code) + (r.code === "NOT_DUE" && r.due_on ? ` (기준일 ${md(r.due_on)})` : "");
  if (r.already) return `${r.campaign_code}: 이미 정산 완료`;
  const holds = [r.holds.seller ? `인플루언서 보류(${r.holds.seller.label})` : "", r.holds.brand ? `브랜드 보류(${r.holds.brand.label})` : ""].filter(Boolean).join(" · ");
  return `${r.campaign_code}: 확정 ₩${fmtNum(r.net)} → 브랜드 ₩${fmtNum(r.brand_payout)} · 인플루언서 ₩${fmtNum(r.seller_payout)}(세전 ₩${fmtNum(r.seller_fee_total)} − 원천징수 ₩${fmtNum(r.seller_wht)})`
    + (holds ? ` · ${holds}` : "")
    + (r.celery.seller_earned || r.celery.brand_earned ? ` · 🥬 획득 인플 ${r.celery.seller_earned} / 브랜드 ${r.celery.brand_earned}` : "")
    + (r.celery.sample_refund_cel || r.celery.sample_refund_cash ? ` · 샘플 환급 🥬${r.celery.sample_refund_cel} + ₩${fmtNum(r.celery.sample_refund_cash)}` : "")
    + (r.referral.seller_reward || r.referral.brand_reward ? ` · 추천 보상 ₩${fmtNum(r.referral.seller_reward)} / 브랜드 ₩${fmtNum(r.referral.brand_reward)}` : "")
    + (r.grades.seller?.changed ? ` · 인플 등급 ${r.grades.seller.previous_grade ?? "-"} → ${r.grades.seller.grade}` : "")
    + (r.grades.brand?.changed ? ` · 브랜드 등급 ${r.grades.brand.previous ?? "-"} → ${r.grades.brand.grade}` : "")
    + (r.forced ? " · 기준일 전 강제 실행" : "");
}

/** 정산 기준일까지 남은 날 표시 — "D-3" · "오늘" · "D+2(경과)" */
export function dueLabel(dueOn: string | null, today: string): string {
  if (!dueOn) return "기준일 미정";
  const a = new Date(`${dueOn}T00:00:00Z`).getTime();
  const b = new Date(`${today}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return dueOn;
  const d = Math.round((a - b) / 86400000);
  if (d === 0) return `오늘 (${md(dueOn)})`;
  return d > 0 ? `D-${d} (${md(dueOn)})` : `D+${-d} 경과 (${md(dueOn)})`;
}

export const CLEAR_DAYS_DEFAULT = CLEAR_DAYS;
