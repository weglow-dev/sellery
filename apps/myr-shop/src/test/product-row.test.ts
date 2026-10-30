// 0056 RPC 행 → Product 매핑 — apps/myr-shop/src/lib/product-row.ts
import { describe, expect, it } from 'vitest';
import { fromRow } from '../lib/product-row';

const row = {
	id: 'p-1',
	code: 'minji-grape-jelly',
	category: 'diet',
	name: '민지의 포도 다이어트 젤리',
	unit: '14포',
	price: 32000,
	tile: 'linear-gradient(145deg,#5b3cc4,#2a1a5e)',
	thumb_url: null,
	icon: 'grape',
	form: '젤리',
	pack: '스틱포',
	flavor: '포도',
	tag: 'BEST',
	chips: ['젤리'],
	ingredients: ['가르시니아 HCA', '녹차추출물'],
	note: '노트',
	howto: '하루 1포',
	specs: [{ ic: 'clock', k: '섭취', v: '하루 1포' }],
	story_title: '제목',
	story: '본문',
	points: [{ big: '0g', t: '설탕', d: '알룰로스' }],
	ingredient_rows: [{ name: '가르시니아 HCA', why: '…', amount: '750mg' }],
	howto_title: '점심 후',
	howto_steps: [{ t: '식사 후', d: '30분' }],
	faq: [{ q: 'q', a: 'a' }],
	sold_out: false,
	creator: { id: 's-1', name: '민지 루틴', handle: '@minji.routine', avatar_url: null }
};

describe('fromRow', () => {
	it('필드를 그대로 옮기고 크리에이터를 중첩 객체로', () => {
		const p = fromRow(row);
		expect(p).toMatchObject({
			code: 'minji-grape-jelly',
			cat: 'diet',
			price: 32000,
			ic: 'grape',
			tag: 'BEST',
			soldOut: false,
			storyTitle: '제목',
			howtoTitle: '점심 후'
		});
		expect(p.creator).toEqual({ id: 's-1', name: '민지 루틴', handle: '@minji.routine', avatarUrl: null });
		expect(p.points).toHaveLength(1);
		expect(p.faq[0]).toEqual({ q: 'q', a: 'a' });
	});
	it('상세가 비어 있으면 기본 템플릿 — 성분 수로 포인트를 만들고 섭취법을 재사용', () => {
		const p = fromRow({ ...row, story_title: '', story: null, points: [], ingredient_rows: undefined, howto_title: '', howto_steps: [], faq: null });
		expect(p.storyTitle).toBe('매일 챙기기 쉬운 것만 남겼어요');
		expect(p.points[1]).toMatchObject({ big: '2가지', t: '핵심 성분' });
		expect(p.ingredientRows.map((r) => r.name)).toEqual(['가르시니아 HCA', '녹차추출물']);
		expect(p.howtoSteps[0]).toEqual({ t: '하루 한 번', d: '하루 1포' });
		expect(p.faq).toHaveLength(3);
	});
	it('tag 는 BEST/NEW 만 · 타일 없으면 회색 · 아이콘 없으면 pill · sold_out 은 true 일 때만', () => {
		const p = fromRow({ ...row, tag: 'HOT', tile: null, icon: undefined, sold_out: 'yes' });
		expect(p.tag).toBe('');
		expect(p.tile).toContain('#6b7280');
		expect(p.ic).toBe('pill');
		expect(p.soldOut).toBe(false);
		expect(fromRow({ ...row, sold_out: true }).soldOut).toBe(true);
	});
	it('이상한 타입은 안전한 기본값 — 숫자 아닌 price 0 · 배열 아닌 chips []', () => {
		const p = fromRow({ ...row, price: '32000', chips: 'x', creator: null });
		expect(p.price).toBe(0);
		expect(p.chips).toEqual([]);
		expect(p.creator.name).toBe('크리에이터');
	});
});
