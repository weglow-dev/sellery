import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { avatarOf, displayName } from '$lib/auth';

/** GET /api/me — 클라이언트용 가벼운 인증 프로브 `{ user: { name, avatar } | null }`. 서버가 세션을 읽으므로 httpOnly 쿠키여도 동작. 캐시 금지. */
export const GET: RequestHandler = async ({ locals }) => {
	const headers = { 'cache-control': 'no-store' };
	const { user } = await locals.safeGetSession();
	if (!user) return json({ user: null }, { headers });
	return json({ user: { name: displayName(user), avatar: avatarOf(user) } }, { headers });
};
