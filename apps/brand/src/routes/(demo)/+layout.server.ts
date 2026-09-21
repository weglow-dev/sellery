import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import type { LayoutServerLoad } from './$types';
import { demoEnabled } from '$lib/demo';

/**
 * `(demo)` 그룹 — 프로토타입 브랜드 데모 화면은 dev 서버 또는 `PUBLIC_DEMO=1` 에서만 (docs/brand-console-plan.md §2 · monorepo-migration.md 결정 C).
 * 프로덕션(sellery.life/brand/*)에서는 `PUBLIC_DEMO` 를 지우는 순간 404. `+layout.ts` 의 `ssr = false` 와 같이 쓴다 — 서버 load 는 그래도 돌므로 여기서 막는다.
 * hooks.server.ts 의 세션 게이트도 같은 조건(`demoEnabled`)일 때만 데모 경로를 예외로 둔다.
 */
export const load: LayoutServerLoad = () => {
	if (!demoEnabled(dev, env.PUBLIC_DEMO)) error(404, { message: '데모 화면은 프로덕션에서 열리지 않습니다' });
	return {};
};
