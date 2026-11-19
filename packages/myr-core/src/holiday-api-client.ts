/**
 * 공휴일 API 호출 — 순수 모듈(키 · fetch 를 받는다 · 설정 · DB 를 모른다 · 0123).
 * 서버 기본 인스턴스(configureMyrCore 의 DATA_GO_KR_SERVICE_KEY)와 동기화는 `server/holidays.server.ts`. 테스트는 이 파일을 가짜 fetch 로 부른다.
 * 한 해 전체를 한 번에 받는다(solYear 만 · numOfRows 100 — 한 해 공휴일은 30일 안쪽). 반환은 던지지 않는다 · 오류 메시지에 키를 싣지 않는다.
 */
import { HOLIDAY_API_URL, holidayServiceKey, parseHolidayText, type HolidayDay } from './holiday-rules';

const DEFAULT_TIMEOUT_MS = 10_000;

export type HolidayFetchResult =
	| { ok: true; days: HolidayDay[] }
	| { ok: false; code: 'CONFIG_ERROR' | 'NETWORK' | 'HTTP_ERROR' | 'API_ERROR' | 'PARSE_ERROR'; status: number; message: string };

export type HolidayApi = { fetchYear(year: number): Promise<HolidayFetchResult> };

export type CreateHolidayApiOptions = {
	serviceKey?: string;
	/** 키를 호출할 때마다 읽는다(서버 기본 인스턴스) — serviceKey 가 먼저 */
	key?: () => string | undefined;
	fetch?: typeof fetch;
	baseUrl?: string;
	timeoutMs?: number;
};

export function createHolidayApi(opts: CreateHolidayApiOptions = {}): HolidayApi {
	return {
		async fetchYear(year) {
			const key = holidayServiceKey(opts.serviceKey ?? opts.key?.());
			if (!key) return { ok: false, code: 'CONFIG_ERROR', status: 0, message: 'DATA_GO_KR_SERVICE_KEY 없음' };
			const hide = (m: string) => m.split(key).join('[KEY]').split(encodeURIComponent(key)).join('[KEY]');
			const url = new URL(opts.baseUrl ?? HOLIDAY_API_URL);
			url.searchParams.set('serviceKey', key);
			url.searchParams.set('solYear', String(year));
			url.searchParams.set('numOfRows', '100');
			url.searchParams.set('_type', 'json');
			let res: Response;
			try {
				res = await (opts.fetch ?? fetch)(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS) });
			} catch (e) {
				return { ok: false, code: 'NETWORK', status: 0, message: hide(e instanceof Error ? e.message : String(e)) };
			}
			const text = await res.text().catch(() => '');
			if (!res.ok) return { ok: false, code: 'HTTP_ERROR', status: res.status, message: hide(text.slice(0, 200)) };
			const r = parseHolidayText(text);
			return r.ok ? { ok: true, days: r.days } : { ok: false, code: r.code, status: res.status, message: hide(r.message) };
		}
	};
}
