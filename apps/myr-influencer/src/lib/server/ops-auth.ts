/**
 * 운영 API 인증 — 샵 `apps/myr-shop/src/lib/server/cron.ts` 복사. `Authorization: Bearer <CRON_SECRET>`(또는 `x-cron-secret`) · 미설정이면 503.
 * 운영 콘솔(myr-admin)이 생기기 전까지 운영 스크립트(packages/db/scripts/myr-invites.mjs)가 부르는 임시 경로 — 콘솔이 생기면 관리자 세션으로 바꾸고 지운다.
 */
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

function safeEqual(a: string, b: string): boolean {
	const enc = new TextEncoder();
	const x = enc.encode(a);
	const y = enc.encode(b);
	let diff = x.length ^ y.length;
	const n = Math.max(x.length, y.length);
	for (let i = 0; i < n; i++) diff |= (x[i % x.length] ?? 0) ^ (y[i % y.length] ?? 0);
	return diff === 0 && x.length === y.length;
}

export function rejectOps(request: Request): Response | null {
	const secret = (env.CRON_SECRET ?? '').trim();
	if (!secret) return json({ ok: false, code: 'NOT_CONFIGURED', message: 'CRON_SECRET is not set' }, { status: 503 });
	const bearer = request.headers.get('authorization') ?? '';
	const given = bearer.startsWith('Bearer ') ? bearer.slice(7) : (request.headers.get('x-cron-secret') ?? '');
	if (!safeEqual(given, secret)) return json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
	return null;
}
