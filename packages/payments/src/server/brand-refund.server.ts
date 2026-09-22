/**
 * 브랜드 환불 — 브랜드 콘솔 `/brand/orders` `?/refund` 가 부르는 한 함수 (docs/brand-console-plan.md §4 "0018 브랜드 환불" · docs/app-plan.md §6.2 · §7.4).
 * shop `/api/payments/cancel`(고객 셀프 환불)과 같은 순서를 브랜드 시점으로: 가드(0018 app_brand_refund_precheck — 소유 · 비샘플 · **발송 전** · PAID · 캠페인 ≠ SETTLED)
 * → 토스 전액 취소(Idempotency-Key = order.id + ':brand') → 0008 app_refund_record(actor='brand') → payment_events(source='cancel').
 * 토스 취소 실패면 DB 는 PAID 그대로(재시도 가능). 기록 실패면 돈은 이미 돌아갔으므로 운영 큐(handled=false) + RECORD_FAILED.
 *
 *   refundOrderAsBrand(brandId, orderCode, reason, { admin?, toss? })
 *     → { ok:true, orderCode, amount, already?:true, adjust?:true }
 *     | { ok:false, code: NOT_FOUND | SAMPLE | SHIPPED | SETTLED | REFUNDED | CANCELED | NO_PAYMENT_KEY | PARTIAL_CANCELED | CANCEL_FAILED | RECORD_FAILED | DB_ERROR, message? }
 *   문구는 @sellery/db brand/order-rules BRAND_REFUND_FAIL_MESSAGES · brandRefundFailMessage.
 *
 * 시드·수기 주문(payment_key 없음)은 NO_PAYMENT_KEY — 토스 없이 REFUNDED 로 두려면 운영자가 `app_refund_record(order, 'admin', …)` 를 직접.
 */
import type { Json } from "@sellery/db/database.types";
import { createAdminClient, type Admin } from "@sellery/db/server/admin";
import { brandRefundPrecheck } from "@sellery/db/server/brand/orders";
import { cleanText } from "@sellery/db/text";
import { logPaymentEvent, parseRefundRecordResult, recordRefundFromToss } from "./checkout-sync.server";
import { isTossError, isUncertain, tossCancel, tossCanceledTotal, tossConfirm, tossGetPayment, type TossApi, type TossPayment } from "./toss.server";

export type BrandRefundResult =
  | { ok: true; orderCode: string; amount: number; already?: true; adjust?: true }
  | { ok: false; code: string; message?: string };

export type BrandRefundOptions = { admin?: Admin; toss?: TossApi };

export const BRAND_REFUND_REASON_MAX = 200;

export async function refundOrderAsBrand(brandId: string, orderCode: string, reason: string, opts: BrandRefundOptions = {}): Promise<BrandRefundResult> {
  const admin = opts.admin ?? createAdminClient();
  const toss: TossApi = opts.toss ?? { tossConfirm, tossCancel, tossGetPayment };
  const cleanReason = (cleanText(reason).slice(0, BRAND_REFUND_REASON_MAX) || "브랜드 환불 처리").trim();

  // ① 가드 (토스 호출 전에만) — 소유 · 비샘플 · 발송 전 · PAID · 캠페인 ≠ SETTLED
  const pre = await brandRefundPrecheck(brandId, orderCode, admin);
  if (!pre.ok) {
    if (pre.code === "REFUNDED" || pre.code === "CANCELED") return { ok: true, orderCode, amount: 0, already: true };
    return { ok: false, code: pre.code };
  }
  if (!pre.paymentKey) return { ok: false, code: "NO_PAYMENT_KEY" };
  const paymentKey = pre.paymentKey;
  const orderLite = { id: pre.orderId, code: pre.orderCode, status: "PAID", payment_key: paymentKey, checkout_session_id: null, campaign_id: "" };

  // ② 토스 전액 취소. Idempotency-Key = `${order.id}:brand` — 고객 셀프 환불(order.id)과 키가 달라도 토스는 두 번째를 ALREADY_CANCELED 로 돌려준다.
  const cancel = await toss.tossCancel(paymentKey, cleanReason, { idempotencyKey: `${pre.orderId}:brand` });
  let payment: TossPayment | null = null;

  if (cancel.ok && !isTossError(cancel.body)) {
    payment = cancel.body;
  } else if (!cancel.ok && !isUncertain(cancel) && isTossError(cancel.body) && cancel.body.code === "ALREADY_CANCELED_PAYMENT") {
    const look = await toss.tossGetPayment(paymentKey);
    if (look.ok && !isTossError(look.body) && look.body.status === "CANCELED") {
      payment = look.body;
    } else if (look.ok && !isTossError(look.body) && look.body.status === "PARTIAL_CANCELED") {
      const sync = await recordRefundFromToss(admin, { ...orderLite, campaign_id: "" }, look.body, { reason: "토스 콘솔 부분취소", partial: true });
      await logPaymentEvent(admin, {
        source: "cancel",
        event_type: "cancel",
        toss_order_id: look.body.orderId,
        payment_key: paymentKey,
        payload: { order_code: pre.orderCode, brand_id: brandId, reason: cleanReason, payment: look.body, sync: sync.result },
        handled: false,
        result: "partial_cancel_manual",
      });
      return { ok: false, code: "PARTIAL_CANCELED" };
    }
  }

  if (!payment) {
    const err = isTossError(cancel.body) ? cancel.body : { code: "CANCEL_FAILED", message: "결제 취소에 실패했습니다" };
    await logPaymentEvent(admin, {
      source: "cancel",
      event_type: "cancel",
      payment_key: paymentKey,
      payload: { order_code: pre.orderCode, brand_id: brandId, status: cancel.status, body: cancel.body, reason: cleanReason },
      handled: false,
      result: "error: cancel failed (brand)",
    });
    return { ok: false, code: "CANCEL_FAILED", message: err.message };
  }

  // ③ 기록 — 가드 없음 (돈은 이미 돌아갔다). actor='brand' → refund_actor='brand' · 이벤트 refunded
  const totalCancel = tossCanceledTotal(payment) || pre.amount;
  const { data: recJson, error: recError } = await admin.rpc("app_refund_record", {
    p_order_id: pre.orderId,
    p_actor: "brand",
    p_reason: cleanReason,
    p_amount: totalCancel,
    p_raw: payment as unknown as Json,
    p_partial: false,
  });
  if (recError) {
    console.error("[brand-refund] app_refund_record failed:", recError.message);
    await logPaymentEvent(admin, {
      source: "cancel",
      event_type: "cancel",
      toss_order_id: payment.orderId,
      payment_key: paymentKey,
      payload: { order_code: pre.orderCode, brand_id: brandId, payment, error: recError.message },
      handled: false,
      result: "error: refund record failed (brand)",
    });
    return { ok: false, code: "RECORD_FAILED" };
  }
  const rec = parseRefundRecordResult(recJson);
  if (!rec.ok) {
    await logPaymentEvent(admin, {
      source: "cancel",
      event_type: "cancel",
      toss_order_id: payment.orderId,
      payment_key: paymentKey,
      payload: { order_code: pre.orderCode, brand_id: brandId, payment, code: rec.code },
      handled: false,
      result: `error: refund record ${rec.code} (brand)`,
    });
    return { ok: false, code: "RECORD_FAILED" };
  }

  // ④ 감사 로그
  await logPaymentEvent(admin, {
    source: "cancel",
    event_type: "cancel",
    toss_order_id: payment.orderId,
    payment_key: paymentKey,
    payload: { order_code: pre.orderCode, brand_id: brandId, reason: cleanReason, payment },
    handled: !rec.adjust,
    result: rec.already ? "noop" : rec.adjust ? "needs_manual_adjust" : "refunded (brand)",
  });

  return {
    ok: true,
    orderCode: rec.order_code,
    amount: rec.amount ?? totalCancel,
    ...(rec.already ? { already: true as const } : {}),
    ...(rec.adjust ? { adjust: true as const } : {}),
  };
}
