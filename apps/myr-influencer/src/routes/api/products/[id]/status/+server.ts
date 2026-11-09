import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSetStatusAction } from '@sellery/myr-core/seller-products';
import { apiSeller } from '$lib/server/seller';
import { setSellerProductStatus } from '$lib/server/seller-products';

/**
 * 상태 바꾸기(0073) — 내 제품 메뉴: delete 임시저장 삭제만. 일시중지 · 다시 판매 · 판매 종료는 운영만(0082 · 0083 · BAD_ACTION).
 *   POST { action } → { ok, status } · { ok:false, code: NOT_FOUND | BAD_ACTION | WRONG_STATUS, status? }
 */
export const POST: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	const body = (await event.request.json().catch(() => null)) as { action?: unknown } | null;
	if (!isSetStatusAction(body?.action)) return json({ ok: false, code: 'BAD_ACTION' }, { status: 400 });
	if (!/^[0-9a-f-]{36}$/.test(event.params.id)) return json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
	const r = await setSellerProductStatus(seller.id, event.params.id, body.action);
	return json(r, { status: r.ok ? 200 : r.code === 'DB_ERROR' ? 500 : r.code === 'NOT_FOUND' ? 404 : 400 });
};
