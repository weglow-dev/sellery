// 환불 순수 규칙 — apps/myr-shop/src/lib/refund-rules.ts
import { describe, expect, it } from 'vitest';
import type { OrderItem, OrderView } from '../order-view';
import {
	customerCanRefund,
	customerRefundableItems,
	estimateRefund,
	isRefundPhotoPath,
	parseCancelBody,
	parsePrecheckResult,
	parseRecordResult,
	refundableItems,
	refundIdempotencyKey,
	refundMessage,
	refundPhotoPath,
	sniffImageType
} from '../refund-rules';

const item = (id: string, qty: number, unitPrice: number, refundedQty = 0, status = 'PAID', shipStatus: OrderItem['shipStatus'] = 'PAID'): OrderItem => ({
	id,
	code: id,
	name: id,
	option: '',
	qty,
	unitPrice,
	amount: qty * unitPrice,
	status,
	refundedQty,
	tile: '',
	ic: 'pill',
	thumbUrl: null,
	creator: '',
	creatorHandle: '',
	shipStatus,
	courier: null,
	trackingNo: null,
	shippedAt: null,
	deliveredAt: null
});
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const order = (over: Partial<OrderView> = {}): OrderView =>
	({
		id: 'o',
		code: 'myr1001',
		status: 'PAID',
		amount: 43000,
		itemsAmount: 40000,
		shippingFee: 3000,
		refundAmount: 0,
		orderName: '',
		paymentMethod: '카드',
		paidAt: 'x',
		createdAt: 'x',
		depositDueAt: null,
		deposit: null,
		courier: null,
		trackingNo: null,
		shippedAt: null,
		deliveredAt: null,
		guest: false,
		buyerName: '',
		shipping: null,
		items: [item(A, 2, 10000), item(B, 1, 20000)],
		...over
	}) as OrderView;

describe('parseCancelBody', () => {
	it('orderCode 소문자 · items 선택 · reason 정리', () => {
		expect(parseCancelBody({ orderCode: 'MYR1001', items: [{ itemId: A, qty: 1 }], reason: ' 단순 변심 \u{1F49A}' })).toEqual({
			orderCode: 'myr1001',
			items: [{ item_id: A, qty: 1 }],
			reason: '단순 변심'
		});
		expect(parseCancelBody({ orderCode: 'myr1001' })).toEqual({ orderCode: 'myr1001', items: [], reason: '' });
	});
	it('items.note — 정리 · 300자 · 비면 키 없음 · 문자열 아니면 null (0067)', () => {
		expect(parseCancelBody({ orderCode: 'myr1001', items: [{ itemId: A, qty: 1, note: '  포장이  찢어졌어요 \u{1F49A} ' }] })?.items).toEqual([{ item_id: A, qty: 1, note: '포장이 찢어졌어요' }]);
		expect(parseCancelBody({ orderCode: 'myr1001', items: [{ itemId: A, qty: 1, note: 'x'.repeat(400) }] })?.items[0].note).toHaveLength(300);
		expect(parseCancelBody({ orderCode: 'myr1001', items: [{ itemId: A, qty: 1, note: '   ' }] })?.items).toEqual([{ item_id: A, qty: 1 }]);
		expect(parseCancelBody({ orderCode: 'myr1001', items: [{ itemId: A, qty: 1, note: 5 }] })).toBeNull();
		expect(refundIdempotencyKey('o', [{ item_id: A, qty: 1, note: '메모' }])).toBe(refundIdempotencyKey('o', [{ item_id: A, qty: 1 }]));
	});
	it('items.photos — 경로 형식 3장까지 · 중복 제거 · 비면 키 없음 · 형식 밖이면 null (0068)', () => {
		const O = '11111111-1111-4111-8111-111111111111';
		const p1 = refundPhotoPath(O, A, 'jpg', '22222222-2222-4222-8222-222222222222');
		expect(parseCancelBody({ orderCode: 'myr1001', items: [{ itemId: A, qty: 1, photos: [p1, p1] }] })?.items).toEqual([{ item_id: A, qty: 1, photos: [p1] }]);
		expect(parseCancelBody({ orderCode: 'myr1001', items: [{ itemId: A, qty: 1, photos: [] }] })?.items).toEqual([{ item_id: A, qty: 1 }]);
		expect(parseCancelBody({ orderCode: 'myr1001', items: [{ itemId: A, qty: 1, photos: ['../etc/passwd'] }] })).toBeNull();
		expect(parseCancelBody({ orderCode: 'myr1001', items: [{ itemId: A, qty: 1, photos: [p1, p1.replace('2222', '3333'), p1.replace('2222', '4444'), p1.replace('2222', '5555')] }] })).toBeNull();
		expect(refundIdempotencyKey('o', [{ item_id: A, qty: 1, photos: [p1] }])).toBe(refundIdempotencyKey('o', [{ item_id: A, qty: 1 }]));
	});
	it('isRefundPhotoPath · sniffImageType', () => {
		const O = '11111111-1111-4111-8111-111111111111';
		const p = refundPhotoPath(O, A, 'png', '22222222-2222-4222-8222-222222222222');
		expect(isRefundPhotoPath(p)).toBe(true);
		expect(isRefundPhotoPath(p, O)).toBe(true);
		expect(isRefundPhotoPath(p, O, A)).toBe(true);
		expect(isRefundPhotoPath(p, O.replace('1111', '9999'))).toBe(false);
		expect(isRefundPhotoPath(p, O, A.replace(/.$/, '0'))).toBe(false);
		expect(isRefundPhotoPath(`${O}/${A}/x.gif`)).toBe(false);
		expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toEqual({ type: 'image/jpeg', ext: 'jpg' });
		expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toEqual({ type: 'image/png', ext: 'png' });
		expect(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toEqual({ type: 'image/webp', ext: 'webp' });
		expect(sniffImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull();
	});
	it('형식 오류는 null', () => {
		expect(parseCancelBody({ orderCode: 'bad code' })).toBeNull();
		expect(parseCancelBody({ orderCode: 'myr1001', items: [{ itemId: 'x', qty: 1 }] })).toBeNull();
		expect(parseCancelBody({ orderCode: 'myr1001', items: [{ itemId: A, qty: 0 }] })).toBeNull();
		expect(parseCancelBody(null)).toBeNull();
	});
});

describe('customerCanRefund · refundableItems', () => {
	it('발송 전 PAID → ok · 입금 대기 → deposit · 발송 뒤·환불·취소 → 불가', () => {
		expect(customerCanRefund(order())).toEqual({ ok: true, deposit: false });
		expect(customerCanRefund(order({ status: 'WAITING_DEPOSIT' }))).toEqual({ ok: true, deposit: true });
		// 0077 — 기준은 줄 배송 상태: 결제완료 줄이 남았으면 가능 · 전부 배송준비중 이후면 불가(주문 송장 칸은 보지 않는다)
		expect(customerCanRefund(order({ items: [item(A, 2, 10000, 0, 'PAID', 'PREPARING'), item(B, 1, 20000, 0, 'PAID', 'SHIPPING')] }))).toEqual({ ok: false, reason: '출고 준비가 시작된 상품은 고객센터로 문의해주세요' });
		expect(customerCanRefund(order({ items: [item(A, 2, 10000, 0, 'PAID', 'PREPARING'), item(B, 1, 20000)] })).ok).toBe(true);
		expect(customerRefundableItems([item(A, 2, 10000, 0, 'PAID', 'PREPARING'), item(B, 1, 20000), item('c', 1, 1, 1, 'REFUNDED')]).map((i) => i.id)).toEqual([B]);
		expect(customerCanRefund(order({ status: 'REFUNDED' })).ok).toBe(false);
		expect(customerCanRefund(order({ status: 'CANCELED' })).ok).toBe(false);
		expect(customerCanRefund(order({ status: 'PARTIAL_REFUNDED', items: [item(A, 2, 10000, 2, 'REFUNDED')] })).ok).toBe(false);
	});
	it('남은 수량이 있는 줄만', () => {
		expect(
			refundableItems([item(A, 2, 10000, 1, 'PARTIAL_REFUNDED'), item(B, 1, 20000, 1, 'REFUNDED'), item('c', 1, 1, 0, 'CANCELED')]).map((i) => i.id)
		).toEqual([A]);
	});
});

describe('estimateRefund', () => {
	it('부분은 단가 × qty · 전부면 배송비 포함 · 남은 수량 넘는 요청은 잘린다', () => {
		expect(estimateRefund(order(), [{ item_id: A, qty: 1 }])).toEqual({ amount: 10000, full: false });
		expect(
			estimateRefund(order(), [
				{ item_id: A, qty: 2 },
				{ item_id: B, qty: 1 }
			])
		).toEqual({ amount: 43000, full: true });
		expect(
			estimateRefund(order(), [
				{ item_id: A, qty: 9 },
				{ item_id: B, qty: 9 }
			])
		).toEqual({ amount: 43000, full: true });
		expect(estimateRefund(order({ refundAmount: 10000, items: [item(A, 2, 10000, 1, 'PARTIAL_REFUNDED'), item(B, 1, 20000)] }), []).amount).toBe(0);
		expect(
			estimateRefund(order({ refundAmount: 10000, items: [item(A, 2, 10000, 1, 'PARTIAL_REFUNDED'), item(B, 1, 20000)] }), [
				{ item_id: A, qty: 1 },
				{ item_id: B, qty: 1 }
			])
		).toEqual({ amount: 33000, full: true });
	});
});

describe('refundIdempotencyKey', () => {
	it('같은 줄 묶음은 순서가 달라도 같은 키 · 다른 수량은 다른 키 · 전체는 all', () => {
		const k1 = refundIdempotencyKey('o', [
			{ item_id: A, qty: 1 },
			{ item_id: B, qty: 2 }
		]);
		const k2 = refundIdempotencyKey('o', [
			{ item_id: B, qty: 2 },
			{ item_id: A, qty: 1 }
		]);
		expect(k1).toBe(k2);
		expect(refundIdempotencyKey('o', [{ item_id: A, qty: 2 }])).not.toBe(refundIdempotencyKey('o', [{ item_id: A, qty: 1 }]));
		expect(refundIdempotencyKey('o', [])).toBe('o:all');
		expect(k1.length).toBeLessThanOrEqual(300);
	});
});

describe('RPC 파서 · 문구', () => {
	it('precheck ok · BAD_ITEMS · record', () => {
		expect(
			parsePrecheckResult({
				ok: true,
				order_code: 'myr1001',
				order_status: 'PAID',
				payment_key: 'pk',
				amount: 10000,
				deposit: false,
				full: false,
				items: [{ item_id: A, qty: 1, amount: 10000, seller_id: 's' }]
			})
		).toMatchObject({ ok: true, amount: 10000, items: [{ item_id: A, qty: 1 }] });
		expect(parsePrecheckResult({ ok: false, code: 'BAD_ITEMS', items: [{ item_id: A, reason: 'TOO_MANY', left: 2 }] })).toEqual({
			ok: false,
			code: 'BAD_ITEMS',
			status: undefined,
			items: [{ item_id: A, reason: 'TOO_MANY', left: 2 }]
		});
		expect(parsePrecheckResult('x')).toEqual({ ok: false, code: 'BAD_RESULT' });
		expect(parseRecordResult({ ok: true, already: false, order_code: 'myr1001', status: 'PARTIAL_REFUNDED', amount: 10000 })).toEqual({
			ok: true,
			already: false,
			orderCode: 'myr1001',
			status: 'PARTIAL_REFUNDED',
			amount: 10000
		});
		expect(refundMessage('SHIPPED')).toContain('출고 준비');
		expect(refundMessage('ZZZ', '토스 메시지')).toBe('토스 메시지');
	});
});
