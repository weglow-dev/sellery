// 환불 순수 규칙 — apps/myr-shop/src/lib/refund-rules.ts
import { describe, expect, it } from 'vitest';
import type { OrderItem, OrderView } from '../order-view';
import {
	customerCanRefund,
	customerRefundableItems,
	deductedAmount,
	isRefundPhotoPath,
	parseCancelBody,
	parsePrecheckResult,
	parseRecordResult,
	parseRefundQuote,
	parseRefundQuoteBody,
	quoteFromPrecheck,
	refundIdempotencyKey,
	refundMessage,
	refundPhotoPath,
	sniffImageType
} from '../refund-rules';

// refundPath 는 서버(0092 myr_line_refund_path)가 정해 주는 값 — 테스트는 서버가 줄 법한 값을 그대로 넣는다
const item = (id: string, qty: number, unitPrice: number, refundedQty = 0, status = 'PAID', shipStatus: OrderItem['shipStatus'] = 'PAID', refundPath: OrderItem['refundPath'] = qty - refundedQty > 0 && status !== 'CANCELED' ? (shipStatus === 'PAID' ? 'instant' : 'claim') : null): OrderItem => ({
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
	deliveredAt: null,
	refundPath,
	changeMindUntil: null,
	changeMindOk: true
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
		// 0078 — 요청에서 나간 환불은 요청 코드가 붙어 셀프 환불 · 다른 요청과 키가 다르다
		expect(refundIdempotencyKey('o', [{ item_id: A, qty: 1 }], 'rq2001')).toBe(`${refundIdempotencyKey('o', [{ item_id: A, qty: 1 }])}:rq2001`);
		expect(refundIdempotencyKey('o', [{ item_id: A, qty: 1 }], 'rq2001')).not.toBe(refundIdempotencyKey('o', [{ item_id: A, qty: 1 }], 'rq2002'));
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
		// 수량 상한 없음(0095 · 0097) — 150개도 받고 남은 수량은 서버(TOO_MANY)가 본다
		expect(parseCancelBody({ orderCode: 'myr1001', items: [{ itemId: A, qty: 150 }] })?.items).toEqual([{ item_id: A, qty: 150 }]);
		expect(parseRefundQuoteBody({ orderCode: 'myr1001', mode: 'claim', items: [{ itemId: A, qty: 150 }] })?.items).toEqual([{ item_id: A, qty: 150 }]);
		expect(parseCancelBody(null)).toBeNull();
	});
});

describe('customerCanRefund · customerRefundableItems — 서버 refundPath 그대로', () => {
	it('바로 환불 · 요청 줄이 있으면 신청 페이지 ok · 입금 대기 → deposit · 환불·취소 → 불가', () => {
		expect(customerCanRefund(order())).toEqual({ ok: true, deposit: false });
		expect(customerCanRefund(order({ status: 'WAITING_DEPOSIT' }))).toEqual({ ok: true, deposit: true });
		// 전부 배송준비중 이후(서버 refundPath = claim)여도 페이지는 열린다(그 줄은 교환 · 환불 요청)
		expect(customerCanRefund(order({ items: [item(A, 2, 10000, 0, 'PAID', 'PREPARING'), item(B, 1, 20000, 0, 'PAID', 'SHIPPING')] }))).toEqual({ ok: true, deposit: false });
		expect(customerRefundableItems([item(A, 2, 10000, 0, 'PAID', 'PREPARING'), item(B, 1, 20000), item('c', 1, 1, 1, 'REFUNDED')]).map((i) => i.id)).toEqual([B]);
		expect(customerCanRefund(order({ status: 'REFUNDED' })).ok).toBe(false);
		expect(customerCanRefund(order({ status: 'CANCELED' })).ok).toBe(false);
		expect(customerCanRefund(order({ status: 'PARTIAL_REFUNDED', items: [item(A, 2, 10000, 2, 'REFUNDED')] })).ok).toBe(false);
	});
	it('화면은 판정하지 않는다 — 서버가 null 이면 배송 상태와 상관없이 불가 · instant 면 바로 환불 줄', () => {
		expect(customerCanRefund(order({ items: [item(A, 1, 10000, 0, 'PAID', 'PAID', null)] }))).toEqual({ ok: false, reason: '환불할 수 있는 상품이 없어요' });
		expect(customerRefundableItems([item(A, 1, 10000, 0, 'PAID', 'PREPARING', 'instant')]).map((i) => i.id)).toEqual([A]);
	});
	it('열린 교환·환불 요청이 있으면 신청 불가(claimOpen) — 끝나면 다시', () => {
		expect(customerCanRefund({ ...order(), claimStatus: 'pending' })).toEqual({ ok: false, reason: '진행 중인 교환 · 환불 요청이 끝나면 다시 신청할 수 있어요', claimOpen: true });
		expect(customerCanRefund({ ...order(), claimStatus: 'progress' }).ok).toBe(false);
		expect(customerCanRefund({ ...order(), claimStatus: null })).toEqual({ ok: true, deposit: false });
		expect(customerCanRefund({ ...order({ status: 'REFUNDED' }), claimStatus: 'pending' })).toEqual({ ok: false, reason: '이미 환불된 주문이에요' });
	});
});

describe('deductedAmount — 요청 환불의 왕복 배송비 차감(0078)', () => {
	it('차감 없음 = 그대로 · 차감 < 금액이면 뺀다 · 금액 이상 · 음수 · 소수는 null(환불하지 않는다)', () => {
		expect(deductedAmount(32000)).toBe(32000);
		expect(deductedAmount(32000, 0)).toBe(32000);
		expect(deductedAmount(32000, 6000)).toBe(26000);
		expect(deductedAmount(6000, 6000)).toBeNull();
		expect(deductedAmount(5000, 6000)).toBeNull();
		expect(deductedAmount(32000, -1)).toBeNull();
		expect(deductedAmount(32000, 1.5)).toBeNull();
	});
});

describe('quoteFromPrecheck — 실제 환불 · 예상 금액이 같이 쓰는 금액 계산', () => {
	const pre = (amount: number, items: number[], over: { deposit?: boolean; full?: boolean } = {}) => ({
		amount,
		items: items.map((a, i) => ({ item_id: String(i), qty: 1, amount: a, seller_id: null })),
		deposit: over.deposit ?? false,
		full: over.full ?? false
	});
	it('정상 — 일부 줄 · 차감 없음', () => {
		expect(quoteFromPrecheck(pre(10000, [10000]))).toEqual({ amount: 10000, goods: 10000, shippingBack: 0, deduction: 0, full: false, deposit: false });
	});
	it('마지막 줄(전부 환불) — precheck 가 붙인 배송비가 shippingBack 으로 · 단순 변심 차감(MYR2087: 36,000 + 3,000 − 6,000 = 33,000)', () => {
		expect(quoteFromPrecheck(pre(39000, [36000], { full: true }), 6000)).toEqual({ amount: 33000, goods: 36000, shippingBack: 3000, deduction: 6000, full: true, deposit: false });
	});
	it('부분 — 마지막 줄이 아니면 배송비 없이 차감만', () => {
		expect(quoteFromPrecheck(pre(36000, [36000]), 6000)).toEqual({ amount: 30000, goods: 36000, shippingBack: 0, deduction: 6000, full: false, deposit: false });
	});
	it('전액 — 차감 없는 전부 환불은 배송비까지 그대로', () => {
		expect(quoteFromPrecheck(pre(43000, [20000, 20000], { full: true }))).toMatchObject({ amount: 43000, shippingBack: 3000, deduction: 0 });
	});
	it('0원 · 입금 전 — 입금 전 취소는 돈이 오가지 않아 0 · 차감도 0', () => {
		expect(quoteFromPrecheck(pre(43000, [40000], { deposit: true, full: true }), 6000)).toEqual({ amount: 0, goods: 40000, shippingBack: 3000, deduction: 0, full: true, deposit: true });
	});
	it('차감이 금액 이상이면 null(환불하지 않는다 · deductedAmount 와 같다)', () => {
		expect(quoteFromPrecheck(pre(5000, [5000]), 6000)).toBeNull();
		expect(quoteFromPrecheck(pre(6000, [6000]), 6000)).toBeNull();
	});
});

describe('parseRefundQuoteBody · parseRefundQuote — 예상 금액 API', () => {
	it('본문 — orderCode 소문자 · mode · reason 정리 · 줄', () => {
		expect(parseRefundQuoteBody({ orderCode: 'MYR2087', mode: 'claim', reason: ' 단순 변심 ', items: [{ itemId: A, qty: 1 }] })).toEqual({
			orderCode: 'myr2087',
			mode: 'claim',
			reason: '단순 변심',
			items: [{ item_id: A, qty: 1 }]
		});
		expect(parseRefundQuoteBody({ orderCode: 'myr2087', mode: 'instant', items: [{ itemId: A, qty: 2 }, { itemId: B, qty: 1 }] })?.reason).toBe('');
	});
	it('형식 오류는 null — mode · 빈 줄 · 수량 · 같은 줄 두 번', () => {
		expect(parseRefundQuoteBody({ orderCode: 'myr2087', mode: 'x', items: [{ itemId: A, qty: 1 }] })).toBeNull();
		expect(parseRefundQuoteBody({ orderCode: 'myr2087', mode: 'claim', items: [] })).toBeNull();
		expect(parseRefundQuoteBody({ orderCode: 'myr2087', mode: 'claim', items: [{ itemId: A, qty: 0 }] })).toBeNull();
		expect(parseRefundQuoteBody({ orderCode: 'myr2087', mode: 'claim', items: [{ itemId: A, qty: 1 }, { itemId: A, qty: 1 }] })).toBeNull();
		expect(parseRefundQuoteBody({ orderCode: 'bad code', mode: 'claim', items: [{ itemId: A, qty: 1 }] })).toBeNull();
	});
	it('응답 — ok 와 amount 가 있어야', () => {
		expect(parseRefundQuote({ ok: true, amount: 33000, goods: 36000, shippingBack: 3000, deduction: 6000, full: true, deposit: false })).toEqual({
			amount: 33000,
			goods: 36000,
			shippingBack: 3000,
			deduction: 6000,
			full: true,
			deposit: false
		});
		expect(parseRefundQuote({ ok: false, code: 'BAD_ITEMS' })).toBeNull();
		expect(parseRefundQuote({ ok: true })).toBeNull();
		expect(parseRefundQuote(null)).toBeNull();
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
