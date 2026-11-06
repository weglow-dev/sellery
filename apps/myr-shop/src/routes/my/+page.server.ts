import type { PageServerLoad } from './$types';
import { hasAdmin } from '$lib/server/admin';
import { claimsOfUser } from '$lib/server/claims';
import { listCsForUser } from '$lib/server/cs';
import { myOrders } from '$lib/server/orders';

/** 마이 — 로그인이면 서버 주문 목록(0060 myr_app_my_orders · 최신 20건) + 교환 · 환불 요청(0078 myr_app_claims_of_user) + 내 문의(0063 myr_app_cs_list). 실패해도 화면은 뜬다(빈 목록 + 로그). 세션은 레이아웃이 준다. */
export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user || !hasAdmin()) return { orders: [], ordersError: !!user && !hasAdmin(), claims: [], inquiries: [] };
	const [orders, claims, inquiries] = await Promise.all([
		myOrders(user.id).catch((e) => {
			console.error('[my] orders failed:', e instanceof Error ? e.message : e);
			return null;
		}),
		claimsOfUser(user.id).catch((e) => {
			console.error('[my] claims failed:', e instanceof Error ? e.message : e);
			return [];
		}),
		listCsForUser(user.id).catch((e) => {
			console.error('[my] cs failed:', e instanceof Error ? e.message : e);
			return [];
		})
	]);
	return { orders: orders ?? [], ordersError: orders === null, claims, inquiries };
};
