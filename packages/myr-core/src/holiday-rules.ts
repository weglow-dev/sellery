/**
 * 공휴일 동기화 — 공공데이터포털 "한국천문연구원 특일 정보" getRestDeInfo 응답 읽기(순수 · 형식만 · 0123).
 * 판정(동기화할 연도 · 그해 날짜인가 · 넣기 / 지우기 · 올해 비었나 · 영업일)은 DB(0123 myr_holidays_sync · 0122 myr_is_business_day).
 * 여기서는 응답 모양을 [{ day: 'YYYY-MM-DD', name }] 로 옮기기만 한다.
 *   - 응답(2026-11-19 실측 · _type=json): { response: { header: { resultCode: '00', resultMsg }, body: { items: { item }, totalCount } } }
 *   - item 은 여러 날이면 배열 · 하루면 객체 · 없으면 items 가 빈 문자열(또는 없음)
 *   - isHoliday 'Y' 만 공휴일 · locdate 는 숫자 20270206 → '2027-02-06'
 *   - 같은 날 두 이름(어린이날과 부처님오신날이 겹치는 해 등)은 ' · ' 로 합친다 — DB 는 같은 날 두 번을 거절한다
 *   - 인증 오류(키 미등록 · 만료)는 _type=json 이어도 XML(OpenAPI_ServiceResponse · returnAuthMsg)로 온다
 */

export const HOLIDAY_API_URL = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';
/** 이름 최대 글자 — DB 0123 myr_holiday_name_ok(표 제약 · 동기화 검사가 같이 쓴다)와 짝(check-boundaries (j)) · 합친 이름이 길면 자른다 */
export const HOLIDAY_NAME_MAX = 40;

export type HolidayDay = { day: string; name: string };
export type HolidayParse = { ok: true; days: HolidayDay[] } | { ok: false; code: 'API_ERROR' | 'PARSE_ERROR'; message: string };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);

function dayOf(locdate: unknown): string | null {
	const s = typeof locdate === 'number' ? String(locdate) : typeof locdate === 'string' ? locdate.trim() : '';
	return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}

/** JSON 응답 → 공휴일 목록(날짜순) */
export function parseHolidayJson(v: unknown): HolidayParse {
	const res = obj(obj(v)?.response);
	const header = obj(res?.header);
	if (!res || !header) return { ok: false, code: 'PARSE_ERROR', message: 'no response.header' };
	const code = String(header.resultCode ?? '');
	if (code !== '00') return { ok: false, code: 'API_ERROR', message: `${code} ${String(header.resultMsg ?? '')}`.trim() };
	const items = obj(obj(res.body)?.items);
	const raw = items?.item;
	const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
	const byDay = new Map<string, string[]>();
	for (const it of list) {
		const o = obj(it);
		if (!o || o.isHoliday !== 'Y') continue;
		const day = dayOf(o.locdate);
		const name = typeof o.dateName === 'string' ? o.dateName.trim() : '';
		if (!day || !name) continue;
		const names = byDay.get(day) ?? [];
		if (!names.includes(name)) names.push(name);
		byDay.set(day, names);
	}
	const days = [...byDay.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([day, names]) => ({ day, name: names.join(' · ').slice(0, HOLIDAY_NAME_MAX) }));
	return { ok: true, days };
}

/** 응답 본문(문자열) → 목록 — JSON 이 아니면 포털 인증 오류 XML 의 사유를 읽는다 */
export function parseHolidayText(text: string): HolidayParse {
	const t = String(text ?? '').trim();
	if (t.startsWith('{')) {
		try {
			return parseHolidayJson(JSON.parse(t));
		} catch {
			return { ok: false, code: 'PARSE_ERROR', message: 'bad json' };
		}
	}
	const reason = t.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/)?.[1] ?? t.match(/<resultMsg>([^<]*)<\/resultMsg>/)?.[1];
	return reason ? { ok: false, code: 'API_ERROR', message: reason.trim() } : { ok: false, code: 'PARSE_ERROR', message: 'not json' };
}

/** 포털 마이페이지 키는 Decoding(원문) · Encoding(%2B 등) 두 모양 — 어느 쪽을 넣어도 원문으로(주소에 붙일 때 한 번만 인코딩) */
export function holidayServiceKey(raw: string | null | undefined): string {
	const k = String(raw ?? '').trim();
	if (!/%[0-9A-Fa-f]{2}/.test(k)) return k;
	try {
		return decodeURIComponent(k);
	} catch {
		return k;
	}
}
