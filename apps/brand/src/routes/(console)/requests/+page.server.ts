import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { SAMPLE_ACTION_DONE_MESSAGES, samplePaidLine } from '@sellery/db/brand/campaign-rules';
import { RATE_LIMIT_MESSAGE, brandPath, listBrandRequests, requireBrand } from '$lib/server/brand';
import { runSampleAction, type SampleActionKind } from '$lib/server/sample-actions';

/**
 * `/requests` — 처리 대기 큐 2단계 (docs/brand-console-plan.md §5 `/brand/requests` · 프로토타입 브랜드 홈 "승인·처리 대기"(brandPending) + DM 요청함 vDM 브랜드 분기).
 * 읽기: `listBrandRequests(brand.id)` — 브랜드 차례 상태(SAMPLE_REQUESTED · SAMPLE_APPROVED · SAMPLE_PURCHASED · SCHEDULE_PROPOSED) 오래된 순 + 인플루언서 요약(등급 · 팔로워 · 인증 채널) + 배송지 유무.
 * 액션(행에서 바로 · 상세와 같은 것): `?/approve` `?/reject`(사유 선택) `?/ship`(택배사 + 송장) → `runSampleAction` → 303 `?msg=<kind>&code=` · 발송 폼 검증 실패는 fail(400) 로 그 행에 값 유지.
 * SCHEDULE_PROPOSED 는 표시만("일정 확정은 3단계") — 일정 승인·반려 액션은 3단계.
 */
export type RequestsMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

export const load: PageServerLoad = async (event) => {
	const r = await requireBrand(event, { next: '/requests' });
	if (!r.ok) redirect(303, r.location);
	const { brand } = r.ctx;

	const rows = await listBrandRequests(brand.id);
	const key = event.url.searchParams.get('msg') ?? '';
	const doneCode = event.url.searchParams.get('code') ?? '';
	const err = event.url.searchParams.get('err');
	let msg: RequestsMessage | null = null;
	if (err) msg = { tone: 'danger', text: err };
	else if (key === 'already') msg = { tone: 'info', text: `${doneCode.toUpperCase()} — 이미 처리된 요청이에요` };
	else if (key === 'err_rate') msg = { tone: 'danger', text: RATE_LIMIT_MESSAGE };
	else if (key in SAMPLE_ACTION_DONE_MESSAGES) msg = { tone: 'ok', text: `${doneCode.toUpperCase()} ${SAMPLE_ACTION_DONE_MESSAGES[key as SampleActionKind]}` };

	return {
		msg,
		requests: rows.map((c) => ({
			code: c.code,
			status: c.status,
			chip: c.chip,
			action: c.action,
			created_at: c.created_at,
			invited: c.invited,
			purchased: c.purchased,
			paidLine: samplePaidLine(c),
			has_shipping: c.has_shipping,
			proposed_start: c.proposed_start,
			proposed_end: c.proposed_end,
			proposed_qty: c.proposed_qty,
			product: c.product,
			seller: c.seller,
			href: brandPath(`/campaigns/${encodeURIComponent(c.code)}`)
		})),
		campaignsPath: brandPath('/campaigns')
	};
};

const self = brandPath('/requests');

async function act(event: RequestEvent, kind: SampleActionKind) {
	const out = await runSampleAction(event, kind, '/requests');
	if (!out.ok) {
		if (out.notFound) error(404, { message: '캠페인을 찾을 수 없습니다' });
		if (out.field) return fail(400, { code: out.code, kind, message: out.message, field: out.field, values: out.values });
		redirect(303, `${self}?err=${encodeURIComponent(out.message)}&code=${encodeURIComponent(out.code)}`);
	}
	redirect(303, `${self}?msg=${out.already ? 'already' : kind}&code=${encodeURIComponent(out.code)}`);
}

export const actions: Actions = {
	approve: (event) => act(event, 'approve'),
	reject: (event) => act(event, 'reject'),
	ship: (event) => act(event, 'ship')
};
