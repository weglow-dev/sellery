// 공휴일 API 응답 읽기(형식) — packages/myr-core/src/holiday-rules.ts. 판정(연도 · 넣기 / 지우기 · 올해 비었나)은 DB 0123 pgTAP
import { describe, expect, it } from 'vitest';
import { HOLIDAY_NAME_MAX, holidayServiceKey, parseHolidayJson, parseHolidayText } from '../holiday-rules';

const wrap = (items: unknown, resultCode = '00') => ({ response: { header: { resultCode, resultMsg: 'NORMAL SERVICE.' }, body: { items, numOfRows: 100, pageNo: 1, totalCount: 0 } } });

describe('특일 정보 응답 → 공휴일 목록', () => {
	it('여러 날(배열) — 날짜 YYYY-MM-DD · 날짜순 · 실측 모양(2027년 2월)', () => {
		const r = parseHolidayJson(
			wrap({
				item: [
					{ dateKind: '01', dateName: '대체공휴일(설날)', isHoliday: 'Y', locdate: 20270209, seq: 1 },
					{ dateKind: '01', dateName: '설날', isHoliday: 'Y', locdate: 20270206, seq: 1 },
					{ dateKind: '01', dateName: '설날', isHoliday: 'Y', locdate: 20270207, seq: 1 }
				]
			})
		);
		expect(r).toEqual({ ok: true, days: [{ day: '2027-02-06', name: '설날' }, { day: '2027-02-07', name: '설날' }, { day: '2027-02-09', name: '대체공휴일(설날)' }] });
	});
	it('하루(객체) · 없음(빈 문자열 · 칸 없음) · 문자열 locdate', () => {
		expect(parseHolidayJson(wrap({ item: { dateName: '3·1절', isHoliday: 'Y', locdate: '20270301' } }))).toEqual({ ok: true, days: [{ day: '2027-03-01', name: '3·1절' }] });
		expect(parseHolidayJson(wrap(''))).toEqual({ ok: true, days: [] });
		expect(parseHolidayJson({ response: { header: { resultCode: '00' }, body: {} } })).toEqual({ ok: true, days: [] });
	});
	it('공휴일 아님(isHoliday N) · 모양이 틀린 줄은 건너뛴다', () => {
		const r = parseHolidayJson(wrap({ item: [{ dateName: '식목일', isHoliday: 'N', locdate: 20270405 }, { dateName: '', isHoliday: 'Y', locdate: 20270101 }, { dateName: 'x', isHoliday: 'Y', locdate: 2027 }, 'bad', { dateName: '어린이날', isHoliday: 'Y', locdate: 20270505 }] }));
		expect(r).toEqual({ ok: true, days: [{ day: '2027-05-05', name: '어린이날' }] });
	});
	it('같은 날 두 이름은 합친다(DB 는 같은 날 두 번을 거절) · 같은 이름은 한 번 · 길면 자른다', () => {
		const r = parseHolidayJson(wrap({ item: [{ dateName: '어린이날', isHoliday: 'Y', locdate: 20250505 }, { dateName: '부처님오신날', isHoliday: 'Y', locdate: 20250505 }, { dateName: '어린이날', isHoliday: 'Y', locdate: 20250505 }] }));
		expect(r).toEqual({ ok: true, days: [{ day: '2025-05-05', name: '어린이날 · 부처님오신날' }] });
		const long = parseHolidayJson(wrap({ item: [{ dateName: '가'.repeat(30), isHoliday: 'Y', locdate: 20250101 }, { dateName: '나'.repeat(30), isHoliday: 'Y', locdate: 20250101 }] }));
		expect(long.ok && long.days[0].name.length).toBe(HOLIDAY_NAME_MAX);
	});
	it('오류 — resultCode 가 00 이 아니면 API_ERROR · 모양이 틀리면 PARSE_ERROR', () => {
		expect(parseHolidayJson(wrap('', '30'))).toEqual({ ok: false, code: 'API_ERROR', message: '30 NORMAL SERVICE.' });
		expect(parseHolidayJson({ nope: 1 })).toMatchObject({ ok: false, code: 'PARSE_ERROR' });
	});
	it('본문 문자열 — JSON · 포털 인증 오류 XML(returnAuthMsg) · 모르는 본문', () => {
		expect(parseHolidayText(JSON.stringify(wrap('')))).toEqual({ ok: true, days: [] });
		const xml = '<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>';
		expect(parseHolidayText(xml)).toEqual({ ok: false, code: 'API_ERROR', message: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' });
		expect(parseHolidayText('{bad')).toMatchObject({ ok: false, code: 'PARSE_ERROR' });
		expect(parseHolidayText('Unexpected errors')).toMatchObject({ ok: false, code: 'PARSE_ERROR' });
	});
});

describe('인증키 모양', () => {
	it('Decoding(원문)은 그대로 · Encoding(%2B · %3D)은 원문으로 · 공백 정리', () => {
		expect(holidayServiceKey(' abc+def/ghi== ')).toBe('abc+def/ghi==');
		expect(holidayServiceKey('abc%2Bdef%2Fghi%3D%3D')).toBe('abc+def/ghi==');
		expect([holidayServiceKey(''), holidayServiceKey(null)]).toEqual(['', '']);
	});
});
