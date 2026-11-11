import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ORDER_CODE_RE } from '@sellery/myr-core/checkout-rules';
import { customerCanRefund } from '@sellery/myr-core/refund-rules';
import { hasAdmin } from '$lib/server/admin';
import { claimFormRules } from '$lib/server/claims';
import { myOrder } from '$lib/server/orders';

/** /orders/[code]/refund — 회원 교환 · 환불 신청 페이지(대표 시안 2026-11-03 · 0078 요청). 소유·로그인 판정은 주문 상세와 같다. 환불할 수 없는 주문이면 상세로 돌려보낸다(이유는 상세가 보여준다). */
export const load: PageServerLoad = async ({ params, locals, url }) => {
	const code = params.code.toLowerCase();
	if (!ORDER_CODE_RE.test(code)) error(404, { message: '주문을 찾을 수 없습니다' });
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);
	if (!hasAdmin()) error(503, { message: '주문 조회가 아직 설정되지 않았어요' });
	const order = await myOrder(user.id, code);
	if (!order) error(404, { message: '주문을 찾을 수 없습니다' });
	if (!customerCanRefund(order).ok) redirect(303, `/orders/${code}`);
	// 사유 규칙(사유 · 요청 종류 · 사진 필수 · 기한 적용 · 왕복 배송비)은 서버 값 — 요청 접수와 같은 DB 함수(0099)
	const rules = await claimFormRules();
	return { order, rules, backHref: `/orders/${code}` };
};
