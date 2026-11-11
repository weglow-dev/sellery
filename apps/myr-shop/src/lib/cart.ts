/** 장바구니 줄 다루기 · API 입출력 검증 — 순수 모듈(테스트 `src/test/cart.test.ts`). 상태(`state.svelte.ts`)와 서버(`lib/server/cart.ts`)는 여기 함수로만 줄을 바꾼다.
 *  **가격 · 공구 적용 · 배송비는 여기서 계산하지 않는다** — 서버 견적(0092 `myr_app_cart_quote` · `POST /api/cart/quote`)이 체크아웃과 같은 함수로 정한다(백엔드 원칙 1).
 *  구매 수량 상한은 없다(0095) — QTY_FORMAT_MAX 는 숫자 형식 검사일 뿐이고 실제 한도는 결제 때 재고(서버). */
import { GB_CODE_RE, groupbuyFromJson, type Groupbuy, type GroupbuyState } from '@sellery/myr-core/groupbuy';
import type { PriceChange } from '@sellery/myr-core/checkout-rules';
import { QTY_FORMAT_MAX, won, type Product } from './data';
import { fromRow, type Row } from './product-row';

/** 줄 — `available` 는 계정 장바구니(0057)가 주는 값: 담은 뒤 paused·품절·삭제가 되면 false. 비회원 줄(브라우저)은 undefined = 살 수 있다고 본다.
 *  `gb` = 공구 링크로 담은 줄(0086) — 공구가 적용 여부 · 단가는 서버 견적이 정한다(CartQuote) */
export type CartLine = { product: Product; qty: number; available?: boolean; gb?: Groupbuy };
export const canBuy = (l: CartLine): boolean => l.available !== false;

// ---- 서버 견적(0092 myr_app_cart_quote) ----
/** 견적 요청 줄 — 공구 코드는 있는 그대로 싣는다(끝났는지는 서버가 본다) */
export type QuoteRequestLine = { code: string; optionIndex: number; qty: number; gb?: string };
export const quoteRequest = (lines: CartLine[]): QuoteRequestLine[] =>
	lines.map((l) => ({ code: l.product.code, optionIndex: 0, qty: clampQty(l.qty), ...(l.gb ? { gb: l.gb.code } : {}) }));
/** 견적 줄 — unitPrice null = 지금 살 수 없는 줄(샵에 없음 · 옵션 틀림) */
export type QuoteLine = { code: string; qty: number; unitPrice: number | null; basePrice: number | null; lineAmount: number | null; baseAmount: number | null; stockLeft: number | null; gbState: GroupbuyState | null; gbCode: string | null };
export type CartQuote = { lines: QuoteLine[]; itemsAmount: number; shippingFee: number; freeOver: number; freeShippingLeft: number };
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const GB_STATES: readonly string[] = ['scheduled', 'active', 'ended'];
/** RPC · API 응답 → 견적(형식이 다르면 null — 화면은 금액 대신 "확인 중") */
export function parseCartQuote(v: unknown): CartQuote | null {
	const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
	if (!o || o.ok !== true || !Array.isArray(o.lines)) return null;
	const items = numOrNull(o.items_amount);
	const fee = numOrNull(o.shipping_fee);
	if (items === null || fee === null) return null;
	const lines = (o.lines as Record<string, unknown>[])
		.filter((x) => x && typeof x === 'object' && typeof x.code === 'string')
		.map((x) => ({
			code: x.code as string,
			qty: numOrNull(x.qty) ?? 0,
			unitPrice: numOrNull(x.unit_price),
			basePrice: numOrNull(x.base_price),
			lineAmount: numOrNull(x.line_amount),
			baseAmount: numOrNull(x.base_amount),
			stockLeft: numOrNull(x.stock_left),
			gbState: typeof x.groupbuy_state === 'string' && GB_STATES.includes(x.groupbuy_state) ? (x.groupbuy_state as GroupbuyState) : null,
			gbCode: typeof x.groupbuy_code === 'string' ? x.groupbuy_code : null
		}));
	return { lines, itemsAmount: items, shippingFee: fee, freeOver: numOrNull(o.free_over) ?? 0, freeShippingLeft: numOrNull(o.free_shipping_left) ?? 0 };
}
/** POST /api/cart/quote 본문 { all, selected } — 줄마다 code · optionIndex · qty(1 이상 · 형식 검사 QTY_FORMAT_MAX) · gb? · 각 50줄까지. 형식이 틀리면 null */
export type QuoteBody = { all: QuoteRequestLine[]; selected: QuoteRequestLine[] };
export function parseQuoteBody(v: unknown): QuoteBody | null {
	const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
	if (!o) return null;
	const list = (x: unknown): QuoteRequestLine[] | null => {
		if (!Array.isArray(x) || x.length > MERGE_MAX_LINES) return null;
		const out: QuoteRequestLine[] = [];
		for (const raw of x) {
			const l = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
			if (!l || typeof l.code !== 'string' || !CODE_RE.test(l.code)) return null;
			if (!Number.isInteger(l.qty) || (l.qty as number) < 1 || (l.qty as number) > QTY_FORMAT_MAX) return null;
			const optionIndex = l.optionIndex === undefined ? 0 : l.optionIndex;
			if (!Number.isInteger(optionIndex) || (optionIndex as number) < 0 || (optionIndex as number) > 999) return null;
			if (l.gb !== undefined && (typeof l.gb !== 'string' || !GB_CODE_RE.test(l.gb))) return null;
			out.push({ code: l.code, optionIndex: optionIndex as number, qty: l.qty as number, ...(typeof l.gb === 'string' ? { gb: l.gb } : {}) });
		}
		return out;
	};
	const all = list(o.all);
	const selected = list(o.selected);
	return all && selected ? { all, selected } : null;
}
/** API 응답 { ok, all, selected }(이미 CartQuote 모양) 확인 — 틀리면 null */
const isQuote = (q: unknown): q is CartQuote => {
	const o = q as CartQuote | null;
	return !!o && typeof o === 'object' && Array.isArray(o.lines) && Number.isFinite(o.itemsAmount) && Number.isFinite(o.shippingFee) && Number.isFinite(o.freeShippingLeft);
};
export function parseQuoteResponse(v: unknown): { all: CartQuote; selected: CartQuote } | null {
	const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
	return o && o.ok === true && isQuote(o.all) && isQuote(o.selected) ? { all: o.all, selected: o.selected } : null;
}
/** 견적이 바뀌어야 하는 줄의 지문 — 코드 · 수량 · 공구 코드 · 살 수 있음 */
export const quoteKey = (lines: CartLine[]): string => lines.map((l) => `${l.product.code}:${l.qty}:${l.gb?.code ?? ''}:${canBuy(l) ? 1 : 0}`).join('|');
/** 다음에 공구 상태가 바뀌는 시각(시작 · 끝 중 가장 가까운 미래) — 그때 견적을 다시 받는다(판정은 서버). 없으면 null */
export function nextGbBoundary(lines: CartLine[], now: number = Date.now()): number | null {
	const ts = lines.flatMap((l) => (l.gb ? [Date.parse(l.gb.startsAt), Date.parse(l.gb.endsAt)] : [])).filter((t) => Number.isFinite(t) && t > now);
	return ts.length ? Math.min(...ts) : null;
}
/** 장바구니 합계 줄 — 서버 견적 그대로(무료배송까지 남은 금액도 서버 값) */
export type CartTotals = { subtotal: number; shipping: number; total: number; shippingMsg: string };
export const totalsFromQuote = (q: CartQuote): CartTotals => ({
	subtotal: q.itemsAmount,
	shipping: q.shippingFee,
	total: q.itemsAmount + q.shippingFee,
	shippingMsg: q.shippingFee ? `${won(q.freeShippingLeft)} 더 담으면 무료배송이에요` : '무료배송으로 보내드려요'
});

/** 1 이상 정수로(정수가 아니면 1) — 상한 없음 · 숫자 형식 범위(QTY_FORMAT_MAX)만 */
export function clampQty(qty: number): number {
	if (!Number.isInteger(qty)) return 1;
	return Math.max(1, Math.min(QTY_FORMAT_MAX, qty));
}

/** 담기 — 같은 code 가 있으면 수량 합산(상한까지) + 최신 스냅샷으로 교체, 없으면 새 줄. 공구는 새로 온 것이 있으면 그것, 없으면 원래 것 */
export function mergeLine(lines: CartLine[], product: Product, qty: number, gb?: Groupbuy): CartLine[] {
	const add = clampQty(qty);
	const i = lines.findIndex((l) => l.product.code === product.code);
	if (i < 0) return [...lines, { product, qty: add, ...(gb ? { gb } : {}) }];
	return lines.map((l, j) => {
		if (j !== i) return l;
		const g = gb ?? l.gb;
		return { product, qty: clampQty(l.qty + add), available: l.available, ...(g ? { gb: g } : {}) };
	});
}

/** 결제 직전 가격이 바뀌었다(0086 PRICE_CHANGED) — 서버 단가로 줄을 맞춘다: 공구 기간 밖이면 공구를 끝난 것으로 · 공구가가 달랐으면 공구가를 · 공구가 아니면 기본가를 */
export function applyPriceChanges(lines: CartLine[], changes: PriceChange[]): CartLine[] {
	return lines.map((l) => {
		const c = changes.find((x) => x.code === l.product.code);
		if (!c) return l;
		if (c.groupbuy === 'inactive' && l.gb) return { ...l, gb: { ...l.gb, state: 'ended' } };
		if (c.groupbuy === 'active' && l.gb) return { ...l, gb: { ...l.gb, price: c.now } };
		return { ...l, product: { ...l.product, price: c.now } };
	});
}

export function setLineQty(lines: CartLine[], code: string, qty: number): CartLine[] {
	return lines.map((l) => (l.product.code === code ? { ...l, qty: clampQty(qty) } : l));
}

export function removeLine(lines: CartLine[], code: string): CartLine[] {
	return lines.filter((l) => l.product.code !== code);
}

// ---- 선택 주문 (2026-11-02 대표 요청) — "선택 해제한 code 목록" 을 기억한다: 새로 담은 줄은 기본 선택이고, 장바구니에서 빠진 code 는 자동으로 정리된다 ----

/** 주문에 들어갈 줄 = 살 수 있고 선택 해제되지 않은 줄 */
export const selectedLines = (lines: CartLine[], unselected: readonly string[]): CartLine[] =>
	lines.filter((l) => canBuy(l) && !unselected.includes(l.product.code));

/** 선택 토글 — on 이면 해제 목록에서 빼고, 아니면 넣는다 */
export function setUnselected(unselected: readonly string[], code: string, selected: boolean): string[] {
	if (selected) return unselected.filter((c) => c !== code);
	return unselected.includes(code) ? [...unselected] : [...unselected, code];
}

/** 전체 선택/해제 — 해제는 지금 있는 줄 전부를 해제 목록에 */
export const setAllSelected = (lines: CartLine[], selected: boolean): string[] => (selected ? [] : lines.map((l) => l.product.code));

/** 장바구니에서 사라진 code 는 해제 목록에서도 정리 */
export const pruneUnselected = (unselected: readonly string[], lines: CartLine[]): string[] =>
	unselected.filter((c) => lines.some((l) => l.product.code === c));

/** localStorage 에서 읽은 값 검증 — 스냅샷 꼴이 아니면 버린다 */
export const isProduct = (p: unknown): p is Product =>
	!!p && typeof p === 'object' && typeof (p as Product).code === 'string' && typeof (p as Product).price === 'number';
const isGroupbuy = (g: unknown): g is Groupbuy => {
	const o = g as Groupbuy | null;
	return (
		!!o && typeof o === 'object' && typeof o.code === 'string' && GB_CODE_RE.test(o.code) && ['scheduled', 'active', 'ended'].includes(o.state) &&
		Number.isInteger(o.price) && Number.isInteger(o.discountPct) && !Number.isNaN(Date.parse(o.startsAt)) && !Number.isNaN(Date.parse(o.endsAt))
	);
};
export function sanitizeLines(v: unknown): CartLine[] {
	if (!Array.isArray(v)) return [];
	return v
		.filter(
			(l): l is CartLine =>
				!!l && typeof l === 'object' && isProduct((l as CartLine).product) && Number.isInteger((l as CartLine).qty) && (l as CartLine).qty > 0
		)
		.map((l) => ({
			product: l.product,
			qty: clampQty(l.qty),
			...(isGroupbuy(l.gb) ? { gb: { ...l.gb, options: Array.isArray(l.gb.options) ? l.gb.options : [] } } : {})
		}));
}

// ---- 계정 장바구니(0057) 입출력 ----

/** `myr_cart_get` 행(상품 공개 JSON + qty · option_index · available · groupbuy) → 줄 */
export function linesFromRows(rows: unknown): CartLine[] {
	if (!Array.isArray(rows)) return [];
	return (rows as Row[])
		.filter((r) => r && typeof r === 'object' && typeof r.code === 'string')
		.map((r) => {
			const gb = groupbuyFromJson((r as { groupbuy?: unknown }).groupbuy);
			return { product: fromRow(r), qty: clampQty(typeof r.qty === 'number' ? r.qty : 1), available: r.available !== false, ...(gb ? { gb } : {}) };
		});
}

/** 비회원 줄 → `myr_cart_merge` 입력 (option_index 는 아직 0 — 옵션 UI 가 생기면 줄에 실린다) · 공구 코드는 그대로(끝났으면 myr_cart_set 이 버린다) */
export type MergeLine = { code: string; qty: number; option_index: number; gb?: string };
export const mergePayload = (lines: CartLine[]): MergeLine[] =>
	lines.map((l) => ({ code: l.product.code, qty: clampQty(l.qty), option_index: 0, ...(l.gb ? { gb: l.gb.code } : {}) }));

/** 상품 code 형식 = myr_products.code 제약(소문자·숫자·하이픈 1~48) */
export const CODE_RE = /^[a-z0-9][a-z0-9-]{0,47}$/;
export const MERGE_MAX_LINES = 50;
export const MERGE_MAX_CODES = 100;
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const isCode = (v: unknown): v is string => typeof v === 'string' && CODE_RE.test(v);

const isGbCode = (v: unknown): v is string => typeof v === 'string' && GB_CODE_RE.test(v);

/** PUT /api/cart 본문 `{ code, qty, add?, gb? }` — qty 0 이상 정수(형식 검사 QTY_FORMAT_MAX)(0 = 삭제) · gb 는 공구 코드(형식이 틀리면 null) · 아니면 null */
export function parseSetBody(v: unknown): { code: string; qty: number; add: boolean; gb?: string } | null {
	const b = obj(v);
	if (!b || !isCode(b.code) || !Number.isInteger(b.qty) || (b.qty as number) < 0 || (b.qty as number) > QTY_FORMAT_MAX) return null;
	if (b.gb != null && !isGbCode(b.gb)) return null;
	return { code: b.code, qty: b.qty as number, add: b.add === true, ...(isGbCode(b.gb) ? { gb: b.gb } : {}) };
}

/** POST /api/cart/merge 본문 `{ lines: [{ code, qty }] }` — 줄 ≤ 50 · 같은 code 는 합친다(상한) · 잘못된 줄은 버린다 · 배열이 아니면 null */
export function parseMergeBody(v: unknown): MergeLine[] | null {
	const b = obj(v);
	if (!b || !Array.isArray(b.lines) || b.lines.length > MERGE_MAX_LINES) return null;
	const byCode = new Map<string, number>();
	const gbs = new Map<string, string>();
	for (const raw of b.lines) {
		const l = obj(raw);
		if (!l || !isCode(l.code) || !Number.isInteger(l.qty) || (l.qty as number) <= 0) continue;
		byCode.set(l.code, Math.min(QTY_FORMAT_MAX, (byCode.get(l.code) ?? 0) + (l.qty as number)));
		if (isGbCode(l.gb) && !gbs.has(l.code)) gbs.set(l.code, l.gb);
	}
	return [...byCode].map(([code, qty]) => {
		const gb = gbs.get(code);
		return { code, qty, option_index: 0, ...(gb ? { gb } : {}) };
	});
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
