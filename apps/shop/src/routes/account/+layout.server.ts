import type { LayoutServerLoad } from './$types';

/**
 * /account/** — 본인 주문·계정 화면 (web account/layout.tsx). 세션·주문을 읽으므로 캐시하지 않는다 — `cache-control: private, no-store`
 * (docs/monorepo-migration.md §2.3 · §8.2 "캐시 헤더"). 검색 노출 금지는 각 페이지의 `<svelte:head>` robots 메타(+ robots.txt disallow 이중).
 */
export const load: LayoutServerLoad = async ({ setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	return {};
};
