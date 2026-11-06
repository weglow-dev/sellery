// 이벗 연동 순수 규칙(0077 · docs/myr.md §6.8) — 바인허브 OrderStatusToPreparing · OrderStatusToDeliveringOrDelivered 와 같은 값 · 규칙
import { describe, expect, it } from 'vitest';
import { buildOrderList, ebutMissing, ebutReady, groupByOrder, kstDateTime, lineUpdatesFromStatus, parsePrepareLines, parseSyncLines, prepareCutoff, registeredItemIds } from '../ebut';

const CFG = { id: 'myr', custCode: 'C01', apiKey: 'k', ordShop: 'S01', senderName: 'MYR', senderPhone: '0212345678', senderZipcode: '06100', senderAddress: '서울 강남구 테헤란로 1' };
const RAW = [
	{ item_id: 'i1', order_id: 'o1', order_code: 'myr1001', ordered_at: '2026-11-16T01:00:00Z', paid_at: '2026-11-16T01:05:00Z', goods_code: 'EB-A01', goods_name: '포도 젤리', goods_option: '레몬', qty: 2,
	  shipping: { recipient: '홍길동', phone: '01012345678', postcode: '06100', address1: '서울 강남구 테헤란로 1', address2: '101 호', memo: '문 앞' } },
	{ item_id: 'i2', order_id: 'o1', order_code: 'myr1001', ordered_at: '2026-11-16T01:00:00Z', paid_at: '2026-11-16T01:05:00Z', goods_code: 'b', goods_name: '콜라겐', goods_option: '', qty: 1, shipping: {} },
	{ item_id: 'i3', order_id: 'o2', order_code: 'myr1002', ordered_at: '2026-11-16T00:00:00Z', paid_at: null, goods_code: 'c', goods_name: 'C', goods_option: '', qty: 1, shipping: null },
	{ order_id: 'bad' }
];

describe('설정', () => {
	it('필수 키 8개가 다 있어야 켜진다 · 빠진 키 이름', () => {
		expect(ebutReady(CFG)).toBe(true);
		expect(ebutReady({ ...CFG, apiKey: ' ' })).toBe(false);
		expect(ebutMissing({ id: 'x' })).toEqual(['custCode', 'apiKey', 'ordShop', 'senderName', 'senderPhone', 'senderZipcode', 'senderAddress']);
	});
});

describe('시각', () => {
	it('KST 날짜 시각 문자열 · 오늘 11시 컷오프', () => {
		expect(kstDateTime('2026-11-16T01:05:09Z')).toBe('2026-11-16 10:05:09');
		expect(kstDateTime(null)).toBe('');
		expect(prepareCutoff(new Date('2026-11-16T02:00:00Z')).toISOString()).toBe('2026-11-16T02:00:00.000Z'); // 11:00 KST
		expect(prepareCutoff(new Date('2026-11-15T16:30:00Z')).toISOString()).toBe('2026-11-16T02:00:00.000Z'); // KST 16일 01:30 → 16일 11시
	});
});

describe('발주(ordercreatem)', () => {
	const lines = parsePrepareLines(RAW);
	it('파서 — 모양 틀린 줄은 버리고 배송지는 펼친다', () => {
		expect(lines.map((l) => l.itemId)).toEqual(['i1', 'i2', 'i3']);
		expect(lines[0]).toMatchObject({ recipient: '홍길동', address2: '101 호', memo: '문 앞', qty: 2 });
		expect(lines[2].recipient).toBe('');
	});
	it('주문별로 묶는다(순서 유지)', () => {
		const g = groupByOrder(lines);
		expect([...g.keys()]).toEqual(['o1', 'o2']);
		expect(g.get('o1')!.map((l) => l.itemId)).toEqual(['i1', 'i2']);
	});
	it('orderList — 바인허브와 같은 키 · 줄 id = orderNo · 주소는 붙여 공백 제거 · 상품명 - 옵션', () => {
		const [r] = buildOrderList([lines[0]], CFG);
		expect(r).toEqual({
			id: 'myr', custCode: 'C01', ordShop: 'S01', ordGbn: '1', ordDate: '2026-11-16 10:00:00', payDate: '2026-11-16 10:05:00', orderNo: 'i1',
			receiverName: '홍길동', receiverPhone: '01012345678', receiverCellPhone: '01012345678', receiverZipcode: '06100',
			receiverAddress: '서울강남구테헤란로1101호', receiverMemo: '문 앞', goodsCode: 'EB-A01', goodsName: '포도 젤리 - 레몬', goodsOpt: '', goodsQty: 2, orderDside: '1',
			senderName: 'MYR', senderPhone: '0212345678', senderCellPhone: '0212345678', senderZipcode: '06100', senderAddress: '서울 강남구 테헤란로 1'
		});
		expect(buildOrderList([lines[1]], CFG)[0].goodsName).toBe('콜라겐');
	});
	it('등록 성공 줄 = result 의 success "true"(문자열)만', () => {
		expect(registeredItemIds({ status: 'ok', result: [{ orderNo: 'i1', success: 'true' }, { orderNo: 'i2', success: 'false' }, { orderNo: 'i3', success: true }] })).toEqual(['i1']);
		expect(registeredItemIds(null)).toEqual([]);
	});
});

describe('송장 수집(orderstatus)', () => {
	const NOW = new Date('2026-11-20T09:00:00Z');
	const lines = parseSyncLines([
		{ item_id: 'i1', order_id: 'o1', ship_status: 'PREPARING', tracking_no: null, shipped_at: null },
		{ item_id: 'i2', order_id: 'o1', ship_status: 'SHIPPING', tracking_no: '111', shipped_at: '2026-11-09T09:00:00Z' }, // 11일 전 발송
		{ item_id: 'i3', order_id: 'o1', ship_status: 'SHIPPING', tracking_no: '222', shipped_at: '2026-11-18T09:00:00Z' },
		{ order_id: 'bad' }
	]);
	it('파서', () => expect(lines.map((l) => l.itemId)).toEqual(['i1', 'i2', 'i3']));
	it('orderStatus 0|1 · 송장 있는 마지막 행 → 배송중 · 91 이면 배송완료 · 배송중 10일 지나면 배송완료', () => {
		const data = [
			{ orderCodeNo: 'i1', orderStatus: '0', invcExprNo: '', exprStatus: '' }, // 송장 없음 → 무시
			{ orderCodeNo: 'i1', orderStatus: '1', invcExprNo: '6123-4567-8901', exprStatus: '11' },
			{ orderCodeNo: 'i2', orderStatus: '1', invcExprNo: '111', exprStatus: '41' },
			{ orderCodeNo: 'i3', orderStatus: '1', invcExprNo: '222', exprStatus: '91' },
			{ orderCodeNo: 'i3', orderStatus: '9', invcExprNo: '333', exprStatus: '91' }, // 취소 등 다른 상태 → 무시
			{ orderCodeNo: 'zz', orderStatus: '1', invcExprNo: '999', exprStatus: '91' } // 모르는 줄
		];
		expect(lineUpdatesFromStatus(data, lines, NOW)).toEqual([
			{ itemId: 'i1', trackingNo: '612345678901', delivered: false },
			{ itemId: 'i2', trackingNo: '111', delivered: true },
			{ itemId: 'i3', trackingNo: '222', delivered: true }
		]);
		expect(lineUpdatesFromStatus(null, lines, NOW)).toEqual([]);
	});
});
