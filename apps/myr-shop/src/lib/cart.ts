/** 장바구니 계산 — 순수 모듈(테스트 `src/test/cart.test.ts`). 상태(`state.svelte.ts`)는 여기 함수로만 줄을 바꾼다.
 *  숫자는 `data.ts` 의 FREE_SHIPPING · SHIPPING_FEE · MAX_QTY — M4 에서 서버 규칙(docs/myr.md §6.2 · §9-11)과 같은 값으로 맞춘다. */
import { FREE_SHIPPING, MAX_QTY, SHIPPING_FEE, won, type Product } from './data';

export type CartLine = { product: Product; qty: number };

/** 1..MAX_QTY 로 자른다(정수가 아니면 1) */
export function clampQty(qty: number): number {
	if (!Number.isInteger(qty)) return 1;
	return Math.max(1, Math.min(MAX_QTY, qty));
}

/** 담기 — 같은 code 가 있으면 수량 합산(상한까지) + 최신 스냅샷으로 교체, 없으면 새 줄 */
export function mergeLine(lines: CartLine[], product: Product, qty: number): CartLine[] {
	const add = clampQty(qty);
	const i = lines.findIndex((l) => l.product.code === product.code);
	if (i < 0) return [...lines, { product, qty: add }];
	return lines.map((l, j) => (j === i ? { product, qty: clampQty(l.qty + add) } : l));
}

export function setLineQty(lines: CartLine[], code: string, qty: number): CartLine[] {
	return lines.map((l) => (l.product.code === code ? { ...l, qty: clampQty(qty) } : l));
}

export function removeLine(lines: CartLine[], code: string): CartLine[] {
	return lines.filter((l) => l.product.code !== code);
}

export type CartTotals = { count: number; subtotal: number; shipping: number; total: number; shippingMsg: string };

/** 수량 합 · 상품 금액 · 배송비(비어 있거나 기준 이상이면 0) · 총액 · 무료배송 안내 문구 */
export function cartTotals(lines: CartLine[]): CartTotals {
	const count = lines.reduce((n, l) => n + l.qty, 0);
	const subtotal = lines.reduce((n, l) => n + l.product.price * l.qty, 0);
	const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING ? 0 : SHIPPING_FEE;
	return {
		count,
		subtotal,
		shipping,
		total: subtotal + shipping,
		shippingMsg: shipping ? `${won(FREE_SHIPPING - subtotal)} 더 담으면 무료배송이에요` : '무료배송으로 보내드려요'
	};
}

/** localStorage 에서 읽은 값 검증 — 스냅샷 꼴이 아니면 버린다 */
export const isProduct = (p: unknown): p is Product =>
	!!p && typeof p === 'object' && typeof (p as Product).code === 'string' && typeof (p as Product).price === 'number';
export function sanitizeLines(v: unknown): CartLine[] {
	if (!Array.isArray(v)) return [];
	return v
		.filter(
			(l): l is CartLine =>
				!!l && typeof l === 'object' && isProduct((l as CartLine).product) && Number.isInteger((l as CartLine).qty) && (l as CartLine).qty > 0
		)
		.map((l) => ({ product: l.product, qty: clampQty(l.qty) }));
}
