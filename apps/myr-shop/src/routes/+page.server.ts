import type { PageServerLoad } from './$types';
import { creatorsOf } from '$lib/data';
import { listProducts } from '$lib/server/db';

/** 홈 — listed 상품 전부(최신순) + 크리에이터 목록(상품 수). 세션이 레이아웃에 실리므로 CDN 캐시 없음(SSR 기본) */
export const load: PageServerLoad = async () => {
	const { products, source } = await listProducts();
	return { products, creators: creatorsOf(products), source };
};
