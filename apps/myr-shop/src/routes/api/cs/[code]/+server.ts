import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CS_CODE_RE, csTokenCookieName } from '@sellery/myr-core/cs-rules';
import { hasAdmin } from '$lib/server/admin';
import { getCsThread } from '$lib/server/cs';

/** GET /api/cs/<code> — 고객 문의 스레드(마이 "내 문의" 아코디언이 펼칠 때 읽는다). actor 는 세션 user.id 또는 HttpOnly 쿠키 `myr_cs_<code>` 에서만 — 둘 다 안 맞으면 404. 캐시 금지. */
export const GET: RequestHandler = async ({ params, locals, cookies, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	const code = params.code.trim().toLowerCase();
	if (!CS_CODE_RE.test(code)) return json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
	if (!hasAdmin()) return json({ ok: false, code: 'CONFIG_ERROR' }, { status: 503 });
	const { user } = await locals.safeGetSession();
	try {
		const t = await getCsThread(code, { clientToken: cookies.get(csTokenCookieName(code)) ?? null, userId: user?.id ?? null });
		if (!t) return json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
		return json({ ok: true, thread: t });
	} catch (e) {
		console.error('[api/cs] thread failed:', e instanceof Error ? e.message : e);
		return json({ ok: false, code: 'DB_ERROR' }, { status: 500 });
	}
};
