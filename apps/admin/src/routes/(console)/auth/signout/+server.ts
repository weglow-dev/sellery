import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { safeNext } from '@sellery/db/auth';
import { adminPath } from '$lib/server/admin';

/**
 * POST /admin/auth/signout — 콘솔 전용 사본(apps/brand `(console)/auth/signout` 과 동일 · monorepo-migration.md 결정 15).
 * 서버에서 로그아웃해 세션 쿠키를 지운다. 303. `?next=` 가 있으면(같은 오리진 상대 경로만 — safeNext) 그곳으로,
 * 없거나 거부돼 "/" 이면 관리자 로그인(`/admin/login`) — "/" 는 고객 홈이라 콘솔 안에서 두 번 튄다.
 * 로그인 화면의 `foreign` 안내가 부른다 — SvelteKit 내장 CSRF(Origin 대조)가 다른 오리진의 POST 를 403 으로 막으므로 앱마다 사본이 필요하다.
 */
export const POST: RequestHandler = async ({ url, locals }) => {
	if (locals.supabase) await locals.supabase.auth.signOut();
	const nextRaw = url.searchParams.get('next');
	const next = nextRaw ? safeNext(nextRaw) : null;
	redirect(303, next && next !== '/' ? next : adminPath('/login'));
};
