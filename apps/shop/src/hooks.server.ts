import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { createServerClient } from '@supabase/ssr';
import { dev } from '$app/environment';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { Database } from '@sellery/db/database.types';
import { LINKCTX_COOKIE, LINKCTX_MAX_AGE, LINK_CODE_RE } from '@sellery/db/linkctx';
import '$lib/server/env'; // configureDb() 1회 — $env/dynamic/private 는 여기(서버 배럴)에서만 읽는다 (결정 11)

/* Supabase SSR 세션 — 4 앱 공통 골격 (docs/monorepo-migration.md §2.1).
   요청마다 createServerClient 1회 → locals.supabase · locals.safeGetSession(). cookieOptions 는 지정하지 않는다 — host-only (결정 I).
   PUBLIC_SUPABASE_URL · PUBLIC_SUPABASE_ANON_KEY 가 비어 있으면(키 없는 로컬 · CI 더미) Supabase 없이 통과 — locals.supabase = null → load 는 빈 목록으로 렌더. */
const supabase: Handle = async ({ event, resolve }) => {
	let authHeaders: Record<string, string> = {};
	event.locals.memo = new Map();
	event.locals.supabase =
		PUBLIC_SUPABASE_URL && PUBLIC_SUPABASE_ANON_KEY
			? createServerClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
					cookies: {
						getAll: () => event.cookies.getAll(),
						setAll: (cookiesToSet, headers) => {
							try {
								for (const { name, value, options } of cookiesToSet) event.cookies.set(name, value, { ...options, path: '/' });
							} catch (e) {
								// 응답이 나간 뒤의 쿠키 쓰기는 SvelteKit 이 throw 한다 — 갱신 콜백 안의 처리되지 않은 에러라 dev 서버(Node)가 통째로 죽는다.
								// 아래에서 resolve 전에 토큰 갱신을 끝내 두므로 정상 경로에선 오지 않는다. 와도 서버는 살리고 로그만(apps/myr-shop 과 같은 처리)
								console.warn('[hooks] 응답 뒤 세션 쿠키 쓰기 무시', e);
							}
							authHeaders = headers; // Cache-Control: private, no-store … — 쿠키를 쓴 응답을 CDN 이 캐시하지 않게 (§8.3)
						}
					}
				})
			: null;
	// createServerClient 와 getUser() 사이에 다른 코드를 두지 않는다 — safeGetSession 이 그 자리 (web lib/supabase/middleware.ts 와 같은 규칙)
	event.locals.safeGetSession = async () => {
		const sb = event.locals.supabase;
		if (!sb) return { session: null, user: null };
		const { data: { session } } = await sb.auth.getSession();
		if (!session) return { session: null, user: null };
		const { data: { user }, error } = await sb.auth.getUser(); // JWT 검증 — 쿠키 값만 믿지 않는다
		if (error || !user) return { session: null, user: null };
		return { session, user };
	};
	// 토큰 갱신(=새 쿠키 쓰기)을 응답 생성 전에 끝낸다. load 에서만 부르면 갱신이 응답보다 늦게 끝나는 경우가 있어 cookies.set 이 throw 하고(위)
	// 새 토큰이 브라우저에 안 가 다음 요청에서 이미 쓴 refresh token 으로 로그아웃된다. getSession 은 토큰이 살아 있으면 네트워크 없이 끝나고
	// 만료됐을 때만 갱신한다 — getUser(Auth 왕복)는 부르지 않으므로 요청 비용은 그대로다(apps/myr-shop 과 같은 처리)
	if (event.locals.supabase) await event.locals.supabase.auth.getSession().catch(() => undefined);
	const response = await resolve(event, {
		filterSerializedResponseHeaders: (name) => name === 'content-range' || name === 'x-supabase-api-version'
	});
	for (const [k, v] of Object.entries(authHeaders)) response.headers.set(k, v);
	return response;
};

/* 링크 유입 보호 쿠키 — app-plan §8 규칙 6 (web proxy.ts 규칙 6 · docs/monorepo-migration.md §2.5).
   GET/HEAD `/s/:handle/:code` · code 가 LINK_CODE_RE · 새 유입(sec-fetch-site ≠ same-origin — 헤더 없는 구형 UA 는 설정) 일 때만
   `slry_linkctx=<code>` HttpOnly · SameSite=Lax · Secure(prod) · Path=/ · Max-Age 90일. resolve 전에 set → 308(정규 핸들)·404 응답에도 실린다(web 과 동일).
   내부 이동(홈 카드 → 판매 페이지)은 same-origin 이라 덮어쓰지 않는다. 읽기는 `readLinkCtx(event)`($lib/server/db). */
const STORE_RE = /^\/s\/[^/]+\/([^/]+)$/;
const linkCtx: Handle = async ({ event, resolve }) => {
	if (event.request.method === 'GET' || event.request.method === 'HEAD') {
		const code = STORE_RE.exec(event.url.pathname)?.[1];
		if (code && LINK_CODE_RE.test(code) && event.request.headers.get('sec-fetch-site') !== 'same-origin') {
			event.cookies.set(LINKCTX_COOKIE, code, { httpOnly: true, sameSite: 'lax', secure: !dev, path: '/', maxAge: LINKCTX_MAX_AGE });
		}
	}
	return resolve(event);
};

/* `/api/*` 응답은 CDN·브라우저가 캐시하지 않는다 — /api/me · /api/health 는 라우트가 직접 no-store 를 붙이지만(web 과 동일), 나머지(결제·웹훅·reconcile)도 같은 규칙으로 통일한다. */
const apiNoStore: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	if (event.url.pathname.startsWith('/api/') && !response.headers.has('cache-control')) response.headers.set('cache-control', 'no-store');
	return response;
};

export const handle = sequence(supabase, linkCtx, apiNoStore);
