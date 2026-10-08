import { json } from '@sveltejs/kit';
import type { Config } from '@sveltejs/adapter-vercel';
import type { RequestHandler } from './$types';
import type { Json } from '@sellery/db/database.types';
import { guestTokenCookieName } from '@sellery/db/guest-order';
import { cleanText } from '@sellery/db/text';
import { createAdminClient, verifyGuestOrder } from '$lib/server/db';
import {
	afterRefundRecorded,
	apiError,
	isTossError,
	isUncertain,
	logPaymentEvent,
	parsePrecheckResult,
	parseRefundRecordResult,
	recordRefundFromToss,
	rejectCrossSite,
	tossCancel,
	tossCanceledTotal,
	tossGetPayment,
	type TossPayment
} from '$lib/server/payments';

/**
 * POST /api/payments/cancel — 고객 셀프 환불 (app-plan §6.2 · §7.4 · web api/payments/cancel/route.ts 1:1).
 *
 * 입력 { code(주문번호 o2001), reason? } — reason 은 선택지(단순 변심/상품 하자/오배송/기타)+자유 텍스트, cleanText 후 200자.
 * 순서(고정): ① 401(비회원(0021)은 HttpOnly 쿠키 `slry_guest_<code>` 의 조회 토큰을 app_guest_order_verify 로 검증 — 없거나 불일치면 401)
 *   → ② user 클라이언트(RLS orders_select_own)로 본인 주문 조회(비회원은 검증된 order id 로 service 조회), 없으면 404
 *   → ③ app_refund_precheck(order.id, 'customer')(가드만: PAID·비샘플·비SETTLED·미발송)
 *   → ④ 토스 POST /v1/payments/{paymentKey}/cancel (Idempotency-Key: order.id) — 실패면 DB 는 PAID 그대로 + 500
 *   → ⑤ app_refund_record(order.id, 'customer', reason, cancels 합, payment) — 가드 없이 기록(토스가 확정한 취소는 DB 가 거부하지 않는다)
 *   → ⑥ payment_events(source='cancel').
 * 응답 { ok:true, orderCode, amount, afterShip?:true, already?:true }.
 *
 * app_refund_precheck 반환 매핑: SETTLED → 400 "정산이 끝난 주문은 …" · SHIPPED → 400 "발송된 주문은 고객센터로 …"
 *   · SAMPLE → 400 · REFUNDED/CANCELED → 200 already:true · NOT_FOUND → 404 · BAD_ACTOR/BAD_RESULT → 500.
 * app_refund_record 반환 매핑: already → 200 already:true · after_ship → afterShip:true(REFUNDED + '회수 필요' 시스템 행)
 *   · adjust → 200(주문 CANCELED 조정 큐, payment_events handled=false) · ok:false → 500(돈은 이미 돌아감 — 운영 큐).
 * 토스 ALREADY_CANCELED_PAYMENT + 재조회 PARTIAL_CANCELED(콘솔 부분취소) → 409 PARTIAL_CANCELED(재시도 유도 안 함) + 운영 큐
 *   + app_refund_record(partial=true) 로 refund_amount 동기화(주문 PAID 유지 — §7.3).
 * 다른 오리진·비JSON 본문 → 403 BAD_ORIGIN.
 */
export const config: Config = { maxDuration: 30 };

const ORDER_CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;

type Body = { code?: unknown; reason?: unknown };

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	// ⓪ 같은 오리진·JSON 본문만 (CSRF — Supabase 쿠키 SameSite 에만 기대지 않는다)
	const cross = rejectCrossSite(request);
	if (cross) return cross;

	let body: Body;
	try {
		body = (await request.json()) as Body;
	} catch {
		return apiError(400, 'BAD_REQUEST', '요청 본문이 올바르지 않습니다');
	}
	const codeRaw = typeof body.code === 'string' ? body.code.trim() : '';
	if (!ORDER_CODE_RE.test(codeRaw)) return apiError(400, 'BAD_REQUEST', '주문번호가 올바르지 않습니다');
	const reason = (typeof body.reason === 'string' ? cleanText(body.reason).slice(0, 200) : '') || '고객 요청';

	const admin = createAdminClient();

	// ① 소유 확인 — 회원 본인 주문(RLS) 또는 비회원 조회 토큰 쿠키 (0021)
	//
	//   로그인 상태에서도 **토큰 폴백을 시도한다.** 비회원으로 사고 나중에 가입·로그인한 고객의 주문은
	//   `orders.user_id` 가 null 이라 RLS `orders_select_own`(`auth.uid() = user_id`)에 걸려 0행이 되고,
	//   예전에는 그대로 404 였다 — 그런데 `/orders/g/[code]` 는 쿠키만 보고 화면과 [환불 신청] 버튼을
	//   정상 렌더하므로(그 라우트는 세션을 보지 않는다) 고객에게는 "버튼이 있는데 누르면 주문을 찾을 수
	//   없다" 로 보였다. "비회원으로 사고 나중에 가입" 은 흔한 경로라 그 고객 전원이 셀프 환불에서 막혔다.
	//
	//   폴백 순서가 중요하다: 회원 조회를 **먼저** 해서 본인 주문이면 그걸 쓰고(RLS 가 소유를 보장),
	//   0행일 때만 토큰을 본다. 토큰은 서버가 심은 HttpOnly 쿠키라 그 자체가 소유 증명이다(0021).
	const { user } = await locals.safeGetSession();
	type OrderLite = { id: string; code: string; status: string; campaign_id: string; tracking_no: string | null };
	let order: OrderLite | null = null;
	if (user && locals.supabase) {
		// ② 본인 주문 (RLS orders_select_own — 타인 주문은 보이지 않는다). 화면은 대문자로 보여 주므로 소문자도 같이 찾는다.
		const codes = Array.from(new Set([codeRaw, codeRaw.toLowerCase()]));
		const { data, error: orderError } = await locals.supabase
			.from('orders')
			.select('id, code, status, campaign_id, tracking_no')
			.in('code', codes)
			.limit(1)
			.maybeSingle();
		if (orderError) {
			console.error('[cancel] order lookup failed:', orderError.message);
			return apiError(500, 'DB_ERROR', '잠시 후 다시 시도해주세요');
		}
		order = data;
	}
	// ②-b 회원 조회가 0행이거나 비로그인 — 비회원 조회 토큰으로 확인한다
	if (!order) {
		let orderId: string | null = null;
		try {
			orderId = await verifyGuestOrder(codeRaw.toLowerCase(), cookies.get(guestTokenCookieName(codeRaw)), admin);
		} catch (e) {
			console.error('[cancel] guest verify failed:', e instanceof Error ? e.message : e);
			return apiError(500, 'DB_ERROR', '잠시 후 다시 시도해주세요');
		}
		// 비로그인인데 토큰도 없으면 인증이 아예 없다 — 401. 로그인 상태라면 소유가 아닌 것이므로 아래 404.
		if (!orderId && !user) return apiError(401, 'UNAUTHORIZED');
		if (orderId) {
			const { data, error: orderError } = await admin.from('orders').select('id, code, status, campaign_id, tracking_no').eq('id', orderId).maybeSingle();
			if (orderError) {
				console.error('[cancel] guest order read failed:', orderError.message);
				return apiError(500, 'DB_ERROR', '잠시 후 다시 시도해주세요');
			}
			order = data;
		}
	}
	if (!order) return apiError(404, 'NOT_FOUND', '주문을 찾을 수 없습니다');

	// ③ 가드 (토스 호출 전에만)
	const { data: preJson, error: preError } = await admin.rpc('app_refund_precheck', {
		p_order_id: order.id,
		p_actor: 'customer'
	});
	if (preError) {
		console.error('[cancel] app_refund_precheck failed:', preError.message);
		return apiError(500, 'DB_ERROR', '잠시 후 다시 시도해주세요');
	}
	const pre = parsePrecheckResult(preJson);
	if (!pre.ok) {
		switch (pre.code) {
			case 'REFUNDED':
			case 'CANCELED':
				return json({ ok: true, already: true, orderCode: order.code });
			case 'NOT_FOUND':
				return apiError(404, 'NOT_FOUND', '주문을 찾을 수 없습니다');
			case 'SETTLED':
			case 'SHIPPED':
			case 'SAMPLE':
				return apiError(400, pre.code);
			default:
				return apiError(500, 'DB_ERROR', '잠시 후 다시 시도해주세요');
		}
	}
	if (!pre.payment_key) {
		return apiError(400, 'NO_PAYMENT_KEY', '결제 정보를 찾을 수 없어 취소할 수 없습니다 — 고객센터로 문의해주세요');
	}
	const paymentKey = pre.payment_key;

	// ④ 토스 취소 (전액). Idempotency-Key = order.id → 이중 호출은 토스가 같은 응답.
	const cancel = await tossCancel(paymentKey, reason, { idempotencyKey: order.id });
	let payment: TossPayment | null = null;

	if (cancel.ok && !isTossError(cancel.body)) {
		payment = cancel.body;
	} else if (!cancel.ok && !isUncertain(cancel) && isTossError(cancel.body) && cancel.body.code === 'ALREADY_CANCELED_PAYMENT') {
		// 토스에서는 이미 전액 취소됨(콘솔 취소 등) → 재조회 결과로 기록한다 (DB 가 현실을 거부하지 않는다)
		const look = await tossGetPayment(paymentKey);
		if (look.ok && !isTossError(look.body) && look.body.status === 'CANCELED') {
			payment = look.body;
		} else if (look.ok && !isTossError(look.body) && look.body.status === 'PARTIAL_CANCELED') {
			// 콘솔 부분취소 뒤 — 정상 상황(부분취소는 운영 큐, §7.3). 500 으로 재시도를 유도하지 않고 409 로 안내한다.
			const message = '일부 금액이 이미 취소된 주문이에요 — 고객센터로 문의해주세요';
			const sync = await recordRefundFromToss(
				admin,
				{ id: order.id, code: order.code, status: order.status, payment_key: paymentKey, checkout_session_id: null, campaign_id: order.campaign_id },
				look.body,
				{ reason: '토스 콘솔 부분취소', partial: true }
			);
			await logPaymentEvent(admin, {
				source: 'cancel',
				event_type: 'cancel',
				toss_order_id: look.body.orderId,
				payment_key: paymentKey,
				payload: { order_code: order.code, reason, payment: look.body, sync: sync.result },
				handled: false,
				result: 'partial_cancel_manual'
			});
			return apiError(409, 'PARTIAL_CANCELED', message);
		}
	}

	if (!payment) {
		// 4xx/5xx/네트워크 — DB 는 PAID 그대로. 고객이 다시 누르면 같은 Idempotency-Key 로 재시도된다.
		const err = isTossError(cancel.body) ? cancel.body : { code: 'CANCEL_FAILED', message: '결제 취소에 실패했습니다' };
		await logPaymentEvent(admin, {
			source: 'cancel',
			event_type: 'cancel',
			payment_key: paymentKey,
			payload: { order_code: order.code, status: cancel.status, body: cancel.body, reason },
			handled: false,
			result: 'error: cancel failed'
		});
		return apiError(500, err.code, err.message);
	}

	// ⑤ 기록 — 가드 없음 (precheck 뒤 송장이 입력됐어도 REFUNDED + refund_after_ship 시스템 행)
	const totalCancel = tossCanceledTotal(payment) || pre.amount;
	const { data: recJson, error: recError } = await admin.rpc('app_refund_record', {
		p_order_id: order.id,
		p_actor: 'customer',
		p_reason: reason,
		p_amount: totalCancel,
		p_raw: payment as unknown as Json,
		p_partial: false
	});
	if (recError) {
		console.error('[cancel] app_refund_record failed:', recError.message);
		// 돈은 이미 돌아갔다 — 운영 큐에 남기고 500. (재시도 시 토스는 ALREADY_CANCELED → 재조회 → 다시 record 시도)
		await logPaymentEvent(admin, {
			source: 'cancel',
			event_type: 'cancel',
			toss_order_id: payment.orderId,
			payment_key: paymentKey,
			payload: { order_code: order.code, payment, error: recError.message },
			handled: false,
			result: 'error: refund record failed'
		});
		return apiError(500, 'RECORD_FAILED', '환불은 처리됐지만 주문 기록 갱신에 실패했어요 — 고객센터로 문의해주세요');
	}
	const rec = parseRefundRecordResult(recJson);
	if (!rec.ok) {
		await logPaymentEvent(admin, {
			source: 'cancel',
			event_type: 'cancel',
			toss_order_id: payment.orderId,
			payment_key: paymentKey,
			payload: { order_code: order.code, payment, code: rec.code },
			handled: false,
			result: `error: refund record ${rec.code}`
		});
		return apiError(500, 'RECORD_FAILED', '환불은 처리됐지만 주문 기록 갱신에 실패했어요 — 고객센터로 문의해주세요');
	}

	// ⑤′ 환불 완료 메일(고객 · 새 기록일 때만 · 실패해도 응답 영향 없음)
	await afterRefundRecorded(admin, order.id, rec);

	// ⑥ 감사 로그
	const result = rec.already ? 'noop' : rec.adjust ? 'needs_manual_adjust' : 'refunded';
	await logPaymentEvent(admin, {
		source: 'cancel',
		event_type: 'cancel',
		toss_order_id: payment.orderId,
		payment_key: paymentKey,
		payload: { order_code: order.code, reason, payment },
		handled: !rec.adjust,
		result
	});

	return json({
		ok: true,
		orderCode: rec.order_code,
		amount: rec.amount ?? totalCancel,
		already: rec.already || undefined,
		afterShip: rec.after_ship || undefined
	});
};
