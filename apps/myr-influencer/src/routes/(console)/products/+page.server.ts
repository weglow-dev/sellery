import type { PageServerLoad } from './$types';
import { productFromRow } from '$lib/product-row';
import { myProducts } from '$lib/server/seller-products';

/** 내 제품 — 로그인한 크리에이터의 상품(0071 · 0072 · 삭제 제외 · 최근 수정순). 크리에이터는 세션에서만(결정 3) · 게이트와 조회를 동시에(lib/server/seller-products) */
export const load: PageServerLoad = async (event) => {
	const { rows } = await myProducts(event);
	const now = new Date();
	return { products: rows.map((r) => productFromRow(r, now)) };
};
