import { json, type Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import {
	depositInfoOf,
	failMessage,
	GUEST_CHECKOUT_COOKIE,
	GUEST_TOKEN_COOKIE_MAX_AGE,
	guestTokenCookieName,
	parseClaimResult,
	TOSS_KEY_RE,
	type CheckoutLite,
	type DepositInfo
} from '$lib/checkout-rules';
import { admin, hasAdmin } from '$lib/server/admin';
import { clearCart } from '$lib/server/cart';
import { apiError, cancelAndFail, confirmDone, failCheckout, logPaymentEvent, moneyHeld, rejectCrossSite, type Admin } from '$lib/server/checkout-sync';
import { issueGuestToken } from '$lib/server/customers';
import { isTossError, isUncertain, tossConfirm, tossGetPayment, type TossError, type TossPayment, type TossResult } from '$lib/server/toss';

/**
 * POST /api/payments/confirm — 토스 승인 (apps/shop api/payments/confirm 의 MYR 판 · 0058).
 * 순서: 형식 → 같은 오리진 → 세션(회원 user_id · 비회원 쿠키 myr_gck) → 존재·소유(둘 다 404) → myr_app_claim_checkout 선점(멱등·재선점)
 *   → [재선점이면 GET 재조회 먼저] → amount === 세션 amount(AMOUNT_MISMATCH · 토스 미호출) → 토스 confirm → DONE 또는 WAITING_FOR_DEPOSIT(가상계좌)
 *   → myr_app_confirm_checkout(대조 + 잠금 재검사 + 주문/줄 insert) → 응답. 4xx = 미승인 확정 → FAILED · 0/5xx = 불명 → 재조회 1회 → 재시도.
 * 응답 { ok:true, orderCode, status:'PAID'|'WAITING_DEPOSIT', already?, card, deposit?, guest? } · 400 { ok:false, code, message, items? } · 409 CONFIRMING · 500 CONFIRMING|CANCEL_PENDING.
 * 성공 뒤: 회원이면 계정 장바구니 비우기(0057 myr_cart_clear) · 비회원이면 조회 토큰 쿠키 myr_guest_<주문번호>(90일) 발급 + myr_gck 삭제.
 */
export const config: Config = { maxDuration: 60 };

type Body = { paymentKey?: unknown; orderId?: unknown; amount?: unknown };
export type SuccessCard = {
	orderCode: string;
	orderName: string;
	itemsAmount: number;
	shippingFee: number;
	amount: number;
	buyerName: string;
	address: string;
	items: { name: string; option: string; qty: number; amount: number }[];
};

async function buildCard(db: Admin, orderId: string): Promise<SuccessCard | null> {
	try {
		const [{ data: o }, { data: items }] = await Promise.all([
			db.from('myr_orders').select('code, order_name, items_amount, shipping_fee, amount, buyer_name, shipping').eq('id', orderId).maybeSingle(),
			db.from('myr_order_items').select('product_name, option_name, qty, amount').eq('order_id', orderId).order('created_at')
		]);
		if (!o) return null;
		const ord = o as {
			code: string;
			order_name: string;
			items_amount: number;
			shipping_fee: number;
			amount: number;
			buyer_name: string;
			shipping: Record<string, unknown> | null;
		};
		const ship = ord.shipping ?? {};
		const address = [ship.address1, ship.address2].filter((v) => typeof v === 'string' && v).join(' ');
		return {
			orderCode: ord.code,
			orderName: ord.order_name,
			itemsAmount: ord.items_amount,
			shippingFee: ord.shipping_fee,
			amount: ord.amount,
			buyerName: ord.buyer_name,
			address,
			items: ((items as { product_name: string; option_name: string; qty: number; amount: number }[] | null) ?? []).map((i) => ({
				name: i.product_name,
				option: i.option_name,
				qty: i.qty,
				amount: i.amount
			}))
		};
	} catch (e) {
		console.error('[confirm] card failed:', e instanceof Error ? e.message : e);
		return null;
	}
}

async function finishGuest(cookies: Cookies, orderCode: string): Promise<boolean> {
	try {
		const token = await issueGuestToken(orderCode);
		if (!token) return false;
		cookies.set(guestTokenCookieName(orderCode), token, { httpOnly: true, sameSite: 'lax', secure: !dev, path: '/', maxAge: GUEST_TOKEN_COOKIE_MAX_AGE });
		cookies.delete(GUEST_CHECKOUT_COOKIE, { path: '/' });
		return true;
	} catch (e) {
		console.error('[confirm] guest token failed:', e instanceof Error ? e.message : e);
		return false;
	}
}

type Resolved = { kind: 'payment'; payment: TossPayment } | { kind: 'rejected'; err: TossError; raw: TossResult } | { kind: 'uncertain'; raw: TossResult };
async function resolveConfirm(paymentKey: string, res: TossResult): Promise<Resolved> {
	if (res.ok && !isTossError(res.body)) return { kind: 'payment', payment: res.body };
	if (isUncertain(res)) return { kind: 'uncertain', raw: res };
	const err: TossError = isTossError(res.body) ? res.body : { code: 'TOSS_ERROR', message: '결제 승인에 실패했습니다' };
	if (err.code === 'ALREADY_PROCESSED_PAYMENT') {
		const look = await tossGetPayment(paymentKey);
		if (look.ok && !isTossError(look.body)) return { kind: 'payment', payment: look.body };
		if (isUncertain(look)) return { kind: 'uncertain', raw: look };
		return { kind: 'rejected', err: isTossError(look.body) ? look.body : err, raw: look };
	}
	return { kind: 'rejected', err, raw: res };
}

async function rejectAndFail(db: Admin, c: CheckoutLite, paymentKey: string, err: TossError, raw: TossResult): Promise<Response> {
	await failCheckout(db, c.id, { code: err.code, message: err.message, raw: raw.body });
	await logPaymentEvent(db, {
		source: 'confirm',
		event_type: 'confirm',
		toss_order_id: c.toss_order_id,
		payment_key: paymentKey,
		payload: { status: raw.status, body: raw.body },
		handled: true,
		result: `failed: ${err.code}`
	});
	return apiError(400, err.code, err.message);
}

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const cross = rejectCrossSite(request);
	if (cross) return cross;
	const body = (await request.json().catch(() => null)) as Body | null;
	const paymentKey = typeof body?.paymentKey === 'string' ? body.paymentKey : '';
	const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
	if (!TOSS_KEY_RE.test(paymentKey) || !TOSS_KEY_RE.test(orderId)) return apiError(400, 'BAD_REQUEST', '결제 정보 형식이 올바르지 않습니다');
	if (!Number.isInteger(body?.amount) || (body!.amount as number) <= 0) return apiError(400, 'BAD_REQUEST', '결제 금액 형식이 올바르지 않습니다');
	const reqAmount = body!.amount as number;

	const { user } = await locals.safeGetSession();
	const gck = user ? null : (cookies.get(GUEST_CHECKOUT_COOKIE) ?? '');
	if (!user && !/^[0-9a-f-]{36}$/.test(gck ?? '')) return apiError(401, 'UNAUTHORIZED');
	const owns = (s: { id: string; user_id: string | null }) => (user ? s.user_id === user.id : s.user_id === null && s.id === gck);
	if (!hasAdmin()) return apiError(503, 'NO_SERVICE_KEY');
	const db = admin();

	const { data: pre, error: preError } = await db.from('myr_checkouts').select('id, user_id, status').eq('toss_order_id', orderId).maybeSingle();
	if (preError) return apiError(500, 'DB_ERROR');
	const preRow = pre as { id: string; user_id: string | null; status: string } | null;
	if (!preRow || !owns(preRow)) return apiError(404, 'NOT_FOUND');
	const wasConfirming = preRow.status === 'CONFIRMING';

	const { data: claimJson, error: claimError } = await db.rpc('myr_app_claim_checkout', { p_toss_order_id: orderId, p_payment_key: paymentKey });
	if (claimError) {
		console.error('[confirm] claim failed:', claimError.message);
		return apiError(500, 'DB_ERROR');
	}
	const claim = parseClaimResult(claimJson);
	if (!claim.ok) {
		if (claim.code === 'NOT_FOUND') return apiError(404, 'NOT_FOUND');
		if (claim.code === 'CONFIRMING') return apiError(409, 'CONFIRMING');
		if (claim.code === 'PAYMENT_KEY_CONFLICT') {
			await logPaymentEvent(db, {
				source: 'confirm',
				event_type: 'confirm',
				toss_order_id: orderId,
				payment_key: paymentKey,
				payload: { paymentKey, orderId, amount: reqAmount },
				handled: true,
				result: 'error: key conflict'
			});
			return apiError(400, 'PAYMENT_KEY_CONFLICT');
		}
		if (claim.code === 'BAD_RESULT') return apiError(500, 'DB_ERROR');
		return apiError(400, claim.code, claim.message);
	}
	const c = claim.checkout;
	if (!owns(c)) return apiError(404, 'NOT_FOUND');

	const respond = async (r: { orderId: string; orderCode: string; status: string; already: boolean }, payment: TossPayment | null) => {
		const card = await buildCard(db, r.orderId);
		let deposit: DepositInfo | null = payment ? depositInfoOf(payment) : null;
		if (!deposit && r.status === 'WAITING_DEPOSIT') {
			const { data: o } = await db.from('myr_orders').select('raw_payment').eq('id', r.orderId).maybeSingle();
			deposit = depositInfoOf((o as { raw_payment: unknown } | null)?.raw_payment);
		}
		if (user && !r.already) await clearCart(user.id).catch((e) => console.error('[confirm] cart clear failed:', e instanceof Error ? e.message : e));
		const guestOk = user ? false : await finishGuest(cookies, r.orderCode);
		return json({
			ok: true,
			orderCode: r.orderCode,
			status: r.status,
			already: r.already || undefined,
			card,
			deposit: r.status === 'WAITING_DEPOSIT' ? deposit : undefined,
			guest: guestOk || undefined
		});
	};

	// 멱등: 이미 CONFIRMED
	if (!claim.claimed) {
		if (c.payment_key && c.payment_key !== paymentKey) return apiError(400, 'PAYMENT_MISMATCH');
		const r = await confirmDone(db, c, c.payment_key ?? paymentKey, { paymentKey, orderId, status: 'DONE', totalAmount: c.amount } as TossPayment, {
			recover: false,
			source: 'confirm'
		});
		if (!r.ok) return apiError(r.dbError ? 500 : 400, r.code, r.message);
		return respond({ orderId: r.orderId, orderCode: r.orderCode, status: r.status, already: true }, null);
	}

	let payment: TossPayment | null = null;
	if (wasConfirming) {
		// 고착 CONFIRMING 재선점 — 앞 요청이 토스 승인까지 마쳤을 수 있으니 사전검사보다 먼저 재조회
		const look = await tossGetPayment(paymentKey);
		if (look.ok && !isTossError(look.body)) {
			const st = look.body.status;
			if (moneyHeld(st)) payment = look.body;
			else if (st === 'CANCELED' || st === 'EXPIRED') {
				await failCheckout(db, c.id, { code: st, raw: look.body });
				await logPaymentEvent(db, {
					source: 'confirm',
					event_type: 'confirm',
					toss_order_id: orderId,
					payment_key: paymentKey,
					payload: look.body,
					handled: true,
					result: `failed: ${st}`
				});
				return apiError(400, st);
			}
		} else if (isUncertain(look)) return apiError(500, 'CONFIRMING');
	}

	if (!payment) {
		if (reqAmount !== c.amount) {
			await failCheckout(db, c.id, { code: 'AMOUNT_MISMATCH', raw: { requested: reqAmount, expected: c.amount } });
			await logPaymentEvent(db, {
				source: 'confirm',
				event_type: 'confirm',
				toss_order_id: orderId,
				payment_key: paymentKey,
				payload: { requested: reqAmount, expected: c.amount },
				handled: true,
				result: 'failed: AMOUNT_MISMATCH'
			});
			return apiError(400, 'AMOUNT_MISMATCH');
		}
		const input = { paymentKey, orderId, amount: c.amount };
		let resolved = await resolveConfirm(paymentKey, await tossConfirm(input));
		if (resolved.kind === 'uncertain') {
			const first = resolved.raw;
			const look = await tossGetPayment(paymentKey);
			if (look.ok && !isTossError(look.body)) {
				const st = look.body.status;
				resolved =
					st === 'READY' || st === 'IN_PROGRESS' ? await resolveConfirm(paymentKey, await tossConfirm(input)) : { kind: 'payment', payment: look.body };
			} else if (!look.ok && !isUncertain(look)) resolved = await resolveConfirm(paymentKey, await tossConfirm(input));
			else resolved = { kind: 'uncertain', raw: look };
			if (resolved.kind === 'uncertain') {
				await logPaymentEvent(db, {
					source: 'confirm',
					event_type: 'confirm',
					toss_order_id: orderId,
					payment_key: paymentKey,
					payload: { first: first.body, last: resolved.raw.body, lastStatus: resolved.raw.status },
					handled: false,
					result: 'error: toss unreachable'
				});
				return apiError(500, 'CONFIRMING');
			}
		}
		if (resolved.kind === 'rejected') return rejectAndFail(db, c, paymentKey, resolved.err, resolved.raw);
		payment = resolved.payment;
	}

	if (payment.status === 'PARTIAL_CANCELED') {
		const { canceled } = await cancelAndFail(db, c, paymentKey, 'PARTIAL_CANCELED', { source: 'confirm' });
		return canceled ? apiError(400, 'PARTIAL_CANCELED') : apiError(500, 'CANCEL_PENDING');
	}
	if (payment.status !== 'DONE' && payment.status !== 'WAITING_FOR_DEPOSIT') {
		const code = payment.status || 'NOT_CONFIRMED';
		await failCheckout(db, c.id, { code, raw: payment });
		await logPaymentEvent(db, {
			source: 'confirm',
			event_type: 'confirm',
			toss_order_id: orderId,
			payment_key: paymentKey,
			payload: payment,
			handled: true,
			result: `failed: ${code}`
		});
		return apiError(400, code, failMessage(code, failMessage('NOT_CONFIRMED')));
	}

	const r = await confirmDone(db, c, paymentKey, payment, { recover: false, source: 'confirm' });
	if (!r.ok) return apiError(r.dbError || r.code === 'CANCEL_PENDING' ? 500 : 400, r.code, r.message, { items: r.items });
	await logPaymentEvent(db, {
		source: 'confirm',
		event_type: 'confirm',
		toss_order_id: orderId,
		payment_key: paymentKey,
		payload: payment,
		handled: true,
		result: r.already ? 'noop' : r.recovered ? 'confirmed_recovered' : r.status === 'WAITING_DEPOSIT' ? 'deposit_pending' : 'confirmed'
	});
	return respond({ orderId: r.orderId, orderCode: r.orderCode, status: r.status, already: r.already }, payment);
};
