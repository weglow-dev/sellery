import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';
import { safeNext } from '$lib/auth';

/** /login — 카카오 로그인 (apps/shop login 과 같은 규칙). `next` 를 safeNext 로 정규화하고, 이미 로그인이면 그곳으로. 캐시 헤더는 레이아웃(+layout.server.ts)이 한 번만 붙인다.
 *  개발용 이메일 폼은 `PUBLIC_DEV_LOGIN=1` 이고 (로컬 dev 이거나 Vercel Preview) 일 때만 — Production 에서는 값이 있어도 렌더하지 않는다. */
export const load: PageServerLoad = async ({ url, locals }) => {
	const next = safeNext(url.searchParams.get('next'));
	const { user } = await locals.safeGetSession();
	if (user) redirect(303, next);
	return { next, authError: url.searchParams.get('error') === 'auth', devLogin: env.PUBLIC_DEV_LOGIN === '1' && (dev || privateEnv.VERCEL_ENV === 'preview') };
};
