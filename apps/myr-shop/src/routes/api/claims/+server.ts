import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { claimMessage, parseClaimOpenBody } from '@sellery/myr-core/claim-rules';
import { hasAdmin } from '$lib/server/admin';
import { rejectCrossSite } from '$lib/server/checkout-sync';
import { openClaims } from '$lib/server/claims';
import { orderActor } from '$lib/server/order-actor';
import { rateLimit } from '$lib/server/rate-limit';

/**
 * POST /api/claims — 교환·환불 요청 남기기(0078 · 배송준비중 이후 줄) { orderCode, kind, reason, items: [{ itemId, qty, note?, photos? }] }.
 * 결제완료(발주 전) 줄은 여기가 아니라 /api/payments/cancel(즉시 환불) — RPC 가 NOT_PREPARED 로 막는다.
 * actor 는 세션에서: 회원 = user.id · 비회원 = 쿠키 토큰(myr_guest_<code>) 검증 → 주문의 customer_id(cancel API 와 같다). 둘 다 아니면 401.
 * 응답 { ok, codes } · 실패 { ok:false, code, message, items? } · 접수되면 줄의 크리에이터에게 메일. IP 30분 10건.
 */
export const config: Config = { maxDuration: 30 };
const fail = (status: number, code: string, items?: { item_id: string; reason: string }[]) => json({ ok: false, code, message: claimMessage(code, items), ...(items ? { items } : {}) }, { status });

export const POST: RequestHandler = async ({ request, locals, cookies, getClientAddress }) => {
	const cross = rejectCrossSite(request);
	if (cross) return cross;
	const body = parseClaimOpenBody(await request.json().catch(() => null));
	if (!body) return fail(400, 'BAD_REQUEST');
	if (!hasAdmin()) return fail(503, 'NO_SERVICE_KEY');
	if (!rateLimit(`claim:${getClientAddress()}`, 10)) return json({ ok: false, code: 'RATE_LIMITED', message: '요청이 많아요 — 잠시 후 다시 시도해주세요' }, { status: 429 });

	const who = await orderActor(locals, cookies, body.orderCode);
	if (!who.ok) return fail(who.code === 'UNAUTHORIZED' ? 401 : 404, who.code);
	const { orderId, actorId } = who;

	const r = await openClaims(orderId, actorId, body);
	if (!r.ok) return fail(r.code === 'NOT_FOUND' ? 404 : r.code === 'DB_ERROR' ? 500 : 400, r.code, r.items);
	return json({ ok: true, codes: r.codes });
};
