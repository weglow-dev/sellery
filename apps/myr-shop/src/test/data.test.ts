// 상품 모델 헬퍼 — apps/myr-shop/src/lib/data.ts
import { describe, expect, it } from 'vitest';
import { catName, creatorStyle, creatorsOf, handleSlug, MOCK_PRODUCTS, relatedOf, won } from '../lib/data';

describe('creatorStyle · handleSlug', () => {
	it('디자인의 네 크리에이터는 디자인 색 · 그 밖은 핸들 해시로 결정적', () => {
		expect(creatorStyle({ id: '1', name: '민지 루틴', handle: '@minji.routine', avatarUrl: null })).toEqual({ bg: '#FFB088', initial: '민' });
		const x = creatorStyle({ id: '2', name: 'alice', handle: '@Alice.Kim', avatarUrl: null });
		expect(x.initial).toBe('A');
		expect(creatorStyle({ id: '3', name: 'alice', handle: '@alice.kim', avatarUrl: null }).bg).toBe(x.bg);
	});
	it('handleSlug 는 @ 제거 + 소문자', () => {
		expect(handleSlug('@@Minji.Routine')).toBe('minji.routine');
	});
});

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
