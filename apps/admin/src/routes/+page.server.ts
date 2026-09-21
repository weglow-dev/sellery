import { redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import type { PageServerLoad } from './$types';

/**
 * 루트 `/admin` → `/admin/demo` (임시).
 *
 * `(demo)` 그룹 분리로 데모 대시보드가 `/admin/demo` 로 옮겨졌는데, `sellery.life/admin` 은 데모 쇼케이스로
 * 공개돼 있다(docs/monorepo-migration.md 결정 D). 이 리다이렉트가 없으면 그 주소가 404 가 된다.
 * 실서비스 관리자 홈이 루트를 차지하는 PR(인증 게이트)에서 **삭제한다** — `(demo)` 를 지울 때가 아니라 그때다.
 *
 * `(demo)/+layout.ts` 의 `ssr = false` 는 그 그룹에만 걸리므로 이 파일은 서버에서 돈다(`@sellery/core` 를 import 하지 않는다).
 */
export const load: PageServerLoad = () => {
	redirect(302, `${base}/demo`);
};
