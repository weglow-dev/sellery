import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { adminNextOf, getAdminContext } from '$lib/server/admin';
import { SITE_URL } from '$lib/server/db';

/**
 * 관리자 콘솔 로그인 — 이메일/비밀번호 (apps/brand `(console)/login` 의 관리자 판).
 * hooks 세션 게이트·`requireAdmin()` 의 착지(`/login?next=…`). 서버에서 `next` 를 정규화(`adminNextOf` — 비었거나 거부되면 `/admin/home`)하고
 * 이미 관리자 세션이면 즉시 그곳으로. 관리자가 아닌 세션(같은 오리진의 고객 카카오 · 인플루언서 · 브랜드 = `foreign`)은 redirect 하지 않고
 * "다른 계정으로 로그인" 안내를 그린다 — requireAdmin 이 foreign 을 `?switch=1` 로 여기 보내므로 redirect 하면 루프가 된다.
 *
 * 가입 화면이 없다 — 관리자 계정은 `profiles.role` 수동 승격으로만 만든다(docs/deploy.md §5.6).
 * 비밀번호 재설정(`/password`)도 아직 없다 — 잊으면 대시보드에서 재설정하거나 `dev-user.mjs` 로 다시 만든다.
 */
const ERROR_TEXT: Record<string, string> = {
	auth: '로그인에 실패했어요. 잠시 후 다시 시도해주세요.'
};

export const load: PageServerLoad = async (event) => {
	const next = adminNextOf(event.url.searchParams.get('next'));
	const ctx = await getAdminContext(event);
	if (ctx.state === 'ok') redirect(303, next);

	const err = event.url.searchParams.get('error');
	return {
		next,
		foreign: ctx.state === 'foreign',
		foreignRole: ctx.state === 'foreign' ? ctx.role : null,
		foreignEmail: ctx.state === 'foreign' ? (ctx.user.email ?? null) : null,
		initialError: err ? (ERROR_TEXT[err] ?? ERROR_TEXT.auth) : null,
		siteUrl: SITE_URL
	};
};
