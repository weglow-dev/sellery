// CS 관리 › 교환 · 환불(7번 · 0078) — apps/myr-influencer/src/lib/claims.ts (탭 · 기한 · 승인 버튼 · 메시지 칩 · 처리 내역)
import { describe, expect, it } from 'vitest';
import { claimFromJson, type Claim } from '@sellery/myr-core/claim-rules';
import { approveLabel, claimTabCounts, consoleTimeline, dueDays, dueText, filterClaims, isUrgentPending, replyChips, resolutionOptions } from '../lib/claims';

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
			claim({ status: 'done', step: null, resolution: 'partial', message: '확인했어요', decided_at: '2026-11-06T11:00:00Z', needs_collect: true, collected_at: '2026-11-06T11:30:00Z', needs_refund: true, deduction: 6000, refund_amount: 26000, refunded_at: '2026-11-06T11:59:30Z' }),
			NOW
		);
		expect(rows[1].when).toBe('1시간 전 · 확인했어요');
		expect(rows[3]).toEqual({ title: '환불 완료', when: '방금 · ₩26,000 (왕복 배송비 ₩6,000 차감)', done: true, last: true });
	});
});
