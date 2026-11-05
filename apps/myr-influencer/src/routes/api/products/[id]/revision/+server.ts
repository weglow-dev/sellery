import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { SellerProductPayload } from '@sellery/myr-core/seller-products';
import { apiSeller } from '$lib/server/seller';
import { submitSellerProductRevision } from '$lib/server/seller-products';

/**
 * 판매 중 · 일시중지 상품의 수정 심사 요청(0074 · docs/myr.md §4.2.1 4-2) — 수정본으로 보관, 운영팀이 승인하면 샵에 반영.
 *   POST { payload } → { ok, revisionId } · { ok:false, code: NOT_FOUND | NOT_REVISABLE | REVISION_PENDING | NO_CHANGE | INVALID_INPUT | BAD_IMAGE, field?, status? }
 * 크리에이터는 세션에서만(결정 3) — 내 상품인지 · 고칠 수 있는 상태인지 · 입력 검사는 RPC 가 정답.
 */
export const POST: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	const body = (await event.request.json().catch(() => null)) as { payload?: unknown } | null;
	if (!body || typeof body.payload !== 'object' || body.payload === null) return json({ ok: false, code: 'BAD_REQUEST' }, { status: 400 });
	if (!/^[0-9a-f-]{36}$/.test(event.params.id)) return json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
	const r = await submitSellerProductRevision(seller.id, event.params.id, body.payload as SellerProductPayload);
	return json(r, { status: r.ok ? 200 : r.code === 'DB_ERROR' ? 500 : r.code === 'NOT_FOUND' ? 404 : r.code === 'REVISION_PENDING' || r.code === 'NOT_REVISABLE' ? 409 : 400 });
};
