import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getProductCard } from '$lib/server/db';

/** 상품 페이지 `/p/<code>` — `myr_product_card(code)`. listed 가 아니면 RPC 가 null → 404 */
export const load: PageServerLoad = async ({ params, setHeaders }) => {
	const card = await getProductCard(params.code.toLowerCase());
	if (!card) error(404, { message: '제품을 찾을 수 없습니다' });
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60' });
	return card;
};
