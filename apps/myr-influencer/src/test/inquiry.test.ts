// CS 관리 › 고객 문의 — 탭 · 상태 · 주문 줄 · 질문/답변 고르기 · 이름 조사 · 자주 쓰는 답변 · 답변 기준 · 버튼 (0075 · 시안 inq*)
import { describe, expect, it } from 'vitest';
import type { CsThread } from '@sellery/myr-core/cs-rules';
import { answerOf, canAnswer, filterInquiries, ieyo, inqOrderText, inqShipping, inqStatus, inqTabCounts, inquiryGuide, inquiryTemplates, questionOf } from '../lib/inquiry';

const L = [{ status: 'OPEN' as const }, { status: 'ANSWERED' as const }, { status: 'CLOSED' as const }, { status: 'OPEN' as const }];

describe('탭 · 상태', () => {
	it('답변 대기 = OPEN · 답변 완료 = ANSWERED + CLOSED(운영 종료) · 전체', () => {
		expect(inqTabCounts(L).map((t) => [t.id, t.count])).toEqual([['waiting', 2], ['answered', 2], ['all', 4]]);
		expect(filterInquiries(L, 'answered').map((x) => x.status)).toEqual(['ANSWERED', 'CLOSED']);
		expect([inqStatus({ status: 'OPEN' }).label, inqStatus({ status: 'CLOSED' }).label]).toEqual(['답변 대기', '답변 완료']);
	});
	it('주문 줄 — 소유 확인된 주문만 번호 · 아니면 "주문 전 문의"', () => {
		expect(inqOrderText({ order: { code: 'MYR-884102' } as never })).toBe('주문 MYR-884102');
		expect(inqOrderText({ order: null })).toBe('주문 전 문의');
	});
});

describe('질문 · 답변 고르기', () => {
	const conv = { firstBody: '첫 질문(목록)' } as CsThread['conversation'];
	const m = (id: string, sender: 'customer' | 'seller', body: string) => ({ id, sender, actorRole: sender, body, createdAt: '2026-11-05T00:00:00Z' });
	it('질문 = 첫 고객 메시지 · 답변 = 가장 최근 크리에이터 메시지', () => {
		const t: CsThread = { conversation: conv, messages: [m('1', 'customer', '저녁에 먹어도 돼요?'), m('2', 'seller', '첫 답'), m('3', 'seller', '두 번째 답')] };
		expect(questionOf(t)).toBe('저녁에 먹어도 돼요?');
		expect(answerOf(t)?.body).toBe('두 번째 답');
	});
	it('답변 전이면 null · 메시지가 없으면 목록의 first_body', () => {
		expect(answerOf({ conversation: conv, messages: [m('1', 'customer', 'q')] })).toBeNull();
		expect(questionOf({ conversation: conv, messages: [] })).toBe('첫 질문(목록)');
	});
});

describe('문구', () => {
	it('이름 조사 — 받침 있으면 이에요 · 없으면 예요 · 한글 아니면 이에요', () => {
		expect([ieyo('민지 루틴'), ieyo('하루'), ieyo('Soy')]).toEqual(['민지 루틴이에요', '하루예요', 'Soy이에요']);
	});
	it('자주 쓰는 답변 — 유형별 + 감사 인사 · 크리에이터 이름이 들어간다 · 기타 · 모르는 유형은 감사 인사만', () => {
		const t = inquiryTemplates('상품 문의', '하루');
		expect(t.map((x) => x.name)).toEqual(['섭취 방법 안내', '감사 인사']);
		expect(t[0].text.startsWith('안녕하세요, 하루예요')).toBe(true);
		expect(inquiryTemplates('배송 문의', '민지 루틴').map((x) => x.name)).toEqual(['출고 일정 안내', '지연 사과', '감사 인사']);
		expect(inquiryTemplates('기타', 'x').map((x) => x.name)).toEqual(['감사 인사']);
		expect(inquiryTemplates('???', 'x').map((x) => x.name)).toEqual(['감사 인사']);
	});
	it('답변 기준 — 유형 한 줄(있는 유형만) + 공통 한 줄 · 없는 유형은 빈 줄을 만들지 않는다', () => {
		expect(inquiryGuide('상품 문의')).toHaveLength(2);
		for (const t of ['배송 문의', '교환·반품', '기타', '???']) {
			const g = inquiryGuide(t);
			expect(g.every((x) => typeof x === 'string' && x.length > 0)).toBe(true);
		}
		expect(inquiryGuide('상품 문의').join(' ')).not.toContain('Q&A');
	});
	it('답변 버튼 — 빈 칸 · 2000자 넘으면 못 누름', () => {
		expect(canAnswer('  ')).toBe(false);
		expect(canAnswer('가'.repeat(2001))).toBe(false);
		expect(canAnswer('네')).toBe(true);
	});
});

describe('주문 · 배송(소유 확인된 주문만)', () => {
	const order = (o: Record<string, unknown> = {}) =>
		({ code: 'myr1001', status: 'PAID', courier: null, trackingNo: null, shippedAt: null, deliveredAt: null, paidAt: '2026-11-03T01:00:00Z', item: { id: 'i1', name: '포도 젤리', option: '', qty: 2, amount: 64000, status: 'PAID', refundedQty: 0 }, ...o }) as never;
	it('주문이 없으면 null · 주문번호는 대문자', () => {
		expect(inqShipping({ order: null })).toBeNull();
		expect(inqOrderText({ order: order() })).toBe('주문 MYR1001');
	});
	it('결제 완료 · 운송장 없음 → 배송 준비중 + 출고 안내 줄(날짜 약속 없음)', () => {
		const s = inqShipping({ order: order() })!;
		expect(s.label).toBe('배송 준비중');
		expect(s.rows.map((r) => r.k)).toEqual(['주문 상품', '결제일', '출고']);
		expect(s.rows[0].v).toBe('포도 젤리 × 2');
		expect(s.rows[1].v).toBe('11월 3일');
	});
	it('운송장 있음 → 배송 중 · 택배사 조회 링크 · 발송일', () => {
		const s = inqShipping({ order: order({ courier: 'CJ대한통운', trackingNo: '123456789012', shippedAt: '2026-11-04T02:00:00Z' }) })!;
		expect(s.label).toBe('배송 중');
		const t = s.rows.find((r) => r.k === '운송장')!;
		expect(t.v).toBe('CJ대한통운 123456789012');
		expect(t.href).toContain('cjlogistics');
		expect(s.rows.some((r) => r.k === '출고')).toBe(false);
	});
	it('배송 완료 · 환불 상태는 샵 주문 상세와 같은 판정', () => {
		expect(inqShipping({ order: order({ trackingNo: '1', shippedAt: '2026-11-04T00:00:00Z', deliveredAt: '2026-11-05T00:00:00Z' }) })!.label).toBe('배송 완료');
		expect(inqShipping({ order: order({ status: 'REFUNDED' }) })!.label).toBe('환불 완료');
		expect(inqShipping({ order: order({ status: 'WAITING_DEPOSIT', paidAt: null }) })!.rows.some((r) => r.k === '출고')).toBe(false);
	});
});

describe('주문 · 배송 — 줄 단위(0077)', () => {
	const base = { code: 'myr1001', status: 'PAID', courier: 'CJ대한통운', trackingNo: '9999', shippedAt: '2026-11-04T00:00:00Z', deliveredAt: null, paidAt: '2026-11-03T01:00:00Z' };
	const item = (o: Record<string, unknown>) => ({ id: 'i1', name: '포도 젤리', option: '', qty: 1, amount: 1, status: 'PAID', refundedQty: 0, courier: null, trackingNo: null, shippedAt: null, deliveredAt: null, ...o });
	it('줄 배송 상태가 있으면 주문 칸 대신 그 줄 — 다른 크리에이터 줄의 송장을 보여 주지 않는다', () => {
		const s = inqShipping({ order: { ...base, item: item({ shipStatus: 'PREPARING' }) } as never })!;
		expect(s.label).toBe('배송 준비중');
		expect(s.rows.some((r) => r.k === '운송장')).toBe(false);
		expect(s.rows.find((r) => r.k === '출고')!.v).toBe('MYR 물류센터에서 준비 중');
	});
	it('결제완료(발주 전) 줄 → "고객이 직접 취소할 수 있어요"', () => {
		const s = inqShipping({ order: { ...base, courier: null, trackingNo: null, shippedAt: null, item: item({ shipStatus: 'PAID' }) } as never })!;
		expect(s.label).toBe('결제 완료');
		expect(s.rows.find((r) => r.k === '출고')!.v).toContain('직접 취소');
	});
	it('줄 송장 · 배송완료', () => {
		const s = inqShipping({ order: { ...base, item: item({ shipStatus: 'DELIVERED', courier: '한진택배', trackingNo: '1111', shippedAt: '2026-11-04T00:00:00Z', deliveredAt: '2026-11-06T00:00:00Z' }) } as never })!;
		expect(s.label).toBe('배송 완료');
		expect(s.rows.find((r) => r.k === '운송장')!.v).toBe('한진택배 1111');
	});
});
