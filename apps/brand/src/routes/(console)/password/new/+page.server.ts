import type { PageServerLoad } from './$types';

/**
 * 새 비밀번호 — apps/influencer `(console)/password/new` 와 동일.
 * `/brand/auth/confirm`(type=recovery · invite) 이 세션을 만든 뒤 착지. 공개 경로지만 세션이 있어야 `updateUser({ password })` 가 된다 — 없으면 재요청 안내.
 * 게이트(`requireBrand`)는 두지 않는다: 초대 계정(`invite-brand`)은 auth/confirm 이 시드 행에 연결한 뒤 여기서 비밀번호를 정하고 /home 으로 간다.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	return { user: user ? { email: user.email ?? null } : null };
};
