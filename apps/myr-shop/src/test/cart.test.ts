// 장바구니 계산 — apps/myr-shop/src/lib/cart.ts (숫자는 data.ts FREE_SHIPPING 50,000 · SHIPPING_FEE 3,000 · MAX_QTY 9)
import { describe, expect, it } from 'vitest';
import { cartTotals, clampQty, mergeLine, removeLine, sanitizeLines, setLineQty } from '../lib/cart';
import { FREE_SHIPPING, MAX_QTY, MOCK_PRODUCTS, SHIPPING_FEE } from '../lib/data';

const [a, b] = MOCK_PRODUCTS; // 32,000 · 28,000

describe('clampQty', () => {
	it('1..MAX_QTY · 정수 아니면 1', () => {
		expect(clampQty(0)).toBe(1);
		expect(clampQty(5)).toBe(5);
		expect(clampQty(99)).toBe(MAX_QTY);
		expect(clampQty(1.5)).toBe(1);
		expect(clampQty(NaN)).toBe(1);
	});
});

describe('mergeLine · setLineQty · removeLine', () => {
	it('새 줄 추가 · 같은 code 는 합산(상한) + 스냅샷 교체', () => {
		let lines = mergeLine([], a, 2);
		expect(lines).toEqual([{ product: a, qty: 2 }]);
		const newer = { ...a, price: 30000 };
		lines = mergeLine(lines, newer, 8);
		expect(lines).toHaveLength(1);
		expect(lines[0].qty).toBe(MAX_QTY);
		expect(lines[0].product.price).toBe(30000);
	});
	it('수량 변경은 그 줄만 · 삭제는 code 로', () => {
		let lines = mergeLine(mergeLine([], a, 1), b, 1);
		lines = setLineQty(lines, b.code, 3);
		expect(lines.map((l) => l.qty)).toEqual([1, 3]);
		lines = removeLine(lines, a.code);
		expect(lines.map((l) => l.product.code)).toEqual([b.code]);
	});
});

describe('cartTotals — 배송비 규칙', () => {
	it('비어 있으면 전부 0 · 무료배송 문구', () => {
		expect(cartTotals([])).toMatchObject({ count: 0, subtotal: 0, shipping: 0, total: 0, shippingMsg: '무료배송으로 보내드려요' });
	});
	it('기준 미만이면 배송비 + "더 담으면" 문구', () => {
		const t = cartTotals([{ product: a, qty: 1 }]); // 32,000 < 50,000
		expect(t).toMatchObject({ count: 1, subtotal: 32000, shipping: SHIPPING_FEE, total: 32000 + SHIPPING_FEE });
		expect(t.shippingMsg).toBe(`₩${(FREE_SHIPPING - 32000).toLocaleString('ko-KR')} 더 담으면 무료배송이에요`);
	});
	it('기준 이상이면 배송비 0 (경계 포함)', () => {
		const t = cartTotals([
			{ product: a, qty: 1 },
			{ product: b, qty: 1 }
		]); // 60,000
		expect(t).toMatchObject({ count: 2, subtotal: 60000, shipping: 0, total: 60000 });
		expect(cartTotals([{ product: { ...a, price: FREE_SHIPPING }, qty: 1 }]).shipping).toBe(0);
	});
});

describe('sanitizeLines — localStorage 복원', () => {
	it('스냅샷 꼴이 아닌 줄은 버리고 수량은 다시 자른다', () => {
		const v = [{ product: a, qty: 2 }, { product: { code: 'x' }, qty: 1 }, { product: b, qty: 0 }, { product: b, qty: 50 }, null, 'junk'];
		expect(sanitizeLines(v)).toEqual([
			{ product: a, qty: 2 },
			{ product: b, qty: MAX_QTY }
		]);
		expect(sanitizeLines(undefined)).toEqual([]);
	});
});
