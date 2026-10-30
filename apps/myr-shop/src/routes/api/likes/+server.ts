import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseCodesBody, parseLikeBody } from '$lib/cart';
import { hasAdmin } from '$lib/server/admin';
import { getLikes, mergeLikes, setLike } from '$lib/server/cart';

/**
 * 계정 찜(0057 · docs/myr.md §9-12). 세션 없으면 401.
 *   GET  /api/likes                   → { products }                (최근 찜 순 · 살 수 없는 상품은 서버가 뺀다)
 *   PUT  /api/likes { code, liked }   → { ok, liked, products }     · 실패 { ok:false, code } (404 NOT_FOUND)
 *   POST /api/likes { codes: [] }     → { ok, merged, skipped, products }  — 로그인 직후 브라우저 찜 합치기
 */
const unauthorized = () => json({ error: 'UNAUTHORIZED' }, { status: 401 });
const noService = () => {
	console.error('[api/likes] SUPABASE_SERVICE_ROLE_KEY 없음 — 계정 찜 비활성');
	return json({ error: 'NO_SERVICE_KEY' }, { status: 503 });
};

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return unauthorized();
	if (!hasAdmin()) return noService();
	return json({ products: await getLikes(user.id) });
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return unauthorized();
	if (!hasAdmin()) return noService();
	const body = parseLikeBody(await request.json().catch(() => null));
	if (!body) return json({ ok: false, code: 'BAD_BODY' }, { status: 400 });
	const r = await setLike(user.id, body.code, body.liked);
	if (!r.ok) return json({ ok: false, code: r.code }, { status: r.code === 'NOT_FOUND' ? 404 : 400 });
	return json({ ok: true, liked: r.liked, products: await getLikes(user.id) });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return unauthorized();
	if (!hasAdmin()) return noService();
	const codes = parseCodesBody(await request.json().catch(() => null));
	if (!codes) return json({ ok: false, code: 'BAD_BODY' }, { status: 400 });
	const r = codes.length ? await mergeLikes(user.id, codes) : { ok: true, merged: 0, skipped: 0 };
	if (!r.ok) return json({ ok: false, code: r.code }, { status: 400 });
	return json({ ok: true, merged: r.merged ?? 0, skipped: r.skipped ?? 0, products: await getLikes(user.id) });
};
