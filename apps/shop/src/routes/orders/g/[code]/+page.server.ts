import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { GUEST_ORDER_CODE_RE, guestTokenCookieName } from '@sellery/db/guest-order';
import { fetchGuestOrder, fetchOrderSettings } from '$lib/server/db';

/**
 * `/orders/g/[code]` — 비회원 주문 상세 (0021). 인증은 HttpOnly 쿠키 `slry_guest_<code>` 의 조회 토큰뿐 —
 * app_guest_order_verify(sha256 대조) 통과 → fetchOrderById(회원 상세와 같은 조인 · MyOrder) → $lib/components/OrderDetail (회원 화면과 같은 본문).
 * 쿠키 없음·불일치·주문 없음은 전부 `/orders/lookup?code=<code>&msg=expired` 로 (주문번호 존재 여부를 404 로 구분해 주지 않는다).
 */
export const load: PageServerLoad = async ({ params, cookies }) => {
	const code = params.code.trim().toLowerCase();
	const back = `/orders/lookup?code=${encodeURIComponent(code)}&msg=expired`;
	if (!GUEST_ORDER_CODE_RE.test(code)) redirect(303, '/orders/lookup');

	let order = null;
	try {
		order = await fetchGuestOrder(code, cookies.get(guestTokenCookieName(code)));
	} catch (e) {
		console.error('[orders/g] fetch failed:', e instanceof Error ? e.message : e);
	}
	if (!order) redirect(303, back);
	const settings = await fetchOrderSettings();
	return { order, settings };
};
