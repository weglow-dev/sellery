import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * 콘솔 안의 미매치 경로를 셸 안의 `(console)/+error.svelte` 로 보낸다 (apps/influencer 와 동일 · docs/brand-console-plan.md §2).
 * 탭 5개(`/home` `/products` `/campaigns` `/orders` `/my`) 와 `/requests` `/cs` `/sales` `/settle` 은 정적 라우트가 먼저 잡는다(1~5단계) — 여기로 오는 건 오타 · 지워진 데모 경로.
 * 정적 라우트(`/home` · `/login` …)가 먼저 매치되므로 이 catch-all 은 나머지만 받는다. 없으면 SvelteKit 의 미매치 404 가 루트 +error.svelte(셸 없음)로 뜬다.
 */
export const load: PageServerLoad = () => {
	error(404, { message: '페이지를 찾을 수 없습니다' });
};
