import { json } from '@sveltejs/kit';
import { rateLimit } from '@sellery/myr-core/rate-limit';
import type { RequestHandler } from './$types';
import { hasAdmin } from '@sellery/myr-core/server/admin';
import { checkHandle, handleStatusOnly } from '$lib/server/invite';
import { previewTokenOf } from '$lib/server/invite-preview';
import { cleanHandleInput } from '$lib/signup-rules';

/**
 * 핸들 확인 — 가입 폼 핸들 칸을 **벗어날 때** 한 번(칠 때마다 묻지 않는다 · 같은 핸들은 화면이 기억한다).
 *   GET /invite/<토큰>/handle?h=<핸들> → { ok, handle, status: available | taken | reserved | bad } · 초대가 닫혔으면 { ok:false, code }
 * 유효한 초대 토큰이 있어야 답한다(핸들 목록을 긁어가지 못하게) · IP 레이트리밋. 최종 판정은 가입 때 RPC 가 다시 한다(경합).
 */
export const GET: RequestHandler = async ({ params, url, getClientAddress }) => {
	const headers = { 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' };
	if (!rateLimit(`invite-handle:${getClientAddress()}`, 60, 10 * 60 * 1000)) return json({ ok: false, code: 'RATE_LIMITED' }, { status: 429, headers });
	if (!hasAdmin()) return json({ ok: false, code: 'DB_ERROR' }, { status: 503, headers });
	const h = (url.searchParams.get('h') ?? '').slice(0, 64);
	// 미리보기 주소(dev · Preview) — 토큰 없이 실제 DB 핸들 규칙으로
	if (previewTokenOf(params.token)) {
		const status = await handleStatusOnly(h);
		return status ? json({ ok: true, handle: cleanHandleInput(h), status }, { headers }) : json({ ok: false, code: 'DB_ERROR' }, { status: 500, headers });
	}
	const r = await checkHandle(params.token, h);
	if (!r.ok) return json(r, { status: r.code === 'DB_ERROR' ? 500 : 410, headers });
	return json(r, { headers });
};
