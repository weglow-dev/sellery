import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { CHECKOUT_LITE_COLS, parseCheckoutLite, TOSS_KEY_RE, type CheckoutLite } from '$lib/checkout-rules';
import { admin, hasAdmin } from '$lib/server/admin';
import { logPaymentEvent, markPaymentEvent, ORDER_LITE_COLS, syncFromPayment, type EventSource, type OrderLite } from '$lib/server/checkout-sync';
import { isTossError, isUncertain, tossGetPayment } from '$lib/server/toss';

/**
 * POST /api/payments/webhook — 토스 웹훅 (apps/shop api/payments/webhook 의 MYR 판). 서명이 없는 공개 엔드포인트 — **paymentKey 재조회가 유일한 인증**, 본문 상태값은 쓰지 않는다.
 *   1. 형식(≤64KB · JSON · eventType · orderId/paymentKey 형식) → 2. 매칭: orderId → myr_checkouts.toss_order_id · paymentKey → myr_checkouts.payment_key → myr_orders.payment_key
 *      (셀러리 주문(slry_/slrp_)은 여기서 모르는 주문 → 200 ignored · 셀러리 웹훅이 처리) → 3. payment_events(handled=false) → 4. GET 재조회 → 5. syncFromPayment → 6. 200.
 *   DEPOSIT_CALLBACK(가상계좌 입금·만료)은 source='deposit_callback' — syncFromPayment 가 WAITING_DEPOSIT 주문을 deposit_done/expire 로 종결한다.
 * 토스 개발자센터에 이 주소(https://<myr-shop 도메인>/api/payments/webhook)를 등록한다 — docs/deploy.md MYR 표.
 */
export const config: Config = { maxDuration: 30 };
const MAX_BODY_BYTES = 64 * 1024;
const bad = () => json({ ok: false, code: 'BAD_REQUEST', message: 'invalid webhook' }, { status: 400 });

export const POST: RequestHandler = async ({ request }) => {
	const declared = Number(request.headers.get('content-length') ?? '0');
	if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return bad();
	const text = await request.text().catch(() => null);
	if (text === null || new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return bad();
	let body: Record<string, unknown>;
	try {
		const p: unknown = JSON.parse(text);
		if (!p || typeof p !== 'object' || Array.isArray(p)) return bad();
		body = p as Record<string, unknown>;
	} catch {
		return bad();
	}
	if (typeof body.eventType !== 'string' || !body.eventType) return bad();
	const eventType = body.eventType;
	const data = body.data && typeof body.data === 'object' ? (body.data as Record<string, unknown>) : null;
	const orderIdRaw = data?.orderId ?? body.orderId;
	const keyRaw = data?.paymentKey ?? body.paymentKey;
	const orderId = typeof orderIdRaw === 'string' ? orderIdRaw : null;
	const bodyKey = typeof keyRaw === 'string' ? keyRaw : null;
	if (orderIdRaw != null && (orderId === null || !TOSS_KEY_RE.test(orderId))) return bad();
	if (keyRaw != null && (bodyKey === null || !TOSS_KEY_RE.test(bodyKey))) return bad();
	if (!orderId && !bodyKey) return bad();
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY' }, { status: 503 });
	const db = admin();

	let checkout: CheckoutLite | null = null;
	let order: OrderLite | null = null;
	if (orderId) {
		const { data: c } = await db.from('myr_checkouts').select(CHECKOUT_LITE_COLS).eq('toss_order_id', orderId).maybeSingle();
		checkout = parseCheckoutLite(c);
	}
	if (!checkout && bodyKey) {
		const { data: c } = await db.from('myr_checkouts').select(CHECKOUT_LITE_COLS).eq('payment_key', bodyKey).maybeSingle();
		checkout = parseCheckoutLite(c);
		if (!checkout) {
			const { data: o } = await db.from('myr_orders').select(ORDER_LITE_COLS).eq('payment_key', bodyKey).limit(1).maybeSingle();
			order = (o as OrderLite | null) ?? null;
		}
	}
	if (!checkout && !order) {
		console.warn('[webhook] ignored unknown order', { eventType, orderId, hasKey: !!bodyKey });
		return json({ ok: true, ignored: true });
	}

	const source: EventSource = eventType === 'DEPOSIT_CALLBACK' ? 'deposit_callback' : 'webhook';
	const eventId = await logPaymentEvent(db, {
		source,
		event_type: eventType,
		toss_order_id: checkout?.toss_order_id ?? orderId,
		payment_key: checkout?.payment_key ?? order?.payment_key ?? bodyKey,
		payload: body,
		handled: false
	});

	const storedKey = checkout?.payment_key ?? order?.payment_key ?? null;
	const lookupKey = storedKey ?? bodyKey;
	if (!lookupKey) {
		await markPaymentEvent(db, eventId, { handled: true, result: 'ignored: no payment_key' });
		return json({ ok: true, ignored: true });
	}
	const look = await tossGetPayment(lookupKey);
	if (!look.ok || isTossError(look.body)) {
		if (isUncertain(look)) {
			await markPaymentEvent(db, eventId, { handled: false, result: 'error: lookup failed' });
			return json({ ok: false, code: 'LOOKUP_FAILED' }, { status: 502 });
		}
		await markPaymentEvent(db, eventId, { handled: true, result: `ignored: lookup ${isTossError(look.body) ? look.body.code : look.status}` });
		return json({ ok: true, ignored: true });
	}
	const payment = look.body;
	if (checkout && payment.orderId !== checkout.toss_order_id) {
		await markPaymentEvent(db, eventId, { handled: !storedKey, result: storedKey ? 'error: orderId mismatch' : 'ignored: orderId mismatch' });
		return json({ ok: true, ignored: true });
	}
	const { result, handled } = await syncFromPayment(db, { checkout, order }, payment, source);
	await markPaymentEvent(db, eventId, { handled, result });
	return json({ ok: true, result });
};
