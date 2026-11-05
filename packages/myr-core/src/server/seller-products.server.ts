/**
 * 크리에이터 "내 제품" 조회(서버 전용 · 0071) — 크리에이터 id 는 호출자가 세션(requireSeller)에서 정해 넘긴다(결정 3 · 폼 값을 받지 않는다).
 * DB 오류는 throw — 화면이 "제품 없음" 으로 잘못 보이지 않게(페이지 500).
 */
import { parseSellerProductRows, type SellerProductRow } from '../seller-products';
import { admin } from './admin.server';

export type { SellerProductRow } from '../seller-products';

export async function listSellerProducts(sellerId: string): Promise<SellerProductRow[]> {
	const { data, error } = await admin().rpc('myr_app_seller_products', { p_seller: sellerId });
	if (error) throw new Error(`myr_app_seller_products failed: ${error.message}`);
	return parseSellerProductRows(data);
}

/** 로그인 계정으로 바로 조회(0072) — 콘솔이 크리에이터 게이트와 **동시에** 보내 DB 왕복 대기를 1번 줄인다. 게이트가 통과해야 결과를 쓴다(호출자 책임) */
export async function listSellerProductsOfUser(userId: string): Promise<SellerProductRow[]> {
	const { data, error } = await admin().rpc('myr_app_seller_products_of_user', { p_user: userId });
	if (error) throw new Error(`myr_app_seller_products_of_user failed: ${error.message}`);
	return parseSellerProductRows(data);
}
