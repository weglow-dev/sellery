import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CS_STATUS_CHIPS, csStatusChip, isCsStatus, type CsStatus } from '@sellery/db/cs/cs-rules';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { listAdminCs } from '$lib/server/money';

/**
 * `/cs` — 전 브랜드 고객 문의 **열람** (docs/admin-console-plan.md 결정 M10 · CLAUDE.md "고객 문의는 브랜드사로 바로 · 관리자는 열람만" · 브랜드 콘솔 `/cs` 의 관리자 판).
 * load: `listAdminCs(?status=)`(0020 app_admin_cs_list — OPEN 먼저 · 최근 메시지순). 칩 카운트는 전체에서. 행 → `/cs/[code]`(스레드 읽기 전용).
 */
export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const sRaw = event.url.searchParams.get('status') ?? '';
	const status: CsStatus | null = isCsStatus(sRaw) ? sRaw : null;
	const all = await listAdminCs(null, 500);
	const self = adminPath('/cs');
	const count = (st: CsStatus) => all.filter((x) => x.status === st).length;

	return {
		email: gate.ctx.user.email ?? null,
		status,
		chips: [
			{ key: '', label: '전체', n: all.length, href: self },
			...(Object.keys(CS_STATUS_CHIPS) as CsStatus[]).map((k) => ({ key: k, label: CS_STATUS_CHIPS[k].label, n: count(k), href: `${self}?status=${k}` }))
		],
		open: count('OPEN'),
		rows: (status ? all.filter((x) => x.status === status) : all).map((x) => ({
			code: x.code,
			status: x.status,
			chip: csStatusChip(x.status),
			type: x.type,
			buyer_name: x.buyer_name,
			is_member: x.is_member,
			order_code: x.order_code,
			order_matched: x.order !== null,
			last_preview: x.last_preview,
			last_message_at: x.last_message_at,
			message_count: x.message_count,
			campaign: { code: x.campaign.code, product: x.campaign.product, seller: x.campaign.seller, brand: x.campaign.brand },
			href: adminPath(`/cs/${encodeURIComponent(x.code)}`)
		})),
		ordersPath: adminPath('/orders')
	};
};
