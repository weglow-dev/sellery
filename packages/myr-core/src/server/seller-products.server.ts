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
