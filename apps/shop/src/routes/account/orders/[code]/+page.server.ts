import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ORDER_CODE_RE, fetchMyOrder, fetchOrderSettings } from '$lib/server/db';

/**
 * /account/orders/[code] — 주문 상세 (reuse-map §1.5 glo orders/[orderId] 개작 · app-plan §6.1 · web account/orders/[code]/page.tsx 1:1).
 *   · 미로그인 → /login?next= (목록과 달리 리다이렉트 — §4.1 "상세·API 는 401/redirect")
 *   · service fetchMyOrder(user.id, code) — user_id 불일치·없음·형식 오류 → 404 (orders/+error.svelte "주문을 찾을 수 없습니다")
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	const { code } = params;
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, `/login?next=${encodeURIComponent(`/account/orders/${code}`)}`);
	if (!ORDER_CODE_RE.test(code)) error(404, { message: '주문을 찾을 수 없습니다' });

	const [order, settings] = await Promise.all([fetchMyOrder(user.id, code), fetchOrderSettings()]);
	if (!order) error(404, { message: '주문을 찾을 수 없습니다' });
	return { order, settings };
};
