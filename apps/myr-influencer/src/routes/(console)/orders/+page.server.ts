import type { PageServerLoad } from './$types';
import { myOrders } from '$lib/server/orders';

/** 주문(6번 · 0081 · 읽기 전용) — 결제된 주문 중 내 줄만 · 결제 최근순 ≤ 200. 게이트와 목록을 동시에 보낸다 */
export const load: PageServerLoad = async (event) => {
	const { rows } = await myOrders(event);
	return { orders: rows };
};
