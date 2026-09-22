import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { orderShipState } from '@sellery/db/brand/order-rules';
import { parseCsConversation, csStatusChip } from '@sellery/db/cs/cs-rules';
import { REFUND_REASONS } from '@sellery/db/order-status';
import { adminPath, requireAdmin } from '$lib/server/admin';
import { ADMIN_REFUND_REASON_MAX, RATE_LIMIT_MESSAGE, adminRefundFailMessage, getAdminOrder, rateLimit, refundOrderAsAdmin } from '$lib/server/money';

/**
 * `/orders/[code]` — 주문 상세 + 결제 정보 + 이벤트 + [환불] (docs/admin-console-plan.md 결정 M9 · M10 · docs/app-plan.md §7.4 · 0008 헤더 "정산 후 조정 큐").
 * load: `getAdminOrder(code)`(0020 app_admin_order — 주문 · 체크아웃 세션 요약 · payment_events 20 · 이 주문의 campaign_events 20 · 문의). 없으면 404.
 * 액션 `?/refund`(사유 셀렉트 REFUND_REASONS + 메모 → `refundOrderAsAdmin` — 발송 후 제한 없음 · 전액 · 토스 취소 → app_refund_record actor 'admin'):
 *   · SETTLED 캠페인 주문 → `adjust`: 주문 CANCELED + refund_needs_adjust(스냅샷 불변 · 운영자 조정) — 화면이 미리 "정산 조정으로 기록" 을 알린다
 *   · 결제키 없는 주문(시드·수기) → NO_PAYMENT_KEY 안내(`recordOnly` 는 콘솔에서 켜지 않는다 — 운영 스크립트)
 *   · 샘플 구매 주문 → SAMPLE 안내(refund-sample 흐름)
 *   → 303 `?msg=refunded|adjust|already` · 실패 `?err=`.
 */
export type OrderMessage = { tone: 'ok' | 'danger' | 'info'; text: string };

const REFUND_REASON_OPTIONS: readonly string[] = [...REFUND_REASONS, '재고 부족', '브랜드 사정', '운영 조정'];

export const load: PageServerLoad = async (event) => {
	const code = event.params.code;
	const gate = await requireAdmin(event);
	if (!gate.ok) redirect(303, gate.location);

	const d = await getAdminOrder(code);
	if (!d) error(404, { message: '주문을 찾을 수 없습니다' });
	const o = d.order;

	const key = event.url.searchParams.get('msg') ?? '';
	const err = event.url.searchParams.get('err');
	let msg: OrderMessage | null = null;
	if (err) msg = { tone: 'danger', text: err };
	else if (key === 'err_rate') msg = { tone: 'danger', text: RATE_LIMIT_MESSAGE };
	else if (key === 'refunded') msg = { tone: 'ok', text: '환불 처리 완료 — 토스 결제가 취소됐고 고객에게 안내됩니다.' };
	else if (key === 'adjust') msg = { tone: 'info', text: '환불 처리 완료 — 정산이 끝난 판매라 주문은 취소로 기록하고 정산 조정 큐(refund_needs_adjust)에 남겼어요. 스냅샷은 그대로이니 운영자가 조정하세요.' };
	else if (key === 'already') msg = { tone: 'info', text: '이미 환불·취소된 주문이에요.' };

	const state = orderShipState(o);
	const settled = o.campaign.status === 'SETTLED';
	return {
		email: gate.ctx.user.email ?? null,
		order: o,
		state,
		settled,
		session: d.session,
		paymentEvents: d.payment_events,
		campaignEvents: d.campaign_events,
		cs: d.cs.map(parseCsConversation).filter((x): x is NonNullable<typeof x> => x !== null).map((x) => ({ code: x.code, type: x.type, status: x.status, chip: csStatusChip(x.status), buyer_name: x.buyer_name, last_message_at: x.last_message_at, href: adminPath(`/cs/${encodeURIComponent(x.code)}`) })),
		refund: {
			possible: o.status === 'PAID' && !o.is_sample,
			hasKey: o.has_payment_key,
			settled,
			reasons: REFUND_REASON_OPTIONS,
			max: ADMIN_REFUND_REASON_MAX
		},
		msg,
		listPath: adminPath('/orders'),
		settleHref: adminPath(`/settle/${encodeURIComponent(o.campaign.code)}`),
		campaignOrdersHref: `${adminPath('/orders')}?q=${encodeURIComponent(o.campaign.code)}`
	};
};

const selfOf = (event: RequestEvent) => adminPath(`/orders/${encodeURIComponent(event.params.code ?? '')}`);

export const actions: Actions = {
	refund: async (event) => {
		const gate = await requireAdmin(event);
		if (!gate.ok) redirect(303, gate.location);
		const self = selfOf(event);
		if (!rateLimit(`admin-refund:${gate.ctx.user.id}`)) redirect(303, `${self}?msg=err_rate`);
		const fd = await event.request.formData();
		const str = (k: string) => {
			const v = fd.get(k);
			return typeof v === 'string' ? v.trim() : '';
		};
		const pick = str('reason');
		const memo = str('reason_text');
		const reason = [REFUND_REASON_OPTIONS.includes(pick) ? pick : '', memo].filter(Boolean).join(' — ').slice(0, ADMIN_REFUND_REASON_MAX) || '관리자 환불 처리';
		const res = await refundOrderAsAdmin(event.params.code, reason, { actorUserId: gate.ctx.user.id, allowSettled: true });
		if (!res.ok) {
			if (res.code === 'NOT_FOUND') error(404, { message: '주문을 찾을 수 없습니다' });
			const text = res.code === 'CANCEL_FAILED' && res.message ? `${adminRefundFailMessage(res.code)} (${res.message})` : adminRefundFailMessage(res.code);
			redirect(303, `${self}?err=${encodeURIComponent(text)}`);
		}
		redirect(303, `${self}?msg=${res.already ? 'already' : res.adjust ? 'adjust' : 'refunded'}`);
	}
};
