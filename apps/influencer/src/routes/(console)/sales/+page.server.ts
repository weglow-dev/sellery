import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { storeUrl } from '@sellery/db/campaign';
import { settleDue } from '@sellery/db/partner/settle-rules';
import { SITE_URL } from '$lib/server/env';
import { getSellerSales, requireSeller, sellerPath } from '$lib/server/partner';

/**
 * `/sales` — 실시간 매출 5단계 (docs/inf-console-plan.md §6 `/sales` · §7 "5." · 프로토타입 js/30-shared.js vSales — 시뮬 토글 제외).
 * load: `requireSeller` → `getSellerSales(seller.id)`(0013 `app_seller_sales` 1회 — LIVE·CLEARING 캠페인별 오늘·누적·7일·최근 8건 + 내 수수료 라인,
 * 원천징수는 settle_type 기준 `wht_rate`). 판매 링크는 홈 LIVE 카드와 같은 `SITE_URL + storeUrl(handle, code)`.
 * 지급 예정일은 RPC 의 `due_on`(settlements 행이 있으면 그 값) 없으면 `settleDue(end_date)`(종료일 + CLEAR_DAYS). RPC 실패(null)는 빈 화면 + 안내(`failed`).
 */
export const load: PageServerLoad = async (event) => {
	const r = await requireSeller(event, { next: '/sales' });
	if (!r.ok) redirect(303, r.location);
	const { seller, balance } = r.ctx;

	const sales = await getSellerSales(seller.id);
	const campaigns = (sales?.campaigns ?? []).map((c) => ({
		...c,
		href: sellerPath(`/campaigns/${encodeURIComponent(c.campaign_code)}`),
		storeUrl: `${SITE_URL}${storeUrl(seller.handle, c.campaign_code)}`,
		due: c.due_on ?? (c.end_date ? settleDue(c.end_date, sales?.rates.clear_days) : null)
	}));

	return {
		seller: { name: seller.name, grade: seller.grade, settle_type: seller.settle_type, has_bank_info: seller.has_bank_info },
		balance,
		failed: sales === null,
		today: sales?.today ?? null,
		whtRate: sales?.wht_rate ?? null,
		rates: sales?.rates ?? null,
		totals: sales?.totals ?? null,
		campaigns,
		campaignsPath: sellerPath('/campaigns'),
		settlePath: sellerPath('/settle')
	};
};
