import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * 콘솔 안의 미매치 경로를 셸 안의 `(console)/+error.svelte` 로 보낸다 (apps/influencer 와 동일 · docs/brand-console-plan.md §2).
 * 아직 없는 탭 화면(`/orders` `/my` — 4·5단계)도 여기로 온다 — 하단 탭은 `disabled` 라 링크가 아니지만 주소를 직접 치면 셸 안 404. 2단계 화면(`/products` `/requests` `/campaigns`)은 정적 라우트가 먼저 잡는다.
 * 정적 라우트(`/home` · `/login` …)가 먼저 매치되므로 이 catch-all 은 나머지만 받는다. 없으면 SvelteKit 의 미매치 404 가 루트 +error.svelte(셸 없음)로 뜬다.
 */
export const load: PageServerLoad = () => {
	error(404, { message: '페이지를 찾을 수 없습니다' });
};
