import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { consolePath } from '@sellery/db/console-paths';

/**
 * 콘솔 루트 `/influencer` → `/influencer/home` (web (partner)/influencer/page.tsx · docs/monorepo-migration.md §5.1).
 * 미로그인은 hooks 세션 게이트가 이미 `/influencer/login?next=/influencer` 로 보냈다. 경로 모드 고정(결정 11).
 */
export const load: PageServerLoad = () => {
	redirect(303, consolePath('seller', '/home'));
};
