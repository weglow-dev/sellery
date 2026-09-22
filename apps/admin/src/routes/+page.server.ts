import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { adminPath } from '$lib/server/admin';

/**
 * 루트 `/admin` → `/admin/home`(관리자 콘솔). 비로그인은 hooks 세션 게이트가, 로그인했지만 admin 이 아니면
 * `/home` 의 `requireAdmin()` 이 `/admin/login` 으로 보낸다.
 *
 * 2026-09-21~22 의 경과: `(demo)` 그룹 분리 직후에는 데모가 공개(결정 D)라 `/admin/demo` 로 보냈다.
 * 지금은 influencer·brand 와 같게 데모를 dev·`PUBLIC_DEMO=1` 로 제한했으므로(`(demo)/+layout.server.ts`)
 * 루트는 실서비스 콘솔이 받는다. 데모는 로컬에서 `/admin/demo` 로 직접 연다.
 */
export const load: PageServerLoad = () => {
	redirect(302, adminPath('/home'));
};
