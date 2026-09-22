/**
 * 관리자 환불 — 관리자 콘솔 `/admin/orders` `?/refund` 가 부르는 한 함수 (docs/admin-console-plan.md "정산·돈" · docs/app-plan.md §7.4).
 * `brand-refund.server.ts`(브랜드) 와 같은 순서를 관리자 시점으로: 가드 → 토스 전액 취소(Idempotency-Key = order.id + ':admin') → 0008 app_refund_record(actor='admin') → payment_events.
 * 브랜드와 다른 점:
 *   · **발송 후 제한 없음** — 0008 app_refund_precheck(order, 'admin') 은 actor='customer' 에만 SHIPPED 를 건다. 회수는 운영자가 CS 로.
 *   · **정산 완료(SETTLED) 캠페인도 허용** — precheck 의 SETTLED 를 넘기고(`allowSettled`, 기본 true) 토스 취소 뒤 app_refund_record 가 status 'CANCELED' + 이벤트 refund_needs_adjust 로
 *     기록한다(정산 스냅샷은 그대로 · 조정은 운영자 — 0008 헤더 "정산 후 조정 큐"). 반환 adjust:true.
 *   · 샘플 구매 주문(is_sample)은 여기서도 거부(SAMPLE) — 샘플 결제는 partner_payments 흐름(`partner-sample.server.ts` · partner-admin.mjs refund-sample).
 *   · 시드·수기 주문(payment_key 없음)은 기본 NO_PAYMENT_KEY. `recordOnly:true` 면 토스 없이 app_refund_record 만(운영 스크립트 · 돈이 밖에서 돌아간 경우) — 콘솔 화면은 켜지 않는다.
 *
 *   refundOrderAsAdmin(orderRef, reason, { admin?, toss?, allowSettled?, recordOnly?, actorUserId? })
 *     → { ok:true, orderCode, amount, already?:true, adjust?:true, recordOnly?:true }
 *     | { ok:false, code: NOT_FOUND | SAMPLE | SETTLED | REFUNDED | CANCELED | NO_PAYMENT_KEY | PARTIAL_CANCELED | CANCEL_FAILED | RECORD_FAILED | DB_ERROR, message? }
 */
import type { Json } from "@sellery/db/database.types";
import { createAdminClient, type Admin } from "@sellery/db/server/admin";
import { orderIdOf } from "@sellery/db/server/admin/orders";
import { cleanText } from "@sellery/db/text";
import { afterRefundRecorded, logPaymentEvent, parsePrecheckResult, parseRefundRecordResult, recordRefundFromToss } from "./checkout-sync.server";
import { isTossError, isUncertain, tossCancel, tossCanceledTotal, tossConfirm, tossGetPayment, type TossApi, type TossPayment } from "./toss.server";

export type AdminRefundResult =
  | { ok: true; orderCode: string; amount: number; already?: true; adjust?: true; recordOnly?: true }
  | { ok: false; code: string; message?: string };

export type AdminRefundOptions = { admin?: Admin; toss?: TossApi; allowSettled?: boolean; recordOnly?: boolean; actorUserId?: string | null };

export const ADMIN_REFUND_REASON_MAX = 200;

/** 실패 코드 → 문구 (brand/order-rules BRAND_REFUND_FAIL_MESSAGES 와 같은 어휘 + 관리자 전용) */
export const ADMIN_REFUND_FAIL_MESSAGES: Record<string, string> = {
  NOT_FOUND: "주문을 찾을 수 없어요",
  SAMPLE: "인플루언서 샘플 구매 주문은 여기서 환불하지 않아요 — 샘플 결제 흐름(refund-sample)으로",
  SETTLED: "정산이 완료된 판매의 주문이에요 — 정산 후 환불은 '조정 큐로 기록' 을 켜고 실행하세요",
  REFUNDED: "이미 환불된 주문이에요",
  CANCELED: "이미 취소된 주문이에요",
  NO_PAYMENT_KEY: "토스 결제 키가 없는 주문(시드·수기)이에요 — 밖에서 돌려줬다면 '기록만' 으로",
  PARTIAL_CANCELED: "토스 콘솔에서 부분취소된 결제예요 — 정산 수동 확인 큐에 남겼어요",
  CANCEL_FAILED: "토스 결제 취소에 실패했어요 — 잠시 후 다시 시도해주세요",
  RECORD_FAILED: "결제는 취소됐지만 기록에 실패했어요 — 운영 큐(payment_events)에서 확인해주세요",
  DB_ERROR: "처리에 실패했어요 — 잠시 후 다시 시도해주세요",
};

export function adminRefundFailMessage(code: string | null | undefined): string {
  return (code && ADMIN_REFUND_FAIL_MESSAGES[code]) || ADMIN_REFUND_FAIL_MESSAGES.DB_ERROR;
}

type OrderRow = { id: string; code: string; status: string; amount: number; is_sample: boolean; payment_key: string | null; checkout_session_id: string | null; campaign_id: string };

export async function refundOrderAsAdmin(orderRef: string, reason: string, opts: AdminRefundOptions = {}): Promise<AdminRefundResult> {
  const admin = opts.admin ?? createAdminClient();
  const toss: TossApi = opts.toss ?? { tossConfirm, tossCancel, tossGetPayment };
  const allowSettled = opts.allowSettled ?? true;
  const cleanReason = (cleanText(reason).slice(0, ADMIN_REFUND_REASON_MAX) || "관리자 환불 처리").trim();

  // ① 주문 + 가드 (토스 호출 전에만) — PAID · 비샘플 · (SETTLED 는 allowSettled)
  const id = await orderIdOf(admin, orderRef);
  if (id === "error") return { ok: false, code: "DB_ERROR" };
  if (!id) return { ok: false, code: "NOT_FOUND" };
  const { data: row, error: rowErr } = await admin.from("orders").select("id, code, status, amount, is_sample, payment_key, checkout_session_id, campaign_id").eq("id", id).maybeSingle();
  if (rowErr) {
    console.error("[admin-refund] order read failed:", rowErr.message);
    return { ok: false, code: "DB_ERROR" };
  }
  if (!row) return { ok: false, code: "NOT_FOUND" };
  const order = row as OrderRow;
  if (order.status === "REFUNDED" || order.status === "CANCELED") return { ok: true, orderCode: order.code, amount: 0, already: true };
  if (order.is_sample) return { ok: false, code: "SAMPLE" };

  const { data: preJson, error: preErr } = await admin.rpc("app_refund_precheck", { p_order_id: order.id, p_actor: "admin" });
  if (preErr) {
    console.error("[admin-refund] app_refund_precheck failed:", preErr.message);
    return { ok: false, code: "DB_ERROR" };
  }
  const pre = parsePrecheckResult(preJson);
  if (!pre.ok) {
    if (pre.code === "REFUNDED" || pre.code === "CANCELED") return { ok: true, orderCode: order.code, amount: 0, already: true };
    if (!(pre.code === "SETTLED" && allowSettled)) return { ok: false, code: pre.code };
  }
  const amount = pre.ok ? pre.amount : order.amount;
  const paymentKey = pre.ok ? pre.payment_key : order.payment_key;
  const orderLite = { id: order.id, code: order.code, status: order.status, payment_key: paymentKey, checkout_session_id: order.checkout_session_id, campaign_id: order.campaign_id };

  // ①′ 기록만 (토스 없이) — 시드·수기 주문 · 밖에서 돌려준 돈
  if (opts.recordOnly) {
    const { data: recJson, error: recError } = await admin.rpc("app_refund_record", {
      p_order_id: order.id,
      p_actor: "admin",
      p_reason: cleanReason,
      p_amount: amount,
      p_raw: { record_only: true, actor_user_id: opts.actorUserId ?? null } as Json,
      p_partial: false,
    });
    if (recError) {
      console.error("[admin-refund] app_refund_record failed (record only):", recError.message);
      return { ok: false, code: "RECORD_FAILED" };
    }
    const rec = parseRefundRecordResult(recJson);
    if (!rec.ok) return { ok: false, code: "RECORD_FAILED" };
    await afterRefundRecorded(admin, order.id, rec);
    return { ok: true, orderCode: rec.order_code, amount: rec.amount ?? amount, recordOnly: true, ...(rec.already ? { already: true as const } : {}), ...(rec.adjust ? { adjust: true as const } : {}) };
  }
  if (!paymentKey) return { ok: false, code: "NO_PAYMENT_KEY" };

  // ② 토스 전액 취소. Idempotency-Key = `${order.id}:admin`
  const cancel = await toss.tossCancel(paymentKey, cleanReason, { idempotencyKey: `${order.id}:admin` });
  let payment: TossPayment | null = null;
  if (cancel.ok && !isTossError(cancel.body)) {
    payment = cancel.body;
  } else if (!cancel.ok && !isUncertain(cancel) && isTossError(cancel.body) && cancel.body.code === "ALREADY_CANCELED_PAYMENT") {
    const look = await toss.tossGetPayment(paymentKey);
    if (look.ok && !isTossError(look.body) && look.body.status === "CANCELED") {
      payment = look.body;
    } else if (look.ok && !isTossError(look.body) && look.body.status === "PARTIAL_CANCELED") {
      const sync = await recordRefundFromToss(admin, orderLite, look.body, { reason: "토스 콘솔 부분취소", partial: true });
      await logPaymentEvent(admin, {
        source: "cancel",
        event_type: "cancel",
        toss_order_id: look.body.orderId,
        payment_key: paymentKey,
        payload: { order_code: order.code, actor: "admin", actor_user_id: opts.actorUserId ?? null, reason: cleanReason, payment: look.body, sync: sync.result },
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
      payload: { order_code: order.code, actor: "admin", actor_user_id: opts.actorUserId ?? null, status: cancel.status, body: cancel.body, reason: cleanReason },
      handled: false,
      result: "error: cancel failed (admin)",
    });
    return { ok: false, code: "CANCEL_FAILED", message: err.message };
  }

  // ③ 기록 — 가드 없음 (돈은 이미 돌아갔다). SETTLED/샘플이면 record 가 CANCELED + refund_needs_adjust 로 남긴다.
  const totalCancel = tossCanceledTotal(payment) || amount;
  const { data: recJson, error: recError } = await admin.rpc("app_refund_record", {
    p_order_id: order.id,
    p_actor: "admin",
    p_reason: cleanReason,
    p_amount: totalCancel,
    p_raw: payment as unknown as Json,
    p_partial: false,
  });
  if (recError) {
    console.error("[admin-refund] app_refund_record failed:", recError.message);
    await logPaymentEvent(admin, {
      source: "cancel",
      event_type: "cancel",
      toss_order_id: payment.orderId,
      payment_key: paymentKey,
      payload: { order_code: order.code, actor: "admin", payment, error: recError.message },
      handled: false,
      result: "error: refund record failed (admin)",
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
      payload: { order_code: order.code, actor: "admin", payment, code: rec.code },
      handled: false,
      result: `error: refund record ${rec.code} (admin)`,
    });
    return { ok: false, code: "RECORD_FAILED" };
  }

  // ③′ 환불 완료 메일(고객 · 새 기록일 때만)
  await afterRefundRecorded(admin, order.id, rec);

  // ④ 감사 로그
  await logPaymentEvent(admin, {
    source: "cancel",
    event_type: "cancel",
    toss_order_id: payment.orderId,
    payment_key: paymentKey,
    payload: { order_code: order.code, actor: "admin", actor_user_id: opts.actorUserId ?? null, reason: cleanReason, payment },
    handled: !rec.adjust,
    result: rec.already ? "noop" : rec.adjust ? "needs_manual_adjust" : "refunded (admin)",
  });

  return {
    ok: true,
    orderCode: rec.order_code,
    amount: rec.amount ?? totalCancel,
    ...(rec.already ? { already: true as const } : {}),
    ...(rec.adjust ? { adjust: true as const } : {}),
  };
}
