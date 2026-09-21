import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CELERY_PER } from '@sellery/core/constants';
import { SITE_URL } from '$lib/server/env';
import { getHomeWidgets, requireSeller, sellerPath } from '$lib/server/partner';

/**
 * 인플루언서 콘솔 홈 — 3단계 3위젯 (docs/inf-console-plan.md §6 `/home` · §7 "3." · 프로토타입 js/20-seller.js vSellerHome 의 지금 할 일 · 진행 중(LIVE) 카드 · 내 자산).
 * `requireSeller()` 컨텍스트(요약·잔액) + `getHomeWidgets(seller, balance)`(채널 · 캠페인 · 오늘 주문 집계 · 등급표). ok 가 아니면 location 으로 redirect(§2.2 · §2.4).
 * 2단계의 "지금 할 일" 3장(채널 인증 · 계좌 등록 · 첫 상품)은 위젯의 todo kind(channel_verify · bank_info · first_product)로 흡수됐다.
 */
export const load: PageServerLoad = async (event) => {
	const r = await requireSeller(event, { next: '/home' });
	if (!r.ok) redirect(303, r.location);
	const { seller, balance } = r.ctx;
	const widgets = await getHomeWidgets(seller, balance);
	const live = widgets.live.map((c) => ({
		...c,
		href: sellerPath(`/campaigns/${encodeURIComponent(c.code)}`),
		storeUrl: `${SITE_URL}${c.store_url}`
	}));
	const m3 = widgets.assets.m3_sales;
	return {
		seller,
		balance,
		todos: widgets.todos,
		live,
		assets: widgets.assets,
		toNextCel: CELERY_PER - (m3 % CELERY_PER),
		productsPath: sellerPath('/products'),
		campaignsPath: sellerPath('/campaigns'),
		myPath: sellerPath('/my')
	};
};
