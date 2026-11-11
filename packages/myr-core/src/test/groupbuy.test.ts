import { describe, expect, it } from 'vitest';
import {
	groupbuyErrorMessage,
	groupbuyErrors,
	groupbuyFromJson,
	isoToKstInput,
	kstInputToIso,
	kstLabel,
	kstShort,
	parseGroupbuyBody,
	pctRangeFromJson,
	remainLabel,
	sellerGroupbuyFromJson
} from '../groupbuy';

const H = 60 * 60 * 1000;
const NOW = Date.parse('2026-11-10T03:00:00Z'); // 한국 11.10 12:00

describe('groupbuyFromJson', () => {
	const raw = { code: 'ab12cd34', state: 'active', discount_pct: 20, starts_at: '2026-11-10T00:00:00Z', ends_at: '2026-11-12T15:00:00Z', price: 25600 };
	it('DB 모양 → 화면 모양 · 틀리면 null', () => {
		expect(groupbuyFromJson(raw)).toEqual({ code: 'ab12cd34', state: 'active', discountPct: 20, startsAt: raw.starts_at, endsAt: raw.ends_at, price: 25600, options: [] });
		// 옵션별 공구가(링크 · 콘솔) — 틀린 항목은 버린다
		expect(
			groupbuyFromJson({ ...raw, options: [{ index: 0, name: '14포', price: 32000, groupbuy_price: 25600 }, { index: 1, name: '28포', price: 60000, groupbuy_price: 48000 }, { index: 'x' }] })?.options
		).toEqual([
			{ index: 0, name: '14포', price: 32000, groupbuyPrice: 25600 },
			{ index: 1, name: '28포', price: 60000, groupbuyPrice: 48000 }
		]);
		expect(groupbuyFromJson({ ...raw, code: 'X' })).toBeNull();
		expect(groupbuyFromJson({ ...raw, state: 'open' })).toBeNull();
		expect(groupbuyFromJson(null)).toBeNull();
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

describe('할인율 범위 — 서버 값(0099 myr_groupbuy_pct_min · max)', () => {
	it('응답의 min · max 가 정수일 때만 범위 · 아니면 null(숫자를 짐작하지 않는다)', () => {
		expect(pctRangeFromJson(1, 70)).toEqual({ min: 1, max: 70 });
		expect(pctRangeFromJson(undefined, 70)).toBeNull();
		expect(pctRangeFromJson('1', '70')).toBeNull();
	});
	it('BAD_PCT 문구는 서버가 준 범위로 · 범위가 없으면 숫자 없이 · 다른 코드는 그대로', () => {
		expect(groupbuyErrorMessage('BAD_PCT', { min: 1, max: 70 })).toBe('할인율은 1~70% 사이로 넣어주세요');
		expect(groupbuyErrorMessage('BAD_PCT', { min: 5, max: 50 })).toBe('할인율은 5~50% 사이로 넣어주세요');
		expect(groupbuyErrorMessage('BAD_PCT')).toBe('할인율을 다시 확인해주세요');
		expect(groupbuyErrorMessage('SOLD_OUT', { min: 1, max: 70 })).toContain('품절');
		expect(groupbuyErrorMessage('???')).toContain('잠시 후');
	});
});

describe('groupbuyErrors · parseGroupbuyBody', () => {
	it('할인율은 숫자 형식만(범위는 서버) · 종료는 지금과 시작 뒤', () => {
		const ok = { pct: '20', startsAt: '2026-11-10T12:00', endsAt: '2026-11-12T23:59' };
		expect(groupbuyErrors(ok, NOW)).toEqual({});
		// 할인율은 숫자 형식만 — 범위(0 · 71)는 서버가 정한다(0099 myr_groupbuy_pct_ok · 미리보기 · 만들기의 BAD_PCT)
		expect(groupbuyErrors({ ...ok, pct: '0' }, NOW).pct).toBeUndefined();
		expect(groupbuyErrors({ ...ok, pct: '71' }, NOW).pct).toBeUndefined();
		expect(groupbuyErrors({ ...ok, pct: '12.5' }, NOW).pct).toBeTruthy();
		expect(groupbuyErrors({ ...ok, pct: '' }, NOW).pct).toBeTruthy();
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
		expect(parseGroupbuyBody({ pct: 71, startsAt: '2026-11-10T03:00:00Z', endsAt: '2026-11-12T14:59:00Z' })?.pct).toBe(71); // 범위는 서버가 거절한다(BAD_PCT)
		expect(parseGroupbuyBody({ pct: 12.5, startsAt: '2026-11-10T03:00:00Z', endsAt: '2026-11-12T14:59:00Z' })).toBeNull();
		expect(parseGroupbuyBody({ pct: 3e9, startsAt: '2026-11-10T03:00:00Z', endsAt: '2026-11-12T14:59:00Z' })).toBeNull();
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
