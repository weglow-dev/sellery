import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { getAdminDashboard, listRecentActivity } from '$lib/server/partners';
import { getPaymentsHealth } from '$lib/server/money';
import { parseCampaignStatusFilter, sortCampaignStatusCounts } from '@sellery/db/admin/campaign-rules';

/**
 * 관리자 홈 = **대시보드**. 데모 `(demo)/demo`(`vAdminHome`) 와 같은 구성 —
 * 히어로 띠(전체 카운트) · KPI 4장 · 오늘 할 일 · 최근 활동 · 전체 캠페인 표.
 *
 * 숫자는 두 곳에서 온다:
 *   · `getAdminDashboard()` — 카운트 · 캠페인별 정산 미리보기 합(GMV · 플랫폼 순수익)
 *   · `getPaymentsHealth()`(0020) — 정산 기준일 도래 · 지급 보류 · 미처리 결제 이벤트 · 환불 후 조정
 * 기준일(D+21) 판정을 두 번 구현하지 않으려고 "정산 실행 가능" 은 health 쪽 `due_now` 를 쓴다.
 *
 * 데모의 **[데이터 초기화]** 버튼은 옮기지 않는다 — localStorage 시드를 되돌리는 데모 전용 동작이고(`act.reset()`),
 * 실서비스에서 같은 버튼은 운영 데이터를 지우는 뜻이 되어 있어서는 안 된다.
 */
export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const [dash, health, activity] = await Promise.all([getAdminDashboard(), getPaymentsHealth(), listRecentActivity(8)]);

	// 캠페인 필터는 데모 `S.ui.admCF` 의 실서비스 판 — 주소로 남겨 공유·새로고침이 되게 한다
	const statusFilter = parseCampaignStatusFilter(event.url.searchParams.get('status'));

	return {
		email: gate.ctx.user.email ?? null,
		totals: dash.totals,
		kpi: dash.kpi,
		todo: dash.todo,
		activity,
		statusFilter,
		statusCounts: sortCampaignStatusCounts(dash.statusCounts),
		campaigns: statusFilter ? dash.campaigns.filter((c) => c.status === statusFilter) : dash.campaigns,
		money: health
			? {
					dueNow: health.settlements.due_now,
					payoutsHeld: health.settlements.payouts_held,
					unhandledEvents: health.payment_events.unhandled,
					refundNeedsAdjust: health.orders.refund_needs_adjust
				}
			: null,
		paths: {
			sellers: adminPath('/sellers'),
			brands: adminPath('/brands'),
			products: adminPath('/products'),
			settle: adminPath('/settle'),
			payments: adminPath('/payments'),
			orders: adminPath('/orders')
		}
	};
};
