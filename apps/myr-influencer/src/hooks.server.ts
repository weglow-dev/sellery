import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { createServerClient } from '@supabase/ssr';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SESSION_ONLY_COOKIE, isPublicPath, loginPath } from '$lib/console-auth';
import '$lib/server/env';

/* Supabase SSR 세션 — apps/myr-shop/src/hooks.server.ts 골격 복사.
   요청마다 createServerClient 1회 → locals.supabase · locals.safeGetSession(). cookieOptions 는 지정하지 않는다 — host-only(샵과 쿠키를 나누지 않는다 · 도메인이 다르다).
   PUBLIC_SUPABASE_URL · PUBLIC_SUPABASE_ANON_KEY 가 비어 있으면(키 없는 로컬 · CI 더미) Supabase 없이 통과 — 게이트는 세션 없음으로 본다. */
const supabase: Handle = async ({ event, resolve }) => {
	let authHeaders: Record<string, string> = {};
	event.locals.supabase =
		PUBLIC_SUPABASE_URL && PUBLIC_SUPABASE_ANON_KEY
			? createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
					cookies: {
						getAll: () => event.cookies.getAll(),
						setAll: (cookiesToSet, headers) => {
							// "이 기기에서 로그인 유지" 를 껐으면(로그인 action 이 locals.sessionOnly · 이후 요청은 쿠키) 만료 시각을 빼서 브라우저를 닫으면 지워지는 쿠키로.
							// 로그아웃(값 비우기 · maxAge 0)은 그대로 둔다 — 지우는 쿠키까지 만료를 빼면 남는다.
							const sessionOnly = event.locals.sessionOnly ?? event.cookies.get(SESSION_ONLY_COOKIE) === '1';
							for (const { name, value, options } of cookiesToSet) {
								const opts = { ...options, path: '/' };
								if (sessionOnly && value && (opts.maxAge ?? 1) > 0) {
									delete opts.maxAge;
									delete opts.expires;
								}
								event.cookies.set(name, value, opts);
							}
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

/* 세션 게이트 — 공개 경로(로그인 · 비밀번호 재설정 요청 · 메일 링크 착지 · robots) 밖에서 세션이 없으면 로그인으로.
   보조 가드다 — "어느 크리에이터인지 · 정지됐는지" 는 콘솔 페이지 load 의 requireSeller 가 정한다(DB 조회는 거기서만). */
const gate: Handle = async ({ event, resolve }) => {
	if (!isPublicPath(event.url.pathname)) {
		const { user } = await event.locals.safeGetSession();
		if (!user) redirect(302, loginPath(event.url.pathname + event.url.search));
	}
	return resolve(event);
};

/* 상태를 바꾸는 요청과 세션이 실린 응답은 캐시하지 않는다 */
const noStore: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	if (!response.headers.has('cache-control')) response.headers.set('cache-control', 'private, no-store');
	return response;
};

export const handle = sequence(supabase, gate, noStore);
