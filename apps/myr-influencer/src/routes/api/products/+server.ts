import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { SellerProductPayload } from '@sellery/myr-core/seller-products';
import { apiSeller } from '$lib/server/seller';
import { saveSellerProduct } from '$lib/server/seller-products';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * 상품 저장(0073 · docs/myr.md §4.2.1 4-1) — 에디터의 임시저장 · 심사 요청.
 *   POST { id?: uuid, payload, submit } → { ok, id, code, status } · { ok:false, code, field?, status? }
 * 크리에이터는 세션에서만(결정 3 · 본문의 id 는 "어느 상품" 일 뿐 — 내 상품인지는 RPC 가 본다). 입력 검사 · 필수 · 이미지 폴더는 RPC 가 정답.
 */
export const POST: RequestHandler = async (event) => {
	const seller = await apiSeller(event);
	if (seller instanceof Response) return seller;
	const body = (await event.request.json().catch(() => null)) as { id?: unknown; payload?: unknown; submit?: unknown } | null;
	if (!body || typeof body.payload !== 'object' || body.payload === null) return json({ ok: false, code: 'BAD_REQUEST' }, { status: 400 });
	const id = typeof body.id === 'string' && UUID_RE.test(body.id) ? body.id : null;
	if (body.id != null && !id) return json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
	const r = await saveSellerProduct(seller.id, id, body.payload as SellerProductPayload, body.submit === true);
	return json(r, { status: r.ok ? 200 : r.code === 'DB_ERROR' ? 500 : r.code === 'NOT_FOUND' ? 404 : 400 });
};
