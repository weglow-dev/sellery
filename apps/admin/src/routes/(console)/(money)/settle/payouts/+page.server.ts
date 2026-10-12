import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { adminSettleFailMessage, type PayoutStatus, type PayoutView } from '@sellery/db/admin/settle-rules';
import { adminPath, requireAdmin } from '$lib/server/admin';
import {
	RATE_LIMIT_MESSAGE,
	cancelTossPayout,
	countPayoutsByStatus,
	getPayoutMode,
	holdPayout,
	listAdminSettlements,
	listPostSettleRefunds,
	type PostSettleRefund,
	markPayoutPaid,
	payoutTossOverview,
	rateLimit,
	refreshTossPayout,
	releasePayout,
	requestDuePayouts,
	setPayoutMode,
	syncPayeeWithToss,
	type PayoutTossOverview,
	type TossQueueRow
} from '$lib/server/money';

/**
 * `/settle/payouts` — 지급 관리 (docs/admin-console-plan.md "정산·돈" PR-B · §7 토스 지급대행 · settlement-policy §8.3 · inf §5.9 "payouts.status → paid 전이는 운영자").
 * load: `listAdminSettlements(null, 500)` 의 스냅샷 행을 지급 건(인플루언서/브랜드/추천인)으로 펼쳐 `?status=pending|held|paid`(기본 pending) 로 거른다 — SQL 추가 없음.
 *   행: 캠페인 · 대상 · 정산유형 · 계좌(마스킹) · 금액 · 상태 · 보류 사유 · 정산일/지급일 · [지급 완료]/[보류]/[해제].
 *   [이체 파일 CSV] = `GET /settle/payouts/export.csv?status=&purpose=`(계좌 원문 · 건마다 열람 로그 · purpose 필수) · [원천징수 자료 CSV] = `GET /settle/rrn.csv?ids=&purpose=`(개인 인플루언서 정산건 · RRN_ENC_KEY 필요).
 * 토스 지급대행(0040 · `payout_mode`):
 *   `payoutMode` 는 항상 싣는다. 'toss' 면 `payoutTossOverview()`(토스 잔액 · 행별 셀러 상태 · 지급 상태 · requestable) 도 싣고 화면이 [토스로 지급 요청] 블록을 그린다 — 이체 파일은 그대로 남는다(폴백).
 *   액션 `?/tossRequest`(체크한 payout_ids · EXPRESS 또는 예약일 → `requestDuePayouts` · 결과는 ActionData) · `?/tossCancel`(REQUESTED 만) · `?/tossRefresh`(재조회) · `?/tossSync`(파트너 셀러 재등록)
 *   **공유 잔액 가드(2026-10-08)**: 지급대행 상점 `peerkeamf5` 는 다른 서비스와 잔액을 공유한다 — `toss.guard`(셀러리 지급 대기 합계 · 오늘 요청 · 하루 상한 `platform_settings.payout_daily_cap`)를 싣고,
 *   `requestDuePayouts` 가 배치 전체를 잔액·큐 합계·하루 상한으로 검사해 걸리면(BALANCE_UNKNOWN · BALANCE_EXCEEDED · QUEUE_EXCEEDED · DAILY_CAP_EXCEEDED) 한 건도 보내지 않는다 — 화면은 errors 로 보여준다.
 *   · `?/payoutMode`(manual ↔ toss · 보류 재검사 · confirm). 'manual' 에서는 토스 블록·칩이 보이지 않고 기존 흐름 그대로.
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
	/** 토스 모드에서만 — 큐 행(셀러 상태 · requestable · reason) */
	toss: TossQueueRow | null;
	/**
	 * 정산 후 환불 (0051) — 정산 확정 뒤 들어온 환불. **이 금액만큼 과지급된다.**
	 * 정산은 보관액을 남김없이 쪼개므로 여유분이 없고, 환불하면 보관액만 줄고 지급액은 그대로다.
	 * 금액을 깎지 않는 이유는 설계가 수동 정산 조정이기 때문(docs/app-plan.md:625 · 0051 헤더).
	 */
	post_refund: PostSettleRefund | null;
};

export type PayoutsMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

const MSG: Record<string, PayoutsMessage> = {
	paid: { tone: 'ok', text: '지급 완료로 표시했어요.' },
	paid_already: { tone: 'info', text: '이미 지급 완료된 건이에요.' },
	held: { tone: 'info', text: '지급을 보류했어요.' },
	held_already: { tone: 'info', text: '이미 보류 중인 건이에요.' },
	released: { tone: 'ok', text: '보류를 해제했어요 — 다음 이체 파일에 포함됩니다.' },
	released_already: { tone: 'info', text: '보류 중이 아닌 건이에요.' },
	toss_canceled: { tone: 'ok', text: '토스 지급 요청을 취소했어요 — 다시 요청할 수 있어요.' },
	toss_refreshed: { tone: 'ok', text: '토스 지급 상태를 다시 읽었어요.' },
	toss_synced: { tone: 'ok', text: '토스 셀러 정보를 다시 보냈어요 — 상태 칩을 확인하세요.' },
	mode_toss: { tone: 'ok', text: '지급 방식을 토스 지급대행으로 바꿨어요 — 보류 조건에 토스 셀러 상태가 더해졌고, 전체 지급 건을 다시 검사했어요.' },
	mode_manual: { tone: 'ok', text: '지급 방식을 이체 파일(수동)로 되돌렸어요 — 토스 조건 보류가 풀렸어요.' },
	err_rate: { tone: 'danger', text: RATE_LIMIT_MESSAGE }
};

/** 정산 명세 조회 상한 — 화면 행은 이만큼의 명세에서 나온다. 건수·합계·이체 파일은 이 상한과 무관하게 전체 기준이다. */
const SETTLEMENT_CAP = 500;

export const load: PageServerLoad = async (event) => {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const sRaw = event.url.searchParams.get('status');
	const status: PayoutStatus | 'all' = sRaw === 'all' ? 'all' : sRaw === 'held' || sRaw === 'paid' ? sRaw : 'pending';
	const [all, payoutMode, postRefunds, exact] = await Promise.all([listAdminSettlements(null, SETTLEMENT_CAP), getPayoutMode(), listPostSettleRefunds(SETTLEMENT_CAP), countPayoutsByStatus()]);
	const overview: PayoutTossOverview | null = payoutMode === 'toss' ? await payoutTossOverview({ withBalance: true }) : null;
	const tossById = new Map<string, TossQueueRow>();
	for (const r of overview?.rows ?? []) tossById.set(r.payout_id, r);

	const rows: PayoutRow[] = [];
	for (const r of all?.rows ?? []) {
		// 추천 보상(0027)도 펼친다 — 캠페인 당사자가 아니라 인플루언서를 데려온 사람이다.
		// 없는 정산에서는 `payouts.referrer` 가 null 이라 그냥 건너뛴다.
		for (const po of [r.payouts.seller, r.payouts.brand, r.payouts.referrer]) {
			if (!po) continue;
			const party = po.payee_type === 'brand' ? null : po.payee_type === 'referrer' ? r.referrer : r.seller;
			rows.push({
				...po,
				campaign_code: r.campaign_code,
				title: r.product?.name ?? r.title ?? null,
				settlement_id: r.settlement?.id ?? r.settlement_id,
				// 정산 후 환불 (0051) — 이 금액만큼 과지급된다. 조정은 운영자가 손으로 한다(app-plan.md:625).
				post_refund: postRefunds.get(r.settlement?.id ?? r.settlement_id ?? '') ?? null,
				settled_at: r.settlement?.settled_at ?? null,
				payee_name: party ? (party.name ?? '—') : (r.brand?.name ?? '—'),
				payee_sub:
					po.payee_type === 'brand'
						? (r.brand?.grade ?? '')
						: po.payee_type === 'referrer'
							? [party?.handle, `${r.seller?.name ?? '?'} 추천`].filter(Boolean).join(' · ')
							: [party?.handle, party?.grade].filter(Boolean).join(' · '),
				// 추천 보상은 원천징수하지 않으므로 정산유형을 쓰지 않는다(원천징수 자료 CSV 대상도 아니다)
				settle_type: po.payee_type === 'seller' ? (r.seller?.settle_type ?? null) : 'biz',
				toss: tossById.get(po.id) ?? null
			});
		}
	}
	/**
	 * 건수·합계는 **테이블 전체 기준**을 쓴다 — 받아온 행(`rows`)은 정산 명세 500건 안의 것이라
	 * 명세가 그 수를 넘으면 모자란 숫자가 되고, 그 숫자를 이체 파일 버튼에 적으면 CSV 행 수와 어긋난다.
	 *   건수: `countPayoutsByStatus()` (payouts 테이블 count=exact)
	 *   금액: 대기분만 `counts.payouts_pending_amount`(테이블 전체 sum)가 있다. 보류·완료·전체 금액은
	 *         PostgREST 가 집계를 막아(PGRST123) 정확한 값을 만들 수 없어 받아온 행 합계를 쓰고 화면에 그 사실을 밝힌다.
	 * 집계 조회가 실패하면(`exact === null`) 받아온 행으로 되돌린다 — 숫자가 사라지는 것보다 낫다.
	 */
	const shown = { pending: rows.filter((x) => x.status === 'pending').length, held: rows.filter((x) => x.status === 'held').length, paid: rows.filter((x) => x.status === 'paid').length };
	const counts = exact ?? { ...shown, all: rows.length };
	const filtered = status === 'all' ? rows : rows.filter((x) => x.status === status);
	const shownAmount = filtered.reduce((a, x) => a + x.amount, 0);
	/** 이 상태의 합계가 테이블 전체 기준인가 — 대기분만 참 */
	const amountIsExact = status === 'pending' && all !== null;
	const totalAmount = amountIsExact ? all.counts.payouts_pending_amount : shownAmount;
	/** 받아온 행이 전체보다 적은가 — 화면에 "표시 N건" 을 덧붙일지 결정 */
	const shownCount = status === 'all' ? rows.length : filtered.length;
	const truncated = shownCount < (status === 'all' ? counts.all : counts[status]);

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
		/** `totalAmount` 가 테이블 전체 기준인가 (대기분만 참) — 화면이 문구로 구분한다 */
		amountIsExact,
		/** 지금 화면에 그려진 행 수 — `counts` 보다 적으면 명세 상한에 걸린 것 */
		shownCount,
		truncated,
		/** 명세 조회 상한 — 안내 문구가 이 값을 쓴다(하드코딩하면 상한을 바꿀 때 거짓말이 된다) */
		cap: SETTLEMENT_CAP,
		loaded: all !== null,
		msg,
		payoutMode,
		toss: overview
			? {
					configured: overview.configured,
					balance: overview.balance ? { available: overview.balance.availableAmount, pending: overview.balance.pendingAmount } : null,
					balanceError: overview.balanceError,
					requestable: overview.rows.filter((x) => x.requestable).length,
					inFlight: overview.rows.filter((x) => x.toss_payout_status === 'REQUESTED' || x.toss_payout_status === 'IN_PROGRESS').length,
					// 공유 잔액 가드(2026-10-08) — "토스 잔액 · 셀러리 지급 대기 · 오늘 요청 / 상한" 한 줄 + 요청 전 안내
					guard: {
						queueTotal: overview.guard.queueTotal,
						inFlightTotal: overview.guard.inFlightTotal,
						requestedToday: overview.guard.requestedToday,
						dailyCap: overview.guard.dailyCap,
						remainingToday: Math.max(0, overview.guard.dailyCap - overview.guard.requestedToday)
					}
				}
			: null,
		chips: [
			{ key: 'pending', label: '지급 대기', n: counts.pending, href: self },
			{ key: 'held', label: '보류', n: counts.held, href: `${self}?status=held` },
			{ key: 'paid', label: '지급 완료', n: counts.paid, href: `${self}?status=paid` },
			{ key: 'all', label: '전체', n: counts.all, href: `${self}?status=all` }
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

async function enter(event: RequestEvent, action: string, opts: { requireId?: boolean } = { requireId: true }) {
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);
	if (!rateLimit(`admin-payout-${action}:${gate.ctx.user.id}`, 60)) redirect(303, backOf(event, { msg: 'err_rate' }));
	const fd = await event.request.formData();
	const str = (k: string) => {
		const v = fd.get(k);
		return typeof v === 'string' ? v.trim() : '';
	};
	const id = str('payout_id');
	if (opts.requireId && !UUID_RE.test(id)) redirect(303, backOf(event, { err: adminSettleFailMessage('NOT_FOUND') }));
	return { gate, str, id, fd };
}

export type TossRequestAction = {
	kind: 'tossRequest';
	ok: boolean;
	summary: string;
	requested: { payout_id: string; toss_payout_id: string; status: string; amount: number; payee_name: string | null }[];
	skipped: { payout_id: string; reason: string }[];
	errors: { code: string; message: string; payout_ids: string[] }[];
};

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
	},

	/* ---------------- 토스 지급대행 (0040) ---------------- */
	tossRequest: async (event) => {
		const { gate, str, fd } = await enter(event, 'toss-request', { requireId: false });
		const ids = fd.getAll('toss_ids').filter((v): v is string => typeof v === 'string' && UUID_RE.test(v));
		const all = str('all') === '1';
		if (!all && ids.length === 0) return fail(400, { kind: 'tossRequest' as const, ok: false, summary: '지급 요청할 건을 체크하거나 [전체 대기 요청]을 누르세요.', requested: [], skipped: [], errors: [] } satisfies TossRequestAction);
		const scheduleType = str('schedule') === 'scheduled' ? 'SCHEDULED' : 'EXPRESS';
		const date = str('date');
		if (scheduleType === 'SCHEDULED' && date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return fail(400, { kind: 'tossRequest' as const, ok: false, summary: '예약일은 YYYY-MM-DD 형식이어야 해요.', requested: [], skipped: [], errors: [] } satisfies TossRequestAction);
		}
		const res = await requestDuePayouts({ ids: all ? undefined : ids, scheduleType, payoutDate: date || null, actor: gate.ctx.user.email ?? gate.ctx.user.id });
		const summary = `토스 지급 요청 ${res.requested.length}건${res.skipped.length ? ` · 건너뜀 ${res.skipped.length}건` : ''}${res.errors.length ? ` · 오류 ${res.errors.length}` : ''} (${scheduleType === 'EXPRESS' ? '즉시' : `예약 ${date || '다음 영업일'}`})`;
		const out: TossRequestAction = { kind: 'tossRequest', ok: res.ok, summary, requested: res.requested, skipped: res.skipped, errors: res.errors };
		return res.ok ? out : fail(res.requested.length ? 207 : 400, out);
	},
	tossCancel: async (event) => {
		const { gate, id } = await enter(event, 'toss-cancel');
		const res = await cancelTossPayout(id, { actor: gate.ctx.user.email ?? gate.ctx.user.id });
		if (!res.ok) redirect(303, backOf(event, { err: `토스 취소 실패 — ${res.message ?? res.code}` }));
		redirect(303, backOf(event, { msg: 'toss_canceled' }));
	},
	tossRefresh: async (event) => {
		const { id } = await enter(event, 'toss-refresh');
		const res = await refreshTossPayout(id);
		if (!res.ok) redirect(303, backOf(event, { err: `토스 재조회 실패 — ${res.message ?? res.code}` }));
		redirect(303, backOf(event, { msg: 'toss_refreshed' }));
	},
	tossSync: async (event) => {
		const { gate, str } = await enter(event, 'toss-sync', { requireId: false });
		const payeeType = str('payee_type') === 'brand' ? 'brand' : 'seller';
		const payeeId = str('payee_id');
		if (!UUID_RE.test(payeeId)) redirect(303, backOf(event, { err: adminSettleFailMessage('NOT_FOUND') }));
		const res = await syncPayeeWithToss(payeeType, payeeId, { actor: gate.ctx.user.email ?? 'admin' });
		if (!res.ok) redirect(303, backOf(event, { err: `토스 셀러 동기화 실패 — ${res.message ?? res.code}` }));
		redirect(303, backOf(event, { msg: 'toss_synced' }));
	},
	payoutMode: async (event) => {
		const { str } = await enter(event, 'mode', { requireId: false });
		const mode = str('mode') === 'toss' ? 'toss' : 'manual';
		const res = await setPayoutMode(mode);
		if (!res.ok) redirect(303, backOf(event, { err: `지급 방식 변경 실패 (${res.code})` }));
		redirect(303, backOf(event, { msg: mode === 'toss' ? 'mode_toss' : 'mode_manual' }));
	}
};
