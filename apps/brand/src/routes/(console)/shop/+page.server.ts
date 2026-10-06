import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { shopBuyMessage } from '@sellery/db/shop/shop-rules';
import { buyShopItem, getShop, RATE_LIMIT_MESSAGE, rateLimit, requireBrand, brandPath } from '$lib/server/brand';

/**
 * `/shop` — 셀러리 샵 (프로토타입 `(demo)/shop` · `packages/ui/views/Shop.svelte` · 0037).
 * 데모 화면은 이 PR 에서 지웠다 — 실서비스가 `/shop` 을 가져갔다(브랜드 `/gallery` 때와 같은 방식).
 *
 * load: `requireBrand` → `getShop('seller', seller.id)` RPC 1회 — 카탈로그(`platform_settings.shop_items`)
 *   + 보유 상태(만료일) + 🥬 잔액 + 최근 원장 8건.
 * **충전 카드는 없다** — 유상 충전 미도입(`points-policy.md` §0). 대신 "어떻게 쌓이나" 를 적는다.
 * 효과가 아직 없는 아이템(`우선 검수권`)은 `available:false` 로 와서 "준비 중" 으로 막힌다.
 *   자동 차감 아이템(제안권 · 레퍼런스 열람권 · 데이터 확인)은 구매 버튼 없이 안내만 보인다 — 0035·0036 이 쓴다.
 *
 * action buy: `itemId` 를 받아 `buyShopItem` — 효과(상품 부스트 · 고객 홈 노출 · 데이터 패스)는 RPC 가 바로 적용한다.
 *   적용 대상이 없으면 `NO_TARGET_*` 로 실패하고 **차감하지 않는다**(프로토타입과 같다).
 *   성공/실패 모두 303 `?msg=`/`?err=` — 평범한 POST 라 JS 가 필요 없다.
 */
export const load: PageServerLoad = async (event) => {
	const r = await requireBrand(event, { next: '/shop' });
	if (!r.ok) redirect(303, r.location);

	const shop = await getShop('brand', r.ctx.brand.id);
	const msg = event.url.searchParams.get('msg');
	const err = event.url.searchParams.get('err');

	return {
		balance: r.ctx.balance,
		shop,
		failed: shop === null,
		notice: err ? { tone: 'danger' as const, text: err } : msg ? { tone: 'ok' as const, text: msg } : null,
		salesPath: brandPath('/sales'),
		galleryPath: brandPath('/gallery'),
		productsPath: brandPath('/products')
	};
};

const self = brandPath('/shop');

export const actions: Actions = {
	buy: async (event) => {
		const r = await requireBrand(event, { next: '/shop' });
		if (!r.ok) redirect(303, r.location);
		if (!rateLimit(`shop-buy:${r.ctx.user.id}`)) redirect(303, `${self}?err=${encodeURIComponent(RATE_LIMIT_MESSAGE)}`);

		const fd = await event.request.formData();
		const itemId = fd.get('item');
		if (typeof itemId !== 'string' || itemId.length === 0) redirect(303, `${self}?err=${encodeURIComponent('아이템을 찾을 수 없어요')}`);

		const out = await buyShopItem('brand', r.ctx.brand.id, itemId);
		const text = shopBuyMessage(out);
		redirect(303, `${self}?${out.ok ? 'msg' : 'err'}=${encodeURIComponent(text)}`);
	}
};
