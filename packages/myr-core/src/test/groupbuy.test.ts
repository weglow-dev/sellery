import { describe, expect, it } from 'vitest';
import {
	groupbuyErrors,
	groupbuyFromJson,
	groupbuyPrice,
	groupbuyStateAt,
	isoToKstInput,
	kstInputToIso,
	kstLabel,
	kstShort,
	parseGroupbuyBody,
	remainLabel,
	sellerGroupbuyFromJson
} from '../groupbuy';

const H = 60 * 60 * 1000;
const NOW = Date.parse('2026-11-10T03:00:00Z'); // 한국 11.10 12:00

describe('groupbuyPrice', () => {
	it('DB myr_groupbuy_price 와 같은 사례 — 10원 아래 버림 (supabase/tests/myr_groupbuys.test.sql)', () => {
		expect([groupbuyPrice(32000, 20), groupbuyPrice(33333, 15), groupbuyPrice(990, 70), groupbuyPrice(100, 1)]).toEqual([25600, 28330, 290, 90]);
	});
});

describe('groupbuyFromJson · groupbuyStateAt', () => {
	const raw = { code: 'ab12cd34', state: 'active', discount_pct: 20, starts_at: '2026-11-10T00:00:00Z', ends_at: '2026-11-12T15:00:00Z', price: 25600 };
	it('DB 모양 → 화면 모양 · 틀리면 null', () => {
		expect(groupbuyFromJson(raw)).toEqual({ code: 'ab12cd34', state: 'active', discountPct: 20, startsAt: raw.starts_at, endsAt: raw.ends_at, price: 25600 });
		expect(groupbuyFromJson({ ...raw, code: 'X' })).toBeNull();
		expect(groupbuyFromJson({ ...raw, state: 'open' })).toBeNull();
		expect(groupbuyFromJson(null)).toBeNull();
	});
	it('지금 시각으로 다시 판단 — 끝 시각이 지나면 ended · 서버가 ended 면 그대로', () => {
		const g = groupbuyFromJson(raw)!;
		expect(groupbuyStateAt(g, NOW)).toBe('active');
		expect(groupbuyStateAt(g, Date.parse(raw.ends_at))).toBe('ended');
		expect(groupbuyStateAt({ ...g, state: 'ended' }, NOW)).toBe('ended');
		expect(groupbuyStateAt({ ...g, state: 'scheduled', startsAt: '2026-11-11T00:00:00Z' }, NOW)).toBe('scheduled');
	});
});

describe('한국 시간 표시', () => {
	it('kstLabel · kstShort', () => {
		expect(kstLabel('2026-11-15T11:00:00Z')).toBe('11월 15일 오후 8시');
		expect(kstLabel('2026-11-15T00:30:00Z')).toBe('11월 15일 오전 9시 30분');
		expect(kstLabel('2026-11-14T15:00:00Z')).toBe('11월 15일 오전 12시');
		expect(kstShort('2026-11-15T11:05:00Z')).toBe('11.15(20:05)');
	});
	it('remainLabel — 일 · 시간 · 분 · 종료', () => {
		expect(remainLabel(new Date(NOW + 3 * 24 * H + 1000).toISOString(), NOW)).toBe('3일 남음');
		expect(remainLabel(new Date(NOW + 3 * 24 * H - 1000).toISOString(), NOW)).toBe('2일 23시간 남음');
		expect(remainLabel(new Date(NOW + 5 * H + 1000).toISOString(), NOW)).toBe('5시간 남음');
		expect(remainLabel(new Date(NOW + 30 * 1000).toISOString(), NOW)).toBe('1분 남음');
		expect(remainLabel(new Date(NOW).toISOString(), NOW)).toBe('종료');
	});
	it('입력 칸(한국 시간) ↔ ISO', () => {
		expect(kstInputToIso('2026-11-15T20:00')).toBe('2026-11-15T11:00:00.000Z');
		expect(kstInputToIso('2026-11-15')).toBeNull();
		expect(isoToKstInput('2026-11-15T11:00:00Z')).toBe('2026-11-15T20:00');
	});
});

describe('groupbuyErrors · parseGroupbuyBody', () => {
	it('할인율 1~70 정수 · 종료는 지금과 시작 뒤', () => {
		const ok = { pct: '20', startsAt: '2026-11-10T12:00', endsAt: '2026-11-12T23:59' };
		expect(groupbuyErrors(ok, NOW)).toEqual({});
		expect(groupbuyErrors({ ...ok, pct: '0' }, NOW).pct).toBeTruthy();
		expect(groupbuyErrors({ ...ok, pct: '71' }, NOW).pct).toBeTruthy();
		expect(groupbuyErrors({ ...ok, pct: '12.5' }, NOW).pct).toBeTruthy();
		expect(groupbuyErrors({ ...ok, startsAt: '' }, NOW).startsAt).toBeTruthy();
		expect(groupbuyErrors({ ...ok, endsAt: '2026-11-10T11:00' }, NOW).endsAt).toBe('종료 일시는 지금 이후여야 해요');
		expect(groupbuyErrors({ ...ok, startsAt: '2026-11-13T00:00' }, NOW).endsAt).toBe('종료 일시는 시작 일시 뒤여야 해요');
		// 시작이 지났으면 지금부터 — 오류 아님
		expect(groupbuyErrors({ ...ok, startsAt: '2026-11-09T00:00' }, NOW)).toEqual({});
	});
	it('본문 — 정수 · ISO 만', () => {
		expect(parseGroupbuyBody({ pct: 20, startsAt: '2026-11-10T03:00:00Z', endsAt: '2026-11-12T14:59:00Z' })).toEqual({
			pct: 20,
			startsAt: '2026-11-10T03:00:00.000Z',
			endsAt: '2026-11-12T14:59:00.000Z'
		});
		expect(parseGroupbuyBody({ pct: 71, startsAt: '2026-11-10T03:00:00Z', endsAt: '2026-11-12T14:59:00Z' })).toBeNull();
		expect(parseGroupbuyBody({ pct: '20', startsAt: '2026-11-10T03:00:00Z', endsAt: '2026-11-12T14:59:00Z' })).toBeNull();
		expect(parseGroupbuyBody({ pct: 20, startsAt: 'nope', endsAt: '2026-11-12T14:59:00Z' })).toBeNull();
	});
});

describe('sellerGroupbuyFromJson', () => {
	it('공구 + 실적 · 실적이 비면 0', () => {
		const raw = {
			code: 'ab12cd34', state: 'ended', discount_pct: 20, starts_at: '2026-11-10T00:00:00Z', ends_at: '2026-11-11T00:00:00Z', price: 25600,
			planned_ends_at: '2026-11-12T00:00:00Z', closed_at: '2026-11-11T00:00:00Z', created_at: '2026-11-09T00:00:00Z',
			stats: { orders: 3, units: 4, net: 102400 }
		};
		expect(sellerGroupbuyFromJson(raw)).toMatchObject({ code: 'ab12cd34', closedAt: raw.closed_at, stats: { orders: 3, units: 4, net: 102400 } });
		expect(sellerGroupbuyFromJson({ ...raw, stats: null })?.stats).toEqual({ orders: 0, units: 0, net: 0 });
		expect(sellerGroupbuyFromJson({ ...raw, created_at: null })).toBeNull();
	});
});
