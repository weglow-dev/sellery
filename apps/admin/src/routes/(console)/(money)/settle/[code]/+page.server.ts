import { error, fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { HOLD_LABELS, adminSettleFailMessage, settleRunSummary } from '@sellery/db/admin/settle-rules';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { RATE_LIMIT_MESSAGE, holdPayout, listSettleEvents, markPayoutPaid, previewSettlement, rateLimit, releasePayout, runSettlement } from '$lib/server/money';

/**
 * `/settle/[code]` — 정산 상세 (docs/admin-console-plan.md "정산·돈" PR-B · settlement-policy §3 · §8 · 프로토타입 runSettle 의 결과 화면).
 * load: `previewSettlement(code)`(0020 app_admin_settle_preview — LIVE·CLEARING 은 실시간 calc() 전 라인 · SETTLED 는 스냅샷 + 지급 2건) + `listSettleEvents`(정산 관련 campaign_events).
 *   NOT_FOUND → 404 · WRONG_STATUS(샘플·일정 단계) → 화면에 안내(표 없음).
 * 액션(전부 requireAdmin → rateLimit):
 *   run     `runSettlement(code, { actorUserId, force })` — CLEARING · 기준일 도래분. 기준일 전은 `force` 체크(운영 예외 · 스냅샷 memo). 결과는 ActionData(settleRunSummary) 로 같은 화면 + load 재실행(스냅샷으로 전환).
 *   paid    `markPayoutPaid(payout_id, { memo })` — 이체 후 지급 완료(pending 만 · held 는 HELD)
 *   hold    `holdPayout(payout_id, reason)` — 운영자 보류(MANUAL)
 *   release `releasePayout(payout_id)` — 완비 재검사(미완비면 STILL_INCOMPLETE)
 *   → 303 `?msg=` (성공) · `?err=` (실패 문구). payout_id 는 uuid 검사(서버 함수) — 다른 캠페인의 지급건도 id 만 맞으면 통과하지만 관리자 전용이라 허용.
 */
export type DetailMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

const MSG: Record<string, DetailMessage> = {
	paid: { tone: 'ok', text: '지급 완료로 표시했어요 — 양측이 모두 완료되면 정산이 지급 완료로 바뀝니다.' },
	paid_already: { tone: 'info', text: '이미 지급 완료된 건이에요.' },
	held: { tone: 'info', text: '지급을 보류했어요 — 해제하면 다시 지급 대기가 됩니다.' },
	held_already: { tone: 'info', text: '이미 보류 중인 건이에요.' },
	released: { tone: 'ok', text: '보류를 해제했어요 — 다음 이체 파일에 포함됩니다.' },
	released_already: { tone: 'info', text: '보류 중이 아닌 건이에요.' },
	err_rate: { tone: 'danger', text: RATE_LIMIT_MESSAGE }
};

export const load: PageServerLoad = async (event) => {
	const code = event.params.code;
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const [res, events] = await Promise.all([previewSettlement(code), listSettleEvents(code)]);
	if (!res.ok && res.code === 'NOT_FOUND') error(404, { message: '캠페인을 찾을 수 없습니다' });

	const key = event.url.searchParams.get('msg') ?? '';
	const err = event.url.searchParams.get('err');
	const msg: DetailMessage | null = err ? { tone: 'danger', text: err } : (MSG[key] ?? null);

	return {
		code,
		email: gate.ctx.user.email ?? null,
		preview: res.ok ? res.preview : null,
		previewError: res.ok ? null : { code: res.code, status: res.status ?? null, message: adminSettleFailMessage(res.code) },
		events,
		msg,
		holdLabels: HOLD_LABELS,
		listPath: adminPath('/settle'),
		payoutsPath: adminPath('/settle/payouts'),
		ordersPath: `${adminPath('/orders')}?q=${encodeURIComponent(code)}`
	};
};

const selfOf = (event: RequestEvent) => adminPath(`/settle/${encodeURIComponent(event.params.code ?? '')}`);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function enter(event: RequestEvent, action: string) {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);
	const self = selfOf(event);
	if (!rateLimit(`admin-settle-${action}:${gate.ctx.user.id}`)) redirect(303, `${self}?msg=err_rate`);
	const fd = await event.request.formData();
	const str = (k: string) => {
		const v = fd.get(k);
		return typeof v === 'string' ? v.trim() : '';
	};
	return { gate, self, str, fd };
}

export const actions: Actions = {
	run: async (event) => {
		const { gate, str } = await enter(event, 'run');
		const force = str('force') === '1';
		const res = await runSettlement(event.params.code, { actorUserId: gate.ctx.user.id, force });
		if (!res.ok) return fail(400, { kind: 'run' as const, ok: false as const, message: settleRunSummary(res) });
		return { kind: 'run' as const, ok: true as const, message: settleRunSummary(res), already: res.already };
	},

	paid: async (event) => {
		const { gate, self, str } = await enter(event, 'paid');
		const id = str('payout_id');
		if (!UUID_RE.test(id)) redirect(303, `${self}?err=${encodeURIComponent(adminSettleFailMessage('NOT_FOUND'))}`);
		const res = await markPayoutPaid(id, { actorUserId: gate.ctx.user.id, memo: str('memo').slice(0, 200) || null });
		if (!res.ok) redirect(303, `${self}?err=${encodeURIComponent(adminSettleFailMessage(res.code))}`);
		redirect(303, `${self}?msg=${res.already ? 'paid_already' : 'paid'}#payouts`);
	},

	hold: async (event) => {
		const { self, str } = await enter(event, 'hold');
		const id = str('payout_id');
		if (!UUID_RE.test(id)) redirect(303, `${self}?err=${encodeURIComponent(adminSettleFailMessage('NOT_FOUND'))}`);
		const res = await holdPayout(id, str('reason').slice(0, 200) || null);
		if (!res.ok) redirect(303, `${self}?err=${encodeURIComponent(adminSettleFailMessage(res.code))}`);
		redirect(303, `${self}?msg=${res.already ? 'held_already' : 'held'}#payouts`);
	},

	release: async (event) => {
		const { self, str } = await enter(event, 'release');
		const id = str('payout_id');
		if (!UUID_RE.test(id)) redirect(303, `${self}?err=${encodeURIComponent(adminSettleFailMessage('NOT_FOUND'))}`);
		const res = await releasePayout(id);
		if (!res.ok) {
			const text = res.code === 'STILL_INCOMPLETE' && res.label ? `${adminSettleFailMessage(res.code)} (${res.label})` : adminSettleFailMessage(res.code);
			redirect(303, `${self}?err=${encodeURIComponent(text)}`);
		}
		redirect(303, `${self}?msg=${res.already ? 'released_already' : 'released'}#payouts`);
	}
};
