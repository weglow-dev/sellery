import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { consolePath } from '@sellery/db/console-paths';
import { SITE_URL } from '$lib/server/db';

/**
 * 인플루언서 가입 — web (public)/signup/page.tsx 1:1 (docs/inf-console-plan.md §4.1 · docs/monorepo-migration.md §5.1).
 * 로그인 상태면 홈으로. 이용약관·개인정보처리방침은 고객 사이트의 절대 URL(`PUBLIC_SITE_URL`) — 콘솔 Preview 오리진에는 그 페이지가 없다.
 * 폼·signUp 호출은 +page.svelte(브라우저 클라이언트).
 */
export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (user) redirect(303, consolePath('seller', '/home'));
	return { termsUrl: `${SITE_URL}/terms`, privacyUrl: `${SITE_URL}/privacy` };
};
