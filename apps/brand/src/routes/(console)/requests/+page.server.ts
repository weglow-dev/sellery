import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { SAMPLE_ACTION_DONE_MESSAGES, SCHEDULE_ACTION_DONE_MESSAGES, samplePaidLine } from '@sellery/db/brand/campaign-rules';
import { EXCLUSIVE_MESSAGES, exclusiveFailMessage } from '@sellery/db/partner/exclusive-rules';
import {
	RATE_LIMIT_MESSAGE,
	brandPath,
	decideBrandExclusive,
	listBrandExclusiveRequests,
	listBrandRequests,
	rateLimit,
	requireBrand
} from '$lib/server/brand';
import { runSampleAction, type SampleActionKind } from '$lib/server/sample-actions';
import { runScheduleAction, type ScheduleActionKind } from '$lib/server/schedule-actions';

/**
 * `/requests` — 처리 대기 큐 2단계 (docs/brand-console-plan.md §5 `/brand/requests` · 프로토타입 브랜드 홈 "승인·처리 대기"(brandPending) + DM 요청함 vDM 브랜드 분기).
 * 읽기: `listBrandRequests(brand.id)` — 브랜드 차례 상태(SAMPLE_REQUESTED · SAMPLE_APPROVED · SAMPLE_PURCHASED · SCHEDULE_PROPOSED) 오래된 순 + 인플루언서 요약(등급 · 팔로워 · 인증 채널) + 배송지 유무.
 * 액션(행에서 바로 · 상세와 같은 것): `?/approve` `?/reject`(사유 선택) `?/ship`(택배사 + 송장) → `runSampleAction` → 303 `?msg=<kind>&code=` · 발송 폼 검증 실패는 fail(400) 로 그 행에 값 유지.
 * 3단계(0016): SCHEDULE_PROPOSED 행은 [확정] `?/confirm` · [반려] `?/rejectSchedule`(사유) → `runScheduleAction` → 303 `?msg=confirm|rejectSchedule&code=` · 실패는 `?err=` 문구(STOCK_SHORT · PERIOD_BLOCKED · PERIOD_PAST).
 * 독점권(0025): 내 상품에 들어온 신청을 별도 섹션으로 — `listBrandExclusiveRequests(brand.id)`. 캠페인 행과 데이터 모양이 달라(캠페인이 아직 없다) 같은 목록에 섞지 않는다.
 *   [승인] `?/approveExclusive` · [거절] `?/rejectExclusive` → `decideBrandExclusive` → 303 `?msg=exclApproved|exclRejected&code=<상품코드>`.
 *   승인은 `products.exclusive_seller_id` 를 세우고 **같은 상품의 남은 대기 신청을 자동 거절**한다(독점권은 1명 — 0025 주석).
 *   프로토타입 원본: `packages/ui/src/views/DM.svelte` 브랜드 요청함의 승인/거절 행 · actions.ts `approveExcl`/`rejectExcl`.
 */
export type RequestsMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

export const load: PageServerLoad = async (event) => {
	const r = await requireBrand(event, { next: '/requests' });
	if (!r.ok) redirect(303, r.location);
	const { brand } = r.ctx;

	const [rows, exclusives] = await Promise.all([
		listBrandRequests(brand.id),
		listBrandExclusiveRequests(brand.id)
	]);
	const key = event.url.searchParams.get('msg') ?? '';
	const doneCode = event.url.searchParams.get('code') ?? '';
	const err = event.url.searchParams.get('err');
	let msg: RequestsMessage | null = null;
	if (err) msg = { tone: 'danger', text: err };
	else if (key === 'already') msg = { tone: 'info', text: `${doneCode.toUpperCase()} — 이미 처리된 요청이에요` };
	else if (key === 'err_rate') msg = { tone: 'danger', text: RATE_LIMIT_MESSAGE };
	else if (key === 'confirm') msg = { tone: 'ok', text: `${doneCode.toUpperCase()} ${SCHEDULE_ACTION_DONE_MESSAGES.confirm}` };
	else if (key === 'rejectSchedule') msg = { tone: 'info', text: `${doneCode.toUpperCase()} ${SCHEDULE_ACTION_DONE_MESSAGES.reject}` };
	else if (key === 'exclApproved') msg = { tone: 'ok', text: `${doneCode.toUpperCase()} ${EXCLUSIVE_MESSAGES.approved}` };
	else if (key === 'exclRejected') msg = { tone: 'info', text: `${doneCode.toUpperCase()} ${EXCLUSIVE_MESSAGES.rejected}` };
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
			stock_left: c.stock_left,
			stock: c.stock,
			product: c.product,
			seller: c.seller,
			href: brandPath(`/campaigns/${encodeURIComponent(c.code)}`)
		})),
		exclusives: exclusives.map((x) => ({
			id: x.id,
			productCode: x.productCode,
			productName: x.productName,
			label: x.label,
			needGrade: x.needGrade,
			locked: x.locked,
			othersActive: x.othersActive,
			seller: {
				name: x.sellerName,
				handle: x.sellerHandle,
				grade: x.sellerGrade,
				followers: x.sellerFollowers,
				m3Sales: x.sellerM3Sales
			},
			createdAt: x.createdAt,
			productHref: x.productCode ? brandPath(`/products/${encodeURIComponent(x.productCode)}`) : null
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

async function sched(event: RequestEvent, kind: ScheduleActionKind) {
	const out = await runScheduleAction(event, kind, '/requests');
	if (!out.ok) {
		if (out.notFound) error(404, { message: '캠페인을 찾을 수 없습니다' });
		redirect(303, `${self}?err=${encodeURIComponent(out.message)}&code=${encodeURIComponent(out.code)}`);
	}
	redirect(303, `${self}?msg=${out.already ? 'already' : kind === 'confirm' ? 'confirm' : 'rejectSchedule'}&code=${encodeURIComponent(out.code)}`);
}

/** 독점권 승인/거절 공용 — 신청 id 는 폼에서, 브랜드는 세션에서. 남의 상품 신청은 RPC 가 NOT_FOUND. */
async function decideExcl(event: RequestEvent, approve: boolean) {
	const r = await requireBrand(event, { next: '/requests' });
	if (!r.ok) redirect(303, r.location);
	if (!rateLimit(`excl-decide:${r.ctx.user.id}`)) redirect(303, `${self}?msg=err_rate`);

	const fd = await event.request.formData();
	const id = fd.get('id');
	if (typeof id !== 'string' || id.length === 0) redirect(303, `${self}?err=${encodeURIComponent(exclusiveFailMessage('NOT_FOUND'))}`);

	const out = await decideBrandExclusive(r.ctx.brand.id, id, approve);
	if (!out.ok) redirect(303, `${self}?err=${encodeURIComponent(exclusiveFailMessage(out.code))}`);

	const code = typeof fd.get('code') === 'string' ? (fd.get('code') as string) : '';
	if (out.already) redirect(303, `${self}?msg=already&code=${encodeURIComponent(code)}`);
	redirect(303, `${self}?msg=${approve ? 'exclApproved' : 'exclRejected'}&code=${encodeURIComponent(code)}`);
}

export const actions: Actions = {
	approveExclusive: (event) => decideExcl(event, true),
	rejectExclusive: (event) => decideExcl(event, false),
	approve: (event) => act(event, 'approve'),
	reject: (event) => act(event, 'reject'),
	ship: (event) => act(event, 'ship'),
	confirm: (event) => sched(event, 'confirm'),
	rejectSchedule: (event) => sched(event, 'reject')
};
