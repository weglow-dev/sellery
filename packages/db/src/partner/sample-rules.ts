/**
 * 샘플 요청 · 캠페인 표시 규칙 — 순수 모듈 (브라우저 `.svelte` 와 서버 양쪽에서 import). DB 호출은 `../server/partner/{products,campaigns}.server.ts`.
 *
 * 숫자·판정은 **DB 함수 `app_sample_quote`(0011)** 가 한다(표시 금액 = 청구 금액, docs/inf-console-plan.md §5.3). 여기서는 그 jsonb 를
 * 타입으로 좁히고(`parseSampleQuote`), 버튼 문구로 바꾸고(`sampleButton` — 프로토타입 helpers.ts `sampleBtn` 의 분기 순서 그대로),
 * 배송지 폼 입력을 검증한다(`parseShippingInput` — 0011 `app_request_free_sample` 과 같은 조건·상한). 상태 칩은 `@sellery/core/constants` 의
 * `ST`(라벨·색·차례) 를 그대로 쓰고 색 이름만 콘솔 칩 톤으로 매핑한다.
 *
 * 4단계 PR-B 부터 [샘플 구매 ₩N] 은 활성 링크 — `samplePayHref(code)` = `/influencer/pay/new?product=<code>`(결제 화면). `SAMPLE_BUY_ENABLED` 는
 * 결제 화면을 잠시 닫아야 할 때(토스 장애 등) false 로 돌리는 스위치로 남긴다(버튼 비활성 + `BUY_COMING_SOON` 안내).
 * 4단계 PR-A(0012 partner_payments) 의 순수 규칙은 파일 끝 "샘플 결제" 절 — `PartnerPaymentView` · `isPayable` · `payLine` · `partnerPaymentStatusLabel` ·
 * RPC 결과 파서(`parseBeginSampleResult` · `parseConfirmSampleResult` · `parseSimplePaymentResult`) · `PARTNER_PAY_FAIL_MESSAGES`.
 */
import { FLOW, FLOW_L, ST } from "@sellery/core/constants";
import type { Status } from "@sellery/core/types";
import { fmtNum } from "../campaign";
import { consolePath } from "../console-paths";
import type { StatusTone } from "../order-status";
import { cleanText, normalizePhone } from "../text";
import type { Shipping } from "../types";

/* ---------------- app_sample_quote jsonb ---------------- */

export type SampleMode = "free" | "buy" | "locked" | "active" | "unlisted";
export type SampleReason =
  | "GRADE_BELOW"
  | "HAD_FREE"
  | "QUOTA_EXHAUSTED"
  | "EXCLUSIVE_LOCKED"
  | "ALREADY_ACTIVE"
  | "NOT_LISTED"
  | "NOT_FOUND";

/** 0011 `app_sample_quote` 반환 키 1:1 (unlisted 면 가격·한도 필드는 null) */
export type SampleQuote = {
  mode: SampleMode;
  reason: SampleReason | null;
  free: boolean;
  price: number | null;
  cel: number | null;
  cash: number | null;
  use_cel: boolean;
  method: "cel" | "cash";
  balance: number;
  cel_won: number;
  free_grade: string | null;
  seller_grade: string | null;
  free_eligible: boolean;
  had_free: boolean;
  quota: number;
  extra: number;
  used: number;
  left: number;
  buy_mode: "auto" | "fixed";
  fixed_price: number;
  refund: boolean;
  exclusive_grade: string | null;
  exclusive_locked: boolean;
  campaign_code: string | null;
  campaign_status: string | null;
  seller_id: string | null;
  product_id: string | null;
};

const MODES: readonly SampleMode[] = ["free", "buy", "locked", "active", "unlisted"];
const REASONS: readonly SampleReason[] = [
  "GRADE_BELOW",
  "HAD_FREE",
  "QUOTA_EXHAUSTED",
  "EXCLUSIVE_LOCKED",
  "ALREADY_ACTIVE",
  "NOT_LISTED",
  "NOT_FOUND",
];

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const intOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null);
const int = (v: unknown, d = 0): number => intOrNull(v) ?? d;
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** jsonb → SampleQuote. mode 가 낯설면 null (RPC 계약 위반 — 호출자는 "견적 없음" 으로 렌더). */
export function parseSampleQuote(json: unknown): SampleQuote | null {
  const o = obj(json);
  if (!o) return null;
  const mode = strOrNull(o.mode);
  if (!mode || !(MODES as readonly string[]).includes(mode)) return null;
  const reasonRaw = strOrNull(o.reason);
  const reason = reasonRaw && (REASONS as readonly string[]).includes(reasonRaw) ? (reasonRaw as SampleReason) : null;
  return {
    mode: mode as SampleMode,
    reason,
    free: mode === "free",
    price: intOrNull(o.price),
    cel: intOrNull(o.cel),
    cash: intOrNull(o.cash),
    use_cel: o.use_cel === true,
    method: o.method === "cel" ? "cel" : "cash",
    balance: int(o.balance),
    cel_won: int(o.cel_won, SAMPLE_CEL_WON_DEFAULT),
    free_grade: strOrNull(o.free_grade),
    seller_grade: strOrNull(o.seller_grade),
    free_eligible: o.free_eligible === true,
    had_free: o.had_free === true,
    quota: int(o.quota),
    extra: int(o.extra),
    used: int(o.used),
    left: int(o.left),
    buy_mode: o.buy_mode === "fixed" ? "fixed" : "auto",
    fixed_price: int(o.fixed_price),
    refund: o.refund === true,
    exclusive_grade: strOrNull(o.exclusive_grade),
    exclusive_locked: o.exclusive_locked === true,
    campaign_code: strOrNull(o.campaign_code),
    campaign_status: strOrNull(o.campaign_status),
    seller_id: strOrNull(o.seller_id),
    product_id: strOrNull(o.product_id),
  };
}

/** `SAMPLE_CEL_WON`(@sellery/core/constants) 과 같은 값 — quote 의 cel_won 이 비었을 때만 */
export const SAMPLE_CEL_WON_DEFAULT = 20000;

/** 결제 화면(`/pay/*`) 열림 — false 면 [샘플 구매 ₩N] 비활성 + `BUY_COMING_SOON` 안내 (4단계 PR-B 부터 true) */
export const SAMPLE_BUY_ENABLED = true;

/** [샘플 구매 ₩N] 링크 — `/influencer/pay/new?product=<code>` (docs/inf-console-plan.md §6 `/products/[code]` → `/pay/new?product=`) */
export function samplePayHref(productCode: string): string {
  return `${consolePath("seller", "/pay/new")}?product=${encodeURIComponent(productCode)}`;
}

/* ---------------- 버튼 · 안내 문구 (프로토타입 sampleBtn · sampleLine · reqSample 토스트 원문) ---------------- */

export type SampleButton = {
  kind: SampleMode;
  label: string;
  disabled: boolean;
  /** title/툴팁 — 왜 무상이 아닌지 · 왜 눌리지 않는지 */
  title: string | null;
  /** buy 일 때 샘플 구매가 */
  price: number | null;
  /** active 일 때 진행 중 캠페인 코드 (→ /campaigns/<code>) */
  campaignCode: string | null;
};

export const BUY_REASON_TITLES: Record<Exclude<SampleReason, "EXCLUSIVE_LOCKED" | "ALREADY_ACTIVE" | "NOT_LISTED" | "NOT_FOUND">, string> = {
  GRADE_BELOW: "무상 기준 등급 미달",
  HAD_FREE: "무상 샘플은 상품당 1회",
  QUOTA_EXHAUSTED: "이달 무상 한도 소진",
};

export const BUY_COMING_SOON = "샘플 구매는 잠시 닫혀 있어요 (결제 준비 중)";

/** quote → 버튼. 분기 순서는 DB 가 이미 정했다(locked → active → free → buy); 여기서는 문구만. */
export function sampleButton(q: SampleQuote | null): SampleButton {
  if (!q || q.mode === "unlisted") {
    return { kind: "unlisted", label: "판매 준비 중", disabled: true, title: null, price: null, campaignCode: null };
  }
  switch (q.mode) {
    case "locked":
      return { kind: "locked", label: "독점 잠김", disabled: true, title: "이 상품은 독점 인플루언서가 확정되어 샘플 요청이 제한됩니다", price: null, campaignCode: null };
    case "active":
      return { kind: "active", label: "진행 중", disabled: false, title: null, price: null, campaignCode: q.campaign_code };
    case "free":
      return { kind: "free", label: "무상 샘플 요청", disabled: false, title: null, price: null, campaignCode: null };
    case "buy": {
      const price = q.price ?? 0;
      const why = q.reason && q.reason in BUY_REASON_TITLES ? BUY_REASON_TITLES[q.reason as keyof typeof BUY_REASON_TITLES] : null;
      return {
        kind: "buy",
        label: `샘플 구매 ₩${fmtNum(price)}`,
        disabled: !SAMPLE_BUY_ENABLED,
        title: SAMPLE_BUY_ENABLED ? why : [why, BUY_COMING_SOON].filter(Boolean).join(" · "),
        price,
        campaignCode: null,
      };
    }
  }
}

/**
 * 카드 한 줄 (프로토타입 sampleLine): "실버 이상 무상 1회 · 미달 시 ₩21,520 구매 (🥬 1 + ₩1,520) · 브랜드 지정가 · 판매 확정 시 환급".
 * 🥬 분할은 잔액과 무관한 **최대 분할**(floor(price / cel_won)) — quote.cel 은 잔액으로 잘린 값이라 안내에는 쓰지 않는다.
 */
export function sampleLine(q: SampleQuote | null, celIcon = "🥬"): string {
  if (!q || q.price === null || !q.free_grade) return "";
  const celWon = q.cel_won > 0 ? q.cel_won : SAMPLE_CEL_WON_DEFAULT;
  const cel = Math.floor(q.price / celWon);
  const cash = q.price - cel * celWon;
  let s = `${q.free_grade} 이상 무상 1회 · 미달 시 ₩${fmtNum(q.price)} 구매`;
  if (cel > 0) s += ` (${celIcon} ${cel}${cash ? ` + ₩${fmtNum(cash)}` : ""})`;
  if (q.buy_mode === "fixed") s += " · 브랜드 지정가";
  if (q.refund) s += " · 판매 확정 시 환급";
  return s;
}

/** 이달 무상 한도 안내 — "이달 무상 샘플 1/2회 남음" */
export function quotaLine(q: Pick<SampleQuote, "quota" | "extra" | "left">): string {
  return `이달 무상 샘플 ${q.left}/${q.quota + q.extra}회 남음`;
}

/* ---------------- app_request_free_sample 결과 ---------------- */

export type RequestFreeSampleCode = "BAD_SHIPPING" | "NOT_FOUND" | "UNLISTED" | "LOCKED" | "ALREADY_ACTIVE" | "NOT_FREE" | "DB_ERROR";

export const REQUEST_FREE_SAMPLE_CODES: readonly RequestFreeSampleCode[] = [
  "BAD_SHIPPING",
  "NOT_FOUND",
  "UNLISTED",
  "LOCKED",
  "ALREADY_ACTIVE",
  "NOT_FREE",
  "DB_ERROR",
];

export function isRequestFreeSampleCode(v: unknown): v is RequestFreeSampleCode {
  return typeof v === "string" && (REQUEST_FREE_SAMPLE_CODES as readonly string[]).includes(v);
}

/** 실패 코드 → 사용자 문구 (프로토타입 reqSample 토스트 원문). NOT_FREE 는 reason 별로 `notFreeMessage()`. */
export const REQUEST_FREE_SAMPLE_MESSAGES: Record<RequestFreeSampleCode, string> = {
  BAD_SHIPPING: "배송지를 확인해주세요 — 수취인 · 연락처 · 우편번호 · 주소는 필수예요.",
  NOT_FOUND: "인플루언서 정보를 찾을 수 없어요 — 다시 로그인해주세요.",
  UNLISTED: "지금은 샘플을 요청할 수 없는 상품이에요.",
  LOCKED: "이 상품은 독점 인플루언서가 확정되어 샘플 요청이 제한됩니다.",
  ALREADY_ACTIVE: "이 상품은 이미 진행 중인 캠페인이 있어요.",
  NOT_FREE: "무상 샘플 조건에 맞지 않아요 — 샘플 구매로 진행할 수 있어요.",
  DB_ERROR: "요청 중 문제가 생겼어요 — 잠시 후 다시 시도해주세요.",
};

/** NOT_FREE 의 reason 별 문구 (reqSample 원문 — 무상 기준 등급 · 상품당 1회 · 월 한도) */
export function notFreeMessage(reason: SampleReason | null, freeGrade: string | null, quota: number): string {
  switch (reason) {
    case "GRADE_BELOW":
      return `무상 샘플은 ${freeGrade ?? "기준"} 등급 이상 — 샘플 구매로 진행할 수 있어요`;
    case "HAD_FREE":
      return "이 상품의 무상 샘플은 이미 받았어요 (상품당 1회) — 샘플 구매로 진행";
    case "QUOTA_EXHAUSTED":
      return `이번 달 무상 샘플 한도를 모두 사용했어요 (한도 ${quota}회) — 샘플 구매로 진행`;
    default:
      return REQUEST_FREE_SAMPLE_MESSAGES.NOT_FREE;
  }
}

/* ---------------- 배송지 폼 (0011 app_request_free_sample 과 같은 조건·상한) ---------------- */

export type ShippingField = "recipient" | "phone" | "postcode" | "address1" | "address2" | "memo";

export const SHIPPING_FIELD_LABELS: Record<ShippingField, string> = {
  recipient: "수취인",
  phone: "연락처",
  postcode: "우편번호",
  address1: "주소",
  address2: "상세 주소",
  memo: "배송 메모",
};

export const SHIPPING_MAX: Record<ShippingField, number> = {
  recipient: 40,
  phone: 15,
  postcode: 10,
  address1: 200,
  address2: 200,
  memo: 200,
};

export type ParsedShipping = { ok: true; shipping: Shipping } | { ok: false; field: ShippingField | "shipping" };

/**
 * FormData · 객체 → Shipping. 필수 4개(수취인 · 연락처 숫자 8~15 · 우편번호 · 주소) 가 비면 첫 실패 필드를 돌려준다.
 * 정규화: cleanText(제어문자 제거 · 공백 정리) · 연락처 숫자만 · address2/memo 는 비면 키 제거 · 길이 상한.
 */
export function parseShippingInput(raw: unknown): ParsedShipping {
  const src: Obj | null =
    typeof FormData !== "undefined" && raw instanceof FormData
      ? Object.fromEntries([...raw.entries()].filter(([, v]) => typeof v === "string"))
      : obj(raw);
  if (!src) return { ok: false, field: "shipping" };
  const pick = (k: ShippingField) => cleanText(typeof src[k] === "string" ? (src[k] as string) : "").slice(0, SHIPPING_MAX[k]);

  const recipient = pick("recipient");
  if (!recipient) return { ok: false, field: "recipient" };
  const phone = normalizePhone(typeof src.phone === "string" ? src.phone : "");
  if (!phone) return { ok: false, field: "phone" };
  const postcode = pick("postcode");
  if (!postcode) return { ok: false, field: "postcode" };
  const address1 = pick("address1");
  if (!address1) return { ok: false, field: "address1" };

  const out: Shipping = { recipient, phone, postcode, address1 };
  const address2 = pick("address2");
  const memo = pick("memo");
  if (address2) out.address2 = address2;
  if (memo) out.memo = memo;
  return { ok: true, shipping: out };
}

/** sellers.sample_address · campaigns.sample_shipping jsonb → Shipping (필수 키가 문자열이면 통과 — 재검증 없음) */
export function parseStoredShipping(json: unknown): Shipping | null {
  const o = obj(json);
  if (!o) return null;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : undefined);
  const recipient = s("recipient");
  const phone = s("phone");
  const postcode = s("postcode");
  const address1 = s("address1");
  if (recipient === undefined || phone === undefined || postcode === undefined || address1 === undefined) return null;
  const out: Shipping = { recipient, phone, postcode, address1 };
  const address2 = s("address2");
  const memo = s("memo");
  if (address2) out.address2 = address2;
  if (memo) out.memo = memo;
  return out;
}

/* ---------------- 캠페인 상태 칩 · 스테퍼 (프로토타입 ST · FLOW · stepper) ---------------- */

export type CampaignChip = {
  label: string;
  tone: StatusTone;
  /** LIVE — 칩에 pulse 점 */
  live: boolean;
  /** 누구 차례인지 (없으면 종결·자동 전이 상태) */
  turn: "brand" | "seller" | null;
};

const TONE_OF: Record<string, StatusTone> = { blue: "blue", amber: "amber", green: "green", live: "green", gray: "gray", red: "red" };

export const CAMPAIGN_STATUSES: readonly Status[] = Object.keys(ST) as Status[];

export function isCampaignStatus(v: unknown): v is Status {
  return typeof v === "string" && v in ST;
}

/** ST[status] → 콘솔 칩. 낯선 상태는 원문 그대로 gray. */
export function campaignChip(status: string): CampaignChip {
  if (!isCampaignStatus(status)) return { label: status, tone: "gray", live: false, turn: null };
  const st = ST[status];
  return { label: st.l, tone: TONE_OF[st.c] ?? "gray", live: status === "LIVE", turn: st.turn ?? null };
}

/** 정상 9단계 (FLOW · FLOW_L) — 스테퍼 라벨 */
export const CAMPAIGN_STEPS: readonly { status: Status; label: string }[] = FLOW.map((status, i) => ({ status, label: FLOW_L[i] ?? status }));

/**
 * 스테퍼 현재 칸 (프로토타입 stepper): SAMPLE_PURCHASED → 샘플승인 칸, INVITED → 샘플요청 칸.
 * 종결 상태(DECLINED · REJECTED · PASSED) 는 -1 — 스테퍼 대신 종결 칩만.
 */
export function stepIndex(status: string): number {
  const mapped = status === "SAMPLE_PURCHASED" ? "SAMPLE_APPROVED" : status === "INVITED" ? "SAMPLE_REQUESTED" : status;
  return FLOW.indexOf(mapped as Status);
}

/** 종결 상태 — 스테퍼 없이 칩만, 같은 상품 재요청 가능 (ACTIVE_BLOCKERS 와 같은 집합 + SETTLED 는 정상 종료) */
export const ENDED_STATUSES: readonly Status[] = ["DECLINED", "REJECTED", "PASSED", "SETTLED"];

/* ============================================================
 * 샘플 결제 (0012 partner_payments) — /pay/[id] · /pay/success · /pay/fail · 캠페인 상세 "샘플 결제 ₩N" 의 순수 규칙.
 * 숫자(가격·🥬 분할)는 DB(app_partner_payment_claim → app_sample_quote)가 정한다. 여기서는 RPC jsonb 를 타입으로 좁히고 문구로 바꾼다.
 * 서버 호출은 @sellery/payments/server/partner-sample (토스 confirm/cancel + RPC).
 * ============================================================ */

/** partner_payments.status (0012) — CONFIRMED 가 "결제 완료(paid)" */
export type PartnerPaymentStatus = "PENDING" | "CONFIRMING" | "CONFIRMED" | "FAILED" | "CANCELED" | "EXPIRED" | "REFUNDED";

export const PARTNER_PAYMENT_STATUSES: readonly PartnerPaymentStatus[] = [
  "PENDING",
  "CONFIRMING",
  "CONFIRMED",
  "FAILED",
  "CANCELED",
  "EXPIRED",
  "REFUNDED",
];

export function isPartnerPaymentStatus(v: unknown): v is PartnerPaymentStatus {
  return typeof v === "string" && (PARTNER_PAYMENT_STATUSES as readonly string[]).includes(v);
}

/** partner_payment_brief() / PARTNER_PAYMENT_COLS select 결과 — 배송지·토스 원문 없음 */
export type PartnerPaymentView = {
  id: string;
  status: PartnerPaymentStatus;
  kind: string;
  seller_id: string | null;
  user_id: string | null;
  product_id: string | null;
  campaign_id: string | null;
  toss_order_id: string;
  payment_key: string | null;
  order_name: string;
  amount_total: number;
  amount_cel: number;
  amount_cash: number;
  cel_won: number;
  use_cel: boolean;
  payment_method: string | null;
  approved_at: string | null;
  fail_code: string | null;
  fail_message: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

/** jsonb/행 → PartnerPaymentView. 필수 키(id · status · toss_order_id · 금액)가 어긋나면 null. */
export function parsePartnerPaymentView(json: unknown): PartnerPaymentView | null {
  const o = obj(json);
  if (!o) return null;
  const id = strOrNull(o.id);
  const status = o.status;
  const orderId = strOrNull(o.toss_order_id);
  const total = intOrNull(o.amount_total);
  const cash = intOrNull(o.amount_cash);
  if (!id || !isPartnerPaymentStatus(status) || !orderId || total === null || cash === null) return null;
  return {
    id,
    status,
    kind: strOrNull(o.kind) ?? "sample",
    seller_id: strOrNull(o.seller_id),
    user_id: strOrNull(o.user_id),
    product_id: strOrNull(o.product_id),
    campaign_id: strOrNull(o.campaign_id),
    toss_order_id: orderId,
    payment_key: strOrNull(o.payment_key),
    order_name: strOrNull(o.order_name) ?? "",
    amount_total: total,
    amount_cel: int(o.amount_cel),
    amount_cash: cash,
    cel_won: int(o.cel_won, SAMPLE_CEL_WON_DEFAULT),
    use_cel: o.use_cel === true,
    payment_method: strOrNull(o.payment_method),
    approved_at: strOrNull(o.approved_at),
    fail_code: strOrNull(o.fail_code),
    fail_message: strOrNull(o.fail_message),
    expires_at: strOrNull(o.expires_at) ?? "",
    created_at: strOrNull(o.created_at) ?? "",
    updated_at: strOrNull(o.updated_at) ?? "",
  };
}

/**
 * 결제 화면을 그려도 되는가 — PENDING 이고 만료 전. CONFIRMING 은 "확인 중"(새로고침 안내), 그 외는 종결 화면.
 * expiresAt 이 비었거나 형식이 어긋나면 만료로 본다(안전 쪽).
 */
export function isPayable(status: string, expiresAt: string | Date | null | undefined, now: number = Date.now()): boolean {
  if (status !== "PENDING") return false;
  const t = expiresAt instanceof Date ? expiresAt.getTime() : typeof expiresAt === "string" ? Date.parse(expiresAt) : NaN;
  return Number.isFinite(t) && t > now;
}

/** 상태 칩 — /pay/[id] 상단 · 캠페인 상세의 결제 카드. CANCEL_PENDING 은 FAILED 의 fail_code 로 구분. */
export function partnerPaymentStatusLabel(status: string, failCode?: string | null): { label: string; tone: StatusTone } {
  switch (status) {
    case "PENDING":
      return { label: "결제 대기", tone: "amber" };
    case "CONFIRMING":
      return { label: "결제 확인 중", tone: "amber" };
    case "CONFIRMED":
      return { label: "결제 완료", tone: "green" };
    case "FAILED":
      return failCode === "CANCEL_PENDING" ? { label: "결제 취소 처리 중", tone: "red" } : { label: "결제 실패", tone: "red" };
    case "CANCELED":
      return failCode === "SUPERSEDED" ? { label: "새 결제로 대체됨", tone: "gray" } : { label: "결제 취소", tone: "gray" };
    case "EXPIRED":
      return { label: "결제 시간 만료", tone: "gray" };
    case "REFUNDED":
      return { label: "환불 완료", tone: "blue" };
    default:
      return { label: status, tone: "gray" };
  }
}

/** 금액 한 줄 — "₩75,650 (🥬 3 + ₩15,650)" · "₩75,650 (현금)" · "₩40,000 (🥬 2)" (프로토타입 confirmSampleBuy 시스템 메시지의 금액부) */
export function payLine(p: Pick<PartnerPaymentView, "amount_total" | "amount_cel" | "amount_cash">, celIcon = "🥬"): string {
  const total = `₩${fmtNum(p.amount_total)}`;
  if (p.amount_cel > 0) {
    return p.amount_cash > 0 ? `${total} (${celIcon} ${p.amount_cel} + ₩${fmtNum(p.amount_cash)})` : `${total} (${celIcon} ${p.amount_cel})`;
  }
  return `${total} (현금)`;
}

/** 캠페인 상세 — "샘플 결제 ₩75,650 (🥬 3 + ₩15,650)". purchased 가 아니면 빈 문자열. campaigns.sample_* 열을 그대로 받는다. */
export function samplePaidLine(
  c: { purchased: boolean; sample_price: number | null; sample_cel: number; sample_cash: number },
  celIcon = "🥬",
): string {
  if (!c.purchased || c.sample_price === null) return "";
  return `샘플 결제 ${payLine({ amount_total: c.sample_price, amount_cel: c.sample_cel, amount_cash: c.sample_cash }, celIcon)}`;
}

/** 결제 화면 취소 규정 문구 (계획서 §5.7 · §7 4단계 "결제 화면 취소 규정 문구") */
export const SAMPLE_PAY_CANCEL_NOTICE = "브랜드가 샘플을 발송하기 전에는 고객센터로 취소를 요청할 수 있어요 · 발송 후에는 취소·환불이 되지 않아요";
/** 🥬 결제분 안내 — 현금과 달리 카드 명세에 없다 */
export const SAMPLE_PAY_CEL_NOTICE = "🥬 로 낸 금액은 셀러리 잔액에서 바로 차감돼요 · 취소 시 🥬 로 돌려받아요";

/* ---------------- app_partner_payment_claim (선점) 결과 ---------------- */

export type BeginSampleCode = "BAD_SHIPPING" | "BAD_ORDER_ID" | "NOT_FOUND" | "NOT_BUYABLE" | "INSUFFICIENT_CEL" | "CASH_TOO_SMALL" | "UNLISTED" | "DB_ERROR";

export const BEGIN_SAMPLE_CODES: readonly BeginSampleCode[] = [
  "BAD_SHIPPING",
  "BAD_ORDER_ID",
  "NOT_FOUND",
  "NOT_BUYABLE",
  "INSUFFICIENT_CEL",
  "CASH_TOO_SMALL",
  "UNLISTED",
  "DB_ERROR",
];

export function isBeginSampleCode(v: unknown): v is BeginSampleCode {
  return typeof v === "string" && (BEGIN_SAMPLE_CODES as readonly string[]).includes(v);
}

export type BeginSampleResult =
  | {
      ok: true;
      /** 같은 조건의 PENDING 을 재사용했다 (새 행 아님) */
      reused: boolean;
      paymentId: string;
      /** 토스 orderId (slrp_…) */
      orderId: string;
      orderName: string;
      amountTotal: number;
      amountCel: number;
      amountCash: number;
      /** false 면 위젯 없이 [🥬 n개로 받기] → 서버가 바로 확정 */
      cashRequired: boolean;
      useCel: boolean;
      expiresAt: string;
      quote: SampleQuote | null;
    }
  | {
      ok: false;
      code: BeginSampleCode;
      /** BAD_SHIPPING */
      field?: string;
      /** NOT_BUYABLE — free(무상 요청으로) · active(진행 중 캠페인으로) · locked · unlisted */
      mode?: SampleMode;
      reason?: SampleReason | null;
      quote?: SampleQuote | null;
      /** INSUFFICIENT_CEL · CASH_TOO_SMALL */
      cel?: number | null;
      balance?: number | null;
      cash?: number | null;
    };

/** app_partner_payment_claim jsonb → BeginSampleResult. 형식이 어긋나면 DB_ERROR. */
export function parseBeginSampleResult(json: unknown): BeginSampleResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "DB_ERROR" };
  if (o.ok === true) {
    const paymentId = strOrNull(o.payment_id);
    const orderId = strOrNull(o.order_id);
    const total = intOrNull(o.amount_total);
    const cash = intOrNull(o.amount_cash);
    if (!paymentId || !orderId || total === null || cash === null) return { ok: false, code: "DB_ERROR" };
    return {
      ok: true,
      reused: o.reused === true,
      paymentId,
      orderId,
      orderName: strOrNull(o.order_name) ?? "",
      amountTotal: total,
      amountCel: int(o.amount_cel),
      amountCash: cash,
      cashRequired: o.cash_required === true || cash > 0,
      useCel: o.use_cel === true,
      expiresAt: strOrNull(o.expires_at) ?? "",
      quote: parseSampleQuote(o.quote),
    };
  }
  const modeRaw = strOrNull(o.mode);
  const reasonRaw = strOrNull(o.reason);
  return {
    ok: false,
    code: isBeginSampleCode(o.code) ? o.code : "DB_ERROR",
    field: strOrNull(o.field) ?? undefined,
    mode: modeRaw && (MODES as readonly string[]).includes(modeRaw) ? (modeRaw as SampleMode) : undefined,
    reason: reasonRaw && (REASONS as readonly string[]).includes(reasonRaw) ? (reasonRaw as SampleReason) : null,
    quote: parseSampleQuote(o.quote),
    cel: intOrNull(o.cel),
    balance: intOrNull(o.balance),
    cash: intOrNull(o.cash),
  };
}

/* ---------------- app_partner_payment_confirm (확정) 결과 — RPC 단계. 라우트 결과(토스 취소 포함)는 payments/server ---------------- */

export type ConfirmSampleFnResult =
  | {
      ok: true;
      already: boolean;
      paymentId: string;
      campaignId: string | null;
      campaignCode: string | null;
      orderId: string | null;
      orderCode: string | null;
      amountCel: number;
      amountCash: number;
      balance: number | null;
    }
  | { ok: false; code: string; message: string | null; status?: string | null; campaignCode?: string | null; cel?: number | null; balance?: number | null };

export function parseConfirmSampleResult(json: unknown): ConfirmSampleFnResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "BAD_RESULT", message: null };
  if (o.ok === true) {
    const paymentId = strOrNull(o.payment_id);
    if (!paymentId) return { ok: false, code: "BAD_RESULT", message: null };
    return {
      ok: true,
      already: o.already === true,
      paymentId,
      campaignId: strOrNull(o.campaign_id),
      campaignCode: strOrNull(o.campaign_code),
      orderId: strOrNull(o.order_id),
      orderCode: strOrNull(o.order_code),
      amountCel: int(o.amount_cel),
      amountCash: int(o.amount_cash),
      balance: intOrNull(o.balance),
    };
  }
  return {
    ok: false,
    code: strOrNull(o.code) ?? "BAD_RESULT",
    message: strOrNull(o.message),
    status: strOrNull(o.status),
    campaignCode: strOrNull(o.campaign_code),
    cel: intOrNull(o.cel),
    balance: intOrNull(o.balance),
  };
}

/** app_partner_payment_{fail,cancel,refund} · app_partner_payment_confirming 의 공통 꼴 */
export type SimplePaymentFnResult =
  | { ok: true; already: boolean; status: string | null; claimed?: boolean; campaignId?: string | null; balance?: number | null }
  | { ok: false; code: string; message: string | null; status?: string | null };

export function parseSimplePaymentResult(json: unknown): SimplePaymentFnResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "BAD_RESULT", message: null };
  if (o.ok === true) {
    return {
      ok: true,
      already: o.already === true,
      status: strOrNull(o.status),
      claimed: typeof o.claimed === "boolean" ? o.claimed : undefined,
      campaignId: strOrNull(o.campaign_id),
      balance: intOrNull(o.balance),
    };
  }
  return { ok: false, code: strOrNull(o.code) ?? "BAD_RESULT", message: strOrNull(o.message), status: strOrNull(o.status) };
}

/* ---------------- 실패 코드 → 문구 (/pay/fail · 결제 화면 오류 · 선점 실패) ---------------- */

/**
 * 파트너 결제의 code 어휘. 고객 체크아웃(FAIL_MESSAGES, @sellery/payments/server/checkout-sync)과 겹치는 코드는 같은 뜻이지만
 * 문구는 인플루언서 콘솔용으로 따로 둔다(그 모듈은 서버 전용이라 .svelte 에서 못 쓴다).
 */
export const PARTNER_PAY_FAIL_MESSAGES: Record<string, string> = {
  NOT_BUYABLE: "지금은 이 상품의 샘플을 구매할 수 없어요",
  UNLISTED: "지금은 샘플을 구매할 수 없는 상품이에요",
  NOT_LISTED: "지금은 샘플을 구매할 수 없는 상품이에요",
  LOCKED: "이 상품은 독점 인플루언서가 확정되어 샘플 요청이 제한됩니다",
  ALREADY_ACTIVE: "이 상품은 이미 진행 중인 캠페인이 있어요",
  INSUFFICIENT_CEL: "셀러리(🥬)가 부족해요 — 현금으로 결제하거나 🥬 사용을 끄고 다시 시도해주세요",
  CEL_INSUFFICIENT: "결제 확인 중 셀러리(🥬) 잔액이 부족해 승인하지 않았어요 — 현금은 전액 취소됩니다",
  CASH_TOO_SMALL: "현금 결제 금액이 100원 미만이라 결제할 수 없어요 — 🥬 사용을 끄고 다시 시도해주세요",
  BAD_SHIPPING: "배송지를 확인해주세요 — 수취인 · 연락처 · 우편번호 · 주소는 필수예요",
  BAD_ORDER_ID: "결제 정보가 올바르지 않아요 — 다시 시도해주세요",
  NOT_FOUND: "결제 정보를 찾을 수 없어요",
  NOT_CONFIRMABLE: "이미 종료된 결제예요 — 다시 시도해주세요",
  AMOUNT_MISMATCH: "결제 금액이 주문과 달라 승인하지 않았어요",
  PAYMENT_MISMATCH: "결제 정보가 주문과 달라 승인하지 않았어요",
  PAYMENT_KEY_CONFLICT: "결제 정보가 다른 결제와 겹쳐 승인하지 않았어요",
  EXPIRED: "결제 시간이 만료되었어요 — 다시 시도해주세요",
  CONFIRMING: "결제를 확인하고 있어요 — 잠시 후 캠페인 목록에서 확인해주세요",
  CANCEL_PENDING: "샘플 구매를 완료하지 못했고 결제 취소를 처리 중이에요 — 잠시 후 카드사 내역을 확인해주세요",
  VIRTUAL_ACCOUNT_NOT_SUPPORTED: "가상계좌·계좌이체는 지원하지 않아요 — 카드·간편결제로 다시 시도해주세요",
  NOT_CONFIRMED: "결제가 승인되지 않았어요",
  CANCELED: "결제가 취소되었어요",
  PARTIAL_CANCELED: "결제가 일부 취소된 상태라 샘플 구매를 완료하지 못했어요 — 남은 금액은 자동 취소됩니다",
  ABORTED: "결제가 중단되었어요",
  SUPERSEDED: "새 결제 시도로 대체되었어요",
  CONFIRMED: "이미 결제가 완료된 건이에요",
  BAD_REQUEST: "요청 형식이 올바르지 않아요",
  BAD_ORIGIN: "요청 출처가 올바르지 않아요",
  UNAUTHORIZED: "로그인이 필요해요",
  FORBIDDEN: "본인의 결제만 처리할 수 있어요",
  BAD_RESULT: "결제 확인 중 문제가 생겼어요 — 잠시 후 다시 시도해주세요",
  DB_ERROR: "요청 중 문제가 생겼어요 — 잠시 후 다시 시도해주세요",
  // 토스 위젯 failUrl code (PAY_PROCESS_CANCELED 등) — 그 외 토스 code 는 message 원문
  PAY_PROCESS_CANCELED: "결제를 취소했어요",
  PAY_PROCESS_ABORTED: "결제가 중단되었어요 — 다시 시도해주세요",
  REJECT_CARD_COMPANY: "카드사에서 결제를 거절했어요 — 다른 카드로 시도해주세요",
};

export function partnerPayFailMessage(code: string | null | undefined, fallback?: string | null): string {
  return (code && PARTNER_PAY_FAIL_MESSAGES[code]) || fallback || "결제를 완료하지 못했어요 — 잠시 후 다시 시도해주세요";
}

/* ---------------- /pay/fail — 토스 failUrl 쿼리(code · message) 반사 규칙 (@sellery/payments checkout-rules failPageReason 과 같은 가드) ---------------- */

const FAIL_CODE_RE = /^[A-Z][A-Z0-9_]{1,79}$/;
const FAIL_MESSAGE_MAX = 120;
/** 공개 URL 파라미터를 화면에 비추므로 링크·전화번호 꼴은 버린다 */
const SPOOF_RE = /https?:\/\/|www\.|\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4}/i;

/** failUrl 의 code 를 형식 검사해 돌려준다 — 어긋나면 PAY_PROCESS_ABORTED */
export function partnerFailCode(code: string | null | undefined): string {
  const c = (code ?? "").trim();
  return FAIL_CODE_RE.test(c) ? c : "PAY_PROCESS_ABORTED";
}

/** code 가 우리 어휘면 그 문구, 아니면 토스 message(정제 · 스푸핑 패턴 제외) + 코드, 그것도 없으면 기본 문구 */
export function partnerFailPageReason(code: string | null | undefined, message: string | null | undefined): string {
  const c = partnerFailCode(code);
  if (PARTNER_PAY_FAIL_MESSAGES[c]) return PARTNER_PAY_FAIL_MESSAGES[c];
  const m = cleanText(message ?? "").slice(0, FAIL_MESSAGE_MAX);
  if (m && !SPOOF_RE.test(m)) return `${m} (코드 ${c})`;
  return `${partnerPayFailMessage(null)} (코드 ${c})`;
}
