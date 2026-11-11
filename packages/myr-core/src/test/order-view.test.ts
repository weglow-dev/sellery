// 주문 조회 순수 규칙 — apps/myr-shop/src/lib/order-view.ts
import { describe, expect, it } from 'vitest';
import { displayCode, orderFromJson, ordersFromJson, parseLookupInput, parseLookupResult, refundSteps, shipBoxes, shortDate, statusLabel, type OrderItem } from '../order-view';

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
	describe('송장(박스)별 묶음', () => {
		// leftQty · live 는 서버(0097 myr_line_left · 0099 myr_line_live)가 주는 값 — 테스트는 서버가 줄 법한 값을 넣는다
		const it_ = (o: Partial<OrderItem>) => ({ id: 'x', name: '젤리', option: '', qty: 1, refundedQty: 0, leftQty: 1, live: true, status: 'PAID', courier: null, trackingNo: null, shippedAt: null, ...o }) as OrderItem;
		it('한 박스 — 남은 줄이 전부 같은 송장 → single', () => {
			const r = shipBoxes([it_({ courier: 'CJ대한통운', trackingNo: '1', shippedAt: '2026-11-05T00:00:00Z' }), it_({ name: '스틱', option: '레몬', courier: 'CJ대한통운', trackingNo: '1', shippedAt: '2026-11-04T00:00:00Z' })]);
			expect(r.single).toBe(true);
			expect(r.boxes).toEqual([{ courier: 'CJ대한통운', trackingNo: '1', shippedAt: '2026-11-04T00:00:00Z', names: ['젤리', '스틱 · 레몬'] }]);
		});
		it('박스 여럿 · 아직 안 나간 줄이 있으면 single 아님 · 송장 없는 줄은 박스에 없음', () => {
			expect(shipBoxes([it_({ courier: 'CJ대한통운', trackingNo: '1' }), it_({ name: '구미', courier: '한진택배', trackingNo: '2' })]).boxes.map((b) => b.names)).toEqual([['젤리'], ['구미']]);
			const r = shipBoxes([it_({ courier: 'CJ대한통운', trackingNo: '1' }), it_({ name: '캡슐' })]);
			expect([r.single, r.boxes.length]).toEqual([false, 1]);
		});
		it('취소 줄 제외 · 전액 환불 줄은 박스엔 남지만 single 판정에서 빠진다 · 송장이 없으면 빈 목록', () => {
			const r = shipBoxes([it_({ courier: 'CJ대한통운', trackingNo: '1' }), it_({ name: '환불', refundedQty: 1, leftQty: 0, live: false, status: 'REFUNDED' }), it_({ name: '취소', status: 'CANCELED', live: false, courier: 'CJ대한통운', trackingNo: '9' })]);
			expect([r.single, r.boxes.map((b) => b.trackingNo)]).toEqual([true, ['1']]);
			expect(shipBoxes([it_({})])).toEqual({ boxes: [], single: false });
		});
	});
});

describe('교환 · 환불 요청 상태(0078)', () => {
	const b = { status: 'PAID', trackingNo: null, shippedAt: null, deliveredAt: null, shipStatus: 'SHIPPING' as const };
	it('열린 요청이 있으면 배송 상태보다 먼저 — 처리 대기 · 진행 중', () => {
		expect(statusLabel({ ...b, claimStatus: 'pending' }).text).toBe('교환 · 환불 요청');
		expect(statusLabel({ ...b, claimStatus: 'progress' }).text).toBe('교환 · 환불 진행 중');
		expect(statusLabel({ ...b, status: 'PARTIAL_REFUNDED', claimStatus: 'progress' }).text).toBe('교환 · 환불 진행 중');
	});
	it('요청이 없거나 끝나면 원래 판정 · 입금 대기 · 취소 · 전액 환불은 주문 상태 그대로', () => {
		expect(statusLabel({ ...b, claimStatus: null }).text).toBe('배송 중');
		expect(statusLabel(b).text).toBe('배송 중');
		// 서버는 결제됐고 끝나지 않은 주문에만 요청 상태를 싣는다(0099 myr_order_json) — 전액 환불 · 취소 · 입금 대기 주문은 claimStatus 가 null 로 온다
		expect(statusLabel({ ...b, status: 'REFUNDED', claimStatus: null }).text).toBe('환불 완료');
		expect(statusLabel({ ...b, status: 'CANCELED', claimStatus: null }).text).toBe('취소됨');
		expect(statusLabel({ ...b, status: 'WAITING_DEPOSIT', claimStatus: null }).text).toBe('입금 대기');
	});
	it('파서 — 서버 판정 값(0099)을 그대로: 결제 − 환불 · 끝나지 않은 주문 · 살아 있는 줄 · 남은 수량 금액 · 없으면 0 / false(짐작하지 않는다)', () => {
		const o = orderFromJson({ id: 'o', code: 'myr1', status: 'PARTIAL_REFUNDED', amount: 53000, refund_amount: 10000, net_amount: 43000, alive: true, items: [{ id: 'i', qty: 3, refunded_qty: 1, left_qty: 2, left_amount: 20000, live: true }] })!;
		expect([o.netAmount, o.alive, o.items[0].live, o.items[0].leftAmount]).toEqual([43000, true, true, 20000]);
		const old = orderFromJson({ id: 'o', code: 'myr1', status: 'PAID', amount: 53000, refund_amount: 0, items: [{ id: 'i', qty: 3, refunded_qty: 0, left_qty: 3 }] })!;
		expect([old.netAmount, old.alive, old.items[0].live, old.items[0].leftAmount]).toEqual([0, false, false, 0]);
	});
	it('파서 — claim_status 는 pending · progress 만, 나머지는 null', () => {
		expect(orderFromJson({ id: 'o', code: 'myr1', claim_status: 'pending' })!.claimStatus).toBe('pending');
		expect(orderFromJson({ id: 'o', code: 'myr1', claim_status: 'progress' })!.claimStatus).toBe('progress');
		expect(orderFromJson({ id: 'o', code: 'myr1', claim_status: 'done' })!.claimStatus).toBeNull();
		expect(orderFromJson({ id: 'o', code: 'myr1' })!.claimStatus).toBeNull();
	});
});
