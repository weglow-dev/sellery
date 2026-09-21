import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { storeUrl } from '@sellery/db/campaign';
import { addDays, kstToday } from '@sellery/db/dates';
import { chatFailMessage, parseChatInput } from '@sellery/db/partner/chat-rules';
import { parseShippingInput, parseStoredShipping } from '@sellery/db/partner/sample-rules';
import {
	parseDeclineInput,
	parseScheduleInput,
	priorityHolders,
	scheduleFailMessage,
	SCHEDULE_DONE_MESSAGE,
	SCHEDULE_REPROPOSED_MESSAGE,
	SELLER_ACTION_DONE_MESSAGES,
	sellerActionFailMessage
} from '@sellery/db/partner/schedule-rules';
import { CLEAR_DAYS, TEST_DAYS } from '@sellery/core/constants';
import { SITE_URL } from '$lib/server/env';
import {
	acceptInvite,
	declineInvite,
	getScheduleContext,
	getSellerCampaign,
	passCampaign,
	proposeSchedule,
	RATE_LIMIT_MESSAGE,
	rateLimit,
	receiveSample,
	requireSeller,
	sellerPath,
	sendCampaignChat
} from '$lib/server/partner';

/**
 * `/campaigns/[code]` — 캠페인 상세(스테퍼 · 요약 · 스레드 · 액션) 3단계 + 브랜드 3단계 짝(0016)
 * (docs/inf-console-plan.md §6 `/campaigns/[code]` · docs/brand-console-plan.md §6 행 3 PR-B(influencer) · 프로토타입 js/70-campaign.js vCampDetail · detActions seller 분기 · ScheduleModal).
 * load: `getSellerCampaign(seller.id, code)` — **본인 것이 아니면 null → 404**(§7 3단계 (d)). TESTING · SCHEDULE_PROPOSED 면 `getScheduleContext`(잔여 재고 · 기간 선택지 · 이미 잡힌 기간 · 우선권 여부)도 싣는다.
 * 액션(전부 평범한 POST · 검증 실패는 fail(400) 로 값 유지 · 성공은 같은 페이지 303 `?msg=`):
 *   receive  SAMPLE_SHIPPED → `receiveSample`(TESTING · test_due 오늘+14 · 멱등)
 *   chat     `parseChatInput` → `sendCampaignChat('seller', …)` — 감지(연락처·카톡)는 함수가 leak_warned 행으로 남긴다
 *   propose  TESTING · SCHEDULE_PROPOSED(재제안) → `parseScheduleInput`(시작일 · 기간 · 수량) → `proposeSchedule` — PERIOD_BLOCKED · QTY_EXCEEDS_STOCK 은 문구에 값을 채워 폼에 남긴다
 *   pass     TESTING → `passCampaign`(PASSED · 멱등)
 *   accept   INVITED → `acceptInvite`(폼에 배송지가 있으면 `parseShippingInput`, 없으면 sellers.sample_address) → SAMPLE_APPROVED
 *   decline  INVITED → `declineInvite`(사유 선택) → DECLINED
 * 정산 미리보기 표(calc)는 5단계 매출·정산과 함께 — 여기서는 상태별 안내와 날짜만.
 */
export type CampaignMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

const MESSAGES: Record<string, CampaignMessage> = {
	requested: { tone: 'ok', text: '무상 샘플을 요청했어요 — 브랜드가 프로필을 검토한 뒤 승인하면 배송지로 샘플이 발송됩니다.' },
	received: { tone: 'ok', text: `샘플 수령을 확인했어요 — 테스트 기한 ${TEST_DAYS}일이 시작됩니다.` },
	already: { tone: 'info', text: '이미 처리된 캠페인이에요.' },
	not_shipped: { tone: 'danger', text: '아직 발송 전이에요 — 브랜드가 발송하면 운송장이 표시됩니다.' },
	proposed: { tone: 'ok', text: SCHEDULE_DONE_MESSAGE },
	reproposed: { tone: 'ok', text: SCHEDULE_REPROPOSED_MESSAGE },
	passed: { tone: 'info', text: `${SELLER_ACTION_DONE_MESSAGES.pass} — 이 캠페인은 종료됐어요. 같은 상품을 다시 요청할 수 있습니다.` },
	accepted: { tone: 'ok', text: SELLER_ACTION_DONE_MESSAGES.accept },
	declined: { tone: 'info', text: SELLER_ACTION_DONE_MESSAGES.decline },
	sent: { tone: 'ok', text: '메시지를 보냈어요.' },
	err_rate: { tone: 'danger', text: RATE_LIMIT_MESSAGE },
	err: { tone: 'danger', text: '처리 중 문제가 생겼어요 — 잠시 후 다시 시도해주세요.' }
};

export type ActionKind = 'chat' | 'propose' | 'pass' | 'accept' | 'decline';

export const load: PageServerLoad = async (event) => {
	const code = event.params.code;
	const r = await requireSeller(event, { next: `/campaigns/${encodeURIComponent(code)}` });
	if (!r.ok) redirect(303, r.location);
	const { seller } = r.ctx;

	const found = await getSellerCampaign(seller.id, code);
	if (!found) error(404, { message: '캠페인을 찾을 수 없습니다' });
	const { campaign: c, sample_shipping, events } = found;

	const needsSchedule = c.status === 'TESTING' || c.status === 'SCHEDULE_PROPOSED';
	const schedule = needsSchedule ? await getScheduleContext(seller.id, code) : null;

	const key = event.url.searchParams.get('msg') ?? '';
	const err = event.url.searchParams.get('err');
	const msg: CampaignMessage | null = err ? { tone: 'danger', text: err } : (MESSAGES[key] ?? null);

	const storePath = storeUrl(seller.handle, c.code);
	return {
		seller: { name: seller.name, handle: seller.handle, platform: seller.platform },
		campaign: c,
		sample_shipping,
		/** 내 저장 배송지 — INVITED 수락 시 폼 없이 바로 쓴다 (없으면 ShippingFields) */
		savedAddress: parseStoredShipping(seller.sample_address),
		events,
		schedule,
		priorityHolders: schedule ? priorityHolders(schedule) : [],
		today: kstToday(),
		msg,
		storeUrl: `${SITE_URL}${storePath}`,
		storeDisplay: `${SITE_URL.replace(/^https?:\/\//, '')}${storePath}`,
		settleDue: c.end_date ? addDays(c.end_date, CLEAR_DAYS) : null,
		clearDays: CLEAR_DAYS,
		testDays: TEST_DAYS,
		listPath: sellerPath('/campaigns'),
		productHref: c.product.code ? sellerPath(`/products/${encodeURIComponent(c.product.code)}`) : null
	};
};

/** 게이트 + rate limit + 폼 읽기 — 액션 공통. NOT_FOUND 는 호출자가 404 로. */
async function begin(event: RequestEvent, kind: ActionKind) {
	const code = event.params.code ?? '';
	const r = await requireSeller(event, { next: `/campaigns/${encodeURIComponent(code)}` });
	if (!r.ok) redirect(303, r.location);
	const self = sellerPath(`/campaigns/${encodeURIComponent(code)}`);
	if (!rateLimit(`camp-${kind}:${r.ctx.user.id}`)) redirect(303, `${self}?msg=err_rate`);
	const fd = await event.request.formData();
	const values = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;
	return { code, self, ctx: r.ctx, fd, values };
}

const notFound = () => error(404, { message: '캠페인을 찾을 수 없습니다' });

export const actions: Actions = {
	receive: async (event) => {
		const code = event.params.code;
		const r = await requireSeller(event, { next: `/campaigns/${encodeURIComponent(code)}` });
		if (!r.ok) redirect(303, r.location);
		const self = sellerPath(`/campaigns/${encodeURIComponent(code)}`);
		if (!rateLimit(`receive:${r.ctx.user.id}`)) redirect(303, `${self}?msg=err_rate`);
		const res = await receiveSample(r.ctx.seller.id, code);
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') notFound();
			redirect(303, `${self}?msg=${res.code === 'NOT_SHIPPED' ? 'not_shipped' : 'err'}`);
		}
		redirect(303, `${self}?msg=${res.already ? 'already' : 'received'}`);
	},

	chat: async (event) => {
		const { code, self, ctx, fd, values } = await begin(event, 'chat');
		const parsed = parseChatInput(fd);
		if (!parsed.ok) return fail(400, { kind: 'chat' as const, message: parsed.message, field: 'body', values });
		const res = await sendCampaignChat('seller', ctx.seller.id, ctx.user.id, code, parsed.body);
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') notFound();
			return fail(400, { kind: 'chat' as const, message: chatFailMessage(res), field: 'body', values });
		}
		redirect(303, `${self}?msg=sent#thread`);
	},

	propose: async (event) => {
		const { code, self, ctx, fd, values } = await begin(event, 'propose');
		const parsed = parseScheduleInput(fd, kstToday());
		if (!parsed.ok) return fail(400, { kind: 'propose' as const, message: parsed.message, field: parsed.field, values });
		const res = await proposeSchedule(ctx.seller.id, code, { start: parsed.start, end: parsed.end, qty: parsed.qty });
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') notFound();
			const field = res.code === 'QTY_EXCEEDS_STOCK' || res.code === 'BAD_QTY' ? 'qty' : res.code === 'PERIOD_BLOCKED' ? 'start' : res.code === 'BAD_PERIOD' ? (res.field ?? 'start') : null;
			return fail(400, { kind: 'propose' as const, message: scheduleFailMessage(res), field, values });
		}
		redirect(303, `${self}?msg=${res.reproposed ? 'reproposed' : 'proposed'}`);
	},

	pass: async (event) => {
		const { code, self, ctx } = await begin(event, 'pass');
		const res = await passCampaign(ctx.seller.id, code);
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') notFound();
			redirect(303, `${self}?err=${encodeURIComponent(sellerActionFailMessage(res))}`);
		}
		redirect(303, `${self}?msg=${res.already ? 'already' : 'passed'}`);
	},

	accept: async (event) => {
		const { code, self, ctx, fd, values } = await begin(event, 'accept');
		// 폼에 배송지 필드가 왔으면(저장 배송지가 없어 ShippingFields 를 보인 경우) 검증해서 넘기고, 아니면 sellers.sample_address 를 함수가 쓴다
		let shipping = null;
		if (fd.has('recipient')) {
			const parsed = parseShippingInput(fd);
			if (!parsed.ok) return fail(400, { kind: 'accept' as const, message: '배송지를 확인해주세요 — 수취인 · 연락처 · 우편번호 · 주소는 필수예요', field: parsed.field, values });
			shipping = parsed.shipping;
		}
		const res = await acceptInvite(ctx.seller.id, code, shipping);
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') notFound();
			if (res.code === 'BAD_SHIPPING') return fail(400, { kind: 'accept' as const, message: sellerActionFailMessage(res), field: res.field ?? 'shipping', values });
			redirect(303, `${self}?err=${encodeURIComponent(sellerActionFailMessage(res))}`);
		}
		redirect(303, `${self}?msg=${res.already ? 'already' : 'accepted'}`);
	},

	decline: async (event) => {
		const { code, self, ctx, fd } = await begin(event, 'decline');
		const res = await declineInvite(ctx.seller.id, code, parseDeclineInput(fd).reason);
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') notFound();
			redirect(303, `${self}?err=${encodeURIComponent(sellerActionFailMessage(res))}`);
		}
		redirect(303, `${self}?msg=${res.already ? 'already' : 'declined'}`);
	}
};
