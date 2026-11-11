// 크리에이터 주문 열람(6번 · 0081) — packages/myr-core/src/seller-orders.ts
import { describe, expect, it } from 'vitest';
import { filterSellerOrders, liveLines, sellerOrderBoxes, sellerOrderFromJson, sellerOrderLabel, sellerOrdersFromJson, sellerOrderTab, sellerOrderTabCounts } from '../seller-orders';

// left_qty · live(줄) · ship_status · amounts(주문)는 서버(0098 myr_line_left · myr_line_live · 0099 myr_order_ship_status · myr_line_net)가 주는 값 —
// 테스트는 서버가 줄 법한 값으로 채운다(화면은 그 값을 읽기만 한다)
const line = (o: Record<string, unknown> = {}) => {
	const r = { id: 'i1', name: '포도 젤리', option: '', qty: 1, unit_price: 32000, amount: 32000, status: 'PAID', refunded_qty: 0, refund_amount: 0, ship_status: 'DELIVERED', courier: null, tracking_no: null, product: { code: 'p', tile: null, icon: 'grape', thumb_url: null }, claim: null, ...o };
	const left = Math.max(0, Number(r.qty) - Number(r.refunded_qty));
	return { left_qty: left, live: r.status !== 'CANCELED' && left > 0, ...r };
};
const order = (items: unknown[], o: Record<string, unknown> = {}) => sellerOrderFromJson({ id: 'o1', code: 'myr1001', status: 'PAID', paid_at: '2026-11-04T00:00:00Z', buyer: '김*은', items, ...o })!;

describe('파서', () => {
	it('주문 · 줄 · 요청 · 모르는 값은 기본값', () => {
		const o = order([line({ ship_status: 'WHAT', claim: { code: 'rq1', status: 'pending', kind: 'refund' } })]);
		expect([o.code, o.buyer, o.items[0].shipStatus, o.items[0].claim?.code, o.items[0].product?.icon]).toEqual(['myr1001', '김*은', 'PAID', 'rq1', 'grape']);
		expect(order([line({ claim: { code: 'rq1', status: 'done' } })]).items[0].claim).toBeNull();
		expect([order([line({ groupbuy: true })]).items[0].groupbuy, order([line()]).items[0].groupbuy]).toEqual([true, false]); // 공구 줄(0086)
		expect(sellerOrderFromJson({ id: 'o', code: 'c', items: [] })).toBeNull(); // 내 줄이 없으면 버림
		expect(sellerOrdersFromJson(null)).toEqual([]);
	});
});

describe('상태 칩 · 탭', () => {
	it('주문 배송 상태는 서버 값 그대로 — 줄을 훑어 다시 정하지 않는다(0099)', () => {
		const o = order([line({ id: 'a', ship_status: 'DELIVERED' }), line({ id: 'b', ship_status: 'PREPARING' })], { ship_status: 'PREPARING' });
		expect(o.shipStatus).toBe('PREPARING');
		expect(order([line({ ship_status: 'PREPARING' })]).shipStatus).toBeNull(); // 서버가 주지 않으면 줄에서 짐작하지 않는다
		expect(order([line()], { ship_status: 'WHAT' }).shipStatus).toBeNull();
		expect(sellerOrderLabel(o).text).toBe('배송 준비중');
		expect(sellerOrderTab(o)).toBe('prep');
	});
	it('환불된 줄은 빼고 칩을 본다 · 환불이 하나라도 있으면 환불 탭(부분 포함)', () => {
		const part = order([line({ id: 'a', ship_status: 'PAID', status: 'REFUNDED', refunded_qty: 1 }), line({ id: 'b', ship_status: 'SHIPPING' })], { ship_status: 'SHIPPING' });
		expect(liveLines(part).map((i) => i.id)).toEqual(['b']);
		expect(sellerOrderLabel(part).text).toBe('배송 중');
		expect(sellerOrderTab(part)).toBe('refunded');
		expect(sellerOrderTab(order([line({ qty: 2, refunded_qty: 1, status: 'PARTIAL_REFUNDED' })]))).toBe('refunded');
		// 화면은 서버가 준 live 를 그대로 쓴다 — 수량으로 다시 판정하지 않는다(0098)
		expect(liveLines(order([line({ qty: 2, refunded_qty: 0, live: false })]))).toEqual([]);
		const all = order([line({ status: 'REFUNDED', refunded_qty: 1, refund_amount: 32000 })]);
		expect(sellerOrderLabel(all)).toEqual({ text: '환불 완료', tone: 'muted' });
		expect(sellerOrderTab(all)).toBe('refunded');
		expect(sellerOrderTab(order([line({ ship_status: 'DELIVERED' })], { ship_status: 'DELIVERED' }))).toBe('delivered'); // 요청 · 환불 없이 끝난 주문만
	});
	it('진행 중인 요청이 있으면 칩 · 탭 모두 요청이 먼저(처리 대기 > 진행 중 · 부분 환불보다 먼저)', () => {
		const o = order([line({ id: 'a', claim: { code: 'rq1', status: 'progress', kind: 'refund' } }), line({ id: 'b', claim: { code: 'rq2', status: 'pending', kind: 'exchange' } })]);
		expect(sellerOrderLabel(o).text).toBe('교환 · 환불 요청');
		expect(sellerOrderLabel(order([line({ claim: { code: 'rq1', status: 'progress', kind: 'refund' } })])).text).toBe('교환 · 환불 진행 중');
		expect(sellerOrderTab(o)).toBe('claim');
		expect(sellerOrderTab(order([line({ id: 'a', refunded_qty: 1, qty: 2 }), line({ id: 'b', claim: { code: 'rq3', status: 'pending', kind: 'refund' } })]))).toBe('claim');
	});
	it('탭 개수 · 필터 — 한 주문은 한 탭에만', () => {
		const list = [
			order([line({ ship_status: 'PAID' })], { ship_status: 'PAID' }),
			order([line({ ship_status: 'SHIPPING' })], { id: 'o2', ship_status: 'SHIPPING' }),
			order([line({ status: 'REFUNDED', refunded_qty: 1 })], { id: 'o3' }),
			order([line({ claim: { code: 'rq1', status: 'pending', kind: 'refund' } })], { id: 'o4' }),
			order([line({})], { id: 'o5', ship_status: 'DELIVERED' })
		];
		expect(sellerOrderTabCounts(list).map((t) => [t.id, t.count])).toEqual([['all', 5], ['prep', 1], ['shipping', 1], ['delivered', 1], ['claim', 1], ['refunded', 1]]);
		expect(filterSellerOrders(list, 'shipping').map((o) => o.id)).toEqual(['o2']);
		expect(filterSellerOrders(list, 'claim').map((o) => o.id)).toEqual(['o4']);
	});
});

describe('금액 · 송장', () => {
	it('내 줄 결제 · 환불 · 남은 금액 — 서버 값 그대로(0099 amounts · 화면이 줄을 더하고 빼지 않는다)', () => {
		expect(order([line({ amount: 64000, qty: 2, refunded_qty: 1, refund_amount: 26000 })], { amounts: { paid: 64000, refunded: 26000, net: 38000 } }).amounts).toEqual({ paid: 64000, refunded: 26000, net: 38000 });
		expect(order([line({ refund_amount: 32000 })], { amounts: { paid: 32000, refunded: 32000, net: 0 } }).amounts.net).toBe(0);
		expect(order([line({ amount: 64000 })]).amounts).toEqual({ paid: 0, refunded: 0, net: 0 }); // 서버가 주지 않으면 줄에서 계산하지 않는다
	});
	it('같은 송장은 한 박스', () => {
		const o = order([line({ id: 'a', courier: 'CJ대한통운', tracking_no: '1' }), line({ id: 'b', courier: 'CJ대한통운', tracking_no: '1' }), line({ id: 'c', courier: '롯데택배', tracking_no: '2' }), line({ id: 'd' })]);
		expect(sellerOrderBoxes(o)).toEqual([{ courier: 'CJ대한통운', trackingNo: '1' }, { courier: '롯데택배', trackingNo: '2' }]);
	});
});
