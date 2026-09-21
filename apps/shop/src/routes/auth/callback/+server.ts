import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isPartnerUser, safeNext } from '@sellery/db/auth';
import { consolePath } from '@sellery/db/console-paths';
import { createAdminClient, createSellerFromSignup, ensureCustomer, linkSellerIdOf } from '$lib/server/db';

/**
 * GET /auth/callback — OAuth 콜백 (app-plan §4.1 · web auth/callback/route.ts 1:1 · docs/monorepo-migration.md §2.2).
 * Supabase (카카오 뒤) 가 `?code=…&next=…` 로 보낸다.
 *   exchangeCodeForSession(code) → 세션 쿠키 → ensureCustomer(best-effort) → 302 safeNext(next) + ?welcome=1
 * 실패 → /login?error=auth. glo 콜백의 `${origin}${next}` 무검증 리다이렉트는 복사하지 않는다.
 * `?welcome=1` 은 목적지에서 토스트 "{name}님, 카카오로 로그인했어요" 를 1회 띄우기 위한 표식 (ux-spec §3.3).
 *
 * 파트너 분기(docs/inf-console-plan.md §4.2 · §4.3): `user_metadata.partner_role`(비신뢰 값 — 무해한 분기에만) 또는
 * `app_metadata.link_seller_id` 가 있으면 `ensureCustomer` 를 건너뛰고 `createSellerFromSignup(user)`(멱등) 를 호출하며
 * `?welcome=1` 을 붙이지 않는다. 생성 실패(`ok:false`)는 `/influencer/apply?reason=<code>` 보완 폼으로(경로 모드 고정 — 결정 11).
 * 파트너 인증 메일은 token_hash 방식(`/auth/confirm`)이라 이 PKCE 경로로는 거의 오지 않지만, 같은 헬퍼를 두어 어느 경로로 와도 결과가 같다.
 * `redirect()` 는 throw 다 — try 밖에서 부른다 (§2.2).
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const code = url.searchParams.get('code');
	const next = safeNext(url.searchParams.get('next'));

	let dest: string | null = null;
	if (code && locals.supabase) {
		const { data, error } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			const user = data.user;
			if (user && (isPartnerUser(user) || linkSellerIdOf(user) !== null)) {
				// 파트너 — customers 행을 만들지 않는다. 가입 생성은 멱등(already:true).
				const result = await createSellerFromSignup(user);
				if (!result.ok) {
					console.error('[auth/callback] createSellerFromSignup:', result.code, result.field ?? '');
					dest = `${consolePath('seller', '/apply')}?reason=${encodeURIComponent(result.code)}`;
				} else {
					dest = next === '/' ? consolePath('seller', '/home') : next;
				}
			} else {
				if (user) {
					// customers 행 보장 — 실패해도 로그인은 계속 (체크아웃 API 가 다시 보장한다).
					// createAdminClient() 는 서비스 키가 없으면 동기적으로 throw 하므로 async 블록 안에서 호출해 .catch 로 흡수한다.
					void (async () => {
						await ensureCustomer(createAdminClient(), user);
					})().catch((e: unknown) => {
						console.error('[auth/callback] ensureCustomer failed:', e instanceof Error ? e.message : e);
					});
				}
				const d = new URL(next, url.origin);
				d.searchParams.set('welcome', '1');
				dest = d.pathname + d.search + d.hash;
			}
		} else {
			console.error('[auth/callback] exchange failed:', error.message);
		}
	}

	redirect(302, dest ?? '/login?error=auth');
};
