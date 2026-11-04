import type { RequestHandler } from './$types';
import { env as pub } from '$env/dynamic/public';
import { robotsTxt, siteOrigin } from '$lib/seo';

/** /robots.txt — 공개 페이지(홈 · 카테고리 · 상품)는 허용, 개인화 · 결제 · 주문 · 문의 · 로그인 · API 는 제외(lib/seo.ts NOINDEX_PREFIXES) + sitemap 주소.
 *  오리진이 환경변수라 prerender 하지 않는다(도메인이 바뀌면 값만 교체). 하루 캐시. */
export const GET: RequestHandler = () =>
	new Response(robotsTxt(siteOrigin(pub.PUBLIC_SITE_URL)), {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' }
	});
