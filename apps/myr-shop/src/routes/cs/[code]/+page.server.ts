import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { CS_CODE_RE, CS_DONE_MESSAGES, csFailMessage, csStatusChip, csTokenCookieName, parseCsReplyInput } from '$lib/cs-rules';
import { hasAdmin } from '$lib/server/admin';
import { customerReplyCs, getCsThread } from '$lib/server/cs';
import { rateLimit } from '$lib/server/rate-limit';

/**
 * `/cs/[code]` — 고객 문의 스레드 (0063 myr_app_cs_thread · myr_app_cs_reply(actor='customer') · apps/shop cs/[code] 복사).
 * 인증: HttpOnly 쿠키 `myr_cs_<code>`(비회원 · 접수 기기) 또는 회원 세션(user_id). 둘 다 없거나 안 맞으면 404(코드·토큰 불일치를 구분하지 않는다).
 * `?/reply`: 추가 문의(ANSWERED → OPEN · CLOSED 면 거부) — IP 30분 10건. client_token 은 어디에도 렌더하지 않는다.
 */
const RATE_LIMIT_MESSAGE = '요청이 많아요 — 잠시 후 다시 시도해주세요';
const keyOf = (cookies: { get(name: string): string | undefined }, code: string, userId: string | null) => ({ clientToken: cookies.get(csTokenCookieName(code)) ?? null, userId });

export const load: PageServerLoad = async (event) => {
	const code = event.params.code.trim().toLowerCase();
	if (!CS_CODE_RE.test(code)) error(404, { message: '문의를 찾을 수 없습니다' });
	if (!hasAdmin()) error(503, { message: '문의 조회가 아직 설정되지 않았어요' });
	const { user } = await event.locals.safeGetSession();
	const t = await getCsThread(code, keyOf(event.cookies, code, user?.id ?? null));
	if (!t) error(404, { message: '문의를 찾을 수 없습니다' });
	const c = t.conversation;
	const key = event.url.searchParams.get('msg') ?? '';
	let msg: { tone: 'ok' | 'danger'; text: string } | null = null;
	if (event.url.searchParams.get('opened') === '1') msg = { tone: 'ok', text: CS_DONE_MESSAGES.opened(c.seller?.name ?? null) };
	else if (key === 'replied') msg = { tone: 'ok', text: CS_DONE_MESSAGES.customerReplied };
	else if (key === 'err_rate') msg = { tone: 'danger', text: RATE_LIMIT_MESSAGE };
	return { msg, conversation: c, chip: csStatusChip(c.status), messages: t.messages, sellerName: c.seller?.name ?? '크리에이터', signedIn: user !== null };
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
		const res = await customerReplyCs(code, keyOf(event.cookies, code, user?.id ?? null), parsed.body);
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') error(404, { message: '문의를 찾을 수 없습니다' });
			return fail(400, { message: csFailMessage(res.code), values });
		}
		redirect(303, `${self}?msg=replied#thread`);
	}
};
