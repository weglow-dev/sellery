/**
 * 결제 세션 ↔ 토스 상태 동기화 — /api/payments/{confirm,webhook} · /api/cron/reconcile 공용 (packages/payments checkout-sync.server.ts 의 MYR 판).
 * 원칙(셀러리 app-plan §0 결정 5·5-1 그대로):
 *   - 상태 변경은 DB 함수(myr_app_claim/confirm_checkout · myr_app_deposit_*) 또는 `.in('status', 기대값)` 조건부 update 로만.
 *   - 돈이 토스에서 움직인 뒤(DONE · WAITING_FOR_DEPOSIT · CANCELED)의 기록은 현실을 거부하지 않는다. confirm 함수가 ok:false 를 주면 반드시 토스 전액 취소
 *     → FAILED(code). 취소 실패 → FAILED(CANCEL_PENDING, fail_message=원래 code) + payment_events handled=false(운영 큐 · reconcile 이 재시도).
 *   - 가상계좌(§6.7): WAITING_FOR_DEPOSIT 도 "돈이 잡힐 수 있는 상태" 로 본다 — 주문은 WAITING_DEPOSIT 으로 만들고, 입금(DONE)·만료(CANCELED/EXPIRED) 는
 *     myr_app_deposit_done / expire 로. 주문이 PAID 된 뒤의 토스 콘솔 취소(CANCELED/PARTIAL_CANCELED)는 줄 환불 RPC 가 들어올 때까지 운영 큐(handled=false).
 * 감사 로그는 셀러리와 같은 `payment_events` 표(공유 · toss_order_id 'myr_' 접두로 구분).
 */
import {
	CHECKOUT_LITE_COLS,
	failMessage,
	parseCheckoutLite,
	parseConfirmResult,
	parseDepositResult,
	type CheckoutLite,
	type ConfirmFnResult,
	type RejectedItem
} from '@sellery/myr-core/checkout-rules';
import { logPaymentEvent, markPaymentEvent, type Admin, type EventSource } from './payment-events';
import { notifyDepositDone, notifyOrderPaid } from './mail-events';
import { isTossError, tossCancel, tossCanceledTotal, type TossPayment, type TossResult } from './toss';

// 결제 감사 로그는 환불(인플루언서 · 운영 콘솔)도 쓰므로 공용 패키지에 있다 — 라우트가 여기서 가져가던 이름은 그대로 다시 내보낸다
export { logPaymentEvent, markPaymentEvent };
export type { Admin, EventSource } from './payment-events';

export const apiError = (status: number, code: string, message?: string | null, extra?: Record<string, unknown>): Response =>
	Response.json({ ok: false, code, message: failMessage(code, message), ...(extra ?? {}) }, { status });

/** 상태 변경 API 의 CSRF 가드 — Sec-Fetch-Site same-origin/none + JSON 본문만(multipart: true 면 파일 업로드 폼도 — 0068 환불 사진) */
export function rejectCrossSite(request: Request, opts: { multipart?: boolean } = {}): Response | null {
	const site = (request.headers.get('sec-fetch-site') ?? '').toLowerCase();
	if (site && site !== 'same-origin' && site !== 'none') return apiError(403, 'BAD_ORIGIN');
	const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
	if (contentType.startsWith('application/json')) return null;
	if (opts.multipart && contentType.startsWith('multipart/form-data')) return null;
	return apiError(403, 'BAD_ORIGIN');
}

export { CHECKOUT_LITE_COLS, parseCheckoutLite };
export type { CheckoutLite };

// ---- 세션 전이 (조건부 update) ----
export async function failCheckout(
	admin: Admin,
	checkoutId: string,
	fail: { code: string; message?: string | null; raw?: unknown },
	from: string[] = ['PENDING', 'CONFIRMING']
): Promise<boolean> {
	const patch: Record<string, unknown> = { status: 'FAILED', fail_code: fail.code, fail_message: failMessage(fail.code, fail.message) };
	if (fail.raw !== undefined) patch.raw_payment = fail.raw;
	const { data, error } = await admin.from('myr_checkouts').update(patch).eq('id', checkoutId).in('status', from).select('id');
	if (error) {
		console.error('[checkout-sync] failCheckout failed:', error.message);
		return false;
	}
	return ((data as unknown[] | null)?.length ?? 0) > 0;
}

export async function resolveCancelPending(admin: Admin, c: CheckoutLite, raw?: unknown): Promise<boolean> {
	const original = c.fail_message || 'CANCELED';
	const patch: Record<string, unknown> = { fail_code: original, fail_message: `${failMessage(original)} (결제 취소 완료)` };
	if (raw !== undefined) patch.raw_payment = raw;
	const { data, error } = await admin.from('myr_checkouts').update(patch).eq('id', c.id).eq('status', 'FAILED').eq('fail_code', 'CANCEL_PENDING').select('id');
	if (error) {
		console.error('[checkout-sync] resolveCancelPending failed:', error.message);
		return false;
	}
	return ((data as unknown[] | null)?.length ?? 0) > 0;
}

/** 자동 취소 사유 — code 만으로 결정(같은 Idempotency-Key 재시도는 같은 본문이어야 한다) */
export const cancelReasonFor = (code: string): string => `주문 미완료 자동 취소 (${code})`.slice(0, 200);

/** 돈이 잡힌 뒤 주문을 만들 수 없을 때: 토스 전액 취소 → FAILED(code). 취소 실패 → FAILED(CANCEL_PENDING, fail_message=code) + 운영 큐 */
export async function cancelAndFail(
	admin: Admin,
	c: CheckoutLite,
	paymentKey: string,
	code: string,
	opts: { source: EventSource; message?: string | null }
): Promise<{ canceled: boolean; cancel: TossResult }> {
	const cancel = await tossCancel(paymentKey, cancelReasonFor(code), { idempotencyKey: c.id });
	const already = !cancel.ok && isTossError(cancel.body) && cancel.body.code === 'ALREADY_CANCELED_PAYMENT';
	const from = ['PENDING', 'CONFIRMING', 'FAILED', 'EXPIRED'];
	if (cancel.ok || already) {
		await failCheckout(admin, c.id, { code, message: opts.message, raw: cancel.body }, from);
		await logPaymentEvent(admin, {
			source: opts.source,
			event_type: 'auto_cancel',
			toss_order_id: c.toss_order_id,
			payment_key: paymentKey,
			payload: { code, cancel: cancel.body },
			handled: true,
			result: 'refunded_orphan'
		});
		return { canceled: true, cancel };
	}
	await failCheckout(admin, c.id, { code: 'CANCEL_PENDING', message: code, raw: cancel.body }, from);
	await logPaymentEvent(admin, {
		source: opts.source,
		event_type: 'auto_cancel',
		toss_order_id: c.toss_order_id,
		payment_key: paymentKey,
		payload: { code, cancel: cancel.body, status: cancel.status },
		handled: false,
		result: 'error: cancel failed'
	});
	return { canceled: false, cancel };
}

export async function retryCancelPending(
	admin: Admin,
	c: CheckoutLite,
	paymentKey: string,
	source: EventSource
): Promise<{ canceled: boolean; originalCode: string }> {
	let s = c;
	if (s.fail_code !== 'CANCEL_PENDING' || !s.fail_message) {
		const { data } = await admin.from('myr_checkouts').select(CHECKOUT_LITE_COLS).eq('id', c.id).maybeSingle();
		const fresh = parseCheckoutLite(data);
		if (fresh) s = fresh;
	}
	const originalCode = (s.fail_code === 'CANCEL_PENDING' && s.fail_message) || 'CANCELED';
	const cancel = await tossCancel(paymentKey, cancelReasonFor(originalCode), { idempotencyKey: c.id });
	const already = !cancel.ok && isTossError(cancel.body) && cancel.body.code === 'ALREADY_CANCELED_PAYMENT';
	if (cancel.ok || already) {
		await resolveCancelPending(admin, s, cancel.body);
		return { canceled: true, originalCode };
	}
	await logPaymentEvent(admin, {
		source,
		event_type: 'auto_cancel_retry',
		toss_order_id: c.toss_order_id,
		payment_key: paymentKey,
		payload: { code: originalCode, cancel: cancel.body, status: cancel.status },
		handled: false,
		result: 'error: cancel failed'
	});
	return { canceled: false, originalCode };
}

// ---- 승인 확정 ----
const CANCEL_ON_CODES = new Set(['PAYMENT_MISMATCH', 'SOLD_OUT', 'NOT_AVAILABLE']);
/** 돈이 잡혔거나 잡힐 수 있는 토스 상태 */
export const moneyHeld = (st: string): boolean => st === 'DONE' || st === 'WAITING_FOR_DEPOSIT' || st === 'PARTIAL_CANCELED';

export type ConfirmOutcome =
	| { ok: true; already: boolean; recovered: boolean; orderId: string; orderCode: string; status: string }
	| { ok: false; code: string; message: string; items: RejectedItem[]; canceled: boolean; dbError: boolean };

async function callConfirmFn(admin: Admin, c: CheckoutLite, paymentKey: string, payment: TossPayment, recover: boolean): Promise<ConfirmFnResult> {
	const { data, error } = await admin.rpc('myr_app_confirm_checkout', {
		p_checkout_id: c.id,
		p_payment_key: paymentKey,
		p_payment: payment,
		p_recover: recover
	});
	if (error) throw new Error(error.message);
	return parseConfirmResult(data);
}

/** 토스 DONE/WAITING_FOR_DEPOSIT 을 확인한 뒤. 함수 ok:false 중 돈이 잡힌 코드(SOLD_OUT·NOT_AVAILABLE·PAYMENT_MISMATCH)는 전액 취소로 종결. */
export async function confirmDone(
	admin: Admin,
	c: CheckoutLite,
	paymentKey: string,
	payment: TossPayment,
	opts: { recover: boolean; source: EventSource }
): Promise<ConfirmOutcome> {
	let parsed: ConfirmFnResult;
	let recovered = false;
	const held = moneyHeld(payment.status);
	try {
		parsed = await callConfirmFn(admin, c, paymentKey, payment, opts.recover);
		if (!parsed.ok && !opts.recover && held && !CANCEL_ON_CODES.has(parsed.code) && !['BAD_RESULT', 'NOT_FOUND', 'CANCEL_PENDING'].includes(parsed.code)) {
			parsed = await callConfirmFn(admin, c, paymentKey, payment, true);
			recovered = parsed.ok && !parsed.already;
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		console.error('[checkout-sync] myr_app_confirm_checkout threw:', msg);
		await logPaymentEvent(admin, {
			source: opts.source,
			event_type: 'confirm',
			toss_order_id: c.toss_order_id,
			payment_key: paymentKey,
			payload: { payment, error: msg },
			handled: false,
			result: `error: db ${msg}`.slice(0, 200)
		});
		return { ok: false, code: 'CONFIRMING', message: failMessage('CONFIRMING'), items: [], canceled: false, dbError: true };
	}
	if (parsed.ok) {
		// 거래 메일 — 새 주문일 때만(already 는 이미 보냈다) · 절대 throw 하지 않는다 (mail-events.ts)
		if (!parsed.already) await notifyOrderPaid(parsed.order_id);
		return { ok: true, already: parsed.already, recovered, orderId: parsed.order_id, orderCode: parsed.order_code, status: parsed.status };
	}
	if (parsed.code === 'BAD_RESULT') return { ok: false, code: 'CONFIRMING', message: failMessage('CONFIRMING'), items: [], canceled: false, dbError: true };

	if (CANCEL_ON_CODES.has(parsed.code)) {
		const { canceled } = await cancelAndFail(admin, c, paymentKey, parsed.code, { source: opts.source, message: parsed.message });
		return {
			ok: false,
			code: canceled ? parsed.code : 'CANCEL_PENDING',
			message: failMessage(canceled ? parsed.code : 'CANCEL_PENDING', canceled ? parsed.message : null),
			items: parsed.items,
			canceled,
			dbError: false
		};
	}
	if (!held) return { ok: false, code: parsed.code, message: failMessage(parsed.code, parsed.message), items: parsed.items, canceled: false, dbError: false };
	if (parsed.code === 'CANCEL_PENDING') {
		const { canceled, originalCode } = await retryCancelPending(
			admin,
			{ ...c, fail_code: 'CANCEL_PENDING', fail_message: parsed.message ?? c.fail_message },
			paymentKey,
			opts.source
		);
		return {
			ok: false,
			code: canceled ? originalCode : 'CANCEL_PENDING',
			message: failMessage(canceled ? originalCode : 'CANCEL_PENDING'),
			items: [],
			canceled,
			dbError: false
		};
	}
	const { canceled } = await cancelAndFail(admin, c, paymentKey, parsed.code, { source: opts.source, message: parsed.message });
	return {
		ok: false,
		code: canceled ? parsed.code : 'CANCEL_PENDING',
		message: failMessage(canceled ? parsed.code : 'CANCEL_PENDING', canceled ? parsed.message : null),
		items: [],
		canceled,
		dbError: false
	};
}

// ---- 주문 측 (가상계좌 입금·만료 · 콘솔 취소) ----
export type OrderLite = { id: string; code: string; status: string; payment_key: string | null; checkout_id: string | null; refund_amount: number };
export const ORDER_LITE_COLS = 'id, code, status, payment_key, checkout_id, refund_amount';

export async function findOrderByCheckout(admin: Admin, checkoutId: string): Promise<OrderLite | null> {
	const { data, error } = await admin.from('myr_orders').select(ORDER_LITE_COLS).eq('checkout_id', checkoutId).maybeSingle();
	if (error) {
		console.error('[checkout-sync] order lookup failed:', error.message);
		return null;
	}
	return (data as OrderLite | null) ?? null;
}

export async function depositDone(admin: Admin, order: OrderLite, payment: TossPayment): Promise<{ result: string; handled: boolean }> {
	const { data, error } = await admin.rpc('myr_app_deposit_done', { p_order_id: order.id, p_payment: payment });
	if (error) return { result: `error: deposit_done ${error.message}`.slice(0, 200), handled: false };
	const r = parseDepositResult(data);
	if (!r.ok) return { result: `error: deposit_done ${r.code}`, handled: false };
	if (!r.already) await notifyDepositDone(order.id); // 입금 확인 → 고객 주문 확인 + 셀러 새 주문 (mail-events.ts)
	return { result: r.already ? 'noop' : 'deposit_done', handled: true };
}
export async function depositExpire(admin: Admin, order: OrderLite, payment: TossPayment | null): Promise<{ result: string; handled: boolean }> {
	const { data, error } = await admin.rpc('myr_app_deposit_expire', { p_order_id: order.id, p_payment: payment });
	if (error) return { result: `error: deposit_expire ${error.message}`.slice(0, 200), handled: false };
	const r = parseDepositResult(data);
	if (!r.ok) return { result: `error: deposit_expire ${r.code}`, handled: false };
	return { result: r.already ? 'noop' : 'deposit_expired', handled: true };
}

/** 재조회한 결제 원문을 주문에 반영 — 어떤 주문에 반영할지(결제됐고 끝나지 않은 주문)는 DB 가 정한다(0099 myr_app_order_refresh_payment · myr_order_status_open) */
async function refreshOrderPayment(admin: Admin, order: OrderLite, payment: TossPayment): Promise<void> {
	const { error } = await admin.rpc('myr_app_order_refresh_payment', { p_order_id: order.id, p_payment: payment });
	if (error) console.error('[checkout-sync] order refresh failed:', error.message);
}

/** 재조회한 토스 payment 로 세션/주문 동기화 — 웹훅·reconcile 공용. result 는 payment_events.result 어휘 · handled=false 는 운영 큐 */
export async function syncFromPayment(
	admin: Admin,
	ctx: { checkout: CheckoutLite | null; order: OrderLite | null },
	payment: TossPayment,
	source: EventSource
): Promise<{ result: string; handled: boolean }> {
	const { checkout } = ctx;
	const st = payment.status;
	const paymentKey = payment.paymentKey;

	if (checkout) {
		if (checkout.status === 'PENDING' || checkout.status === 'CONFIRMING') {
			if (st === 'DONE' || st === 'WAITING_FOR_DEPOSIT') {
				const r = await confirmDone(admin, checkout, paymentKey, payment, { recover: false, source });
				if (r.ok) return { result: r.already ? 'noop' : r.recovered ? 'confirmed_recovered' : 'confirmed', handled: true };
				if (r.dbError) return { result: `error: ${r.code}`, handled: false };
				return r.canceled ? { result: 'refunded_orphan', handled: true } : { result: 'error: cancel failed', handled: false };
			}
			if (st === 'PARTIAL_CANCELED') {
				const { canceled } = await cancelAndFail(admin, checkout, paymentKey, 'PARTIAL_CANCELED', { source });
				return canceled ? { result: 'refunded_orphan', handled: true } : { result: 'error: cancel failed', handled: false };
			}
			if (st === 'CANCELED' || st === 'EXPIRED' || st === 'ABORTED') {
				await failCheckout(admin, checkout.id, { code: st, raw: payment });
				return { result: `failed: ${st}`, handled: true };
			}
			return { result: 'noop', handled: true };
		}

		if (checkout.status === 'CONFIRMED') {
			const order = ctx.order ?? (await findOrderByCheckout(admin, checkout.id));
			if (!order) return { result: 'error: confirmed checkout without order', handled: false };
			return syncOrder(admin, order, payment);
		}

		// FAILED / EXPIRED
		const order = ctx.order ?? (await findOrderByCheckout(admin, checkout.id));
		if (checkout.fail_code === 'CANCEL_PENDING' && !order) {
			if (moneyHeld(st)) {
				const { canceled } = await retryCancelPending(admin, checkout, paymentKey, source);
				return canceled ? { result: 'cancel_confirmed', handled: true } : { result: 'error: cancel failed', handled: false };
			}
			if (st === 'READY' || st === 'IN_PROGRESS' || st === 'ABORTED' || st === 'EXPIRED') {
				await resolveCancelPending(admin, checkout, payment);
				return { result: 'cancel_confirmed', handled: true };
			}
		}
		if (st === 'DONE' || st === 'WAITING_FOR_DEPOSIT') {
			if (order) return syncOrder(admin, order, payment);
			const r = await confirmDone(admin, checkout, paymentKey, payment, { recover: true, source });
			if (r.ok) return { result: r.already ? 'noop' : 'confirmed_recovered', handled: true };
			if (r.dbError) return { result: `error: ${r.code}`, handled: false };
			return r.canceled ? { result: 'refunded_orphan', handled: true } : { result: 'error: cancel failed', handled: false };
		}
		if (st === 'CANCELED' && checkout.fail_code === 'CANCEL_PENDING') {
			await resolveCancelPending(admin, checkout, payment);
			return { result: 'cancel_confirmed', handled: true };
		}
		if (order) return syncOrder(admin, order, payment);
		return { result: 'noop', handled: true };
	}

	if (!ctx.order) return { result: 'ignored', handled: true };
	return syncOrder(admin, ctx.order, payment);
}

/** 주문이 있을 때의 토스 상태 반영 — 가상계좌 입금/만료는 여기서 종결, PAID 뒤 콘솔 취소는 운영 큐(줄 환불 RPC 전까지) */
async function syncOrder(admin: Admin, order: OrderLite, payment: TossPayment): Promise<{ result: string; handled: boolean }> {
	const st = payment.status;
	if (order.status === 'WAITING_DEPOSIT') {
		if (st === 'DONE') return depositDone(admin, order, payment);
		if (st === 'CANCELED' || st === 'EXPIRED') return depositExpire(admin, order, payment);
		return { result: 'noop', handled: true };
	}
	if (st === 'DONE') {
		await refreshOrderPayment(admin, order, payment);
		return { result: 'noop', handled: true };
	}
	if (st === 'CANCELED' || st === 'PARTIAL_CANCELED') {
		// 우리 환불(/api/payments/cancel · 0061 record)은 refund_amount 에 이미 적혀 있다 — 토스 cancels[] 합과 같으면 그 웹훅은 noop.
		// 토스 콘솔에서만 취소해 합이 더 크면(어느 줄인지 모른다) 운영 큐 — 사람이 줄을 지정해 record 한다(docs/myr.md §6.3).
		const tossTotal = tossCanceledTotal(payment);
		if (tossTotal <= (order.refund_amount ?? 0)) return { result: 'noop', handled: true };
		return { result: `needs_manual_adjust: toss ${tossTotal} > recorded ${order.refund_amount ?? 0}`, handled: false };
	}
	return { result: 'noop', handled: true };
}
