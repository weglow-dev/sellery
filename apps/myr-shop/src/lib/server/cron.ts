/** 크론 라우트 인증 — apps/shop lib/server/cron.ts 복사. Vercel Cron 은 `CRON_SECRET` 이 있으면 `Authorization: Bearer <CRON_SECRET>` 을 붙인다. 수동 호출은 같은 헤더 또는 `x-cron-secret`. 미설정이면 503. */
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

export function rejectCron(request: Request): Response | null {
	const secret = (env.CRON_SECRET ?? '').trim();
	if (!secret) return json({ ok: false, code: 'NOT_CONFIGURED', message: 'CRON_SECRET is not set' }, { status: 503 });
	const bearer = request.headers.get('authorization') ?? '';
	const given = bearer.startsWith('Bearer ') ? bearer.slice(7) : (request.headers.get('x-cron-secret') ?? '');
	if (!safeEqual(given, secret)) return json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
	return null;
}
