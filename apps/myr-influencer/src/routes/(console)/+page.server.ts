import type { PageServerLoad } from './$types';
import { productFromRow } from '$lib/product-row';
import { homeProductCounts } from '$lib/rules';
import { requireSeller } from '$lib/server/seller';
import { listSellerProducts } from '$lib/server/seller-products';

/** 홈 — "판매 중 제품" 카드 숫자만 서버 값(0071). 정산 예정 · 주문 · 7일 판매는 실적 RPC(8번) 전까지 목 */
export const load: PageServerLoad = async (event) => {
	const seller = await requireSeller(event);
	return { productCounts: homeProductCounts((await listSellerProducts(seller.id)).map((r) => productFromRow(r))) };
};
