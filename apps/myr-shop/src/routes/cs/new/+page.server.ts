import { error, fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { Actions, PageServerLoad } from './$types';
import { displayName } from '$lib/auth';
import { guestTokenCookieName } from '$lib/checkout-rules';
import { CS_BODY_MAX, CS_BUYER_NAME_MAX, CS_TOKEN_COOKIE_DAYS, CS_TYPES, csFailMessage, csTokenCookieName, parseCsOpenInput, PRODUCT_CODE_RE } from '$lib/cs-rules';
import { hasAdmin } from '$lib/server/admin';
import { openCs } from '$lib/server/cs';
import { getProductCard } from '$lib/server/db';
import { rateLimit } from '$lib/server/rate-limit';

/**
 * `/cs/new?product=<code>&order=<주문번호?>` — 크리에이터(셀러)에게 문의 접수 (docs/myr.md §4 · §6.6 · S7 · apps/shop cs/new 복사 · 캠페인 → 상품).
 * load: `myr_product_card(code)` 로 상품·크리에이터(없으면 404). 회원이면 이름 프리필 · `?order=` 는 주문번호 프리필(주문 상세 "문의하기").
 * `?/open`: 레이트리밋(IP 30분 5건 · 회원은 user 도) → parseCsOpenInput → openCs(code, input, { userId, guestToken }) → client_token 은 **HttpOnly 쿠키**로만 → 303 /cs/<code>?opened=1.
 * 주문 연결은 소유 증명될 때만(0063 · §6.6) — 회원 본인 주문 · 비회원 조회 토큰(그 주문번호의 `myr_guest_*` 쿠키 · 로그인 상태에서도 읽는다).
 */
const RATE_LIMIT_MESSAGE = '요청이 많아요 — 잠시 후 다시 시도해주세요';

export const load: PageServerLoad = async (event) => {
	const code = (event.url.searchParams.get('product') ?? '').trim().toLowerCase();
	if (!PRODUCT_CODE_RE.test(code)) error(404, { message: '문의할 제품을 찾을 수 없습니다' });
	const card = await getProductCard(code);
	if (!card) error(404, { message: '문의할 제품을 찾을 수 없습니다' });
	if (!hasAdmin()) error(503, { message: '문의 접수가 아직 설정되지 않았어요' });
	const { user } = await event.locals.safeGetSession();
	const orderRaw = (event.url.searchParams.get('order') ?? '').trim();
	return {
		product: { code: card.product.code, name: card.product.name, tile: card.product.tile, icon: card.product.ic, thumbUrl: card.product.thumbUrl },
		creator: { name: card.product.creator.name, handle: card.product.creator.handle },
		signedIn: user !== null,
		prefill: { buyer_name: user ? displayName(user) : '', order_code: /^[A-Za-z0-9_-]{1,32}$/.test(orderRaw) ? orderRaw.toUpperCase() : '' },
		types: CS_TYPES,
		bodyMax: CS_BODY_MAX,
		nameMax: CS_BUYER_NAME_MAX
	};
};

export const actions: Actions = {
	open: async (event) => {
		const fd = await event.request.formData();
		const values = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
		const code = (values.product ?? event.url.searchParams.get('product') ?? '').trim().toLowerCase();
		if (!PRODUCT_CODE_RE.test(code)) error(404, { message: '문의할 제품을 찾을 수 없습니다' });
		if (!hasAdmin()) return fail(503, { message: '문의 접수가 아직 설정되지 않았어요', field: null, values });
		const { user } = await event.locals.safeGetSession();
		const ip = event.getClientAddress();
		if (!rateLimit(`cs-open:${ip}`, 5) || (user && !rateLimit(`cs-open:u:${user.id}`, 5))) return fail(429, { message: RATE_LIMIT_MESSAGE, field: null, values });
		const parsed = parseCsOpenInput(fd);
		if (!parsed.ok) return fail(400, { message: parsed.message, field: parsed.field, values });
		const guestToken = parsed.orderCode ? (event.cookies.get(guestTokenCookieName(parsed.orderCode)) ?? null) : null;
		const res = await openCs(code, parsed, { userId: user?.id ?? null, guestToken });
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') error(404, { message: '문의할 제품을 찾을 수 없습니다' });
			return fail(400, { message: csFailMessage(res.code), field: null, values });
		}
		event.cookies.set(csTokenCookieName(res.conversationCode), res.clientToken, { httpOnly: true, sameSite: 'lax', secure: !dev, path: '/', maxAge: CS_TOKEN_COOKIE_DAYS * 24 * 60 * 60 });
		redirect(303, `/cs/${encodeURIComponent(res.conversationCode)}?opened=1`);
	}
};
