// MYR 정산 숫자(§9-6) — packages/myr-core/src/settlement-rules.ts
import { describe, expect, it } from 'vitest';
import { SETTLEMENT_DAY, parseSettlementMonth, previousSettlementMonth } from '../settlement-rules';

describe('정산일', () => {
	// 정산 비율 · 정산금(버림) · 보증금 비율은 서버 한 곳(0092 myr_settlement_amount · supabase/tests/myr_server_quotes.test.sql)
	it('매월 1일', () => {
		expect(SETTLEMENT_DAY).toBe(1);
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
