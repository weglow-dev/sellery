// MYR 정산 숫자(§9-6) — packages/myr-core/src/settlement-rules.ts
import { describe, expect, it } from 'vitest';
import { DEPOSIT_PCT, PG_FEE_PCT, SETTLEMENT_DAY, SETTLEMENT_GROSS_PCT, SETTLEMENT_PCT, parseSettlementMonth, previousSettlementMonth, settlementOf } from '../settlement-rules';

describe('정산 숫자', () => {
	it('65% − PG 5% = 60% · 보증금 25% · 매월 1일', () => {
		expect([SETTLEMENT_GROSS_PCT, PG_FEE_PCT, SETTLEMENT_PCT, DEPOSIT_PCT, SETTLEMENT_DAY]).toEqual([65, 5, 60, 25, 1]);
	});
	it('예상 정산 — 판매가의 60% · 원 단위 반올림 · 0원 · 잘못된 값은 0', () => {
		expect(settlementOf(36000)).toBe(21600);
		expect(settlementOf(2_000_000)).toBe(1_200_000);
		expect(settlementOf(33333)).toBe(20000); // 19999.8 → 20000
		expect(settlementOf(0)).toBe(0);
		expect(settlementOf(-1)).toBe(0);
		expect(settlementOf(Number.NaN)).toBe(0);
	});
});

describe('정산할 달 — KST 지난달', () => {
	it('매월 1일 13:00 KST(04:00 UTC) → 지난달 · 1월이면 지난해 12월', () => {
		expect(previousSettlementMonth(Date.parse('2026-12-01T04:00:00Z'))).toBe('2026-11-01');
		expect(previousSettlementMonth(Date.parse('2027-01-01T04:00:00Z'))).toBe('2026-12-01');
		// UTC 로는 아직 11월 30일이지만 KST 는 12월 1일
		expect(previousSettlementMonth(Date.parse('2026-11-30T15:30:00Z'))).toBe('2026-11-01');
	});
	it('parseSettlementMonth', () => {
		expect(parseSettlementMonth('2026-10')).toBe('2026-10-01');
		expect(parseSettlementMonth('2026-10-15')).toBe('2026-10-01');
		expect(parseSettlementMonth('2026-13')).toBeNull();
		expect(parseSettlementMonth('10월')).toBeNull();
		expect(parseSettlementMonth(null)).toBeNull();
	});
});
