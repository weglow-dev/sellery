/**
 * 매출 · 정산 규칙 — 순수 모듈 (브라우저 `.svelte` 와 서버 양쪽에서 import). DB 호출은 `../server/partner/{sales,settle}.server.ts`.
 *
 * 숫자의 정답은 `packages/core/src/constants.ts`(PG_RATE · PLAT_RATE · WHT · CLEAR_DAYS · REF_BOOST · GRADES[].bonus · BANKS) 와
 * `packages/core/src/helpers.ts` `calc()` · `sellerWht()` · `settleDue()` 다. 여기는 그 중 **인플루언서에게 보이는 조각**만 TS 로 옮긴 것이고,
 * 0013 `app_seller_sales` · `app_seller_settlements` 가 같은 식을 SQL 로 계산한다 — 셋을 함께 고친다(docs/settlement-policy.md §3 · §7 · §11.2).
 *
 *   calcSellerShare({ net, sampleNet, rate, bonusPp, refBoost, whtRate })
 *     → { base, sf, gBonus, boost, sfTotal, wht, payout } — sf = (net − sampleNet) × rate · gBonus = (net − sampleNet) × bonusPp/100
 *       · boost = 추천 부스트면 net × REF_BOOST · sfTotal = sf + gBonus + boost · wht = sfTotal × whtRate · payout = sfTotal − wht.
 *       라인마다 독립 반올림(0004 반올림 계약 · JS Math.round). 브랜드 정산액·플랫폼 수수료는 여기 없다(인플루언서 화면에 나오지 않는다).
 *   sellerWhtRate(settleType)  'biz' → 0, 그 외(personal · null 미등록) → WHT (프로토타입 sellerWht — "항상 3.3%" 버그를 재현하지 않는다)
 *   settleDue(endDate)         종료일 + CLEAR_DAYS (YYYY-MM-DD)
 *   validateRrn · formatRrn · maskAccount · maskBizNo · BANKS · SETTLE_TYPES · parseSettleInfoInput — /settle 폼 (0013 app_set_settle_info 와 같은 조건)
 *   parseSettleInfo · parseSetSettleInfoResult · parseSellerSales · parseSellerSettlements — RPC jsonb 를 타입으로
 *   SETTLE_FAIL_MESSAGES · settlementStatusLabel · payoutLine — 화면 문구
 */
import { BANKS as CORE_BANKS, CLEAR_DAYS, REF_BOOST, WHT } from "@sellery/core/constants";
import { fmtNum } from "../campaign";
import { addDays, md } from "../dates";
import type { StatusTone } from "../order-status";
import { cleanText } from "../text";

/* ---------------- 상수 ---------------- */

/** 정산 계좌 은행 — core BANKS 에서 자리표시자 '선택' 을 뺀 목록 (0013 app_set_settle_info 의 v_banks 와 같은 값) */
export const BANKS: readonly string[] = CORE_BANKS.filter((b) => b !== "선택");

export const SETTLE_TYPES = ["personal", "biz"] as const;
export type SettleType = (typeof SETTLE_TYPES)[number];
export const SETTLE_TYPE_LABEL: Record<SettleType, string> = {
  personal: "개인 — 사업소득 원천징수 3.3% 공제",
  biz: "사업자 — 세금계산서 발행 (원천징수 없음)",
};

/** 0013 app_set_settle_info · app_set_seller_rrn 실패 코드 → 폼 문구 */
export const SETTLE_FAIL_MESSAGES: Record<string, string> = {
  BAD_TYPE: "정산 유형을 선택해주세요",
  BANK_REQUIRED: "은행을 선택해주세요",
  BAD_BANK: "목록에 있는 은행을 선택해주세요",
  BAD_ACCOUNT: "계좌번호는 숫자 8~16자리로 입력해주세요",
  HOLDER_REQUIRED: "예금주를 입력해주세요",
  BIZ_NO_REQUIRED: "사업자 정산은 사업자등록번호가 필요합니다",
  BAD_BIZ_NO: "사업자등록번호는 숫자 10자리(000-00-00000)로 입력해주세요",
  BAD_RRN: "주민등록번호 형식이 맞지 않아요 — 숫자 13자리를 확인해주세요",
  RRN_KEY_MISSING: "지금은 주민등록번호를 저장할 수 없어요 — 잠시 후 다시 시도해주세요 (설정 오류)",
  NOT_FOUND: "계정을 찾을 수 없어요 — 다시 로그인해주세요",
  BAD_FILE: "사업자등록증은 JPG · PNG · WebP · PDF, 10MB 이하로 올려주세요",
  DB_ERROR: "저장에 실패했어요 — 잠시 후 다시 시도해주세요",
};

/* ---------------- 계산 ---------------- */

export type SellerShareInput = {
  /** 확정 매출 = Σ(status≠CANCELED) − Σ(REFUNDED) (샘플 구매 주문 포함) */
  net: number;
  /** 인플루언서 본인 샘플 구매 주문 합 (PAID · is_sample) — 기본 수수료·등급 보너스에서 제외 */
  sampleNet?: number;
  /** 인플루언서 수수료율 (상품 commission_rate · 0.20) */
  rate: number;
  /** 등급 보너스 %p (GRADES[].bonus · 골드 1) */
  bonusPp?: number;
  /** 추천 부스트 적용(피추천 첫 5회) — net × REF_BOOST */
  refBoost?: boolean;
  /** 원천징수율 — sellerWhtRate(settleType). 기본 WHT */
  whtRate?: number;
};

export type SellerShare = {
  /** 수수료 기준액 = net − sampleNet */
  base: number;
  /** 기본 수수료 sf */
  sf: number;
  /** 등급 보너스 gBonus (플랫폼 부담) */
  gBonus: number;
  /** 추천 부스트 boost (플랫폼 부담) */
  boost: number;
  /** 세전 합계 sfTotal */
  sfTotal: number;
  /** 원천징수액 */
  wht: number;
  /** 실수령(예정) = sfTotal − wht — 샘플 환급 현금은 정산 실행 시 별도 가산(runSettle refundCash) */
  payout: number;
};

/** 프로토타입 `sellerWht(s)` — biz 만 0. 미등록(null) 도 3.3% */
export function sellerWhtRate(settleType: string | null | undefined): number {
  return settleType === "biz" ? 0 : WHT;
}

/** `calc()` 의 인플루언서 가시 라인 — 라인마다 독립 반올림 (저장값끼리 ±1원 어긋날 수 있음 · 0004 계약) */
export function calcSellerShare(input: SellerShareInput): SellerShare {
  const net = Number(input.net) || 0;
  const sampleNet = Number(input.sampleNet) || 0;
  const rate = Number(input.rate) || 0;
  const bonusPp = Number(input.bonusPp) || 0;
  const whtRate = input.whtRate === undefined ? WHT : Number(input.whtRate) || 0;
  const base = net - sampleNet;
  const sf = base * rate;
  const gBonus = (base * bonusPp) / 100;
  const boost = input.refBoost ? net * REF_BOOST : 0;
  const sfTotal = sf + gBonus + boost;
  const wht = sfTotal * whtRate;
  const payout = sfTotal - wht;
  return {
    base: Math.round(base),
    sf: Math.round(sf),
    gBonus: Math.round(gBonus),
    boost: Math.round(boost),
    sfTotal: Math.round(sfTotal),
    wht: Math.round(wht),
    payout: Math.round(payout),
  };
}

/** 정산 기준일 = 종료일 + CLEAR_DAYS (프로토타입 settleDue) */
export function settleDue(endDate: string, clearDays = CLEAR_DAYS): string {
  return addDays(endDate, clearDays);
}

/* ---------------- 입력 검증 · 마스킹 ---------------- */

/**
 * 주민등록번호 — 숫자 13자리 · 생년월일 유효 · 뒷자리 첫 숫자 1~8 · 검증숫자(가중치 2,3,4,5,6,7,8,9,2,3,4,5 · (11 − Σ mod 11) mod 10).
 * 0013 `partner_rrn_valid` 와 같은 규칙. 2020-10 이후 신규 부여분은 검증숫자 규칙이 없다(성인 인플루언서에게는 사실상 무관 — SQL 주석 참고).
 * 통과하면 숫자 13자리, 아니면 null.
 */
export function validateRrn(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length !== 13) return null;
  const g = Number(d[6]);
  if (g < 1 || g > 8) return null;
  const yy = Number(d.slice(0, 2));
  const mm = Number(d.slice(2, 4));
  const dd = Number(d.slice(4, 6));
  const century = g === 3 || g === 4 || g === 7 || g === 8 ? 2000 : 1900;
  const date = new Date(Date.UTC(century + yy, mm - 1, dd));
  if (date.getUTCFullYear() !== century + yy || date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) return null;
  const w = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d[i]) * w[i];
  return (11 - (s % 11)) % 10 === Number(d[12]) ? d : null;
}

/** '9001011234567' → '900101-1234567' (표시 전용 — 콘솔은 원문을 받지 않으므로 입력 에코에만) */
export function formatRrn(digits: string): string {
  const d = digits.replace(/\D/g, "");
  return d.length === 13 ? `${d.slice(0, 6)}-${d.slice(6)}` : d;
}

/** 계좌번호 뒤 4자리만 — '3333012345678' → '*********5678' (0013 partner_mask_account 와 동일) */
export function maskAccount(account: string | null | undefined): string | null {
  if (account === null || account === undefined) return null;
  const d = String(account).replace(/\D/g, "");
  if (d.length <= 4) return "*".repeat(d.length);
  return "*".repeat(d.length - 4) + d.slice(-4);
}

/** '512-21-00987' → '***-**-00987' (0013 partner_mask_biz_no 와 동일) */
export function maskBizNo(bizNo: string | null | undefined): string | null {
  if (bizNo === null || bizNo === undefined) return null;
  const d = String(bizNo).replace(/\D/g, "");
  if (/^\d{10}$/.test(d)) return `***-**-${d.slice(-5)}`;
  const s = String(bizNo);
  return "*".repeat(Math.max(s.length - 5, 0)) + s.slice(-Math.min(s.length, 5));
}

/** 사업자등록번호 → '000-00-00000' (숫자 10자리가 아니면 null) */
export function normalizeBizNo(raw: string | null | undefined): string | null {
  const d = String(raw ?? "").replace(/\D/g, "");
  return /^\d{10}$/.test(d) ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : null;
}

export type SettleInfoInput = {
  settle_type: SettleType;
  bank: { bank: string; account: string; holder: string };
  /** biz 만 — personal 이면 null */
  tax: { biz_no: string; company: string | null; ceo: string | null; biz_type: string | null; biz_item: string | null; email: string | null } | null;
};

export type SettleInfoInputError = {
  code: "BAD_TYPE" | "BANK_REQUIRED" | "BAD_BANK" | "BAD_ACCOUNT" | "HOLDER_REQUIRED" | "BIZ_NO_REQUIRED" | "BAD_BIZ_NO";
  field: "settle_type" | "bank" | "account" | "holder" | "biz_no";
};

/** /settle 폼(FormData 의 문자열) → RPC 입력. 0013 app_set_settle_info 와 같은 조건·순서 — 서버가 다시 검사하므로 문구 선반영용. */
export function parseSettleInfoInput(
  form: Record<string, FormDataEntryValue | string | null | undefined>,
): { ok: true; value: SettleInfoInput } | { ok: false; error: SettleInfoInputError } {
  const str = (k: string, max: number) => cleanText(typeof form[k] === "string" ? (form[k] as string) : "").slice(0, max);
  const settleType = str("settle_type", 10);
  if (settleType !== "personal" && settleType !== "biz") return { ok: false, error: { code: "BAD_TYPE", field: "settle_type" } };
  const bank = str("bank", 20);
  if (!bank || bank === "선택") return { ok: false, error: { code: "BANK_REQUIRED", field: "bank" } };
  if (!BANKS.includes(bank)) return { ok: false, error: { code: "BAD_BANK", field: "bank" } };
  const account = str("account", 40).replace(/\D/g, "");
  if (!/^\d{8,16}$/.test(account)) return { ok: false, error: { code: "BAD_ACCOUNT", field: "account" } };
  const holder = str("holder", 40);
  if (!holder) return { ok: false, error: { code: "HOLDER_REQUIRED", field: "holder" } };
  let tax: SettleInfoInput["tax"] = null;
  if (settleType === "biz") {
    const rawBiz = str("biz_no", 20);
    if (!rawBiz) return { ok: false, error: { code: "BIZ_NO_REQUIRED", field: "biz_no" } };
    const bizNo = normalizeBizNo(rawBiz);
    if (!bizNo) return { ok: false, error: { code: "BAD_BIZ_NO", field: "biz_no" } };
    tax = {
      biz_no: bizNo,
      company: str("company", 60) || null,
      ceo: str("ceo", 40) || null,
      biz_type: str("biz_type", 40) || null,
      biz_item: str("biz_item", 40) || null,
      email: str("tax_email", 120).toLowerCase() || null,
    };
  }
  return { ok: true, value: { settle_type: settleType, bank: { bank, account, holder }, tax } };
}

/* ---------------- RPC jsonb → 타입 ---------------- */

type J = Record<string, unknown>;
const obj = (v: unknown): J | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : null);
const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v, NaN)) as number | null;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const bool = (v: unknown): boolean => v === true;

/** 0013 app_seller_settle_info — 원문 없음 (계좌 뒤 4자리 · 사업자번호 뒤 5자리 · 주민번호 성별 자리) */
export type SettleInfoView = {
  settle_type: SettleType | null;
  has_bank_info: boolean;
  bank: string | null;
  holder: string | null;
  account_masked: string | null;
  has_tax_info: boolean;
  tax_info: { company: string | null; ceo: string | null; biz_type: string | null; biz_item: string | null; email: string | null } | null;
  biz_no_masked: string | null;
  has_biz_doc: boolean;
  has_rrn: boolean;
  rrn_mask: string | null;
  rrn_set_at: string | null;
  /** 이 계정에 적용되는 원천징수율 (biz 0 · 그 외 0.033) */
  wht_rate: number;
};

export function parseSettleInfo(raw: unknown): SettleInfoView | null {
  const o = obj(raw);
  if (!o || o.ok !== true) return null;
  const t = obj(o.tax_info);
  const st = str(o.settle_type);
  return {
    settle_type: st === "personal" || st === "biz" ? st : null,
    has_bank_info: bool(o.has_bank_info),
    bank: str(o.bank),
    holder: str(o.holder),
    account_masked: str(o.account_masked),
    has_tax_info: bool(o.has_tax_info),
    tax_info: t ? { company: str(t.company), ceo: str(t.ceo), biz_type: str(t.biz_type), biz_item: str(t.biz_item), email: str(t.email) } : null,
    biz_no_masked: str(o.biz_no_masked),
    has_biz_doc: bool(o.has_biz_doc),
    has_rrn: bool(o.has_rrn),
    rrn_mask: str(o.rrn_mask),
    rrn_set_at: str(o.rrn_set_at),
    wht_rate: num(o.wht_rate, WHT),
  };
}

export type SetSettleInfoResult = { ok: true; info: SettleInfoView } | { ok: false; code: string };

export function parseSetSettleInfoResult(raw: unknown): SetSettleInfoResult {
  const o = obj(raw);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const info = parseSettleInfo(o);
    return info ? { ok: true, info } : { ok: false, code: "DB_ERROR" };
  }
  return { ok: false, code: typeof o.code === "string" ? o.code : "DB_ERROR" };
}

export type SetRrnResult = { ok: true; rrn_mask: string | null; rrn_set_at: string | null } | { ok: false; code: string };

export function parseSetRrnResult(raw: unknown): SetRrnResult {
  const o = obj(raw);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) return { ok: true, rrn_mask: str(o.rrn_mask), rrn_set_at: str(o.rrn_set_at) };
  return { ok: false, code: typeof o.code === "string" ? o.code : "DB_ERROR" };
}

/** 0013 app_seller_sales 의 캠페인 1행 */
export type SellerSalesCampaign = {
  campaign_id: string;
  campaign_code: string;
  status: string;
  product: { code: string | null; name: string; emoji: string; thumb_url: string | null; sale_price: number };
  brand: { code: string | null; name: string };
  start_date: string | null;
  end_date: string | null;
  due_on: string | null;
  qty: number;
  sold_qty: number;
  paid_count: number;
  refund_count: number;
  gross: number;
  canceled: number;
  refunded: number;
  net: number;
  sample_net: number;
  qty_sold: number;
  today_orders: number;
  today_gross: number;
  my_rate: number;
  grade: string | null;
  grade_bonus_pp: number;
  ref_boost_applied: boolean;
  my_fee: number;
  grade_bonus: number;
  ref_boost: number;
  my_fee_total: number;
  wht: number;
  my_payout_est: number;
  /** 최근 7일(KST) 일별 PAID 합 — 오래된 날부터 */
  daily: { d: string; gross: number }[];
  /** 최근 8건 (샘플·CANCELED 제외) */
  recent: { code: string; buyer_masked: string; qty: number; amount: number; status: string; paid_at: string }[];
};

export type SellerSales = {
  today: string;
  settle_type: SettleType | null;
  wht_rate: number;
  grade: string | null;
  grade_bonus_pp: number;
  rates: { platform_rate: number; ref_boost: number; ref_times: number; clear_days: number };
  campaigns: SellerSalesCampaign[];
  totals: { net: number; my_fee_total: number; wht: number; my_payout_est: number; today_gross: number; today_orders: number; paid_count: number; refund_count: number };
};

function parseProduct(v: unknown): SellerSalesCampaign["product"] {
  const p = obj(v) ?? {};
  return { code: str(p.code), name: str(p.name) ?? "", emoji: str(p.emoji) ?? "📦", thumb_url: str(p.thumb_url), sale_price: num(p.sale_price) };
}
function parseBrand(v: unknown): SellerSalesCampaign["brand"] {
  const b = obj(v) ?? {};
  return { code: str(b.code), name: str(b.name) ?? "" };
}

export function parseSellerSales(raw: unknown): SellerSales | null {
  const o = obj(raw);
  if (!o || o.ok !== true) return null;
  const st = str(o.settle_type);
  const r = obj(o.rates) ?? {};
  const t = obj(o.totals) ?? {};
  const campaigns: SellerSalesCampaign[] = (Array.isArray(o.campaigns) ? o.campaigns : []).map((x) => {
    const c = obj(x) ?? {};
    return {
      campaign_id: str(c.campaign_id) ?? "",
      campaign_code: str(c.campaign_code) ?? "",
      status: str(c.status) ?? "",
      product: parseProduct(c.product),
      brand: parseBrand(c.brand),
      start_date: str(c.start_date),
      end_date: str(c.end_date),
      due_on: str(c.due_on),
      qty: num(c.qty),
      sold_qty: num(c.sold_qty),
      paid_count: num(c.paid_count),
      refund_count: num(c.refund_count),
      gross: num(c.gross),
      canceled: num(c.canceled),
      refunded: num(c.refunded),
      net: num(c.net),
      sample_net: num(c.sample_net),
      qty_sold: num(c.qty_sold),
      today_orders: num(c.today_orders),
      today_gross: num(c.today_gross),
      my_rate: num(c.my_rate),
      grade: str(c.grade),
      grade_bonus_pp: num(c.grade_bonus_pp),
      ref_boost_applied: bool(c.ref_boost_applied),
      my_fee: num(c.my_fee),
      grade_bonus: num(c.grade_bonus),
      ref_boost: num(c.ref_boost),
      my_fee_total: num(c.my_fee_total),
      wht: num(c.wht),
      my_payout_est: num(c.my_payout_est),
      daily: (Array.isArray(c.daily) ? c.daily : []).map((d) => {
        const e = obj(d) ?? {};
        return { d: str(e.d) ?? "", gross: num(e.gross) };
      }),
      recent: (Array.isArray(c.recent) ? c.recent : []).map((d) => {
        const e = obj(d) ?? {};
        return { code: str(e.code) ?? "", buyer_masked: str(e.buyer_masked) ?? "고객", qty: num(e.qty), amount: num(e.amount), status: str(e.status) ?? "", paid_at: str(e.paid_at) ?? "" };
      }),
    };
  });
  return {
    today: str(o.today) ?? "",
    settle_type: st === "personal" || st === "biz" ? st : null,
    wht_rate: num(o.wht_rate, WHT),
    grade: str(o.grade),
    grade_bonus_pp: num(o.grade_bonus_pp),
    rates: { platform_rate: num(r.platform_rate, 0.1), ref_boost: num(r.ref_boost, REF_BOOST), ref_times: num(r.ref_times, 5), clear_days: num(r.clear_days, CLEAR_DAYS) },
    campaigns,
    totals: {
      net: num(t.net),
      my_fee_total: num(t.my_fee_total),
      wht: num(t.wht),
      my_payout_est: num(t.my_payout_est),
      today_gross: num(t.today_gross),
      today_orders: num(t.today_orders),
      paid_count: num(t.paid_count),
      refund_count: num(t.refund_count),
    },
  };
}

/** 0013 app_seller_settlements 의 표 1행 — settled(스냅샷 저장값) · pending(정산 전 예정 · 재계산) */
export type SellerSettlementRow = {
  kind: "settled" | "pending";
  campaign_id: string;
  campaign_code: string;
  status: string;
  product: { code: string | null; name: string; emoji: string; thumb_url: string | null };
  brand: { code: string | null; name: string };
  start_date: string | null;
  end_date: string | null;
  /** 스냅샷 없는 SETTLED(시드 c6) 면 금액 전부 null — "명세 준비 중" */
  net: number | null;
  sample_net: number | null;
  my_rate: number | null;
  grade: string | null;
  grade_bonus_pp: number | null;
  ref_boost_applied: boolean | null;
  my_fee: number | null;
  grade_bonus: number | null;
  ref_boost: number | null;
  my_fee_total: number | null;
  wht_rate: number | null;
  wht: number | null;
  sample_refund_cel: number | null;
  sample_refund_cash: number | null;
  my_payout: number | null;
  hold_seller: boolean | null;
  settlement_status: "pending" | "held" | "paid" | null;
  due_on: string | null;
  settled_at: string | null;
  payout: { status: string; amount: number; paid_at: string | null; hold_reason: string | null } | null;
};

export type SellerSettlements = {
  has_bank_info: boolean;
  settle_type: SettleType | null;
  wht_rate: number;
  rows: SellerSettlementRow[];
  totals: { settled_payout: number; pending_payout: number };
};

export function parseSellerSettlements(raw: unknown): SellerSettlements | null {
  const o = obj(raw);
  if (!o || o.ok !== true) return null;
  const st = str(o.settle_type);
  const t = obj(o.totals) ?? {};
  const rows: SellerSettlementRow[] = (Array.isArray(o.rows) ? o.rows : []).map((x) => {
    const c = obj(x) ?? {};
    const p = obj(c.product) ?? {};
    const po = obj(c.payout);
    const ss = str(c.settlement_status);
    return {
      kind: c.kind === "settled" ? "settled" : "pending",
      campaign_id: str(c.campaign_id) ?? "",
      campaign_code: str(c.campaign_code) ?? "",
      status: str(c.status) ?? "",
      product: { code: str(p.code), name: str(p.name) ?? "", emoji: str(p.emoji) ?? "📦", thumb_url: str(p.thumb_url) },
      brand: parseBrand(c.brand),
      start_date: str(c.start_date),
      end_date: str(c.end_date),
      net: numOrNull(c.net),
      sample_net: numOrNull(c.sample_net),
      my_rate: numOrNull(c.my_rate),
      grade: str(c.grade),
      grade_bonus_pp: numOrNull(c.grade_bonus_pp),
      ref_boost_applied: typeof c.ref_boost_applied === "boolean" ? c.ref_boost_applied : null,
      my_fee: numOrNull(c.my_fee),
      grade_bonus: numOrNull(c.grade_bonus),
      ref_boost: numOrNull(c.ref_boost),
      my_fee_total: numOrNull(c.my_fee_total),
      wht_rate: numOrNull(c.wht_rate),
      wht: numOrNull(c.wht),
      sample_refund_cel: numOrNull(c.sample_refund_cel),
      sample_refund_cash: numOrNull(c.sample_refund_cash),
      my_payout: numOrNull(c.my_payout),
      hold_seller: typeof c.hold_seller === "boolean" ? c.hold_seller : null,
      settlement_status: ss === "pending" || ss === "held" || ss === "paid" ? ss : null,
      due_on: str(c.due_on),
      settled_at: str(c.settled_at),
      payout: po ? { status: str(po.status) ?? "", amount: num(po.amount), paid_at: str(po.paid_at), hold_reason: str(po.hold_reason) } : null,
    };
  });
  return {
    has_bank_info: bool(o.has_bank_info),
    settle_type: st === "personal" || st === "biz" ? st : null,
    wht_rate: num(o.wht_rate, WHT),
    rows,
    totals: { settled_payout: num(t.settled_payout), pending_payout: num(t.pending_payout) },
  };
}

/* ---------------- 문구 ---------------- */

/** 정산 표 "상태 · 지급 예정일" 칸 (프로토타입 vSellerSettle: SETTLED → '지급완료', 그 외 md(settleDue)) */
export function settlementStatusLabel(row: SellerSettlementRow): { label: string; tone: StatusTone; sub: string | null } {
  if (row.kind === "pending") {
    const due = row.due_on ? `지급 예정 ${md(row.due_on)}` : "지급 예정일 미정";
    if (row.status === "LIVE") return { label: "판매 중", tone: "green", sub: due };
    return { label: "교환·환불 기간", tone: "amber", sub: due };
  }
  if (row.my_payout === null) return { label: "정산 완료", tone: "gray", sub: "명세 준비 중" };
  const po = row.payout;
  if (po?.status === "paid" || row.settlement_status === "paid") return { label: "지급 완료", tone: "green", sub: po?.paid_at ? md(po.paid_at.slice(0, 10)) : null };
  if (row.hold_seller || po?.status === "held" || row.settlement_status === "held") {
    return { label: "지급 보류", tone: "red", sub: po?.hold_reason ?? "정산 계좌 미등록 — 등록하면 다음 지급 배치에 포함" };
  }
  return { label: "지급 대기", tone: "blue", sub: row.due_on ? `기준일 ${md(row.due_on)}` : null };
}

/** 원천징수 한 줄 — "원천징수 3.3% −₩9,117" / 사업자 "세금계산서 발행 · 원천징수 없음" */
export function whtLine(whtRate: number, wht: number | null): string {
  if (whtRate === 0) return "세금계산서 발행 · 원천징수 없음";
  const pct = Math.round(whtRate * 1000) / 10;
  return wht === null ? `원천징수 ${pct}%` : `원천징수 ${pct}% −₩${fmtNum(wht)}`;
}

/** 수수료율 표기 — "20% +1%p 골드 +1%p 추천" (settlement-policy §11.2 의 열 불일치를 고친 형태) */
export function rateLine(rate: number | null, grade: string | null, bonusPp: number | null, refBoost: boolean | null): string {
  if (rate === null) return "—";
  const parts = [`${Math.round(rate * 1000) / 10}%`];
  if (bonusPp && bonusPp > 0) parts.push(`+${bonusPp}%p ${grade ?? "등급"}`);
  if (refBoost) parts.push(`+${Math.round(REF_BOOST * 100)}%p 추천`);
  return parts.join(" ");
}
