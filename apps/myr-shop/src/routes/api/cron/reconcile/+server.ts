import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { CHECKOUT_LITE_COLS, parseCheckoutLite, type CheckoutLite } from '$lib/checkout-rules';
import { admin, hasAdmin } from '$lib/server/admin';
import {
	depositDone,
	depositExpire,
	failCheckout,
	logPaymentEvent,
	ORDER_LITE_COLS,
	resolveCancelPending,
	syncFromPayment,
	type Admin,
	type OrderLite
} from '$lib/server/checkout-sync';
import { rejectCron } from '$lib/server/cron';
import { isTossError, isUncertain, tossGetPayment } from '$lib/server/toss';

/**
 * GET|POST /api/cron/reconcile — 고착·미종결 결제 정리 (apps/shop api/cron/reconcile 의 MYR 판 · 10분마다 · vercel.json crons · CRON_SECRET).
 *   1. myr_expire_checkouts() — PENDING(+ payment_key 없는 CONFIRMING) 만 EXPIRED (?expire=0 생략)
 *   2. myr_stale_checkouts(2m, 50) — payment_key 있는 CONFIRMING(고착) + FAILED(CANCEL_PENDING) → 재조회 → syncFromPayment(웹훅과 같은 분기표)
 *   3. myr_app_deposit_due(50) — 입금 기한 지난 WAITING_DEPOSIT 주문 → 재조회: DONE → deposit_done · CANCELED/EXPIRED → deposit_expire · 그 외 유지
 */
export const config: Config = { maxDuration: 60 };
const STALE_AGE = '2 minutes';
const BATCH = 50;
type Outcome = { id: string; ref: string; status: string; result: string };

async function reconcileCheckout(db: Admin, stale: CheckoutLite): Promise<string> {
	const { data: fresh, error } = await db.from('myr_checkouts').select(CHECKOUT_LITE_COLS).eq('id', stale.id).maybeSingle();
	if (error) return `skipped: reread failed ${error.message}`.slice(0, 200);
	const c = parseCheckoutLite(fresh);
	if (!c) return 'skipped: gone';
	if (!c.payment_key) return 'skipped: no payment_key';
	const isCancelPending = c.status === 'FAILED' && c.fail_code === 'CANCEL_PENDING';
	if (c.status !== 'CONFIRMING' && !isCancelPending) return `skipped: already ${c.status}`;
	const source = isCancelPending ? 'cancel' : 'confirm';
	const look = await tossGetPayment(c.payment_key);
	let result: string;
	if (look.ok && !isTossError(look.body)) {
		const st = look.body.status;
		if (c.status === 'CONFIRMING' && (st === 'READY' || st === 'IN_PROGRESS' || st === 'ABORTED' || st === 'EXPIRED')) {
			await failCheckout(db, c.id, { code: st === 'READY' || st === 'IN_PROGRESS' ? 'NOT_CONFIRMED' : st, raw: look.body });
			result = `failed: ${st}`;
		} else result = (await syncFromPayment(db, { checkout: c, order: null }, look.body, source)).result;
	} else if (isUncertain(look)) return 'skipped: lookup failed';
	else if (isCancelPending) {
		await resolveCancelPending(db, c, look.body);
		result = 'cancel_confirmed';
	} else {
		await failCheckout(db, c.id, { code: 'NOT_CONFIRMED', raw: look.body });
		result = 'failed: NOT_CONFIRMED';
	}
	await logPaymentEvent(db, {
		source,
		event_type: 'reconcile',
		toss_order_id: c.toss_order_id,
		payment_key: c.payment_key,
		payload: { checkout: { id: c.id, status: c.status, fail_code: c.fail_code }, lookup: look.body },
		handled: !result.startsWith('error'),
		result
	});
	return result;
}

async function reconcileDeposit(db: Admin, due: { id: string; code: string; payment_key: string | null }): Promise<string> {
	if (!due.payment_key) return 'skipped: no payment_key';
	const { data: o } = await db.from('myr_orders').select(ORDER_LITE_COLS).eq('id', due.id).maybeSingle();
	const order = (o as OrderLite | null) ?? null;
	if (!order || order.status !== 'WAITING_DEPOSIT') return `skipped: ${order?.status ?? 'gone'}`;
	const look = await tossGetPayment(due.payment_key);
	if (isUncertain(look)) return 'skipped: lookup failed';
	let result: string;
	if (look.ok && !isTossError(look.body)) {
		const st = look.body.status;
		result =
			st === 'DONE'
				? (await depositDone(db, order, look.body)).result
				: st === 'CANCELED' || st === 'EXPIRED'
					? (await depositExpire(db, order, look.body)).result
					: `noop: ${st}`;
	} else result = (await depositExpire(db, order, null)).result; // 4xx — 토스에 결제 기록 없음 → 만료 처리
	await logPaymentEvent(db, {
		source: 'deposit_callback',
		event_type: 'reconcile',
		payment_key: due.payment_key,
		payload: { order: { id: order.id, code: order.code }, lookup: look.body },
		handled: !result.startsWith('error'),
		result
	});
	return result;
}

async function run(request: Request, url: URL): Promise<Response> {
	const rejected = rejectCron(request);
	if (rejected) return rejected;
	if (!hasAdmin()) return json({ ok: false, code: 'NO_SERVICE_KEY' }, { status: 503 });
	const db = admin();
	let expired = 0;
	if (url.searchParams.get('expire') !== '0') {
		const { data, error } = await db.rpc('myr_expire_checkouts');
		if (error) console.error('[reconcile] myr_expire_checkouts failed:', error.message);
		else expired = typeof data === 'number' ? data : 0;
	}
	const { data: staleJson, error: staleError } = await db.rpc('myr_stale_checkouts', { p_age: STALE_AGE, p_limit: BATCH });
	if (staleError) return json({ ok: false, code: 'DB_ERROR', message: staleError.message, expired }, { status: 500 });
	const results: Outcome[] = [];
	for (const c of (Array.isArray(staleJson) ? staleJson : []).map(parseCheckoutLite).filter((x): x is CheckoutLite => x !== null)) {
		let result: string;
		try {
			result = await reconcileCheckout(db, c);
		} catch (e) {
			result = `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
		}
		results.push({ id: c.id, ref: c.toss_order_id, status: c.status, result });
	}
	const { data: dueJson, error: dueError } = await db.rpc('myr_app_deposit_due', { p_limit: BATCH });
	if (dueError) console.error('[reconcile] myr_app_deposit_due failed:', dueError.message);
	const deposits: Outcome[] = [];
	for (const d of (Array.isArray(dueJson) ? dueJson : []) as { id: string; code: string; payment_key: string | null }[]) {
		let result: string;
		try {
			result = await reconcileDeposit(db, d);
		} catch (e) {
			result = `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
		}
		deposits.push({ id: d.id, ref: d.code, status: 'WAITING_DEPOSIT', result });
	}
	return json({ ok: true, expired, checked: results.length, results, deposits });
}

export const GET: RequestHandler = ({ request, url }) => run(request, url);
export const POST: RequestHandler = ({ request, url }) => run(request, url);
