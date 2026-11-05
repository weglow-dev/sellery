import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireSeller } from '$lib/server/seller';
import { getSellerProduct } from '$lib/server/seller-products';

/** 상품 등록 에디터 — `?id=<상품>` 이면 내 상품(임시저장 · 반려)을 불러와 이어 쓴다(0073). 그 밖의 상태 · 남의 상품이면 내 제품으로 */
export const load: PageServerLoad = async (event) => {
	const seller = await requireSeller(event);
	const id = event.url.searchParams.get('id');
	if (!id) return { product: null };
	const product = /^[0-9a-f-]{36}$/.test(id) ? await getSellerProduct(seller.id, id) : null;
	if (!product || (product.status !== 'draft' && product.status !== 'rejected')) redirect(303, '/products');
	return { product };
};
