import type { LayoutServerLoad } from './$types';
import { avatarOf, displayName } from '$lib/auth';

/** 헤더·마이 화면용 세션(표시명 · 아바타 · 이메일). 세션 조회 실패는 로그아웃 상태로 — 레이아웃이 죽으면 전 페이지가 죽는다.
 *  세션이 실리는 응답이라 CDN 캐시 금지(hooks 가 쿠키를 쓸 때 private 헤더를 붙이고, 여기서도 명시). */
export const load: LayoutServerLoad = async ({ locals, depends, setHeaders }) => {
	depends('supabase:auth');
	setHeaders({ 'cache-control': 'private, no-store' });
	try {
		const { user } = await locals.safeGetSession();
		return { user: user ? { name: displayName(user), avatar: avatarOf(user), email: user.email ?? null } : null };
	} catch (e) {
		if (import.meta.env.DEV) console.warn('[layout] safeGetSession failed — 로그아웃 상태로 렌더', e);
		return { user: null };
	}
};
