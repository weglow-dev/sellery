// MYR 정산 숫자(§9-6) — packages/myr-core/src/settlement-rules.ts
import { describe, expect, it } from 'vitest';
import { SETTLEMENT_DAY, parseSettlementMonth } from '../settlement-rules';

describe('정산일', () => {
	// 정산 비율 · 정산금(버림) · 보증금 비율은 서버 한 곳(0092 myr_settlement_amount · supabase/tests/myr_server_quotes.test.sql)
	it('매월 1일', () => {
		expect(SETTLEMENT_DAY).toBe(1);
	});
});

// 정산할 달은 DB myr_settlement_due(0106 · supabase/tests/myr_settlement_due.test.sql) — 여기는 수동 실행 ?month= 입력 형식만
describe('정산 달 입력 형식', () => {
	it('parseSettlementMonth', () => {
		expect(parseSettlementMonth('2026-10')).toBe('2026-10-01');
		expect(parseSettlementMonth('2026-10-15')).toBe('2026-10-01');
		expect(parseSettlementMonth('2026-13')).toBeNull();
		expect(parseSettlementMonth('10월')).toBeNull();
		expect(parseSettlementMonth(null)).toBeNull();
	});
});
