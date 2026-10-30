/** 장바구니 계산 · API 입출력 검증 — 순수 모듈(테스트 `src/test/cart.test.ts`). 상태(`state.svelte.ts`)와 서버(`lib/server/cart.ts`)는 여기 함수로만 줄을 바꾼다.
 *  숫자는 `data.ts` 의 FREE_SHIPPING · SHIPPING_FEE · MAX_QTY — 0057 `myr_cart_set` 의 상한(9)과 같은 값(바꾸면 둘 다 · docs/myr.md §6.2). */
import { FREE_SHIPPING, MAX_QTY, SHIPPING_FEE, won, type Product } from './data';
import { fromRow, type Row } from './product-row';

/** 줄 — `available` 는 계정 장바구니(0057)가 주는 값: 담은 뒤 paused·품절·삭제가 되면 false. 비회원 줄(브라우저)은 undefined = 살 수 있다고 본다 */
export type CartLine = { product: Product; qty: number; available?: boolean };
export const canBuy = (l: CartLine): boolean => l.available !== false;

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
	return lines.map((l, j) => (j === i ? { product, qty: clampQty(l.qty + add), available: l.available } : l));
}

export function setLineQty(lines: CartLine[], code: string, qty: number): CartLine[] {
	return lines.map((l) => (l.product.code === code ? { ...l, qty: clampQty(qty) } : l));
}

export function removeLine(lines: CartLine[], code: string): CartLine[] {
	return lines.filter((l) => l.product.code !== code);
}

export type CartTotals = { count: number; subtotal: number; shipping: number; total: number; shippingMsg: string };

/** 수량 합 · 상품 금액 · 배송비(비어 있거나 기준 이상이면 0) · 총액 · 무료배송 안내 문구 — 살 수 없는 줄은 셈에서 뺀다 */
export function cartTotals(lines: CartLine[]): CartTotals {
	const buyable = lines.filter(canBuy);
	const count = buyable.reduce((n, l) => n + l.qty, 0);
	const subtotal = buyable.reduce((n, l) => n + l.product.price * l.qty, 0);
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

// ---- 계정 장바구니(0057) 입출력 ----

/** `myr_cart_get` 행(상품 공개 JSON + qty · option_index · available) → 줄 */
export function linesFromRows(rows: unknown): CartLine[] {
	if (!Array.isArray(rows)) return [];
	return (rows as Row[])
		.filter((r) => r && typeof r === 'object' && typeof r.code === 'string')
		.map((r) => ({ product: fromRow(r), qty: clampQty(typeof r.qty === 'number' ? r.qty : 1), available: r.available !== false }));
}

/** 비회원 줄 → `myr_cart_merge` 입력 (option_index 는 아직 0 — 옵션 UI 가 생기면 줄에 실린다) */
export type MergeLine = { code: string; qty: number; option_index: number };
export const mergePayload = (lines: CartLine[]): MergeLine[] => lines.map((l) => ({ code: l.product.code, qty: clampQty(l.qty), option_index: 0 }));

/** 상품 code 형식 = myr_products.code 제약(소문자·숫자·하이픈 1~48) */
export const CODE_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
export const MERGE_MAX_LINES = 50;
export const MERGE_MAX_CODES = 100;
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const isCode = (v: unknown): v is string => typeof v === 'string' && CODE_RE.test(v);

/** PUT /api/cart 본문 `{ code, qty, add? }` — qty 0..MAX_QTY 정수(0 = 삭제) · 아니면 null */
export function parseSetBody(v: unknown): { code: string; qty: number; add: boolean } | null {
	const b = obj(v);
	if (!b || !isCode(b.code) || !Number.isInteger(b.qty) || (b.qty as number) < 0 || (b.qty as number) > MAX_QTY) return null;
	return { code: b.code, qty: b.qty as number, add: b.add === true };
}

/** POST /api/cart/merge 본문 `{ lines: [{ code, qty }] }` — 줄 ≤ 50 · 같은 code 는 합친다(상한) · 잘못된 줄은 버린다 · 배열이 아니면 null */
export function parseMergeBody(v: unknown): MergeLine[] | null {
	const b = obj(v);
	if (!b || !Array.isArray(b.lines) || b.lines.length > MERGE_MAX_LINES) return null;
	const byCode = new Map<string, number>();
	for (const raw of b.lines) {
		const l = obj(raw);
		if (!l || !isCode(l.code) || !Number.isInteger(l.qty) || (l.qty as number) <= 0) continue;
		byCode.set(l.code, Math.min(MAX_QTY, (byCode.get(l.code) ?? 0) + (l.qty as number)));
	}
	return [...byCode].map(([code, qty]) => ({ code, qty, option_index: 0 }));
}

/** PUT /api/likes 본문 `{ code, liked }` */
export function parseLikeBody(v: unknown): { code: string; liked: boolean } | null {
	const b = obj(v);
	if (!b || !isCode(b.code) || typeof b.liked !== 'boolean') return null;
	return { code: b.code, liked: b.liked };
}

/** POST /api/likes/merge 본문 `{ codes: string[] }` — ≤ 100 · 중복 제거 · 형식 틀린 것은 버린다 */
export function parseCodesBody(v: unknown): string[] | null {
	const b = obj(v);
	if (!b || !Array.isArray(b.codes) || b.codes.length > MERGE_MAX_CODES) return null;
	return [...new Set(b.codes.filter(isCode))];
}
