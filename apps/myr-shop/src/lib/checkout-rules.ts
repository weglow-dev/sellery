/**
 * 체크아웃·결제 순수 규칙 — 입력 검증 · 토스 파라미터 · 실패 문구 · RPC 반환 파서 (테스트 src/test/checkout-rules.test.ts).
 * 셀러리 packages/payments checkout-rules.ts · checkout-sync 의 파서 · packages/db guest-order.ts 를 MYR 구조(줄 N개 · 주문 1건)로 복사.
 * Svelte·SvelteKit·DB 를 import 하지 않는다 — 라우트 · 화면 · vitest 공용.
 */
import { MAX_QTY } from './data';
import { cleanText, normalizePhone } from './text';

/* ---------------- 토스 식별자 ---------------- */

/** 토스 paymentKey / orderId 입력 형식 */
export const TOSS_KEY_RE = /^[A-Za-z0-9_-]{6,200}$/;
/** 토스 결제위젯 비회원 customerKey (SDK `ANONYMOUS` 와 같은 값) */
export const TOSS_ANONYMOUS_CUSTOMER_KEY = '@@ANONYMOUS';
/** 토스 orderId 접두 — 셀러리(`slry_` · `slrp_`)와 구분. 웹훅은 이 접두로 MYR 세션을 먼저 찾는다 */
export const ORDER_ID_PREFIX = 'myr_';
export const MYR_ORDER_ID_RE = /^myr_[A-Za-z0-9_-]{6,59}$/;
export const isMyrOrderId = (id: unknown): id is string => typeof id === 'string' && MYR_ORDER_ID_RE.test(id);
/** `myr_${ms}_${uuid 12자}` — myr_checkouts.toss_order_id check(6~64자) 안 */
export function generateOrderId(now = Date.now()): string {
	return `${ORDER_ID_PREFIX}${now}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

/* ---------------- 줄 ---------------- */

export const LINES_MAX = 20;
export const CODE_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
export type CheckoutLine = { code: string; qty: number; option_index: number };

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** 본문 `lines: [{ code, qty, optionIndex? }]` → 같은 (code, option) 합침. 형식 틀림·빈 배열·20줄 초과·합계 9 초과면 null */
export function parseLines(v: unknown): CheckoutLine[] | null {
	if (!Array.isArray(v) || v.length < 1 || v.length > LINES_MAX) return null;
	const by = new Map<string, CheckoutLine>();
	for (const raw of v) {
		const l = obj(raw);
		if (!l) return null;
		const code = typeof l.code === 'string' ? l.code.trim().toLowerCase() : '';
		const qty = l.qty;
		const opt = l.optionIndex === undefined ? 0 : l.optionIndex;
		if (!CODE_RE.test(code) || !Number.isInteger(qty) || (qty as number) < 1 || (qty as number) > MAX_QTY) return null;
		if (!Number.isInteger(opt) || (opt as number) < 0) return null;
		const key = `${code}#${opt}`;
		const cur = by.get(key);
		const sum = (cur?.qty ?? 0) + (qty as number);
		if (sum > MAX_QTY) return null;
		by.set(key, { code, qty: sum, option_index: opt as number });
	}
	return [...by.values()];
}

/* ---------------- 배송지 ---------------- */

export type Shipping = { recipient: string; phone: string; address1: string; address2?: string; postcode?: string; memo?: string };
export type ShippingDraft = { recipient: string; phone: string; address1: string; address2: string; postcode: string; memo: string };
export type ShippingField = keyof ShippingDraft;
export const EMPTY_DRAFT: ShippingDraft = { recipient: '', phone: '', address1: '', address2: '', postcode: '', memo: '' };
export const MEMO_MAX = 100;

/** 받는 분 필수 · 연락처 8~15자리 · 주소 필수(5자 이상) · 우편번호는 있으면 5자리 · 메모 100자. 통과하면 cleanText 된 값 */
export function validateShipping(d: ShippingDraft): { ok: true; shipping: Shipping } | { ok: false; field: ShippingField; message: string } {
	const recipient = cleanText(d.recipient).slice(0, 50);
	if (!recipient) return { ok: false, field: 'recipient', message: '받는 분 이름을 입력해주세요' };
	if (!d.phone.trim()) return { ok: false, field: 'phone', message: '연락처를 입력해주세요' };
	const phone = normalizePhone(d.phone);
	if (!phone) return { ok: false, field: 'phone', message: '연락처는 숫자 8~15자리로 입력해주세요' };
	const address1 = cleanText(d.address1).slice(0, 200);
	if (address1.length < 5) return { ok: false, field: 'address1', message: '주소를 동·호수까지 입력해주세요' };
	const postcode = d.postcode.replace(/\D/g, '');
	if (postcode && !/^\d{5}$/.test(postcode)) return { ok: false, field: 'postcode', message: '우편번호는 5자리예요' };
	const memo = cleanText(d.memo);
	if (memo.length > MEMO_MAX) return { ok: false, field: 'memo', message: `배송 메모는 ${MEMO_MAX}자까지 입력할 수 있어요` };
	const shipping: Shipping = { recipient, phone, address1 };
	const address2 = cleanText(d.address2).slice(0, 200);
	if (address2) shipping.address2 = address2;
	if (postcode) shipping.postcode = postcode;
	if (memo) shipping.memo = memo;
	return { ok: true, shipping };
}

/** 서버가 본문 `shipping` 객체를 받을 때 — 문자열이 아닌 값은 빈 문자열로 보고 같은 규칙 */
export function parseShippingBody(v: unknown): Shipping | null {
	const o = obj(v);
	if (!o) return null;
	const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
	const r = validateShipping({
		recipient: s('recipient'),
		phone: s('phone'),
		address1: s('address1'),
		address2: s('address2'),
		postcode: s('postcode'),
		memo: s('memo')
	});
	return r.ok ? r.shipping : null;
}

/* ---------------- 비회원 주문자 ---------------- */

export const GUEST_NAME_MAX = 50;
export const GUEST_EMAIL_MAX = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export type GuestBuyer = { name: string; phone: string; email: string | null };
export type GuestBuyerDraft = { name: string; phone: string; email: string; consent: boolean };
export type GuestBuyerField = 'name' | 'phone' | 'email' | 'consent';
export const EMPTY_GUEST_DRAFT: GuestBuyerDraft = { name: '', phone: '', email: '', consent: false };
export const GUEST_CONSENT_TEXT =
	'비회원 주문을 위해 이름·연락처·이메일(선택)·배송지를 수집·이용하는 데 동의합니다 — 주문 조회·배송·환불·문의 응대에 쓰고, 거래기록 보존 기간(5년) 뒤 파기합니다';

export function validateGuestBuyer(d: GuestBuyerDraft): { ok: true; buyer: GuestBuyer } | { ok: false; field: GuestBuyerField; message: string } {
	const name = cleanText(d.name).slice(0, GUEST_NAME_MAX);
	if (!name) return { ok: false, field: 'name', message: '주문자 이름을 입력해주세요' };
	if (!d.phone.trim()) return { ok: false, field: 'phone', message: '주문자 연락처를 입력해주세요' };
	const phone = normalizePhone(d.phone);
	if (!phone) return { ok: false, field: 'phone', message: '연락처는 숫자 8~15자리로 입력해주세요' };
	const emailRaw = d.email.trim();
	let email: string | null = null;
	if (emailRaw) {
		if (emailRaw.length > GUEST_EMAIL_MAX || !EMAIL_RE.test(emailRaw)) return { ok: false, field: 'email', message: '이메일 형식을 확인해주세요' };
		email = emailRaw;
	}
	if (!d.consent) return { ok: false, field: 'consent', message: '비회원 개인정보 수집·이용에 동의해주세요' };
	return { ok: true, buyer: { name, phone, email } };
}

export function parseGuestBody(v: unknown): GuestBuyer | null {
	const o = obj(v);
	if (!o) return null;
	const r = validateGuestBuyer({
		name: typeof o.name === 'string' ? o.name : '',
		phone: typeof o.phone === 'string' ? o.phone : '',
		email: typeof o.email === 'string' ? o.email : '',
		consent: o.consent === true
	});
	return r.ok ? r.buyer : null;
}

/** POST /api/checkout 본문 전체 */
export type CheckoutBody = { lines: CheckoutLine[]; shipping: Shipping; guest: GuestBuyer | null; saveAddress: boolean };
export function parseCheckoutBody(v: unknown): { ok: true; body: CheckoutBody } | { ok: false; message: string } {
	const o = obj(v);
	if (!o) return { ok: false, message: '요청 본문이 올바르지 않습니다' };
	const lines = parseLines(o.lines);
	if (!lines) return { ok: false, message: '주문 상품이 올바르지 않습니다 — 장바구니를 확인해주세요' };
	const shipping = parseShippingBody(o.shipping);
	if (!shipping) return { ok: false, message: '받는 분 이름·연락처·주소를 확인해주세요' };
	let guest: GuestBuyer | null = null;
	if (o.guest !== undefined && o.guest !== null) {
		guest = parseGuestBody(o.guest);
		if (!guest) return { ok: false, message: '주문자 이름·연락처와 개인정보 동의를 확인해주세요' };
	}
	return { ok: true, body: { lines, shipping, guest, saveAddress: o.saveAddress === true } };
}

/* ---------------- 비회원 쿠키 ---------------- */

/** 비회원 체크아웃 세션 쿠키(값 = myr_checkouts.id) — confirm 이 세션 소유 확인에 쓴다 · 45분 */
export const GUEST_CHECKOUT_COOKIE = 'myr_gck';
export const GUEST_CHECKOUT_COOKIE_MAX_AGE = 45 * 60;
/** 조회 토큰 쿠키 `myr_guest_<주문번호 소문자>` — 90일 · DB 에는 sha256 해시만 */
export const GUEST_TOKEN_COOKIE_MAX_AGE = 90 * 24 * 60 * 60;
export const GUEST_TOKEN_RE = /^[0-9a-f]{64}$/;
export const ORDER_CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;
export const guestTokenCookieName = (orderCode: string): string => `myr_guest_${orderCode.trim().toLowerCase()}`;
export const parseGuestToken = (raw: string | undefined | null): string | null => (GUEST_TOKEN_RE.test((raw ?? '').trim()) ? (raw ?? '').trim() : null);
export const guestOrderHref = (orderCode: string): string => `/orders/g/${encodeURIComponent(orderCode.trim().toLowerCase())}`;
const UUID_RE = /^[0-9a-f-]{36}$/;

/** 이 요청자가 그 결제 세션의 주인인가 — 회원은 user_id · 비회원은 서버가 심은 HttpOnly 쿠키(= 세션 id) */
export function ownsCheckout(session: { id: string; user_id: string | null }, who: { userId?: string | null; guestCheckoutId?: string | null }): boolean {
	if (session.user_id !== null) return !!who.userId && session.user_id === who.userId;
	return !!who.guestCheckoutId && UUID_RE.test(who.guestCheckoutId) && who.guestCheckoutId === session.id;
}

/* ---------------- 성공/실패 URL ---------------- */

export type SuccessParams = { paymentKey: string; orderId: string; amount: number };
/** `?paymentKey&orderId&amount` — amount 는 `^\d+$` 만 (Number() 로 먼저 파싱하지 않는다) */
export function parseSuccessParams(
	paymentKey: string | null | undefined,
	orderId: string | null | undefined,
	amount: string | null | undefined
): SuccessParams | null {
	if (!paymentKey || !orderId || !amount) return null;
	if (!TOSS_KEY_RE.test(paymentKey) || !TOSS_KEY_RE.test(orderId)) return null;
	if (!/^\d{1,15}$/.test(amount)) return null;
	const n = Number(amount);
	if (!Number.isSafeInteger(n) || n <= 0) return null;
	return { paymentKey, orderId, amount: n };
}

/** 세션 fail_code 와 같은 어휘의 서버 기본 문구 (실패 응답 `{ ok:false, code, message }`) */
export const FAIL_MESSAGES: Record<string, string> = {
	SOLD_OUT: '남은 수량이 부족합니다',
	NOT_AVAILABLE: '지금은 판매하지 않는 상품이 있어요',
	LINES_REJECTED: '주문할 수 없는 상품이 있어요 — 장바구니를 확인해주세요',
	AMOUNT_TOO_SMALL: '결제 금액은 100원 이상이어야 합니다',
	AMOUNT_MISMATCH: '결제 금액이 주문과 달라 승인하지 않았어요',
	PAYMENT_MISMATCH: '결제 정보가 주문과 달라 승인하지 않았어요',
	EXPIRED: '결제 시간이 만료되었습니다',
	CANCEL_PENDING: '주문을 완료하지 못했고 결제 취소를 처리 중이에요 — 잠시 후 카드사 내역을 확인해주세요',
	CONFIRMING: '결제를 확인하고 있어요 — 잠시 후 주문 내역에서 확인해주세요',
	PAYMENT_KEY_CONFLICT: '결제 정보가 다른 주문과 겹쳐 승인하지 않았어요',
	NOT_FOUND: '주문을 찾을 수 없습니다',
	UNAUTHORIZED: '로그인이 필요합니다',
	FORBIDDEN: '본인의 주문만 처리할 수 있습니다',
	BAD_REQUEST: '요청 형식이 올바르지 않습니다',
	BAD_ORIGIN: '요청 출처가 올바르지 않습니다',
	NOT_CONFIRMED: '결제가 승인되지 않았습니다',
	CANCELED: '결제가 취소되었습니다',
	PARTIAL_CANCELED: '결제가 일부 취소된 상태라 주문을 완료하지 못했어요 — 남은 금액은 자동 취소됩니다',
	ABORTED: '결제가 중단되었습니다',
	SUPERSEDED: '새 결제 시도로 대체되었습니다',
	TOO_MANY_REQUESTS: '결제 시도가 너무 많아요 — 잠시 후 다시 시도해주세요',
	DB_ERROR: '잠시 후 다시 시도해주세요',
	NO_SERVICE_KEY: '결제 서버 설정이 아직 없어요'
};
export const failMessage = (code: string, fallback?: string | null): string => fallback || FAIL_MESSAGES[code] || '결제 확인에 실패했어요';

/** 줄 거절 목록 → 사람이 읽을 한 줄 ("상품 A 남은 수량 2개 · 상품 B 판매 중지") */
export type RejectedItem = { code: string; reason: string; left?: number };
export function rejectedItemsText(items: RejectedItem[], nameOf: (code: string) => string): string {
	const part = (it: RejectedItem) => {
		const n = nameOf(it.code) || it.code;
		if (it.reason === 'SOLD_OUT') return `${n} 남은 수량 ${Math.max(0, it.left ?? 0)}개`;
		if (it.reason === 'NOT_AVAILABLE') return `${n} 판매 중지`;
		if (it.reason === 'NOT_FOUND') return `${n} 없는 상품`;
		return `${n} 옵션 오류`;
	};
	return items.map(part).join(' · ');
}

/** 성공 페이지 실패 뷰 — code → 문구 · 돈 상태 · 버튼 구성 */
export type FailText = { text: string; money: string; kind: 'final' | 'pending' };
export const FAIL_TEXT: Record<string, FailText> = {
	SOLD_OUT: {
		text: '남은 수량이 부족해 주문을 완료하지 못했어요 — 결제는 자동 취소됩니다',
		money: '승인된 결제는 자동 취소됩니다 · 승인 전이면 결제되지 않았습니다',
		kind: 'final'
	},
	NOT_AVAILABLE: { text: '판매가 중지된 상품이 있어 주문을 완료하지 못했어요 — 결제는 자동 취소됩니다', money: '승인된 결제는 자동 취소됩니다', kind: 'final' },
	AMOUNT_MISMATCH: { text: '결제 금액이 주문과 달라 승인하지 않았어요', money: '결제되지 않았습니다', kind: 'final' },
	PAYMENT_MISMATCH: { text: '결제 정보가 주문과 달라 승인하지 않았어요', money: '결제는 자동 취소됩니다', kind: 'final' },
	EXPIRED: { text: '결제 시간이 만료됐어요 — 장바구니에서 다시 시도해주세요', money: '결제되지 않았습니다', kind: 'final' },
	CANCEL_PENDING: {
		text: '주문을 완료하지 못했고 결제 취소를 처리 중이에요 — 잠시 후 카드사 내역을 확인해주세요',
		money: '결제 취소를 다시 시도하고 있어요',
		kind: 'pending'
	},
	CONFIRMING: { text: '결제를 확인하고 있어요 — 잠시 후 주문 내역에서 확인해주세요', money: '확인 중', kind: 'pending' },
	SUPERSEDED: { text: '다른 결제 시도로 대체된 주문이에요 — 장바구니에서 다시 결제해주세요', money: '결제되지 않았습니다', kind: 'final' },
	PARTIAL_CANCELED: { text: '결제가 일부 취소된 상태라 주문을 완료하지 못했어요 — 남은 금액은 자동 취소됩니다', money: '결제는 자동 취소됩니다', kind: 'final' }
};
const INTERNAL_CODES = new Set([
	'PAYMENT_KEY_CONFLICT',
	'NOT_FOUND',
	'UNAUTHORIZED',
	'FORBIDDEN',
	'BAD_ORIGIN',
	'BAD_REQUEST',
	'DB_ERROR',
	'BAD_RESULT',
	'TOO_MANY_REQUESTS',
	'TOSS_ERROR',
	'UNKNOWN',
	'NO_SERVICE_KEY'
]);
export const FAIL_FALLBACK = '결제 확인에 실패했어요 — 문의하기';
export function failText(code: string | null | undefined, message?: string | null): FailText {
	const c = (code ?? '').trim();
	if (c && FAIL_TEXT[c]) return FAIL_TEXT[c];
	if (!c || INTERNAL_CODES.has(c) || !message) return { text: FAIL_FALLBACK, money: '', kind: 'final' };
	return { text: `${message} (코드 ${c})`, money: '결제되지 않았습니다', kind: 'final' };
}

/* ---------------- /checkout/fail?code&message ---------------- */

export const FAIL_PAGE_DEFAULT = '결제가 취소되었거나 실패했습니다.';
const FAIL_CODE_RE = /^[A-Z_]{1,40}$/;
const SPOOF_RE = /https?:\/\/|www\.|\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{4}/i;
/** 공개 URL 파라미터 반사 — code 형식 밖이면 message 도 무시 · 120자 · URL/전화번호 모양이면 기본 문구 */
export function failPageReason(code: string | null | undefined, message: string | null | undefined): string {
	const c = (code ?? '').trim();
	if (!FAIL_CODE_RE.test(c)) return FAIL_PAGE_DEFAULT;
	if (c === 'PAY_PROCESS_CANCELED') return '결제를 취소했어요. 결제는 진행되지 않았습니다.';
	const m = cleanText(message ?? '').slice(0, 120);
	if (m && !SPOOF_RE.test(m)) return `${m} (코드 ${c})`;
	return `${FAIL_PAGE_DEFAULT} (코드 ${c})`;
}
export const FAIL_SESSION_DEFAULT_CODE = 'USER_CANCELED';
export const failSessionCode = (code: string | null | undefined): string =>
	FAIL_CODE_RE.test((code ?? '').trim()) ? (code ?? '').trim() : FAIL_SESSION_DEFAULT_CODE;

/* ---------------- RPC 반환 파서 (jsonb → 좁힌 타입 · 형식이 어긋나면 BAD_RESULT) ---------------- */

const str = (o: Record<string, unknown>, k: string): string | null => (typeof o[k] === 'string' ? (o[k] as string) : null);
const num = (o: Record<string, unknown>, k: string): number | null => (typeof o[k] === 'number' && Number.isFinite(o[k] as number) ? (o[k] as number) : null);

/** myr_checkout_brief() — PII 없음 */
export type CheckoutLite = {
	id: string;
	status: string;
	amount: number;
	items_amount: number;
	shipping_fee: number;
	order_name: string;
	user_id: string | null;
	toss_order_id: string;
	payment_key: string | null;
	fail_code: string | null;
	fail_message: string | null;
};
export const CHECKOUT_LITE_COLS = 'id, status, amount, items_amount, shipping_fee, order_name, user_id, toss_order_id, payment_key, fail_code, fail_message';
export function parseCheckoutLite(json: unknown): CheckoutLite | null {
	const o = obj(json);
	if (!o) return null;
	const id = str(o, 'id');
	const status = str(o, 'status');
	const amount = num(o, 'amount');
	const toss_order_id = str(o, 'toss_order_id');
	if (!id || !status || amount === null || !toss_order_id) return null;
	return {
		id,
		status,
		amount,
		items_amount: num(o, 'items_amount') ?? 0,
		shipping_fee: num(o, 'shipping_fee') ?? 0,
		order_name: str(o, 'order_name') ?? '',
		user_id: str(o, 'user_id'),
		toss_order_id,
		payment_key: str(o, 'payment_key'),
		fail_code: str(o, 'fail_code'),
		fail_message: str(o, 'fail_message')
	};
}

export type CreateResult = { ok: true; checkout: CheckoutLite } | { ok: false; code: string; message: string | null; items: RejectedItem[] };
export function parseCreateResult(json: unknown): CreateResult {
	const o = obj(json);
	if (!o) return { ok: false, code: 'BAD_RESULT', message: null, items: [] };
	if (o.ok === true) {
		const checkout = parseCheckoutLite(o.checkout);
		return checkout ? { ok: true, checkout } : { ok: false, code: 'BAD_RESULT', message: null, items: [] };
	}
	return { ok: false, code: str(o, 'code') ?? 'BAD_RESULT', message: str(o, 'message'), items: parseRejected(o.items) };
}
function parseRejected(v: unknown): RejectedItem[] {
	if (!Array.isArray(v)) return [];
	return v
		.map((x) => obj(x))
		.filter((x): x is Record<string, unknown> => !!x && typeof x.code === 'string' && typeof x.reason === 'string')
		.map((x) => ({ code: x.code as string, reason: x.reason as string, left: num(x, 'left') ?? undefined }));
}

export type ClaimResult = { ok: true; claimed: boolean; checkout: CheckoutLite } | { ok: false; code: string; message: string | null };
export function parseClaimResult(json: unknown): ClaimResult {
	const o = obj(json);
	if (!o) return { ok: false, code: 'BAD_RESULT', message: null };
	if (o.ok === true) {
		const checkout = parseCheckoutLite(o.checkout);
		return checkout ? { ok: true, claimed: o.claimed === true, checkout } : { ok: false, code: 'BAD_RESULT', message: null };
	}
	return { ok: false, code: str(o, 'code') ?? 'BAD_RESULT', message: str(o, 'message') };
}

export type ConfirmFnResult =
	| { ok: true; already: boolean; order_id: string; order_code: string; status: string }
	| { ok: false; code: string; message: string | null; items: RejectedItem[] };
export function parseConfirmResult(json: unknown): ConfirmFnResult {
	const o = obj(json);
	if (!o) return { ok: false, code: 'BAD_RESULT', message: null, items: [] };
	if (o.ok === true) {
		const order_id = str(o, 'order_id');
		const order_code = str(o, 'order_code');
		if (!order_id || !order_code) return { ok: false, code: 'BAD_RESULT', message: null, items: [] };
		return { ok: true, already: o.already === true, order_id, order_code, status: str(o, 'status') ?? 'PAID' };
	}
	return { ok: false, code: str(o, 'code') ?? 'BAD_RESULT', message: str(o, 'message'), items: parseRejected(o.items) };
}

/** myr_app_deposit_done / expire 반환 */
export type DepositResult = { ok: true; already: boolean; order_code: string; status: string } | { ok: false; code: string };
export function parseDepositResult(json: unknown): DepositResult {
	const o = obj(json);
	if (!o) return { ok: false, code: 'BAD_RESULT' };
	if (o.ok === true) return { ok: true, already: o.already === true, order_code: str(o, 'order_code') ?? '', status: str(o, 'status') ?? '' };
	return { ok: false, code: str(o, 'code') ?? 'BAD_RESULT' };
}

/** 가상계좌 입금 안내 — 토스 payment.virtualAccount 에서 성공 페이지가 보여줄 것만 */
export type DepositInfo = { bank: string; account: string; holder: string; due: string | null };
export function depositInfoOf(payment: unknown): DepositInfo | null {
	const p = obj(payment);
	const va = p ? obj(p.virtualAccount) : null;
	if (!va) return null;
	return { bank: str(va, 'bankCode') ?? '', account: str(va, 'accountNumber') ?? '', holder: str(va, 'customerName') ?? '', due: str(va, 'dueDate') };
}
