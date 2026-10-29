import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { safeNext } from '$lib/auth';

/**
 * GET /auth/callback — 카카오 OAuth 콜백 (apps/shop auth/callback 에서 파트너 분기를 뺀 것).
 * Supabase 가 `?code=…&next=…` 로 보낸다 → exchangeCodeForSession(code) → 세션 쿠키 → 302 safeNext(next) + ?welcome=1.
 * 실패 → /login?error=auth. `customers` 행 보장은 service role 이 필요해 S4 체크아웃(/api/checkout) 이 한다 — 여기서는 만들지 않는다.
 * `redirect()` 는 throw 다 — try 밖에서 부른다.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const code = url.searchParams.get('code');
	const next = safeNext(url.searchParams.get('next'));

	let dest: string | null = null;
	if (code && locals.supabase) {
		const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			const d = new URL(next, url.origin);
			d.searchParams.set('welcome', '1');
			dest = d.pathname + d.search + d.hash;
		} else {
			console.error('[auth/callback] exchange failed:', error.message);
		}
	}

	redirect(302, dest ?? '/login?error=auth');
};
