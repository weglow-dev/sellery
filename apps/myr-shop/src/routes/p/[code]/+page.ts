import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { productByCode } from '$lib/data';

/** 상품 페이지 `/p/<code>` — 목 데이터에서 찾는다. M4 에서 `myr_product_card(code)` 로 바뀐다 */
export const load: PageLoad = ({ params }) => {
	const product = productByCode(params.code);
	if (!product) error(404, { message: '제품을 찾을 수 없습니다' });
	return { product };
};
