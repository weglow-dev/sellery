/**
 * 샘플 요청 · 캠페인 표시 규칙 — 순수 모듈 (브라우저 `.svelte` 와 서버 양쪽에서 import). DB 호출은 `../server/partner/{products,campaigns}.server.ts`.
 *
 * 숫자·판정은 **DB 함수 `app_sample_quote`(0011)** 가 한다(표시 금액 = 청구 금액, docs/inf-console-plan.md §5.3). 여기서는 그 jsonb 를
 * 타입으로 좁히고(`parseSampleQuote`), 버튼 문구로 바꾸고(`sampleButton` — 프로토타입 helpers.ts `sampleBtn` 의 분기 순서 그대로),
 * 배송지 폼 입력을 검증한다(`parseShippingInput` — 0011 `app_request_free_sample` 과 같은 조건·상한). 상태 칩은 `@sellery/core/constants` 의
 * `ST`(라벨·색·차례) 를 그대로 쓰고 색 이름만 콘솔 칩 톤으로 매핑한다.
 *
 * 3단계에서는 [샘플 구매] 버튼을 **비활성(4단계 예고)** 으로 그린다 — 결제(0012 · `/pay/*`) 가 붙으면 `SAMPLE_BUY_ENABLED` 만 true 로.
 */
import { FLOW, FLOW_L, ST } from "@sellery/core/constants";
import type { Status } from "@sellery/core/types";
import { fmtNum } from "../campaign";
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

/** 4단계(결제) 전까지 false — [샘플 구매 ₩N] 은 비활성 + "4단계 예고" 안내 */
export const SAMPLE_BUY_ENABLED = false;

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

export const BUY_COMING_SOON = "샘플 구매는 곧 열립니다 (결제 준비 중)";

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
