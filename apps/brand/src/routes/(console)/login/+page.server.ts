import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { partnerRoleOf } from '@sellery/db/auth';
import { consoleNextOf, isBrandAccount, linkSellerIdOf } from '$lib/server/brand';
import { SITE_URL } from '$lib/server/db';

/**
 * 브랜드 콘솔 로그인 — 이메일/비밀번호 (apps/influencer `(console)/login` 의 브랜드 판 · docs/brand-console-plan.md §3 · §5).
 * hooks 세션 게이트의 착지(`/login?next=…`). 서버에서 `next` 를 정규화(`consoleNextOf` — 비었거나 거부되면 `/brand/home`)하고
 * 이미 브랜드 계정 세션이면 즉시 그곳으로. 브랜드가 아닌 세션(같은 오리진의 고객 카카오 세션 · **인플루언서 세션** = `foreign`)은 redirect 하지 않고
 * "다른 계정으로 로그인" 안내를 그린다 — requireBrand 가 foreign 을 `?switch=1` 로 여기 보내므로 redirect 하면 루프가 된다.
 * `?error=auth`(콜백 실패) · `?error=expired`(인증 링크 만료·재사용 — /brand/auth/confirm) 문구. 폼·Auth 호출은 +page.svelte(브라우저 클라이언트).
 */
const ERROR_TEXT: Record<string, string> = {
	auth: '로그인에 실패했어요. 잠시 후 다시 시도해주세요.',
	expired: '인증 링크가 만료됐거나 이미 사용됐어요. 이미 인증을 마쳤다면 로그인해주세요 — 아직 전이라면 가입 화면에서 메일을 다시 받을 수 있어요.'
};

export const load: PageServerLoad = async ({ url, locals }) => {
	const next = consoleNextOf(url.searchParams.get('next'));
	const { user } = await locals.safeGetSession();
	const foreign = user !== null && !isBrandAccount(user);
	if (user && !foreign) redirect(303, next);
	const foreignKind: 'seller' | 'customer' | null = !foreign ? null : partnerRoleOf(user) === 'seller' || (user && linkSellerIdOf(user) !== null) ? 'seller' : 'customer';

	const err = url.searchParams.get('error');
	const initialError = err ? (ERROR_TEXT[err] ?? ERROR_TEXT.auth) : null;
	return { next, foreign, foreignKind, foreignEmail: foreign ? (user?.email ?? null) : null, initialError, siteUrl: SITE_URL };
};
