import type { RequestHandler } from './$types';
import { env as pub } from '$env/dynamic/public';
import { siteOrigin, sitemapPaths, sitemapXml } from '$lib/seo';
import { listProducts } from '$lib/server/db';

/** /sitemap.xml — 홈 · 카테고리 · 크리에이터 목록 · 판매 중(listed) 상품. 상품은 `myr_home_products`(홈과 같은 RPC · 판매 중만).
 *  RPC 가 실패하거나 목 데이터일 때는 상품 없이 고정 경로만 낸다(가짜 상품 주소를 검색엔진에 알리지 않는다). 1시간 캐시. */
export const GET: RequestHandler = async () => {
	const { products, source } = await listProducts();
	const paths = sitemapPaths(source === 'db' ? products : []);
	return new Response(sitemapXml(siteOrigin(pub.PUBLIC_SITE_URL), paths), {
		headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' }
	});
};
