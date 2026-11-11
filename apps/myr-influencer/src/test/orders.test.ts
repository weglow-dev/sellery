// 콘솔 주문(6번 · 0081) — apps/myr-influencer/src/lib/orders.ts (카드 둘째 줄 · 송장 줄)
import { describe, expect, it } from 'vitest';
import { sellerOrderFromJson } from '@sellery/myr-core/seller-orders';
import { orderMeta, orderShipNote, orderTracking } from '../lib/orders';

const o = sellerOrderFromJson({ id: 'o', code: 'myr1001', status: 'PAID', paid_at: '2026-11-04T03:00:00Z', buyer: '김*은', items: [{ id: 'i', qty: 1, amount: 1, left_qty: 1, live: true, ship_status: 'SHIPPING', courier: 'CJ대한통운', tracking_no: '612300000001' }] })!; // left_qty · live = 서버(0098) 값

describe('주문 카드', () => {
	it('결제일 · 가린 이름', () => {
		expect(orderMeta(o)).toBe('11월 4일 결제 · 김*은');
		expect(orderMeta({ paidAt: null, buyer: '이*' })).toBe('이*');
	});
	it('송장 줄 — 택배사 + 번호 · 조회 링크', () => {
		const t = orderTracking(o);
		expect(t).toHaveLength(1);
		expect(t[0].text).toBe('CJ대한통운 612300000001');
		expect(t[0].href).toBeTruthy();
	});
	it('출고 안내 — 발주 전 · 배송 준비중 · 출고 뒤엔 없음', () => {
		// 주문 배송 상태는 서버 값(0099 ship_status · 내 줄 기준)
		const mk = (ship: string) => sellerOrderFromJson({ id: 'o', code: 'c', ship_status: ship, items: [{ id: 'i', qty: 1, left_qty: 1, live: true, ship_status: ship }] })!;
		expect(orderShipNote(mk('PAID'))).toBe('발주 전 · 고객이 직접 취소할 수 있어요');
		expect(orderShipNote(mk('PREPARING'))).toBe('MYR 물류센터에서 준비 중');
		expect(orderShipNote(mk('SHIPPING'))).toBeNull();
	});
});
