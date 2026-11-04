import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { guestTokenCookieName, ORDER_CODE_RE } from '@sellery/myr-core/checkout-rules';
import { customerCanRefund } from '@sellery/myr-core/refund-rules';
import { hasAdmin } from '$lib/server/admin';
import { guestOrder } from '$lib/server/orders';

/** /orders/g/[code]/refund — 비회원 환불 신청 페이지. 조회 토큰 쿠키 `myr_guest_<code>` 가 맞을 때만(주문 상세와 같다). 환불할 수 없으면 상세로. */
export const load: PageServerLoad = async ({ params, cookies }) => {
	const code = params.code.toLowerCase();
	if (!ORDER_CODE_RE.test(code)) error(404, { message: '주문을 찾을 수 없습니다' });
	if (!hasAdmin()) error(503, { message: '주문 조회가 아직 설정되지 않았어요' });
	const order = await guestOrder(code, cookies.get(guestTokenCookieName(code)));
	if (!order) redirect(303, `/orders/lookup?code=${encodeURIComponent(code)}`);
	if (!customerCanRefund(order).ok) redirect(303, `/orders/g/${code}`);
	return { order, backHref: `/orders/g/${code}` };
};
