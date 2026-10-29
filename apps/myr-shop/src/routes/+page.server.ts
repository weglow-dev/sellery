import type { PageServerLoad } from './$types';
import { creatorsOf } from '$lib/data';
import { listProducts } from '$lib/server/db';

/** 홈 — listed 상품 전부(최신순) + 크리에이터 목록(상품 수). 60초 CDN 캐시 가능하지만 S3(세션) 전까지만 — 로그인이 붙으면 private 로 */
export const load: PageServerLoad = async ({ setHeaders }) => {
	const { products, source } = await listProducts();
	setHeaders({ 'cache-control': 'public, max-age=0, s-maxage=60' });
	return { products, creators: creatorsOf(products), source };
};
