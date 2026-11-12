// 크리에이터 정산 탭(0089) — packages/myr-core/src/seller-settlement.ts
import { describe, expect, it } from 'vitest';
import { monthLabel, repaidPct, sellerSettlementsFromJson, settleAtLabel, settleItemsFromJson, settlePreviewFromJson, settleRowText } from '../seller-settlement';

const won = (x: number) => `₩${x.toLocaleString('ko-KR')}`;
const product = { id: 'p', code: 'minji-grape-jelly', name: '포도', tile: null, icon: 'grape', thumb_url: null };

describe('파서', () => {
	it('예상 — 보류 줄은 상계 · 지급이 null', () => {
		const p = settlePreviewFromJson({
			month: '2026-11', settle_at: '2026-12-01T04:00:00+00:00',
			rows: [{ product, status: 'estimated', sales: 96000, refund_adj: 0, carry_in: 0, settle: 57600, offset: 0, deposit_refund: 0, payout: 57600 }, { product, status: 'held', sales: 50000, settle: 30000, offset: null, payout: null }],
			total: { payout: 57600, held: 1 }, undelivered: { lines: 3, amount: 132000 }
		});
		expect([p.rows[0].status, p.rows[0].payout, p.rows[1].status, p.rows[1].payout, p.total.held, p.undelivered.lines]).toEqual(['estimated', 57600, 'held', null, 1, 3]);
		expect([p.rows[0].origin, p.rows[0].releasedIn]).toEqual([null, null]);
		expect(settlePreviewFromJson({ rows: [{ product, status: 'estimated', origin: '2026-10', released_in: '2026-11' }] }).rows[0]).toMatchObject({ origin: '2026-10', releasedIn: '2026-11' });
		expect(settlePreviewFromJson(null)).toMatchObject({ month: '', rows: [], total: { payout: 0 } });
	});
	it('정산 탭 — 원장 · 월 · 비어 있으면 기본값', () => {
		const t = sellerSettlementsFromJson({
			settle_status: 'verified',
			ledgers: [{ product, has_ledger: true, batches: [{ seq: 1, amount: 30000, deposit_amount: 7500, deposit_paid: true, deposit_refunded: true }], total: 30000, offset: 30000, remaining: 0, deposit_paid: 7500, deposit_unpaid: 0, deposit_refunded: 7500 }],
			months: [{ month: '2026-10', settled_at: '2026-11-01T04:00:00Z', rows: [{ product, status: 'confirmed', sales: 64000, settle: 38400, offset: 30000, deposit_refund: 7500, payout: 15900 }], total: { payout: 15900 } }, { bad: 1 }]
		});
		expect([t.settleStatus, t.ledgers[0].batches[0].depositRefunded, t.months.length, t.months[0].rows[0].payout]).toEqual(['verified', true, 1, 15900]);
		expect([t.ledgers[0].depositHeld, t.ledgers[0].nextOffset, t.ledgerTotal, t.months[0].rows[0].nextPayout, t.months[0].total.netSales]).toEqual([0, 0, { remaining: 0, depositHeld: 0 }, false, 0]);
		expect([t.ledgers[0].paidOff, t.ledgers[0].depositState, t.months[0].payAt, t.months[0].rows[0].counted, t.months[0].rows[0].releasable]).toEqual([false, 'held', null, false, false]);
		const u = sellerSettlementsFromJson({
			ledgers: [{ product, has_ledger: true, total: 150000, remaining: 150000, deposit_held: 37500, deposit_total: 37500, next_offset: 108000, paid_off: false, deposit_state: 'unpaid' }],
			ledger_total: { remaining: 150000, deposit_held: 37500 },
			months: [{ month: '2026-11', pay_at: '2026-12-01T04:00:00+00:00', rows: [{ product, status: 'confirmed', payout: 24000, next_payout: true, counted: false, releasable: false }, { product, status: 'held', counted: false, releasable: true }], total: { sales: 96000, refund_adj: 32000, net_sales: 64000, payout: 0 } }]
		});
		expect([u.ledgers[0].depositHeld, u.ledgers[0].depositTotal, u.ledgers[0].nextOffset, u.ledgerTotal, u.months[0].rows[0].nextPayout, u.months[0].total.netSales]).toEqual([37500, 37500, 108000, { remaining: 150000, depositHeld: 37500 }, true, 64000]);
		expect([u.ledgers[0].depositState, u.months[0].payAt, u.months[0].rows[0].counted, u.months[0].rows[1].releasable]).toEqual(['unpaid', '2026-12-01T04:00:00+00:00', false, true]);
		const h = sellerSettlementsFromJson({
			next_hold: { code: 'settle_info', label: '사업자 · 정산 정보 확인 전' },
			months: [{ month: '2026-11', payout_status: 'held', payout_label: '지급 보류', hold: { code: 'manual', label: '운영팀 확인 중' }, rows: [], total: {} }]
		});
		expect([h.nextHold, h.months[0].payoutStatus, h.months[0].payoutLabel, h.months[0].hold]).toEqual([
			{ code: 'settle_info', label: '사업자 · 정산 정보 확인 전' }, 'held', '지급 보류', { code: 'manual', label: '운영팀 확인 중' }
		]);
		expect([t.nextHold, t.months[0].payoutStatus, t.months[0].hold]).toEqual([null, null, null]);
		expect(sellerSettlementsFromJson(undefined)).toMatchObject({ settleStatus: 'none', ledgers: [], months: [] });
	});
	it('줄 내역', () => {
		const [i] = settleItemsFromJson([{ order_code: 'myr1501', buyer: '김*은', delivered_at: '2026-10-27T03:00:00Z', product: '포도', qty: 2, unit_price: 32000, groupbuy: true, kind: 'refund_adj', amount: 32000 }, null]);
		expect([i.orderCode, i.kind, i.groupbuy, i.amount, i.refunded]).toEqual(['myr1501', 'refund_adj', true, 32000, 0]);
		expect(settleItemsFromJson([{ order_code: 'myr1501', kind: 'sale', amount: 32000, refund_snapshot: 32000 }])[0].refunded).toBe(32000);
		expect(settleItemsFromJson([{ order_code: 'myr1501', origin: '2026-10' }])[0].origin).toBe('2026-10');
	});
});

describe('라벨', () => {
	const NOW = Date.parse('2026-11-10T03:00:00Z');
	it('monthLabel · settleAtLabel', () => {
		expect(monthLabel('2026-10', NOW)).toBe('10월');
		expect(monthLabel('2025-12', NOW)).toBe('2025년 12월');
		expect(settleAtLabel('2026-12-01T04:00:00+00:00')).toBe('12월 1일(화) 오후 1시');
	});
	it('지급 보류 · 갚은 비율 · 보증금', () => {
		expect(settleRowText({ sales: 64000, refundAdj: 0, carryIn: 0, settle: 38400, offset: 30000, depositRefund: 7500 }, won)).toBe('판매 ₩64,000 · 정산금 ₩38,400 · 상계 −₩30,000 · 보증금 +₩7,500');
		expect(settleRowText({ sales: 0, refundAdj: 25600, carryIn: -1000, settle: 0, offset: null, depositRefund: null }, won)).toBe('판매 ₩0 · 정산 뒤 환불 −₩25,600 · 지난 이월 −₩1,000 · 정산금 ₩0');
		// 갚은 금액 · 맡긴 보증금은 서버 값(offset · deposit_held — 0101) — 여기서는 비율 · 문구만
		expect([repaidPct({ total: 200000, offset: 50000 }), repaidPct({ total: 0, offset: 0 })]).toEqual([25, 100]);
	});
});

describe('시안 라벨', () => {
	it('정산 시각 · D-day · 날짜', async () => {
		const { dDay, shortDate, monthShort } = await import('../seller-settlement');
		expect(dDay('2026-12-01T04:00:00Z', Date.parse('2026-11-10T03:00:00Z'))).toBe('D-21');
		expect(dDay('2026-12-01T04:00:00Z', Date.parse('2026-12-01T01:00:00Z'))).toBe('D-DAY');
		expect(dDay('2026-12-01T04:00:00Z', Date.parse('2026-12-02T01:00:00Z'))).toBe('');
		expect([shortDate('2026-12-01T04:00:00Z'), monthShort('2026-11')]).toEqual(['12월 1일', '11월']);
	});
	it('상태 · 배너', async () => {
		const { monthStatus, holdBanner } = await import('../seller-settlement');
		// 보류 여부 · 지급 상태 문구는 서버 값(next_hold · payout_status · payout_label — 0102) — 여기서는 색만
		expect(monthStatus({ upcoming: true, nextHold: { code: 'settle_info', label: '사업자 · 정산 정보 확인 전' } })).toEqual({ label: '지급 보류', tone: 'hold' });
		expect(monthStatus({ upcoming: true, nextHold: null })).toEqual({ label: '지급 예정', tone: 'plan' });
		expect(monthStatus({ upcoming: false, payoutStatus: 'held', payoutLabel: '지급 보류' })).toEqual({ label: '지급 보류', tone: 'hold' });
		expect(monthStatus({ upcoming: false, payoutStatus: 'pending', payoutLabel: '지급 대기' })).toEqual({ label: '지급 대기', tone: 'plan' });
		expect(monthStatus({ upcoming: false, payoutStatus: null, payoutLabel: '지급 없음' })).toEqual({ label: '지급 없음', tone: 'done' });
		expect(holdBanner('none', '12월 1일')?.body).toBe('사업자 · 정산 계좌 정보를 등록하면 12월 1일 정산부터 바로 지급돼요.');
		expect(holdBanner('pending', '12월 1일')?.cta).toBeNull();
	});
	it('보류 해제분은 같은 상품이라도 다른 줄로 묶인다', async () => {
		const { itemsByProduct, rowKey, settleItemsFromJson } = await import('../seller-settlement');
		const its = settleItemsFromJson([{ order_code: 'a', product_code: 'x' }, { order_code: 'b', product_code: 'x', origin: '2026-10' }, { order_code: 'c', product_code: 'x' }]);
		const m = itemsByProduct(its);
		expect([m.get(rowKey('x', null))?.length, m.get(rowKey('x', '2026-10'))?.length]).toEqual([2, 1]);
	});
	it('원장 카드', async () => {
		const { ledgerCard } = await import('../seller-settlement');
		// 상환 완료(paid_off) · 다음 정산 상환 예정(next_offset) · 보증금 금액과 상태(deposit_held · deposit_total · deposit_state)는 서버 값(0101)
		const base = { product: { id: 'p', code: 'c', name: 'n', tile: null, icon: 'pill', thumbUrl: null }, hasLedger: true, batches: [], offset: 0, depositPaid: 0, depositUnpaid: 0, depositRefunded: 0, depositHeld: 0, depositTotal: 0, nextOffset: 0, paidOff: false, depositState: 'held' as const };
		const lemon = ledgerCard({ ...base, total: 150000, remaining: 150000, depositPaid: 37500, depositHeld: 37500, depositTotal: 37500, nextOffset: 108000 }, '2026-11', won);
		expect([lemon.chip, lemon.paidPct, lemon.planPct, lemon.planText, lemon.depositText]).toEqual(['상환 중', 0, 72, '11월 정산에서 ₩108,000 상환 예정', '보증금 ₩37,500']);
		const grape = ledgerCard({ ...base, total: 30000, remaining: 0, offset: 30000, depositPaid: 7500, depositRefunded: 7500, paidOff: true, depositState: 'refunded' }, '2026-11', won);
		expect([grape.chip, grape.paidPct, grape.planText, grape.depositText]).toEqual(['상환 완료', 100, '', '보증금 ₩7,500 · 환급 완료']);
		const unpaid = ledgerCard({ ...base, total: 100000, remaining: 100000, depositPaid: 5000, depositUnpaid: 20000, depositHeld: 5000, depositTotal: 25000, depositState: 'unpaid' }, '2026-11', won);
		expect(unpaid.depositText).toBe('보증금 ₩25,000 · 입금 확인 전 ₩20,000');
		expect(ledgerCard({ ...base, hasLedger: false, total: 0, remaining: 0 }, '2026-11', won).chip).toBe('제조금액 확인 중');
	});
});
