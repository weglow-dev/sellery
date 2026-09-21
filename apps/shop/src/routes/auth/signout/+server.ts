import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { safeNext } from '@sellery/db/auth';

/**
 * POST /auth/signout — 서버에서 로그아웃해 (httpOnly 일 수 있는) 세션 쿠키를 지운다. 303 (app-plan §4.1 · web auth/signout/route.ts).
 * `?next=` 가 있으면(같은 오리진 상대 경로만 — safeNext) 그곳으로: 경로 모드 콘솔의 로그아웃 → `/influencer/login`. 없으면 고객 홈 `/`.
 * 버튼은 `<form method="post">`(SignOutButton) — SvelteKit 내장 CSRF 가 다른 오리진의 form POST 를 403 으로 막는다 (§2.2).
 * web 의 콘솔 호스트 분기(`consoleRoleOf`)는 경로 모드 전환으로 삭제됐다(결정 11).
 */
export const POST: RequestHandler = async ({ url, locals }) => {
	if (locals.supabase) await locals.supabase.auth.signOut();
	const nextRaw = url.searchParams.get('next');
	const next = nextRaw ? safeNext(nextRaw) : null;
	redirect(303, next && next !== '/' ? next : '/');
};
