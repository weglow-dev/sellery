import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { groupbuyErrorMessage, parseGroupbuyBody } from '@sellery/myr-core/groupbuy';
import { createGroupbuy } from '$lib/server/groupbuy';
import { apiSeller } from '$lib/server/seller';

/**
 * 공구 링크 만들기(0086) — 내 제품 → 공구 링크. 운영 승인 없음 · 상품당 진행 중이거나 예정된 공구 하나.
 *   POST { pct, startsAt, endsAt(ISO) } → { ok, groupbuy } · { ok:false, code: NOT_FOUND | NOT_LISTED | SOLD_OUT | BAD_PCT | BAD_PERIOD | ALREADY_OPEN, message }
 *   할인율 범위는 서버(0099 myr_groupbuy_pct_ok)가 정한다 — BAD_PCT 문구는 서버가 준 범위로.
 *   시작이 지났으면 서버가 지금으로 당긴다.
 */
export const POST: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	if (!/^[0-9a-f-]{36}$/.test(event.params.id)) return json({ ok: false, code: 'NOT_FOUND', message: groupbuyErrorMessage('NOT_FOUND') }, { status: 404 });
	const body = parseGroupbuyBody(await event.request.json().catch(() => null));
	if (!body) return json({ ok: false, code: 'BAD_BODY', message: '할인율 · 기간을 다시 확인해주세요' }, { status: 400 });
	const r = await createGroupbuy(seller.id, event.params.id, body);
	if (r.ok) return json(r);
	const status = r.code === 'DB_ERROR' ? 500 : r.code === 'NOT_FOUND' ? 404 : r.code === 'ALREADY_OPEN' ? 409 : 400;
	return json({ ...r, message: groupbuyErrorMessage(r.code, r.range) }, { status });
};
