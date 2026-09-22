import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { settleDue } from '@sellery/db/brand/settle-rules';
import { storeUrl } from '@sellery/db/campaign';
import { SITE_URL } from '$lib/server/env';
import { brandPath, getBrandSales, requireBrand } from '$lib/server/brand';

/**
 * `/sales` — 실시간 매출 5단계 (docs/brand-console-plan.md §5 `/brand/sales` · §6 행 5 PR-B · 프로토타입 views/Sales.svelte 의 브랜드 분기 — 시뮬 토글 제외).
 * load: `requireBrand` → `getBrandSales(brand.id)`(0019 `app_brand_sales` 1회 — LIVE·CLEARING 캠페인별 오늘·누적·7일·최근 8건 + 브랜드 관점 수수료 라인 · 실시간 등급 할인).
 * 인플루언서 `/sales` 와 같은 골격: 판매 링크는 `SITE_URL + storeUrl(handle, code)` · 지급 예정일은 RPC `due_on` 없으면 `settleDue(end_date)`(종료일 + CLEAR_DAYS).
 * RPC 실패(null)는 빈 화면 + 안내(`failed`). 정산 정보 미완(`settle_info_complete=false`)이면 "정산 정보를 등록해야 지급됩니다" 띠 → `/settle`.
 */
export const load: PageServerLoad = async (event) => {
	const r = await requireBrand(event, { next: '/sales' });
	if (!r.ok) redirect(303, r.location);
	const { brand, balance } = r.ctx;

	const sales = await getBrandSales(brand.id);
	const ordersPath = brandPath('/orders');
	const campaigns = (sales?.campaigns ?? []).map((c) => ({
		...c,
		href: brandPath(`/campaigns/${encodeURIComponent(c.campaign_code)}`),
		ordersHref: `${ordersPath}?campaign=${encodeURIComponent(c.campaign_code)}`,
		storeUrl: `${SITE_URL}${storeUrl(c.seller.handle, c.campaign_code)}`,
		due: c.due_on ?? (c.end_date ? settleDue(c.end_date, sales?.rates.clear_days) : null)
	}));

	return {
		brand: { name: brand.name, grade: brand.grade, has_bank_info: brand.has_bank_info },
		balance,
		failed: sales === null,
		today: sales?.today ?? null,
		brandGrade: sales?.brand_grade ?? null,
		brandDiscountRate: sales?.brand_discount_rate ?? 0,
		settleInfoComplete: sales?.settle_info_complete ?? brand.has_bank_info,
		rates: sales?.rates ?? null,
		totals: sales?.totals ?? null,
		campaigns,
		campaignsPath: brandPath('/campaigns'),
		ordersPath,
		settlePath: brandPath('/settle')
	};
};
