// 상품 모델 헬퍼 — apps/myr-shop/src/lib/data.ts
import { describe, expect, it } from 'vitest';
import { catName, creatorsOf, INFO_DEFAULTS, infoRowsOf, MOCK_PRODUCTS, relatedOf, won } from '../lib/data';

// creatorStyle · handleSlug 는 공용 패키지로 옮겼다 — packages/myr-core/src/test/creator.test.ts

describe('creatorsOf · relatedOf', () => {
	it('크리에이터를 모으고 상품 수를 센다', () => {
		const cs = creatorsOf(MOCK_PRODUCTS);
		expect(cs.map((c) => c.count).reduce((a, b) => a + b, 0)).toBe(MOCK_PRODUCTS.length);
		expect(cs.find((c) => c.handle === '@minji.routine')?.count).toBe(2);
	});
	it('같은 카테고리 또는 같은 크리에이터 · 자기 제외 · 최대 4', () => {
		const p = MOCK_PRODUCTS[0]; // diet · 민지
		const r = relatedOf(p, MOCK_PRODUCTS);
		expect(r.length).toBeLessThanOrEqual(4);
		expect(r.some((x) => x.id === p.id)).toBe(false);
		for (const x of r) expect(x.cat === p.cat || x.creator.id === p.creator.id).toBe(true);
	});
});

describe('포맷', () => {
	it('won · catName', () => {
		expect(won(32000)).toBe('₩32,000');
		expect(catName('diet')).toBe('다이어트');
		expect(catName('nope')).toBe('전체');
	});
});

describe('infoRowsOf — 04 제품 정보(0073)', () => {
	const base = { name: '포도 젤리', form: '젤리', pack: '스틱포', unit: '14포' } as unknown as Parameters<typeof infoRowsOf>[0];
	it('유통기한 · 보관은 입력값 · 비면 기본 문구 · 제조는 고정', () => {
		const rows = Object.fromEntries(infoRowsOf({ ...base, shelfLife: '제조일로부터 18개월', storageMethod: '냉장' }).map((r) => [r.k, r.v]));
		expect(rows).toMatchObject({ '제형 / 포장': '젤리 / 스틱포', 내용량: '14포', 유통기한: '제조일로부터 18개월', 보관: '냉장' });
		expect(rows['제조']).toContain('MYR 파트너 제조시설');
		const empty = Object.fromEntries(infoRowsOf({ ...base, shelfLife: ' ', pack: '' }).map((r) => [r.k, r.v]));
		expect(empty).toMatchObject({ '제형 / 포장': '젤리', 유통기한: INFO_DEFAULTS.shelfLife, 보관: INFO_DEFAULTS.storageMethod });
	});
});
