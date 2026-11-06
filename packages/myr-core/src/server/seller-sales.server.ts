/**
 * 크리에이터 실적(서버 전용 · 0076) — 크리에이터 · 계정 id 는 호출자가 세션에서 정해 넘긴다(결정 3).
 * DB 오류는 0 실적으로 — 홈 지표 때문에 홈 전체가 500 이 되지 않게(로그는 남긴다).
 */
import { emptySellerSales, parseSellerSales, type SellerSales } from '../seller-sales';
import { admin } from './admin.server';

export type { SellerSales } from '../seller-sales';

/** 로그인 계정으로 바로(0076 `_of_user`) — 콘솔이 크리에이터 게이트와 **동시에** 보낸다. 게이트가 통과해야 결과를 쓴다(호출자 책임) */
export async function getSellerSalesOfUser(userId: string): Promise<SellerSales> {
	const { data, error } = await admin().rpc('myr_app_seller_sales_of_user', { p_user: userId });
	if (error) {
		console.error('[seller-sales] myr_app_seller_sales_of_user failed:', error.message);
		return emptySellerSales();
	}
	return parseSellerSales(data);
}
