// 공구 링크(0086) — 장바구니 줄의 공구가 · 끝난 공구 · 결제 직전 가격 변경 · API 본문 · 유입 쿠키 (lib/cart.ts · lib/groupbuy-link.ts)
import { describe, expect, it } from 'vitest';
import type { Groupbuy } from '@sellery/myr-core/groupbuy';
import {
	applyPriceChanges,
	linesFromRows,
	mergeLine,
	mergePayload,
	parseMergeBody,
	parseSetBody,
	sanitizeLines
} from '../lib/cart';
import { MOCK_PRODUCTS } from '../lib/data';
import { GB_COOKIE_MAX, readGbCookie, writeGbCookie } from '../lib/groupbuy-link';

const [a, b] = MOCK_PRODUCTS; // 32,000 · 28,000
const NOW = Date.parse('2026-11-10T03:00:00Z');
const gb: Groupbuy = { code: 'ab12cd34', state: 'active', discountPct: 20, startsAt: '2026-11-10T00:00:00Z', endsAt: '2026-11-12T00:00:00Z', price: 25600, options: [] };

// 줄 단가 · 공구 적용 · 합계는 서버 견적(0092 myr_app_cart_quote · supabase/tests/myr_server_quotes.test.sql) — 화면 계산이 없다

describe('mergeLine — 공구', () => {
	it('링크로 담으면 공구 · 코드 없이 다시 담아도 공구 유지 · 새 공구가 오면 바꾼다', () => {
		let lines = mergeLine([], a, 1, gb);
		expect(lines[0].gb?.code).toBe('ab12cd34');
		lines = mergeLine(lines, a, 1);
		expect([lines[0].qty, lines[0].gb?.code]).toEqual([2, 'ab12cd34']);
		lines = mergeLine(lines, a, 1, { ...gb, code: 'zz99yy88' });
		expect(lines[0].gb?.code).toBe('zz99yy88');
		expect(mergeLine([], b, 1)[0]).not.toHaveProperty('gb');
	});
});

describe('applyPriceChanges — 결제 직전 PRICE_CHANGED', () => {
	it('공구 기간 밖 → 공구 끝남 · 공구가 다름 → 공구가 · 공구 아님 → 기본가', () => {
		const lines = [{ product: a, qty: 1, gb }, { product: b, qty: 1 }];
		const out = applyPriceChanges(lines, [
			{ code: a.code, optionIndex: 0, was: 25600, now: 32000, groupbuy: 'inactive' },
			{ code: b.code, optionIndex: 0, was: 28000, now: 30000, groupbuy: null }
		]);
		expect([out[0].gb?.state, out[1].product.price]).toEqual(['ended', 30000]);
		const g2 = applyPriceChanges(lines, [{ code: a.code, optionIndex: 0, was: 25600, now: 25000, groupbuy: 'active' }]);
		expect(g2[0].gb?.price).toBe(25000);
		expect(applyPriceChanges(lines, [])).toEqual(lines);
	});
});

describe('저장 · 서버 입출력', () => {
	it('브라우저 저장값 — 공구 모양이 틀리면 공구만 버린다', () => {
		expect(sanitizeLines([{ product: a, qty: 1, gb }])[0].gb).toEqual(gb);
		expect(sanitizeLines([{ product: a, qty: 1, gb: { ...gb, code: 'BAD' } }])[0]).toEqual({ product: a, qty: 1 });
	});
	it('myr_cart_get 줄의 groupbuy → gb', () => {
		const row = { id: 'p1', code: 'minji-grape-jelly', name: '포도', price: 32000, qty: 1, available: true, creator: { id: 'c', name: 'n', handle: '@h' },
			groupbuy: { code: 'ab12cd34', state: 'active', discount_pct: 20, starts_at: gb.startsAt, ends_at: gb.endsAt, price: 25600 } };
		expect(linesFromRows([row])[0].gb).toEqual(gb);
		expect(linesFromRows([{ ...row, groupbuy: null }])[0]).not.toHaveProperty('gb');
	});
	it('합치기 입력 — 공구 코드는 그대로(끝났으면 서버 myr_cart_set 이 버린다)', () => {
		expect(mergePayload([{ product: a, qty: 1, gb }, { product: b, qty: 1, gb: { ...gb, state: 'ended' } }])).toEqual([
			{ code: a.code, qty: 1, option_index: 0, gb: 'ab12cd34' },
			{ code: b.code, qty: 1, option_index: 0, gb: 'ab12cd34' }
		]);
	});
	it('PUT · merge 본문 — gb 형식 확인', () => {
		expect(parseSetBody({ code: 'a', qty: 1, add: true, gb: 'ab12cd34' })).toEqual({ code: 'a', qty: 1, add: true, gb: 'ab12cd34' });
		expect(parseSetBody({ code: 'a', qty: 1, gb: 'NOPE!' })).toBeNull();
		expect(parseMergeBody({ lines: [{ code: 'a', qty: 1, gb: 'ab12cd34' }, { code: 'a', qty: 1, gb: 'zz99yy88' }, { code: 'b', qty: 1, gb: 'X' }] })).toEqual([
			{ code: 'a', qty: 2, option_index: 0, gb: 'ab12cd34' },
			{ code: 'b', qty: 1, option_index: 0 }
		]);
	});
});

describe('유입 쿠키 myr_gb', () => {
	it('읽기 — 형식이 틀린 항목 · 깨진 값은 버린다', () => {
		expect(readGbCookie(JSON.stringify({ 'minji-grape-jelly': 'ab12cd34', 'Bad Code': 'ab12cd34', b: 'X' }))).toEqual({ 'minji-grape-jelly': 'ab12cd34' });
		expect(readGbCookie('{nope')).toEqual({});
		expect(readGbCookie(undefined)).toEqual({});
	});
	it('쓰기 — 같은 상품은 바꾸고 맨 뒤로 · 많으면 오래된 것부터 자른다', () => {
		expect(JSON.parse(writeGbCookie({ a: 'aaaaaaaa', b: 'bbbbbbbb' }, 'a', 'cccccccc'))).toEqual({ b: 'bbbbbbbb', a: 'cccccccc' });
		const many = Object.fromEntries(Array.from({ length: GB_COOKIE_MAX }, (_, i) => [`p${i}`, 'aaaaaaaa']));
		const out = JSON.parse(writeGbCookie(many, 'new', 'bbbbbbbb'));
		expect(Object.keys(out)).toHaveLength(GB_COOKIE_MAX);
		expect(out).not.toHaveProperty('p0');
		expect(out.new).toBe('bbbbbbbb');
	});
});
