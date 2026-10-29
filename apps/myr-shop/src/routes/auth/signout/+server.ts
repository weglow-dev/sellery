import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { safeNext } from '$lib/auth';

/** POST /auth/signout — 서버에서 로그아웃해 세션 쿠키를 지운다 → 303. 버튼은 `<form method="post">` — SvelteKit 내장 CSRF 가 다른 오리진의 form POST 를 막는다. */
export const POST: RequestHandler = async ({ url, locals }) => {
	if (locals.supabase) await locals.supabase.auth.signOut();
	const nextRaw = url.searchParams.get('next');
	const next = nextRaw ? safeNext(nextRaw) : null;
	redirect(303, next && next !== '/' ? next : '/');
};
