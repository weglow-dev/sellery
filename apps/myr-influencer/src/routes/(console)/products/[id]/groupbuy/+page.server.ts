import { redirect } from '@sveltejs/kit';
import { env as pub } from '$env/dynamic/public';
import type { PageServerLoad } from './$types';
import { siteOrigin } from '@sellery/myr-core/site';
import { sellerGroupbuys } from '$lib/server/groupbuy';
import { requireSeller } from '$lib/server/seller';

/**
 * 공구 링크(0086) — 내 제품 메뉴 → [공구 링크]. 상품의 공구(진행 중 · 예정 · 지난 것)와 링크별 실적.
 * 남의 상품 · 없는 상품이면 내 제품으로. 링크 주소는 샵 주소(PUBLIC_MYR_SHOP_URL) + /g/<code>. 크리에이터는 세션에서만(결정 3).
 */
export const load: PageServerLoad = async (event) => {
	const seller = await requireSeller(event);
	const found = /^[0-9a-f-]{36}$/.test(event.params.id) ? await sellerGroupbuys(seller.id, event.params.id) : null;
	if (!found) redirect(303, '/products');
	return { ...found, shopOrigin: siteOrigin(pub.PUBLIC_MYR_SHOP_URL) };
};
