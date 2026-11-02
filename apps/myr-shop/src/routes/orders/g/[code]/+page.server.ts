import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { guestTokenCookieName, ORDER_CODE_RE } from '$lib/checkout-rules';
import { hasAdmin } from '$lib/server/admin';
import { csForOrder } from '$lib/server/cs';
import { guestOrder } from '$lib/server/orders';

/** /orders/g/[code] — 비회원 주문 상세. HttpOnly 쿠키 `myr_guest_<code>` 의 토큰이 맞을 때만. 없거나 틀리면 조회 화면으로. */
export const load: PageServerLoad = async ({ params, cookies }) => {
	// 캐시 헤더는 레이아웃이 한 번만 붙인다
	const code = params.code.toLowerCase();
	if (!ORDER_CODE_RE.test(code)) error(404, { message: '주문을 찾을 수 없습니다' });
	if (!hasAdmin()) error(503, { message: '주문 조회가 아직 설정되지 않았어요' });
	const order = await guestOrder(code, cookies.get(guestTokenCookieName(code)));
	if (!order) redirect(303, `/orders/lookup?code=${encodeURIComponent(code)}`);
	return { order, inquiries: await csForOrder(order.id) };
};
