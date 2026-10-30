import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseMergeBody } from '$lib/cart';
import { hasAdmin } from '$lib/server/admin';
import { getCart, mergeCart } from '$lib/server/cart';

/** POST /api/cart/merge { lines: [{ code, qty }] } — 로그인 직후 브라우저에 남은 비회원 장바구니를 계정에 합친다(0057 `myr_cart_merge` · 줄마다 더하기 · 상한 9).
 *  → { ok, merged, skipped, lines }. 살 수 없는 상품은 건너뛴다(skipped). 세션 없으면 401. */
export const POST: RequestHandler = async ({ locals, request }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return json({ error: 'UNAUTHORIZED' }, { status: 401 });
	if (!hasAdmin()) {
		console.error('[api/cart/merge] SUPABASE_SERVICE_ROLE_KEY 없음');
		return json({ error: 'NO_SERVICE_KEY' }, { status: 503 });
	}
	const lines = parseMergeBody(await request.json().catch(() => null));
	if (!lines) return json({ ok: false, code: 'BAD_BODY' }, { status: 400 });
	const r = lines.length ? await mergeCart(user.id, lines) : { ok: true, merged: 0, skipped: 0 };
	if (!r.ok) return json({ ok: false, code: r.code }, { status: 400 });
	return json({ ok: true, merged: r.merged ?? 0, skipped: r.skipped ?? 0, lines: await getCart(user.id) });
};
