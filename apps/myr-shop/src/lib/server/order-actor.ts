/**
 * 고객 주문 API 의 actor — 회원 = 세션 user.id(주문 user_id 와 같아야) · 비회원 = 쿠키 조회 토큰(myr_guest_<code>) 검증 → 주문의 customer_id.
 * 요청 본문의 id 는 믿지 않는다(백엔드 원칙 6). 환불 신청(/api/payments/cancel) · 교환·환불 요청(/api/claims) · 예상 금액(/api/refunds/quote)이 같이 쓴다.
 */
import type { Cookies } from '@sveltejs/kit';
import { guestTokenCookieName } from '@sellery/myr-core/checkout-rules';
import { admin } from './admin';
import { verifyGuestOrder } from './customers';

export type OrderActor = { ok: true; orderId: string; actorId: string | null } | { ok: false; code: 'UNAUTHORIZED' | 'NOT_FOUND' };

export async function orderActor(locals: App.Locals, cookies: Pick<Cookies, 'get'>, orderCode: string): Promise<OrderActor> {
	const db = admin();
	const { user } = await locals.safeGetSession();
	if (user) {
		const { data } = await db.from('myr_orders').select('id').eq('code', orderCode).eq('user_id', user.id).maybeSingle();
		const id = (data as { id: string } | null)?.id ?? null;
		return id ? { ok: true, orderId: id, actorId: user.id } : { ok: false, code: 'NOT_FOUND' };
	}
	const id = await verifyGuestOrder(orderCode, cookies.get(guestTokenCookieName(orderCode)));
	if (!id) return { ok: false, code: 'UNAUTHORIZED' };
	const { data } = await db.from('myr_orders').select('id, customer_id').eq('id', id).maybeSingle();
	const row = data as { id: string; customer_id: string | null } | null;
	return row ? { ok: true, orderId: row.id, actorId: row.customer_id } : { ok: false, code: 'NOT_FOUND' };
}
