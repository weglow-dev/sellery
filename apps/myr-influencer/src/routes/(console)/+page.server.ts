import type { PageServerLoad } from './$types';
import { productFromRow } from '$lib/product-row';
import { homeProductCounts } from '$lib/rules';
import { myProducts } from '$lib/server/seller-products';

/** 홈 — "판매 중 제품" 카드 숫자만 서버 값(0071 · 0072 · 게이트와 조회를 동시에). 정산 예정 · 주문 · 7일 판매는 실적 RPC(8번) 전까지 목 */
export const load: PageServerLoad = async (event) => {
	const { rows } = await myProducts(event);
	return { productCounts: homeProductCounts(rows.map((r) => productFromRow(r))) };
};
