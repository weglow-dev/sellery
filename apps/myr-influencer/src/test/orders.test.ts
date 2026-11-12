// 콘솔 주문(6번 · 0081) — apps/myr-influencer/src/lib/orders.ts (카드 둘째 줄 · 상태 칩 · 줄 상태 · 배송 줄 · 시안 "MYR Influencer Admin" 주문 탭)
import { describe, expect, it } from 'vitest';
import { sellerOrderFromJson } from '@sellery/myr-core/seller-orders';
import { orderCardLines, orderChip, orderClaimCode, orderLineState, orderMeta, orderShipLine } from '../lib/orders';

// ship_status · left_qty · live · amounts 는 서버(0098 · 0099) 값 — 테스트는 서버가 줄 법한 값으로 채운다
const line = (o: Record<string, unknown> = {}) => ({ id: 'i', name: '포도 젤리', qty: 1, amount: 32000, left_qty: 1, live: true, ship_status: 'SHIPPING', status: 'PAID', refunded_qty: 0, ...o });
const order = (items: unknown[], o: Record<string, unknown> = {}) =>
	sellerOrderFromJson({ id: 'o', code: 'myr1001', status: 'PAID', paid_at: '2026-11-04T03:00:00Z', buyer: '김*은', ship_status: 'SHIPPING', items, ...o })!;

describe('주문 카드', () => {
	it('결제일 · 가린 이름', () => {
		expect(orderMeta(order([line()]))).toBe('11월 4일 결제 · 김*은');
		expect(orderMeta({ paidAt: null, buyer: '이*' })).toBe('이*');
	});

	it('상태 칩 — 글자는 판정 그대로 · 색은 시안(결제 완료 주황 · 배송 준비 흰 · 배송 중 민트 · 완료 흐림 · 요청 빨강)', () => {
		expect(orderChip(order([line({ ship_status: 'PAID' })], { ship_status: 'PAID' }))).toEqual({ text: '결제 완료', cls: 'bg-accent/16 text-accent' });
		expect(orderChip(order([line({ ship_status: 'PREPARING' })], { ship_status: 'PREPARING' })).cls).toBe('bg-white/8 text-white/85');
		expect(orderChip(order([line()])).cls).toBe('bg-mint/16 text-mint');
		expect(orderChip(order([line({ ship_status: 'DELIVERED' })], { ship_status: 'DELIVERED' })).cls).toBe('bg-white/6 text-white/50');
		expect(orderChip(order([line({ live: false, left_qty: 0, refunded_qty: 1, status: 'REFUNDED' })], { ship_status: null }))).toEqual({ text: '환불 완료', cls: 'bg-white/6 text-white/50' });
		// 일부 환불 + 남은 줄 배송 완료 — 환불 완료 탭이라 배송 완료가 아니라 부분 환불(흐림)
		expect(orderChip(order([line({ qty: 2, left_qty: 1, refunded_qty: 1, status: 'PARTIAL_REFUNDED', ship_status: 'DELIVERED' })], { ship_status: 'DELIVERED' }))).toEqual({ text: '부분 환불', cls: 'bg-white/6 text-white/50' });
		const claimed = order([line({ claim: { code: 'rq1', status: 'pending', kind: 'refund' } })]);
		expect(orderChip(claimed)).toEqual({ text: '교환 · 환불 요청', cls: 'bg-[#ff6b6b]/14 text-[#ff8a8a]' });
	});

	it('줄 상태 — 요청 → 환불 수량 → 취소 → 그 줄 배송 상태 · 요청 · 환불은 빨강', () => {
		expect(orderLineState({ claim: { code: 'rq1', status: 'pending', kind: 'refund' }, refundedQty: 0, status: 'PAID', shipStatus: 'DELIVERED' })).toEqual({ text: '환불 요청', alert: true });
		expect(orderLineState({ claim: { code: 'rq1', status: 'progress', kind: 'exchange' }, refundedQty: 0, status: 'PAID', shipStatus: 'DELIVERED' })).toEqual({ text: '교환 진행 중', alert: true });
		expect(orderLineState({ claim: null, refundedQty: 1, status: 'PARTIAL_REFUNDED', shipStatus: 'DELIVERED' })).toEqual({ text: '1개 환불', alert: true });
		expect(orderLineState({ claim: null, refundedQty: 0, status: 'CANCELED', shipStatus: 'PAID' })).toEqual({ text: '취소', alert: true });
		expect(orderLineState({ claim: null, refundedQty: 0, status: 'PAID', shipStatus: 'PREPARING' })).toEqual({ text: '배송 준비중', alert: false });
	});

	it('카드 줄 순서 — 요청이 걸린 줄을 첫 줄로([진행 중] 버튼이 그 상품 옆) · 나머지는 서버 순서', () => {
		const o = order([line({ id: 'a' }), line({ id: 'b', claim: { code: 'rq7', status: 'pending', kind: 'refund' } }), line({ id: 'c' })]);
		expect(orderCardLines(o).map((i) => i.id)).toEqual(['b', 'a', 'c']);
		expect(orderCardLines(order([line({ id: 'a' }), line({ id: 'c' })])).map((i) => i.id)).toEqual(['a', 'c']);
	});
	it('[진행 중] 버튼 — 내 줄 중 첫 요청 · 없으면 null', () => {
		expect(orderClaimCode(order([line({ id: 'a' }), line({ id: 'b', claim: { code: 'rq7', status: 'progress', kind: 'exchange' } })]))).toBe('rq7');
		expect(orderClaimCode(order([line()]))).toBeNull();
	});

	it('배송 줄 — 발주 전 · 준비 중 · 송장(조회 링크 · 여러 박스면 외 N건) · 마지막 배송 완료일 · 환불 완료', () => {
		expect(orderShipLine(order([line({ ship_status: 'PAID' })], { ship_status: 'PAID' }))).toEqual({ text: '발주 전 · 고객이 직접 취소할 수 있어요', href: null });
		expect(orderShipLine(order([line({ ship_status: 'PREPARING' })], { ship_status: 'PREPARING' })).text).toBe('MYR 물류센터에서 준비 중');
		const one = orderShipLine(order([line({ courier: 'CJ대한통운', tracking_no: '612300000001' })]));
		expect(one.text).toBe('CJ대한통운 612300000001');
		expect(one.href).toBeTruthy();
		const two = orderShipLine(order([line({ id: 'a', courier: 'CJ대한통운', tracking_no: '1' }), line({ id: 'b', courier: '롯데택배', tracking_no: '2' })]));
		expect(two.text).toBe('CJ대한통운 1 외 1건');
		// 배송 완료일 — 살아 있는 줄 중 마지막(KST) · 환불된 줄은 보지 않는다
		const done = order(
			[
				line({ id: 'a', ship_status: 'DELIVERED', delivered_at: '2026-11-07T03:00:00Z' }),
				line({ id: 'b', ship_status: 'DELIVERED', delivered_at: '2026-11-09T03:00:00Z' }),
				line({ id: 'c', ship_status: 'DELIVERED', delivered_at: '2026-11-11T03:00:00Z', live: false, left_qty: 0, refunded_qty: 1 })
			],
			{ ship_status: 'DELIVERED' }
		);
		expect(orderShipLine(done)).toEqual({ text: '11월 9일 배송 완료', href: null });
		expect(orderShipLine(order([line({ live: false, left_qty: 0, refunded_qty: 1 })], { ship_status: null })).text).toBe('환불 완료');
	});
});
