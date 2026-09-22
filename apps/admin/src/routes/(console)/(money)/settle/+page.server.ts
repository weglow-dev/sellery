import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminSettleFailMessage, settleRunSummary, type SettlementStatus } from '@sellery/db/admin/settle-rules';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { RATE_LIMIT_MESSAGE, listAdminSettlements, rateLimit, runDueSettlements } from '$lib/server/money';

/**
 * `/settle` — 정산 실행 (docs/admin-console-plan.md "정산·돈" PR-B · 프로토타입 vAdminSettle · actions.ts runSettleAll).
 * load: `requireAdmin` → `listAdminSettlements(?status=)`(0020 app_admin_settlements) — 상단 띠(기준일 도래 · 보류 지급 · 미지급 합계) · 대기 큐(CLEARING 실시간 예상값 · 보류 예고) · 정산 명세 표(스냅샷 · `?status=pending|held|paid`).
 * 액션 `?/runDue` — 기준일(D+21) 도래 CLEARING 전부 `runDueSettlements`(app_admin_settle_run_due · 건별 한 트랜잭션) → 건별 결과(`settleRunSummary`)를 ActionData 로 같은 화면에. 개별 실행·강제 실행은 `/settle/[code]`.
 * 콘솔 화면에는 계좌 원문이 없다(bank_snapshot 마스킹 · M6).
 */
export type SettleMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const sRaw = event.url.searchParams.get('status');
	const status: SettlementStatus | null = sRaw === 'pending' || sRaw === 'held' || sRaw === 'paid' ? sRaw : null;
	const data = await listAdminSettlements(status, 200);

	const key = event.url.searchParams.get('msg') ?? '';
	let msg: SettleMessage | null = null;
	if (key === 'err_rate') msg = { tone: 'danger', text: RATE_LIMIT_MESSAGE };

	const self = adminPath('/settle');
	return {
		email: gate.ctx.user.email ?? null,
		status,
		data,
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
