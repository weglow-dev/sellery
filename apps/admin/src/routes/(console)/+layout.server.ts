import type { LayoutServerLoad } from './$types';
import type { ShellMe } from '@sellery/ui/site';
import { getAdminContext } from '$lib/server/admin';

/**
 * 콘솔 셸 데이터 — apps/brand `(console)/+layout.server.ts` 의 관리자 판.
 * 상단 바 표시용(운영자 이메일) — **게이트가 아니다.** 같은 요청의 page 가 `requireAdmin()` 을 불러도 `locals.memo` 로 `app_role()` RPC 는 한 번.
 * 관리자는 전용 테이블이 없어 등급·🥬 가 없다 — `grade` · `balance` 는 항상 null(셸이 그 자리를 비운다).
 * 세션이 없거나 관리자가 아니면(공개 `/login` · foreign) 비워 둔다. 실패는 로그아웃 표시로 — 레이아웃이 죽으면 전 페이지가 죽는다.
 * 세션을 읽는 응답이라 `cache-control: private, no-store` — page 는 다시 setHeaders 하지 않는다(같은 헤더 2회 설정은 오류).
 */
export const load: LayoutServerLoad = async (event) => {
	event.depends('supabase:auth');
	event.setHeaders({ 'cache-control': 'private, no-store' });
	let me: ShellMe | null = null;
	try {
		const ctx = await getAdminContext(event);
		if (ctx.state === 'ok') me = { name: ctx.user.email ?? '운영팀', grade: null, balance: null };
	} catch (e) {
		console.error('[admin/layout] admin context failed:', e instanceof Error ? e.message : e);
	}
	return { me };
};
