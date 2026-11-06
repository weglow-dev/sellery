import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { isNoindexPath } from '$lib/seo';

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
							try {
								for (const { name, value, options } of cookiesToSet) event.cookies.set(name, value, { ...options, path: '/' });
							} catch (e) {
								// 응답이 나간 뒤의 쿠키 쓰기는 SvelteKit 이 throw 한다 — 갱신 콜백 안의 처리되지 않은 에러라 dev 서버(Node)가 통째로 죽는다.
								// 아래에서 resolve 전에 세션을 끝내 두므로 정상 경로에선 오지 않는다. 와도 서버는 살리고 로그만
								console.warn('[hooks] 응답 뒤 세션 쿠키 쓰기 무시', e);
							}
							authHeaders = headers; // Cache-Control: private, no-store … — 쿠키를 쓴 응답을 CDN 이 캐시하지 않게
						}
					}
				})
			: null;
	// createServerClient 와 getUser() 사이에 다른 코드를 두지 않는다 — safeGetSession 이 그 자리
	// 요청당 한 번만 조회한다(레이아웃 · 페이지 load 가 동시에 불러도 같은 Promise) — 만료 토큰 갱신이 두 번 겹치지 않게
	let sessionPromise: ReturnType<App.Locals['safeGetSession']> | undefined;
	event.locals.safeGetSession = () => (sessionPromise ??= loadSession(event.locals.supabase));
	// 토큰 갱신(=새 쿠키 쓰기)을 응답 생성 전에 끝낸다. load 에서만 부르면 갱신이 응답보다 늦게 끝나는 경우가 있어
	// cookies.set 이 throw 하고(위) 새 토큰이 브라우저에 안 가 다음 요청에서 이미 쓴 refresh token 으로 로그아웃된다.
	// 세션 쿠키가 없으면 getSession 은 네트워크 없이 null 이라 웹훅 · 크론 요청엔 비용이 없다
	if (event.locals.supabase) await event.locals.safeGetSession().catch(() => undefined);
	const response = await resolve(event, {
		filterSerializedResponseHeaders: (name) => name === 'content-range' || name === 'x-supabase-api-version'
	});
	for (const [k, v] of Object.entries(authHeaders)) response.headers.set(k, v);
	return response;
};

async function loadSession(sb: App.Locals['supabase']) {
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
}

/* `/api/*` 응답은 CDN·브라우저가 캐시하지 않는다 */
const apiNoStore: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	if (event.url.pathname.startsWith('/api/') && !response.headers.has('cache-control')) response.headers.set('cache-control', 'no-store');
	return response;
};

/* 개인화 · 결제 · 주문 · 문의 · 로그인 · API 는 색인하지 않는다 — 경로 목록은 lib/seo.ts NOINDEX_PREFIXES 한 곳(robots.txt 도 같은 목록).
   meta 태그와 달리 JS 없이 읽히고 리다이렉트 · JSON 응답에도 붙는다. */
const noindex: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	if (isNoindexPath(event.url.pathname)) response.headers.set('x-robots-tag', 'noindex, nofollow');
	return response;
};

export const handle = sequence(supabase, apiNoStore, noindex);
