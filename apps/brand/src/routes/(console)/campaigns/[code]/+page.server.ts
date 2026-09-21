import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { SAMPLE_ACTION_DONE_MESSAGES, SCHEDULE_ACTION_DONE_MESSAGES, samplePaidLine, shippingLine, trackingUrlOf } from '@sellery/db/brand/campaign-rules';
import { inviteDoneMessage } from '@sellery/db/brand/invite-rules';
import { storeUrl } from '@sellery/db/campaign';
import { addDays, kstToday } from '@sellery/db/dates';
import { chatFailMessage, parseChatInput } from '@sellery/db/partner/chat-rules';
import { CLEAR_DAYS, TEST_DAYS } from '@sellery/core/constants';
import { SITE_URL } from '$lib/server/env';
import { RATE_LIMIT_MESSAGE, brandPath, getBrandCampaign, rateLimit, requireBrand, sendCampaignChat } from '$lib/server/brand';
import { runSampleAction, type SampleActionKind } from '$lib/server/sample-actions';
import { runScheduleAction, type ScheduleActionKind } from '$lib/server/schedule-actions';

/**
 * `/campaigns/[code]` — 캠페인 상세(스테퍼 · 요약 · 스레드 · 브랜드 액션 패널) 2단계 + 3단계(일정 확정·반려 · 스레드 답글)
 * (docs/brand-console-plan.md §5 `/brand/campaigns/[code]` · §6 행 3 PR-B(brand) · 프로토타입 `packages/ui/src/views/CampaignDetail.svelte` 브랜드 분기).
 * load: `getBrandCampaign(brand.id, code)` — **내 브랜드 것이 아니면 null → 404**(§6 2단계 (g)). 배송지 원문(`sample_shipping`)은 발송 목적으로 여기서만.
 * 액션: `?/approve` `?/reject` `?/ship` → `runSampleAction`(2단계) · `?/confirm` `?/rejectSchedule` → `runScheduleAction`(0016) · `?/chat` → `sendCampaignChat('brand', …)`
 *       → 같은 페이지 303 `?msg=` · 폼 검증 실패는 fail(400) 값 유지.
 */
export type CampaignMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

export const load: PageServerLoad = async (event) => {
	const code = event.params.code;
	const r = await requireBrand(event, { next: `/campaigns/${encodeURIComponent(code)}` });
	if (!r.ok) redirect(303, r.location);
	const { brand } = r.ctx;

	const found = await getBrandCampaign(brand.id, code);
	if (!found) error(404, { message: '캠페인을 찾을 수 없습니다' });
	const { campaign: c, sample_shipping, events } = found;

	const key = event.url.searchParams.get('msg') ?? '';
	const err = event.url.searchParams.get('err');
	let msg: CampaignMessage | null = null;
	if (err) msg = { tone: 'danger', text: err };
	else if (key === 'already') msg = { tone: 'info', text: '이미 처리된 요청이에요' };
	else if (key === 'err_rate') msg = { tone: 'danger', text: RATE_LIMIT_MESSAGE };
	else if (key === 'sent') msg = { tone: 'ok', text: '메시지를 보냈어요.' };
	else if (key === 'invited') msg = { tone: 'ok', text: inviteDoneMessage(c.seller.name) };
	else if (key === 'confirm') msg = { tone: 'ok', text: `${SCHEDULE_ACTION_DONE_MESSAGES.confirm} — 판매가 · 수수료율이 이 시점 값으로 잠겼어요` };
	else if (key === 'rejectSchedule') msg = { tone: 'info', text: SCHEDULE_ACTION_DONE_MESSAGES.reject };
	else if (key in SAMPLE_ACTION_DONE_MESSAGES) msg = { tone: 'ok', text: SAMPLE_ACTION_DONE_MESSAGES[key as SampleActionKind] };

	const storePath = storeUrl(c.seller.handle, c.code);
	return {
		brand: { name: brand.name },
		campaign: c,
		sample_shipping,
		shippingText: shippingLine(sample_shipping),
		events,
		msg,
		today: kstToday(),
		paidLine: samplePaidLine(c),
		trackingUrl: trackingUrlOf(c.sample_courier, c.tracking_no),
		storeUrl: `${SITE_URL}${storePath}`,
		storeDisplay: `${SITE_URL.replace(/^https?:\/\//, '')}${storePath}`,
		settleDue: c.end_date ? addDays(c.end_date, CLEAR_DAYS) : null,
		clearDays: CLEAR_DAYS,
		testDays: TEST_DAYS,
		listPath: brandPath('/campaigns'),
		requestsPath: brandPath('/requests'),
		productHref: c.product.code ? brandPath(`/products/${encodeURIComponent(c.product.code)}`) : null,
		inviteHref: c.product.code ? brandPath(`/products/${encodeURIComponent(c.product.code)}/invite`) : null
	};
};

const selfOf = (event: RequestEvent) => brandPath(`/campaigns/${encodeURIComponent(event.params.code ?? '')}`);

async function act(event: RequestEvent, kind: SampleActionKind) {
	const self = selfOf(event);
	const out = await runSampleAction(event, kind, `/campaigns/${encodeURIComponent(event.params.code ?? '')}`);
	if (!out.ok) {
		if (out.notFound) error(404, { message: '캠페인을 찾을 수 없습니다' });
		if (out.field) return fail(400, { kind, message: out.message, field: out.field, values: out.values });
		redirect(303, `${self}?err=${encodeURIComponent(out.message)}`);
	}
	redirect(303, `${self}?msg=${out.already ? 'already' : kind}`);
}

async function sched(event: RequestEvent, kind: ScheduleActionKind) {
	const self = selfOf(event);
	const out = await runScheduleAction(event, kind, `/campaigns/${encodeURIComponent(event.params.code ?? '')}`);
	if (!out.ok) {
		if (out.notFound) error(404, { message: '캠페인을 찾을 수 없습니다' });
		redirect(303, `${self}?err=${encodeURIComponent(out.message)}`);
	}
	redirect(303, `${self}?msg=${out.already ? 'already' : kind === 'confirm' ? 'confirm' : 'rejectSchedule'}`);
}

export const actions: Actions = {
	approve: (event) => act(event, 'approve'),
	reject: (event) => act(event, 'reject'),
	ship: (event) => act(event, 'ship'),
	confirm: (event) => sched(event, 'confirm'),
	rejectSchedule: (event) => sched(event, 'reject'),

	chat: async (event) => {
		const code = event.params.code;
		const r = await requireBrand(event, { next: `/campaigns/${encodeURIComponent(code)}` });
		if (!r.ok) redirect(303, r.location);
		const self = selfOf(event);
		if (!rateLimit(`camp-chat:${r.ctx.user.id}`)) redirect(303, `${self}?msg=err_rate`);
		const fd = await event.request.formData();
		const values = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
		const parsed = parseChatInput(fd);
		if (!parsed.ok) return fail(400, { kind: 'chat' as const, message: parsed.message, field: 'body', values });
		const res = await sendCampaignChat('brand', r.ctx.brand.id, r.ctx.user.id, code, parsed.body);
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') error(404, { message: '캠페인을 찾을 수 없습니다' });
			return fail(400, { kind: 'chat' as const, message: chatFailMessage(res), field: 'body', values });
		}
		redirect(303, `${self}?msg=sent#thread`);
	}
};
