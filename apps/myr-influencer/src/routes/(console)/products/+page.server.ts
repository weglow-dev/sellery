import type { PageServerLoad } from './$types';
import { productFromRow } from '$lib/product-row';
import { requireSeller } from '$lib/server/seller';
import { listSellerProducts } from '$lib/server/seller-products';

/** 내 제품 — 로그인한 크리에이터의 상품(0071 myr_app_seller_products · 삭제 제외 · 최근 수정순). 크리에이터 id 는 세션에서만(결정 3) */
export const load: PageServerLoad = async (event) => {
	const seller = await requireSeller(event);
	const now = new Date();
	return { products: (await listSellerProducts(seller.id)).map((r) => productFromRow(r, now)) };
};
