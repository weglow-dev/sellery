// /api/health 응답 조립 — apps/myr-shop/src/lib/health.ts
import { describe, expect, it } from 'vitest';
import { healthBody } from '../lib/health';

describe('healthBody', () => {
	it('전부 ok 면 200', () => {
		expect(healthBody({ supabaseAdmin: 'ok' })).toEqual({ status: 200, body: { ok: true, checks: { supabaseAdmin: 'ok' } } });
	});
	it('하나라도 fail 이면 503 · 응답에는 ok/fail 만(원인 없음)', () => {
		const r = healthBody({ supabaseAdmin: 'fail' });
		expect(r.status).toBe(503);
		expect(r.body).toEqual({ ok: false, checks: { supabaseAdmin: 'fail' } });
	});
});
