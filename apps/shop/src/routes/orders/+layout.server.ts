import type { LayoutServerLoad } from './$types';

/**
 * /orders/** — 비회원 주문 조회·상세 (0021). 주문번호·연락처·조회 토큰 쿠키를 다루므로 캐시하지 않는다 — `cache-control: private, no-store`
 * (account/+layout.server.ts 와 같은 규칙). 검색 노출 금지는 각 페이지 robots 메타 + robots.txt Disallow `/orders` 이중.
 */
export const load: LayoutServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	return {};
};
