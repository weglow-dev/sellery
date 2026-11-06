import type { PageServerLoad } from './$types';
import type { CsConversation } from '@sellery/myr-core/cs-rules';
import { emptySellerSales } from '@sellery/myr-core/seller-sales';
import { isWaiting } from '$lib/inquiry';
import { productFromRow } from '$lib/product-row';
import { homeProductCounts } from '$lib/rules';
import { listSellerCsOfUser } from '$lib/server/cs';
import { getSellerSalesOfUser } from '$lib/server/sales';
import { myProducts } from '$lib/server/seller-products';

/** 홈 — 서버 값: 판매 중 제품 카드(0071 · 0072) · 이번 달 실적 + 최근 7일(0076) · 고객 문의 답변 대기 수 · 오늘 처리할 일의 문의(0075).
 *  크리에이터 게이트 · 상품 · 실적 · 문의를 **동시에** 보낸다(게이트가 통과해야 쓴다 — myProducts 가 redirect 를 먼저 던진다). 교환·환불은 7번 전까지 목(app.cs). */
export const load: PageServerLoad = async (event) => {
	const { user } = await event.locals.safeGetSession();
	const salesP = user ? getSellerSalesOfUser(user.id) : Promise.resolve(emptySellerSales());
	const inqP: Promise<CsConversation[]> = user
		? listSellerCsOfUser(user.id).catch((e) => {
				console.error('[home] inquiries failed:', e instanceof Error ? e.message : e);
				return [];
			})
		: Promise.resolve([]);
	const { rows } = await myProducts(event);
	const [sales, inquiries] = await Promise.all([salesP, inqP]);
	const waiting = inquiries.filter(isWaiting);
	// 오늘 처리할 일 — 답변 대기 문의를 오래된 순으로(최대 3 · 교환·환불과 섞어 3건만 보인다)
	const todayInquiries = [...waiting]
		.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
		.slice(0, 3)
		.map((c) => ({ code: c.code, type: c.type, buyerName: c.buyerName, question: c.firstBody ?? '', createdAt: c.createdAt, product: c.product }));
	return { productCounts: homeProductCounts(rows.map((r) => productFromRow(r))), inqWaiting: waiting.length, sales, todayInquiries };
};
