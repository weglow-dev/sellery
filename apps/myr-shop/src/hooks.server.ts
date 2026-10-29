import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';

/* Supabase SSR 세션 — apps/shop/src/hooks.server.ts 골격 복사(docs/myr.md §7 S3 · 링크 유입 쿠키 훅은 MYR 에 없다).
   요청마다 createServerClient 1회 → locals.supabase · locals.safeGetSession(). cookieOptions 는 지정하지 않는다 — host-only.
   PUBLIC_SUPABASE_URL · PUBLIC_SUPABASE_ANON_KEY 가 비어 있으면(키 없는 로컬 · CI 더미) Supabase 없이 통과 — locals.supabase = null → 로그아웃 상태로 렌더. */
const supabase: Handle = async ({ event, resolve }) => {
	let authHeaders: Record<string, string> = {};
	event.locals.supabase =
		PUBLIC_SUPABASE_URL && PUBLIC_SUPABASE_ANON_KEY
			? createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
					cookies: {
						getAll: () => event.cookies.getAll(),
						setAll: (cookiesToSet, headers) => {
							for (const { name, value, options } of cookiesToSet) event.cookies.set(name, value, { ...options, path: '/' });
							authHeaders = headers; // Cache-Control: private, no-store … — 쿠키를 쓴 응답을 CDN 이 캐시하지 않게
						}
					}
				})
			: null;
	// createServerClient 와 getUser() 사이에 다른 코드를 두지 않는다 — safeGetSession 이 그 자리
	event.locals.safeGetSession = async () => {
		const sb = event.locals.supabase;
		if (!sb) return { session: null, user: null };
		const {
			data: { session }
		} = await sb.auth.getSession();
		if (!session) return { session: null, user: null };
		const {
			data: { user },
			error
		} = await sb.auth.getUser(); // JWT 검증 — 쿠키 값만 믿지 않는다
		if (error || !user) return { session: null, user: null };
		return { session, user };
	};
	const response = await resolve(event, {
		filterSerializedResponseHeaders: (name) => name === 'content-range' || name === 'x-supabase-api-version'
	});
	for (const [k, v] of Object.entries(authHeaders)) response.headers.set(k, v);
	return response;
};

/* `/api/*` 응답은 CDN·브라우저가 캐시하지 않는다 */
const apiNoStore: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	if (event.url.pathname.startsWith('/api/') && !response.headers.has('cache-control')) response.headers.set('cache-control', 'no-store');
	return response;
};

export const handle = sequence(supabase, apiNoStore);
