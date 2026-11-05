// 반려 · 수정 반려 — 운영팀 의견(섹션별) · 고치기 남은 곳 · 심사 결과 시각 · 목록 문구 (0074 · 시안 "심사 결과" · "반려 내용 고치기")
import { describe, expect, it } from 'vitest';
import { fixRemaining, flaggedSections, rejectItemLabel, rejectItemsOf, rejectMeta, reviewDayWord, reviewWhen, stepNotes } from '../lib/product-review';
import type { SectionKey } from '../lib/rules';

const NONE: Record<SectionKey, boolean> = { basics: false, note: false, story: false, ingredients: false, howto: false, info: false, faq: false };
const ITEMS = [
	{ step: 2, msg: '효능 표현을 바꿔주세요' },
	{ step: 4, msg: '함량을 mg 로' },
	{ step: null, msg: '전체 톤을 차분하게' }
];

describe('의견', () => {
	it('섹션 의견이 없으면 사유 한 줄을 전체 의견으로 · 둘 다 없으면 빈 목록', () => {
		expect(rejectItemsOf([], ' 성분 표기 보완 ')).toEqual([{ step: null, msg: '성분 표기 보완' }]);
		expect(rejectItemsOf(ITEMS, '요약')).toBe(ITEMS);
		expect(rejectItemsOf([], null)).toEqual([]);
	});
	it('머리 — "02 · 레시피 노트" · 단계 없으면 전체', () => {
		expect(ITEMS.map(rejectItemLabel)).toEqual(['02 · 레시피 노트', '04 · 성분', '전체']);
	});
	it('단계별 의견 박스 — 그 단계 의견 · 8단계는 전체 의견', () => {
		expect(stepNotes(ITEMS, 2)).toEqual(['효능 표현을 바꿔주세요']);
		expect(stepNotes(ITEMS, 3)).toEqual([]);
		expect(stepNotes(ITEMS, 8)).toEqual(['전체 톤을 차분하게']);
	});
});

describe('고치기 — 수정 필요', () => {
	it('의견이 달린 섹션을 바꾸면 하나씩 빠진다 · 전체 의견은 세지 않는다', () => {
		expect(fixRemaining(ITEMS, NONE)).toBe(2);
		expect(flaggedSections(ITEMS, NONE)).toEqual({ note: true, ingredients: true });
		const c = { ...NONE, note: true };
		expect(fixRemaining(ITEMS, c)).toBe(1);
		expect(flaggedSections(ITEMS, c)).toEqual({ ingredients: true });
		expect(fixRemaining(ITEMS, { ...c, ingredients: true })).toBe(0);
	});
});

describe('시각 · 목록 문구(한국 시각)', () => {
	const NOW = new Date('2026-11-05T06:00:00Z'); // 한국 15:00
	it('오늘 · 어제 · 그 전은 날짜', () => {
		expect(reviewWhen('2026-11-05T05:10:00Z', NOW)).toBe('오늘 오후 2:10');
		expect(reviewWhen('2026-11-04T00:05:00Z', NOW)).toBe('어제 오전 9:05');
		expect(reviewWhen('2026-11-03T03:00:00Z', NOW)).toBe('11월 3일 오후 12:00');
		expect(reviewWhen('2026-11-04T15:30:00Z', NOW)).toBe('오늘 오전 12:30'); // UTC 로는 어제지만 한국은 오늘
		expect(reviewWhen(null, NOW)).toBe('');
	});
	it('목록 — "오늘 반려 · 3건 수정 필요" · "3일 전 수정 반려 · 1건 수정 필요"', () => {
		expect(reviewDayWord('2026-11-05T01:00:00Z', NOW)).toBe('오늘');
		expect(rejectMeta('new', '2026-11-05T01:00:00Z', ITEMS, null, NOW)).toBe('오늘 반려 · 3건 수정 필요');
		expect(rejectMeta('rev', '2026-11-02T01:00:00Z', [], '사유 하나', NOW)).toBe('3일 전 수정 반려 · 1건 수정 필요');
		expect(rejectMeta('new', null, [], null, NOW)).toBe('반려');
	});
});
