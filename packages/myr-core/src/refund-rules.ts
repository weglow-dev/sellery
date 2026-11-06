/** 환불 순수 규칙 — 입력 검증 · 화면 판정 · RPC 파서 · 토스 Idempotency-Key (테스트 src/test/refund-rules.test.ts). docs/myr.md §6.3. */
import { ORDER_CODE_RE } from './checkout-rules';
import { cleanText } from './text';
import type { OrderItem, OrderView } from './order-view';

/** note = 제품별 상세 내용(선택 · 크리에이터에게 전달 · 0067 줄 refund_reason 에 "사유 — 상세") · photos = 올린 사진 경로(0068 · 줄당 3장) — 금액·Idempotency-Key 에는 쓰지 않는다 */
export type RefundLine = { item_id: string; qty: number; note?: string; photos?: string[] };
export const UUID_RE = /^[0-9a-f-]{36}$/;
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export const REFUND_REASONS = ['단순 변심', '주문 실수', '배송 지연', '상품 불량·파손', '기타'] as const;
export const REASON_MAX = 200;
export const REFUND_NOTE_MAX = 300;

/* ---- 사진(0068) — 버킷 myr-refunds · 경로 <order id>/<item id>/<uuid>.<ext> ---- */
export const REFUND_PHOTO_MAX = 3;
/** 버킷 한도 5MB · Vercel 서버리스 본문 4.5MB 가 먼저 막는다 → 4MB */
export const REFUND_PHOTO_MAX_BYTES = 4 * 1024 * 1024;
export const REFUND_PHOTO_TYPES: Readonly<Record<string, string>> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const REFUND_PHOTO_ACCEPT = Object.keys(REFUND_PHOTO_TYPES).join(',');
const PHOTO_PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
export const refundPhotoPath = (orderId: string, itemId: string, ext: string, rand: string = crypto.randomUUID()): string => `${orderId}/${itemId}/${rand}.${ext}`;
/** 형식 + (주면) 그 주문(·줄) 아래인지 */
export function isRefundPhotoPath(path: string, orderId?: string, itemId?: string): boolean {
	if (!PHOTO_PATH_RE.test(path)) return false;
	if (orderId && !path.startsWith(`${orderId}/`)) return false;
	if (itemId && !path.startsWith(`${orderId}/${itemId}/`)) return false;
	return true;
}
/** 매직 바이트로 jpeg/png/webp 판별 — 브라우저가 준 MIME 은 믿지 않는다 */
export function sniffImageType(b: Uint8Array): { type: string; ext: string } | null {
	if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
	if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return { type: 'image/png', ext: 'png' };
	if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { type: 'image/webp', ext: 'webp' };
	return null;
}

/** POST /api/payments/cancel 본문 `{ orderCode, items?: [{ itemId, qty, note?, photos? }], reason? }` — items 비우면 전체 · note 는 정리해 300자(비면 뺀다) · photos 는 경로 형식 3장까지(비면 뺀다). 형식 틀리면 null */
export function parseCancelBody(v: unknown): { orderCode: string; items: RefundLine[]; reason: string } | null {
	const b = obj(v);
	if (!b) return null;
	const orderCode = typeof b.orderCode === 'string' ? b.orderCode.trim().toLowerCase() : '';
	if (!ORDER_CODE_RE.test(orderCode)) return null;
	const items: RefundLine[] = [];
	if (b.items !== undefined && b.items !== null) {
		if (!Array.isArray(b.items) || b.items.length > 50) return null;
		for (const raw of b.items) {
			const l = obj(raw);
			if (!l || typeof l.itemId !== 'string' || !UUID_RE.test(l.itemId) || !Number.isInteger(l.qty) || (l.qty as number) < 1 || (l.qty as number) > 99)
				return null;
			if (l.note !== undefined && l.note !== null && typeof l.note !== 'string') return null;
			const note = cleanText(typeof l.note === 'string' ? l.note : '').slice(0, REFUND_NOTE_MAX);
			const line: RefundLine = { item_id: l.itemId, qty: l.qty as number };
			if (note) line.note = note;
			if (l.photos !== undefined && l.photos !== null) {
				if (!Array.isArray(l.photos) || l.photos.length > REFUND_PHOTO_MAX || !l.photos.every((p) => typeof p === 'string' && isRefundPhotoPath(p))) return null;
				if (l.photos.length) line.photos = [...new Set(l.photos as string[])];
			}
			items.push(line);
		}
	}
	const reason = cleanText(typeof b.reason === 'string' ? b.reason : '').slice(0, REASON_MAX);
	return { orderCode, items, reason };
}

/** 고객이 이 주문의 [교환 · 환불 신청] 페이지를 열 수 있나 — 남은 수량이 있는 줄이 있을 때 · PAID/PARTIAL_REFUNDED · WAITING_DEPOSIT(입금 전 취소).
 *  줄마다 길이 갈린다: 결제완료(발주 전) 줄 = 셀프 즉시 환불(`customerRefundableItems` · 서버 `myr_app_refund_precheck`) · 배송준비중 이후 줄 = 교환·환불 요청(0078 · claim-rules `claimableItems`) */
export function customerCanRefund(o: Pick<OrderView, 'status' | 'items'>): { ok: true; deposit: boolean } | { ok: false; reason: string } {
	if (o.status === 'WAITING_DEPOSIT') return { ok: true, deposit: true };
	if (o.status === 'REFUNDED') return { ok: false, reason: '이미 환불된 주문이에요' };
	if (o.status === 'CANCELED') return { ok: false, reason: '취소된 주문이에요' };
	if (refundableItems(o.items).length) return { ok: true, deposit: false };
	return { ok: false, reason: '환불할 수 있는 상품이 없어요' };
}

/** 남은 수량이 있는 줄 (취소된 줄 제외) — 셀러 · 관리자 환불과 "전부 환불(배송비)" 판정의 기준 */
export const refundableItems = (items: OrderItem[]): OrderItem[] => items.filter((i) => i.status !== 'CANCELED' && i.qty - i.refundedQty > 0);
/** 고객이 직접 환불할 수 있는 줄 — 남은 수량 + 아직 발주 전(결제완료) */
export const customerRefundableItems = (items: OrderItem[]): OrderItem[] => refundableItems(items).filter((i) => i.shipStatus === 'PAID');
export const remainingQty = (i: OrderItem): number => Math.max(0, i.qty - i.refundedQty);

/** 화면 추정 금액 — 서버(precheck)가 다시 계산한다. 전부 환불이면 배송비(아직 안 돌려준 만큼) 포함 */
export function estimateRefund(
	o: Pick<OrderView, 'items' | 'shippingFee' | 'refundAmount' | 'amount'>,
	lines: RefundLine[]
): { amount: number; full: boolean } {
	const byId = new Map(o.items.map((i) => [i.id, i]));
	let amount = 0;
	let req = 0;
	for (const l of lines) {
		const it = byId.get(l.item_id);
		if (!it) continue;
		const q = Math.min(l.qty, remainingQty(it));
		amount += it.unitPrice * q;
		req += q;
	}
	const left = refundableItems(o.items).reduce((n, i) => n + remainingQty(i), 0);
	const full = left > 0 && req >= left;
	if (full && o.shippingFee > 0 && o.refundAmount + amount + o.shippingFee <= o.amount) amount += o.shippingFee;
	return { amount, full };
}

/** 토스 Idempotency-Key — 같은 주문·같은 줄 묶음의 재시도는 같은 키(토스가 같은 응답) · 다른 묶음은 다른 키. ≤ 300자.
 *  tag = 교환·환불 요청 코드(0078) — 요청에서 나간 환불은 요청마다 키가 달라야 한다(같은 줄 · 같은 수량이라도 차감 금액이 다를 수 있다) */
export function refundIdempotencyKey(orderId: string, items: RefundLine[], tag?: string): string {
	const part = [...items]
		.map((i) => `${i.item_id.slice(0, 8)}.${i.qty}`)
		.sort()
		.join('_');
	return `${orderId}:${part || 'all'}${tag ? `:${tag}` : ''}`.slice(0, 300);
}

/** 요청에서 나가는 환불의 실제 금액 — precheck 금액(줄 + 마지막이면 배송비)에서 왕복 배송비 차감. 차감이 금액 이상이거나 음수면 null(환불하지 않는다) */
export function deductedAmount(amount: number, deduction = 0): number | null {
	if (!Number.isInteger(deduction) || deduction < 0) return null;
	if (deduction === 0) return amount;
	return deduction < amount ? amount - deduction : null;
}

/* ---- RPC 파서 ---- */
const str = (o: Record<string, unknown>, k: string): string | null => (typeof o[k] === 'string' ? (o[k] as string) : null);
const num = (o: Record<string, unknown>, k: string): number | null => (typeof o[k] === 'number' && Number.isFinite(o[k] as number) ? (o[k] as number) : null);

export type PrecheckOk = {
	ok: true;
	orderCode: string;
	orderStatus: string;
	paymentKey: string | null;
	amount: number;
	deposit: boolean;
	full: boolean;
	items: { item_id: string; qty: number; amount: number; seller_id: string | null }[];
};
export type PrecheckResult = PrecheckOk | { ok: false; code: string; status?: string; items?: { item_id: string; reason: string; left: number }[] };
export function parsePrecheckResult(json: unknown): PrecheckResult {
	const o = obj(json);
	if (!o) return { ok: false, code: 'BAD_RESULT' };
	if (o.ok === true) {
		const orderCode = str(o, 'order_code');
		const amount = num(o, 'amount');
		if (!orderCode || amount === null) return { ok: false, code: 'BAD_RESULT' };
		const items = (Array.isArray(o.items) ? o.items : [])
			.map(obj)
			.filter((x): x is Record<string, unknown> => !!x && typeof x.item_id === 'string')
			.map((x) => ({ item_id: x.item_id as string, qty: num(x, 'qty') ?? 0, amount: num(x, 'amount') ?? 0, seller_id: str(x, 'seller_id') }));
		return {
			ok: true,
			orderCode,
			orderStatus: str(o, 'order_status') ?? '',
			paymentKey: str(o, 'payment_key'),
			amount,
			deposit: o.deposit === true,
			full: o.full === true,
			items
		};
	}
	const items = (Array.isArray(o.items) ? o.items : [])
		.map(obj)
		.filter((x): x is Record<string, unknown> => !!x && typeof x.item_id === 'string')
		.map((x) => ({ item_id: x.item_id as string, reason: str(x, 'reason') ?? '', left: num(x, 'left') ?? 0 }));
	return { ok: false, code: str(o, 'code') ?? 'BAD_RESULT', status: str(o, 'status') ?? undefined, items };
}

export type RecordResult = { ok: true; already: boolean; orderCode: string; status: string; amount: number } | { ok: false; code: string };
export function parseRecordResult(json: unknown): RecordResult {
	const o = obj(json);
	if (!o) return { ok: false, code: 'BAD_RESULT' };
	if (o.ok === true)
		return { ok: true, already: o.already === true, orderCode: str(o, 'order_code') ?? '', status: str(o, 'status') ?? '', amount: num(o, 'amount') ?? 0 };
	return { ok: false, code: str(o, 'code') ?? 'BAD_RESULT' };
}

/** 실패 code → 고객 문구 */
export const REFUND_MESSAGES: Record<string, string> = {
	NOT_FOUND: '주문을 찾을 수 없어요',
	SHIPPED: '출고 준비가 시작된 상품은 교환·환불 요청으로 신청해주세요',
	WRONG_STATUS: '환불할 수 없는 상태의 주문이에요',
	BAD_ITEMS: '환불 수량을 확인해주세요',
	NOTHING_LEFT: '환불할 수 있는 상품이 없어요',
	FORBIDDEN: '본인의 주문만 환불할 수 있어요',
	CANCEL_UNCERTAIN: '결제 취소 결과를 확인하지 못했어요 — 잠시 후 주문 상세에서 상태를 확인해주세요',
	TOSS_ERROR: '결제 취소에 실패했어요 — 잠시 후 다시 시도해주세요',
	NO_SERVICE_KEY: '환불 처리가 아직 설정되지 않았어요',
	BAD_REQUEST: '요청 형식이 올바르지 않습니다',
	UNAUTHORIZED: '로그인이 필요합니다'
};
export const refundMessage = (code: string, fallback?: string | null): string => fallback || REFUND_MESSAGES[code] || '환불 처리에 실패했어요';
