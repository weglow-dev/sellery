import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { safeNext } from '@sellery/db/auth';
import { consolePath } from '@sellery/db/console-paths';

/**
 * POST /influencer/auth/signout — **콘솔 전용 사본**(docs/monorepo-migration.md 결정 15 · §5.1). 서버에서 로그아웃해 (httpOnly 일 수 있는) 세션 쿠키를 지운다. 303.
 * `?next=` 가 있으면(같은 오리진 상대 경로만 — safeNext) 그곳으로, 없거나 거부돼 "/" 이면 콘솔 로그인(`/influencer/login`) — "/" 는 고객 홈이라 콘솔 안에서 두 번 튄다.
 * 셸·apply·suspended·login(foreign) 의 `<form method="post">` 가 부른다 — SvelteKit 내장 CSRF(Origin 대조 · trustedOrigins) 가 다른 오리진의 POST 를 403 으로 막는다(§2.2).
 */
export const POST: RequestHandler = async ({ url, locals }) => {
	if (locals.supabase) await locals.supabase.auth.signOut();
	const nextRaw = url.searchParams.get('next');
	const next = nextRaw ? safeNext(nextRaw) : null;
	redirect(303, next && next !== '/' ? next : consolePath('seller', '/login'));
};
