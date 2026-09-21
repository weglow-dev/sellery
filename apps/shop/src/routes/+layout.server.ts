import type { LayoutServerLoad } from './$types';
import { displayName } from '@sellery/db/auth';

/**
 * 네비 persona 용 세션 (app-plan §4.1 "서버 컴포넌트 getUser()" · web (customer)/layout.tsx navUser · docs/monorepo-migration.md §2.3).
 * 세션 조회 실패는 로그아웃 상태로 취급 — 레이아웃이 죽으면 전 페이지가 죽는다.
 */
export const load: LayoutServerLoad = async ({ locals, depends }) => {
	depends('supabase:auth');
	try {
		const { user } = await locals.safeGetSession();
		return { user: user ? { name: displayName(user) } : null };
	} catch (e) {
		if (import.meta.env.DEV) console.warn('[layout] safeGetSession failed — 로그아웃 상태로 렌더', e);
		return { user: null };
	}
};
