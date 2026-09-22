import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { csStatusChip } from '@sellery/db/cs/cs-rules';
import { trackingUrlOf } from '@sellery/db/carriers';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { getAdminCsThread } from '$lib/server/money';

/**
 * `/cs/[code]` — 문의 스레드 **읽기 전용** (docs/admin-console-plan.md 결정 M10 — 답변·종료는 브랜드 콘솔). 액션 없음.
 * load: `getAdminCsThread(code)`(0020 app_admin_cs_thread) — 없으면 404. 주문 요약(매칭됐을 때) + 주문 상세 · 정산 상세 링크.
 */
export const load: PageServerLoad = async (event) => {
	const code = event.params.code;
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const t = await getAdminCsThread(code);
	if (!t) error(404, { message: '문의를 찾을 수 없습니다' });
	const c = t.conversation;

	return {
		email: gate.ctx.user.email ?? null,
		conversation: c,
		chip: csStatusChip(c.status),
		messages: t.messages,
		orderTrackingUrl: c.order ? trackingUrlOf(c.order.courier, c.order.tracking_no) : null,
		listPath: adminPath('/cs'),
		orderHref: c.order ? adminPath(`/orders/${encodeURIComponent(c.order.code)}`) : null,
		campaignOrdersHref: `${adminPath('/orders')}?q=${encodeURIComponent(c.campaign.code)}`,
		settleHref: adminPath(`/settle/${encodeURIComponent(c.campaign.code)}`)
	};
};
