// 발송 처리 순수 규칙 — apps/myr-shop/src/lib/ship-rules.ts (0069 · S8)
import { describe, expect, it } from 'vitest';
import { normalizeCourier, normalizeTracking, parseShipInput, parseShipResult, parseShipRows, shipMessage, trackingUrl } from '../ship-rules';

describe('parseShipInput', () => {
	it('코드 소문자(# 무시) · 택배사 별칭 · 운송장 숫자만', () => {
		expect(parseShipInput({ orderCode: ' #MYR1001 ', courier: 'cj', trackingNo: '1234-5678-90' })).toEqual({ ok: true, input: { orderCode: 'myr1001', courier: 'CJ대한통운', trackingNo: '1234567890' } });
		expect(normalizeCourier(' 한진 ')).toBe('한진택배');
		expect(normalizeCourier('우체국택배')).toBe('우체국택배');
		expect(normalizeCourier('모르는택배')).toBe('모르는택배');
		expect(normalizeTracking(' 12 34-56 ')).toBe('123456');
	});
	it('형식 오류는 field 별 문구', () => {
		expect(parseShipInput({ orderCode: 'bad code', courier: 'cj', trackingNo: '123456789' })).toMatchObject({ ok: false, field: 'orderCode' });
		expect(parseShipInput({ orderCode: 'myr1001', courier: '모르는택배', trackingNo: '123456789' })).toMatchObject({ ok: false, field: 'courier' });
		expect(parseShipInput({ orderCode: 'myr1001', courier: 'cj', trackingNo: '1234567' })).toMatchObject({ ok: false, field: 'trackingNo' });
		expect(parseShipInput({ orderCode: 'myr1001', courier: 'cj', trackingNo: '1'.repeat(31) })).toMatchObject({ ok: false, field: 'trackingNo' });
		expect(parseShipInput(null)).toMatchObject({ ok: false, field: 'orderCode' });
	});
});

describe('trackingUrl · 문구', () => {
	it('택배사별 조회 URL · 모르면 null', () => {
		expect(trackingUrl('CJ대한통운', '1234567890')).toContain('cjlogistics.com');
		expect(trackingUrl('로젠택배', '1234567890')).toBe('https://www.ilogen.com/web/personal/trace/1234567890');
		expect(trackingUrl('없음', '1')).toBeNull();
	});
	it('shipMessage — 코드 밖은 기본 문구', () => {
		expect(shipMessage('WRONG_STATUS')).toContain('결제 완료');
		expect(shipMessage('nope')).toBe('잠시 후 다시 시도해주세요');
	});
});

describe('RPC 파서', () => {
	it('parseShipResult', () => {
		expect(parseShipResult({ ok: true, already: false, order_id: 'o', order_code: 'myr1001', status: 'PAID', courier: 'CJ대한통운', tracking_no: '1234567890', shipped_at: '2026-11-03T00:00:00Z' })).toEqual({
			ok: true,
			already: false,
			orderId: 'o',
			orderCode: 'myr1001',
			status: 'PAID',
			courier: 'CJ대한통운',
			trackingNo: '1234567890',
			shippedAt: '2026-11-03T00:00:00Z'
		});
		expect(parseShipResult({ ok: false, code: 'WRONG_STATUS', status: 'REFUNDED' })).toEqual({ ok: false, code: 'WRONG_STATUS', status: 'REFUNDED' });
		expect(parseShipResult({ ok: true })).toEqual({ ok: false, code: 'BAD_RESULT' });
		expect(parseShipResult('x')).toEqual({ ok: false, code: 'BAD_RESULT' });
	});
	it('parseShipRows — id·code 없는 행은 건너뜀', () => {
		const rows = parseShipRows([{ id: 'o', code: 'myr1001', status: 'PAID', buyer_name: '홍', recipient: '홍', order_name: '상품 A', amount: 20000, lines: 1, paid_at: 'p', created_at: 'c', courier: null, tracking_no: null, shipped_at: null }, { code: 'x' }, 'junk']);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ code: 'myr1001', amount: 20000, lines: 1, courier: null });
		expect(parseShipRows(null)).toEqual([]);
	});
});
