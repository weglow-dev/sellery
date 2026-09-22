/**
 * 브랜드 매출 · 정산 · 등급 · 브랜드 정보 규칙 — 순수 모듈 (브라우저 `.svelte` 와 서버 양쪽에서 import). DB 호출은 `../server/brand/{sales,settle,profile}.server.ts`.
 *
 * 숫자의 정답은 `packages/core/src/constants.ts`(PG_RATE · PLAT_RATE · CLEAR_DAYS · BREF_DISC · BREF_TIMES · BG_DISC · BGRADES · BANKS) 와
 * `packages/core/src/helpers.ts` `calc()` · `bGmv()` · `bgradeOf()` · `bDiscOf()` · `freeRefLeft()` 다. 여기는 그 중 **브랜드에게 보이는 조각**만 TS 로 옮긴 것이고,
 * 0019 `app_brand_sales` · `app_brand_settlements` · `app_brand_grade_card` 가 같은 식을 SQL 로 계산한다 — 셋을 함께 고친다
 * (docs/settlement-policy.md §3 · §4.2 · §5 · §11.3 · docs/grade-policy.md §5 · docs/brand-console-plan.md §8 "플랫폼+PG 열").
 *
 *   calcBrandPay({ net, sampleNet, rate, bonusPp, refBoost, brandRefBoost, brandDiscRate, pgRate, platformRate })
 *     → { base, pg, sf, gBonus, boost, sfTotal, pfGross, bBoost, bDisc, platformPg, brandPay }
 *       pg = net × PG_RATE · sf = (net − sampleNet) × rate · gBonus/boost 는 플랫폼 부담(표시만) · pfGross = net × PLAT_RATE
 *       · bBoost = 브랜드 추천 부스트면 net × BREF_DISC · bDisc = net × brandDiscRate · platformPg = pfGross − bBoost − bDisc + pg(브랜드 실제 부담)
 *       · brandPay = net − pg − sf − pfGross + bBoost + bDisc. 라인마다 독립 반올림(0004 반올림 계약 · JS Math.round).
 *   brandGradeFor(gmv) · nextBrandGrade(gmv) · brandDiscRateOf(grade) — BGRADES · BG_DISC (0019 는 brand_grade_tiers 표를 읽는다 — 시드값이 같다)
 *   settleDue(endDate) — 종료일 + CLEAR_DAYS (partner/settle-rules 재수출)
 *   parseBrandSettleInfoInput · parseBrandProfileInput — /brand/settle · /brand/my 폼 (0019 app_set_brand_settle_info · app_set_brand_profile 와 같은 조건)
 *   parseBrandSettleInfo · parseSetBrandSettleInfoResult · parseBrandProfile · parseSetBrandProfileResult · parseBrandSales · parseBrandSettlements
 *   · parseBrandGradeCard · parseBrandGradeRecalcResult — RPC jsonb 를 타입으로
 *   BRAND_SETTLE_FAIL_MESSAGES · BRAND_PROFILE_FIELD_MESSAGES · brandSettlementStatusLabel · brandRateLine · platformPgLine · brandGradeLine · brandPayoutLine — 화면 문구
 */
import { BG_DISC, BGRADES, BREF_DISC, BREF_TIMES, CLEAR_DAYS, PG_RATE, PLAT_RATE, REF_BOOST } from "@sellery/core/constants";
import { fmtNum } from "../campaign";
import { md } from "../dates";
import type { StatusTone } from "../order-status";
import { BANKS, maskAccount, maskBizNo, normalizeBizNo, settleDue } from "../partner/settle-rules";
import { EMAIL_RE } from "../partner/signup-rules";
import { cleanText } from "../text";
import { BRAND_CATEGORIES, BRAND_NAME_MAX, isBrandCategory, MANAGER_NAME_MAX, normalizePhone } from "./signup-rules";

export { BANKS, maskAccount, maskBizNo, normalizeBizNo, settleDue };
export { BRAND_CATEGORIES, normalizePhone };

/* ---------------- 상수 · 문구 ---------------- */

/** 브랜드 소개 최대 길이 (0019 app_set_brand_profile 과 동일) */
export const BRAND_DESCRIPTION_MAX = 500;
/** 통신판매업 신고번호 최대 길이 */
export const MAIL_ORDER_NO_MAX = 40;

/** 0019 app_set_brand_settle_info 실패 코드 → 폼 문구 (서류 업로드 · DB 오류 포함) */
export const BRAND_SETTLE_FAIL_MESSAGES: Record<string, string> = {
  BANK_REQUIRED: "은행을 선택해주세요",
  BAD_BANK: "목록에 있는 은행을 선택해주세요",
  BAD_ACCOUNT: "계좌번호는 숫자 8~16자리로 입력해주세요",
  HOLDER_REQUIRED: "예금주를 입력해주세요",
  BAD_BIZ_NO: "사업자등록번호는 숫자 10자리(000-00-00000)로 입력해주세요",
  BIZ_NO_LOCKED: "사업자등록번호는 가입 후 바꿀 수 없어요 — 변경이 필요하면 운영팀에 알려주세요",
  BIZ_NO_TAKEN: "이미 등록된 사업자등록번호예요 — 운영팀에 알려주세요",
  BAD_MAIL_ORDER: "통신판매업 신고번호는 40자 이내로 입력해주세요",
  BAD_EMAIL: "세금계산서 수신 이메일 형식을 확인해주세요",
  NOT_FOUND: "브랜드 계정을 찾을 수 없어요 — 다시 로그인해주세요",
  BAD_FILE: "사업자등록증은 JPG · PNG · WebP · PDF, 10MB 이하로 올려주세요",
  DB_ERROR: "저장에 실패했어요 — 잠시 후 다시 시도해주세요",
};

export function brandSettleFailMessage(code: string): string {
  return BRAND_SETTLE_FAIL_MESSAGES[code] ?? BRAND_SETTLE_FAIL_MESSAGES.DB_ERROR;
}

export type BrandProfileField = "name" | "category" | "manager_name" | "manager_phone" | "description" | "logo_url";

/** 0019 app_set_brand_profile INVALID_INPUT{field} → 폼 문구 */
export const BRAND_PROFILE_FIELD_MESSAGES: Record<BrandProfileField, string> = {
  name: `상호를 1~${BRAND_NAME_MAX}자로 입력해주세요`,
  category: "카테고리를 선택해주세요 (건강기능식품 · 이너뷰티)",
  manager_name: `담당자 이름을 1~${MANAGER_NAME_MAX}자로 입력해주세요`,
  manager_phone: "담당자 연락처 형식을 확인해주세요 (예 010-1234-5678)",
  description: `브랜드 소개는 ${BRAND_DESCRIPTION_MAX}자 이내로 입력해주세요`,
  logo_url: "로고 이미지 주소가 올바르지 않아요 — 다시 업로드해주세요",
};

export const BRAND_PROFILE_FAIL_MESSAGES: Record<string, string> = {
  NOT_FOUND: BRAND_SETTLE_FAIL_MESSAGES.NOT_FOUND,
  BAD_FILE: "로고는 JPG · PNG · WebP · GIF, 4MB 이하로 올려주세요",
  DB_ERROR: BRAND_SETTLE_FAIL_MESSAGES.DB_ERROR,
};

export function brandProfileFailMessage(code: string, field?: string | null): string {
  if (code === "INVALID_INPUT" && field && field in BRAND_PROFILE_FIELD_MESSAGES) return BRAND_PROFILE_FIELD_MESSAGES[field as BrandProfileField];
  return BRAND_PROFILE_FAIL_MESSAGES[code] ?? BRAND_PROFILE_FAIL_MESSAGES.DB_ERROR;
}

/* ---------------- 계산 ---------------- */

export type BrandPayInput = {
  /** 확정 매출 = Σ(status≠CANCELED) − Σ(REFUNDED) (샘플 구매 주문 포함) */
  net: number;
  /** 인플루언서 본인 샘플 구매 주문 합 (PAID · is_sample) — 인플루언서 기본 수수료에서 제외 */
  sampleNet?: number;
  /** 인플루언서 수수료율 (상품 commission_rate · 확정 시 rate_locked) */
  rate: number;
  /** 인플루언서 등급 보너스 %p — 플랫폼 부담(표시만) */
  bonusPp?: number;
  /** 인플루언서 추천 부스트(피추천 첫 5회) — 플랫폼 부담(표시만) */
  refBoost?: boolean;
  /** 브랜드 추천 부스트(피추천 브랜드 첫 3회) — net × BREF_DISC 를 브랜드 정산액에 가산 */
  brandRefBoost?: boolean;
  /** 브랜드 등급 수수료 할인율 (BG_DISC[등급] · 골드 0.005) */
  brandDiscRate?: number;
  pgRate?: number;
  platformRate?: number;
};

export type BrandPay = {
  /** 인플루언서 수수료 기준액 = net − sampleNet */
  base: number;
  /** PG 수수료 (브랜드 정산에서 차감) */
  pg: number;
  /** 인플루언서 기본 수수료 — 브랜드가 부담하는 인플루언서 몫 */
  sf: number;
  /** 등급 보너스 (플랫폼 부담) */
  gBonus: number;
  /** 추천 부스트 (플랫폼 부담) */
  boost: number;
  /** 인플루언서 수령 합계(세전) = sf + gBonus + boost — 참고 표시 */
  sfTotal: number;
  /** 플랫폼 수수료 총액 10% */
  pfGross: number;
  /** 브랜드 추천 할인 (정산액 가산) */
  bBoost: number;
  /** 브랜드 등급 할인 (정산액 가산) */
  bDisc: number;
  /** 정산 표 "플랫폼+PG" = pfGross − bBoost − bDisc + pg (브랜드 실제 부담 · plan §8) */
  platformPg: number;
  /** 브랜드 정산액 = net − pg − sf − pfGross + bBoost + bDisc */
  brandPay: number;
};

/** `calc()` 의 브랜드 가시 라인 — 라인마다 독립 반올림 (저장값끼리 ±1원 어긋날 수 있음 · 0004 계약) */
export function calcBrandPay(input: BrandPayInput): BrandPay {
  const net = Number(input.net) || 0;
  const sampleNet = Number(input.sampleNet) || 0;
  const rate = Number(input.rate) || 0;
  const bonusPp = Number(input.bonusPp) || 0;
  const pgRate = input.pgRate === undefined ? PG_RATE : Number(input.pgRate) || 0;
  const platformRate = input.platformRate === undefined ? PLAT_RATE : Number(input.platformRate) || 0;
  const brandDiscRate = Number(input.brandDiscRate) || 0;
  const base = net - sampleNet;
  const pg = net * pgRate;
  const sf = base * rate;
  const gBonus = (base * bonusPp) / 100;
  const boost = input.refBoost ? net * REF_BOOST : 0;
  const pfGross = net * platformRate;
  const bBoost = input.brandRefBoost ? net * BREF_DISC : 0;
  const bDisc = net * brandDiscRate;
  const platformPg = pfGross - bBoost - bDisc + pg;
  const brandPay = net - pg - sf - pfGross + bBoost + bDisc;
  return {
    base: Math.round(base),
    pg: Math.round(pg),
    sf: Math.round(sf),
    gBonus: Math.round(gBonus),
    boost: Math.round(boost),
    sfTotal: Math.round(sf + gBonus + boost),
    pfGross: Math.round(pfGross),
    bBoost: Math.round(bBoost),
    bDisc: Math.round(bDisc),
    platformPg: Math.round(platformPg),
    brandPay: Math.round(brandPay),
  };
}

/** 프로토타입 `bgradeOf(v)` — 누적 GMV 로 내림차순 첫 매치 (블랙 → 스타터) */
export function brandGradeFor(gmv: number): string {
  const v = Number(gmv) || 0;
  return (BGRADES.find((t) => v >= t.min) ?? BGRADES[BGRADES.length - 1]).g;
}

/** 다음 등급과 남은 금액 — 블랙이면 null */
export function nextBrandGrade(gmv: number): { grade: string; min: number; remaining: number } | null {
  const v = Number(gmv) || 0;
  const idx = BGRADES.findIndex((t) => v >= t.min);
  const cur = idx === -1 ? BGRADES.length - 1 : idx;
  if (cur === 0) return null;
  const nx = BGRADES[cur - 1];
  return { grade: nx.g, min: nx.min, remaining: Math.max(nx.min - v, 0) };
}

/** 프로토타입 `bDiscOf` — BG_DISC[등급] (실버 이하 0) */
export function brandDiscRateOf(grade: string | null | undefined): number {
  return (grade && (BG_DISC as Record<string, number | undefined>)[grade]) || 0;
}

/** 브랜드 추천 부스트 적용 여부 — 피추천 브랜드의 LIVE/CLEARING/SETTLED 캠페인 순번(1부터) 이 BREF_TIMES 이하 */
export function isBrandRefBoostAt(referred: boolean, rn: number | null | undefined): boolean {
  return referred && typeof rn === "number" && rn >= 1 && rn <= BREF_TIMES;
}

/* ---------------- 입력 검증 ---------------- */

export type BrandSettleInfoInput = {
  bank: { bank: string; account: string; holder: string };
  tax: { biz_no: string | null; mail_order_no: string | null; company: string | null; ceo: string | null; biz_type: string | null; biz_item: string | null; email: string | null };
};

export type BrandSettleInfoInputError = {
  code: "BANK_REQUIRED" | "BAD_BANK" | "BAD_ACCOUNT" | "HOLDER_REQUIRED" | "BAD_BIZ_NO" | "BAD_MAIL_ORDER" | "BAD_EMAIL";
  field: "bank" | "account" | "holder" | "biz_no" | "mail_order_no" | "tax_email";
};

/** /brand/settle 폼(FormData 의 문자열) → RPC 입력. 0019 app_set_brand_settle_info 와 같은 조건·순서 — 서버가 다시 검사하므로 문구 선반영용. */
export function parseBrandSettleInfoInput(
  form: Record<string, FormDataEntryValue | string | null | undefined>,
): { ok: true; value: BrandSettleInfoInput } | { ok: false; error: BrandSettleInfoInputError } {
  const str = (k: string, max: number) => cleanText(typeof form[k] === "string" ? (form[k] as string) : "").slice(0, max);
  const bank = str("bank", 20);
  if (!bank || bank === "선택") return { ok: false, error: { code: "BANK_REQUIRED", field: "bank" } };
  if (!BANKS.includes(bank)) return { ok: false, error: { code: "BAD_BANK", field: "bank" } };
  const account = str("account", 40).replace(/\D/g, "");
  if (!/^\d{8,16}$/.test(account)) return { ok: false, error: { code: "BAD_ACCOUNT", field: "account" } };
  const holder = str("holder", 40);
  if (!holder) return { ok: false, error: { code: "HOLDER_REQUIRED", field: "holder" } };
  const rawBiz = str("biz_no", 20);
  let bizNo: string | null = null;
  if (rawBiz) {
    bizNo = normalizeBizNo(rawBiz);
    if (!bizNo) return { ok: false, error: { code: "BAD_BIZ_NO", field: "biz_no" } };
  }
  const mailOrder = str("mail_order_no", 80);
  if (mailOrder.length > MAIL_ORDER_NO_MAX) return { ok: false, error: { code: "BAD_MAIL_ORDER", field: "mail_order_no" } };
  const email = str("tax_email", 160).toLowerCase();
  if (email && (email.length > 120 || !EMAIL_RE.test(email))) return { ok: false, error: { code: "BAD_EMAIL", field: "tax_email" } };
  return {
    ok: true,
    value: {
      bank: { bank, account, holder },
      tax: {
        biz_no: bizNo,
        mail_order_no: mailOrder || null,
        company: str("company", 60) || null,
        ceo: str("ceo", 40) || null,
        biz_type: str("biz_type", 40) || null,
        biz_item: str("biz_item", 40) || null,
        email: email || null,
      },
    },
  };
}

export type BrandProfileInput = {
  name: string;
  category: string;
  manager_name: string;
  /** 정규화된 값 · 비우면 null */
  manager_phone: string | null;
  description: string | null;
};

/**
 * /brand/my 브랜드 정보 폼 → RPC p_input (로고는 `?/logo` 액션이 따로 — 여기 없음). 0019 app_set_brand_profile 과 같은 조건.
 * 첫 실패 필드와 문구를 돌려준다.
 */
export function parseBrandProfileInput(
  form: Record<string, FormDataEntryValue | string | null | undefined>,
): { ok: true; value: BrandProfileInput } | { ok: false; field: BrandProfileField; message: string } {
  const str = (k: string, max: number) => cleanText(typeof form[k] === "string" ? (form[k] as string) : "").slice(0, max);
  const fail = (field: BrandProfileField) => ({ ok: false as const, field, message: BRAND_PROFILE_FIELD_MESSAGES[field] });
  const name = str("name", BRAND_NAME_MAX + 1);
  if (!name || name.length > BRAND_NAME_MAX) return fail("name");
  const category = str("category", 20);
  if (!isBrandCategory(category)) return fail("category");
  const managerName = str("manager_name", MANAGER_NAME_MAX + 1);
  if (!managerName || managerName.length > MANAGER_NAME_MAX) return fail("manager_name");
  const rawPhone = str("manager_phone", 30);
  let phone: string | null = null;
  if (rawPhone) {
    phone = normalizePhone(rawPhone);
    if (!phone) return fail("manager_phone");
  }
  const rawDesc = typeof form.description === "string" ? (form.description as string) : "";
  const description = rawDesc.replace(/\r\n?/g, "\n").trim();
  if (description.length > BRAND_DESCRIPTION_MAX) return fail("description");
  return { ok: true, value: { name, category, manager_name: managerName, manager_phone: phone, description: description || null } };
}

/* ---------------- RPC jsonb → 타입 ---------------- */

type J = Record<string, unknown>;
const obj = (v: unknown): J | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : null);
const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v, NaN)) as number | null;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const bool = (v: unknown): boolean => v === true;
const boolOrNull = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/** 0019 app_brand_settle_info — 원문 없음 (계좌 뒤 4자리 · 사업자번호 뒤 5자리) */
export type BrandSettleInfoView = {
  has_bank_info: boolean;
  bank: string | null;
  holder: string | null;
  account_masked: string | null;
  has_biz_no: boolean;
  biz_no_masked: string | null;
  mail_order_no: string | null;
  has_biz_doc: boolean;
  has_tax_info: boolean;
  tax_info: { company: string | null; ceo: string | null; biz_type: string | null; biz_item: string | null; email: string | null } | null;
  /** 자동 발주 설정 — 5단계는 읽기만(plan §8) */
  po_enabled: boolean;
  po_email: string | null;
  /** 은행·계좌·예금주·사업자등록번호 4개 = hold_brand 해제 조건 */
  settle_info_complete: boolean;
};

export function parseBrandSettleInfo(raw: unknown): BrandSettleInfoView | null {
  const o = obj(raw);
  if (!o || o.ok !== true) return null;
  const t = obj(o.tax_info);
  return {
    has_bank_info: bool(o.has_bank_info),
    bank: str(o.bank),
    holder: str(o.holder),
    account_masked: str(o.account_masked),
    has_biz_no: bool(o.has_biz_no),
    biz_no_masked: str(o.biz_no_masked),
    mail_order_no: str(o.mail_order_no),
    has_biz_doc: bool(o.has_biz_doc),
    has_tax_info: bool(o.has_tax_info),
    tax_info: t ? { company: str(t.company), ceo: str(t.ceo), biz_type: str(t.biz_type), biz_item: str(t.biz_item), email: str(t.email) } : null,
    po_enabled: bool(o.po_enabled),
    po_email: str(o.po_email),
    settle_info_complete: bool(o.settle_info_complete),
  };
}

export type SetBrandSettleInfoResult = { ok: true; info: BrandSettleInfoView } | { ok: false; code: string };

export function parseSetBrandSettleInfoResult(raw: unknown): SetBrandSettleInfoResult {
  const o = obj(raw);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const info = parseBrandSettleInfo(o);
    return info ? { ok: true, info } : { ok: false, code: "DB_ERROR" };
  }
  return { ok: false, code: typeof o.code === "string" ? o.code : "DB_ERROR" };
}

/** 0019 app_brand_profile */
export type BrandProfileView = {
  id: string;
  code: string | null;
  name: string;
  category: string;
  manager_name: string | null;
  manager_phone: string | null;
  email: string | null;
  description: string | null;
  logo_url: string | null;
  biz_no_masked: string | null;
  ref_code: string | null;
  active: boolean;
  created_at: string | null;
};

export function parseBrandProfile(raw: unknown): BrandProfileView | null {
  const o = obj(raw);
  if (!o || o.ok !== true) return null;
  return {
    id: str(o.id) ?? "",
    code: str(o.code),
    name: str(o.name) ?? "",
    category: str(o.category) ?? "",
    manager_name: str(o.manager_name),
    manager_phone: str(o.manager_phone),
    email: str(o.email),
    description: str(o.description),
    logo_url: str(o.logo_url),
    biz_no_masked: str(o.biz_no_masked),
    ref_code: str(o.ref_code),
    active: bool(o.active),
    created_at: str(o.created_at),
  };
}

export type SetBrandProfileResult = { ok: true; profile: BrandProfileView } | { ok: false; code: string; field: string | null };

export function parseSetBrandProfileResult(raw: unknown): SetBrandProfileResult {
  const o = obj(raw);
  if (!o) return { ok: false, code: "DB_ERROR", field: null };
  if (o.ok === true) {
    const profile = parseBrandProfile(o);
    return profile ? { ok: true, profile } : { ok: false, code: "DB_ERROR", field: null };
  }
  return { ok: false, code: typeof o.code === "string" ? o.code : "DB_ERROR", field: str(o.field) };
}

/** 0019 app_brand_grade_card */
export type BrandGradeTier = { name: string; sort_order: number; min_gmv: number; fee_discount: number; top_pct: number; free_ref_per_month: number; perk: string | null };

export type BrandGradeCard = {
  /** 누적 확정 GMV = gmv_base + Σ PAID 주문 (실시간) */
  gmv: number;
  /** 실시간 등급 (brand_grade_for_gmv) */
  grade: string;
  /** brands.grade 캐시 — 정산 실행이 갱신 · 실시간 값과 다를 수 있다 */
  grade_cached: string | null;
  sort_order: number;
  top_pct: number;
  fee_discount: number;
  perk: string | null;
  next: { grade: string; min_gmv: number; remaining: number } | null;
  free_ref_per_month: number;
  free_ref_used_this_month: number;
  free_ref_left: number;
  celery_balance: number;
  celery_per_won: number;
  /** 블랙 → 스타터 */
  tiers: BrandGradeTier[];
};

export function parseBrandGradeCard(raw: unknown): BrandGradeCard | null {
  const o = obj(raw);
  if (!o || o.ok !== true) return null;
  const nx = obj(o.next);
  return {
    gmv: num(o.gmv),
    grade: str(o.grade) ?? brandGradeFor(num(o.gmv)),
    grade_cached: str(o.grade_cached),
    sort_order: num(o.sort_order),
    top_pct: num(o.top_pct, 100),
    fee_discount: num(o.fee_discount),
    perk: str(o.perk),
    next: nx ? { grade: str(nx.grade) ?? "", min_gmv: num(nx.min_gmv), remaining: num(nx.remaining) } : null,
    free_ref_per_month: num(o.free_ref_per_month),
    free_ref_used_this_month: num(o.free_ref_used_this_month),
    free_ref_left: num(o.free_ref_left),
    celery_balance: num(o.celery_balance),
    celery_per_won: num(o.celery_per_won, 5000000),
    tiers: (Array.isArray(o.tiers) ? o.tiers : []).map((x) => {
      const t = obj(x) ?? {};
      return { name: str(t.name) ?? "", sort_order: num(t.sort_order), min_gmv: num(t.min_gmv), fee_discount: num(t.fee_discount), top_pct: num(t.top_pct, 100), free_ref_per_month: num(t.free_ref_per_month), perk: str(t.perk) };
    }),
  };
}

export type BrandGradeRecalcResult = { ok: true; gmv: number; grade: string; previous: string | null; changed: boolean } | { ok: false; code: string };

export function parseBrandGradeRecalcResult(raw: unknown): BrandGradeRecalcResult {
  const o = obj(raw);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) return { ok: true, gmv: num(o.gmv), grade: str(o.grade) ?? "", previous: str(o.previous), changed: bool(o.changed) };
  return { ok: false, code: typeof o.code === "string" ? o.code : "DB_ERROR" };
}

export type BrandSalesSeller = { id: string; code: string | null; name: string; handle: string; platform: string | null; avatar_url: string | null; grade: string | null };

function parseSeller(v: unknown): BrandSalesSeller {
  const s = obj(v) ?? {};
  return { id: str(s.id) ?? "", code: str(s.code), name: str(s.name) ?? "", handle: str(s.handle) ?? "", platform: str(s.platform), avatar_url: str(s.avatar_url), grade: str(s.grade) };
}
function parseProduct(v: unknown): { code: string | null; name: string; emoji: string; thumb_url: string | null; sale_price: number } {
  const p = obj(v) ?? {};
  return { code: str(p.code), name: str(p.name) ?? "", emoji: str(p.emoji) ?? "📦", thumb_url: str(p.thumb_url), sale_price: num(p.sale_price) };
}

/** 0019 app_brand_sales 의 캠페인 1행 */
export type BrandSalesCampaign = {
  campaign_id: string;
  campaign_code: string;
  status: string;
  seller: BrandSalesSeller;
  product: { code: string | null; name: string; emoji: string; thumb_url: string | null; sale_price: number };
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
  seller_rate: number;
  seller_grade: string | null;
  seller_bonus_pp: number;
  ref_boost_applied: boolean;
  brand_ref_applied: boolean;
  pg_fee: number;
  /** 브랜드가 부담하는 인플루언서 몫(기본 요율) */
  seller_fee: number;
  /** 플랫폼 부담 — 표시만 */
  seller_bonus: number;
  ref_boost: number;
  seller_fee_total: number;
  platform_fee_gross: number;
  brand_discount: number;
  brand_ref_boost: number;
  /** pfGross − bBoost − bDisc + pg */
  platform_pg: number;
  brand_payout_est: number;
  /** 최근 7일(KST) 일별 PAID 합 — 오래된 날부터 */
  daily: { d: string; gross: number }[];
  /** 최근 8건 (샘플·CANCELED 제외) */
  recent: { code: string; buyer_masked: string; qty: number; amount: number; status: string; paid_at: string }[];
};

export type BrandSales = {
  today: string;
  brand_grade: string | null;
  brand_discount_rate: number;
  settle_info_complete: boolean;
  rates: { pg_rate: number; platform_rate: number; brand_ref_disc: number; brand_ref_times: number; clear_days: number };
  campaigns: BrandSalesCampaign[];
  totals: { net: number; pg_fee: number; seller_fee: number; platform_pg: number; brand_payout_est: number; today_gross: number; today_orders: number; paid_count: number; refund_count: number };
};

export function parseBrandSales(raw: unknown): BrandSales | null {
  const o = obj(raw);
  if (!o || o.ok !== true) return null;
  const r = obj(o.rates) ?? {};
  const t = obj(o.totals) ?? {};
  const campaigns: BrandSalesCampaign[] = (Array.isArray(o.campaigns) ? o.campaigns : []).map((x) => {
    const c = obj(x) ?? {};
    return {
      campaign_id: str(c.campaign_id) ?? "",
      campaign_code: str(c.campaign_code) ?? "",
      status: str(c.status) ?? "",
      seller: parseSeller(c.seller),
      product: parseProduct(c.product),
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
      seller_rate: num(c.seller_rate),
      seller_grade: str(c.seller_grade),
      seller_bonus_pp: num(c.seller_bonus_pp),
      ref_boost_applied: bool(c.ref_boost_applied),
      brand_ref_applied: bool(c.brand_ref_applied),
      pg_fee: num(c.pg_fee),
      seller_fee: num(c.seller_fee),
      seller_bonus: num(c.seller_bonus),
      ref_boost: num(c.ref_boost),
      seller_fee_total: num(c.seller_fee_total),
      platform_fee_gross: num(c.platform_fee_gross),
      brand_discount: num(c.brand_discount),
      brand_ref_boost: num(c.brand_ref_boost),
      platform_pg: num(c.platform_pg),
      brand_payout_est: num(c.brand_payout_est),
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
    brand_grade: str(o.brand_grade),
    brand_discount_rate: num(o.brand_discount_rate),
    settle_info_complete: bool(o.settle_info_complete),
    rates: {
      pg_rate: num(r.pg_rate, PG_RATE),
      platform_rate: num(r.platform_rate, PLAT_RATE),
      brand_ref_disc: num(r.brand_ref_disc, BREF_DISC),
      brand_ref_times: num(r.brand_ref_times, BREF_TIMES),
      clear_days: num(r.clear_days, CLEAR_DAYS),
    },
    campaigns,
    totals: {
      net: num(t.net),
      pg_fee: num(t.pg_fee),
      seller_fee: num(t.seller_fee),
      platform_pg: num(t.platform_pg),
      brand_payout_est: num(t.brand_payout_est),
      today_gross: num(t.today_gross),
      today_orders: num(t.today_orders),
      paid_count: num(t.paid_count),
      refund_count: num(t.refund_count),
    },
  };
}

/** 0019 app_brand_settlements 의 표 1행 — settled(스냅샷 저장값) · pending(정산 전 예정 · 재계산) */
export type BrandSettlementRow = {
  kind: "settled" | "pending";
  campaign_id: string;
  campaign_code: string;
  status: string;
  seller: { code: string | null; name: string; handle: string; platform: string | null; grade: string | null };
  product: { code: string | null; name: string; emoji: string; thumb_url: string | null };
  start_date: string | null;
  end_date: string | null;
  /** 스냅샷 없는 SETTLED(시드 c6) 면 금액 전부 null — "명세 준비 중" */
  net: number | null;
  sample_net: number | null;
  seller_rate: number | null;
  pg_fee: number | null;
  seller_fee: number | null;
  seller_bonus: number | null;
  ref_boost: number | null;
  seller_fee_total: number | null;
  platform_fee_gross: number | null;
  brand_grade: string | null;
  brand_discount_rate: number | null;
  brand_discount: number | null;
  brand_ref_applied: boolean | null;
  brand_ref_boost: number | null;
  platform_pg: number | null;
  brand_payout: number | null;
  hold_brand: boolean | null;
  settlement_status: "pending" | "held" | "paid" | null;
  due_on: string | null;
  settled_at: string | null;
  paid_at: string | null;
  payout: { status: string; amount: number; paid_at: string | null; hold_reason: string | null } | null;
};

export type BrandSettlements = {
  settle_info_complete: boolean;
  has_bank_info: boolean;
  rows: BrandSettlementRow[];
  totals: { settled_payout: number; pending_payout: number; held_payout: number };
};

export function parseBrandSettlements(raw: unknown): BrandSettlements | null {
  const o = obj(raw);
  if (!o || o.ok !== true) return null;
  const t = obj(o.totals) ?? {};
  const rows: BrandSettlementRow[] = (Array.isArray(o.rows) ? o.rows : []).map((x) => {
    const c = obj(x) ?? {};
    const s = obj(c.seller) ?? {};
    const p = obj(c.product) ?? {};
    const po = obj(c.payout);
    const ss = str(c.settlement_status);
    return {
      kind: c.kind === "settled" ? "settled" : "pending",
      campaign_id: str(c.campaign_id) ?? "",
      campaign_code: str(c.campaign_code) ?? "",
      status: str(c.status) ?? "",
      seller: { code: str(s.code), name: str(s.name) ?? "", handle: str(s.handle) ?? "", platform: str(s.platform), grade: str(s.grade) },
      product: { code: str(p.code), name: str(p.name) ?? "", emoji: str(p.emoji) ?? "📦", thumb_url: str(p.thumb_url) },
      start_date: str(c.start_date),
      end_date: str(c.end_date),
      net: numOrNull(c.net),
      sample_net: numOrNull(c.sample_net),
      seller_rate: numOrNull(c.seller_rate),
      pg_fee: numOrNull(c.pg_fee),
      seller_fee: numOrNull(c.seller_fee),
      seller_bonus: numOrNull(c.seller_bonus),
      ref_boost: numOrNull(c.ref_boost),
      seller_fee_total: numOrNull(c.seller_fee_total),
      platform_fee_gross: numOrNull(c.platform_fee_gross),
      brand_grade: str(c.brand_grade),
      brand_discount_rate: numOrNull(c.brand_discount_rate),
      brand_discount: numOrNull(c.brand_discount),
      brand_ref_applied: boolOrNull(c.brand_ref_applied),
      brand_ref_boost: numOrNull(c.brand_ref_boost),
      platform_pg: numOrNull(c.platform_pg),
      brand_payout: numOrNull(c.brand_payout),
      hold_brand: boolOrNull(c.hold_brand),
      settlement_status: ss === "pending" || ss === "held" || ss === "paid" ? ss : null,
      due_on: str(c.due_on),
      settled_at: str(c.settled_at),
      paid_at: str(c.paid_at),
      payout: po ? { status: str(po.status) ?? "", amount: num(po.amount), paid_at: str(po.paid_at), hold_reason: str(po.hold_reason) } : null,
    };
  });
  return {
    settle_info_complete: bool(o.settle_info_complete),
    has_bank_info: bool(o.has_bank_info),
    rows,
    totals: { settled_payout: num(t.settled_payout), pending_payout: num(t.pending_payout), held_payout: num(t.held_payout) },
  };
}

/* ---------------- 문구 ---------------- */

/** 정산 표 "상태 · 정산일" 칸 (데모 vBrandSettle: SETTLED → '완료', 그 외 md(settleDue)) */
export function brandSettlementStatusLabel(row: BrandSettlementRow): { label: string; tone: StatusTone; sub: string | null } {
  if (row.kind === "pending") {
    const due = row.due_on ? `정산 예정 ${md(row.due_on)}` : "정산 예정일 미정";
    if (row.status === "LIVE") return { label: "판매 중", tone: "green", sub: due };
    return { label: "교환·환불 기간", tone: "amber", sub: due };
  }
  if (row.brand_payout === null) return { label: "정산 완료", tone: "gray", sub: "명세 준비 중" };
  const po = row.payout;
  if (po?.status === "paid" || row.settlement_status === "paid") return { label: "지급 완료", tone: "green", sub: po?.paid_at ? md(po.paid_at.slice(0, 10)) : row.paid_at ? md(row.paid_at.slice(0, 10)) : null };
  if (row.hold_brand || po?.status === "held" || row.settlement_status === "held") {
    return { label: "지급 보류", tone: "red", sub: po?.hold_reason ?? "정산 정보 미등록 — 등록하면 다음 지급 배치에 포함" };
  }
  return { label: "지급 대기", tone: "blue", sub: row.due_on ? `기준일 ${md(row.due_on)}` : null };
}

/** 인플루언서 수수료율 표기 — "20%" (+ 참고 "등급 +1%p · 추천 +1%p 는 셀러리 부담") */
export function brandRateLine(rate: number | null, bonusPp?: number | null, refBoost?: boolean | null): string {
  if (rate === null) return "—";
  const base = `${Math.round(rate * 1000) / 10}%`;
  const extras: string[] = [];
  if (bonusPp && bonusPp > 0) extras.push(`등급 +${bonusPp}%p`);
  if (refBoost) extras.push("추천 +1%p");
  return extras.length ? `${base} (${extras.join(" · ")} 셀러리 부담)` : base;
}

/** "플랫폼 10% + PG 1.9%" / 할인이 있으면 "플랫폼 10% −0.5%p 골드 −1%p 추천 + PG 1.9%" */
export function platformPgLine(platformRate: number, pgRate: number, brandGrade: string | null, brandDiscRate: number | null, brandRefApplied: boolean | null): string {
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
  const parts = [`플랫폼 ${pct(platformRate)}`];
  if (brandDiscRate && brandDiscRate > 0) parts.push(`−${Math.round(brandDiscRate * 1000) / 10}%p ${brandGrade ?? "등급"}`);
  if (brandRefApplied) parts.push(`−${Math.round(BREF_DISC * 1000) / 10}%p 추천`);
  return `${parts.join(" ")} + PG ${pct(pgRate)}`;
}

/** 등급 카드 한 줄 — "골드 · 누적 ₩91,373,500 · 플래티넘까지 ₩108,626,500" / 블랙 "블랙 · 누적 ₩… · 최고 등급" */
export function brandGradeLine(card: Pick<BrandGradeCard, "grade" | "gmv" | "next">): string {
  const nx = card.next ? `${card.next.grade}까지 ₩${fmtNum(card.next.remaining)}` : "최고 등급";
  return `${card.grade} · 누적 ₩${fmtNum(card.gmv)} · ${nx}`;
}

/** 수수료 할인 한 줄 — "플랫폼 수수료 −0.5%p (실효 9.5%)" / 없으면 "수수료 할인 없음 (골드부터 −0.5%p)" */
export function brandDiscountLine(feeDiscount: number, platformRate = PLAT_RATE): string {
  if (!feeDiscount || feeDiscount <= 0) return "수수료 할인 없음 (골드부터 −0.5%p)";
  const pp = Math.round(feeDiscount * 1000) / 10;
  const eff = Math.round((platformRate - feeDiscount) * 1000) / 10;
  return `플랫폼 수수료 −${pp}%p (실효 ${eff}%)`;
}

/** 무료 열람 한 줄 — 다이아·블랙 "이달 무료 열람 3/5회 남음" · 그 외 "무료 열람은 다이아 등급부터 (월 5회)" */
export function freeRefLine(card: Pick<BrandGradeCard, "free_ref_per_month" | "free_ref_left">): string {
  if (card.free_ref_per_month <= 0) return "무료 열람은 다이아 등급부터 (월 5회)";
  return `이달 무료 열람 ${card.free_ref_left}/${card.free_ref_per_month}회 남음`;
}

/** 지급 예상 한 줄 — "확정 ₩1,315,600 → 브랜드 정산액 ₩902,502 (D+21 10/8)" */
export function brandPayoutLine(net: number, brandPayout: number, dueOn: string | null): string {
  const due = dueOn ? ` (D+${CLEAR_DAYS} ${md(dueOn)})` : "";
  return `확정 ₩${fmtNum(net)} → 브랜드 정산액 ₩${fmtNum(brandPayout)}${due}`;
}
