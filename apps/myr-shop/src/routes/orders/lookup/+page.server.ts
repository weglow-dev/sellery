import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { Actions, PageServerLoad } from './$types';
import { GUEST_TOKEN_COOKIE_MAX_AGE, guestOrderHref, guestTokenCookieName, ORDER_CODE_RE } from '@sellery/myr-core/checkout-rules';
import { GUEST_LOOKUP_FAIL, parseLookupInput } from '@sellery/myr-core/order-view';
import { hasAdmin } from '$lib/server/admin';
import { lookupGuestOrder } from '$lib/server/orders';
import { rateLimit } from '$lib/server/rate-limit';

/** /orders/lookup — 비회원 주문 조회: 주문번호 + 연락처 → 토큰 발급(회전) → HttpOnly 쿠키 → /orders/g/<code>. IP 30분 5회. 실패 사유는 구분하지 않는다(열거 방지). */
export const load: PageServerLoad = ({ url }) => {
	// 캐시 헤더는 레이아웃(+layout.server.ts)이 한 번만 — 여기서 또 setHeaders 하면 "already set" 으로 500
	const code = (url.searchParams.get('code') ?? '').toLowerCase();
	return { prefill: ORDER_CODE_RE.test(code) ? code.toUpperCase() : '' };
};

export const actions: Actions = {
	default: async (event) => {
		const form = await event.request.formData();
		const codeRaw = form.get('code');
		const phoneRaw = form.get('phone');
		const parsed = parseLookupInput(codeRaw, phoneRaw);
		const values = { code: typeof codeRaw === 'string' ? codeRaw : '', phone: typeof phoneRaw === 'string' ? phoneRaw : '' };
		if (!parsed.ok) return fail(400, { values, field: parsed.field, message: parsed.message });
		if (!rateLimit(`order-lookup:ip:${event.getClientAddress()}`, 5))
			return fail(429, { values, field: null, message: '조회 시도가 너무 많아요 — 30분 뒤 다시 시도해주세요' });
		if (!hasAdmin()) return fail(503, { values, field: null, message: '주문 조회가 아직 설정되지 않았어요' });
		let r;
		try {
			r = await lookupGuestOrder(parsed.code, parsed.phone);
		} catch (e) {
			console.error('[orders/lookup] failed:', e instanceof Error ? e.message : e);
			return fail(500, { values, field: null, message: '잠시 후 다시 시도해주세요' });
		}
		if (!r.ok) return fail(404, { values, field: null, message: GUEST_LOOKUP_FAIL });
		event.cookies.set(guestTokenCookieName(r.orderCode), r.token, {
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			path: '/',
			maxAge: GUEST_TOKEN_COOKIE_MAX_AGE
		});
		redirect(303, guestOrderHref(r.orderCode));
	}
};
