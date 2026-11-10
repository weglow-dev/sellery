import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Groupbuy } from '@sellery/myr-core/groupbuy';
import { GB_ARRIVED_COOKIE, GB_COOKIE, readGbCookie } from '$lib/groupbuy-link';
import { hasAdmin } from '$lib/server/admin';
import { getProductCard } from '$lib/server/db';
import { lookupGroupbuy } from '$lib/server/groupbuy';

/** 상품 페이지 `/p/<code>` — `myr_product_card(code)`. listed 가 아니면 RPC 가 null → 404.
 *  공구 링크(`/g/<code>` · 0086)로 들어온 적이 있으면 쿠키의 공구를 다시 확인해 `groupbuy` 로 싣는다(이 상품의 공구일 때만). 조회가 실패해도 상품은 보여 준다.
 *  `gbArrived` = 링크로 막 들어옴(`myr_gb_new` 쿠키 · 읽고 지운다) — 화면이 끝난 공구 토스트를 그때만 띄운다 */
export const load: PageServerLoad = async ({ params, cookies }) => {
	const code = params.code.toLowerCase();
	const gbCode = readGbCookie(cookies.get(GB_COOKIE))[code];
	const gbArrived = cookies.get(GB_ARRIVED_COOKIE) === code;
	if (cookies.get(GB_ARRIVED_COOKIE) !== undefined) cookies.delete(GB_ARRIVED_COOKIE, { path: '/' });
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
	return { ...card, groupbuy: await gbP, gbArrived };
};
