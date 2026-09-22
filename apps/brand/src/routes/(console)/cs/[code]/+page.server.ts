import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { CS_DONE_MESSAGES, csFailMessage, csStatusChip, parseCsReplyInput } from '@sellery/db/cs/cs-rules';
import { trackingUrlOf } from '@sellery/db/carriers';
import { RATE_LIMIT_MESSAGE, brandPath, closeCs, getBrandCsThread, rateLimit, replyCs, requireBrand } from '$lib/server/brand';

/**
 * `/cs/[code]` — 문의 상세 · 답변 · 처리 종료 (docs/brand-console-plan.md §5 `/brand/cs/[code]` · 프로토타입 데모 csReply 모달 + act.csClose).
 * load: `getBrandCsThread(brand.id, code)` — **내 브랜드 것이 아니면 null → 404**(§6 행 4 (g)). 스레드(customer · brand · admin 말풍선) + 주문 요약(매칭됐을 때) + 캠페인 링크.
 * 액션: `?/reply`(ThreadComposer `body` → `replyCs` → ANSWERED) · `?/close`(`closeCs` → CLOSED · 멱등) → 같은 페이지 303 `?msg=` · 폼 검증 실패는 fail(400) 값 유지. CLOSED 면 폼 대신 "종료됨".
 */
export type CsMessageNotice = { tone: 'ok' | 'danger' | 'info'; text: string };

export const load: PageServerLoad = async (event) => {
	const code = event.params.code;
	const r = await requireBrand(event, { next: `/cs/${encodeURIComponent(code)}` });
	if (!r.ok) redirect(303, r.location);
	const { brand } = r.ctx;

	const t = await getBrandCsThread(brand.id, code);
	if (!t) error(404, { message: '문의를 찾을 수 없습니다' });
	const c = t.conversation;

	const key = event.url.searchParams.get('msg') ?? '';
	let msg: CsMessageNotice | null = null;
	if (key === 'err_rate') msg = { tone: 'danger', text: RATE_LIMIT_MESSAGE };
	else if (key === 'replied') msg = { tone: 'ok', text: CS_DONE_MESSAGES.replied };
	else if (key === 'closed') msg = { tone: 'info', text: CS_DONE_MESSAGES.closed };
	else if (key === 'already') msg = { tone: 'info', text: '이미 처리 종료된 문의예요' };

	return {
		msg,
		brand: { name: brand.name },
		conversation: c,
		chip: csStatusChip(c.status),
		messages: t.messages,
		orderTrackingUrl: c.order ? trackingUrlOf(c.order.courier, c.order.tracking_no) : null,
		listPath: brandPath('/cs'),
		campaignHref: brandPath(`/campaigns/${encodeURIComponent(c.campaign.code)}`),
		ordersHref: `${brandPath('/orders')}?campaign=${encodeURIComponent(c.campaign.code)}`
	};
};

const selfOf = (event: RequestEvent) => brandPath(`/cs/${encodeURIComponent(event.params.code ?? '')}`);

export const actions: Actions = {
	reply: async (event) => {
		const code = event.params.code;
		const r = await requireBrand(event, { next: `/cs/${encodeURIComponent(code)}` });
		if (!r.ok) redirect(303, r.location);
		const self = selfOf(event);
		if (!rateLimit(`cs-reply:${r.ctx.user.id}`)) redirect(303, `${self}?msg=err_rate`);
		const fd = await event.request.formData();
		const values = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
		const parsed = parseCsReplyInput(fd);
		if (!parsed.ok) return fail(400, { kind: 'reply' as const, message: parsed.message, field: 'body', values });
		const res = await replyCs(r.ctx.brand.id, code, r.ctx.user.id, parsed.body);
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') error(404, { message: '문의를 찾을 수 없습니다' });
			return fail(400, { kind: 'reply' as const, message: csFailMessage(res), field: 'body', values });
		}
		redirect(303, `${self}?msg=replied#thread`);
	},

	close: async (event) => {
		const code = event.params.code;
		const r = await requireBrand(event, { next: `/cs/${encodeURIComponent(code)}` });
		if (!r.ok) redirect(303, r.location);
		const self = selfOf(event);
		if (!rateLimit(`cs-close:${r.ctx.user.id}`)) redirect(303, `${self}?msg=err_rate`);
		const res = await closeCs(r.ctx.brand.id, code);
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') error(404, { message: '문의를 찾을 수 없습니다' });
			redirect(303, `${self}?msg=err_rate`);
		}
		redirect(303, `${self}?msg=${res.already ? 'already' : 'closed'}`);
	}
};
