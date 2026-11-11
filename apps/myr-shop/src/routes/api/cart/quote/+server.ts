import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseQuoteBody } from '$lib/cart';
import { hasAdmin } from '$lib/server/admin';
import { quoteCart } from '$lib/server/cart';
import { rejectCrossSite } from '$lib/server/checkout-sync';
import { rateLimit } from '$lib/server/rate-limit';

/**
 * POST /api/cart/quote { all, selected } → { ok, all, selected } — 장바구니 줄 단가 · 공구 적용 · 상품 합계 · 배송비 · 무료배송까지 남은 금액(0092 myr_app_cart_quote).
 * 체크아웃(myr_app_create_checkout)과 같은 함수(myr_line_price · myr_shipping_fee)라 화면 금액 = 결제 금액. 화면은 이 값을 그대로 쓰고 다시 계산하지 않는다.
 *   all = 살 수 있는 줄 전부(줄마다 단가 · 공구 표시) · selected = 주문에 들어갈 줄(합계 · 배송비). 회원 · 비회원 같음(가격은 공개 정보) · IP 30분 300건.
 */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const cross = rejectCrossSite(request);
	if (cross) return cross;
	const body = parseQuoteBody(await request.json().catch(() => null));
	if (!body) return json({ ok: false, code: 'BAD_REQUEST' }, { status: 400 });
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY' }, { status: 503 });
	if (!rateLimit(`cart-quote:${getClientAddress()}`, 300)) return json({ ok: false, code: 'RATE_LIMITED' }, { status: 429 });
	try {
		const [all, selected] = await Promise.all([quoteCart(body.all), quoteCart(body.selected)]);
		// 서버 거절(BAD_LINES — 수량 형식 등)은 400 으로 그대로 · 그 밖은 500
		const bad = !all.ok ? all : !selected.ok ? selected : null;
		if (bad) return json({ ok: false, code: bad.code }, { status: bad.code === 'BAD_LINES' ? 400 : 500 });
		if (!all.ok || !selected.ok) return json({ ok: false, code: 'BAD_RESPONSE' }, { status: 500 });
		return json({ ok: true, all: all.quote, selected: selected.quote });
	} catch (e) {
		console.error('[api/cart/quote] failed:', e instanceof Error ? e.message : e);
		return json({ ok: false, code: 'DB_ERROR' }, { status: 500 });
	}
};
