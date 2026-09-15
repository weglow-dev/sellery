import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanText } from "@/lib/text";
import { isTossError, isUncertain, tossCancel, tossCanceledTotal, tossGetPayment, type TossPayment } from "@/lib/toss";
import {
  apiError,
  logPaymentEvent,
  parsePrecheckResult,
  parseRefundRecordResult,
  recordRefundFromToss,
  rejectCrossSite,
} from "@/lib/checkout-sync";
import type { Json } from "@/lib/database.types";

/**
 * POST /api/payments/cancel — 고객 셀프 환불 (app-plan §6.2 · §7.4). 소유: E.
 *
 * 입력 { code(주문번호 o2001), reason? } — reason 은 선택지(단순 변심/상품 하자/오배송/기타)+자유 텍스트, cleanText 후 200자.
 * 순서(고정): ① 401 → ② user 클라이언트(RLS orders_select_own)로 본인 주문 조회, 없으면 404
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
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ORDER_CODE_RE = /^[A-Za-z0-9_-]{1,32}$/;

type Body = { code?: unknown; reason?: unknown };

export async function POST(request: Request) {
  // ⓪ 같은 오리진·JSON 본문만 (CSRF — Supabase 쿠키 SameSite 에만 기대지 않는다)
  const cross = rejectCrossSite(request);
  if (cross) return cross;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return apiError(400, "BAD_REQUEST", "요청 본문이 올바르지 않습니다");
  }
  const codeRaw = typeof body.code === "string" ? body.code.trim() : "";
  if (!ORDER_CODE_RE.test(codeRaw)) return apiError(400, "BAD_REQUEST", "주문번호가 올바르지 않습니다");
  const reason = (typeof body.reason === "string" ? cleanText(body.reason).slice(0, 200) : "") || "고객 요청";

  // ① 로그인
  const user = await getSessionUser();
  if (!user) return apiError(401, "UNAUTHORIZED");

  // ② 본인 주문 (RLS orders_select_own — 타인 주문은 보이지 않는다 → 404). 화면은 대문자로 보여 주므로 소문자도 같이 찾는다.
  const supabase = await createClient();
  const codes = Array.from(new Set([codeRaw, codeRaw.toLowerCase()]));
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, code, status, campaign_id, tracking_no")
    .in("code", codes)
    .limit(1)
    .maybeSingle();
  if (orderError) {
    console.error("[cancel] order lookup failed:", orderError.message);
    return apiError(500, "DB_ERROR", "잠시 후 다시 시도해주세요");
  }
  if (!order) return apiError(404, "NOT_FOUND", "주문을 찾을 수 없습니다");

  const admin = createAdminClient();

  // ③ 가드 (토스 호출 전에만)
  const { data: preJson, error: preError } = await admin.rpc("app_refund_precheck", {
    p_order_id: order.id,
    p_actor: "customer",
  });
  if (preError) {
    console.error("[cancel] app_refund_precheck failed:", preError.message);
    return apiError(500, "DB_ERROR", "잠시 후 다시 시도해주세요");
  }
  const pre = parsePrecheckResult(preJson);
  if (!pre.ok) {
    switch (pre.code) {
      case "REFUNDED":
      case "CANCELED":
        return NextResponse.json({ ok: true, already: true, orderCode: order.code });
      case "NOT_FOUND":
        return apiError(404, "NOT_FOUND", "주문을 찾을 수 없습니다");
      case "SETTLED":
      case "SHIPPED":
      case "SAMPLE":
        return apiError(400, pre.code);
      default:
        return apiError(500, "DB_ERROR", "잠시 후 다시 시도해주세요");
    }
  }
  if (!pre.payment_key) {
    return apiError(400, "NO_PAYMENT_KEY", "결제 정보를 찾을 수 없어 취소할 수 없습니다 — 고객센터로 문의해주세요");
  }
  const paymentKey = pre.payment_key;

  // ④ 토스 취소 (전액). Idempotency-Key = order.id → 이중 호출은 토스가 같은 응답.
  const cancel = await tossCancel(paymentKey, reason, { idempotencyKey: order.id });
  let payment: TossPayment | null = null;

  if (cancel.ok && !isTossError(cancel.body)) {
    payment = cancel.body;
  } else if (!cancel.ok && !isUncertain(cancel) && isTossError(cancel.body) && cancel.body.code === "ALREADY_CANCELED_PAYMENT") {
    // 토스에서는 이미 전액 취소됨(콘솔 취소 등) → 재조회 결과로 기록한다 (DB 가 현실을 거부하지 않는다)
    const look = await tossGetPayment(paymentKey);
    if (look.ok && !isTossError(look.body) && look.body.status === "CANCELED") {
      payment = look.body;
    } else if (look.ok && !isTossError(look.body) && look.body.status === "PARTIAL_CANCELED") {
      // 콘솔 부분취소 뒤 — 정상 상황(부분취소는 운영 큐, §7.3). 500 으로 재시도를 유도하지 않고 409 로 안내한다.
      const message = "일부 금액이 이미 취소된 주문이에요 — 고객센터로 문의해주세요";
      const sync = await recordRefundFromToss(
        admin,
        { id: order.id, code: order.code, status: order.status, payment_key: paymentKey, checkout_session_id: null, campaign_id: order.campaign_id },
        look.body,
        { reason: "토스 콘솔 부분취소", partial: true },
      );
      await logPaymentEvent(admin, {
        source: "cancel",
        event_type: "cancel",
        toss_order_id: look.body.orderId,
        payment_key: paymentKey,
        payload: { order_code: order.code, reason, payment: look.body, sync: sync.result },
        handled: false,
        result: "partial_cancel_manual",
      });
      return apiError(409, "PARTIAL_CANCELED", message);
    }
  }

  if (!payment) {
    // 4xx/5xx/네트워크 — DB 는 PAID 그대로. 고객이 다시 누르면 같은 Idempotency-Key 로 재시도된다.
    const err = isTossError(cancel.body) ? cancel.body : { code: "CANCEL_FAILED", message: "결제 취소에 실패했습니다" };
    await logPaymentEvent(admin, {
      source: "cancel",
      event_type: "cancel",
      payment_key: paymentKey,
      payload: { order_code: order.code, status: cancel.status, body: cancel.body, reason },
      handled: false,
      result: "error: cancel failed",
    });
    return apiError(500, err.code, err.message);
  }

  // ⑤ 기록 — 가드 없음 (precheck 뒤 송장이 입력됐어도 REFUNDED + refund_after_ship 시스템 행)
  const totalCancel = tossCanceledTotal(payment) || pre.amount;
  const { data: recJson, error: recError } = await admin.rpc("app_refund_record", {
    p_order_id: order.id,
    p_actor: "customer",
    p_reason: reason,
    p_amount: totalCancel,
    p_raw: payment as unknown as Json,
    p_partial: false,
  });
  if (recError) {
    console.error("[cancel] app_refund_record failed:", recError.message);
    // 돈은 이미 돌아갔다 — 운영 큐에 남기고 500. (재시도 시 토스는 ALREADY_CANCELED → 재조회 → 다시 record 시도)
    await logPaymentEvent(admin, {
      source: "cancel",
      event_type: "cancel",
      toss_order_id: payment.orderId,
      payment_key: paymentKey,
      payload: { order_code: order.code, payment, error: recError.message },
      handled: false,
      result: "error: refund record failed",
    });
    return apiError(500, "RECORD_FAILED", "환불은 처리됐지만 주문 기록 갱신에 실패했어요 — 고객센터로 문의해주세요");
  }
  const rec = parseRefundRecordResult(recJson);
  if (!rec.ok) {
    await logPaymentEvent(admin, {
      source: "cancel",
      event_type: "cancel",
      toss_order_id: payment.orderId,
      payment_key: paymentKey,
      payload: { order_code: order.code, payment, code: rec.code },
      handled: false,
      result: `error: refund record ${rec.code}`,
    });
    return apiError(500, "RECORD_FAILED", "환불은 처리됐지만 주문 기록 갱신에 실패했어요 — 고객센터로 문의해주세요");
  }

  // ⑥ 감사 로그
  const result = rec.already ? "noop" : rec.adjust ? "needs_manual_adjust" : "refunded";
  await logPaymentEvent(admin, {
    source: "cancel",
    event_type: "cancel",
    toss_order_id: payment.orderId,
    payment_key: paymentKey,
    payload: { order_code: order.code, reason, payment },
    handled: !rec.adjust,
    result,
  });

  return NextResponse.json({
    ok: true,
    orderCode: rec.order_code,
    amount: rec.amount ?? totalCancel,
    already: rec.already || undefined,
    afterShip: rec.after_ship || undefined,
  });
}
