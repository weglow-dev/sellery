import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { parseRefundQuoteBody, refundMessage } from '@sellery/myr-core/refund-rules';
import { hasAdmin } from '$lib/server/admin';
import { rejectCrossSite } from '$lib/server/checkout-sync';
import { claimOpenDeduction } from '$lib/server/claims';
import { orderActor } from '$lib/server/order-actor';
import { rateLimit } from '$lib/server/rate-limit';
import { refundQuote } from '$lib/server/refund';

/**
 * POST /api/refunds/quote — 신청 화면의 예상 환불 금액 { orderCode, mode, reason?, items: [{ itemId, qty }] } → { ok, amount, paid, goods, shippingBack, deduction, full, lines: [{ itemId, qty, amount }] }.
 * 금액은 실제 환불과 같은 함수(refundQuote = precheck → 차감)로 계산한다 — 화면이 따로 계산하지 않는다(백엔드 원칙 1). 돈은 움직이지 않는다.
 *   mode instant = 바로 환불(결제완료 줄 · actor customer — cancel API 와 같은 가드)
 *   mode claim   = 교환·환불 요청(배송준비중 이후 줄) — 소유는 orderActor 로 확인했으니 precheck 는 actor system(실제 환불도 운영 · 크론이 한다) · 차감 = 서버 myr_claim_open_deduction(단순 변심 환불 → 왕복 배송비 · 0099)
 * actor 는 세션 · 쿠키에서만(orderActor). 고르는 대로 부르므로 IP 30분 120건.
 */
export const config: Config = { maxDuration: 15 };
const fail = (status: number, code: string, message?: string | null) => json({ ok: false, code, message: refundMessage(code, message) }, { status });

export const POST: RequestHandler = async ({ request, locals, cookies, getClientAddress }) => {
	const cross = rejectCrossSite(request);
	if (cross) return cross;
	const body = parseRefundQuoteBody(await request.json().catch(() => null));
	if (!body) return fail(400, 'BAD_REQUEST');
	if (!hasAdmin()) return fail(503, 'NO_SERVICE_KEY');
	if (!rateLimit(`refund-quote:${getClientAddress()}`, 120)) return fail(429, 'RATE_LIMITED', '요청이 많아요 — 잠시 후 다시 시도해주세요');

	const who = await orderActor(locals, cookies, body.orderCode);
	if (!who.ok) return fail(who.code === 'UNAUTHORIZED' ? 401 : 404, who.code);

	try {
		const claim = body.mode === 'claim';
		const deduction = claim ? await claimOpenDeduction('refund', body.reason) : 0;
		if (deduction === null) return fail(500, 'DB_ERROR', '잠시 후 다시 시도해주세요');
		const r = await refundQuote({
			actor: claim ? 'system' : 'customer',
			actorId: claim ? null : who.actorId,
			orderId: who.orderId,
			items: body.items,
			deduction
		});
		if (!r.ok) return fail(r.code === 'NOT_FOUND' ? 404 : 400, r.code, r.message);
		const { amount, paid, goods, shippingBack, deduction: deducted, full, deposit, lines } = r.quote;
		return json({ ok: true, amount, paid, goods, shippingBack, deduction: deducted, full, deposit, lines });
	} catch (e) {
		console.error('[refund-quote] failed:', e instanceof Error ? e.message : e);
		return fail(500, 'DB_ERROR', '잠시 후 다시 시도해주세요');
	}
};
