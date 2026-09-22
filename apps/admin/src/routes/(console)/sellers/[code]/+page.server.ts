import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { SELLER_ACTION_MESSAGES } from '@sellery/db/admin/seller-rules';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { RATE_LIMIT_MESSAGE, getSeller, grantCelery, rateLimit, setChannelVerified, setSellerActive, setSellerHidden } from '$lib/server/partners';

/**
 * `/sellers/[code]` — 인플루언서 상세 · 운영 액션 (docs/admin-console-plan.md "파트너 관리").
 * load: `requireAdmin` → `getSeller(code)`(프로필 + 채널 전부). 없으면 404. `code` 는 `sellers.code`('s1') 또는 uuid.
 * 액션 3개 — 전부 `requireAdmin` 재확인 + 레이트리밋. **대상 인플루언서는 URL 파라미터만 신뢰**한다(폼 hidden 의 id 를 쓰지 않는다):
 *   `?/active`   정지 · 복귀       `setSellerActive`   — sellers.active (정지하면 requireSeller 가 /influencer/suspended 로)
 *   `?/hidden`   비공개 · 공개     `setSellerHidden`   — sellers.hidden (신규 쓰기 경로)
 *   `?/channel`  인증 완료 · 해제  `setChannelVerified` — 채널 ref 는 폼에서 받지만 함수가 대상을 다시 조회한 뒤 그 id 로 update 한다
 *   `?/grant`    🥬 지급          `grantCelery` — celery_ledger(reason 'admin_grant'). 멱등이 아니라 화면에서 confirm
 * 결과는 `?msg=` 로 같은 화면에 돌려주고 load 가 문구로 바꾼다(`SELLER_ACTION_MESSAGES` + 레이트리밋).
 */
const RATE = 30;

export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const detail = await getSeller(event.params.code);
	if (!detail) error(404, { message: '인플루언서를 찾을 수 없습니다' });

	const key = event.url.searchParams.get('msg') ?? '';
	const msg = key === 'err_rate' ? RATE_LIMIT_MESSAGE : key ? (SELLER_ACTION_MESSAGES[key] ?? null) : null;

	return {
		seller: detail.seller,
		channels: detail.channels,
		celery: detail.celery,
		msg,
		msgTone: key.startsWith('err') ? ('danger' as const) : ('ok' as const),
		self: `${adminPath('/sellers')}/${encodeURIComponent(event.params.code)}`,
		listPath: adminPath('/sellers')
	};
};

/** 액션 공통 — 게이트 재확인 + 레이트리밋(운영자당 30분 30건). 초과하면 `?msg=err_rate`. */
async function guard(event: RequestEvent, bucket: string) {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);
	const self = `${adminPath('/sellers')}/${encodeURIComponent(event.params.code)}`;
	if (!rateLimit(`${bucket}:${gate.ctx.user.id}`, RATE)) redirect(303, `${self}?msg=err_rate`);
	return self;
}

export const actions: Actions = {
	active: async (event) => {
		const self = await guard(event, 'admin-seller-active');
		const form = await event.request.formData();
		const active = form.get('active') === 'true';
		const reason = String(form.get('reason') ?? '').slice(0, 200);
		const res = await setSellerActive(event.params.code, active, reason);
		redirect(303, `${self}?msg=${res.code}`);
	},

	hidden: async (event) => {
		const self = await guard(event, 'admin-seller-hidden');
		const form = await event.request.formData();
		const hidden = form.get('hidden') === 'true';
		const res = await setSellerHidden(event.params.code, hidden);
		redirect(303, `${self}?msg=${res.code}`);
	},

	grant: async (event) => {
		const self = await guard(event, 'admin-seller-grant');
		const res = await grantCelery(event.params.code);
		redirect(303, `${self}?msg=${res.code}`);
	},

	channel: async (event) => {
		const self = await guard(event, 'admin-seller-channel');
		const form = await event.request.formData();
		const ref = String(form.get('channel') ?? '').trim();
		const verified = form.get('verified') === 'true';
		if (!ref) redirect(303, `${self}?msg=err_input`);
		const res = await setChannelVerified(ref, verified);
		redirect(303, `${self}?msg=${res.code}`);
	}
};
