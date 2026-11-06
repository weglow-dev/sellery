/**
 * 크리에이터 주문 열람(서버 전용 · 0081) — 계정 id 는 호출자가 세션에서 정해 넘긴다(결정 3). 읽기 전용.
 */
import { sellerOrdersFromJson, type SellerOrder } from '../seller-orders';
import { admin } from './admin.server';

export type { SellerOrder } from '../seller-orders';

/** 로그인 계정으로 바로(0081 `_of_user`) — 콘솔이 크리에이터 게이트와 **동시에** 보낸다. 게이트가 통과해야 결과를 쓴다(호출자 책임) */
export async function listSellerOrdersOfUser(userId: string): Promise<SellerOrder[]> {
	const { data, error } = await admin().rpc('myr_app_seller_orders_of_user', { p_user: userId, p_limit: 200 });
	if (error) throw new Error(`myr_app_seller_orders_of_user failed: ${error.message}`);
	return sellerOrdersFromJson(data);
}
