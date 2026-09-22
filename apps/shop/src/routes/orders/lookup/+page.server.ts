import { fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { Actions, PageServerLoad } from './$types';
import { GUEST_LOOKUP_FAIL, GUEST_ORDER_CODE_RE, GUEST_TOKEN_COOKIE_MAX_AGE, guestOrderHref, guestTokenCookieName, parseGuestLookupInput } from '@sellery/db/guest-order';
import { RATE_LIMIT_MESSAGE, lookupGuestOrder, rateLimit } from '$lib/server/db';

/**
 * `/orders/lookup` — 비회원 주문 조회 (0021 · owner 결정 2026-09-22 · docs/app-plan.md §6.1).
 * 폼 주문번호 + 연락처 → `?/lookup`: 레이트리밋 **IP 30분 5회**(열거 방지) → parseGuestLookupInput → app_guest_order_lookup(주문번호, 숫자 연락처)
 *   → 성공: 새 조회 토큰을 HttpOnly 쿠키 `slry_guest_<code>`(90일 · Lax · prod Secure)로 심고 303 `/orders/g/<code>` (토큰은 HTML 에 절대 노출하지 않는다)
 *   → 실패: 주문번호 없음·연락처 불일치·회원 주문을 구분하지 않는 한 문구(GUEST_LOOKUP_FAIL) + 입력값 유지.
 * `?code=` 는 주문번호 프리필(상세 페이지에서 토큰이 없을 때 되돌아옴). 회원이 로그인 상태로 와도 막지 않는다(비회원으로 산 주문을 찾을 수 있게).
 * 폼 POST 의 교차 출처는 SvelteKit 기본 origin 검사가 막는다.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const raw = (url.searchParams.get('code') ?? '').trim();
	const { user } = await locals.safeGetSession();
	return {
		prefillCode: GUEST_ORDER_CODE_RE.test(raw) ? raw.toUpperCase() : '',
		expired: url.searchParams.get('msg') === 'expired',
		signedIn: user !== null
	};
};

export const actions: Actions = {
	lookup: async (event) => {
		const fd = await event.request.formData();
		const values = { code: String(fd.get('code') ?? ''), phone: String(fd.get('phone') ?? '') };
		if (!rateLimit(`guest-lookup:${event.getClientAddress()}`, 5)) {
			return fail(429, { message: RATE_LIMIT_MESSAGE, field: null, values });
		}
		const parsed = parseGuestLookupInput(values.code, values.phone);
		if (!parsed.ok) return fail(400, { message: parsed.message, field: parsed.field, values });

		let res;
		try {
			res = await lookupGuestOrder(parsed.input.orderCode, parsed.input.phone);
		} catch (e) {
			console.error('[orders/lookup] lookup failed:', e instanceof Error ? e.message : e);
			return fail(500, { message: '잠시 후 다시 시도해주세요', field: null, values });
		}
		if (!res.ok) return fail(404, { message: GUEST_LOOKUP_FAIL, field: null, values });

		event.cookies.set(guestTokenCookieName(res.orderCode), res.token, {
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			path: '/',
			maxAge: GUEST_TOKEN_COOKIE_MAX_AGE
		});
		redirect(303, guestOrderHref(res.orderCode));
	}
};
