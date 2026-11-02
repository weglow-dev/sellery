// Resend 전송기(복사본) — apps/myr-shop/src/lib/mail/resend.ts · 비활성 · 멱등 가드 · 예약 주소 · HTTP 실패 · 네트워크 실패에 throw 없음
import { describe, expect, it, vi } from 'vitest';
import { asciiToken, createMailer, GUARD_TTL_MS, isEmailAddress, isReservedAddress, MAIL_FROM_FALLBACK, type MailMessage } from '../lib/mail/resend';

const msg = (over: Partial<MailMessage> = {}): MailMessage => ({ to: 'buyer@gmail.com', subject: '제목', html: '<p>hi</p>', text: 'hi', tag: 'myr_order_paid', idempotencyKey: 'myr_order_paid:customer:o1', ...over });
const okFetch = (status = 200, body: unknown = { id: 'em_1' }) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('주소 검사', () => {
	it('형식 밖 · 예약 도메인은 거른다 (.test · .example · @sellery.demo · @myr.test)', () => {
		expect(isEmailAddress('a@b.co')).toBe(true);
		expect(isEmailAddress('')).toBe(false);
		expect(isEmailAddress(null)).toBe(false);
		expect(isEmailAddress('no-at')).toBe(false);
		expect(isEmailAddress('x@myr.test')).toBe(false);
		expect(isEmailAddress('x@brand.example')).toBe(false);
		expect(isEmailAddress('jiyu@sellery.demo')).toBe(false);
		expect(isReservedAddress('x@example.com')).toBe(true);
	});
	it('asciiToken 은 비ASCII 를 코드포인트로 바꾼다 (헤더 안전)', () => {
		expect(asciiToken('ab c')).toBe('ab_20_c');
		expect(asciiToken('가')).toBe('_ac00_');
		expect(asciiToken('myr1001')).toBe('myr1001');
	});
});

describe('createMailer', () => {
	it('키가 없으면 비활성 — fetch 를 부르지 않고 disabled', async () => {
		const fetchFn = okFetch();
		const m = createMailer({ apiKey: '', fetch: fetchFn });
		expect(m.enabled).toBe(false);
		expect(await m.send(msg())).toEqual({ ok: false, reason: 'disabled' });
		expect(fetchFn).not.toHaveBeenCalled();
	});
	it('보낸다 — from 기본값 · to 배열 · idempotency-key 헤더 · tags', async () => {
		const fetchFn = okFetch();
		const m = createMailer({ apiKey: 're_x', fetch: fetchFn, apiUrl: 'http://127.0.0.1:9/' });
		expect(await m.send(msg())).toEqual({ ok: true, id: 'em_1' });
		const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('http://127.0.0.1:9/emails');
		const headers = init.headers as Record<string, string>;
		expect(headers.authorization).toBe('Bearer re_x');
		expect(headers['idempotency-key']).toBe('myr_order_paid:customer:o1');
		const body = JSON.parse(init.body as string);
		expect(body.from).toBe(MAIL_FROM_FALLBACK);
		expect(body.to).toEqual(['buyer@gmail.com']);
		expect(body.tags).toEqual([{ name: 'event', value: 'myr_order_paid' }]);
	});
	it('MAIL_FROM 을 주면 그 발신자', async () => {
		const fetchFn = okFetch();
		const m = createMailer({ apiKey: 're_x', from: 'MYR <noreply@makeyourrecipe.kr>', fetch: fetchFn });
		await m.send(msg());
		expect(JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).from).toBe('MYR <noreply@makeyourrecipe.kr>');
	});
	it('같은 멱등 키는 24시간 안에 한 번만 — 지나면 다시', async () => {
		let t = 1_000;
		const fetchFn = okFetch();
		const m = createMailer({ apiKey: 're_x', fetch: fetchFn, now: () => t });
		expect((await m.send(msg())).ok).toBe(true);
		expect(await m.send(msg())).toEqual({ ok: false, reason: 'duplicate' });
		expect(fetchFn).toHaveBeenCalledTimes(1);
		t += GUARD_TTL_MS;
		expect((await m.send(msg())).ok).toBe(true);
		expect(fetchFn).toHaveBeenCalledTimes(2);
	});
	it('받는 사람이 예약 주소면 invalid · 키가 비면 invalid', async () => {
		const fetchFn = okFetch();
		const m = createMailer({ apiKey: 're_x', fetch: fetchFn });
		expect(await m.send(msg({ to: 'x@myr.test' }))).toEqual({ ok: false, reason: 'invalid', message: 'recipient' });
		expect(await m.send(msg({ idempotencyKey: '' }))).toEqual({ ok: false, reason: 'invalid', message: 'idempotencyKey' });
		expect(fetchFn).not.toHaveBeenCalled();
	});
	it('HTTP 실패는 http 로 돌려주고 가드를 풀어 재시도 가능 · 409 는 duplicate', async () => {
		const fetchFn = vi
			.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'not authorized to send' }), { status: 403 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'em_2' }), { status: 200 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'dup' }), { status: 409 }));
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const m = createMailer({ apiKey: 're_x', fetch: fetchFn as unknown as typeof fetch });
		expect(await m.send(msg())).toEqual({ ok: false, reason: 'http', status: 403, message: 'not authorized to send' });
		expect(await m.send(msg())).toEqual({ ok: true, id: 'em_2' });
		expect(await m.send(msg({ idempotencyKey: 'k2' }))).toEqual({ ok: false, reason: 'duplicate', status: 409, message: 'dup' });
		spy.mockRestore();
	});
	it('네트워크 예외는 throw 하지 않고 network', async () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const m = createMailer({ apiKey: 're_x', fetch: (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch });
		expect(await m.send(msg())).toEqual({ ok: false, reason: 'network', message: 'ECONNREFUSED' });
		spy.mockRestore();
	});
});
