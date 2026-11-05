// 콘솔 화면 규칙 — apps/myr-influencer/src/lib/rules.ts (디자인 "MYR Influencer Admin" renderVals 의 계산을 옮긴 순수 함수)
import { describe, expect, it } from 'vitest';
import { seedCs, seedProducts, type CsRequest } from '../lib/data';
import {
	approveLabel,
	blankDraft,
	canApprove,
	csTabCounts,
	dueText,
	editorTrail,
	filledSections,
	filterCs,
	filterProducts,
	formatPriceInput,
	marginText,
	nextLabel,
	parsePrice,
	previewSections,
	productTabCounts,
	resolutionName,
	resolutionOptions,
	resolveCs,
	stepValid,
	timelineRows
} from '../lib/rules';

const cs = seedCs();
const byId = (id: string) => cs.find((c) => c.id === id) as CsRequest;

describe('CS 탭 필터', () => {
	it('완료 탭은 반려까지 포함 · 전체 = 모든 요청', () => {
		expect(filterCs(cs, 'pending').map((c) => c.id)).toEqual(['cs1', 'cs2', 'cs3']);
		expect(filterCs(cs, 'progress').map((c) => c.id)).toEqual(['cs4']);
		expect(filterCs(cs, 'done').map((c) => c.id)).toEqual(['cs5', 'cs6']);
		expect(csTabCounts(cs).map((t) => t.count)).toEqual([3, 1, 2, 6]);
	});
	it('답변 기한 문구', () => {
		expect(dueText(byId('cs1'))).toBe('오늘 안에 답변해주세요');
		expect(dueText(byId('cs2'))).toBe('2일 안에 답변');
	});
});

describe('처리 방법', () => {
	it('환불 요청 — 전액 · 부분(왕복 배송비 차감) · 교환 전환', () => {
		const opts = resolutionOptions(byId('cs1'));
		expect(opts.map((o) => o.id)).toEqual(['refund', 'partial', 'reship']);
		expect(opts[1].desc).toBe('₩26,000 · 단순 변심 시');
		expect(opts[2].title).toBe('교환으로 전환');
	});
	it('교환 요청 — 같은 reship 이라도 이름이 "새 제품 재발송"', () => {
		const opts = resolutionOptions(byId('cs2'));
		expect(opts.map((o) => o.id)).toEqual(['reship', 'reship_collect', 'refund']);
		expect(opts[0].title).toBe('새 제품 재발송');
		expect(opts[2].desc).toBe('₩72,000 전액 환불');
	});
	it('부분 환불 금액은 0 아래로 내려가지 않는다', () => {
		expect(resolutionOptions({ ...byId('cs1'), amount: 3000 })[1].desc).toBe('₩0 · 단순 변심 시');
	});
	it('승인 버튼 — 방법 + 메시지가 있어야 · 공백 메시지는 안 됨', () => {
		expect(canApprove(null, '안내')).toBe(false);
		expect(canApprove('refund', '   ')).toBe(false);
		expect(canApprove('refund', '안내')).toBe(true);
		expect(approveLabel(byId('cs1'), null)).toBe('처리 방법을 선택하세요');
		expect(approveLabel(byId('cs1'), 'partial')).toBe('부분 환불 (배송비 차감) 승인');
	});
});

describe('처리 결과 반영 · 타임라인', () => {
	it('승인 → 진행 중 · 긴급 해제 · 마지막 줄 "처리 진행" 은 아직', () => {
		const r = resolveCs(byId('cs1'), 'progress', 'refund', '하루 웰');
		expect(r.status).toBe('progress');
		expect(r.urgent).toBe(false);
		expect(r.timeline?.map((t) => t.title)).toEqual(['요청 접수', '전액 환불 승인', '처리 진행']);
		expect(timelineRows(r).map((t) => t.done)).toEqual([true, true, false]);
		expect(r.timeline?.[1].when).toBe('방금 · 하루 웰');
	});
	it('반려 → 두 줄 · 전부 완료 점', () => {
		const r = resolveCs(byId('cs2'), 'rejected', 'reject', '');
		expect(r.timeline?.map((t) => t.title)).toEqual(['요청 접수', '반려']);
		expect(timelineRows(r).every((t) => t.done)).toBe(true);
		expect(r.timeline?.[1].when).toBe('방금'); // 이름이 비면 시각만
	});
	it('처리 결과 이름 — 요청 종류와 무관하게 한 이름 · 처리 전은 "—"', () => {
		expect(resolutionName(byId('cs4'))).toBe('새 제품 재발송');
		expect(resolutionName(byId('cs6'))).toBe('반려');
		expect(resolutionName(resolveCs(byId('cs1'), 'progress', 'reship', '민지 루틴'))).toBe('새 제품 재발송');
		expect(resolutionName(byId('cs1'))).toBe('—');
	});
	it('원본 요청은 바꾸지 않는다', () => {
		const before = byId('cs3');
		resolveCs(before, 'progress', 'refund', '민지 루틴');
		expect(before.status).toBe('pending');
	});
});

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
	it('예상 정산 — 판매가 − 10%(디자인 값)', () => {
		expect(marginText(36000)).toBe('₩32,400 / 개');
		expect(marginText(0)).toBe('—');
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
	it('헤더 한 줄 — 채운 값만 · 비면 "새 상품 등록"', () => {
		const ed = blankDraft();
		const cats = [{ id: 'diet', name: '다이어트' }];
		expect(editorTrail(ed, cats)).toBe('새 상품 등록');
		ed.name = '포도 젤리';
		ed.cat = 'diet';
		expect(editorTrail(ed, cats)).toBe('포도 젤리  ·  다이어트');
	});
});
