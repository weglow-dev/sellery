// 판매 중 상품 수정 모드 — 바뀐 섹션 · 버튼 문구 · 모드 문구 (시안 "MYR Influencer Admin" 수정 모드)
import { describe, expect, it } from 'vitest';
import { MODE_COPY, anyChanged, changedSections, primaryEnabled, primaryLabel } from '../lib/product-edit';
import { blankDraft } from '../lib/rules';

const base = () => ({ ...blankDraft(), name: '포도 젤리', price: '32,000', cat: 'diet', note: '노트', unit: '14포', formPack: '젤리 / 스틱포' });

describe('changedSections', () => {
	it('그대로면 바뀐 섹션 없음', () => {
		const c = changedSections(base(), base());
		expect(anyChanged(c)).toBe(false);
	});
	it('공백 · 빈 줄 · 칸 개수 차이는 바뀐 걸로 치지 않는다', () => {
		const ed = { ...base(), name: ' 포도 젤리 ', chips: ['', '', '', ''] };
		ed.ingredients = [...ed.ingredients, { name: '', why: '빈 줄', amount: '' }];
		expect(anyChanged(changedSections(ed, base()))).toBe(false);
	});
	it('바꾼 섹션만 true — 가격은 기본 정보 · 유통기한은 제품 정보 · FAQ', () => {
		const ed = { ...base(), price: '29,000', shelfLife: '18개월' };
		ed.faq = [{ q: '하루 몇 번?', a: '한 번' }, ...ed.faq.slice(1)];
		expect(changedSections(ed, base())).toEqual({ basics: true, note: false, story: false, ingredients: false, howto: false, info: true, faq: true });
	});
	it('사진 순서를 바꿔도(대표 사진 변경) 기본 정보가 바뀐 것', () => {
		const o = { ...base(), images: ['https://a/1.jpg', 'https://a/2.jpg'] };
		expect(changedSections({ ...o, images: ['https://a/2.jpg', 'https://a/1.jpg'] }, o).basics).toBe(true);
	});
});

describe('버튼', () => {
	it('새 상품은 기존 문구(다음 · 건너뛰기 · 심사 요청하기)', () => {
		expect(primaryLabel('new', 1, base(), false)).toBe('다음');
		expect(primaryLabel('new', 8, base(), false)).toBe('심사 요청하기');
	});
	it('수정 모드 — 단계 안에서는 수정 완료 · 마지막은 바꾼 게 있어야 요청', () => {
		expect(primaryLabel('edit', 3, base(), false)).toBe('수정 완료');
		expect(primaryLabel('edit', 8, base(), true)).toBe('수정 심사 요청하기');
		expect(primaryLabel('edit', 8, base(), false)).toBe('변경된 내용이 없어요');
		expect(primaryEnabled('edit', 8, true, false)).toBe(false);
		expect(primaryEnabled('edit', 8, true, true)).toBe(true);
		expect(primaryEnabled('edit', 2, true, false)).toBe(true);
		expect(primaryEnabled('new', 8, true, false)).toBe(true);
	});
	it('모드 문구 — 수정은 취소 · 수정 중 · 샵에 반영', () => {
		expect(MODE_COPY.edit.secondary).toBe('취소');
		expect(MODE_COPY.new.secondary).toBe('임시저장');
		expect(MODE_COPY.edit.trailPrefix).toBe('수정 중  ·  ');
		expect(MODE_COPY.edit.doneSteps.map((s) => s.title)).toEqual(['제출 완료', '운영팀 검토', '샵에 반영']);
	});
});
