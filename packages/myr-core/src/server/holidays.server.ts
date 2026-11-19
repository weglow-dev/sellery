/**
 * 공휴일 자동 동기화(서버 전용 · 0123) — 샵 크론 /api/cron/holidays 가 하루 한 번 부른다.
 * 판정은 DB 한 곳(백엔드 원칙 1): 동기화할 연도 myr_holiday_sync_years · 넣기 / 지우기 myr_holidays_sync · 올해 비었나 myr_holidays_missing.
 * 여기서는 API 응답을 받아 그 함수들에 넘기고, 실패 · 올해 비어 있음을 운영 할 일 목록(payment_events source 'holidays' · handled=false)에 남긴다.
 * 키(DATA_GO_KR_SERVICE_KEY)가 없으면 아무것도 하지 않는다(NO_KEY — 로컬 · Preview 에 키가 없을 때 알림을 쌓지 않는다).
 */
import { createHolidayApi, type HolidayFetchResult } from '../holiday-api-client';
import { admin } from './admin.server';
import { myrConfig } from './config.server';
import { logPaymentEvent } from './payment-events.server';

export const hasHolidayApi = (): boolean => !!myrConfig().dataGoKrServiceKey;

const api = createHolidayApi({ key: () => myrConfig().dataGoKrServiceKey });

/** 한 해 결과 — DB 응답 그대로(ok · added · updated · removed · total · 빈 목록이면 올해는 실패 EMPTY · 내년은 skipped NOT_PUBLISHED — 0123 이 판정) · API 실패면 그 코드 */
export type HolidayYearResult = { year: number; ok: boolean; code?: string; skipped?: string; message?: string; added?: number; updated?: number; removed?: number; total?: number };
export type HolidaySyncResult = { ok: false; code: 'NO_KEY' | 'DB_ERROR' } | { ok: true; years: HolidayYearResult[]; missing: boolean; failed: boolean };

async function syncYear(year: number, fetched: HolidayFetchResult): Promise<HolidayYearResult> {
	if (!fetched.ok) return { year, ok: false, code: fetched.code, message: fetched.message };
	const { data, error } = await admin().rpc('myr_holidays_sync', { p_year: year, p_days: fetched.days });
	if (error) return { year, ok: false, code: 'DB_ERROR', message: error.message };
	return { year, ...(data as Omit<HolidayYearResult, 'year'>) };
}

export async function runHolidaySync(fetchYear: (year: number) => Promise<HolidayFetchResult> = (y) => api.fetchYear(y)): Promise<HolidaySyncResult> {
	if (!hasHolidayApi()) return { ok: false, code: 'NO_KEY' };
	const { data: years, error } = await admin().rpc('myr_holiday_sync_years');
	if (error || !Array.isArray(years)) {
		console.error('[holidays] sync years failed:', error?.message);
		return { ok: false, code: 'DB_ERROR' };
	}
	const results: HolidayYearResult[] = [];
	for (const y of years as number[]) results.push(await syncYear(y, await fetchYear(y)));
	const { data: missing, error: mErr } = await admin().rpc('myr_holidays_missing');
	// 실패는 DB · API 응답의 ok 그대로 — 빈 목록이 실패인지(올해) 건너뜀인지(내년)는 myr_holidays_sync 가 정한다
	const failed = !!mErr || results.some((r) => !r.ok);
	const out = { ok: true as const, years: results, missing: missing === true, failed };
	if (failed || out.missing) {
		console.error('[holidays] sync needs attention:', JSON.stringify(out));
		await logPaymentEvent(admin(), {
			source: 'holidays',
			event_type: 'holiday_sync',
			payload: out,
			handled: false,
			result: out.missing ? 'error: holidays missing this year' : 'error: holiday sync failed'
		});
	}
	return out;
}
