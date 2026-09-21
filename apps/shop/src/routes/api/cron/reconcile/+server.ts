import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import { createAdminClient, type Admin } from '$lib/server/db';
import {
	cronSecret,
	failSession,
	isTossError,
	isUncertain,
	logPaymentEvent,
	parseSessionLite,
	resolveCancelPending,
	SESSION_LITE_COLS,
	syncFromPayment,
	tossGetPayment,
	type SessionLite
} from '$lib/server/payments';

/**
 * GET|POST /api/cron/reconcile — CONFIRMING 고착·CANCEL_PENDING 종결 (app-plan §7.5 · web api/cron/reconcile/route.ts 1:1).
 *
 * 인증: `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron 규약) 또는 `x-cron-secret` 헤더. CRON_SECRET 미설정이면 503(실행 안 함).
 * 슬라이스 1 은 수동 호출(curl / 로컬 스크립트); 슬라이스 4 에서 Vercel Cron 에 올린다(§12). `CRON_SECRET` 은 `$lib/server/env` 가 `$env/dynamic/private` 에서 읽는다.
 *
 * 순서:
 *   1. expire_checkout_sessions() — PENDING(+ payment_key 없는 CONFIRMING) 만 EXPIRED (?expire=0 으로 생략)
 *   2. stale_checkout_sessions(age=2m, limit=50) — payment_key 있는 CONFIRMING(고착) + FAILED(CANCEL_PENDING)
 *   3. 각 세션 GET /v1/payments/{paymentKey} 재조회 → §7.5 표:
 *        CONFIRMING · DONE                      → app_confirm_checkout(recover) → ok CONFIRMED / ok:false 토스 전액 취소 → FAILED(code)
 *        CONFIRMING · NOT_FOUND(4xx)/READY/ABORTED/EXPIRED → FAILED(토스 status 또는 NOT_CONFIRMED)
 *        CONFIRMING · CANCELED                  → FAILED(CANCELED)
 *        CANCEL_PENDING · DONE / WAITING_FOR_DEPOSIT / PARTIAL_CANCELED
 *                                               → 토스 전액 취소 재시도(같은 Idempotency-Key: session.id · 같은 본문) → fail_code = 원래 code
 *        CANCEL_PENDING · CANCELED / NOT_FOUND  → 이미 취소됨 → fail_code = 원래 code
 *        CANCEL_PENDING · READY/IN_PROGRESS/ABORTED/EXPIRED → 잡힌 돈 없음 → fail_code = 원래 code (stale 목록 영구 잔류 방지)
 *      (CONFIRMING 의 미승인 분기만 여기서, 나머지는 checkout-sync syncFromPayment 가 웹훅과 공유)
 *   4. 결과는 payment_events(source='confirm' | 'cancel', event_type='reconcile', result=…) 에 남긴다.
 */
export const config: Config = { maxDuration: 60 };

const STALE_AGE = '2 minutes';
const BATCH = 50;

/** 상수 시간 비교 — 길이가 달라도 같은 시간에 끝난다 (node:crypto timingSafeEqual 대체 · @types/node 불필요) */
function safeEqual(a: string, b: string): boolean {
	const enc = new TextEncoder();
	const x = enc.encode(a);
	const y = enc.encode(b);
	let diff = x.length ^ y.length;
	const n = Math.max(x.length, y.length);
	for (let i = 0; i < n; i++) diff |= (x[i % x.length] ?? 0) ^ (y[i % y.length] ?? 0);
	return diff === 0 && x.length === y.length;
}

function authorized(request: Request): boolean | null {
	const secret = cronSecret();
	if (!secret) return null;
	const bearer = request.headers.get('authorization') ?? '';
	const given = bearer.startsWith('Bearer ') ? bearer.slice(7) : (request.headers.get('x-cron-secret') ?? '');
	return safeEqual(given, secret);
}

type Outcome = { id: string; toss_order_id: string; status: string; fail_code: string | null; result: string };

async function reconcileOne(admin: Admin, stale: SessionLite): Promise<string> {
	// checkout_session_brief() 에는 fail_message(=CANCEL_PENDING 의 원래 code)가 없고, 웹훅·고객 재시도가 그 사이 종결했을 수 있다
	// → 행을 다시 읽어 최신 상태로 판단한다.
	const { data: fresh, error } = await admin.from('checkout_sessions').select(SESSION_LITE_COLS).eq('id', stale.id).maybeSingle();
	if (error) return `skipped: reread failed ${error.message}`.slice(0, 200);
	const session = (fresh as SessionLite | null) ?? null;
	if (!session) return 'skipped: gone';
	if (!session.payment_key) return 'skipped: no payment_key';
	const isCancelPending = session.status === 'FAILED' && session.fail_code === 'CANCEL_PENDING';
	if (session.status !== 'CONFIRMING' && !isCancelPending) return `skipped: already ${session.status}`;
	const source = isCancelPending ? 'cancel' : 'confirm';

	const look = await tossGetPayment(session.payment_key);
	let result: string;

	if (look.ok && !isTossError(look.body)) {
		const st = look.body.status;
		if (session.status === 'CONFIRMING' && (st === 'READY' || st === 'IN_PROGRESS' || st === 'ABORTED' || st === 'EXPIRED')) {
			// 승인 기록 없음 — 카드 가승인은 토스가 자동 무효
			await failSession(admin, session.id, { code: st === 'READY' || st === 'IN_PROGRESS' ? 'NOT_CONFIRMED' : st, raw: look.body });
			result = `failed: ${st}`;
		} else {
			// CONFIRMING · DONE/CANCELED/PARTIAL_CANCELED/WAITING_FOR_DEPOSIT 와 CANCEL_PENDING 전부 → 웹훅과 같은 분기표
			result = (await syncFromPayment(admin, { session, order: null }, look.body, source)).result;
		}
	} else if (isUncertain(look)) {
		return 'skipped: lookup failed'; // 다음 실행에서 다시
	} else {
		// 4xx(NOT_FOUND 등) — 토스에 그런 결제가 없다
		if (isCancelPending) {
			await resolveCancelPending(admin, session, look.body);
			result = 'cancel_confirmed';
		} else {
			await failSession(admin, session.id, { code: 'NOT_CONFIRMED', raw: look.body });
			result = 'failed: NOT_CONFIRMED';
		}
	}

	await logPaymentEvent(admin, {
		source,
		event_type: 'reconcile',
		toss_order_id: session.toss_order_id,
		payment_key: session.payment_key,
		payload: { session: { id: session.id, status: session.status, fail_code: session.fail_code }, lookup: look.body },
		handled: !result.startsWith('error'),
		result
	});
	return result;
}

async function run(request: Request, url: URL): Promise<Response> {
	const auth = authorized(request);
	if (auth === null) {
		return json({ ok: false, code: 'NOT_CONFIGURED', message: 'CRON_SECRET is not set' }, { status: 503 });
	}
	if (!auth) return json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });

	const doExpire = url.searchParams.get('expire') !== '0';
	const admin = createAdminClient();

	let expired = 0;
	if (doExpire) {
		const { data, error } = await admin.rpc('expire_checkout_sessions');
		if (error) console.error('[reconcile] expire_checkout_sessions failed:', error.message);
		else expired = typeof data === 'number' ? data : 0;
	}

	const { data: staleJson, error: staleError } = await admin.rpc('stale_checkout_sessions', {
		p_age: STALE_AGE,
		p_limit: BATCH
	});
	if (staleError) {
		console.error('[reconcile] stale_checkout_sessions failed:', staleError.message);
		return json({ ok: false, code: 'DB_ERROR', message: staleError.message, expired }, { status: 500 });
	}

	const sessions = (Array.isArray(staleJson) ? staleJson : []).map(parseSessionLite).filter((s): s is SessionLite => s !== null);

	const results: Outcome[] = [];
	for (const s of sessions) {
		let result: string;
		try {
			result = await reconcileOne(admin, s);
		} catch (e) {
			result = `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
			console.error('[reconcile] session', s.id, result);
		}
		results.push({ id: s.id, toss_order_id: s.toss_order_id, status: s.status, fail_code: s.fail_code, result });
	}

	return json({ ok: true, expired, checked: results.length, results });
}

export const GET: RequestHandler = ({ request, url }) => run(request, url);
export const POST: RequestHandler = ({ request, url }) => run(request, url);
