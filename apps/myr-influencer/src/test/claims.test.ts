// CS 관리 › 교환 · 환불(7번 · 0078) — apps/myr-influencer/src/lib/claims.ts (탭 · 기한 · 승인 버튼 · 메시지 칩 · 처리 내역)
import { describe, expect, it } from 'vitest';
import { claimFromJson, type Claim } from '@sellery/myr-core/claim-rules';
import { approveLabel, claimOrderedAmount, claimShipping, claimTabCounts, consoleTimeline, dueDays, dueText, filterClaims, isUrgentPending, replyChips, resolutionOptions } from '../lib/claims';

const NOW = new Date('2026-11-06T12:00:00Z');
const claim = (o: Record<string, unknown> = {}) =>
	claimFromJson({
		id: 'c1',
		code: 'rq2001',
		status: 'pending',
		step: 'decide',
		kind: 'refund',
		reason: '단순 변심',
		qty: 1,
		photos: [],
		options: ['partial', 'refund'],
		return_fee: 6000,
		deduction: 0,
		amount: 32000,
		created_at: '2026-11-06T10:00:00Z',
		buyer_name: '홍길동',
		order: { id: 'o', code: 'myr1001', is_member: true, item: { id: 'i', name: '포도 젤리', option: '', qty: 1, unit_price: 32000, refunded_qty: 0, status: 'PAID', ship_status: 'DELIVERED' } },
		...o
	}) as Claim;

describe('탭', () => {
	it('완료 탭은 반려까지 · 전체 = 모두', () => {
		const list = [claim(), claim({ id: 'c2', status: 'progress' }), claim({ id: 'c3', status: 'done' }), claim({ id: 'c4', status: 'rejected' })];
		expect(claimTabCounts(list).map((t) => [t.id, t.count])).toEqual([['pending', 1], ['progress', 1], ['done', 2], ['all', 4]]);
		expect(filterClaims(list, 'done').map((c) => c.id)).toEqual(['c3', 'c4']);
	});
});

describe('답변 기한 — 접수 뒤 2일', () => {
	it('오늘 접수 = 2일 · 하루 지나면 오늘 안 · 넘기면 지났어요 · 급함은 처리 대기만', () => {
		expect(dueDays(claim(), NOW)).toBe(2);
		expect(dueText(claim(), NOW)).toBe('2일 안에 답변');
		expect(dueText(claim({ created_at: '2026-11-05T10:00:00Z' }), NOW)).toBe('오늘 안에 답변해주세요');
		expect(dueText(claim({ created_at: '2026-11-01T10:00:00Z' }), NOW)).toBe('답변 기한이 지났어요');
		expect(isUrgentPending(claim({ created_at: '2026-11-05T10:00:00Z' }), NOW)).toBe(true);
		expect(isUrgentPending(claim({ created_at: '2026-11-05T10:00:00Z', status: 'progress' }), NOW)).toBe(false);
	});
});

describe('처리 방법 · 승인 버튼 · 메시지', () => {
	it('선택지는 서버 options 순서 · 승인 라벨은 고른 방법(선택지 밖이면 안내)', () => {
		const c = claim();
		expect(resolutionOptions(c).map((o) => o.title)).toEqual(['부분 환불 (왕복 배송비 차감)', '전액 환불']);
		// 금액은 서버 예상 금액(claimQuotes) — 처리 방법마다 그 칸의 금액
		const quotes = { partial: { amount: 33000, paid: 39000, goods: 36000, shippingBack: 3000, deduction: 6000, full: true, deposit: false, lines: [] }, refund: { amount: 39000, paid: 39000, goods: 36000, shippingBack: 3000, deduction: 0, full: true, deposit: false, lines: [] } };
		expect(resolutionOptions(c, quotes).map((o) => o.desc)).toEqual(['₩33,000 (상품 ₩36,000 + 배송비 ₩3,000 − 왕복 배송비 ₩6,000) · 회수 확인 뒤 환불', '₩39,000 (상품 ₩36,000 + 배송비 ₩3,000) · 회수 확인 뒤 환불']);
		expect(approveLabel(c, 'partial')).toBe('부분 환불 (왕복 배송비 차감) 승인');
		expect(approveLabel(c, null)).toBe('처리 방법을 선택하세요');
		expect(approveLabel(c, 'reship')).toBe('처리 방법을 선택하세요');
	});
	it('메시지 칩 — 고른 방법 안내 + 반려 안내', () => {
		expect(replyChips(null).map((r) => r.name)).toEqual(['반려 안내']);
		expect(replyChips('reship').map((r) => r.name)).toEqual(['재발송 안내', '반려 안내']);
		expect(replyChips('partial')[0].text).toContain('왕복 배송비');
	});
});

describe('처리 내역', () => {
	it('처리 대기 → 접수(상대 시각) + 확인 대기 중 · 마지막 줄 표시', () => {
		const rows = consoleTimeline(claim(), NOW);
		expect(rows.map((r) => [r.title, r.when, r.done, r.last])).toEqual([
			['요청 접수', '2시간 전', true, false],
			['크리에이터 확인', '대기 중', false, true]
		]);
	});
	it('부분 환불 끝 → 승인 메시지 · 환불 금액(차감)', () => {
		const rows = consoleTimeline(
			claim({ status: 'done', step: null, resolution: 'partial', message: '확인했어요', decided_at: '2026-11-06T11:00:00Z', needs_collect: true, collected_at: '2026-11-06T11:30:00Z', needs_refund: true, deduction: 6000, refund_amount: 26000, refund_paid: 32000, shipping_back: 0, refunded_at: '2026-11-06T11:59:30Z' }),
			NOW
		);
		expect(rows[1].when).toBe('1시간 전 · 확인했어요');
		expect(rows[3]).toEqual({ title: '환불 완료', when: '방금 · ₩26,000 (상품 ₩32,000 − 왕복 배송비 ₩6,000)', done: true, last: true });
	});
});

describe('주문 · 배송 — 문의 상세와 같은 표(0080)', () => {
	const ord = (status: string, item: Record<string, unknown>) => ({ id: 'o', code: 'myr1001', status, paid_at: '2026-11-01T00:00:00Z', is_member: true, item: { id: 'i', name: '포도 젤리', option: '', qty: 1, unit_price: 32000, refunded_qty: 0, status: 'PAID', ...item } });
	it('배송 완료 줄 → 운송장(조회 링크) · 발송일 · 배송 완료', () => {
		const s = claimShipping(claim({ order: ord('PAID', { ship_status: 'DELIVERED', courier: 'CJ대한통운', tracking_no: '612300000010', shipped_at: '2026-11-02T00:00:00Z', delivered_at: '2026-11-03T00:00:00Z' }) }));
		expect(s.label).toBe('배송 완료');
		expect(s.rows.map((r) => r.k)).toEqual(['주문 상품', '결제일', '운송장', '발송일', '배송 완료']);
		expect(s.rows.find((r) => r.k === '운송장')).toMatchObject({ v: 'CJ대한통운 612300000010' });
		expect(s.rows.find((r) => r.k === '운송장')!.href).toBeTruthy();
	});
	it('배송 준비중 줄 → 송장 없이 출고 안내 · 부분 환불 주문이어도 줄 배송 상태', () => {
		const s = claimShipping(claim({ order: ord('PARTIAL_REFUNDED', { ship_status: 'PREPARING' }) }));
		expect(s.label).toBe('부분 환불');
		expect(s.rows.find((r) => r.k === '출고')!.v).toBe('MYR 물류센터에서 준비 중');
		expect(s.rows.some((r) => r.k === '운송장')).toBe(false);
	});
	it('상품 금액(그 줄 전체 수량) · 주문 배송비(0090) — 무료배송이면 "무료배송"', () => {
		const paid = claimShipping(claim({ order: { ...ord('PAID', { ship_status: 'PREPARING', qty: 2, amount: 64000 }), shipping_fee: 3000 } })); // 줄 금액은 서버 값(0099 item.amount)
		expect(paid.rows.find((r) => r.k === '상품 금액')!.v).toBe('₩64,000 (2개)');
		// 제품 카드도 같은 값 — 요청 수량(1개)이 아니라 주문 수량 전체
		expect(claimOrderedAmount(claim({ qty: 1, order: { ...ord('PAID', { ship_status: 'PREPARING', qty: 2, amount: 64000 }), shipping_fee: 3000 } }))).toBe(64000); // 줄 금액은 서버 값(0099 item.amount)
		expect(paid.rows.find((r) => r.k === '배송비')!.v).toBe('₩3,000');
		const free = claimShipping(claim({ order: { ...ord('PAID', { ship_status: 'PREPARING' }), shipping_fee: 0 } }));
		expect(free.rows.find((r) => r.k === '배송비')!.v).toBe('무료배송');
		// 옛 응답(0090 전 · shipping_fee 없음) — 금액 칸을 그리지 않는다(무료배송으로 잘못 보이지 않게)
		expect(claimShipping(claim({ order: ord('PAID', { ship_status: 'PREPARING' }) })).rows.some((r) => r.k === '배송비' || r.k === '상품 금액')).toBe(false);
	});
	it('옛 응답(주문 상태 · 송장 없음) → 결제 완료 주문 · 줄 배송 상태로', () => {
		const c = claim();
		expect([c.order.status, c.order.item.courier, c.order.item.trackingNo]).toEqual(['PAID', null, null]);
		expect(claimShipping(c).label).toBe('배송 완료');
	});
});
