// 내 제품 행 파서 — 0071 myr_app_seller_products 응답
import { describe, expect, it } from 'vitest';
import { SELLER_PRODUCT_STATUSES, parseSellerProductRevision, parseSellerProductRows } from '../seller-products';

const row = (o: Record<string, unknown> = {}) => ({
	id: 'p1', code: 'minji-jelly', name: '포도 젤리', status: 'listed', reject_reason: null, category: 'diet', price: 32000, option_count: 2,
	stock: 100, sold_qty: 30, stock_left: 70, tile: 'linear-gradient(145deg,#a,#b)', icon: 'grape', thumb_url: null,
	submitted_at: '2026-10-29T00:00:00Z', reviewed_at: null, created_at: '2026-10-29T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', ...o
});

describe('parseSellerProductRows', () => {
	it('필드 이름을 화면 쪽 이름으로', () => {
		expect(parseSellerProductRows([row()])).toEqual([
			{ id: 'p1', code: 'minji-jelly', name: '포도 젤리', status: 'listed', rejectReason: null, category: 'diet', price: 32000, optionCount: 2, stock: 100, soldQty: 30, stockLeft: 70, tile: 'linear-gradient(145deg,#a,#b)', icon: 'grape', thumbUrl: null, submittedAt: '2026-10-29T00:00:00Z', reviewedAt: null, createdAt: '2026-10-29T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', revision: null }
		]);
	});
	it('여섯 상태 모두 받는다 · 모르는 상태 · id 없는 행은 버린다', () => {
		expect(parseSellerProductRows(SELLER_PRODUCT_STATUSES.map((s, i) => row({ id: `p${i}`, status: s }))).map((r) => r.status)).toEqual([...SELLER_PRODUCT_STATUSES]);
		expect(parseSellerProductRows([row({ status: 'sold_out' }), row({ id: 1 }), null, 'x'])).toEqual([]);
	});
	it('숫자 방어(음수 · 문자 → 0) · 아이콘 기본값 · 빈 문자열은 null', () => {
		const [r] = parseSellerProductRows([row({ price: -5, stock_left: '7', icon: '', tile: '', reject_reason: '' })]);
		expect([r.price, r.stockLeft, r.icon, r.tile, r.rejectReason]).toEqual([0, 0, 'pill', null, null]);
	});
	it('배열이 아니면 빈 목록', () => {
		for (const v of [null, undefined, {}, 'x']) expect(parseSellerProductRows(v)).toEqual([]);
	});
});

describe('상품 이미지 경로 — 지우기 전 확인(0073)', () => {
	it('<seller uuid>/<이름>.<jpg|png|webp> 만', async () => {
		const { isProductImagePath, productImagePath } = await import('../product-images');
		const sid = '867dec23-1250-4351-b8c2-5c97853c6096';
		expect(isProductImagePath(productImagePath(sid, 'png', '0f8a1c2e-1111-2222-3333-444455556666'))).toBe(true);
		for (const bad of [`${sid}/../x.png`, `${sid}/a.gif`, 'refunds/x.jpg', `${sid}/sub/x.jpg`, '']) expect(isProductImagePath(bad), bad).toBe(false);
	});
});

describe('수정 심사(0074) — 목록 행 · 열린 수정본', () => {
	it('행의 revision — 심사 중 · 반려만, 그 밖(모르는 상태 · 없음)은 null', () => {
		const [a, b, c, d] = parseSellerProductRows([
			row({ id: 'a', revision: { status: 'pending', reject_reason: null, submitted_at: '2026-11-05T00:00:00Z', reviewed_at: null } }),
			row({ id: 'b', revision: { status: 'rejected', reject_reason: '효능 표현', submitted_at: '2026-11-04T00:00:00Z', reviewed_at: '2026-11-05T00:00:00Z' } }),
			row({ id: 'c', revision: { status: 'approved' } }),
			row({ id: 'd' })
		]);
		expect(a.revision).toEqual({ status: 'pending', rejectReason: null, submittedAt: '2026-11-05T00:00:00Z', reviewedAt: null });
		expect(b.revision?.rejectReason).toBe('효능 표현');
		expect([c.revision, d.revision]).toEqual([null, null]);
	});
	it('열린 수정본 — fields 를 저장 본문 모양으로 · 모양이 어긋나면 null', () => {
		const r = parseSellerProductRevision({ id: 'r1', status: 'rejected', reject_reason: '사진 교체', submitted_at: null, fields: { name: '포도 젤리', price: 33000, category: 'diet', image_urls: ['u1', 3], faq: [{ q: 'Q', a: 'A' }] } });
		expect(r?.fields).toMatchObject({ name: '포도 젤리', price: 33000, category: 'diet', image_urls: ['u1'], faq: [{ q: 'Q', a: 'A' }], note: '', icon: 'pill' });
		expect(r?.rejectReason).toBe('사진 교체');
		for (const bad of [null, { id: 'r1', status: 'approved', fields: {} }, { id: 'r1', status: 'pending' }, { status: 'pending', fields: {} }]) expect(parseSellerProductRevision(bad)).toBeNull();
	});
});
