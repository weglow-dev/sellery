import { json, type Cookies } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import type { Json } from '@sellery/db/database.types';
import { normalizeHandle } from '@sellery/db/campaign';
import { GUEST_CHECKOUT_COOKIE, GUEST_TOKEN_COOKIE_MAX_AGE, guestTokenCookieName } from '@sellery/db/guest-order';
import { createAdminClient, issueGuestToken, type Admin } from '$lib/server/db';
import {
	apiError,
	cancelAndFail,
	confirmDone,
	failMessage,
	failSession,
	gateIsLive,
	isTossError,
	isUncertain,
	logPaymentEvent,
	parseClaimResult,
	readCampaignGate,
	rejectCrossSite,
	softStockLeft,
	tossConfirm,
	tossGetPayment,
	TOSS_KEY_RE,
	type SessionLite,
	type TossError,
	type TossPayment,
	type TossResult
} from '$lib/server/payments';

/**
 * POST /api/payments/confirm — 토스 승인 (app-plan §6.2 · §7.1 · §7.2 · web api/payments/confirm/route.ts 1:1).
 *
 * 검증 순서(고정): 입력 형식 → 같은 오리진(403) → getUser()(401 — **비회원(0021)은 HttpOnly 쿠키 `slry_gck`(체크아웃이 발급한 세션 id) 가 대신**)
 *   → 세션 존재·소유자 일치(회원 user_id = user.id · 비회원 user_id null 이고 세션 id = 쿠키 — 둘 다 404 NOT_FOUND — orderId 존재 여부 미노출)
 *   → app_claim_checkout 선점(멱등 CONFIRMED / PENDING→CONFIRMING + payment_key / 20초 지난 CONFIRMING 재선점)
 *   → [재선점이면 GET 재조회 **먼저** — DONE 이면 사전검사 없이 곧바로 app_confirm_checkout: 앞 요청이 토스 승인까지 마쳤을 수 있다]
 *   → amount === session.amount(AMOUNT_MISMATCH, 토스 미호출) → 캠페인 LIVE·today·재고 사전 확인(잠금 없음, 토스 미승인이 확실할 때만)
 *   → 토스 confirm(본문 amount = session.amount) → status==='DONE'
 *   → app_confirm_checkout(함수 안에서 payment 대조 + 잠금 재검사 + orders insert) → 응답.
 *
 * 토스 결과 매핑(§7.2): 4xx = 미승인 확정 → FAILED(토스 code) · status 0/5xx = 불명 → CONFIRMING 유지 + GET 재조회
 *   (DONE → 계속 / 미승인 → confirm 1회 재시도 / 재조회도 실패 → 500 CONFIRMING). ALREADY_PROCESSED_PAYMENT 는 첫 호출·재시도 모두
 *   재조회로 흡수한다. glo 의 `!tossRes.ok → failed` 는 복사하지 않는다.
 * DONE 을 확인한 뒤 주문을 만들지 못한 모든 경우는 confirmDone 안에서 토스 취소로 종결된다(§0 결정 5-1).
 *
 * 응답: 성공 { ok:true, orderCode, already?, card, guest?:true } · 실패 400 { ok:false, code, message } · 진행 중 409 { code:'CONFIRMING' }
 *   비회원 성공 시 조회 토큰(app_guest_token_issue · 회전)을 HttpOnly 쿠키 `slry_guest_<주문번호>`(90일)로 심고 `slry_gck` 는 지운다 — 성공 페이지의 "주문 보기" 가 곧바로 열린다.
 *   · 불명 500 { code:'CONFIRMING' | 'CANCEL_PENDING' }.
 *
 * 시간 예산(maxDuration 60s): 재선점 최악 체인 = 재조회 8s + confirm 10s + 재조회 8s + confirm 재시도 10s + 취소 10s ≈ 46s + DB.
 */
export const config: Config = { maxDuration: 60 };

type Body = { paymentKey?: unknown; orderId?: unknown; amount?: unknown };

/** 성공 페이지가 렌더할 카드 (ux-spec §3.5 orderDoneModal). 조회 실패는 null — 주문은 이미 생성됐으므로 응답을 막지 않는다. */
type SuccessCard = {
	product: string;
	emoji: string | null;
	thumbUrl: string | null;
	option: string;
	qty: number;
	amount: number;
	seller: string;
	/** DB 값 그대로('@' 포함) — 표시용 */
	handle: string;
	brand: string;
	code: string;
	/** "/s/{handle without @}/{code}" */
	storeUrl: string;
	buyerName: string;
};

function one<T>(v: T | T[] | null | undefined): T | null {
	if (Array.isArray(v)) return v[0] ?? null;
	return v ?? null;
}

async function buildSuccessCard(admin: Admin, session: SessionLite): Promise<SuccessCard | null> {
	try {
		const [{ data: s }, { data: c }] = await Promise.all([
			admin.from('checkout_sessions').select('option_name, qty, amount, buyer_name').eq('id', session.id).maybeSingle(),
			admin.from('campaigns').select('code, products(name, emoji, thumb_url), sellers(name, handle), brands(name)').eq('id', session.campaign_id).maybeSingle()
		]);
		if (!s || !c) return null;
		const product = one(c.products as { name: string; emoji: string; thumb_url: string | null } | null);
		const seller = one(c.sellers as { name: string; handle: string } | null);
		const brand = one(c.brands as { name: string } | null);
		if (!product || !seller || !brand) return null;
		let storeUrl: string;
		try {
			storeUrl = `/s/${normalizeHandle(seller.handle)}/${c.code}`;
		} catch {
			storeUrl = `/s/${seller.handle.replace(/^@/, '').toLowerCase()}/${c.code}`;
		}
		return {
			product: product.name,
			emoji: product.emoji ?? null,
			thumbUrl: product.thumb_url ?? null,
			option: s.option_name,
			qty: s.qty,
			amount: s.amount ?? session.amount,
			seller: seller.name,
			handle: seller.handle,
			brand: brand.name,
			code: c.code,
			storeUrl,
			buyerName: s.buyer_name
		};
	} catch (e) {
		console.error('[confirm] success card failed:', e instanceof Error ? e.message : e);
		return null;
	}
}

/** 승인 확정 후 best-effort: customers.phone/address 가 비어 있으면 세션 값으로 채운다 (§7.1) */
async function fillCustomerFromSession(admin: Admin, session: SessionLite): Promise<void> {
	try {
		const { data: s } = await admin.from('checkout_sessions').select('customer_id, buyer_phone, shipping').eq('id', session.id).maybeSingle();
		if (!s?.customer_id) return;
		const { data: cu } = await admin.from('customers').select('phone, address').eq('id', s.customer_id).maybeSingle();
		if (!cu) return;
		const patch: { phone?: string; address?: Json } = {};
		if (!cu.phone && s.buyer_phone) patch.phone = s.buyer_phone;
		if (!cu.address && s.shipping) patch.address = s.shipping;
		if (Object.keys(patch).length === 0) return;
		await admin.from('customers').update(patch).eq('id', s.customer_id);
	} catch (e) {
		console.error('[confirm] customers fill failed:', e instanceof Error ? e.message : e);
	}
}

/** 토스 confirm(첫 호출·재시도 공용) 결과 판정 — ALREADY_PROCESSED_PAYMENT 는 GET 재조회로 흡수해 status 로 판정한다 (§7.2) */
type ConfirmResolved =
	| { kind: 'payment'; payment: TossPayment }
	/** 4xx — 토스가 거절(미승인 확정). raw 는 payment_events 원문 */
	| { kind: 'rejected'; err: TossError; raw: TossResult }
	/** status 0/5xx — 처리 여부 불명 */
	| { kind: 'uncertain'; raw: TossResult };

async function resolveConfirm(paymentKey: string, res: TossResult): Promise<ConfirmResolved> {
	if (res.ok && !isTossError(res.body)) return { kind: 'payment', payment: res.body };
	if (isUncertain(res)) return { kind: 'uncertain', raw: res };
	const err: TossError = isTossError(res.body) ? res.body : { code: 'TOSS_ERROR', message: '결제 승인에 실패했습니다' };
	if (err.code === 'ALREADY_PROCESSED_PAYMENT') {
		// 첫 호출이 실제로는 처리된 경합 — 재조회 status 로 판정 (DONE 이면 정상 경로 계속)
		const look = await tossGetPayment(paymentKey);
		if (look.ok && !isTossError(look.body)) return { kind: 'payment', payment: look.body };
		if (isUncertain(look)) return { kind: 'uncertain', raw: look };
		return { kind: 'rejected', err: isTossError(look.body) ? look.body : err, raw: look };
	}
	return { kind: 'rejected', err, raw: res };
}

/** 토스 4xx(미승인 확정) → FAILED(토스 code) + raw_payment + payment_events → 400 (토스 message 원문 노출 — §6.3) */
async function rejectAndFail(admin: Admin, session: SessionLite, paymentKey: string, err: TossError, raw: TossResult): Promise<Response> {
	await failSession(admin, session.id, { code: err.code, message: err.message, raw: raw.body });
	await logPaymentEvent(admin, {
		source: 'confirm',
		event_type: 'confirm',
		toss_order_id: session.toss_order_id,
		payment_key: paymentKey,
		payload: { status: raw.status, body: raw.body },
		handled: true,
		result: `failed: ${err.code}`
	});
	return apiError(400, err.code, err.message);
}

/** 비회원 세션 확정 뒤: 조회 토큰 발급 → 쿠키. 실패해도 응답을 막지 않는다(주문 조회 화면에서 다시 발급 가능). */
async function finishGuest(cookies: Cookies, orderCode: string): Promise<boolean> {
	try {
		const token = await issueGuestToken(orderCode);
		if (!token) return false;
		cookies.set(guestTokenCookieName(orderCode), token, { httpOnly: true, sameSite: 'lax', secure: !dev, path: '/', maxAge: GUEST_TOKEN_COOKIE_MAX_AGE });
		cookies.delete(GUEST_CHECKOUT_COOKIE, { path: '/' });
		return true;
	} catch (e) {
		console.error('[confirm] guest token issue failed:', e instanceof Error ? e.message : e);
		return false;
	}
}

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	// 0-a) 같은 오리진·JSON 본문만 (CSRF — Supabase 쿠키 SameSite 에만 기대지 않는다)
	const cross = rejectCrossSite(request);
	if (cross) return cross;

	// 0-b) 입력 형식 (§6.2): paymentKey/orderId 는 ^[A-Za-z0-9_-]{6,200}$, amount 는 양의 정수
	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return apiError(400, 'BAD_REQUEST', '요청 본문이 올바르지 않습니다');
	}
	const paymentKey = typeof body.paymentKey === 'string' ? body.paymentKey : '';
	const orderId = typeof body.orderId === 'string' ? body.orderId : '';
	const amount = body.amount;
	if (!TOSS_KEY_RE.test(paymentKey) || !TOSS_KEY_RE.test(orderId)) {
		return apiError(400, 'BAD_REQUEST', '결제 정보 형식이 올바르지 않습니다');
	}
	if (!Number.isInteger(amount) || (amount as number) <= 0) {
		return apiError(400, 'BAD_REQUEST', '결제 금액 형식이 올바르지 않습니다');
	}
	const reqAmount = amount as number;

	// 1) 로그인 (401) — 비회원은 체크아웃이 발급한 세션 쿠키 slry_gck (0021)
	const { user } = await locals.safeGetSession();
	const gck = user ? null : (cookies.get(GUEST_CHECKOUT_COOKIE) ?? '');
	if (!user && !/^[0-9a-f-]{36}$/.test(gck ?? '')) return apiError(401, 'UNAUTHORIZED');
	const owns = (s: { id: string; user_id: string | null }) => (user ? s.user_id === user.id : s.user_id === null && s.id === gck);

	const admin = createAdminClient();

	// 2) 세션 존재 + 소유자 일치 — 없는 세션과 타인 세션을 같은 404 로 (toss_order_id 존재 여부를 오라클처럼 확인하지 못하게).
	//    선점 전에 읽어 타인 세션의 상태를 노출하지 않는다. pre.status 는 재선점 판정(§7.2 CONFIRMING 고착)에도 쓴다.
	const { data: pre, error: preError } = await admin.from('checkout_sessions').select('id, user_id, status').eq('toss_order_id', orderId).maybeSingle();
	if (preError) {
		console.error('[confirm] session pre-read failed:', preError.message);
		return apiError(500, 'DB_ERROR', '잠시 후 다시 시도해주세요');
	}
	if (!pre || !owns(pre)) return apiError(404, 'NOT_FOUND');
	const wasConfirming = pre.status === 'CONFIRMING';

	// 3) 선점 — app_claim_checkout 반환 매핑:
	//    { ok:true, claimed:false }        CONFIRMED → 멱등(기존 주문 반환)
	//    { ok:true, claimed:true }         PENDING→CONFIRMING(+payment_key) 또는 고착 CONFIRMING 재선점
	//    { ok:false, NOT_FOUND }           404 · { ok:false, CONFIRMING } 409(신선한 진행 중)
	//    { ok:false, EXPIRED|<fail_code> } 400(원래 실패 사유 보존) · { ok:false, PAYMENT_KEY_CONFLICT } 400 + payment_events
	const { data: claimJson, error: claimError } = await admin.rpc('app_claim_checkout', {
		p_toss_order_id: orderId,
		p_payment_key: paymentKey
	});
	if (claimError) {
		console.error('[confirm] app_claim_checkout failed:', claimError.message);
		return apiError(500, 'DB_ERROR', '잠시 후 다시 시도해주세요');
	}
	const claim = parseClaimResult(claimJson);
	if (!claim.ok) {
		if (claim.code === 'NOT_FOUND') return apiError(404, 'NOT_FOUND');
		if (claim.code === 'CONFIRMING') return apiError(409, 'CONFIRMING');
		if (claim.code === 'PAYMENT_KEY_CONFLICT') {
			await logPaymentEvent(admin, {
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
		if (claim.code === 'BAD_RESULT') return apiError(500, 'DB_ERROR', '잠시 후 다시 시도해주세요');
		// EXPIRED / FAILED(fail_code) — 종결 세션, 토스 미호출
		return apiError(400, claim.code, claim.message);
	}

	const session = claim.session;
	if (!owns(session)) return apiError(404, 'NOT_FOUND'); // 방어적 재확인 (2 와 같은 응답)

	// 4) 멱등: 이미 CONFIRMED → app_confirm_checkout 이 { ok:true, already:true, order_code } 를 돌려준다 (payment 는 보지 않음)
	if (!claim.claimed) {
		if (session.payment_key && session.payment_key !== paymentKey) return apiError(400, 'PAYMENT_MISMATCH');
		const r = await confirmDone(admin, session, session.payment_key ?? paymentKey, {} as TossPayment, {
			recover: false,
			source: 'confirm'
		});
		if (!r.ok) return apiError(r.dbError ? 500 : 400, r.code, r.message);
		const card = await buildSuccessCard(admin, session);
		const guestOk = user ? false : await finishGuest(cookies, r.orderCode);
		return json({ ok: true, orderCode: r.orderCode, already: true, card, guest: guestOk || undefined });
	}

	let payment: TossPayment | null = null;

	// 5) 고착 CONFIRMING 재선점(§7.2): 앞 요청이 토스 승인까지 마치고 죽었을 수 있다 → **사전검사보다 먼저** 재조회.
	//    DONE(·WAITING_FOR_DEPOSIT·PARTIAL_CANCELED = 돈이 잡혔거나 잡힐 수 있음) 이면 금액·LIVE·재고 사전검사를 건너뛰고 곧바로 8)·9) 로
	//    — 잠금 재검사는 app_confirm_checkout 이, 실패 시 취소는 confirmDone 이 맡는다. 사전검사에서 FAILED 로 종결하는 것은
	//    토스 미승인이 확실한 경우뿐이다(잡힌 돈을 취소 없이 FAILED(NOT_LIVE|SOLD_OUT) 로 묻어 두지 않는다).
	if (wasConfirming) {
		const look = await tossGetPayment(paymentKey);
		if (look.ok && !isTossError(look.body)) {
			const st = look.body.status;
			if (st === 'DONE' || st === 'WAITING_FOR_DEPOSIT' || st === 'PARTIAL_CANCELED') {
				payment = look.body; // → 8
			} else if (st === 'CANCELED' || st === 'EXPIRED') {
				await failSession(admin, session.id, { code: st, raw: look.body });
				await logPaymentEvent(admin, {
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
			// READY / IN_PROGRESS / ABORTED → 승인 기록 없음 → 아래 정상 경로(사전검사 + confirm)
		} else if (isUncertain(look)) {
			// 재조회도 불명 → CONFIRMING 유지, 고객 재시도·웹훅·reconcile 이 종결
			return apiError(500, 'CONFIRMING');
		}
		// 4xx(NOT_FOUND 등) → 승인 기록 없음 → 정상 경로
	}

	if (!payment) {
		// 6) 금액 일치 — 불일치면 FAILED(AMOUNT_MISMATCH), 토스 미호출
		if (reqAmount !== session.amount) {
			await failSession(admin, session.id, { code: 'AMOUNT_MISMATCH', raw: { requested: reqAmount, expected: session.amount } });
			await logPaymentEvent(admin, {
				source: 'confirm',
				event_type: 'confirm',
				toss_order_id: orderId,
				payment_key: paymentKey,
				payload: { requested: reqAmount, expected: session.amount },
				handled: true,
				result: 'failed: AMOUNT_MISMATCH'
			});
			return apiError(400, 'AMOUNT_MISMATCH');
		}

		// 7) 캠페인 LIVE·today·재고 사전 확인 (잠금 없음 — 토스 승인 전에 걸러 자동 취소를 줄인다). 자신의 예약분은 되돌린다.
		const gate = await readCampaignGate(admin, session.campaign_id);
		if (!gate || !gateIsLive(gate)) {
			await failSession(admin, session.id, { code: 'NOT_LIVE' });
			return apiError(400, 'NOT_LIVE');
		}
		const left = await softStockLeft(admin, session.campaign_id, gate, session.qty);
		if (left < session.qty) {
			const message = `남은 수량이 부족합니다 (잔여 ${Math.max(0, left)}개)`;
			await failSession(admin, session.id, { code: 'SOLD_OUT', message });
			return apiError(400, 'SOLD_OUT', message);
		}

		// 8-a) 토스 confirm — 4xx = 거절(미승인 확정) · ALREADY_PROCESSED_PAYMENT 는 재조회로 흡수 (resolveConfirm)
		const input = { paymentKey, orderId, amount: session.amount };
		let resolved = await resolveConfirm(paymentKey, await tossConfirm(input));

		// 8-b) status 0 / 5xx = 처리 여부 불명 → 세션 CONFIRMING 유지, GET 재조회(짧은 타임아웃) 1회
		if (resolved.kind === 'uncertain') {
			const first = resolved.raw;
			const look = await tossGetPayment(paymentKey);
			if (look.ok && !isTossError(look.body)) {
				const st = look.body.status;
				if (st === 'READY' || st === 'IN_PROGRESS') {
					// 토스가 승인 요청을 받지 못했다 → confirm 1회 재시도 (재시도의 ALREADY_PROCESSED_PAYMENT 도 재조회로 판정)
					resolved = await resolveConfirm(paymentKey, await tossConfirm(input));
				} else {
					// DONE / WAITING_FOR_DEPOSIT / CANCELED / PARTIAL_CANCELED / EXPIRED / ABORTED → 재조회 결과로 판정
					resolved = { kind: 'payment', payment: look.body };
				}
			} else if (!look.ok && !isUncertain(look)) {
				// 재조회 4xx(NOT_FOUND) — 토스에 승인 기록 없음 → confirm 1회 재시도
				resolved = await resolveConfirm(paymentKey, await tossConfirm(input));
			} else {
				resolved = { kind: 'uncertain', raw: look };
			}
			if (resolved.kind === 'uncertain') {
				// 재조회·재시도까지 불명 — FAILED 로 바꾸지 않는다 (§7.2). 고객 재시도(재선점)·웹훅·reconcile 이 종결
				await logPaymentEvent(admin, {
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

		if (resolved.kind === 'rejected') return rejectAndFail(admin, session, paymentKey, resolved.err, resolved.raw);
		payment = resolved.payment;
	}

	// 9) 상태 판정 — DONE 만 인정 (§0 결정 6)
	if (payment.status === 'WAITING_FOR_DEPOSIT' || payment.status === 'PARTIAL_CANCELED') {
		// 가상계좌 — 입금 전 즉시 취소 → FAILED(VIRTUAL_ACCOUNT_NOT_SUPPORTED)
		// 콘솔 부분취소 뒤 남은 잔액이 주문 없이 잡혀 있음 → 잔액 전부 취소 → FAILED(PARTIAL_CANCELED)
		const code = payment.status === 'WAITING_FOR_DEPOSIT' ? 'VIRTUAL_ACCOUNT_NOT_SUPPORTED' : 'PARTIAL_CANCELED';
		const { canceled } = await cancelAndFail(admin, session, paymentKey, code, { source: 'confirm' });
		return canceled ? apiError(400, code) : apiError(500, 'CANCEL_PENDING');
	}
	if (payment.status !== 'DONE') {
		// CANCELED / EXPIRED / ABORTED / READY … → 승인되지 않음
		const code = payment.status || 'NOT_CONFIRMED';
		await failSession(admin, session.id, { code, raw: payment });
		await logPaymentEvent(admin, {
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

	// 10) DB 확정 — app_confirm_checkout (함수 안에서 orderId·totalAmount·paymentKey 대조 + 잠금 재검사 + orders insert).
	//     ok:false 는 confirmDone 안에서 종결된다: PAYMENT_MISMATCH/NOT_LIVE/SOLD_OUT/VIRTUAL_ACCOUNT_NOT_SUPPORTED → 토스 전액 취소 → FAILED(code)
	//     · 그 사이 다른 경로로 종결된 세션 → recover=true 1회 재시도 → 그래도 안 되면 취소. DONE 인데 주문 없는 세션은 남지 않는다.
	const r = await confirmDone(admin, session, paymentKey, payment, { recover: false, source: 'confirm' });
	if (!r.ok) {
		// dbError(함수 예외) → 500 CONFIRMING (세션 CONFIRMING 유지 — 웹훅·reconcile 이 복구)
		// 취소 실패 → 500 CANCEL_PENDING · 그 외(취소 완료) → 400 code
		const status = r.dbError || r.code === 'CANCEL_PENDING' ? 500 : 400;
		return apiError(status, r.code, r.message);
	}

	// 11) 부수효과(best-effort, 응답을 막지 않는다) + 감사 로그
	void fillCustomerFromSession(admin, session);
	await logPaymentEvent(admin, {
		source: 'confirm',
		event_type: 'confirm',
		toss_order_id: orderId,
		payment_key: paymentKey,
		payload: payment,
		handled: true,
		result: r.already ? 'noop' : r.recovered ? 'confirmed_recovered' : 'confirmed'
	});

	const card = await buildSuccessCard(admin, session);
	const guestOk = user ? false : await finishGuest(cookies, r.orderCode);
	return json({ ok: true, orderCode: r.orderCode, already: r.already || undefined, card, guest: guestOk || undefined });
};
