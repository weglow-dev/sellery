import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { CS_BODY_MAX, CS_CODE_RE } from '@sellery/myr-core/cs-rules';
import { answerSellerCs } from '$lib/server/cs';
import { apiSeller } from '$lib/server/seller';

/**
 * 고객 문의 답변 등록(5번 · 0063 reply) — CS 관리 › 고객 문의 상세. 답변 완료 + 고객 답변 메일. 답변 수정은 없다(2026-11-05 대표 결정).
 *   POST { body } → { ok, mailed } · { ok:false, code: NOT_FOUND | CLOSED | BAD_BODY | DB_ERROR }
 * 크리에이터 · 계정은 세션에서만(결정 3) — 내 상품 문의인지는 RPC 가 본다.
 */
export const POST: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	const { user } = await event.locals.safeGetSession();
	if (!user) return json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
	const code = event.params.code;
	if (!CS_CODE_RE.test(code)) return json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
	const b = (await event.request.json().catch(() => null)) as { body?: unknown } | null;
	if (!b || typeof b.body !== 'string' || b.body.length > CS_BODY_MAX * 2) return json({ ok: false, code: 'BAD_BODY' }, { status: 400 });
	const r = await answerSellerCs(seller.id, user.id, code, b.body);
	if (r.ok) return json({ ok: true, mailed: r.mailed });
	return json(r, { status: r.code === 'DB_ERROR' ? 500 : r.code === 'NOT_FOUND' ? 404 : r.code === 'CLOSED' ? 409 : 400 });
};
