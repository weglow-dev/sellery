import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { createServerClient } from '@supabase/ssr';
import { building, dev } from '$app/environment';
import { base } from '$app/paths';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { env as publicEnv } from '$env/dynamic/public';
import type { Database } from '@sellery/db/database.types';
import { demoEnabled, isDemoPath } from '$lib/demo';
import { LANG_COOKIE, LANG_MAX_AGE, parseLang, pickLang } from '$lib/lang';
import { adminPath, isAdminPublicPath } from '$lib/server/admin';
import '$lib/server/env'; // configureDb() 1회 — $env/dynamic/private 는 여기(서버 배럴)에서만 읽는다 (결정 11)

/* Supabase SSR 세션 — 4 앱 공통 골격 (docs/monorepo-migration.md §2.1 · apps/brand/src/hooks.server.ts 와 동일).
   요청마다 createServerClient 1회 → locals.supabase · locals.safeGetSession(). cookieOptions 는 지정하지 않는다 — host-only (결정 I).
   PUBLIC_SUPABASE_URL · PUBLIC_SUPABASE_ANON_KEY 가 비어 있으면(키 없는 로컬 · CI 더미) Supabase 없이 통과 — locals.supabase = null → 게이트는 세션 없음으로 본다. */
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

/* 콘솔 세션 게이트 — 인플루언서·브랜드 hooks 의 관리자 판 (docs/inf-console-plan.md §3.2 · §4.4 "proxy" 층).
   세션 쿠키 유무만 본다(getUser 로 JWT 검증 — DB 조회 없음). 공개 경로(`/login`) · `/auth/*` · robots.txt ·
   (dev 또는 PUBLIC_DEMO=1 일 때) (demo) 경로 밖에서 세션이 없으면 `/admin/login?next=<경로+쿼리>` 302.
   보조 가드다 — 역할 판정(foreign = 로그인했지만 admin 아님)은 모든 page load · form action 의 `requireAdmin()` 이 한다(결정 6). */
const gate: Handle = async ({ event, resolve }) => {
	const rel = event.url.pathname.slice(base.length) || '/';
	const open =
		isAdminPublicPath(rel) ||
		rel.startsWith('/auth/') ||
		rel === '/robots.txt' ||
		(demoEnabled(dev, publicEnv.PUBLIC_DEMO) && isDemoPath(rel));
	if (!open) {
		const { user } = await event.locals.safeGetSession();
		if (!user) redirect(302, `${base}/login?next=${encodeURIComponent(event.url.pathname + event.url.search)}`);
	}
	return resolve(event);
};

/* 표시 언어 — `?lang=en|ko` 를 쿠키에 적고 `locals.lang` 에 싣는다(`$lib/lang` · 메타 앱 검수자가 읽는 화면용 · 표시만 바꾼다).
   쿠키는 리다이렉트 응답에도 실린다 — 비로그인으로 `/admin/outreach?lang=en` 을 열어 로그인으로 넘어가도 언어가 남는다.
   `<html lang>` 은 app.html 의 `%lang%` 자리에 넣는다. */
const lang: Handle = async ({ event, resolve }) => {
	// 빌드 때 미리 그리는 경로(robots.txt)에서는 주소의 쿼리를 읽을 수 없다(읽으면 SvelteKit 이 던진다) — 한국어로 그대로 통과
	if (building) {
		event.locals.lang = 'ko';
		return resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', 'ko') });
	}
	const asked = parseLang(event.url.searchParams.get('lang'));
	if (asked) event.cookies.set(LANG_COOKIE, asked, { path: adminPath('/'), httpOnly: true, sameSite: 'lax', secure: !dev, maxAge: LANG_MAX_AGE });
	const picked = pickLang(asked, event.cookies.get(LANG_COOKIE));
	event.locals.lang = picked;
	return resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', picked) });
};

export const handle = sequence(lang, supabase, gate);
