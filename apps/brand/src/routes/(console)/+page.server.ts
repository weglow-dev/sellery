import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { consolePath } from '@sellery/db/console-paths';

/**
 * 콘솔 루트 `/brand` → `/brand/home` (apps/influencer 와 동일). 미로그인은 hooks 세션 게이트가 이미 `/brand/login?next=/brand` 로 보냈다.
 * 데모 홈은 `/brand/demo`((demo) 그룹 · dev 또는 PUBLIC_DEMO=1).
 */
export const load: PageServerLoad = () => {
	redirect(303, consolePath('brand', '/home'));
};
