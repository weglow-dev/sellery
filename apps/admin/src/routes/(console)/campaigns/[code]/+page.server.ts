import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminPath, requireAdmin } from '$lib/server/admin';
import {
	approveSampleAsAdmin,
	confirmScheduleAsAdmin,
	getAdminCampaign,
	postAdminChat,
	rejectSampleAsAdmin,
	rejectScheduleAsAdmin,
	shipSampleAsAdmin
} from '$lib/server/partners';
import { parseShipInput } from '@sellery/db/brand/campaign-rules';

/**
 * `/campaigns/[code]` — 데모 캠페인 상세의 실서비스 판.
 * 흐름 스테퍼 · 스레드 · 브랜드 대행 액션(승인 · 거절 · 발송 · 일정) · 관리자 발신 · 정산 미리보기.
 *
 * 쓰기는 전부 브랜드 RPC(`app_brand_*` · 0015/0016) 를 그대로 부른다 — 상태 전이와 이벤트 문구를
 * 관리자 쪽에서 다시 구현하지 않는다. 대상은 `code → id` 를 서버에서 해석해 정한다.
 */
export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const campaign = await getAdminCampaign(event.params.code);
	if (!campaign) error(404, { message: '캠페인을 찾을 수 없습니다' });

	return {
		campaign,
		msg: event.url.searchParams.get('msg'),
		paths: {
			home: adminPath('/home'),
			products: adminPath('/products'),
			sellers: adminPath('/sellers'),
			brands: adminPath('/brands'),
			settle: adminPath('/settle')
		}
	};
};

/** 결과를 주소의 `?msg=` 로 옮긴다 — 새로고침에 같은 동작이 다시 실행되지 않게(POST → 303) */
function done(url: URL, key: string): never {
	redirect(303, `${url.pathname}?msg=${encodeURIComponent(key)}`);
}

export const actions: Actions = {
	/** 샘플 요청 승인 — 브랜드 대행 */
	approveSample: async (event) => {
		const gate = await requireAdmin(event);
		if (!gate.ok) redirect(303, gate.location);
		const r = await approveSampleAsAdmin(event.params.code, gate.ctx.user.id);
		done(event.url, r.ok ? (r.already ? 'sample_already' : 'sample_approved') : `err_${r.code}`);
	},

	/** 샘플 요청 거절 — 사유는 선택 */
	rejectSample: async (event) => {
		const gate = await requireAdmin(event);
		if (!gate.ok) redirect(303, gate.location);
		const form = await event.request.formData();
		const r = await rejectSampleAsAdmin(event.params.code, String(form.get('reason') ?? ''), gate.ctx.user.id);
		done(event.url, r.ok ? (r.already ? 'sample_already' : 'sample_rejected') : `err_${r.code}`);
	},

	/** 샘플 발송 등록 — 택배사·운송장은 브랜드 콘솔과 같은 검사(`parseShipInput`) */
	shipSample: async (event) => {
		const gate = await requireAdmin(event);
		if (!gate.ok) redirect(303, gate.location);
		const form = await event.request.formData();
		const parsed = parseShipInput(form);
		if (!parsed.ok) return fail(400, { shipError: parsed.message });
		const r = await shipSampleAsAdmin(event.params.code, parsed.courier, parsed.trackingNo, gate.ctx.user.id);
		done(event.url, r.ok ? (r.already ? 'ship_already' : 'shipped') : `err_${r.code}`);
	},

	/** 판매 일정 승인 — 확정되면 판매 링크가 생긴다(기간 우선권 검사는 RPC 안에서) */
	confirmSchedule: async (event) => {
		const gate = await requireAdmin(event);
		if (!gate.ok) redirect(303, gate.location);
		const r = await confirmScheduleAsAdmin(event.params.code, gate.ctx.user.id);
		done(event.url, r.ok ? (r.already ? 'schedule_already' : 'schedule_confirmed') : `err_${r.code}`);
	},

	/** 판매 일정 거절 */
	rejectSchedule: async (event) => {
		const gate = await requireAdmin(event);
		if (!gate.ok) redirect(303, gate.location);
		const form = await event.request.formData();
		const r = await rejectScheduleAsAdmin(event.params.code, String(form.get('reason') ?? ''), gate.ctx.user.id);
		done(event.url, r.ok ? (r.already ? 'schedule_already' : 'schedule_rejected') : `err_${r.code}`);
	},

	/** 관리자 발신 — "셀러리 운영팀" 으로 스레드에 남는다 */
	postChat: async (event) => {
		const gate = await requireAdmin(event);
		if (!gate.ok) redirect(303, gate.location);
		const form = await event.request.formData();
		const r = await postAdminChat(event.params.code, String(form.get('body') ?? ''), gate.ctx.user.id);
		if (!r.ok) {
			if (r.code === 'BAD_BODY') return fail(400, { chatError: r.message ?? '메시지를 다시 확인해주세요' });
			done(event.url, `err_${r.code}`);
		}
		done(event.url, r.ok && r.leak ? 'sent_leak' : 'sent');
	}
};
