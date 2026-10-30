import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseSetBody } from '$lib/cart';
import { hasAdmin } from '$lib/server/admin';
import { clearCart, getCart, setCart } from '$lib/server/cart';

/**
 * 계정 장바구니(0057 · docs/myr.md §6.2). 세션이 없으면 401 — 비회원 장바구니는 브라우저에만 있다(서버는 모른다).
 *   GET    /api/cart                → { lines }
 *   PUT    /api/cart { code, qty, add? } → { ok, qty, lines }  · qty 0 = 삭제 · 실패 { ok:false, code } (400 BAD_* · 404 NOT_FOUND · 409 NOT_AVAILABLE)
 *   DELETE /api/cart                → { ok, lines: [] }
 * 바뀐 뒤 항상 전체 줄을 돌려준다 — 클라이언트가 그대로 바꿔 끼운다(가격·available 도 서버 값으로). 캐시 금지는 hooks(apiNoStore).
 */
const unauthorized = () => json({ error: 'UNAUTHORIZED' }, { status: 401 });
const noService = () => {
	console.error('[api/cart] SUPABASE_SERVICE_ROLE_KEY 없음 — 계정 장바구니 비활성');
	return json({ error: 'NO_SERVICE_KEY' }, { status: 503 });
};
const statusOf = (code?: string) => (code === 'NOT_FOUND' ? 404 : code === 'NOT_AVAILABLE' ? 409 : 400);

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return unauthorized();
	if (!hasAdmin()) return noService();
	return json({ lines: await getCart(user.id) });
};

export const PUT: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return unauthorized();
	if (!hasAdmin()) return noService();
	const body = parseSetBody(await request.json().catch(() => null));
	if (!body) return json({ ok: false, code: 'BAD_BODY' }, { status: 400 });
	const r = await setCart(user.id, body);
	if (!r.ok) return json({ ok: false, code: r.code }, { status: statusOf(r.code) });
	return json({ ok: true, qty: r.qty, lines: await getCart(user.id) });
};

export const DELETE: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return unauthorized();
	if (!hasAdmin()) return noService();
	const r = await clearCart(user.id);
	return json({ ok: r.ok, lines: [] });
};
