import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { createServerClient } from '@supabase/ssr';
import { dev } from '$app/environment';
import { base } from '$app/paths';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { env as publicEnv } from '$env/dynamic/public';
import type { Database } from '@sellery/db/database.types';
import { isConsolePublicPath } from '@sellery/db/console-paths';
import { demoEnabled, isDemoPath } from '$lib/demo';
import '$lib/server/env'; // configureDb() 1회 — $env/dynamic/private 는 여기(서버 배럴)에서만 읽는다 (결정 11)

/* Supabase SSR 세션 — 4 앱 공통 골격 (docs/monorepo-migration.md §2.1).
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
							for (const { name, value, options } of cookiesToSet) event.cookies.set(name, value, { ...options, path: '/' });
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
	const response = await resolve(event, {
		filterSerializedResponseHeaders: (name) => name === 'content-range' || name === 'x-supabase-api-version'
	});
	for (const [k, v] of Object.entries(authHeaders)) response.headers.set(k, v);
	return response;
};

/* 콘솔 세션 게이트 — web proxy.ts 규칙 5 의 경로 모드 판 (docs/inf-console-plan.md §3.2 · §4.4 "proxy" 층 · docs/monorepo-migration.md §2.2 "콘솔 게이트" · §5.3).
   세션 쿠키 유무만 본다(getUser 로 JWT 검증 — DB 조회 없음). 공개 경로(`CONSOLE_PUBLIC_PATHS`: /login /signup /verify-sent /password /password/new) ·
   `/auth/*` · `/api/*` · robots.txt · (dev 또는 PUBLIC_DEMO=1 일 때) (demo) 경로 밖에서 세션이 없으면 `/influencer/login?next=<경로+쿼리>` 302.
   보조 가드다 — 역할·정지 판정(guest/suspended/foreign)은 모든 page load · form action 의 `requireSeller()` 가 한다(결정 6). */
const gate: Handle = async ({ event, resolve }) => {
	const rel = event.url.pathname.slice(base.length) || '/';
	const open =
		isConsolePublicPath(rel) ||
		rel.startsWith('/auth/') ||
		rel.startsWith('/api/') ||
		rel === '/robots.txt' ||
		(demoEnabled(dev, publicEnv.PUBLIC_DEMO) && isDemoPath(rel));
	if (!open) {
		const { user } = await event.locals.safeGetSession();
		if (!user) redirect(302, `${base}/login?next=${encodeURIComponent(event.url.pathname + event.url.search)}`);
	}
	return resolve(event);
};

export const handle = sequence(supabase, gate);
