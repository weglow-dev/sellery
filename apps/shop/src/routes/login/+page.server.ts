import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';
import { safeNext } from '@sellery/db/auth';

/**
 * /login — 카카오 로그인 (app-plan §4.1 · ux-spec §3.3 · web login/page.tsx 1:1 · docs/monorepo-migration.md §4.1).
 * 서버에서 먼저 `next` 를 safeNext 로 정규화하고, 이미 로그인이면 즉시 그곳으로 보낸다 (`/login?next=https://evil` 은 `/` 로).
 * 카카오 OAuth 시작·개발용 폼은 +page.svelte(브라우저 클라이언트). `?error=auth` 는 콜백 실패 표식.
 * 개발용 이메일 폼은 `PUBLIC_DEV_LOGIN=1` 이고 (로컬 dev 이거나 Vercel **Preview** 배포)일 때만 — Production 배포에서는 값이 있어도 절대 렌더하지 않는다.
 * (web 은 NODE_ENV 기준이라 Preview 에서도 숨겼지만, 카카오 provider 설정 전에 Preview 에서 결제 시나리오를 돌리려면 개발 계정 로그인이 필요하다 — S3 검증용.)
 * 값은 선택이라 `$env/dynamic/public`, `VERCEL_ENV` 는 Vercel 시스템 env(`$env/dynamic/private`).
 */
export const load: PageServerLoad = async ({ url, locals, setHeaders }) => {
	const next = safeNext(url.searchParams.get('next'));
	const { user } = await locals.safeGetSession();
	if (user) redirect(303, next);
	setHeaders({ 'cache-control': 'private, no-store' });
	return { next, authError: url.searchParams.get('error') === 'auth', devLogin: env.PUBLIC_DEV_LOGIN === '1' && (dev || privateEnv.VERCEL_ENV === 'preview') };
};
