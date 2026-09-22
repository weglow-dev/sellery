/**
 * 크론 라우트 공용 인증 — `/api/cron/reconcile` · `/api/cron/campaign-tick`.
 * Vercel Cron 은 `vercel.json` `crons[].path` 를 GET 으로 부르고, 프로젝트 env 에 `CRON_SECRET` 이 있으면 `Authorization: Bearer <CRON_SECRET>` 을 자동으로 붙인다
 * (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs). 수동 호출은 같은 헤더 또는 `x-cron-secret`. 미설정이면 503(실행 안 함).
 */
import { json } from '@sveltejs/kit';
import { cronSecret } from './env';

/** 상수 시간 비교 — 길이가 달라도 같은 시간에 끝난다 (node:crypto timingSafeEqual 대체 · @types/node 불필요) */
function safeEqual(a: string, b: string): boolean {
	const enc = new TextEncoder();
	const x = enc.encode(a);
	const y = enc.encode(b);
	let diff = x.length ^ y.length;
	const n = Math.max(x.length, y.length);
	for (let i = 0; i < n; i++) diff |= (x[i % x.length] ?? 0) ^ (y[i % y.length] ?? 0);
	return diff === 0 && x.length === y.length;
}

/** true = 통과 · false = 불일치 · null = CRON_SECRET 미설정 */
export function cronAuthorized(request: Request): boolean | null {
	const secret = cronSecret();
	if (!secret) return null;
	const bearer = request.headers.get('authorization') ?? '';
	const given = bearer.startsWith('Bearer ') ? bearer.slice(7) : (request.headers.get('x-cron-secret') ?? '');
	return safeEqual(given, secret);
}

/** 통과면 null, 아니면 바로 돌려줄 응답(503 NOT_CONFIGURED · 401 UNAUTHORIZED) */
export function rejectCron(request: Request): Response | null {
	const auth = cronAuthorized(request);
	if (auth === null) return json({ ok: false, code: 'NOT_CONFIGURED', message: 'CRON_SECRET is not set' }, { status: 503 });
	if (!auth) return json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
	return null;
}
