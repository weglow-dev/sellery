import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GB_CODE_RE, groupbuyErrorMessage } from '@sellery/myr-core/groupbuy';
import { closeGroupbuy } from '$lib/server/groupbuy';
import { apiSeller } from '$lib/server/seller';

/**
 * 공구 지금 종료(0086) — 내 공구만. 끝난 뒤 링크로 들어온 고객은 기본가 · 이미 결제창을 연 고객은 그 결제 건의 공구가 그대로.
 *   POST → { ok, groupbuy } · { ok:false, code: NOT_FOUND | ALREADY_ENDED, message }
 */
export const POST: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	const code = event.params.code.toLowerCase();
	if (!GB_CODE_RE.test(code)) return json({ ok: false, code: 'NOT_FOUND', message: groupbuyErrorMessage('NOT_FOUND') }, { status: 404 });
	const r = await closeGroupbuy(seller.id, code);
	if (r.ok) return json(r);
	return json({ ...r, message: groupbuyErrorMessage(r.code) }, { status: r.code === 'DB_ERROR' ? 500 : r.code === 'NOT_FOUND' ? 404 : 409 });
};
