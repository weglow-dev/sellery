import type { LayoutServerLoad } from './$types';
import type { ShellMe } from '@sellery/ui/site';
import { getBrandContext } from '$lib/server/brand';

/**
 * 콘솔 셸 데이터 — apps/influencer `(console)/+layout.server.ts` 의 브랜드 판 (docs/brand-console-plan.md §2).
 * 상단 바 표시용(상호 · 브랜드 등급 · 🥬) — **게이트가 아니다**. 같은 요청의 page 가 requireBrand() 를 불러도 `locals.memo` 로 DB 는 한 번.
 * 세션·행이 없으면(공개 페이지 · guest · foreign) 비워 둔다. 정지 계정은 이름만(잔액 없음). 실패는 로그아웃 표시로 — 레이아웃이 죽으면 전 페이지가 죽는다.
 * 세션을 읽는 응답이라 `cache-control: private, no-store` — page 는 다시 setHeaders 하지 않는다(같은 헤더 2회 설정은 오류).
 */
export const load: LayoutServerLoad = async (event) => {
	event.depends('supabase:auth');
	event.setHeaders({ 'cache-control': 'private, no-store' });
	let me: ShellMe | null = null;
	try {
		const ctx = await getBrandContext(event);
		if (ctx.state === 'ok') me = { name: ctx.brand.name, grade: ctx.brand.grade, balance: ctx.balance };
		else if (ctx.state === 'suspended') me = { name: ctx.brand.name, grade: null, balance: null };
	} catch (e) {
		console.error('[brand/layout] brand context failed:', e instanceof Error ? e.message : e);
	}
	return { me };
};
