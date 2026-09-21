import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { displayName } from '@sellery/db/auth';

/**
 * GET /api/me — 클라이언트 UI 용 가벼운 인증 프로브 (app-plan §6.2 · web api/me/route.ts): `{ user: { name, avatar } | null }`.
 * 서버에서 세션을 읽으므로 httpOnly 쿠키여도 동작한다. 캐시 금지. 쓰는 곳: ToastHost 의 `?welcome=1` 토스트 이름.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const headers = { 'cache-control': 'no-store' };
	const { user } = await locals.safeGetSession();
	if (!user) return json({ user: null }, { headers });

	const m = (user.user_metadata ?? {}) as Record<string, unknown>;
	const avatar = typeof m.avatar_url === 'string' ? m.avatar_url : typeof m.picture === 'string' ? m.picture : null;
	return json({ user: { name: displayName(user), avatar } }, { headers });
};
