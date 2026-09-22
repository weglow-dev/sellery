import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { paymentsHealthIssues } from '@sellery/db/admin/settle-rules';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { getPaymentsHealth } from '$lib/server/money';

/**
 * `/payments` — 결제 정합성 대시보드 (docs/admin-console-plan.md "정산·돈" · docs/app-plan.md §7.3 · §7.5 · docs/deploy.md §8.2). 읽기만.
 * load: `getPaymentsHealth()`(0020 app_admin_payments_health) → 카드(체크아웃 세션 · 결제 이벤트 · 샘플 결제 · 주문 · 정산) + `paymentsHealthIssues`(0 이 아닌 운영 큐) 와 그 처리 자리 링크.
 * 크론(reconcile · campaign-tick)은 shop 에 있고 CRON_SECRET 이 필요하므로 여기서 부르지 않는다 — "마지막 reconcile" 과 실행 방법만 적는다.
 */
export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const h = await getPaymentsHealth();
	const ordersPath = adminPath('/orders');
	const settlePath = adminPath('/settle');
	const payoutsPath = adminPath('/settle/payouts');
	const ISSUE_HREF: Record<string, { href: string; how: string }> = {
		stale_confirming: { href: `${ordersPath}?f=manual`, how: 'reconcile 크론(10분)이 토스 재조회로 종결해요 — 수동: POST /api/cron/reconcile (docs/deploy.md §8.2)' },
		cancel_pending: { href: ordersPath, how: 'reconcile 이 토스 취소를 재시도해요. 계속 남으면 토스 콘솔에서 취소 상태를 확인' },
		unhandled_events: { href: ordersPath, how: 'payment_events.handled=false — 주문 상세의 결제 이벤트에서 원인을 보고 처리 뒤 handled 로' },
		partner_confirming: { href: ordersPath, how: 'reconcile 이 partner_payments 를 재조회해요 (0012 app_partner_payments_stale)' },
		partner_cancel_pending: { href: ordersPath, how: 'partner-admin.mjs refund-sample <payment id> 로 재시도' },
		partial_refund: { href: `${ordersPath}?f=partial`, how: '토스 콘솔 부분취소 — 정산 refunds 에 차감되지만 운영자가 주문 상세에서 확인' },
		refund_needs_adjust: { href: `${ordersPath}?f=refunded`, how: '정산 완료 뒤 환불 — 스냅샷은 그대로이니 다음 정산·지급에서 수동 조정' },
		due_now: { href: settlePath, how: '정산 실행 화면에서 [도래분 일괄 실행]' },
		payouts_held: { href: `${payoutsPath}?status=held`, how: '파트너가 정산 정보를 등록하면 [보류 해제]' }
	};

	return {
		email: gate.ctx.user.email ?? null,
		health: h,
		issues: h ? paymentsHealthIssues(h).map((i) => ({ ...i, ...(ISSUE_HREF[i.key] ?? { href: ordersPath, how: '' }) })) : [],
		ordersPath,
		settlePath,
		payoutsPath
	};
};
