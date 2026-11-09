// MYR 정산 숫자(§9-6) — packages/myr-core/src/settlement-rules.ts
import { describe, expect, it } from 'vitest';
import { DEPOSIT_PCT, PG_FEE_PCT, SETTLEMENT_DAY, SETTLEMENT_GROSS_PCT, SETTLEMENT_PCT, settlementOf } from '../settlement-rules';

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
