import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { parseCancelBody, refundMessage } from '@sellery/myr-core/refund-rules';
import { hasAdmin } from '$lib/server/admin';
import { rejectCrossSite } from '$lib/server/checkout-sync';
import { orderActor } from '$lib/server/order-actor';
import { refundItems } from '$lib/server/refund';

/**
 * POST /api/payments/cancel — 고객 환불 신청 { orderCode, items?: [{ itemId, qty }], reason? } (items 없으면 남은 전부).
 * actor 는 세션에서: 회원 = user.id(customer) · 비회원 = 쿠키 토큰(myr_guest_<code>) 검증 → 주문의 customer_id. 둘 다 아니면 401.
 * 가드·금액은 0061 precheck(발송 전 · 본인 주문 · 남은 수량) → 토스 부분 취소 → record. 응답 { ok, status, amount, refunded, already } · 실패 { ok:false, code, message, items? }.
 */
export const config: Config = { maxDuration: 30 };
const fail = (status: number, code: string, message?: string | null, extra?: Record<string, unknown>) =>
	json({ ok: false, code, message: refundMessage(code, message), ...(extra ?? {}) }, { status });

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const cross = rejectCrossSite(request);
	if (cross) return cross;
	const body = parseCancelBody(await request.json().catch(() => null));
	if (!body) return fail(400, 'BAD_REQUEST');
	if (!hasAdmin()) return fail(503, 'NO_SERVICE_KEY');

	const who = await orderActor(locals, cookies, body.orderCode);
	if (!who.ok) return fail(who.code === 'UNAUTHORIZED' ? 401 : 404, who.code);
	const { orderId, actorId } = who;

	try {
		const r = await refundItems({ actor: 'customer', actorId, orderId, items: body.items, reason: body.reason });
		if (!r.ok)
			return fail(r.code === 'NOT_FOUND' ? 404 : r.code === 'CANCEL_UNCERTAIN' ? 500 : 400, r.code, r.message, r.items ? { items: r.items } : undefined);
		return json({ ok: true, status: r.status, amount: r.amount, refunded: r.refunded, already: r.already || undefined });
	} catch (e) {
		console.error('[cancel] refund failed:', e instanceof Error ? e.message : e);
		return fail(500, 'DB_ERROR', '잠시 후 다시 시도해주세요');
	}
};
