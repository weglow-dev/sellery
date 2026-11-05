// 내 제품 — DB 행 → 화면(상태 · 보조 문구 · 비주얼) · 탭 · 홈 카운트 (0071 · docs/myr.md §4.2.1 3번)
import { describe, expect, it } from 'vitest';
import type { SellerProductRow } from '@sellery/myr-core/seller-products';
import { STATUS_FROM_DB, productFromRow, productMeta, relativeTime, reviewDay, revisionFromRow } from '../lib/product-row';
import { PRODUCT_TABS, filterProducts, homeProductCounts, productTabCounts, showsStock } from '../lib/rules';

const NOW = new Date('2026-11-05T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const H = 3_600_000;
const D = 24 * H;
const row = (o: Partial<SellerProductRow> = {}): SellerProductRow => ({
	id: 'p1', code: 'minji-jelly', name: '포도 젤리', status: 'listed', rejectReason: null, category: 'diet', price: 32000, optionCount: 0,
	stock: 100, soldQty: 30, stockLeft: 70, tile: 'linear-gradient(145deg,#a,#b)', icon: 'grape', thumbUrl: null,
	submittedAt: ago(20 * D), reviewedAt: ago(14 * D), createdAt: ago(20 * D), updatedAt: ago(2 * H), revision: null, ...o
});

describe('relativeTime · reviewDay', () => {
	it('방금 → 분 → 시간 → 어제 → 일 → 주 → 개월', () => {
		expect([30_000, 5 * 60_000, 3 * H, 30 * H, 3 * D, 14 * D, 65 * D].map((ms) => relativeTime(ago(ms), NOW))).toEqual(['방금', '5분 전', '3시간 전', '어제', '3일 전', '2주 전', '2개월 전']);
		expect(relativeTime(null, NOW)).toBe('');
		expect(relativeTime(new Date(NOW.getTime() + H).toISOString(), NOW)).toBe('방금'); // 시계 차이로 미래면 방금
	});
	it('제출한 날이 심사 1일차', () => {
		expect([reviewDay(ago(2 * H), NOW), reviewDay(ago(D + H), NOW), reviewDay(null, NOW)]).toEqual([1, 2, 1]);
	});
});

describe('productFromRow · productMeta', () => {
	it('DB 상태 여섯 개 → 화면 상태', () => {
		expect(STATUS_FROM_DB).toEqual({ listed: 'live', paused: 'paused', pending: 'review', rejected: 'rejected', draft: 'draft', ended: 'ended' });
	});
	it('판매 중 — 승인 시각 · 재고는 남은 재고 · 샵과 같은 비주얼', () => {
		const p = productFromRow(row(), NOW);
		expect(p).toMatchObject({ id: 'p1', code: 'minji-jelly', status: 'live', stock: 70, sold: 30, price: 32000, bg: 'linear-gradient(145deg,#a,#b)', iconId: 'grape', meta: '2주 전 승인' });
	});
	it('상태별 보조 문구', () => {
		expect(productMeta(row({ status: 'listed', reviewedAt: null, soldQty: 1234 }), NOW)).toBe('누적 1,234개 판매');
		expect(productMeta(row({ status: 'pending', submittedAt: ago(2 * D + H) }), NOW)).toBe('심사 3일차');
		expect(productMeta(row({ status: 'draft', updatedAt: ago(30 * H) }), NOW)).toBe('어제 저장');
		expect(productMeta(row({ status: 'paused', updatedAt: ago(3 * H) }), NOW)).toBe('3시간 전 일시중지');
		expect(productMeta(row({ status: 'rejected', rejectReason: '성분 표기 보완' }), NOW)).toBe('사유 · 성분 표기 보완');
		expect(productMeta(row({ status: 'rejected', rejectReason: null }), NOW)).toBe('반려됨');
		expect(productMeta(row({ status: 'ended' }), NOW)).toBe('판매 종료');
	});
	it('이름이 비면 자리표시', () => expect(productFromRow(row({ name: '' }), NOW).name).toBe('이름 없는 제품'));
});

describe('탭 · 재고 표시 · 홈 카운트', () => {
	const list = (['listed', 'paused', 'pending', 'rejected', 'draft', 'ended'] as const).map((s, i) => productFromRow(row({ id: `p${i}`, status: s }), NOW));
	it('탭 다섯 개 — 판매 중엔 일시중지, 심사 중엔 반려가 함께', () => {
		expect(PRODUCT_TABS.map((t) => t.name)).toEqual(['전체', '판매 중', '심사 중', '임시저장', '종료']);
		expect(filterProducts(list, 'live').map((p) => p.status)).toEqual(['live', 'paused']);
		expect(filterProducts(list, 'review').map((p) => p.status)).toEqual(['review', 'rejected']);
		expect(filterProducts(list, 'draft').map((p) => p.status)).toEqual(['draft']);
		expect(filterProducts(list, 'ended').map((p) => p.status)).toEqual(['ended']);
		expect(productTabCounts(list).map((t) => t.count)).toEqual([6, 2, 2, 1, 1]);
	});
	it('재고는 판매 중 · 일시중지만', () => {
		expect(list.filter((p) => showsStock(p.status)).map((p) => p.status)).toEqual(['live', 'paused']);
	});
	it('홈 — 판매 중 수 · 심사(반려 포함) + 임시저장 수 · 빈 목록은 0', () => {
		expect(homeProductCounts(list)).toEqual({ live: 1, pending: 3 });
		expect(homeProductCounts([])).toEqual({ live: 0, pending: 0 });
	});
});

describe('수정 심사(0074 · 4-2) — 칩 문구 · 탭 · 홈 카운트', () => {
	it('DB 수정본 → 심사 중 "수정 심사 N일차" · 반려 "사유 · …" · 없으면 null', () => {
		expect(revisionFromRow(row(), NOW)).toBeNull();
		expect(revisionFromRow(row({ revision: { status: 'pending', rejectReason: null, submittedAt: ago(D + H), reviewedAt: null } }), NOW)).toEqual({ state: 'review', meta: '수정 심사 2일차' });
		expect(revisionFromRow(row({ revision: { status: 'rejected', rejectReason: '효능 표현', submittedAt: ago(3 * D), reviewedAt: ago(D) } }), NOW)).toEqual({ state: 'rejected', meta: '사유 · 효능 표현' });
		expect(productFromRow(row({ revision: { status: 'pending', rejectReason: null, submittedAt: ago(H), reviewedAt: null } }), NOW).revision?.state).toBe('review');
	});
	it('수정 심사 중인 판매 중 상품은 판매 중 · 심사 중 탭 둘 다 · 홈 심사 수에 포함', () => {
		const p = productFromRow(row({ id: 'r1', status: 'listed', revision: { status: 'pending', rejectReason: null, submittedAt: ago(H), reviewedAt: null } }), NOW);
		expect(filterProducts([p], 'live')).toHaveLength(1);
		expect(filterProducts([p], 'review')).toHaveLength(1);
		expect(homeProductCounts([p])).toEqual({ live: 1, pending: 1 });
	});
});
