/**
 * 관리자 콘솔 게이트 — apps/brand `lib/server/brand.ts`(requireBrand) 의 관리자 판.
 *
 * 브랜드·인플루언서와 다른 점: **전용 테이블(`sellers`·`brands`)이 없다.** 관리자 판정은 `profiles.role='admin'` 하나이고
 * `app_role()`(`supabase/migrations/0001_init.sql:87` · security definer · `authenticated` 에만 execute) 이 그 값을 읽는다.
 * 그래서 `getAdminContext` 는 세 상태뿐이다 — `anon`(세션 없음) · `foreign`(세션은 있지만 admin 아님) · `ok`.
 * `role='admin'` 을 넣는 코드 경로는 없다(수동 승격 — docs/deploy.md §5.6).
 *
 * 게이트는 **모든 page load · form action 이 직접 호출**한다(docs/inf-console-plan.md 결정 6):
 * App Router 와 달리 SvelteKit 도 형제 page 이동에서 레이아웃 load 를 다시 돌리지 않을 수 있고,
 * hooks 의 세션 게이트는 쿠키 유무만 보는 보조 가드다.
 *
 *   requireAdmin(event, { next })  → { ok:true, ctx } | { ok:false, state, location } — 앱이 `redirect(303, location)` 한다
 *   getAdminContext(event)         → anon · foreign · ok (요청당 1회 메모 — 레이아웃 + page 가 같이 불러도 RPC 는 한 번)
 */
import type { User } from '@supabase/supabase-js';
import type { RequestEvent } from '@sveltejs/kit';
import { safeNext, type AppRole } from '@sellery/db/auth';
import { getRole } from '$lib/server/db';

/** 라우트 접두 — `apps/admin/svelte.config.js` 의 `paths.base` 와 같아야 한다 (packages/db `PREFIX_OF` 의 관리자 판). */
export const ADMIN_PREFIX = '/admin';

/** 관리자 콘솔 안에서 세션 없이 열리는 경로(접두 제외 형태). hooks 세션 게이트의 예외와 같은 목록을 쓴다. */
export const ADMIN_PUBLIC_PATHS = ['/login'] as const;

export function isAdminPublicPath(relPath: string): boolean {
	return ADMIN_PUBLIC_PATHS.some((p) => relPath === p || relPath.startsWith(`${p}/`));
}

/** 항상 상대 경로: `adminPath('/home')` → `/admin/home`, `'/'` → `/admin`. */
export function adminPath(path: string): string {
	const p = path.startsWith('/') ? path : `/${path}`;
	return p === '/' ? ADMIN_PREFIX : `${ADMIN_PREFIX}${p}`;
}

/**
 * `?next=` 정규화 — 같은 오리진 상대 경로(`safeNext`)이고 관리자 콘솔 안이어야 한다.
 * 비었거나 거부되거나 콘솔 밖이면 `/admin/home`. 로그인 화면으로 되돌아가는 `next` 도 거부한다(로그인 성공 뒤 루프 방지).
 */
export function adminNextOf(raw: string | null | undefined): string {
	const home = adminPath('/home');
	if (!raw) return home;
	const next = safeNext(raw);
	if (next === '/' || !next.startsWith(ADMIN_PREFIX)) return home;
	const rel = next.slice(ADMIN_PREFIX.length) || '/';
	return isAdminPublicPath(rel) ? home : next;
}

export type AdminContext =
	| { state: 'anon'; user: null; role: null }
	| { state: 'foreign'; user: User; role: AppRole | null }
	| { state: 'ok'; user: User; role: 'admin' };

const MEMO_KEY = 'admin:context';

/** 요청당 1회. `app_role()` 은 세션 쿠키가 실린 SSR 클라이언트(`locals.supabase`)로 호출한다 — service role 이 아니다. */
export async function getAdminContext(event: RequestEvent): Promise<AdminContext> {
	const cached = event.locals.memo.get(MEMO_KEY) as AdminContext | undefined;
	if (cached) return cached;

	const { user } = await event.locals.safeGetSession();
	let ctx: AdminContext;
	if (!user) ctx = { state: 'anon', user: null, role: null };
	else {
		const role = await getRole(event.locals.supabase, user);
		ctx = role === 'admin' ? { state: 'ok', user, role } : { state: 'foreign', user, role };
	}
	event.locals.memo.set(MEMO_KEY, ctx);
	return ctx;
}

export type AdminGate =
	| { ok: true; ctx: Extract<AdminContext, { state: 'ok' }> }
	| { ok: false; state: 'anon' | 'foreign'; location: string };

/**
 * 관리자만 통과. 실패하면 `location` 을 돌려주고 **호출자가** `redirect(303, location)` 한다
 * (redirect 를 여기서 throw 하면 form action 의 반환 타입이 흐려진다 — requireBrand 와 같은 계약).
 *   anon    → `/admin/login?next=<원래 경로>`
 *   foreign → `/admin/login?next=…&switch=1`  (로그인돼 있지만 관리자가 아니다 — 로그인 화면이 "다른 계정으로" 안내를 그린다)
 */
export async function requireAdmin(event: RequestEvent, opts: { next?: string } = {}): Promise<AdminGate> {
	const ctx = await getAdminContext(event);
	if (ctx.state === 'ok') return { ok: true, ctx };
	const next = opts.next ?? event.url.pathname + event.url.search;
	const qs = new URLSearchParams({ next: adminNextOf(next) });
	if (ctx.state === 'foreign') qs.set('switch', '1');
	return { ok: false, state: ctx.state, location: `${adminPath('/login')}?${qs}` };
}
