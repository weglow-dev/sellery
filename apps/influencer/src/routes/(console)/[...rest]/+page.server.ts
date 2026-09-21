import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * 콘솔 안의 미매치 경로를 셸 안의 `(console)/+error.svelte` 로 보낸다 (3단계에서 /products /campaigns 가 생겼고 /sales 는 5단계 — 탭은 비활성)
 * (web influencer/[...rest]/page.tsx 1:1 · docs/monorepo-migration.md §5.1 "콘솔 404"). 정적 라우트(`/home` · `/login` …)가 먼저 매치되므로
 * 이 catch-all 은 나머지만 받는다. 없으면 SvelteKit 의 미매치 404 가 루트 +error.svelte(셸 없음)로 뜬다.
 */
export const load: PageServerLoad = () => {
	error(404, { message: '페이지를 찾을 수 없습니다' });
};
