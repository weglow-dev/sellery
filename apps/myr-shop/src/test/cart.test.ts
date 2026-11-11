// 장바구니 줄 다루기 · 서버 견적 읽기 — apps/myr-shop/src/lib/cart.ts (금액 · 배송비는 서버 견적 · 구매 수량 상한 없음 · 0095)
import { describe, expect, it } from 'vitest';
import {
	clampQty,
	mergeLine,
	pruneUnselected,
	removeLine,
	sanitizeLines,
	selectedLines,
	setAllSelected,
	setLineQty,
	parseCartQuote,
	parseQuoteBody,
	quoteKey,
	quoteRequest,
	nextGbBoundary,
	setUnselected,
	totalsFromQuote
} from '../lib/cart';
import { MOCK_PRODUCTS, QTY_FORMAT_MAX } from '../lib/data';

const [a, b] = MOCK_PRODUCTS; // 32,000 · 28,000

describe('clampQty', () => {
	it('1 이상 · 상한 없음(형식 범위만) · 정수 아니면 1', () => {
		expect(clampQty(0)).toBe(1);
		expect(clampQty(5)).toBe(5);
		expect(clampQty(99)).toBe(99);
		expect(clampQty(QTY_FORMAT_MAX + 5)).toBe(QTY_FORMAT_MAX);
		expect(clampQty(1.5)).toBe(1);
		expect(clampQty(NaN)).toBe(1);
	});
});

describe('mergeLine · setLineQty · removeLine', () => {
	it('새 줄 추가 · 같은 code 는 합산(상한 없음) + 스냅샷 교체', () => {
		let lines = mergeLine([], a, 2);
		expect(lines).toEqual([{ product: a, qty: 2 }]);
		const newer = { ...a, price: 30000 };
		lines = mergeLine(lines, newer, 8);
		expect(lines).toHaveLength(1);
		expect(lines[0].qty).toBe(10);
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

describe('서버 견적(0092 myr_app_cart_quote) — 화면은 계산하지 않고 읽기만', () => {
	const raw = {
		ok: true,
		lines: [{ code: a.code, option_index: 0, qty: 1, unit_price: 25600, base_price: 32000, line_amount: 25600, base_amount: 32000, groupbuy_state: 'active', groupbuy_code: 'ab12cd34' }],
		items_amount: 25600,
		shipping_fee: 3000,
		free_over: 50000,
		free_shipping_left: 24400
	};
	it('응답 → 견적 · 합계 줄은 서버 값 그대로(무료배송까지 남은 금액도 서버 값)', () => {
		const q = parseCartQuote(raw)!;
		expect(q.lines[0]).toEqual({ code: a.code, qty: 1, unitPrice: 25600, basePrice: 32000, lineAmount: 25600, baseAmount: 32000, gbState: 'active', gbCode: 'ab12cd34' });
		expect(totalsFromQuote(q)).toEqual({ subtotal: 25600, shipping: 3000, total: 28600, shippingMsg: '₩24,400 더 담으면 무료배송이에요' });
		expect(totalsFromQuote({ ...q, shippingFee: 0, freeShippingLeft: 0 }).shippingMsg).toBe('무료배송으로 보내드려요');
	});
	it('살 수 없는 줄 · 틀린 응답', () => {
		expect(parseCartQuote({ ...raw, lines: [{ code: 'x', qty: 1, unit_price: null, line_amount: null }] })!.lines[0].unitPrice).toBeNull();
		expect(parseCartQuote({ ok: false, code: 'BAD_LINES' })).toBeNull();
		expect(parseCartQuote({ ok: true, lines: [] })).toBeNull();
	});
	it('견적 요청 · 본문 검사 — 공구 코드는 그대로 싣는다(끝났는지는 서버가 본다)', () => {
		const gb = { code: 'ab12cd34', state: 'ended' as const, discountPct: 20, startsAt: '2026-11-10T00:00:00Z', endsAt: '2026-11-12T00:00:00Z', price: 25600, options: [] };
		expect(quoteRequest([{ product: a, qty: 2, gb }, { product: b, qty: 1 }])).toEqual([
			{ code: a.code, optionIndex: 0, qty: 2, gb: 'ab12cd34' },
			{ code: b.code, optionIndex: 0, qty: 1 }
		]);
		expect(parseQuoteBody({ all: [{ code: a.code, qty: 1 }], selected: [] })).toEqual({ all: [{ code: a.code, optionIndex: 0, qty: 1 }], selected: [] });
		expect(parseQuoteBody({ all: [{ code: a.code, qty: 0 }], selected: [] })).toBeNull();
		expect(parseQuoteBody({ all: [{ code: a.code, qty: 1, gb: 'NOPE!' }], selected: [] })).toBeNull();
		expect(parseQuoteBody({ all: [] })).toBeNull();
	});
	it('견적 지문(줄 · 수량 · 공구 · 살 수 있음) · 다음 공구 시각(그때 다시 묻는다)', () => {
		expect(quoteKey([{ product: a, qty: 1 }])).not.toBe(quoteKey([{ product: a, qty: 2 }]));
		const gb = { code: 'ab12cd34', state: 'scheduled' as const, discountPct: 20, startsAt: '2026-11-11T00:00:00Z', endsAt: '2026-11-12T00:00:00Z', price: 25600, options: [] };
		const now = Date.parse('2026-11-10T00:00:00Z');
		expect(nextGbBoundary([{ product: a, qty: 1, gb }], now)).toBe(Date.parse(gb.startsAt));
		expect(nextGbBoundary([{ product: a, qty: 1, gb }], Date.parse('2026-11-11T12:00:00Z'))).toBe(Date.parse(gb.endsAt));
		expect(nextGbBoundary([{ product: a, qty: 1 }], now)).toBeNull();
	});
});

describe('sanitizeLines — localStorage 복원', () => {
	it('스냅샷 꼴이 아닌 줄은 버리고 수량은 다시 자른다', () => {
		const v = [{ product: a, qty: 2 }, { product: { code: 'x' }, qty: 1 }, { product: b, qty: 0 }, { product: b, qty: 50 }, null, 'junk'];
		expect(sanitizeLines(v)).toEqual([
			{ product: a, qty: 2 },
			{ product: b, qty: 50 }
		]);
		expect(sanitizeLines(undefined)).toEqual([]);
	});
});

describe('선택 주문 — selectedLines · setUnselected · setAllSelected · pruneUnselected', () => {
	const lines = [
		{ product: a, qty: 1 },
		{ product: b, qty: 2 },
		{ product: { ...a, code: 'c-paused' }, qty: 1, available: false }
	];
	it('기본은 전부 선택 · 살 수 없는 줄은 빠진다', () => {
		expect(selectedLines(lines, []).map((l) => l.product.code)).toEqual([a.code, b.code]);
	});
	it('해제 목록에 있으면 빠지고 · 토글은 멱등', () => {
		let un = setUnselected([], a.code, false);
		expect(un).toEqual([a.code]);
		expect(setUnselected(un, a.code, false)).toEqual([a.code]);
		expect(selectedLines(lines, un).map((l) => l.product.code)).toEqual([b.code]);
		un = setUnselected(un, a.code, true);
		expect(un).toEqual([]);
	});
	it('전체 해제는 지금 줄 전부 · 전체 선택은 빈 목록 · 사라진 code 는 정리', () => {
		expect(setAllSelected(lines, false)).toEqual([a.code, b.code, 'c-paused']);
		expect(setAllSelected(lines, true)).toEqual([]);
		expect(pruneUnselected([a.code, 'gone'], lines)).toEqual([a.code]);
	});
	it('주문 줄(견적 selected 에 싣는 줄)은 선택한 줄만', () => {
		expect(selectedLines(lines, [b.code]).map((l) => l.product.code)).toEqual([a.code]);
	});
});
