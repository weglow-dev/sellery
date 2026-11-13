/**
 * 환불 — 단일 함수(docs/myr.md §3.1): precheck(가드·금액) → 토스 부분 취소(cancelAmount · Idempotency-Key) → record(줄·주문 기록). 0061.
 *   · actor · actorId 는 라우트가 세션/쿠키 검증에서 정한다(회원 user.id · 비회원은 토큰 검증 뒤 customer_id · 셀러/관리자는 다음 앱).
 *   · WAITING_DEPOSIT(입금 전) 은 토스 호출 없이 record 만.
 *   · 돌려줄 돈 · 차감 · 토스 전액 취소 여부는 precheck 응답(0105) — record 는 같은 precheck 로 다시 계산해 다르면 mismatch(거절하지 않음 → payment_events handled=false).
 *   · 토스 취소가 불명(0/5xx)이면 기록하지 않고 CANCEL_UNCERTAIN — payment_events(handled=false) 운영 큐. 같은 줄 묶음으로 재시도하면 같은 Idempotency-Key 라 토스가 같은 결과를 준다.
 *   · 토스 ALREADY_CANCELED_PAYMENT(전액 이미 취소) 는 취소 성공으로 보고 기록한다.
 *   · 교환·환불 요청(0078)에서 나가는 환불은 deduction(왕복 배송비) · tag(요청 코드)를 준다 — 금액은 `refundQuote` 한 번으로 정해 토스 · record · 메일이 같은 값을 쓴다(화면 예상 금액도 같은 함수).
 */
import { parsePrecheckResult, parseRecordResult, quoteFromPrecheck, refundIdempotencyKey, type PrecheckOk, type RefundLine, type RefundQuote } from '../refund-rules';
import { admin } from './admin.server';
import { logPaymentEvent } from './payment-events.server';
import { notifyOrderRefunded } from './mail-events.server';
import { signRefundPhotos } from './refund-photos.server';
import { isTossError, isUncertain, tossCancel } from './toss.server';

export type RefundActor = 'customer' | 'seller' | 'admin' | 'system';
export type RefundOutcome =
	| { ok: true; already: boolean; orderCode: string; status: string; amount: number; refunded: number }
	| { ok: false; code: string; message?: string; items?: { item_id: string; reason: string; left: number }[] };
export type RefundQuoteResult = { ok: true; pre: PrecheckOk; quote: RefundQuote } | Extract<RefundOutcome, { ok: false }>;

/** 환불 금액 — precheck(가드 · 줄 + 마지막이면 배송비 · 차감 뒤 금액 · 토스 전액 취소 여부 — 0105 서버가 다 정한다) → 모양만 바꾼다(quoteFromPrecheck). 돈을 움직이지 않는다.
 *  refundItems 가 실제 환불 금액을 여기서 정하고, 샵 신청 화면 · 콘솔 처리 방법 · 승인 메일의 예상 금액도 이 함수를 부른다 — 금액 계산은 이 한 곳(백엔드 원칙 1) */
export async function refundQuote(input: { actor: RefundActor; actorId: string | null; orderId: string; items: RefundLine[]; deduction?: number }): Promise<RefundQuoteResult> {
	const { data: preJson, error: preError } = await admin().rpc('myr_app_refund_precheck', {
		p_order_id: input.orderId,
		p_items: input.items,
		p_actor: input.actor,
		p_actor_id: input.actorId,
		p_deduction: input.deduction ?? 0
	});
	if (preError) throw new Error(`myr_app_refund_precheck failed: ${preError.message}`);
	const pre = parsePrecheckResult(preJson);
	if (!pre.ok) return { ok: false, code: pre.code, items: pre.items };
	return { ok: true, pre, quote: quoteFromPrecheck(pre) };
}

export async function refundItems(input: {
	actor: RefundActor;
	actorId: string | null;
	orderId: string;
	items: RefundLine[];
	reason: string;
	/** 왕복 배송비 차감(원 · 0078 부분 환불) — 고객 셀프 환불은 넘기지 않는다 */
	deduction?: number;
	/** 토스 Idempotency-Key 꼬리 — 교환·환불 요청 코드 */
	tag?: string;
}): Promise<RefundOutcome> {
	const db = admin();
	// 로그(payment_events)를 주문번호(order_code · 0062)와 토스 orderId 로 찾을 수 있게 둘 다 적는다 — 토스 orderId 는 결제 세션(myr_checkouts)에 있다
	const { data: ord, error: ordError } = await db
		.from('myr_orders')
		.select('code, checkout_id, myr_checkouts(toss_order_id)')
		.eq('id', input.orderId)
		.maybeSingle();
	if (ordError) console.error('[refund] order lookup failed:', ordError.message);
	const row = ord as { code?: string; myr_checkouts?: { toss_order_id: string } | { toss_order_id: string }[] | null } | null;
	const co = row?.myr_checkouts;
	const tossOrderId = (Array.isArray(co) ? co[0]?.toss_order_id : co?.toss_order_id) ?? null;
	const orderCode = row?.code ?? null;
	// 실제로 돌려줄 돈 — 화면 예상 금액과 같은 함수(refundQuote) · 차감은 입금 전 취소에는 없다
	const q = await refundQuote(input);
	if (!q.ok) return q;
	const { pre } = q;
	const { amount, deduction } = q.quote;

	const reason = (input.reason || (input.actor === 'customer' ? '고객 요청' : `${input.actor} 환불`)).slice(0, 200);
	// 제품별 상세(0067) — record 가 줄 refund_reason 에 남기고, 셀러 메일에도 싣는다
	const noteById = new Map(input.items.filter((l) => l.note).map((l) => [l.item_id, l.note as string]));
	const photosById = new Map(input.items.filter((l) => l.photos?.length).map((l) => [l.item_id, l.photos as string[]]));
	let raw: unknown = null;

	if (!pre.deposit) {
		if (!pre.paymentKey) return { ok: false, code: 'TOSS_ERROR', message: '결제 정보가 없는 주문이에요' };
		const key = refundIdempotencyKey(input.orderId, pre.items, input.tag);
		// 전액 취소(cancelAmount 없음)인지는 서버 값(cancel_full · myr_refund_cancel_full — 다 끝나고 차감 없음) · 아니면 돌려줄 돈만 부분 취소
		const cancel = await tossCancel(pre.paymentKey, reason, { idempotencyKey: key, cancelAmount: pre.cancelFull ? undefined : amount });
		const alreadyAll = !cancel.ok && isTossError(cancel.body) && cancel.body.code === 'ALREADY_CANCELED_PAYMENT';
		if (!cancel.ok && !alreadyAll) {
			if (isUncertain(cancel)) {
				await logPaymentEvent(db, {
					source: 'cancel',
					toss_order_id: tossOrderId,
					order_code: orderCode,
					event_type: 'refund',
					payment_key: pre.paymentKey,
					payload: { orderId: input.orderId, items: pre.items, amount, deduction, cancel: cancel.body, status: cancel.status },
					handled: false,
					result: 'error: cancel uncertain'
				});
				return { ok: false, code: 'CANCEL_UNCERTAIN' };
			}
			const err = isTossError(cancel.body) ? cancel.body : { code: 'TOSS_ERROR', message: '결제 취소에 실패했습니다' };
			await logPaymentEvent(db, {
				source: 'cancel',
				toss_order_id: tossOrderId,
				order_code: orderCode,
				event_type: 'refund',
				payment_key: pre.paymentKey,
				payload: { orderId: input.orderId, items: pre.items, amount, deduction, cancel: cancel.body, status: cancel.status },
				handled: true,
				result: `failed: ${err.code}`
			});
			return { ok: false, code: 'TOSS_ERROR', message: err.message };
		}
		raw = cancel.body;
	}

	const { data: recJson, error: recError } = await db.rpc('myr_app_refund_record', {
		p_order_id: input.orderId,
		p_items: input.items,
		p_actor: input.actor,
		p_actor_id: input.actorId,
		p_reason: reason,
		p_amount: amount,
		p_raw: raw,
		p_deduction: deduction
	});
	if (recError) {
		// 돈은 돌아갔는데 기록 실패 — 운영 큐. 재시도하면 같은 키로 토스가 같은 응답을 주고 record 만 다시 한다.
		await logPaymentEvent(db, {
			source: 'cancel',
			toss_order_id: tossOrderId,
			order_code: orderCode,
			event_type: 'refund',
			payment_key: pre.paymentKey,
			payload: { orderId: input.orderId, items: pre.items, amount, deduction, error: recError.message },
			handled: false,
			result: 'error: refund record'
		});
		throw new Error(`myr_app_refund_record failed: ${recError.message}`);
	}
	const rec = parseRecordResult(recJson);
	if (!rec.ok) return { ok: false, code: rec.code };
	if (rec.mismatch) {
		// 기록은 됐지만 토스에 보낸 금액이 record 가 다시 계산한 금액과 다르다(0105) — 운영 큐(돈은 나갔으니 막지 않는다)
		console.error(`[refund] amount mismatch ${orderCode ?? input.orderId}: got ${rec.mismatch.got} · expected ${rec.mismatch.expected}`);
		await logPaymentEvent(db, {
			source: 'cancel',
			toss_order_id: tossOrderId,
			order_code: orderCode,
			event_type: 'refund',
			payment_key: pre.paymentKey,
			payload: { orderId: input.orderId, items: pre.items, amount, deduction, expected: rec.mismatch.expected, raw },
			handled: false,
			result: 'error: refund amount mismatch'
		});
	}
	await logPaymentEvent(db, {
		source: 'cancel',
		toss_order_id: tossOrderId,
		order_code: orderCode,
		event_type: pre.deposit ? 'deposit_cancel' : 'refund',
		payment_key: pre.paymentKey,
		payload: { orderId: input.orderId, actor: input.actor, items: pre.items, amount, deduction, full: pre.full, raw },
		handled: true,
		result: rec.already ? 'noop' : pre.deposit ? 'deposit_canceled' : pre.full ? 'refunded' : 'refunded_partial'
	});
	// 거래 메일 — 새로 기록했을 때만 · 고객 + 환불된 줄의 셀러 · 절대 throw 하지 않는다 (mail-events.ts)
	if (!rec.already) {
		// 사진(0068)은 서명 URL(7일)로 셀러 메일에 — 서명 실패는 메일을 막지 않는다
		const signed = await signRefundPhotos([...photosById.values()].flat());
		await notifyOrderRefunded(input.orderId, {
			items: pre.items.map((i) => ({
				itemId: i.item_id,
				qty: i.qty,
				amount: i.amount,
				note: noteById.get(i.item_id),
				photoUrls: (photosById.get(i.item_id) ?? []).map((p) => signed.get(p)).filter((u): u is string => !!u)
			})),
			amount,
			full: pre.full,
			reason,
			deposit: pre.deposit,
			deduction
		});
	}
	return { ok: true, already: rec.already, orderCode: rec.orderCode, status: rec.status, amount: rec.amount, refunded: amount };
}
