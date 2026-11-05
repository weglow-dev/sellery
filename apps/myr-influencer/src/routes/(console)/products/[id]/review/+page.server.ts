import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { rejectItemsOf } from '$lib/product-review';
import { requireSeller } from '$lib/server/seller';
import { getSellerProduct } from '$lib/server/seller-products';

/**
 * 심사 결과(시안 "MYR Influencer Admin" · "… PC" REJECT DETAIL · 0074) — 반려 · 수정 반려된 내 상품의 운영팀 의견.
 *   상품 반려(status rejected) → kind 'new' · 의견은 상품의 reject_items
 *   판매 중 · 일시중지 + 가장 최근 수정본이 반려 → kind 'rev' · 의견은 수정본의 reject_items(샵은 지금 내용 그대로)
 *   그 밖 · 남의 상품 → 내 제품으로. 크리에이터는 세션에서만(결정 3).
 */
export const load: PageServerLoad = async (event) => {
	const seller = await requireSeller(event);
	const found = /^[0-9a-f-]{36}$/.test(event.params.id) ? await getSellerProduct(seller.id, event.params.id) : null;
	if (!found) redirect(303, '/products');
	const { product: p, revision } = found;
	const card = { id: p.id, name: p.name || '이름 없는 제품', price: p.price, tile: p.tile, icon: p.icon, thumbUrl: p.image_urls[0] ?? null };
	if (p.status === 'rejected') return { kind: 'new' as const, product: card, items: rejectItemsOf(p.rejectItems, p.rejectReason), reviewedAt: p.reviewedAt };
	if ((p.status === 'listed' || p.status === 'paused') && revision?.status === 'rejected')
		return { kind: 'rev' as const, product: card, items: rejectItemsOf(revision.rejectItems, revision.rejectReason), reviewedAt: revision.reviewedAt };
	redirect(303, '/products');
};
