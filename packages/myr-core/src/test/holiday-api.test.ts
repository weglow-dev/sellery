// 공휴일 API 호출(가짜 fetch) — packages/myr-core/src/holiday-api-client.ts. 주소 · 키 · 오류 분류 · 오류에 키를 싣지 않는다
import { describe, expect, it } from 'vitest';
import { createHolidayApi } from '../holiday-api-client';
import { HOLIDAY_API_URL } from '../holiday-rules';

const KEY = 'abc+def/ghi=='; // 테스트 전용 · 실제 키 아님

function fakeFetch(reply: (url: URL) => Response | Promise<Response>) {
	const calls: URL[] = [];
	const fn = (async (input: URL | RequestInfo) => {
		const url = new URL(String(input));
		calls.push(url);
		return reply(url);
	}) as typeof fetch;
	return { fn, calls };
}
const okBody = JSON.stringify({ response: { header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' }, body: { items: { item: { dateName: '1월 1일', isHoliday: 'Y', locdate: 20270101 } }, totalCount: 1 } } });

describe('공휴일 API 호출', () => {
	it('한 해 전체를 한 번에 — solYear · numOfRows 100 · _type json · 키는 원문 한 번만 인코딩', async () => {
		const { fn, calls } = fakeFetch(() => new Response(okBody, { status: 200 }));
		const r = await createHolidayApi({ serviceKey: KEY, fetch: fn }).fetchYear(2027);
		expect(r).toEqual({ ok: true, days: [{ day: '2027-01-01', name: '1월 1일' }] });
		expect(calls[0].origin + calls[0].pathname).toBe(HOLIDAY_API_URL);
		expect([calls[0].searchParams.get('serviceKey'), calls[0].searchParams.get('solYear'), calls[0].searchParams.get('numOfRows'), calls[0].searchParams.get('_type'), calls[0].searchParams.has('solMonth')]).toEqual([KEY, '2027', '100', 'json', false]);
	});
	it('Encoding 키를 넣어도 같은 주소(두 번 인코딩하지 않는다) · 키는 호출 때마다 읽는다', async () => {
		const { fn, calls } = fakeFetch(() => new Response(okBody, { status: 200 }));
		let key: string | undefined = encodeURIComponent(KEY);
		const api = createHolidayApi({ key: () => key, fetch: fn });
		await api.fetchYear(2027);
		expect(calls[0].searchParams.get('serviceKey')).toBe(KEY);
		key = undefined;
		expect(await api.fetchYear(2027)).toMatchObject({ ok: false, code: 'CONFIG_ERROR' });
		expect(calls.length).toBe(1);
	});
	it('키 없음 — 부르지 않고 CONFIG_ERROR', async () => {
		const { fn, calls } = fakeFetch(() => new Response(okBody));
		expect(await createHolidayApi({ fetch: fn }).fetchYear(2027)).toMatchObject({ ok: false, code: 'CONFIG_ERROR', status: 0 });
		expect(calls.length).toBe(0);
	});
	it('오류 분류 — 네트워크 · HTTP · 포털 인증 오류(XML) · 결과 코드 · 못 읽음 · 메시지에 키가 없다', async () => {
		const run = (reply: () => Response | Promise<Response>) => createHolidayApi({ serviceKey: KEY, fetch: fakeFetch(reply).fn }).fetchYear(2027);
		const net = await run(() => Promise.reject(new Error(`fetch failed ${HOLIDAY_API_URL}?serviceKey=${encodeURIComponent(KEY)}`)));
		expect(net).toMatchObject({ ok: false, code: 'NETWORK', status: 0 });
		expect(!net.ok && net.message).not.toContain(encodeURIComponent(KEY));
		expect(await run(() => new Response('Bad Gateway', { status: 502 }))).toMatchObject({ ok: false, code: 'HTTP_ERROR', status: 502 });
		const xml = '<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>';
		expect(await run(() => new Response(xml, { status: 200 }))).toEqual({ ok: false, code: 'API_ERROR', status: 200, message: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' });
		expect(await run(() => new Response(JSON.stringify({ response: { header: { resultCode: '22', resultMsg: 'LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS ERROR.' } } }), { status: 200 }))).toMatchObject({ ok: false, code: 'API_ERROR' });
		expect(await run(() => new Response('{bad', { status: 200 }))).toMatchObject({ ok: false, code: 'PARSE_ERROR' });
	});
});
