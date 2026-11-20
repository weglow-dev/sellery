import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { apiSeller } from '$lib/server/seller';
import { sendPartnerMessageOfUser } from '$lib/server/partner-talk';

/**
 * 파트너팀 톡 보내기(0125) — POST { body } → { ok, message } · 실패 { ok:false, code }.
 * 크리에이터는 세션에서만(결정 3) — 본문 형식 · 너무 빠르게는 서버 RPC 가 판정한다(BAD_BODY · TOO_FAST).
 */
export const POST: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	const { user } = await event.locals.safeGetSession();
	if (!user) return json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
	const raw = (await event.request.json().catch(() => null)) as { body?: unknown } | null;
	const body = typeof raw?.body === 'string' ? raw.body : '';
	const r = await sendPartnerMessageOfUser(user.id, body);
	if (r.ok) return json(r);
	return json(r, { status: r.code === 'DB_ERROR' ? 500 : r.code === 'TOO_FAST' ? 429 : r.code === 'NOT_FOUND' ? 404 : 400 });
};
