import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { guestTokenCookieName, ORDER_CODE_RE } from '@sellery/myr-core/checkout-rules';
import { REFUND_PHOTO_MAX_BYTES, refundMessage, UUID_RE } from '@sellery/myr-core/refund-rules';
import { admin, hasAdmin } from '$lib/server/admin';
import { apiError, rejectCrossSite } from '$lib/server/checkout-sync';
import { verifyGuestOrder } from '$lib/server/customers';
import { rateLimit } from '$lib/server/rate-limit';
import { removeRefundPhoto, uploadRefundPhoto } from '$lib/server/refund-photos';

/**
 * 환불 신청 사진(0068) — 신청 페이지가 고르는 즉시 올리고, 신청 본문(`POST /api/payments/cancel` items[].photos)에 경로만 싣는다.
 *   POST   multipart { orderCode, itemId, file }  → { ok, path }   본인 주문의 줄(발송 전 · 환불 전)만 · 줄당 3장 · 4MB · jpeg/png/webp(매직 바이트) · IP 30분 30건
 *   DELETE json      { orderCode, path }          → { ok }         그 주문 아래 경로만
 * actor 는 세션(회원 user.id → 주문 user_id) 또는 쿠키 조회 토큰(비회원)에서만 — cancel API 와 같다.
 */
export const config: Config = { maxDuration: 30 };

async function ownedOrderId(locals: App.Locals, cookies: { get(name: string): string | undefined }, orderCode: string): Promise<string | null> {
	const { user } = await locals.safeGetSession();
	if (user) {
		const { data } = await admin().from('myr_orders').select('id').eq('code', orderCode).eq('user_id', user.id).maybeSingle();
		return (data as { id: string } | null)?.id ?? null;
	}
	return verifyGuestOrder(orderCode, cookies.get(guestTokenCookieName(orderCode)));
}

export const POST: RequestHandler = async ({ request, locals, cookies, getClientAddress }) => {
	const cross = rejectCrossSite(request, { multipart: true });
	if (cross) return cross;
	if (!hasAdmin()) return apiError(503, 'NO_SERVICE_KEY', refundMessage('NO_SERVICE_KEY'));
	if (!rateLimit(`refund-photo:${getClientAddress()}`, 30)) return apiError(429, 'RATE_LIMITED', '요청이 많아요 — 잠시 후 다시 시도해주세요');
	let fd: FormData;
	try {
		fd = await request.formData();
	} catch {
		return apiError(400, 'BAD_REQUEST', '파일을 읽지 못했어요');
	}
	const orderCode = String(fd.get('orderCode') ?? '').trim().toLowerCase();
	const itemId = String(fd.get('itemId') ?? '').trim();
	const file = fd.get('file');
	if (!ORDER_CODE_RE.test(orderCode) || !UUID_RE.test(itemId) || !(file instanceof File)) return apiError(400, 'BAD_REQUEST', '요청을 확인해주세요');
	if (file.size > REFUND_PHOTO_MAX_BYTES) return apiError(400, 'BAD_FILE', '사진은 4MB 이하 jpg·png·webp 만 올릴 수 있어요');

	const orderId = await ownedOrderId(locals, cookies, orderCode);
	if (!orderId) return apiError(401, 'UNAUTHORIZED', refundMessage('FORBIDDEN'));
	// 이 주문의 줄 · 남은 수량이 있어야(환불 대상)
	// 살아 있는 줄 판정은 DB myr_line_live 한 곳(0098 · PostgREST 계산 칸) — 여기서 상태 · 수량으로 다시 판정하지 않는다
	const { data: line } = await admin().from('myr_order_items').select('id, myr_line_live').eq('id', itemId).eq('order_id', orderId).maybeSingle();
	const l = line as { id: string; myr_line_live: boolean | null } | null;
	if (!l || l.myr_line_live !== true) return apiError(404, 'NOT_FOUND', refundMessage('NOT_FOUND'));

	const bytes = new Uint8Array(await file.arrayBuffer());
	const r = await uploadRefundPhoto(orderId, itemId, { bytes, size: file.size });
	if (!r.ok) {
		if (r.code === 'BAD_FILE') return apiError(400, 'BAD_FILE', '사진은 4MB 이하 jpg·png·webp 만 올릴 수 있어요');
		if (r.code === 'TOO_MANY') return apiError(400, 'TOO_MANY', '사진은 제품당 3장까지 올릴 수 있어요');
		return apiError(500, 'DB_ERROR', '사진을 올리지 못했어요 — 잠시 후 다시 시도해주세요');
	}
	return json({ ok: true, path: r.path });
};

export const DELETE: RequestHandler = async ({ request, locals, cookies }) => {
	const cross = rejectCrossSite(request);
	if (cross) return cross;
	if (!hasAdmin()) return apiError(503, 'NO_SERVICE_KEY', refundMessage('NO_SERVICE_KEY'));
	const body = (await request.json().catch(() => null)) as { orderCode?: unknown; path?: unknown } | null;
	const orderCode = typeof body?.orderCode === 'string' ? body.orderCode.trim().toLowerCase() : '';
	const path = typeof body?.path === 'string' ? body.path : '';
	if (!ORDER_CODE_RE.test(orderCode) || !path) return apiError(400, 'BAD_REQUEST', '요청을 확인해주세요');
	const orderId = await ownedOrderId(locals, cookies, orderCode);
	if (!orderId) return apiError(401, 'UNAUTHORIZED', refundMessage('FORBIDDEN'));
	const ok = await removeRefundPhoto(orderId, path);
	return ok ? json({ ok: true }) : apiError(400, 'BAD_REQUEST', '지울 수 없는 사진이에요');
};
