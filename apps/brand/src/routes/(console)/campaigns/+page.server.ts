import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { BRAND_CAMPAIGN_FILTERS, matchesBrandCampaignFilter, type BrandCampaignFilter } from '@sellery/db/brand/campaign-rules';
import { storeUrl } from '@sellery/db/campaign';
import { SITE_URL } from '$lib/server/env';
import { brandPath, listBrandCampaigns, requireBrand } from '$lib/server/brand';

/**
 * `/campaigns` — 내 캠페인 목록 2단계 (docs/brand-console-plan.md §5 `/brand/campaigns` · 프로토타입 데모 camps/+page.svelte: 칩 필터 all/live/soon/prep/done · 묶음별 목록. 캘린더·LIVE 매출 카드는 이후).
 * 읽기: `listBrandCampaigns(brand.id)` — 내 브랜드 전부(최신순) + 상품·인플루언서 요약 + 상태 칩 + 브랜드 다음 할 일(`brandNextAction`). 필터는 `?f=`(순수 `matchesBrandCampaignFilter`) — JS 없이 링크.
 */
const isFilter = (v: string | null): v is BrandCampaignFilter => BRAND_CAMPAIGN_FILTERS.some((f) => f.key === v);

export const load: PageServerLoad = async (event) => {
	const r = await requireBrand(event, { next: '/campaigns' });
	if (!r.ok) redirect(303, r.location);
	const { brand } = r.ctx;

	const all = await listBrandCampaigns(brand.id);
	const fParam = event.url.searchParams.get('f');
	const filter: BrandCampaignFilter = isFilter(fParam) ? fParam : 'all';
	const rows = all.map((c) => ({
		code: c.code,
		status: c.status,
		chip: c.chip,
		action: c.action,
		test_due: c.test_due,
		start_date: c.start_date,
		end_date: c.end_date,
		qty: c.qty,
		sold_qty: c.sold_qty,
		created_at: c.created_at,
		product: { name: c.product.name, emoji: c.product.emoji, thumb_url: c.product.thumb_url, commission_rate: c.product.commission_rate, sale_price: c.product.sale_price },
		seller: { name: c.seller.name, handle: c.seller.handle, platform: c.seller.platform, grade: c.seller.grade },
		href: brandPath(`/campaigns/${encodeURIComponent(c.code)}`),
		storeUrl: c.status === 'LIVE' ? `${SITE_URL}${storeUrl(c.seller.handle, c.code)}` : null,
		groups: {
			live: matchesBrandCampaignFilter(c.status, 'live'),
			soon: matchesBrandCampaignFilter(c.status, 'soon'),
			prep: matchesBrandCampaignFilter(c.status, 'prep'),
			done: matchesBrandCampaignFilter(c.status, 'done')
		}
	}));
	const listPath = brandPath('/campaigns');
	return {
		filter,
		chips: BRAND_CAMPAIGN_FILTERS.map((f) => ({
			key: f.key,
			label: f.label,
			n: rows.filter((c) => matchesBrandCampaignFilter(c.status, f.key)).length,
			href: f.key === 'all' ? listPath : `${listPath}?f=${f.key}`
		})),
		live: rows.filter((c) => c.groups.live),
		soon: rows.filter((c) => c.groups.soon),
		prep: rows.filter((c) => c.groups.prep),
		done: rows.filter((c) => c.groups.done),
		requestsPath: brandPath('/requests'),
		productsPath: brandPath('/products')
	};
};
