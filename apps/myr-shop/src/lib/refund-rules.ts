/** 환불 순수 규칙 — 입력 검증 · 화면 판정 · RPC 파서 · 토스 Idempotency-Key (테스트 src/test/refund-rules.test.ts). docs/myr.md §6.3. */
import { ORDER_CODE_RE } from './checkout-rules';
import { cleanText } from './text';
import type { OrderItem, OrderView } from './order-view';

export type RefundLine = { item_id: string; qty: number };
const UUID_RE = /^[0-9a-f-]{36}$/;
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

export const REFUND_REASONS = ['단순 변심', '주문 실수', '배송 지연', '상품 불량·파손', '기타'] as const;
export const REASON_MAX = 200;

/** POST /api/payments/cancel 본문 `{ orderCode, items?: [{ itemId, qty }], reason? }` — items 비우면 전체. 형식 틀리면 null */
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
			items.push({ item_id: l.itemId, qty: l.qty as number });
		}
	}
	const reason = cleanText(typeof b.reason === 'string' ? b.reason : '').slice(0, REASON_MAX);
	return { orderCode, items, reason };
}

/** 고객이 이 주문에 환불을 신청할 수 있나 — 발송 전 · PAID/PARTIAL_REFUNDED(남은 수량) · WAITING_DEPOSIT(입금 전 취소) */
export function customerCanRefund(o: Pick<OrderView, 'status' | 'trackingNo' | 'items'>): { ok: true; deposit: boolean } | { ok: false; reason: string } {
	if (o.status === 'WAITING_DEPOSIT') return { ok: true, deposit: true };
	if (o.status === 'REFUNDED') return { ok: false, reason: '이미 환불된 주문이에요' };
	if (o.status === 'CANCELED') return { ok: false, reason: '취소된 주문이에요' };
	if (o.trackingNo) return { ok: false, reason: '발송이 시작된 주문은 고객센터로 문의해주세요' };
	if (refundableItems(o.items).length === 0) return { ok: false, reason: '환불할 수 있는 상품이 없어요' };
	return { ok: true, deposit: false };
}

/** 남은 수량이 있는 줄 (취소된 줄 제외) */
export const refundableItems = (items: OrderItem[]): OrderItem[] => items.filter((i) => i.status !== 'CANCELED' && i.qty - i.refundedQty > 0);
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

/** 토스 Idempotency-Key — 같은 주문·같은 줄 묶음의 재시도는 같은 키(토스가 같은 응답) · 다른 묶음은 다른 키. ≤ 300자 */
export function refundIdempotencyKey(orderId: string, items: { item_id: string; qty: number }[]): string {
	const part = [...items]
		.map((i) => `${i.item_id.slice(0, 8)}.${i.qty}`)
		.sort()
		.join('_');
	return `${orderId}:${part || 'all'}`.slice(0, 300);
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
	SHIPPED: '발송이 시작된 주문은 고객센터로 문의해주세요',
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
