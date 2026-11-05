import type { PageServerLoad } from './$types';
import { productFromRow } from '$lib/product-row';
import { homeProductCounts } from '$lib/rules';
import { myInquiryWaiting } from '$lib/server/cs';
import { myProducts } from '$lib/server/seller-products';

/** 홈 — "판매 중 제품" 카드 숫자 · 고객 문의 답변 대기 수(0075)만 서버 값(0071 · 0072 · 게이트와 조회를 동시에). 정산 예정 · 주문 · 7일 판매는 실적 RPC(8번) 전까지 목 */
export const load: PageServerLoad = async (event) => {
	const waitingP = myInquiryWaiting(event); // 게이트 · 상품과 동시에(실패하면 0)
	const { rows } = await myProducts(event);
	return { productCounts: homeProductCounts(rows.map((r) => productFromRow(r))), inqWaiting: await waitingP };
};
