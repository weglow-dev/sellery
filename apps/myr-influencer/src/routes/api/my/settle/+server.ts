import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseSettleBody, settleSaveMessage } from '@sellery/myr-core/settle-info';
import { saveSettleInfoOfUser } from '$lib/server/settle-info';
import { apiSeller } from '$lib/server/seller';

/**
 * 사업자 · 정산 정보 저장(9번 · 0085) — 내 정보 `/my` · 초대 가입 2단계가 부른다.
 *   POST { company, ceo, bizNo?, bank, account?, holder } → { ok, recheck, info } · 실패 { ok:false, code, field?, message }
 *   bizNo · account 가 비면 저장된 값 그대로(화면은 가린 값만 가진다). 칸 규칙은 RPC 가 다시 본다.
 * 크리에이터 · 계정은 세션에서만(결정 3).
 */
export const POST: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	const { user } = await event.locals.safeGetSession();
	if (!user) return json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
	const body = parseSettleBody(await event.request.json().catch(() => null));
	if (!body) return json({ ok: false, code: 'BAD_REQUEST', ...settleSaveMessage('BAD_REQUEST') }, { status: 400 });
	const r = await saveSettleInfoOfUser(user.id, body);
	if (!r.ok) return json({ ok: false, code: r.code, ...settleSaveMessage(r.code) }, { status: r.code === 'DB_ERROR' ? 500 : r.code === 'NOT_FOUND' ? 404 : 400 });
	return json(r);
};
