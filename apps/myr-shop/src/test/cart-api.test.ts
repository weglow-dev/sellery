// 계정 장바구니(0057) 입출력 — apps/myr-shop/src/lib/cart.ts 의 linesFromRows · mergePayload · parse* (API 라우트가 본문 검증에 쓴다)
import { describe, expect, it } from 'vitest';
import { canBuy, linesFromRows, quoteRequest, mergePayload, parseCodesBody, parseLikeBody, parseMergeBody, parseSetBody } from '../lib/cart';
import { MOCK_PRODUCTS, QTY_INT_MAX } from '../lib/data';

const [a, b] = MOCK_PRODUCTS;
const row = (code: string, qty: number, available: boolean, price = 10000) => ({
	id: 'x',
	code,
	category: 'diet',
	name: code,
	price,
	qty,
	option_index: 0,
	available,
	creator: { id: 's', name: '셀러', handle: '@s', avatar_url: null }
});

describe('linesFromRows — myr_cart_get 응답', () => {
	it('행 → 줄 (상품 매핑 + qty + available) · 이상한 행은 버린다 · 배열 아니면 []', () => {
		const lines = linesFromRows([row('a', 2, true), row('b', 50, false), null, { qty: 1 }, 'x']);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatchObject({ qty: 2, available: true });
		expect(lines[0].product).toMatchObject({ code: 'a', price: 10000, cat: 'diet' });
		expect(lines[1]).toMatchObject({ qty: 50, available: false }); // 구매 수량 상한 없음(0095)
		expect(linesFromRows(null)).toEqual([]);
		expect(linesFromRows({})).toEqual([]);
	});
	it('available 이 없으면(옛 응답) 살 수 있다고 본다', () => {
		const [l] = linesFromRows([{ ...row('a', 1, true), available: undefined }]);
		expect(canBuy(l)).toBe(true);
	});
});

describe('살 수 없는 줄은 견적(합계 · 배송비)에 싣지 않는다', () => {
	it('available:false 줄은 빼고 견적을 묻는다 — 금액은 서버가', () => {
		const lines = [
			{ product: a, qty: 1 },
			{ product: b, qty: 2, available: false }
		];
		expect(quoteRequest(lines.filter(canBuy)).map((l) => l.code)).toEqual([a.code]);
		expect(quoteRequest([{ product: a, qty: 3, available: false }].filter(canBuy))).toEqual([]);
	});
});

describe('mergePayload — 비회원 줄 → myr_cart_merge 입력', () => {
	it('code · qty(상한) · option_index 0', () => {
		expect(
			mergePayload([
				{ product: a, qty: 2 },
				{ product: b, qty: 99 }
			])
		).toEqual([
			{ code: a.code, qty: 2, option_index: 0 },
			{ code: b.code, qty: 99, option_index: 0 }
		]);
	});
});

describe('parseSetBody — PUT /api/cart', () => {
	it('정상 · qty 0 (삭제) · add', () => {
		expect(parseSetBody({ code: 'minji-grape-jelly', qty: 3 })).toEqual({ code: 'minji-grape-jelly', qty: 3, add: false });
		expect(parseSetBody({ code: 'a1', qty: 0, add: true })).toEqual({ code: 'a1', qty: 0, add: true });
	});
	it('code 형식 · qty 범위·정수 · 본문 꼴이 틀리면 null', () => {
		expect(parseSetBody({ code: 'Bad Code', qty: 1 })).toBeNull();
		expect(parseSetBody({ code: 'a', qty: 10 })).toEqual({ code: 'a', qty: 10, add: false }); // 9 상한 없음(0095)
		expect(parseSetBody({ code: 'a', qty: QTY_INT_MAX + 1 })).toBeNull(); // 숫자 형식 범위만
		expect(parseSetBody({ code: 'a', qty: -1 })).toBeNull();
		expect(parseSetBody({ code: 'a', qty: 1.5 })).toBeNull();
		expect(parseSetBody({ code: 'a', qty: '1' })).toBeNull();
		expect(parseSetBody(null)).toBeNull();
		expect(parseSetBody([])).toBeNull();
	});
});

describe('parseMergeBody — POST /api/cart/merge', () => {
	it('같은 code 는 합치고(상한 없음 · 0095) 잘못된 줄은 버린다 · 빈 배열은 []', () => {
		expect(parseMergeBody({ lines: [{ code: 'a', qty: 2 }, { code: 'b', qty: 0 }, { code: 'A', qty: 1 }, { code: 'a', qty: 8 }, null, { qty: 1 }] })).toEqual([
			{ code: 'a', qty: 10, option_index: 0 }
		]);
		expect(parseMergeBody({ lines: [] })).toEqual([]);
	});
	it('lines 가 배열이 아니거나 50 줄 넘으면 null', () => {
		expect(parseMergeBody({ lines: 'x' })).toBeNull();
		expect(parseMergeBody({})).toBeNull();
		expect(parseMergeBody({ lines: Array.from({ length: 51 }, (_, i) => ({ code: `c${i}`, qty: 1 })) })).toBeNull();
	});
});

describe('parseLikeBody · parseCodesBody — /api/likes', () => {
	it('like: code + boolean 만', () => {
		expect(parseLikeBody({ code: 'a', liked: true })).toEqual({ code: 'a', liked: true });
		expect(parseLikeBody({ code: 'a', liked: 'yes' })).toBeNull();
		expect(parseLikeBody({ code: '', liked: true })).toBeNull();
	});
	it('codes: 중복 제거 · 형식 틀린 것 제외 · 100 개 초과 null', () => {
		expect(parseCodesBody({ codes: ['a', 'a', 'B', 7, 'b-2'] })).toEqual(['a', 'b-2']);
		expect(parseCodesBody({ codes: Array(101).fill('a') })).toBeNull();
		expect(parseCodesBody({ codes: 'a' })).toBeNull();
	});
});
