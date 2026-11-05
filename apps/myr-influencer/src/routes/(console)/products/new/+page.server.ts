import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireSeller } from '$lib/server/seller';
import { getSellerProduct } from '$lib/server/seller-products';

/**
 * 상품 등록 에디터 — `?id=<상품>` 이면 내 상품을 불러온다(0073 · 0074).
 *   임시저장 · 반려 → mode 'new'(이어 쓰기 · 다시 심사 요청)
 *   판매 중 · 일시중지 → mode 'edit'(수정 심사 · 4-2) — 수정본이 반려됐으면 그 내용(revision)으로 이어서 고친다 · 심사 중이면 내 제품으로
 *   그 밖의 상태(심사 중 · 종료) · 남의 상품 → 내 제품으로
 */
export const load: PageServerLoad = async (event) => {
	const seller = await requireSeller(event);
	const id = event.url.searchParams.get('id');
	if (!id) return { product: null, revision: null, mode: 'new' as const };
	const found = /^[0-9a-f-]{36}$/.test(id) ? await getSellerProduct(seller.id, id) : null;
	if (!found) redirect(303, '/products');
	const { product, revision } = found;
	if (product.status === 'draft' || product.status === 'rejected') return { product, revision: null, mode: 'new' as const };
	if ((product.status === 'listed' || product.status === 'paused') && revision?.status !== 'pending') return { product, revision, mode: 'edit' as const };
	redirect(303, '/products');
};
