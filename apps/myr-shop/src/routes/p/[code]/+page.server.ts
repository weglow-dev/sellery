import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Groupbuy } from '@sellery/myr-core/groupbuy';
import { GB_COOKIE, readGbCookie } from '$lib/groupbuy-link';
import { hasAdmin } from '$lib/server/admin';
import { quoteActor, quoteCart } from '$lib/server/cart';
import { getProductCard } from '$lib/server/db';
import { lookupGroupbuy } from '$lib/server/groupbuy';

/** 상품 페이지 `/p/<code>` — `myr_product_card(code)`. listed 가 아니면 RPC 가 null → 404.
 *  공구 링크(`/g/<code>` · 0086)로 들어온 적이 있으면 쿠키의 공구를 다시 확인해 `groupbuy` 로 싣는다(이 상품의 공구일 때만). 조회가 실패해도 상품은 보여 준다.
 *  `quote` = 1개 견적(장바구니와 같은 서버 견적 0092 · 0115) — [담기] 금액 · 무료배송 기준(free_over). 실패하면 null(화면은 금액 없이 "담기") */
export const load: PageServerLoad = async ({ params, cookies, locals }) => {
	const code = params.code.toLowerCase();
	const gbCode = readGbCookie(cookies.get(GB_COOKIE))[code];
	const gbP: Promise<Groupbuy | null> =
		gbCode && hasAdmin()
			? lookupGroupbuy(gbCode)
					.then((r) => (r && r.productCode === code ? r.groupbuy : null))
					.catch((e) => {
						console.error('[p] groupbuy lookup failed:', e instanceof Error ? e.message : e);
						return null;
					})
			: Promise.resolve(null);
	const card = await getProductCard(code);
	if (!card) error(404, { message: '제품을 찾을 수 없습니다' });
	const groupbuy = await gbP;
	// 담기와 같은 공구 코드 — 끝난 공구는 싣지 않는다(+page.svelte add())
	const gb = groupbuy && groupbuy.state !== 'ended' ? groupbuy.code : undefined;
	const quote = hasAdmin()
		? await quoteActor(locals, cookies)
				.then((actor) => quoteCart([{ code, optionIndex: 0, qty: 1, ...(gb ? { gb } : {}) }], actor))
				.then((r) => (r.ok ? r.quote : null))
				.catch((e) => {
					console.error('[p] quote failed:', e instanceof Error ? e.message : e);
					return null;
				})
		: null;
	return { ...card, groupbuy, quote };
};
