import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminSettleFailMessage, settleRunSummary, type SettlementStatus } from '@sellery/db/admin/settle-rules';
import { adminPath, requireAdmin } from '$lib/server/admin';
import {
	RATE_LIMIT_MESSAGE,
	listAdminSettlements,
	listSampleRefundDue,
	listSampleSettleDue,
	rateLimit,
	runDueSettlements,
	refundSamplePurchase,
	settleSampleAsAdmin
} from '$lib/server/money';
import { sampleRefundMessage, sampleSettleMessage } from '@sellery/db/admin/sample-rules';

/**
 * `/settle` — 정산 실행 (docs/admin-console-plan.md "정산·돈" PR-B · 프로토타입 vAdminSettle · actions.ts runSettleAll).
 * load: `requireAdmin` → `listAdminSettlements(?status=)`(0020 app_admin_settlements) — 상단 띠(기준일 도래 · 보류 지급 · 미지급 합계) · 대기 큐(CLEARING 실시간 예상값 · 보류 예고) · 정산 명세 표(스냅샷 · `?status=pending|held|paid`).
 * 액션 `?/runDue` — 기준일(D+21) 도래 CLEARING 전부 `runDueSettlements`(app_admin_settle_run_due · 건별 한 트랜잭션) → 건별 결과(`settleRunSummary`)를 ActionData 로 같은 화면에. 개별 실행·강제 실행은 `/settle/[code]`.
 * 콘솔 화면에는 계좌 원문이 없다(bank_snapshot 마스킹 · M6).
 *
 * 0024 — **샘플 구매 대금** 두 큐를 같은 화면에 올린다(운영 결정 2026-09-28):
 *   · 발송 후 인플루언서가 진행하지 않은 건 → `[샘플 대금 정산]` 으로 브랜드에 지급(`?/settleSample`)
 *   · 결제 후 영업일 5일 미발송 → `[환불]`(`?/refundSample`). `refundSamplePurchase`(@sellery/payments)가
 *     **토스 현금분 취소 → `app_partner_payment_refund`**(🥬 복구 · 캠페인 DECLINED · 주문 CANCELED) 순서로 한다.
 *     토스 취소가 실패하면 DB 를 건드리지 않는다(0012 §5.7).
 */
export type SettleMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const sRaw = event.url.searchParams.get('status');
	const status: SettlementStatus | null = sRaw === 'pending' || sRaw === 'held' || sRaw === 'paid' ? sRaw : null;
	const [data, sampleDue, refundDue] = await Promise.all([
		listAdminSettlements(status, 200),
		listSampleSettleDue(),
		listSampleRefundDue()
	]);

	const key = event.url.searchParams.get('msg') ?? '';
	let msg: SettleMessage | null = null;
	if (key === 'err_rate') msg = { tone: 'danger', text: RATE_LIMIT_MESSAGE };
	const sampleMsg = sampleSettleMessage(key) ?? sampleRefundMessage(key);
	if (!msg && sampleMsg) msg = { tone: key.startsWith('err_') ? 'danger' : 'ok', text: sampleMsg };

	const self = adminPath('/settle');
	return {
		email: gate.ctx.user.email ?? null,
		status,
		data,
		sampleDue,
		refundDue,
		msg,
		chips: [
			{ key: '', label: '전체', href: self },
			{ key: 'pending', label: '지급 대기', href: `${self}?status=pending` },
			{ key: 'held', label: '일부 보류', href: `${self}?status=held` },
			{ key: 'paid', label: '지급 완료', href: `${self}?status=paid` }
		],
		self,
		payoutsPath: adminPath('/settle/payouts')
	};
};

export const actions: Actions = {
	/** 샘플 대금 정산 — 발송 후 진행하지 않은 건을 브랜드에 지급 (0024) */
	settleSample: async (event) => {
		const gate = await requireAdmin(event);
		if (!gate.ok) redirect(303, gate.location);
		if (!rateLimit(`admin-settle-sample:${gate.ctx.user.id}`, 20)) redirect(303, `${adminPath('/settle')}?msg=err_rate`);
		const fd = await event.request.formData();
		const r = await settleSampleAsAdmin(String(fd.get('campaign') ?? ''), gate.ctx.user.id);
		redirect(303, `${adminPath('/settle')}?msg=${r.ok ? (r.already ? 'already' : 'settled') : `err_${r.code}`}`);
	},

	/** 미발송 샘플 환불 — 토스 현금분 취소 → DB (0024 · 0012 §5.7 순서는 refundSamplePurchase 가 지킨다) */
	refundSample: async (event) => {
		const gate = await requireAdmin(event);
		if (!gate.ok) redirect(303, gate.location);
		if (!rateLimit(`admin-refund-sample:${gate.ctx.user.id}`, 10)) redirect(303, `${adminPath('/settle')}?msg=err_rate`);
		const fd = await event.request.formData();
		const paymentId = String(fd.get('payment') ?? '');

		/**
		 * 0033 — **인플루언서 요청이 있는 건만** 환불한다(운영 확인 2026-10-02).
		 * 화면은 요청이 없으면 버튼을 비활성화하지만, URL 로 직접 POST 하는 경로를 서버에서도 막는다.
		 * 기한이 지나도 인플루언서가 기다리는 중일 수 있으므로 환불은 되돌릴 수 없는 손해가 된다.
		 */
		const due = await listSampleRefundDue();
		const target = due.rows.find((x) => x.paymentId === paymentId);
		if (!target) redirect(303, `${adminPath('/settle')}?msg=err_refund_NOT_FOUND`);
		if (!target.requestedAt) redirect(303, `${adminPath('/settle')}?msg=err_refund_NO_REQUEST`);

		const r = await refundSamplePurchase(paymentId, {
			reason: '브랜드 미발송 (영업일 5일 경과) — 인플루언서 요청으로 관리자 환불',
			source: 'cancel'
		});
		const key = r.ok
			? r.already
				? 'refund_already'
				: 'refunded'
			: r.code === 'NOT_FOUND' || r.code === 'NOT_REFUNDABLE' || r.code === 'NOT_CANCELABLE'
				? `err_refund_${r.code}`
				: r.tossCanceled
					? 'err_refund_DB_ERROR'
					: 'err_refund_TOSS';
		redirect(303, `${adminPath('/settle')}?msg=${key}`);
	},

	runDue: async (event) => {
		const gate = await requireAdmin(event);
		if (!gate.ok) redirect(303, gate.location);
		if (!rateLimit(`admin-settle-due:${gate.ctx.user.id}`, 5)) redirect(303, `${adminPath('/settle')}?msg=err_rate`);
		const res = await runDueSettlements(gate.ctx.user.id);
		if (!res.ok) return fail(400, { kind: 'runDue' as const, message: adminSettleFailMessage(res.code), results: [] as { code: string; ok: boolean; line: string }[], settled: 0, failed: 0, count: 0 });
		return {
			kind: 'runDue' as const,
			message: null,
			count: res.count,
			settled: res.settled,
			failed: res.failed,
			results: res.results.map((r) => ({ code: r.campaign_code, ok: r.ok, line: settleRunSummary(r) }))
		};
	}
};
