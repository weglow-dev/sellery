// 환불 순수 규칙 — apps/myr-shop/src/lib/refund-rules.ts
import { describe, expect, it } from 'vitest';
import type { OrderItem, OrderView } from '../order-view';
import {
	customerCanRefund,
	customerRefundableItems,
	isRefundPhotoPath,
	parseCancelBody,
	parsePrecheckResult,
	parseRecordResult,
	parseRefundQuote,
	parseRefundQuoteBody,
	quoteFromPrecheck,
	refundLineAmount,
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
	changeMindOk: true,
	leftQty: Math.max(0, qty - refundedQty), // 서버(0097 myr_line_left)가 줄 법한 값
	leftAmount: Math.max(0, qty - refundedQty) * unitPrice, // 서버(0099 left_amount)가 줄 법한 값
	live: status !== 'CANCELED' && qty - refundedQty > 0 // 서버(0099 myr_line_live)가 줄 법한 값
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
	it('items.note — 여러 줄 글: 줄바꿈 · 이모지 그대로 · 제어문자 · 앞뒤 공백만 정리 · 300자(이모지 1자) · 비면 키 없음 · 문자열 아니면 null (0067)', () => {
		expect(parseCancelBody({ orderCode: 'myr1001', items: [{ itemId: A, qty: 1, note: '  포장이 찢어졌어요 \u{1F49A}\r\n상자도 젖었어요\x07 ' }] })?.items).toEqual([
			{ item_id: A, qty: 1, note: '포장이 찢어졌어요 \u{1F49A}\n상자도 젖었어요' }
		]);
		expect(parseCancelBody({ orderCode: 'myr1001', items: [{ itemId: A, qty: 1, note: 'x'.repeat(400) }] })?.items[0].note).toHaveLength(300);
		// 300자 경계에 이모지가 걸려도 반으로 자르지 않는다(반쪽 이모지는 DB 저장 때 오류)
		const cut = parseCancelBody({ orderCode: 'myr1001', items: [{ itemId: A, qty: 1, note: 'x'.repeat(299) + '\u{1F49A}\u{1F49A}' }] })?.items[0].note ?? '';
		expect([...cut]).toHaveLength(300);
		expect(cut.endsWith('\u{1F49A}')).toBe(true);
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

describe('quoteFromPrecheck — 실제 환불 · 예상 금액이 같이 쓰는 한 벌(금액은 전부 서버 precheck · 0105)', () => {
	// precheck 응답 — amount(결제 금액 = 상품 + 함께 돌려줄 처음 배송비) · goods · shippingBack · deduction(적용한 차감) · refundAmount(돌려줄 돈)를 서버가 준다. 여기서 빼거나 나누지 않는다
	const pre = (amount: number, goods: number, over: { deposit?: boolean; full?: boolean; deduction?: number; refundAmount?: number } = {}) => ({
		amount,
		goods,
		items: [{ item_id: A, qty: 1, amount: goods, seller_id: null }],
		shippingBack: amount - goods,
		deposit: over.deposit ?? false,
		full: over.full ?? false,
		deduction: over.deduction ?? 0,
		refundAmount: over.refundAmount ?? amount
	});
	it('정상 — 서버 값을 모양만 바꿔 담는다', () => {
		expect(quoteFromPrecheck(pre(10000, 10000))).toEqual({ amount: 10000, paid: 10000, goods: 10000, shippingBack: 0, deduction: 0, full: false, deposit: false, lines: [{ itemId: A, qty: 1, amount: 10000 }] });
	});
	it('차감 — 돌려줄 돈은 서버 refund_amount 그대로(MYR2087: 서버가 39,000 − 6,000 = 33,000 을 준다)', () => {
		expect(quoteFromPrecheck(pre(39000, 36000, { full: true, deduction: 6000, refundAmount: 33000 }))).toMatchObject({ amount: 33000, paid: 39000, goods: 36000, shippingBack: 3000, deduction: 6000, full: true });
	});
	it('입금 전 — 서버가 0원 · 차감 0 을 준다', () => {
		expect(quoteFromPrecheck(pre(43000, 40000, { deposit: true, full: true, refundAmount: 0 }))).toMatchObject({ amount: 0, paid: 43000, deduction: 0, deposit: true });
	});
});

describe('refundLineAmount — 신청 화면 줄 금액은 서버 값만', () => {
	const it3 = { id: A, leftQty: 3, leftAmount: 30000 };
	it('고르지 않았거나 남은 수량 전부면 줄의 leftAmount', () => {
		expect(refundLineAmount(it3, 0, null)).toBe(30000);
		expect(refundLineAmount(it3, 3, null)).toBe(30000);
	});
	it('일부만 골랐으면 예상 금액 응답의 그 줄 금액 · 응답이 없거나 수량이 다르면 null(수량만 보여 준다)', () => {
		expect(refundLineAmount(it3, 2, { lines: [{ itemId: A, qty: 2, amount: 20000 }] })).toBe(20000);
		expect(refundLineAmount(it3, 2, null)).toBeNull();
		expect(refundLineAmount(it3, 2, { lines: [{ itemId: A, qty: 1, amount: 10000 }] })).toBeNull(); // 수량이 바뀐 직후 — 옛 응답 금액을 쓰지 않는다
		expect(refundLineAmount(it3, 2, { lines: [{ itemId: B, qty: 2, amount: 99999 }] })).toBeNull();
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
		expect(parseRefundQuote({ ok: true, amount: 33000, paid: 39000, goods: 36000, shippingBack: 3000, deduction: 6000, full: true, deposit: false, lines: [{ itemId: A, qty: 1, amount: 36000 }, { itemId: 3 }] })).toEqual({
			amount: 33000,
			paid: 39000,
			goods: 36000,
			shippingBack: 3000,
			deduction: 6000,
			full: true,
			deposit: false,
			lines: [{ itemId: A, qty: 1, amount: 36000 }]
		});
		// paid · goods · shippingBack 은 서버가 준다 — 없으면 화면이 나눠 짐작하지 않고 null("확인 중")
		expect(parseRefundQuote({ ok: true, amount: 33000 })).toBeNull();
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
				amount: 13000,
				goods: 10000,
				shipping_back: 3000,
				deposit: false,
				full: true,
				items: [{ item_id: A, qty: 1, amount: 10000, seller_id: 's' }],
				deduction: 6000,
				refund_amount: 7000,
				cancel_full: false
			})
		).toMatchObject({ ok: true, amount: 13000, goods: 10000, shippingBack: 3000, items: [{ item_id: A, qty: 1 }], deduction: 6000, refundAmount: 7000, cancelFull: false });
		// refund_amount(0105 돌려줄 돈)가 없는 응답은 짐작하지 않고 BAD_RESULT
		expect(parsePrecheckResult({ ok: true, order_code: 'myr1001', amount: 10000, goods: 10000, shipping_back: 0, deposit: false, full: false, items: [] })).toEqual({ ok: false, code: 'BAD_RESULT' });
		// goods · shipping_back 이 없는 응답(0099 전)은 금액을 나눠 짐작하지 않고 BAD_RESULT
		expect(parsePrecheckResult({ ok: true, order_code: 'myr1001', amount: 10000, deposit: false, full: false, items: [] })).toEqual({ ok: false, code: 'BAD_RESULT' });
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
			amount: 10000,
			mismatch: null
		});
		// 0105 — record 가 다시 계산한 금액과 다르면 mismatch(기록은 됐다)
		expect(parseRecordResult({ ok: true, already: false, order_code: 'myr1001', status: 'REFUNDED', amount: 9000, mismatch: true, expected: 7000, got: 9000 })).toMatchObject({ ok: true, mismatch: { expected: 7000, got: 9000 } });
		expect(parseRecordResult({ ok: true, already: false, order_code: 'myr1001', status: 'REFUNDED', amount: 9000, mismatch: true, expected: null, got: 9000 })).toMatchObject({ mismatch: { expected: null, got: 9000 } });
		expect(refundMessage('DEDUCTION_TOO_BIG')).toBe('차감 금액이 환불 금액보다 커요');
		expect(refundMessage('SHIPPED')).toContain('출고 준비');
		expect(refundMessage('ZZZ', '토스 메시지')).toBe('토스 메시지');
	});
});
