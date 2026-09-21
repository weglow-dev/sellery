import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireSeller } from '$lib/server/partner';

/**
 * 인플루언서 콘솔 홈 — 2단계 (docs/inf-console-plan.md §7 "2." · web influencer/home/page.tsx 1:1 · docs/monorepo-migration.md §2.3 예시).
 * 데이터는 `requireSeller()` 컨텍스트만(캠페인·주문 위젯은 3단계). ok 가 아니면 패키지가 돌려준 location 으로 redirect(§2.2 · §2.4).
 */
export const load: PageServerLoad = async (event) => {
	const r = await requireSeller(event, { next: '/home' });
	if (!r.ok) redirect(303, r.location);
	const { seller, balance } = r.ctx;
	return { seller, balance };
};
