import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { SAMPLE_ACTION_DONE_MESSAGES, samplePaidLine, shippingLine, trackingUrlOf } from '@sellery/db/brand/campaign-rules';
import { storeUrl } from '@sellery/db/campaign';
import { addDays } from '@sellery/db/dates';
import { CLEAR_DAYS, TEST_DAYS } from '@sellery/core/constants';
import { SITE_URL } from '$lib/server/env';
import { RATE_LIMIT_MESSAGE, brandPath, getBrandCampaign, requireBrand } from '$lib/server/brand';
import { runSampleAction, type SampleActionKind } from '$lib/server/sample-actions';

/**
 * `/campaigns/[code]` — 캠페인 상세(스테퍼 · 요약 · 스레드 · 브랜드 액션 패널) 2단계 (docs/brand-console-plan.md §5 `/brand/campaigns/[code]` · 프로토타입 `packages/ui/src/views/CampaignDetail.svelte` 브랜드 분기).
 * load: `getBrandCampaign(brand.id, code)` — **내 브랜드 것이 아니면 null → 404**(§6 2단계 (g)). 배송지 원문(`sample_shipping`)은 발송 목적으로 여기서만. 스레드는 campaign_events 시간순 · 읽기 전용(채팅 입력은 3단계).
 * 액션: `?/approve` `?/reject`(사유) `?/ship`(택배사 + 송장) → `runSampleAction` → 같은 페이지 303 `?msg=` · 발송 폼 검증 실패는 fail(400) 값 유지. 일정 확정·반려는 3단계.
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
	else if (key in SAMPLE_ACTION_DONE_MESSAGES) msg = { tone: 'ok', text: SAMPLE_ACTION_DONE_MESSAGES[key as SampleActionKind] };

	const storePath = storeUrl(c.seller.handle, c.code);
	return {
		brand: { name: brand.name },
		campaign: c,
		sample_shipping,
		shippingText: shippingLine(sample_shipping),
		events,
		msg,
		paidLine: samplePaidLine(c),
		trackingUrl: trackingUrlOf(c.sample_courier, c.tracking_no),
		storeUrl: `${SITE_URL}${storePath}`,
		storeDisplay: `${SITE_URL.replace(/^https?:\/\//, '')}${storePath}`,
		settleDue: c.end_date ? addDays(c.end_date, CLEAR_DAYS) : null,
		clearDays: CLEAR_DAYS,
		testDays: TEST_DAYS,
		listPath: brandPath('/campaigns'),
		requestsPath: brandPath('/requests'),
		productHref: c.product.code ? brandPath(`/products/${encodeURIComponent(c.product.code)}`) : null
	};
};

async function act(event: RequestEvent, kind: SampleActionKind) {
	const code = event.params.code ?? '';
	const self = brandPath(`/campaigns/${encodeURIComponent(code)}`);
	const out = await runSampleAction(event, kind, `/campaigns/${encodeURIComponent(code)}`);
	if (!out.ok) {
		if (out.notFound) error(404, { message: '캠페인을 찾을 수 없습니다' });
		if (out.field) return fail(400, { kind, message: out.message, field: out.field, values: out.values });
		redirect(303, `${self}?err=${encodeURIComponent(out.message)}`);
	}
	redirect(303, `${self}?msg=${out.already ? 'already' : kind}`);
}

export const actions: Actions = {
	approve: (event) => act(event, 'approve'),
	reject: (event) => act(event, 'reject'),
	ship: (event) => act(event, 'ship')
};
