import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { SESSION_ONLY_COOKIE } from '$lib/console-auth';

/** POST /auth/signout — 로그아웃 후 로그인 화면. 폼 POST 만 받는다(SvelteKit 이 다른 출처의 폼 POST 를 막는다 · GET 링크로 로그아웃되지 않게) */
export const POST: RequestHandler = async ({ locals, cookies }) => {
	if (locals.supabase) {
		const { error } = await locals.supabase.auth.signOut();
		if (error) console.warn('[auth/signout]', error.message);
	}
	cookies.delete(SESSION_ONLY_COOKIE, { path: '/' });
	redirect(303, '/login');
};
