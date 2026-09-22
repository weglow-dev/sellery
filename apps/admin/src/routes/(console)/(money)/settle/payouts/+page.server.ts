import { redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminSettleFailMessage, type PayoutStatus, type PayoutView } from '@sellery/db/admin/settle-rules';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { RATE_LIMIT_MESSAGE, holdPayout, listAdminSettlements, markPayoutPaid, rateLimit, releasePayout } from '$lib/server/money';

/**
 * `/settle/payouts` — 지급 관리 (docs/admin-console-plan.md "정산·돈" PR-B · settlement-policy §8.3 · inf §5.9 "payouts.status → paid 전이는 운영자").
 * load: `listAdminSettlements(null, 500)` 의 스냅샷 행을 지급 건(인플루언서/브랜드)으로 펼쳐 `?status=pending|held|paid`(기본 pending) 로 거른다 — SQL 추가 없음.
 *   행: 캠페인 · 대상 · 정산유형 · 계좌(마스킹) · 금액 · 상태 · 보류 사유 · 정산일/지급일 · [지급 완료]/[보류]/[해제].
 *   [이체 파일 CSV] = `GET /settle/payouts/export.csv?status=&purpose=`(계좌 원문 · 건마다 열람 로그 · purpose 필수) · [원천징수 자료 CSV] = `GET /settle/rrn.csv?ids=&purpose=`(개인 인플루언서 정산건 · RRN_ENC_KEY 필요).
 * 액션 `?/paid` `?/hold` `?/release` — `/settle/[code]` 와 같은 함수 · 303 `?status=…&msg=` 로 돌아온다.
 */
export type PayoutRow = PayoutView & {
	campaign_code: string;
	title: string | null;
	settlement_id: string | null;
	settled_at: string | null;
	payee_name: string;
	payee_sub: string;
	settle_type: string | null;
};

export type PayoutsMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

const MSG: Record<string, PayoutsMessage> = {
	paid: { tone: 'ok', text: '지급 완료로 표시했어요.' },
	paid_already: { tone: 'info', text: '이미 지급 완료된 건이에요.' },
	held: { tone: 'info', text: '지급을 보류했어요.' },
	held_already: { tone: 'info', text: '이미 보류 중인 건이에요.' },
	released: { tone: 'ok', text: '보류를 해제했어요 — 다음 이체 파일에 포함됩니다.' },
	released_already: { tone: 'info', text: '보류 중이 아닌 건이에요.' },
	err_rate: { tone: 'danger', text: RATE_LIMIT_MESSAGE }
};

export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const sRaw = event.url.searchParams.get('status');
	const status: PayoutStatus | 'all' = sRaw === 'all' ? 'all' : sRaw === 'held' || sRaw === 'paid' ? sRaw : 'pending';
	const all = await listAdminSettlements(null, 500);

	const rows: PayoutRow[] = [];
	for (const r of all?.rows ?? []) {
		for (const po of [r.payouts.seller, r.payouts.brand]) {
			if (!po) continue;
			rows.push({
				...po,
				campaign_code: r.campaign_code,
				title: r.product?.name ?? r.title ?? null,
				settlement_id: r.settlement?.id ?? r.settlement_id,
				settled_at: r.settlement?.settled_at ?? null,
				payee_name: po.payee_type === 'seller' ? (r.seller?.name ?? '—') : (r.brand?.name ?? '—'),
				payee_sub: po.payee_type === 'seller' ? [r.seller?.handle, r.seller?.grade].filter(Boolean).join(' · ') : (r.brand?.grade ?? ''),
				settle_type: po.payee_type === 'seller' ? (r.seller?.settle_type ?? null) : 'biz'
			});
		}
	}
	const counts = { pending: rows.filter((x) => x.status === 'pending').length, held: rows.filter((x) => x.status === 'held').length, paid: rows.filter((x) => x.status === 'paid').length };
	const filtered = status === 'all' ? rows : rows.filter((x) => x.status === status);
	const totalAmount = filtered.reduce((a, x) => a + x.amount, 0);

	const key = event.url.searchParams.get('msg') ?? '';
	const err = event.url.searchParams.get('err');
	const msg: PayoutsMessage | null = err ? { tone: 'danger', text: err } : (MSG[key] ?? null);

	const self = adminPath('/settle/payouts');
	return {
		email: gate.ctx.user.email ?? null,
		status,
		rows: filtered,
		counts,
		totalAmount,
		loaded: all !== null,
		msg,
		chips: [
			{ key: 'pending', label: '지급 대기', n: counts.pending, href: self },
			{ key: 'held', label: '보류', n: counts.held, href: `${self}?status=held` },
			{ key: 'paid', label: '지급 완료', n: counts.paid, href: `${self}?status=paid` },
			{ key: 'all', label: '전체', n: rows.length, href: `${self}?status=all` }
		],
		self,
		exportPath: adminPath('/settle/payouts/export.csv'),
		rrnPath: adminPath('/settle/rrn.csv'),
		settlePath: adminPath('/settle')
	};
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function backOf(event: RequestEvent, params: Record<string, string>): string {
	const p = new URLSearchParams();
	const s = event.url.searchParams.get('status');
	if (s && s !== 'pending') p.set('status', s);
	for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
	const q = p.toString();
	return `${adminPath('/settle/payouts')}${q ? `?${q}` : ''}`;
}

async function enter(event: RequestEvent, action: string) {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);
	if (!rateLimit(`admin-payout-${action}:${gate.ctx.user.id}`, 60)) redirect(303, backOf(event, { msg: 'err_rate' }));
	const fd = await event.request.formData();
	const str = (k: string) => {
		const v = fd.get(k);
		return typeof v === 'string' ? v.trim() : '';
	};
	const id = str('payout_id');
	if (!UUID_RE.test(id)) redirect(303, backOf(event, { err: adminSettleFailMessage('NOT_FOUND') }));
	return { gate, str, id };
}

export const actions: Actions = {
	paid: async (event) => {
		const { gate, str, id } = await enter(event, 'paid');
		const res = await markPayoutPaid(id, { actorUserId: gate.ctx.user.id, memo: str('memo').slice(0, 200) || null });
		if (!res.ok) redirect(303, backOf(event, { err: adminSettleFailMessage(res.code) }));
		redirect(303, backOf(event, { msg: res.already ? 'paid_already' : 'paid' }));
	},
	hold: async (event) => {
		const { str, id } = await enter(event, 'hold');
		const res = await holdPayout(id, str('reason').slice(0, 200) || null);
		if (!res.ok) redirect(303, backOf(event, { err: adminSettleFailMessage(res.code) }));
		redirect(303, backOf(event, { msg: res.already ? 'held_already' : 'held' }));
	},
	release: async (event) => {
		const { id } = await enter(event, 'release');
		const res = await releasePayout(id);
		if (!res.ok) redirect(303, backOf(event, { err: res.code === 'STILL_INCOMPLETE' && res.label ? `${adminSettleFailMessage(res.code)} (${res.label})` : adminSettleFailMessage(res.code) }));
		redirect(303, backOf(event, { msg: res.already ? 'released_already' : 'released' }));
	}
};
