/**
 * 체크아웃 순수 규칙 — URL 파라미터 · 배송지 검증 · 성공/실패 페이지 문구 매핑. web/src/components/checkout/rules.ts 의 이식 (docs/monorepo-migration.md §3.2).
 * Svelte·SvelteKit 을 import 하지 않는다 (`+page.server.ts` · `.svelte` · vitest 모두에서 쓴다). `@/lib/*` → `@sellery/db/*`.
 *
 * 원문 출처: ux-spec §3.4(배송 정보 검증 문구) · §3.5(실패 사유) · app-plan §6.3(성공 페이지 code → 문구 표 — 원본).
 */
import { CAMPAIGN_CODE_RE } from "@sellery/db/campaign";
import { cleanText, normalizePhone } from "@sellery/db/text";
import type { Shipping } from "@sellery/db/types";

/* ---------------- /checkout?c&o&q ---------------- */

export const QTY_MIN = 1;
export const QTY_MAX = 10;

export type CheckoutParams = { code: string; optionIndex: number; qty: number };

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function intParam(v: string | undefined): number | null {
  if (typeof v !== "string" || !/^\d{1,3}$/.test(v)) return null;
  return Number(v);
}

/**
 * `?c={code}&o={optIdx}&q={qty}` → { code, optionIndex, qty } — 형식이 어긋나면 null.
 * 옵션 개수 상한(카드의 options.length)은 카드를 읽은 뒤 호출자가 검사한다.
 */
export function parseCheckoutParams(sp: Record<string, string | string[] | undefined>): CheckoutParams | null {
  const code = (first(sp.c) ?? "").trim().toLowerCase();
  if (!CAMPAIGN_CODE_RE.test(code)) return null;
  const optionIndex = intParam(first(sp.o));
  const qty = intParam(first(sp.q));
  if (optionIndex === null || qty === null) return null;
  if (qty < QTY_MIN || qty > QTY_MAX) return null;
  return { code, optionIndex, qty };
}

/** `/checkout?c=&o=&q=` (BuyCta 의 checkoutUrl 과 같은 모양 — 서버에서도 쓰기 위해 별도 정의) */
export function checkoutHref(code: string, optionIndex: number, qty: number): string {
  return `/checkout?c=${encodeURIComponent(code)}&o=${optionIndex}&q=${qty}`;
}

/* ---------------- 배송지 폼 ---------------- */

/** 폼 상태 — 전부 문자열 (입력 원문). 제출 시 validateShipping() 이 Shipping 으로 좁힌다. */
export type ShippingDraft = {
  recipient: string;
  phone: string;
  postcode: string;
  address1: string;
  address2: string;
  memo: string;
};

export const EMPTY_DRAFT: ShippingDraft = { recipient: "", phone: "", postcode: "", address1: "", address2: "", memo: "" };

export type ShippingField = keyof ShippingDraft;

export const MEMO_MAX = 100;

/**
 * 클라이언트 검증 (서버 /api/checkout 이 같은 규칙으로 다시 검사한다 — cleanText 는 서버 저장 시점).
 *   받는 분 필수 · 연락처 필수 + normalizePhone(숫자 8~15자리) · 우편번호 5자리 · 주소 필수 · 상세 주소/메모 선택(메모 100자)
 * 통과하면 phone 은 정규화값('010-1234-5678' → '01012345678').
 */
export function validateShipping(d: ShippingDraft): { ok: true; shipping: Shipping } | { ok: false; field: ShippingField; message: string } {
  const recipient = d.recipient.trim();
  if (!recipient) return { ok: false, field: "recipient", message: "받는 분 이름을 입력해주세요" };
  if (!d.phone.trim()) return { ok: false, field: "phone", message: "연락처를 입력해주세요" };
  const phone = normalizePhone(d.phone);
  if (!phone) return { ok: false, field: "phone", message: "연락처는 숫자 8~15자리로 입력해주세요" };
  const postcode = d.postcode.replace(/\D/g, "");
  if (!/^\d{5}$/.test(postcode)) return { ok: false, field: "postcode", message: "우편번호 5자리를 입력해주세요" };
  const address1 = d.address1.trim();
  if (!address1) return { ok: false, field: "address1", message: "주소를 입력해주세요" };
  const memo = d.memo.trim();
  if (memo.length > MEMO_MAX) return { ok: false, field: "memo", message: `배송 메모는 ${MEMO_MAX}자까지 입력할 수 있어요` };
  const shipping: Shipping = { recipient, phone, postcode, address1 };
  const address2 = d.address2.trim();
  if (address2) shipping.address2 = address2;
  if (memo) shipping.memo = memo;
  return { ok: true, shipping };
}

/** 통신판매중개자 확인 문구 (ux-spec §3.4 5 — 원문 재사용) */
export function mediatorText(brandName: string): string {
  return `셀러리는 통신판매중개자로 거래 당사자가 아니며, 상품·거래 정보의 책임은 공급 브랜드(${brandName})에 있음을 확인합니다`;
}

/** 개인정보처리방침의 제3자 제공 조항 앵커 — 체크아웃 확인 문구의 [자세히] 링크 (@sellery/db/legal/privacy 섹션 id 계약) */
export const PRIVACY_THIRD_PARTY_HREF = "/privacy#third-party";

/**
 * 개인정보 제3자 제공 고지 — 통신판매중개자 확인 체크박스 문구 끝에 붙는다.
 * 배송지 필드(recipient·phone·address·memo)는 브랜드 발주 CSV·택배사로 흘러가므로 제공 상대(판매 브랜드)를 결제 전에 알린다.
 */
export function thirdPartyText(brandName: string): string {
  return `주문·배송을 위해 수령인 정보(이름·연락처·주소·배송 메모)가 판매 브랜드 ${brandName} 에 제공되는 데 동의합니다`;
}

/* ---------------- /checkout/success?paymentKey&orderId&amount ---------------- */

/** 토스 paymentKey / orderId 형식 (app-plan §6.2 와 동일) */
export const TOSS_KEY_RE = /^[A-Za-z0-9_-]{6,200}$/;

export type SuccessParams = { paymentKey: string; orderId: string; amount: number };

/**
 * 셋 중 하나라도 없거나 amount 가 `^\d+$` 가 아니면 null — `Number()` 로 먼저 파싱하지 않는다('1e4'·소수·공백 통과 방지).
 */
export function parseSuccessParams(
  paymentKey: string | null | undefined,
  orderId: string | null | undefined,
  amount: string | null | undefined,
): SuccessParams | null {
  if (!paymentKey || !orderId || !amount) return null;
  if (!TOSS_KEY_RE.test(paymentKey) || !TOSS_KEY_RE.test(orderId)) return null;
  if (!/^\d{1,15}$/.test(amount)) return null;
  const n = Number(amount);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return { paymentKey, orderId, amount: n };
}

/** 실패 뷰 한 줄 — text 는 §6.3 문구, money 는 돈 상태 안내, kind 는 버튼 구성 */
export type FailText = {
  text: string;
  money: string;
  /** "final" 판매 페이지로/문의하기 · "pending" 내 주문 링크(확인 중·취소 처리 중) */
  kind: "final" | "pending";
};

/** app-plan §6.3 표 — 성공 페이지 실패 뷰의 code → 문구 (원본) */
export const FAIL_TEXT: Record<string, FailText> = {
  NOT_LIVE: {
    text: "현재 판매 중이 아닙니다 — 결제는 자동 취소됩니다",
    money: "승인된 결제는 자동 취소됩니다 · 승인 전이면 결제되지 않았습니다",
    kind: "final",
  },
  SOLD_OUT: {
    text: "남은 수량이 부족해 주문을 완료하지 못했어요 — 결제는 자동 취소됩니다",
    money: "승인된 결제는 자동 취소됩니다 · 승인 전이면 결제되지 않았습니다",
    kind: "final",
  },
  AMOUNT_MISMATCH: { text: "결제 금액이 주문과 달라 승인하지 않았어요", money: "결제되지 않았습니다", kind: "final" },
  PAYMENT_MISMATCH: { text: "결제 금액이 주문과 달라 승인하지 않았어요", money: "결제는 자동 취소됩니다", kind: "final" },
  EXPIRED: { text: "결제 시간이 만료됐어요 — 판매 페이지에서 다시 시도해주세요", money: "결제되지 않았습니다", kind: "final" },
  VIRTUAL_ACCOUNT_NOT_SUPPORTED: {
    text: "가상계좌·계좌이체는 지원하지 않아요 — 카드·간편결제로 다시 시도해주세요",
    money: "결제는 자동 취소됩니다",
    kind: "final",
  },
  CANCEL_PENDING: {
    text: "주문을 완료하지 못했고 결제 취소를 처리 중이에요 — 잠시 후 내 주문 또는 카드사 내역을 확인해주세요",
    money: "결제 취소를 다시 시도하고 있어요",
    kind: "pending",
  },
  CONFIRMING: { text: "결제를 확인하고 있어요 — 잠시 후 내 주문에서 확인해주세요", money: "확인 중", kind: "pending" },
  SUPERSEDED: {
    text: "다른 결제 시도로 대체된 주문이에요 — 판매 페이지에서 다시 결제해주세요",
    money: "결제되지 않았습니다",
    kind: "final",
  },
};

/** 앱 자체 어휘 — 표에 없으면 "그 외" 문구. 이 집합 밖의 code 는 토스 code 로 본다(message 원문 + 코드). */
const INTERNAL_CODES = new Set([
  "PAYMENT_KEY_CONFLICT",
  "NOT_FOUND",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "BAD_ORIGIN",
  "BAD_REQUEST",
  "DB_ERROR",
  "BAD_RESULT",
  "TOO_MANY_REQUESTS",
  "TOSS_ERROR",
  "UNKNOWN",
]);

export const FAIL_FALLBACK = "결제 확인에 실패했어요 — 문의하기";

/**
 * confirm 실패 응답 { code, message } → 실패 뷰 문구.
 *   §6.3 표의 code → 표 문구 · 앱 자체 code → "결제 확인에 실패했어요 — 문의하기" · 그 외(토스 code) → 토스 message 원문 + 코드
 */
export function failText(code: string | null | undefined, message?: string | null): FailText {
  const c = (code ?? "").trim();
  if (c && FAIL_TEXT[c]) return FAIL_TEXT[c];
  if (!c || INTERNAL_CODES.has(c) || !message) return { text: FAIL_FALLBACK, money: "", kind: "final" };
  return { text: `${message} (코드 ${c})`, money: "결제되지 않았습니다", kind: "final" };
}

/* ---------------- /checkout/fail?code&message ---------------- */

export const FAIL_PAGE_DEFAULT = "결제가 취소되었거나 실패했습니다.";

/** 토스 에러 code 형식 (대문자·밑줄). 이 형식이 아니면 공개 URL 로 들어온 message 도 믿지 않는다. */
const FAIL_CODE_RE = /^[A-Z_]{1,40}$/;
const FAIL_MESSAGE_MAX = 120;
/** 콘텐츠 스푸핑(가짜 고객센터 전화·계좌·링크) 차단 — URL 또는 전화번호 모양이 들어 있으면 기본 문구 */
const SPOOF_RE = /https?:\/\/|www\.|\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4}/i;

/**
 * failUrl 랜딩 사유 (ux-spec §3.5): PAY_PROCESS_CANCELED → 고객 취소 문구 · 그 외 토스 message + 코드.
 * 공개 URL 파라미터를 본문에 반사하므로: code 는 ^[A-Z_]{1,40}$ 만(아니면 message 도 무시), message 는 cleanText 후 120자,
 * URL·전화번호 패턴이 들어 있으면 기본 문구로 대체한다.
 */
export function failPageReason(code: string | null | undefined, message: string | null | undefined): string {
  const c = (code ?? "").trim();
  if (!FAIL_CODE_RE.test(c)) return FAIL_PAGE_DEFAULT;
  if (c === "PAY_PROCESS_CANCELED") return "결제를 취소했어요. 결제는 진행되지 않았습니다.";
  const m = cleanText(message ?? "").slice(0, FAIL_MESSAGE_MAX);
  if (m && !SPOOF_RE.test(m)) return `${m} (코드 ${c})`;
  return `${FAIL_PAGE_DEFAULT} (코드 ${c})`;
}

/* ---------------- 성공 페이지 ↔ 체크아웃 복귀 링크 (sessionStorage) ---------------- */

/** successUrl 은 쿼리 없이 고정이라(app-plan §7.1) 실패 뷰의 "판매 페이지로"·"다시 시도" 링크를 결제 직전에 저장해 둔다 */
export const RETURN_KEY = "slry_checkout_return";

export type CheckoutReturn = { store: string; retry: string };

export function parseCheckoutReturn(raw: string | null): CheckoutReturn | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { store?: unknown; retry?: unknown };
    const store = typeof o.store === "string" && /^\/(?![\/\\])/.test(o.store) ? o.store : null;
    const retry = typeof o.retry === "string" && o.retry.startsWith("/checkout?") ? o.retry : null;
    if (!store || !retry) return null;
    return { store, retry };
  } catch {
    return null;
  }
}
