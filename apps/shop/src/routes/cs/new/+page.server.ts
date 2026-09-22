import { error, fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { Actions, PageServerLoad } from './$types';
import { displayName } from '@sellery/db/auth';
import { canonicalStoreUrl } from '@sellery/db/campaign';
import { CS_BODY_MAX, CS_BUYER_NAME_MAX, CS_TOKEN_COOKIE_DAYS, CS_TYPES, csFailMessage, csTokenCookieName, parseCsOpenInput } from '@sellery/db/cs/cs-rules';
import { RATE_LIMIT_MESSAGE, fetchCampaignCard, openCs, rateLimit } from '$lib/server/db';

/**
 * `/cs/new?campaign=<code>&order=<주문번호?>` — 판매자(공급 브랜드)에게 문의 접수 (docs/brand-console-plan.md §6 행 4 "shop 짝" · §8 "고객 CS 접수 화면 위치" · CLAUDE.md "고객 CS 는 브랜드로 바로" · 프로토타입 actions.ts submitCS · 60-customer 문의 모달).
 * load: anon `campaign_card(code)` 로 상품 · 브랜드 · 인플루언서를 보여준다(없으면 404). 판매 중·종료 캠페인(LIVE · CLEARING · SETTLED)만 접수 가능 — 아니면 안내만.
 *       회원이면 이름 프리필(`displayName`) · 비회원은 빈 칸(선택). `?order=` 는 주문번호 프리필(내 주문 행 "문의하기").
 * `?campaign=<code>&/open`(hidden `campaign` 도 함께): 레이트리밋(IP 30분 5건 · 회원은 user 도) → `parseCsOpenInput` → `openCs(code, input, { userId })` → 응답의 `client_token` 은 **HttpOnly 쿠키** `csTokenCookieName(code)`(90일 · Lax · prod Secure) 로만 보관(HTML 에 절대 노출하지 않는다) → 303 `/cs/<code>?opened=1`.
 * 폼 POST 의 교차 출처는 SvelteKit 기본 origin 검사(`csrf.checkOrigin`)가 막는다 — JSON API 용 `rejectCrossSite` 는 form-urlencoded 를 거부하므로 쓰지 않는다.
 */
const OPENABLE = ['LIVE', 'CLEARING', 'SETTLED'] as const;
const ORDER_CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;

export const load: PageServerLoad = async (event) => {
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const code = (event.url.searchParams.get('campaign') ?? '').trim();
	if (!code) error(404, { message: '문의할 판매 페이지를 찾을 수 없습니다' });
	const card = await fetchCampaignCard(event, code);
	if (!card) error(404, { message: '문의할 판매 페이지를 찾을 수 없습니다' });
	const { user } = await event.locals.safeGetSession();
	const orderRaw = (event.url.searchParams.get('order') ?? '').trim();
	return {
		campaign: { code: card.campaign.code, status: card.campaign.status, storeUrl: canonicalStoreUrl(card) },
		product: { name: card.product.name, thumb_url: card.product.thumb_url, emoji: card.product.emoji },
		brand: { name: card.brand.name },
		seller: { name: card.seller.name, handle: card.seller.handle },
		canOpen: (OPENABLE as readonly string[]).includes(card.campaign.status),
		signedIn: user !== null,
		prefill: { buyer_name: user ? displayName(user) : '', order_code: ORDER_CODE_RE.test(orderRaw) ? orderRaw.toUpperCase() : '' },
		types: CS_TYPES,
		bodyMax: CS_BODY_MAX,
		nameMax: CS_BUYER_NAME_MAX,
		ordersHref: user ? '/account/orders' : null
	};
};

export const actions: Actions = {
	open: async (event) => {
		const fd = await event.request.formData();
		const values = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
		// named action 은 `?campaign=…&/open` 로 쿼리를 유지하지만, 폼의 hidden `campaign` 을 우선한다
		const code = (values.campaign ?? event.url.searchParams.get('campaign') ?? '').trim();
		if (!code) error(404, { message: '문의할 판매 페이지를 찾을 수 없습니다' });
		const { user } = await event.locals.safeGetSession();
		const ip = event.getClientAddress();
		if (!rateLimit(`cs-open:${ip}`, 5) || (user && !rateLimit(`cs-open:u:${user.id}`, 5))) {
			return fail(429, { message: RATE_LIMIT_MESSAGE, field: null, values });
		}
		const parsed = parseCsOpenInput(fd);
		if (!parsed.ok) return fail(400, { message: parsed.message, field: parsed.field, values });
		const res = await openCs(code, parsed, { userId: user?.id ?? null });
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') error(404, { message: '문의할 판매 페이지를 찾을 수 없습니다' });
			return fail(400, { message: csFailMessage(res), field: null, values });
		}
		event.cookies.set(csTokenCookieName(res.conversationCode), res.clientToken, {
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			path: '/',
			maxAge: CS_TOKEN_COOKIE_DAYS * 24 * 60 * 60
		});
		redirect(303, `/cs/${encodeURIComponent(res.conversationCode)}?opened=1`);
	}
};
