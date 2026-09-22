/**
 * 비회원 구매·주문 조회 순수 규칙 (owner 결정 2026-09-22 · docs/app-plan.md §6.1 `/orders/lookup` `/orders/g/[code]` · supabase/migrations/0021_guest_checkout.sql).
 * Svelte·SvelteKit·서버 모듈을 import 하지 않는다 — `+page.server.ts` · `.svelte` · vitest 공용.
 *
 * 쿠키 두 종류(둘 다 HttpOnly · Lax · prod Secure · Path=/):
 *   · `slry_gck` = checkout_sessions.id — 비회원 체크아웃(/api/checkout)이 발급, /api/payments/confirm 이 세션 소유 확인에 쓴다(회원의 user_id 대조를 대신). 45분.
 *   · `slry_guest_<주문번호>` = 조회 토큰 원문(64 hex) — 결제 확정 직후와 주문 조회 성공 시 발급(회전). `/orders/g/<code>` · 환불 API 가 검증. 90일.
 *   DB 에는 sha256 해시만 있다(customers.lookup_token_hash).
 */
import { cleanText, normalizePhone } from "./text";

/** 비회원 체크아웃 세션 쿠키 이름 (값 = checkout_sessions.id) */
export const GUEST_CHECKOUT_COOKIE = "slry_gck";
/** 체크아웃 세션 만료(30분) + 여유 */
export const GUEST_CHECKOUT_COOKIE_MAX_AGE = 45 * 60;

/** 조회 토큰 쿠키 수명 — CS client_token 쿠키(0018)와 같은 90일 */
export const GUEST_TOKEN_COOKIE_DAYS = 90;
export const GUEST_TOKEN_COOKIE_MAX_AGE = GUEST_TOKEN_COOKIE_DAYS * 24 * 60 * 60;

/** DB 가 만드는 토큰 형식 — gen_random_bytes(32) hex. 이 형식이 아니면 DB 를 부르지 않는다 */
export const GUEST_TOKEN_RE = /^[0-9a-f]{64}$/;

/** 주문번호 URL 세그먼트·입력 형식 — orders.server ORDER_CODE_RE 와 같은 규칙 (o2000~ · 화면은 대문자) */
export const GUEST_ORDER_CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;

/** `slry_guest_<주문번호 소문자>` — 주문번호는 대소문자 무시로 저장돼 있어 소문자로 고정 */
export function guestTokenCookieName(orderCode: string): string {
  return `slry_guest_${orderCode.trim().toLowerCase()}`;
}

/** 쿠키 값이 토큰 형식이면 그 값, 아니면 null */
export function parseGuestToken(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim();
  return GUEST_TOKEN_RE.test(v) ? v : null;
}

/** 비회원 주문 상세 경로 */
export function guestOrderHref(orderCode: string): string {
  return `/orders/g/${encodeURIComponent(orderCode.trim().toLowerCase())}`;
}

/* ---------------- /orders/lookup 폼 ---------------- */

export type GuestLookupInput = { orderCode: string; phone: string };
export type GuestLookupField = "code" | "phone";

/** 조회 실패 공통 문구 — 주문번호 없음·연락처 불일치·회원 주문을 구분하지 않는다(열거 방지) */
export const GUEST_LOOKUP_FAIL = "주문번호와 연락처가 일치하는 주문을 찾지 못했어요 — 주문 완료 화면의 주문번호(예: O2013)와 주문 시 입력한 연락처를 확인해주세요";

/**
 * 주문번호(공백·대소문자 무시, 앞의 '#' 허용) + 연락처(숫자 8~15자리) → 형식 통과값. 실패 시 어느 칸인지와 문구.
 * 주문번호는 소문자로 돌려준다(DB 는 lower() 비교 · 쿠키 이름도 소문자).
 */
export function parseGuestLookupInput(
  codeRaw: unknown,
  phoneRaw: unknown,
): { ok: true; input: GuestLookupInput } | { ok: false; field: GuestLookupField; message: string } {
  const code = cleanText(typeof codeRaw === "string" ? codeRaw : "").replace(/^#/, "").replace(/\s+/g, "").toLowerCase();
  if (!code) return { ok: false, field: "code", message: "주문번호를 입력해주세요" };
  if (!GUEST_ORDER_CODE_RE.test(code)) return { ok: false, field: "code", message: "주문번호 형식이 올바르지 않아요 (예: O2013)" };
  const phoneIn = typeof phoneRaw === "string" ? phoneRaw : "";
  if (!phoneIn.trim()) return { ok: false, field: "phone", message: "연락처를 입력해주세요" };
  const phone = normalizePhone(phoneIn);
  if (!phone) return { ok: false, field: "phone", message: "연락처는 숫자 8~15자리로 입력해주세요" };
  return { ok: true, input: { orderCode: code, phone } };
}

/* ---------------- 체크아웃 비회원 주문자 정보 ---------------- */

export const GUEST_NAME_MAX = 50;
export const GUEST_EMAIL_MAX = 200;
/** 느슨한 이메일 형식 — 영수증·연락용 선택 항목이라 존재 검증은 하지 않는다 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type GuestBuyer = { name: string; phone: string; email: string | null };
export type GuestBuyerField = "name" | "phone" | "email" | "consent";

/** 체크아웃 폼 상태(문자열) — 제출 시 validateGuestBuyer() 가 GuestBuyer 로 좁힌다 */
export type GuestBuyerDraft = { name: string; phone: string; email: string; consent: boolean };
export const EMPTY_GUEST_DRAFT: GuestBuyerDraft = { name: "", phone: "", email: "", consent: false };

/** 비회원 개인정보 수집·이용 동의 문구 (privacy.ts 제2조의3 과 짝 — 앵커 /privacy#guest) */
export const GUEST_CONSENT_TEXT =
  "비회원 주문을 위해 이름·연락처·이메일(선택)·배송지를 수집·이용하는 데 동의합니다 — 주문 조회·배송·환불·문의 응대에 쓰고, 거래기록 보존 기간(5년) 뒤 파기합니다";
export const PRIVACY_GUEST_HREF = "/privacy#guest";

/**
 * 이름 필수(cleanText · 50자) · 연락처 필수 + normalizePhone · 이메일 선택(형식만 · 200자) · 동의 필수.
 * 서버(/api/checkout)가 같은 규칙으로 다시 검사한다.
 */
export function validateGuestBuyer(d: GuestBuyerDraft): { ok: true; buyer: GuestBuyer } | { ok: false; field: GuestBuyerField; message: string } {
  const name = cleanText(d.name).slice(0, GUEST_NAME_MAX);
  if (!name) return { ok: false, field: "name", message: "주문자 이름을 입력해주세요" };
  if (!d.phone.trim()) return { ok: false, field: "phone", message: "주문자 연락처를 입력해주세요" };
  const phone = normalizePhone(d.phone);
  if (!phone) return { ok: false, field: "phone", message: "연락처는 숫자 8~15자리로 입력해주세요" };
  const emailRaw = d.email.trim();
  let email: string | null = null;
  if (emailRaw) {
    if (emailRaw.length > GUEST_EMAIL_MAX || !EMAIL_RE.test(emailRaw)) return { ok: false, field: "email", message: "이메일 형식을 확인해주세요" };
    email = emailRaw;
  }
  if (!d.consent) return { ok: false, field: "consent", message: "비회원 개인정보 수집·이용에 동의해주세요" };
  return { ok: true, buyer: { name, phone, email } };
}

/** /api/checkout 본문의 `guest` 객체 → GuestBuyer (형식 검사만 — 동의는 클라이언트 체크박스 + 본문 `consent:true`) */
export function parseGuestBody(v: unknown): GuestBuyer | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const r = validateGuestBuyer({
    name: typeof o.name === "string" ? o.name : "",
    phone: typeof o.phone === "string" ? o.phone : "",
    email: typeof o.email === "string" ? o.email : "",
    consent: o.consent === true,
  });
  return r.ok ? r.buyer : null;
}

/* ---------------- RPC 반환 파서 ---------------- */

export type GuestLookupResult = { ok: true; orderId: string; orderCode: string; customerId: string; token: string } | { ok: false; code: "NOT_FOUND" | "BAD_RESULT" };

/** app_guest_order_lookup 반환 → 앱 모양. 토큰 형식이 어긋나면 BAD_RESULT (쿠키에 이상한 값을 싣지 않는다) */
export function parseGuestLookupResult(json: unknown): GuestLookupResult {
  if (!json || typeof json !== "object" || Array.isArray(json)) return { ok: false, code: "BAD_RESULT" };
  const o = json as Record<string, unknown>;
  if (o.ok !== true) return { ok: false, code: o.code === "NOT_FOUND" ? "NOT_FOUND" : "BAD_RESULT" };
  const orderId = typeof o.order_id === "string" ? o.order_id : "";
  const orderCode = typeof o.order_code === "string" ? o.order_code : "";
  const customerId = typeof o.customer_id === "string" ? o.customer_id : "";
  const token = parseGuestToken(typeof o.token === "string" ? o.token : null);
  if (!orderId || !orderCode || !customerId || !token) return { ok: false, code: "BAD_RESULT" };
  return { ok: true, orderId, orderCode, customerId, token };
}
