// 주문 조회 순수 규칙 — apps/myr-shop/src/lib/order-view.ts
import { describe, expect, it } from 'vitest';
import { displayCode, orderFromJson, ordersFromJson, parseLookupInput, parseLookupResult, refundSteps, shortDate, statusLabel } from '../order-view';

const json = {
	id: 'o1',
	code: 'myr1001',
	status: 'PAID',
	amount: 106000,
	items_amount: 106000,
	shipping_fee: 0,
	refund_amount: 0,
	order_name: '글루타치온 외 1건',
	payment_method: '간편결제',
	paid_at: '2026-11-02T02:21:26+00:00',
	created_at: '2026-11-02T02:21:00+00:00',
	deposit_due_at: null,
	deposit: null,
	courier: null,
	tracking_no: null,
	shipped_at: null,
	delivered_at: null,
	guest: false,
	buyer_name: '홍길동',
	shipping: { recipient: '홍길동', phone: '01012345678', address1: '서울 어딘가', address2: '', postcode: '', memo: '' },
	items: [
		{
			id: 'i1',
			product_code: 'a',
			name: 'A',
			option: '',
			qty: 2,
			unit_price: 20000,
			amount: 40000,
			status: 'PAID',
			refunded_qty: 0,
			tile: 't',
			icon: 'pill',
			thumb_url: null,
			creator: '민지'
		},
		{ bad: true }
	]
};

describe('orderFromJson', () => {
	it('필드 매핑 · 이상한 줄은 버림 · 배송지 중첩', () => {
		const o = orderFromJson(json)!;
		expect(o).toMatchObject({ code: 'myr1001', status: 'PAID', amount: 106000, paymentMethod: '간편결제', guest: false, deposit: null });
		expect(o.items).toHaveLength(1);
		expect(o.items[0]).toMatchObject({ code: 'a', qty: 2, unitPrice: 20000, creator: '민지' });
		expect(o.shipping?.recipient).toBe('홍길동');
		expect(orderFromJson({ id: 'x' })).toBeNull();
		expect(ordersFromJson([json, null, 'x'])).toHaveLength(1);
	});
	it('입금 대기 — deposit 객체', () => {
		const o = orderFromJson({ ...json, status: 'WAITING_DEPOSIT', deposit: { bank: '20', account: '123', holder: '홍', due: '2026-11-03T14:59:59+00:00' } })!;
		expect(o.deposit).toEqual({ bank: '20', account: '123', holder: '홍', due: '2026-11-03T14:59:59+00:00' });
	});
});

describe('statusLabel', () => {
	const base = { status: 'PAID', trackingNo: null, shippedAt: null, deliveredAt: null };
	it('상태·배송 컬럼으로 한 단어', () => {
		expect(statusLabel(base).text).toBe('배송 준비중');
		expect(statusLabel({ ...base, trackingNo: '123' }).text).toBe('배송 중');
		expect(statusLabel({ ...base, shippedAt: 'x', deliveredAt: 'y' }).text).toBe('배송 완료');
		expect(statusLabel({ ...base, status: 'WAITING_DEPOSIT' }).text).toBe('입금 대기');
		expect(statusLabel({ ...base, status: 'CANCELED' })).toEqual({ text: '취소됨', tone: 'muted' });
		expect(statusLabel({ ...base, status: 'PARTIAL_REFUNDED' }).tone).toBe('danger');
		expect(statusLabel({ ...base, status: 'REFUNDED' }).text).toBe('환불 완료');
	});
});

describe('shortDate · displayCode', () => {
	it('KST 기준 월·일 · 잘못된 값은 빈 문자열', () => {
		expect(shortDate('2026-11-02T16:30:00+00:00')).toBe('11월 3일'); // UTC 16:30 = KST 다음 날 01:30
		expect(shortDate(null)).toBe('');
		expect(shortDate('nope')).toBe('');
		expect(displayCode('myr1001')).toBe('MYR1001');
	});
});

describe('parseLookupInput · parseLookupResult', () => {
	it('주문번호는 #·공백·대소문자 무시 · 연락처 정규화', () => {
		expect(parseLookupInput(' #MYR 1001 ', '010-9999-8888')).toEqual({ ok: true, code: 'myr1001', phone: '01099998888' });
		expect(parseLookupInput('', '01099998888')).toMatchObject({ ok: false, field: 'code' });
		expect(parseLookupInput('myr/1001', '01099998888')).toMatchObject({ ok: false, field: 'code' });
		expect(parseLookupInput('myr1001', '12')).toMatchObject({ ok: false, field: 'phone' });
	});
	it('RPC 결과 — 토큰 형식이 틀리면 BAD_RESULT', () => {
		expect(parseLookupResult({ ok: true, order_id: 'o', order_code: 'myr1001', token: 'a'.repeat(64) })).toEqual({
			ok: true,
			orderId: 'o',
			orderCode: 'myr1001',
			token: 'a'.repeat(64)
		});
		expect(parseLookupResult({ ok: false, code: 'NOT_FOUND' })).toEqual({ ok: false, code: 'NOT_FOUND' });
		expect(parseLookupResult({ ok: true, order_id: 'o', order_code: 'myr1001', token: 'short' })).toEqual({ ok: false, code: 'BAD_RESULT' });
	});
});

describe('0065 — 상세 이메일 · 줄 크리에이터 핸들', () => {
	it('buyer_email · creator_handle 을 읽는다(없으면 null · 빈 문자열)', () => {
		const o = orderFromJson({ id: 'o', code: 'myr1', buyer_email: 'a@b.co', items: [{ id: 'i', product_code: 'a', creator: '민지', creator_handle: '@minji' }] })!;
		expect(o.buyerEmail).toBe('a@b.co');
		expect(o.items[0].creatorHandle).toBe('@minji');
		const n = orderFromJson({ id: 'o', code: 'myr1', items: [{ id: 'i' }] })!;
		expect(n.buyerEmail).toBeNull();
		expect(n.items[0].creatorHandle).toBe('');
	});
});

describe('0066 — 환불 진행 상태', () => {
	it('refund_reason · refunded_at 을 읽는다(없으면 null)', () => {
		const o = orderFromJson({ id: 'o', code: 'myr1', refund_amount: 26000, refund_reason: '상품 불량·파손', refunded_at: '2026-11-03T01:02:03Z', items: [] })!;
		expect(o.refundReason).toBe('상품 불량·파손');
		expect(o.refundedAt).toBe('2026-11-03T01:02:03Z');
		const n = orderFromJson({ id: 'o', code: 'myr1', items: [] })!;
		expect(n.refundReason).toBeNull();
		expect(n.refundedAt).toBeNull();
	});
	it('refundSteps — 환불이 없으면 null · 있으면 신청(사유) → 완료, 둘 다 done(대기 단계 없음)', () => {
		expect(refundSteps({ refundAmount: 0, refundReason: null, refundedAt: null })).toBeNull();
		const s = refundSteps({ refundAmount: 26000, refundReason: '상품 불량·파손', refundedAt: '2026-11-03T01:02:03Z' })!;
		expect(s.map((x) => x.title)).toEqual(['환불 신청', '환불 완료']);
		expect(s[0].detail).toBe('상품 불량·파손');
		expect(s.every((x) => x.done && x.at === '2026-11-03T01:02:03Z')).toBe(true);
		expect(refundSteps({ refundAmount: 1, refundReason: '', refundedAt: null })![0].detail).toBe('사유 없음');
	});
});

describe('줄 단위 배송(0077)', () => {
	it('배송 상태가 있으면 그것으로 라벨 — 결제 완료 · 배송 준비중 · 배송 중 · 배송 완료 · 입금 대기 · 환불은 그대로', () => {
		const b = { status: 'PAID', trackingNo: null, shippedAt: null, deliveredAt: null };
		expect((['PAID', 'PREPARING', 'SHIPPING', 'DELIVERED'] as const).map((s) => statusLabel({ ...b, shipStatus: s }).text)).toEqual(['결제 완료', '배송 준비중', '배송 중', '배송 완료']);
		expect(statusLabel({ ...b, shipStatus: null }).text).toBe('배송 준비중'); // 옛 응답(배송 상태 없음)
		expect(statusLabel({ ...b, status: 'WAITING_DEPOSIT', shipStatus: 'PAID' }).text).toBe('입금 대기');
		expect(statusLabel({ ...b, status: 'REFUNDED', shipStatus: 'SHIPPING' }).text).toBe('환불 완료');
	});
	it('파서 — 주문 ship_status · 줄 배송 칸 · 옛 응답이면 PAID/null', () => {
		const o = orderFromJson({ id: 'o', code: 'myr1', ship_status: 'PREPARING', items: [{ id: 'i', ship_status: 'SHIPPING', courier: 'CJ대한통운', tracking_no: '1', shipped_at: 'x' }, { id: 'j' }] })!;
		expect(o.shipStatus).toBe('PREPARING');
		expect(o.items.map((i) => [i.shipStatus, i.trackingNo])).toEqual([['SHIPPING', '1'], ['PAID', null]]);
		expect(orderFromJson({ id: 'o', code: 'myr1', ship_status: 'WHAT' })!.shipStatus).toBeNull();
	});
});
