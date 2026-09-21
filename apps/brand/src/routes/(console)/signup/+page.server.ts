import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { consolePath } from '@sellery/db/console-paths';
import { SITE_URL } from '$lib/server/db';

/**
 * 브랜드 입점 신청(가입) — apps/influencer `(console)/signup` 의 브랜드 판 (docs/brand-console-plan.md §3 결정 4: 인증 즉시 입장 · 수동 심사 없음).
 * 로그인 상태면 홈으로. 이용약관·개인정보처리방침은 고객 사이트의 절대 URL(`PUBLIC_SITE_URL`) — 콘솔 Preview 오리진에는 그 페이지가 없다.
 * 폼·signUp 호출은 +page.svelte(브라우저 클라이언트).
 */
export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (user) redirect(303, consolePath('brand', '/home'));
	return { termsUrl: `${SITE_URL}/terms`, privacyUrl: `${SITE_URL}/privacy` };
};
