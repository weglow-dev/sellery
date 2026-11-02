import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ORDER_CODE_RE } from '$lib/checkout-rules';
import { hasAdmin } from '$lib/server/admin';
import { csForOrder } from '$lib/server/cs';
import { myOrder } from '$lib/server/orders';

/** /orders/[code] — 회원 주문 상세. 로그인 필요(아니면 로그인 뒤 복귀) · 본인 주문이 아니면 404(존재 여부 미노출). 비회원은 /orders/g/[code]. */
export const load: PageServerLoad = async ({ params, locals, url }) => {
	// 캐시 헤더는 레이아웃이 한 번만 붙인다
	const code = params.code.toLowerCase();
	if (!ORDER_CODE_RE.test(code)) error(404, { message: '주문을 찾을 수 없습니다' });
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	if (!hasAdmin()) error(503, { message: '주문 조회가 아직 설정되지 않았어요' });
	const order = await myOrder(user.id, code);
	if (!order) error(404, { message: '주문을 찾을 수 없습니다' });
	return { order, inquiries: await csForOrder(order.id) };
};
