import { json } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { RequestHandler } from './$types';
import { displayName } from '$lib/auth';
import { guestTokenCookieName } from '$lib/checkout-rules';
import { CS_TOKEN_COOKIE_DAYS, csFailMessage, csTokenCookieName, parseCsOpenInput, PRODUCT_CODE_RE } from '$lib/cs-rules';
import { hasAdmin } from '$lib/server/admin';
import { rejectCrossSite } from '$lib/server/checkout-sync';
import { openCs } from '$lib/server/cs';
import { rateLimit } from '$lib/server/rate-limit';

/**
 * POST /api/cs `{ productCode, type, body, order_code? }` — 상품 페이지 문의 시트(회원 전용). 비회원은 401 — 비회원 문의는 주문 상세의 상품 줄(/cs/new?order=)에서만.
 * 이름은 세션 표시명 · actor 는 세션 user.id. 주문 연결은 openCs 가 소유 증명(0063) — 비회원으로 산 주문이면 그 주문의 조회 토큰 쿠키도 함께.
 * 응답 { ok:true, code } + 비회원 쿠키와 같은 client_token 쿠키(같은 기기에서 회원 세션이 끊겨도 열리게) | { ok:false, code, message }.
 */
export const POST: RequestHandler = async ({ request, locals, cookies, getClientAddress }) => {
	const bad = rejectCrossSite(request);
	if (bad) return bad;
	if (!hasAdmin()) return json({ ok: false, code: 'CONFIG_ERROR', message: '문의 접수가 아직 설정되지 않았어요' }, { status: 503 });
	const { user } = await locals.safeGetSession();
	if (!user) return json({ ok: false, code: 'LOGIN_REQUIRED', message: '로그인하고 문의해주세요' }, { status: 401 });
	if (!rateLimit(`cs-open:${getClientAddress()}`, 5) || !rateLimit(`cs-open:u:${user.id}`, 5)) return json({ ok: false, code: 'RATE_LIMITED', message: csFailMessage('RATE_LIMITED') }, { status: 429 });
	const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const productCode = typeof raw?.productCode === 'string' ? raw.productCode.trim().toLowerCase() : '';
	if (!PRODUCT_CODE_RE.test(productCode)) return json({ ok: false, code: 'NOT_FOUND', message: csFailMessage('NOT_FOUND') }, { status: 404 });
	const parsed = parseCsOpenInput({ type: raw?.type, body: raw?.body, order_code: raw?.order_code, buyer_name: displayName(user).slice(0, 40) });
	if (!parsed.ok) return json({ ok: false, code: 'BAD_INPUT', field: parsed.field, message: parsed.message }, { status: 400 });
	const guestToken = parsed.orderCode ? (cookies.get(guestTokenCookieName(parsed.orderCode)) ?? null) : null;
	const res = await openCs(productCode, parsed, { userId: user.id, guestToken });
	if (!res.ok) return json({ ok: false, code: res.code, message: csFailMessage(res.code) }, { status: res.code === 'NOT_FOUND' ? 404 : 400 });
	cookies.set(csTokenCookieName(res.conversationCode), res.clientToken, { httpOnly: true, sameSite: 'lax', secure: !dev, path: '/', maxAge: CS_TOKEN_COOKIE_DAYS * 24 * 60 * 60 });
	return json({ ok: true, code: res.conversationCode, sellerName: res.sellerName, orderMatched: res.orderMatched });
};
