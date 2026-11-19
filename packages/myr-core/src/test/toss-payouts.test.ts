// 토스 지급대행 호출 — packages/myr-core/src/toss-payouts-client.ts(서버 기본 인스턴스는 server/toss-payouts.server.ts). 가짜 fetch 로 봉투 읽기 · 암호화 요청/응답 · 오류 · 불명(status 0) · 키 없음 · 멱등 키를 본다.
// 실제 토스 연결은 toss-payouts.live.test.ts(로컬에서 MYR_TOSS_LIVE=1 일 때만)
import { describe, expect, it, vi } from 'vitest';
import { createTossPayouts, isUncertainPayout } from '../toss-payouts-client';
import { jweDecrypt, jweEncrypt } from '../toss-jwe';
import type { TossSellerBody } from '../toss-payout-rules';

const SK = 'test_sk_00000000000000000000000000';
const SEC = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 테스트 전용 · 실제 키 아님
const envelope = (entityBody: unknown, error: unknown = null) => JSON.stringify({ version: '2022-11-16', traceId: 't-1', entityType: 'x', entityBody, error });
type Call = { url: string; init: RequestInit };
const fakeFetch = (respond: (call: Call) => Response | Promise<Response>) => {
	const calls: Call[] = [];
	const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
		const call = { url: String(url), init: init ?? {} };
		calls.push(call);
		return respond(call);
	}) as unknown as typeof fetch;
	return { fn, calls };
};
const sellerBody: TossSellerBody = {
	refSellerId: 'm1a2b3c4d5e6f7g8h9',
	businessType: 'INDIVIDUAL_BUSINESS',
	company: { name: '민지랩', representativeName: '김민지', businessRegistrationNumber: '1230145670', email: 'minji@myr.test', phone: '01012345678' },
	account: { bankCode: '088', accountNumber: '110123456789', holderName: '김민지' }
};

describe('조회(평문)', () => {
	it('잔액 — 봉투 entityBody 를 풀고 금액은 value 숫자 · Basic 인증(시크릿 키 + :)', async () => {
		const { fn, calls } = fakeFetch(() => new Response(envelope({ availableAmount: { currency: 'KRW', value: 12000 }, pendingAmount: { currency: 'KRW', value: 3000 } }), { status: 200 }));
		const r = await createTossPayouts({ secretKey: SK, securityKey: SEC, fetch: fn }).getBalance();
		expect(r).toEqual({ ok: true, status: 200, body: { availableAmount: 12000, pendingAmount: 3000, currency: 'KRW' } });
		expect(calls[0].url).toBe('https://api.tosspayments.com/v2/balances');
		expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa(`${SK}:`)}`);
		expect((calls[0].init.headers as Record<string, string>)['TossPayments-api-security-mode']).toBeUndefined();
	});
	it('셀러 목록 — 실측 모양 { items · hasMore · nextCursor } · 쿼리 limit/startingAfter', async () => {
		const { fn, calls } = fakeFetch(() => new Response(envelope({ hasMore: false, size: 1, nextCursor: null, items: [{ id: 'seller_1', status: 'APPROVED' }] }), { status: 200 }));
		const r = await createTossPayouts({ secretKey: SK, fetch: fn }).listSellers({ limit: 1, startingAfter: 'c1' });
		expect(r.ok && r.body).toEqual({ items: [expect.objectContaining({ id: 'seller_1', status: 'APPROVED' })], hasMore: false, nextCursor: null });
		expect(calls[0].url).toBe('https://api.tosspayments.com/v2/sellers?limit=1&startingAfter=c1');
	});
});

describe('암호화 요청(셀러 등록 · 지급 요청)', () => {
	it('셀러 등록 — 본문은 JWE(보안 키) · ENCRYPTION 헤더 · 암호화된 응답도 풀어서 읽는다', async () => {
		let sent = '';
		const { fn, calls } = fakeFetch(async (c) => {
			sent = await jweDecrypt(String(c.init.body), SEC);
			return new Response(await jweEncrypt(envelope({ id: 'seller_1', status: 'APPROVAL_REQUIRED', refSellerId: sellerBody.refSellerId }), SEC), { status: 200 });
		});
		const r = await createTossPayouts({ secretKey: SK, securityKey: SEC, fetch: fn, now: () => new Date('2026-11-19T01:00:00Z') }).registerSeller(sellerBody);
		expect(r.ok && [r.body.id, r.body.status]).toEqual(['seller_1', 'APPROVAL_REQUIRED']);
		expect(JSON.parse(sent)).toEqual(sellerBody);
		const h = calls[0].init.headers as Record<string, string>;
		expect([h['TossPayments-api-security-mode'], h['Content-Type'], calls[0].init.method, calls[0].url]).toEqual(['ENCRYPTION', 'text/plain', 'POST', 'https://api.tosspayments.com/v2/sellers']);
	});
	it('지급 요청 — 멱등 키 헤더 · 목록으로 돌려준다', async () => {
		const { fn, calls } = fakeFetch(async () => new Response(await jweEncrypt(envelope({ items: [{ id: 'po_1', status: 'REQUESTED', refPayoutId: 'p1' }] }), SEC), { status: 200 }));
		const r = await createTossPayouts({ secretKey: SK, securityKey: SEC, fetch: fn }).requestPayouts(
			[{ refPayoutId: 'p1', destination: 'seller_1', scheduleType: 'EXPRESS', amount: { currency: 'KRW', value: 1000 }, transactionDescription: 'MYR정산' }],
			{ idempotencyKey: 'run-2026-11-19-1' }
		);
		expect(r.ok && r.body.items.map((p) => [p.id, p.status])).toEqual([['po_1', 'REQUESTED']]);
		expect((calls[0].init.headers as Record<string, string>)['Idempotency-Key']).toBe('run-2026-11-19-1');
	});
});

describe('오류 · 불명 · 설정', () => {
	it('토스 오류 — 봉투 error 의 code · message · traceId 와 HTTP 상태(접근 정책 403 등)', async () => {
		const { fn } = fakeFetch(() => new Response(envelope(null, { code: 'API_KEY_ACCESS_DENIED', message: 'API 키 접근 정책에 의해 허용되지 않은 요청입니다.' }), { status: 403 }));
		const r = await createTossPayouts({ secretKey: SK, fetch: fn }).getBalance();
		expect(r).toEqual({ ok: false, status: 403, body: { code: 'API_KEY_ACCESS_DENIED', message: 'API 키 접근 정책에 의해 허용되지 않은 요청입니다.', traceId: 't-1' } });
		expect(isUncertainPayout(r)).toBe(false);
	});
	it('불명 — 네트워크 실패 · 5xx · 2xx 인데 못 읽음은 다시 보내기 전에 조회(isUncertainPayout)', async () => {
		const net = await createTossPayouts({ secretKey: SK, fetch: fakeFetch(() => Promise.reject(new TypeError('fetch failed'))).fn }).getPayout('po_1');
		expect([net.ok, net.status, !net.ok && net.body.code, isUncertainPayout(net)]).toEqual([false, 0, 'NETWORK_ERROR', true]);
		const s5 = await createTossPayouts({ secretKey: SK, fetch: fakeFetch(() => new Response('oops', { status: 502 })).fn }).getPayout('po_1');
		expect([s5.status, !s5.ok && s5.body.code, isUncertainPayout(s5)]).toEqual([502, 'HTTP_502', true]);
		const bad = await createTossPayouts({ secretKey: SK, fetch: fakeFetch(() => new Response(envelope({ nope: 1 }), { status: 200 })).fn }).getPayout('po_1');
		expect([bad.status, !bad.ok && bad.body.code, isUncertainPayout(bad)]).toEqual([0, 'PARSE_ERROR', true]);
	});
	it('키가 없으면 토스를 부르지 않고 CONFIG_ERROR — 암호화 요청은 보안 키도 있어야 한다', async () => {
		const { fn, calls } = fakeFetch(() => new Response('{}'));
		const noKey = await createTossPayouts({ fetch: fn }).getBalance();
		const noSec = await createTossPayouts({ secretKey: SK, fetch: fn }).registerSeller(sellerBody);
		expect([!noKey.ok && noKey.body.code, !noSec.ok && noSec.body.code, calls.length]).toEqual(['CONFIG_ERROR', 'CONFIG_ERROR', 0]);
	});
	it('id 는 주소에 넣을 때 인코딩한다', async () => {
		const { fn, calls } = fakeFetch(() => new Response(envelope({ id: 'a/b', status: 'APPROVED' }), { status: 200 }));
		await createTossPayouts({ secretKey: SK, fetch: fn }).getSeller('a/b');
		expect(calls[0].url).toBe('https://api.tosspayments.com/v2/sellers/a%2Fb');
	});
});
