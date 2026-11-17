// 크리에이터 실적(0076) — 파서 · CS 비율 · 요일 · 7일 막대 (홈 지표 · docs/myr.md §4.2.1 8번)
import { describe, expect, it } from 'vitest';
import { csRateText, emptySellerSales, parseSellerSales, weekBars, weekdayOf } from '../seller-sales';

const raw = {
	month: '2026-11', gross: 75000, refunds: 25000, net: 50000, orders: 4, units: 5, refunded_orders: 2,
	week: [{ date: '2026-11-09', orders: 0 }, { date: '2026-11-10', orders: 1 }, { date: '2026-11-15', orders: 3 }]
};

describe('parseSellerSales', () => {
	it('필드 이름을 화면 쪽으로 · 옛 payout 은 싣지 않는다(0099)', () => {
		const s = parseSellerSales(raw);
		expect(s).toMatchObject({ month: '2026-11', gross: 75000, refunds: 25000, net: 50000, orders: 4, units: 5, refundedOrders: 2 });
		expect(s.week).toHaveLength(3);
		expect(parseSellerSales({ ...raw, payout: 15000 })).not.toHaveProperty('payout');
	});
	it('모양이 어긋나면 0 실적(홈이 깨지지 않게) · 음수 · 문자는 0', () => {
		for (const v of [null, undefined, 'x', 3]) expect(parseSellerSales(v)).toEqual(emptySellerSales());
		expect(parseSellerSales({ ...raw, net: -5, orders: '4' })).toMatchObject({ net: 0, orders: 0 });
		expect(parseSellerSales({ ...raw, week: [{ date: 1 }, { date: '2026-11-15', orders: 2 }] }).week).toEqual([{ date: '2026-11-15', orders: 2, future: false }]);
	});
});

describe('CS 비율 · 7일 막대', () => {
	it('CS 비율은 서버 값(0116 myr_cs_rate) — 화면은 글자만 · 주문 없으면(null) —', () => {
		expect(parseSellerSales({ ...raw, cs_rate: 33.3 }).csRate).toBe(33.3);
		expect(parseSellerSales({ ...raw, cs_rate: null }).csRate).toBeNull();
		expect(parseSellerSales(raw).csRate).toBeNull(); // 서버가 주지 않으면 짐작하지 않는다
		expect(csRateText({ csRate: 50 })).toBe('50%');
		expect(csRateText({ csRate: 33.3 })).toBe('33.3%');
		expect(csRateText({ csRate: 0 })).toBe('0%');
		expect(csRateText({ csRate: null })).toBe('—');
	});
	it('요일은 날짜로(시간대 무관)', () => {
		expect(['2026-11-09', '2026-11-15'].map(weekdayOf)).toEqual(['월', '일']);
		expect(weekdayOf('x')).toBe('');
	});
	it('막대 높이 = 최댓값 대비 % · 가장 많은 날 강조 · 전부 0 이면 강조 없음', () => {
		const b = weekBars(parseSellerSales(raw).week);
		expect(b.map((x) => [x.day, x.value, x.height, x.top])).toEqual([['월', 0, 0, false], ['화', 1, 33, false], ['일', 3, 100, true]]);
		expect(weekBars([{ date: '2026-11-09', orders: 0, future: false }]).every((x) => !x.top && x.height === 0)).toBe(true);
	});
	it('이번 주 월 ~ 일 · 아직 오지 않은 날 · 주 합계는 서버 값(0117 future · week_orders)', () => {
		const s = parseSellerSales({ ...raw, week: [{ date: '2026-11-16', orders: 2 }, { date: '2026-11-17', orders: 1 }, { date: '2026-11-18', orders: 0, future: true }], week_orders: 3 });
		expect(s.weekOrders).toBe(3);
		expect(weekBars(s.week).map((x) => [x.day, x.future])).toEqual([['월', false], ['화', false], ['수', true]]);
		expect(parseSellerSales(raw).weekOrders).toBe(0); // 서버가 주지 않으면 더해서 짐작하지 않는다
	});
});
