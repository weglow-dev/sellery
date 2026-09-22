import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { CS_DONE_MESSAGES, csFailMessage, csStatusChip, csTokenCookieName, parseCsReplyInput } from '@sellery/db/cs/cs-rules';
import { canonicalStoreUrl } from '@sellery/db/campaign';
import { trackingUrlOf } from '@sellery/db/carriers';
import { RATE_LIMIT_MESSAGE, customerReplyCs, fetchCampaignCard, getCsThread, rateLimit } from '$lib/server/db';

/**
 * `/cs/[code]` — 고객 문의 스레드 (docs/brand-console-plan.md §6 행 4 "shop 짝 · 비회원 client_token 조회" · 0018 `app_cs_thread` · `app_cs_customer_reply`).
 * 인증은 두 가지 — HttpOnly 쿠키 `csTokenCookieName(code)` 의 client_token(비회원 · 접수 기기) 또는 회원 세션(user_id 소유). 둘 다 없거나 안 맞으면 **404**(코드·토큰 불일치를 구분하지 않는다).
 * `?/reply`: 추가 문의(ANSWERED → OPEN · CLOSED 면 거부) — 레이트리밋 IP 30분 10건. `client_token` 은 어디에도 렌더하지 않는다(쿠키만).
 */
const CS_CODE_RE = /^cs\d{1,10}$/i;

function keyOf(event: { cookies: { get(name: string): string | undefined } }, code: string, userId: string | null) {
	return { clientToken: event.cookies.get(csTokenCookieName(code)) ?? null, userId };
}

export const load: PageServerLoad = async (event) => {
	event.setHeaders({ 'cache-control': 'private, no-store' });
	const code = event.params.code.trim().toLowerCase();
	if (!CS_CODE_RE.test(code)) error(404, { message: '문의를 찾을 수 없습니다' });
	const { user } = await event.locals.safeGetSession();
	const t = await getCsThread(code, keyOf(event, code, user?.id ?? null));
	if (!t) error(404, { message: '문의를 찾을 수 없습니다' });
	const c = t.conversation;
	const card = await fetchCampaignCard(event, c.campaign.code);

	const key = event.url.searchParams.get('msg') ?? '';
	const opened = event.url.searchParams.get('opened') === '1';
	let msg: { tone: 'ok' | 'danger' | 'info'; text: string } | null = null;
	if (opened) msg = { tone: 'ok', text: `문의가 ${c.campaign.brand?.name ?? '브랜드'}에 접수되었습니다 — 답변이 달리면 이 화면에서 확인할 수 있어요` };
	else if (key === 'replied') msg = { tone: 'ok', text: CS_DONE_MESSAGES.customerReplied };
	else if (key === 'err_rate') msg = { tone: 'danger', text: RATE_LIMIT_MESSAGE };

	return {
		msg,
		conversation: c,
		chip: csStatusChip(c.status),
		messages: t.messages,
		brandName: c.campaign.brand?.name ?? '브랜드',
		orderTrackingUrl: c.order ? trackingUrlOf(c.order.courier, c.order.tracking_no) : null,
		storeUrl: card ? canonicalStoreUrl(card) : null,
		signedIn: user !== null,
		ordersHref: user ? '/account/orders' : null
	};
};

export const actions: Actions = {
	reply: async (event) => {
		const code = event.params.code.trim().toLowerCase();
		if (!CS_CODE_RE.test(code)) error(404, { message: '문의를 찾을 수 없습니다' });
		const self = `/cs/${encodeURIComponent(code)}`;
		if (!rateLimit(`cs-reply:${event.getClientAddress()}`, 10)) redirect(303, `${self}?msg=err_rate`);
		const fd = await event.request.formData();
		const values = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
		const parsed = parseCsReplyInput(fd);
		if (!parsed.ok) return fail(400, { message: parsed.message, values });
		const { user } = await event.locals.safeGetSession();
		const res = await customerReplyCs(code, keyOf(event, code, user?.id ?? null), parsed.body);
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') error(404, { message: '문의를 찾을 수 없습니다' });
			return fail(400, { message: csFailMessage(res), values });
		}
		redirect(303, `${self}?msg=replied#thread`);
	}
};
