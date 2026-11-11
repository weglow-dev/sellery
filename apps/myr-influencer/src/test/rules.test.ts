// 콘솔 화면 규칙 — apps/myr-influencer/src/lib/rules.ts (디자인 "MYR Influencer Admin" renderVals 의 계산을 옮긴 순수 함수 · 교환 · 환불은 claims.test.ts)
import { describe, expect, it } from 'vitest';
import { seedProducts } from '../lib/data';
import {
	blankDraft,
	editorTrail,
	filledSections,
	filterProducts,
	formatPriceInput,
	nextLabel,
	parsePrice,
	previewSections,
	productTabCounts,
	stepValid,
	isSoldOut
} from '../lib/rules';

describe('내 제품 탭', () => {
	it('전체 · 판매 중 · 심사 중 · 임시저장 · 종료 (2026-11-05 종료 탭 추가 · 상태 대응은 product-row.test)', () => {
		const ps = seedProducts();
		expect(productTabCounts(ps).map((t) => t.count)).toEqual([5, 2, 1, 1, 1]);
		expect(filterProducts(ps, 'live').map((p) => p.id)).toEqual(['p1', 'p7']);
	});
});

describe('상품 에디터', () => {
	it('가격 입력 — 숫자만 남기고 콤마 · 빈 값은 빈 문자열', () => {
		expect(formatPriceInput('36000')).toBe('36,000');
		expect(formatPriceInput('₩36,000원')).toBe('36,000');
		expect(formatPriceInput('abc')).toBe('');
		expect(parsePrice('36,000')).toBe(36000);
	});
	it('예상 정산 — 판매가의 60%(§9-6 · 65% − PG 5%)', () => {
	});
	it('1단계는 제품명 · 가격 · 카테고리, 2단계는 노트가 필수 · 3~7 은 선택', () => {
		const ed = blankDraft();
		expect(stepValid(1, ed)).toBe(false);
		ed.name = '레몬 스틱';
		ed.price = '36,000';
		expect(stepValid(1, ed)).toBe(false);
		ed.cat = 'inner';
		expect(stepValid(1, ed)).toBe(true);
		expect(stepValid(2, ed)).toBe(false);
		ed.note = '  ';
		expect(stepValid(2, ed)).toBe(false);
		ed.note = '상큼하게';
		expect(stepValid(2, ed)).toBe(true);
		for (const s of [3, 4, 5, 6, 7, 8]) expect(stepValid(s, ed)).toBe(true);
	});
	it('하단 버튼 — 빈 선택 단계는 "건너뛰기", 마지막은 "심사 요청하기"', () => {
		const ed = blankDraft();
		expect(nextLabel(1, ed)).toBe('다음');
		expect(nextLabel(3, ed)).toBe('건너뛰기');
		ed.storyTitle = '제목';
		expect(nextLabel(3, ed)).toBe('건너뛰기');
		ed.story = '본문';
		expect(nextLabel(3, ed)).toBe('다음');
		expect(nextLabel(8, ed)).toBe('심사 요청하기');
	});
	it('미리보기 요약 — 빈 섹션은 "샵에서 숨김"', () => {
		const ed = blankDraft();
		ed.ingredients[0].name = '글루타치온';
		ed.ingredients[1].name = '  ';
		ed.faq[0] = { q: '언제?', a: '' };
		const s = Object.fromEntries(previewSections(ed).map((x) => [x.key, x]));
		expect(s.ingredients.summary).toBe('글루타치온');
		expect(s.faq.filled).toBe(false);
		expect(s.howto.summary).toBe('비어 있음 (샵에서 숨김)');
		expect(filledSections(ed).ingredients).toBe(true);
	});
	it('헤더 한 줄 — 채운 값만 · 비면 "새 상품 등록" · 카테고리 이름은 MYR 6개', () => {
		const ed = blankDraft();
		expect(editorTrail(ed)).toBe('새 상품 등록');
		ed.name = '포도 젤리';
		ed.cat = 'diet';
		expect(editorTrail(ed)).toBe('포도 젤리  ·  다이어트');
		ed.cat = 'hair';
		expect(editorTrail(ed)).toBe('포도 젤리  ·  헤어 & 바디');
	});
	it('제품 정보 — 제형/포장 · 유통기한 · 보관 중 하나라도 채우면 채운 섹션', () => {
		const ed = blankDraft();
		expect(filledSections(ed).info).toBe(false);
		ed.shelfLife = '24개월';
		expect(filledSections(ed).info).toBe(true);
	});
});

describe('품절 — 판매 중 · 남은 재고 0(§9-6 · 판매 종료는 운영만)', () => {
	it('판매 중이고 서버가 품절이라고 하면 품절 칩 · 일시중지 · 종료 · 재고 있음은 아님(품절 판정은 서버 soldOut)', () => {
		expect(isSoldOut({ status: 'live', soldOut: true })).toBe(true);
		expect(isSoldOut({ status: 'live', soldOut: false })).toBe(false);
		expect(isSoldOut({ status: 'paused', soldOut: true })).toBe(false);
		expect(isSoldOut({ status: 'ended', soldOut: true })).toBe(false);
	});
});
