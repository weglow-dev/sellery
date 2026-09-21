/**
 * 파트너(인플루언서) 샘플 구매 결제 — 0012 partner_payments ↔ 토스 동기화. 서버 전용 (docs/inf-console-plan.md §5.5 · §5.6 · §5.7).
 * 고객 체크아웃의 checkout-sync.server.ts 와 같은 원칙(app-plan §0 결정 5·5-1)을 파트너 결제 테이블에 옮긴 것이다 —
 * 공용 조각(logPaymentEvent · markPaymentEvent · cancelReasonFor · TOSS_KEY_RE) 은 그대로 import, 테이블 종속부만 여기.
 *
 * 왜 @sellery/payments 인가: 토스 confirm/cancel 호출과 DB RPC 를 한 트랜잭션 경계 안에서 순서대로 묶어야 하고(승인 뒤 RPC 거부 → 전액 취소),
 * 그 순서 규칙이 checkout-sync 와 같은 모듈에 있어야 두 결제 경로가 같이 고쳐진다. DB 만 만지는 조회(getSamplePayment)도 같은 이유로 여기 둔다.
 * 순수 규칙(RPC jsonb 파싱 · 문구 · isPayable) 은 @sellery/db/partner/sample-rules (브라우저·vitest 공용).
 *
 *   beginSamplePurchase(sellerId, productCode, useCel, shipping)   app_partner_payment_claim — PENDING 행 + 토스 orderId(slrp_)
 *   confirmSamplePurchase(sellerId, paymentId, {orderId, paymentKey, amountCash})
 *                                                                   successUrl 뒤 1회: 금액 대조 → (현금) confirming 선점 → 토스 confirm → app_partner_payment_confirm
 *                                                                   → RPC 거부면 토스 전액 취소 → FAILED(code) / (🥬 전액) RPC 바로
 *   cancelSamplePurchase(sellerId, paymentId, reason)               결제 전 그만둠 — PENDING · payment_key 없는 CONFIRMING 만
 *   recordSampleWidgetFailure(sellerId, {orderId|paymentId}, {code,message})   /pay/fail — 사용자 취소는 PENDING 유지, 그 외는 FAILED(code) + payment_events
 *   getSamplePayment(sellerId, paymentId) · getSamplePaymentByOrderId(sellerId, orderId)   seller_id 필터 — 남의 id 는 null (라우트 404)
 *   refundSamplePurchase(paymentId, reason)                         운영 스크립트(cancel-sample.mjs): 토스 현금분 전액 취소 → app_partner_payment_refund
 *   findPartnerPaymentForWebhook(admin, {orderId, paymentKey})     웹훅 매칭 — orderId 가 slrp_ 이거나 paymentKey 가 partner_payments 에
 *   syncPartnerFromPayment(admin, payment, tossPayment, source)     재조회 결과로만 동기화 (웹훅·reconcile 공용) → { result, handled }
 *   expirePartnerPayments() · listStalePartnerPayments() · reconcilePartnerPayment()   /api/cron/reconcile 확장 (PR-B 가 배선)
 *
 * 모든 함수는 예외를 던지지 않고 { ok, code } 로 돌려주며, DB 오류는 콘솔 로그 + DB_ERROR/CONFIRMING 이다.
 */
import type { Json } from "@sellery/db/database.types";
import { CAMPAIGN_CODE_RE } from "@sellery/db/campaign";
import {
  parseBeginSampleResult,
  parseConfirmSampleResult,
  parsePartnerPaymentView,
  parseSimplePaymentResult,
  partnerPayFailMessage,
  type BeginSampleResult,
  type ConfirmSampleFnResult,
  type PartnerPaymentView,
} from "@sellery/db/partner/sample-rules";
import { createAdminClient, type Admin } from "@sellery/db/server/admin";
import type { Shipping } from "@sellery/db/types";
import { generateOrderId, isPartnerOrderId } from "../money";
import { TOSS_KEY_RE, cancelReasonFor, logPaymentEvent, type EventSource } from "./checkout-sync.server";
import { isTossError, isUncertain, tossCancel, tossConfirm, tossGetPayment, type TossPayment, type TossResult } from "./toss.server";

/** partner_payments 에서 라우트가 읽는 열 (배송지·토스 원문 제외 — partner_payment_brief() 와 같은 집합) */
export const PARTNER_PAYMENT_COLS =
  "id,status,kind,seller_id,user_id,product_id,campaign_id,toss_order_id,payment_key,order_name," +
  "amount_total,amount_cel,amount_cash,cel_won,use_cel,payment_method,approved_at,fail_code,fail_message,expires_at,created_at,updated_at";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** app_partner_payment_confirm 이 ok:false 로 돌려주면 돈이 잡힌 뒤일 수 있어 반드시 취소해야 하는 코드 (0012 주석) */
const CANCEL_ON_CODES = new Set([
  "PAYMENT_MISMATCH",
  "VIRTUAL_ACCOUNT_NOT_SUPPORTED",
  "NOT_LISTED",
  "LOCKED",
  "ALREADY_ACTIVE",
  "CEL_INSUFFICIENT",
  "NOT_CONFIRMABLE",
  "PAYMENT_KEY_CONFLICT",
  "NOT_FOUND",
]);

/* ------------------------------------------------------------ 조회 ------------------------------------------------------------ */

/** seller_id 필터 — 없는 id · 남의 결제 · 형식 오류 전부 null (라우트는 404, 정보 미노출) */
export async function getSamplePayment(sellerId: string, paymentId: string, admin: Admin = createAdminClient()): Promise<PartnerPaymentView | null> {
  if (!UUID_RE.test(paymentId)) return null;
  const { data, error } = await admin.from("partner_payments").select(PARTNER_PAYMENT_COLS).eq("id", paymentId).eq("seller_id", sellerId).maybeSingle();
  if (error) {
    console.error("[partner-sample] payment read failed:", error.message);
    return null;
  }
  return parsePartnerPaymentView(data);
}

/** /pay/success?orderId=… — 토스가 돌려준 orderId 로 (seller_id 필터) */
export async function getSamplePaymentByOrderId(sellerId: string, orderId: string, admin: Admin = createAdminClient()): Promise<PartnerPaymentView | null> {
  if (!isPartnerOrderId(orderId)) return null;
  const { data, error } = await admin.from("partner_payments").select(PARTNER_PAYMENT_COLS).eq("toss_order_id", orderId).eq("seller_id", sellerId).maybeSingle();
  if (error) {
    console.error("[partner-sample] payment read failed:", error.message);
    return null;
  }
  return parsePartnerPaymentView(data);
}

async function readPayment(admin: Admin, paymentId: string): Promise<PartnerPaymentView | null> {
  const { data, error } = await admin.from("partner_payments").select(PARTNER_PAYMENT_COLS).eq("id", paymentId).maybeSingle();
  if (error) {
    console.error("[partner-sample] payment reread failed:", error.message);
    return null;
  }
  return parsePartnerPaymentView(data);
}

/* ------------------------------------------------------------ RPC 래퍼 ------------------------------------------------------------ */

async function rpcConfirm(admin: Admin, p: PartnerPaymentView, toss: TossPayment | null, amountCash: number): Promise<ConfirmSampleFnResult> {
  const { data, error } = await admin.rpc("app_partner_payment_confirm", {
    p_payment_id: p.id,
    p_seller_id: p.seller_id ?? "",
    p_toss: (toss as unknown as Json) ?? null,
    p_amount_cash: amountCash,
  });
  if (error) throw new Error(error.message);
  return parseConfirmSampleResult(data);
}

/** FAILED(code) — CONFIRMED/REFUNDED 는 함수가 덮지 않는다. 실패해도 흐름을 막지 않는다(false). */
async function failPayment(admin: Admin, paymentId: string, code: string, message?: string | null, raw?: unknown): Promise<boolean> {
  const { data, error } = await admin.rpc("app_partner_payment_fail", {
    p_payment_id: paymentId,
    p_code: code,
    p_message: message ?? partnerPayFailMessage(code),
    p_raw: raw === undefined ? undefined : (raw as Json),
  });
  if (error) {
    console.error("[partner-sample] app_partner_payment_fail failed:", error.message);
    return false;
  }
  const r = parseSimplePaymentResult(data);
  return r.ok && !r.already;
}

/**
 * 돈이 잡힌 뒤 확정할 수 없을 때: 토스 전액 취소 → FAILED(code). 취소 실패 → FAILED(CANCEL_PENDING, fail_message=원래 code) + payment_events handled=false.
 * Idempotency-Key = payment.id (재시도도 같은 키·같은 본문 — checkout-sync cancelAndFail 과 동일 규칙).
 */
async function cancelAndFailPartner(
  admin: Admin,
  p: PartnerPaymentView,
  paymentKey: string,
  code: string,
  opts: { source: EventSource; message?: string | null },
): Promise<{ canceled: boolean; cancel: TossResult }> {
  const cancel = await tossCancel(paymentKey, cancelReasonFor(code), { idempotencyKey: p.id });
  const already = !cancel.ok && isTossError(cancel.body) && cancel.body.code === "ALREADY_CANCELED_PAYMENT";
  if (cancel.ok || already) {
    await failPayment(admin, p.id, code, opts.message ?? partnerPayFailMessage(code), cancel.body);
    await logPaymentEvent(admin, {
      source: opts.source,
      event_type: "auto_cancel",
      toss_order_id: p.toss_order_id,
      payment_key: paymentKey,
      payload: { code, cancel: cancel.body, partner_payment_id: p.id },
      handled: true,
      result: "refunded_orphan",
    });
    return { canceled: true, cancel };
  }
  await failPayment(admin, p.id, "CANCEL_PENDING", code, cancel.body);
  await logPaymentEvent(admin, {
    source: opts.source,
    event_type: "auto_cancel",
    toss_order_id: p.toss_order_id,
    payment_key: paymentKey,
    payload: { code, cancel: cancel.body, status: cancel.status, partner_payment_id: p.id },
    handled: false,
    result: "error: cancel failed",
  });
  return { canceled: false, cancel };
}

/** FAILED(CANCEL_PENDING) 재시도 — 같은 Idempotency-Key(payment.id) · 같은 본문(원래 code 는 fail_message). 성공하면 FAILED(원래 code) 로 종결. */
async function retryCancelPendingPartner(admin: Admin, p: PartnerPaymentView, paymentKey: string, source: EventSource): Promise<{ canceled: boolean; originalCode: string }> {
  const originalCode = (p.fail_code === "CANCEL_PENDING" && p.fail_message) || "CANCELED";
  const cancel = await tossCancel(paymentKey, cancelReasonFor(originalCode), { idempotencyKey: p.id });
  const already = !cancel.ok && isTossError(cancel.body) && cancel.body.code === "ALREADY_CANCELED_PAYMENT";
  if (cancel.ok || already) {
    await failPayment(admin, p.id, originalCode, `${partnerPayFailMessage(originalCode)} (결제 취소 완료)`, cancel.body);
    return { canceled: true, originalCode };
  }
  await logPaymentEvent(admin, {
    source,
    event_type: "auto_cancel_retry",
    toss_order_id: p.toss_order_id,
    payment_key: paymentKey,
    payload: { code: originalCode, cancel: cancel.body, status: cancel.status, partner_payment_id: p.id },
    handled: false,
    result: "error: cancel failed",
  });
  return { canceled: false, originalCode };
}

/* ------------------------------------------------------------ 선점 ------------------------------------------------------------ */

/**
 * [샘플 구매] → PENDING 행. 배송지는 호출자가 parseShippingInput 으로 검증한 값(함수가 다시 검사). 없는 상품 코드는 UNLISTED.
 * 성공 시 `cashRequired` 로 위젯 렌더 여부를 가른다(§5.5 마지막 단락). NOT_BUYABLE 의 mode 가 'free' 면 무상 요청으로, 'active' 면 캠페인으로 보낸다.
 */
export async function beginSamplePurchase(
  sellerId: string,
  productCode: string,
  useCel: boolean,
  shipping: Shipping,
  opts: { userId?: string | null } = {},
  admin: Admin = createAdminClient(),
): Promise<BeginSampleResult> {
  if (!CAMPAIGN_CODE_RE.test(productCode)) return { ok: false, code: "UNLISTED" };
  const { data: p, error: pErr } = await admin.from("products").select("id").eq("code", productCode).is("deleted_at", null).maybeSingle();
  if (pErr) {
    console.error("[partner-sample] product lookup failed:", pErr.message);
    return { ok: false, code: "DB_ERROR" };
  }
  if (!p) return { ok: false, code: "UNLISTED" };

  const { data, error } = await admin.rpc("app_partner_payment_claim", {
    p_seller_id: sellerId,
    p_product_id: p.id,
    p_use_cel: useCel,
    p_shipping: { ...shipping },
    p_user_id: opts.userId ?? undefined,
    p_order_id: generateOrderId("partner"),
  });
  if (error) {
    console.error("[partner-sample] app_partner_payment_claim failed:", error.message);
    return { ok: false, code: "DB_ERROR" };
  }
  return parseBeginSampleResult(data);
}

/* ------------------------------------------------------------ 확정 ------------------------------------------------------------ */

export type ConfirmSampleOutcome =
  | {
      ok: true;
      /** 멱등 — 성공 페이지 새로고침 · 이중 호출 */
      already: boolean;
      paymentId: string;
      campaignId: string | null;
      campaignCode: string | null;
      orderId: string | null;
      orderCode: string | null;
      amountCel: number;
      amountCash: number;
    }
  | {
      ok: false;
      code: string;
      message: string;
      /** 토스에서 돈이 잡혔다가 전액 취소됐다 (false 면 CANCEL_PENDING 또는 돈이 잡히지 않음) */
      canceled: boolean;
      /** RPC 호출 자체가 실패 — 행은 CONFIRMING 유지, 웹훅·reconcile 이 복구 */
      dbError: boolean;
      /** NOT_BUYABLE·ALREADY_ACTIVE 등에서 이동 대상 */
      campaignCode?: string | null;
    };

function fail(code: string, opts: { message?: string | null; canceled?: boolean; dbError?: boolean; campaignCode?: string | null } = {}): ConfirmSampleOutcome {
  return {
    ok: false,
    code,
    message: partnerPayFailMessage(code, opts.message ?? null),
    canceled: opts.canceled ?? false,
    dbError: opts.dbError ?? false,
    campaignCode: opts.campaignCode ?? null,
  };
}

/** RPC 확정 결과 매핑 — 돈이 잡힌 경로(paymentKey 있음)는 ok:false 를 반드시 취소로 종결한다 */
async function confirmViaRpc(
  admin: Admin,
  p: PartnerPaymentView,
  toss: TossPayment | null,
  paymentKey: string | null,
  amountCash: number,
  source: EventSource,
): Promise<ConfirmSampleOutcome> {
  let r: ConfirmSampleFnResult;
  try {
    r = await rpcConfirm(admin, p, toss, amountCash);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[partner-sample] app_partner_payment_confirm threw:", msg);
    await logPaymentEvent(admin, {
      source,
      event_type: "confirm",
      toss_order_id: p.toss_order_id,
      payment_key: paymentKey,
      payload: { partner_payment_id: p.id, payment: toss, error: msg },
      handled: false,
      result: `error: db ${msg}`.slice(0, 200),
    });
    return fail("CONFIRMING", { dbError: true });
  }
  if (r.ok) {
    if (!r.already) {
      await logPaymentEvent(admin, {
        source,
        event_type: "confirm",
        toss_order_id: p.toss_order_id,
        payment_key: paymentKey,
        payload: { partner_payment_id: p.id, campaign_id: r.campaignId, order_id: r.orderId, amount_cel: r.amountCel, amount_cash: r.amountCash },
        handled: true,
        result: "confirmed",
      });
    }
    return {
      ok: true,
      already: r.already,
      paymentId: r.paymentId,
      campaignId: r.campaignId,
      campaignCode: r.campaignCode,
      orderId: r.orderId,
      orderCode: r.orderCode,
      amountCel: r.amountCel,
      amountCash: r.amountCash,
    };
  }
  if (r.code === "BAD_RESULT") return fail("CONFIRMING", { dbError: true });

  if (paymentKey && toss && toss.status === "DONE" && CANCEL_ON_CODES.has(r.code)) {
    // 돈이 잡힌 뒤 거부 — 전액 취소 (CEL_INSUFFICIENT · ALREADY_ACTIVE · NOT_LISTED …). 실패 뷰 문구와 "원장·캠페인 미생성" 이 일치한다(§5.7).
    const { canceled } = await cancelAndFailPartner(admin, p, paymentKey, r.code, { source, message: r.message });
    return fail(canceled ? r.code : "CANCEL_PENDING", { canceled, campaignCode: r.campaignCode ?? null });
  }
  // 🥬 전액 · 멱등 조회 등 — 돈이 잡히지 않았으므로 취소 없이 FAILED(code) (EXPIRED·AMOUNT_MISMATCH 는 함수가 이미 상태를 정했거나 상태 변경 없음)
  if (!paymentKey && r.code !== "AMOUNT_MISMATCH" && r.code !== "EXPIRED" && r.code !== "NOT_CONFIRMABLE" && r.code !== "NOT_FOUND") {
    await failPayment(admin, p.id, r.code, r.message);
  }
  return fail(r.code, { message: r.message, campaignCode: r.campaignCode ?? null });
}

/**
 * successUrl(현금) 또는 [🥬 n개로 받기](현금 0) 뒤 호출. 검증 순서(고정, §5.5): 입력 형식 → 소유자(seller_id 필터, 불일치도 NOT_FOUND) →
 * orderId 일치 → 멱등(CONFIRMED) → amount === amount_cash(아니면 FAILED AMOUNT_MISMATCH, 토스 미호출) →
 * [현금] app_partner_payment_confirming(선점) → tossConfirm(amount = DB 값) → status DONE → app_partner_payment_confirm → ok:false 면 전액 취소
 * [🥬 전액] app_partner_payment_confirm(p_toss = null) 바로.
 * 토스 불명(status 0/5xx) 은 GET 재조회 1회 → 그래도 불명이면 CONFIRMING 유지(웹훅·reconcile).
 */
export async function confirmSamplePurchase(
  sellerId: string,
  paymentId: string,
  input: { orderId: string; paymentKey: string | null; amountCash: number },
  admin: Admin = createAdminClient(),
): Promise<ConfirmSampleOutcome> {
  if (!UUID_RE.test(paymentId) || !isPartnerOrderId(input.orderId) || !Number.isInteger(input.amountCash) || input.amountCash < 0) {
    return fail("BAD_REQUEST");
  }
  const source: EventSource = "confirm";
  const p = await getSamplePayment(sellerId, paymentId, admin);
  if (!p) return fail("NOT_FOUND");
  if (p.toss_order_id !== input.orderId) return fail("PAYMENT_MISMATCH");

  // 멱등 — 이미 확정된 행은 토스를 다시 부르지 않는다
  if (p.status === "CONFIRMED") return confirmViaRpc(admin, p, null, p.payment_key, p.amount_cash, source);

  if (p.status !== "PENDING" && p.status !== "CONFIRMING") {
    return fail(p.fail_code ?? p.status, { message: p.fail_message });
  }

  if (input.amountCash !== p.amount_cash) {
    // successUrl 금액 변조 — 토스 미호출, FAILED(AMOUNT_MISMATCH)
    await failPayment(admin, p.id, "AMOUNT_MISMATCH", null, { given: input.amountCash, expected: p.amount_cash });
    return fail("AMOUNT_MISMATCH");
  }

  // 🥬 전액 — 위젯 없음
  if (p.amount_cash === 0) return confirmViaRpc(admin, p, null, null, 0, source);

  // 현금 — 선점
  const paymentKey = input.paymentKey;
  if (!paymentKey || !TOSS_KEY_RE.test(paymentKey)) return fail("BAD_REQUEST");
  const { data: claimJson, error: claimErr } = await admin.rpc("app_partner_payment_confirming", {
    p_payment_id: p.id,
    p_seller_id: sellerId,
    p_payment_key: paymentKey,
  });
  if (claimErr) {
    console.error("[partner-sample] app_partner_payment_confirming failed:", claimErr.message);
    return fail("CONFIRMING", { dbError: true });
  }
  const claim = parseSimplePaymentResult(claimJson);
  if (!claim.ok) return fail(claim.code, { message: claim.message });
  if (claim.claimed === false) return confirmViaRpc(admin, p, null, paymentKey, p.amount_cash, source); // 이미 CONFIRMED (경합)

  // 토스 confirm — amount 는 DB 값
  let toss = await tossConfirm({ paymentKey, orderId: p.toss_order_id, amount: p.amount_cash });
  if (!toss.ok || isTossError(toss.body)) {
    if (isUncertain(toss)) {
      // 처리 여부 불명 → 재조회 1회
      const look = await tossGetPayment(paymentKey);
      if (look.ok && !isTossError(look.body)) {
        toss = look;
      } else if (!isUncertain(look)) {
        // 승인 기록 없음 (4xx) — 미승인 확정
        await failPayment(admin, p.id, "NOT_CONFIRMED", null, look.body);
        return fail("NOT_CONFIRMED");
      } else {
        return fail("CONFIRMING"); // CONFIRMING 유지 — 웹훅·reconcile
      }
    } else {
      // 4xx — 토스가 거절 (미승인 확정)
      const err = toss.body as { code: string; message: string };
      await failPayment(admin, p.id, err.code, err.message, err);
      await logPaymentEvent(admin, {
        source,
        event_type: "confirm",
        toss_order_id: p.toss_order_id,
        payment_key: paymentKey,
        payload: { partner_payment_id: p.id, error: err, status: toss.status },
        handled: true,
        result: `failed: ${err.code}`.slice(0, 200),
      });
      return fail(err.code, { message: err.message });
    }
  }
  const payment = toss.body as TossPayment;
  if (payment.status !== "DONE") {
    if (payment.status === "WAITING_FOR_DEPOSIT") {
      const { canceled } = await cancelAndFailPartner(admin, p, paymentKey, "VIRTUAL_ACCOUNT_NOT_SUPPORTED", { source });
      return fail(canceled ? "VIRTUAL_ACCOUNT_NOT_SUPPORTED" : "CANCEL_PENDING", { canceled });
    }
    if (payment.status === "READY" || payment.status === "IN_PROGRESS") return fail("CONFIRMING");
    await failPayment(admin, p.id, payment.status, null, payment);
    return fail(payment.status);
  }
  return confirmViaRpc(admin, p, payment, paymentKey, p.amount_cash, source);
}

/* ------------------------------------------------------------ 취소 (결제 전) · 환불 (운영) ------------------------------------------------------------ */

export type SimpleOutcome = { ok: true; already: boolean; status: string | null } | { ok: false; code: string; message: string };

/** 인플루언서가 결제 화면에서 그만둠 — PENDING · payment_key 없는 CONFIRMING 만. 종결 행은 already:true. */
export async function cancelSamplePurchase(sellerId: string, paymentId: string, reason?: string | null, admin: Admin = createAdminClient()): Promise<SimpleOutcome> {
  if (!UUID_RE.test(paymentId)) return { ok: false, code: "NOT_FOUND", message: partnerPayFailMessage("NOT_FOUND") };
  const { data, error } = await admin.rpc("app_partner_payment_cancel", {
    p_payment_id: paymentId,
    p_seller_id: sellerId,
    p_reason: reason ?? undefined,
  });
  if (error) {
    console.error("[partner-sample] app_partner_payment_cancel failed:", error.message);
    return { ok: false, code: "DB_ERROR", message: partnerPayFailMessage("DB_ERROR") };
  }
  const r = parseSimplePaymentResult(data);
  return r.ok ? { ok: true, already: r.already, status: r.status } : { ok: false, code: r.code, message: partnerPayFailMessage(r.code, r.message) };
}

/** 토스 failUrl code 중 "사용자가 결제창을 닫음" — 돈이 잡히지 않았고 같은 PENDING 행으로 다시 시도할 수 있다 */
export const WIDGET_USER_ABORT_CODES: ReadonlySet<string> = new Set(["PAY_PROCESS_CANCELED", "PAY_PROCESS_ABORTED", "USER_CANCEL"]);

export type WidgetFailureOutcome = {
  /** seller_id 필터를 통과한 결제 행(갱신 뒤 재조회) — 없으면 null */
  payment: PartnerPaymentView | null;
  /** PENDING 을 유지했다(사용자 취소) → /pay/<id> 로 재시도 가능 */
  kept: boolean;
};

/**
 * `/pay/fail` 랜딩 — 위젯 단계 실패는 토스에 승인 기록이 없다(§5.7 첫 줄). 사용자 취소(`WIDGET_USER_ABORT_CODES`)면 PENDING 을 그대로 두고
 * (같은 행으로 재시도 — 다음 begin 이 SUPERSEDED · 크론이 EXPIRED 로 정리), 카드사 거절 등 그 외 code 는 FAILED(code, 토스 message) 로 종결한다.
 * 어느 쪽이든 payment_events(source 'confirm', event_type 'widget_fail', handled=true) 1행. PENDING 이 아닌 행(이미 종결·확정)은 건드리지 않는다.
 * orderId(토스가 failUrl 에 붙임) 우선, 없으면 paymentId(우리 failUrl 쿼리) — 둘 다 seller_id 필터.
 */
export async function recordSampleWidgetFailure(
  sellerId: string,
  key: { orderId?: string | null; paymentId?: string | null },
  failure: { code: string; message?: string | null },
  admin: Admin = createAdminClient(),
): Promise<WidgetFailureOutcome> {
  const p =
    (key.orderId ? await getSamplePaymentByOrderId(sellerId, key.orderId, admin) : null) ??
    (key.paymentId ? await getSamplePayment(sellerId, key.paymentId, admin) : null);
  if (!p) return { payment: null, kept: false };
  if (p.status !== "PENDING") return { payment: p, kept: false };

  const code = failure.code.slice(0, 80) || "PAY_PROCESS_ABORTED";
  const userAbort = WIDGET_USER_ABORT_CODES.has(code);
  if (!userAbort) await failPayment(admin, p.id, code, failure.message ?? null, { widget: true, code, message: failure.message ?? null });
  await logPaymentEvent(admin, {
    source: "confirm",
    event_type: "widget_fail",
    toss_order_id: p.toss_order_id,
    payment_key: null,
    payload: { partner_payment_id: p.id, code, message: failure.message ?? null, kept: userAbort },
    handled: true,
    result: userAbort ? "noop" : `failed: ${code}`.slice(0, 200),
  });
  const fresh = userAbort ? p : ((await readPayment(admin, p.id)) ?? p);
  return { payment: fresh, kept: userAbort };
}

export type RefundSampleOutcome =
  | { ok: true; already: boolean; campaignId: string | null; balance: number | null; tossCanceled: boolean }
  | { ok: false; code: string; message: string; tossCanceled: boolean };

/**
 * 결제 후·브랜드 발송 전 취소 (운영자 스크립트 · 웹훅 CANCELED 동기화). 현금분이 있으면 토스 전액 취소(Idempotency-Key `${id}:refund`) 를 먼저,
 * 성공(또는 이미 취소)해야 app_partner_payment_refund(🥬 복구 · 캠페인 DECLINED · 주문 CANCELED · REFUNDED). 두 번 실행해도 원장 1행.
 * `skipToss` 는 토스 콘솔에서 이미 취소된 경우(웹훅 CANCELED) 에만.
 */
export async function refundSamplePurchase(
  paymentId: string,
  opts: { reason?: string | null; source?: EventSource; skipToss?: boolean; raw?: unknown } = {},
  admin: Admin = createAdminClient(),
): Promise<RefundSampleOutcome> {
  if (!UUID_RE.test(paymentId)) return { ok: false, code: "NOT_FOUND", message: partnerPayFailMessage("NOT_FOUND"), tossCanceled: false };
  const p = await readPayment(admin, paymentId);
  if (!p) return { ok: false, code: "NOT_FOUND", message: partnerPayFailMessage("NOT_FOUND"), tossCanceled: false };
  if (p.status === "REFUNDED") return { ok: true, already: true, campaignId: p.campaign_id, balance: null, tossCanceled: true };
  if (p.status !== "CONFIRMED") return { ok: false, code: "NOT_REFUNDABLE", message: `결제 완료 상태가 아니에요 (${p.status})`, tossCanceled: false };

  const source = opts.source ?? "cancel";
  const reason = (opts.reason ?? "샘플 구매 취소 (브랜드 발송 전)").slice(0, 200);
  let raw: unknown = opts.raw;
  let tossCanceled = false;
  if (p.amount_cash > 0 && p.payment_key && !opts.skipToss) {
    const cancel = await tossCancel(p.payment_key, reason, { idempotencyKey: `${p.id}:refund` });
    const already = !cancel.ok && isTossError(cancel.body) && cancel.body.code === "ALREADY_CANCELED_PAYMENT";
    if (!cancel.ok && !already) {
      const err = isTossError(cancel.body) ? cancel.body : { code: `HTTP_${cancel.status}`, message: "토스 취소 실패" };
      await logPaymentEvent(admin, {
        source,
        event_type: "sample_refund",
        toss_order_id: p.toss_order_id,
        payment_key: p.payment_key,
        payload: { partner_payment_id: p.id, cancel: cancel.body, status: cancel.status },
        handled: false,
        result: "error: cancel failed",
      });
      return { ok: false, code: err.code, message: err.message, tossCanceled: false };
    }
    raw = cancel.body;
    tossCanceled = true;
  } else {
    tossCanceled = p.amount_cash === 0 || !!opts.skipToss;
  }

  const { data, error } = await admin.rpc("app_partner_payment_refund", {
    p_payment_id: p.id,
    p_reason: reason,
    p_raw: raw === undefined ? undefined : (raw as Json),
  });
  if (error) {
    console.error("[partner-sample] app_partner_payment_refund failed:", error.message);
    await logPaymentEvent(admin, {
      source,
      event_type: "sample_refund",
      toss_order_id: p.toss_order_id,
      payment_key: p.payment_key,
      payload: { partner_payment_id: p.id, error: error.message, toss_canceled: tossCanceled },
      handled: false,
      result: "error: db refund failed",
    });
    return { ok: false, code: "DB_ERROR", message: partnerPayFailMessage("DB_ERROR"), tossCanceled };
  }
  const r = parseSimplePaymentResult(data);
  await logPaymentEvent(admin, {
    source,
    event_type: "sample_refund",
    toss_order_id: p.toss_order_id,
    payment_key: p.payment_key,
    payload: { partner_payment_id: p.id, result: data, toss_canceled: tossCanceled },
    handled: r.ok,
    result: r.ok ? (r.already ? "noop" : "refunded") : `needs_manual_adjust: ${r.code}`.slice(0, 200),
  });
  if (!r.ok) return { ok: false, code: r.code, message: r.message ?? `환불 기록 실패 (${r.code})`, tossCanceled };
  return { ok: true, already: r.already, campaignId: r.campaignId ?? p.campaign_id, balance: r.balance ?? null, tossCanceled };
}

/* ------------------------------------------------------------ 웹훅 · reconcile ------------------------------------------------------------ */

/**
 * 웹훅 매칭 — orderId 가 `slrp_` 면 toss_order_id 로, 아니면(또는 없으면) paymentKey 로. 둘 다 아니면 null (호출자는 고객 세션·주문 조회로).
 * money.ts 주석의 매칭 순서: 세션(orderId) → 세션(paymentKey) → 주문(paymentKey) → **partner_payments(paymentKey)**. orderId 접두는 그보다 먼저 가른다.
 */
export async function findPartnerPaymentForWebhook(admin: Admin, key: { orderId: string | null; paymentKey: string | null }): Promise<PartnerPaymentView | null> {
  if (key.orderId && isPartnerOrderId(key.orderId)) {
    const { data, error } = await admin.from("partner_payments").select(PARTNER_PAYMENT_COLS).eq("toss_order_id", key.orderId).maybeSingle();
    if (error) console.error("[partner-sample] webhook lookup failed:", error.message);
    return parsePartnerPaymentView(data);
  }
  if (key.paymentKey) {
    const { data, error } = await admin.from("partner_payments").select(PARTNER_PAYMENT_COLS).eq("payment_key", key.paymentKey).maybeSingle();
    if (error) console.error("[partner-sample] webhook lookup failed:", error.message);
    return parsePartnerPaymentView(data);
  }
  return null;
}

/**
 * 재조회한 토스 payment 로 partner_payments 를 동기화 — checkout-sync syncFromPayment 의 파트너판 (§5.6 · §5.7 표).
 * 반환 result 는 payment_events.result 어휘, handled=false 는 운영 큐.
 */
export async function syncPartnerFromPayment(
  admin: Admin,
  p: PartnerPaymentView,
  payment: TossPayment,
  source: EventSource,
): Promise<{ result: string; handled: boolean }> {
  const st = payment.status;
  const paymentKey = payment.paymentKey;
  if (payment.orderId !== p.toss_order_id) return { result: "error: orderId mismatch", handled: false };

  if (p.status === "PENDING" || p.status === "CONFIRMING") {
    if (st === "DONE") {
      if (Number(payment.totalAmount) !== p.amount_cash) {
        // 승인 금액이 행과 다르다 — 확정 불가, 전액 취소
        const { canceled } = await cancelAndFailPartner(admin, p, paymentKey, "PAYMENT_MISMATCH", { source });
        return canceled ? { result: "refunded_orphan", handled: true } : { result: "error: cancel failed", handled: false };
      }
      // 라우트 사망 복구 — confirming 선점 없이 바로 확정(함수가 payment_key 를 기록)
      const r = await confirmViaRpc(admin, p, payment, paymentKey, p.amount_cash, source);
      if (r.ok) return { result: r.already ? "noop" : "confirmed_recovered", handled: true };
      if (r.dbError) return { result: `error: ${r.code}`, handled: false };
      return r.canceled ? { result: "refunded_orphan", handled: true } : { result: "error: cancel failed", handled: false };
    }
    if (st === "WAITING_FOR_DEPOSIT" || st === "PARTIAL_CANCELED") {
      const code = st === "WAITING_FOR_DEPOSIT" ? "VIRTUAL_ACCOUNT_NOT_SUPPORTED" : "PARTIAL_CANCELED";
      const { canceled } = await cancelAndFailPartner(admin, p, paymentKey, code, { source });
      return canceled ? { result: "refunded_orphan", handled: true } : { result: "error: cancel failed", handled: false };
    }
    if (st === "CANCELED" || st === "EXPIRED" || st === "ABORTED") {
      await failPayment(admin, p.id, st, null, payment);
      return { result: `failed: ${st}`, handled: true };
    }
    return { result: "noop", handled: true }; // READY / IN_PROGRESS
  }

  if (p.status === "CONFIRMED") {
    if (st === "DONE") return { result: "noop", handled: true };
    if (st === "CANCELED") {
      // 토스 콘솔에서 취소됨 — 캠페인이 아직 SAMPLE_PURCHASED 면 DB 도 환불 처리, 발송 뒤면 수동 조정
      const r = await refundSamplePurchase(p.id, { reason: "토스 콘솔 취소", source, skipToss: true, raw: payment }, admin);
      if (r.ok) return { result: r.already ? "noop" : "refunded", handled: true };
      return { result: `needs_manual_adjust: ${r.code}`.slice(0, 200), handled: false };
    }
    if (st === "PARTIAL_CANCELED") return { result: "partial_cancel_manual", handled: false };
    return { result: "noop", handled: true };
  }

  if (p.status === "REFUNDED") return { result: "noop", handled: true };

  // FAILED / CANCELED / EXPIRED — 종결됐는데 돈이 잡혀 있으면 취소로 종결(§0 결정 5-1)
  if (p.fail_code === "CANCEL_PENDING") {
    if (st === "DONE" || st === "WAITING_FOR_DEPOSIT" || st === "PARTIAL_CANCELED") {
      const { canceled } = await retryCancelPendingPartner(admin, p, paymentKey, source);
      return canceled ? { result: "cancel_confirmed", handled: true } : { result: "error: cancel failed", handled: false };
    }
    // CANCELED · READY · IN_PROGRESS · ABORTED · EXPIRED — 잡힌 돈 없음/이미 취소 → 원래 code 로 종결
    await failPayment(admin, p.id, p.fail_message || "CANCELED", `${partnerPayFailMessage(p.fail_message || "CANCELED")} (결제 취소 완료)`, payment);
    return { result: "cancel_confirmed", handled: true };
  }
  if (st === "DONE" || st === "WAITING_FOR_DEPOSIT" || st === "PARTIAL_CANCELED") {
    const { canceled } = await cancelAndFailPartner(admin, p, paymentKey, p.fail_code ?? p.status, { source, message: p.fail_message });
    return canceled ? { result: "refunded_orphan", handled: true } : { result: "error: cancel failed", handled: false };
  }
  return { result: "noop", handled: true };
}

/** app_partner_payments_expire — PENDING(+ payment_key 없는 CONFIRMING) 만료 → EXPIRED. 반환 건수(오류면 0 + 로그). */
export async function expirePartnerPayments(admin: Admin = createAdminClient(), grace = "0"): Promise<number> {
  const { data, error } = await admin.rpc("app_partner_payments_expire", { p_grace: grace });
  if (error) {
    console.error("[partner-sample] app_partner_payments_expire failed:", error.message);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

/** app_partner_payments_stale — payment_key 있는 CONFIRMING(고착) + FAILED(CANCEL_PENDING) */
export async function listStalePartnerPayments(admin: Admin = createAdminClient(), age = "2 minutes", limit = 50): Promise<PartnerPaymentView[]> {
  const { data, error } = await admin.rpc("app_partner_payments_stale", { p_age: age, p_limit: limit });
  if (error) {
    console.error("[partner-sample] app_partner_payments_stale failed:", error.message);
    return [];
  }
  return (Array.isArray(data) ? data : []).map(parsePartnerPaymentView).filter((p): p is PartnerPaymentView => p !== null);
}

/**
 * reconcile 1건 — 행을 다시 읽고(그 사이 종결됐을 수 있다) GET /v1/payments/{paymentKey} 재조회 → syncPartnerFromPayment.
 * CONFIRMING 에서 승인 기록이 없으면(READY/IN_PROGRESS/ABORTED/EXPIRED · 4xx) FAILED. 결과는 payment_events(event_type 'reconcile').
 */
export async function reconcilePartnerPayment(admin: Admin, stale: PartnerPaymentView): Promise<string> {
  const p = await readPayment(admin, stale.id);
  if (!p) return "skipped: gone";
  if (!p.payment_key) return "skipped: no payment_key";
  const isCancelPending = p.status === "FAILED" && p.fail_code === "CANCEL_PENDING";
  if (p.status !== "CONFIRMING" && !isCancelPending) return `skipped: already ${p.status}`;
  const source: EventSource = isCancelPending ? "cancel" : "confirm";

  const look = await tossGetPayment(p.payment_key);
  let result: string;
  if (look.ok && !isTossError(look.body)) {
    const st = look.body.status;
    if (p.status === "CONFIRMING" && (st === "READY" || st === "IN_PROGRESS" || st === "ABORTED" || st === "EXPIRED")) {
      await failPayment(admin, p.id, st === "READY" || st === "IN_PROGRESS" ? "NOT_CONFIRMED" : st, null, look.body);
      result = `failed: ${st}`;
    } else {
      result = (await syncPartnerFromPayment(admin, p, look.body, source)).result;
    }
  } else if (isUncertain(look)) {
    return "skipped: lookup failed";
  } else if (isCancelPending) {
    await failPayment(admin, p.id, p.fail_message || "CANCELED", `${partnerPayFailMessage(p.fail_message || "CANCELED")} (결제 취소 완료)`, look.body);
    result = "cancel_confirmed";
  } else {
    await failPayment(admin, p.id, "NOT_CONFIRMED", null, look.body);
    result = "failed: NOT_CONFIRMED";
  }

  await logPaymentEvent(admin, {
    source,
    event_type: "reconcile",
    toss_order_id: p.toss_order_id,
    payment_key: p.payment_key,
    payload: { partner_payment: { id: p.id, status: p.status, fail_code: p.fail_code }, lookup: look.body },
    handled: !result.startsWith("error"),
    result,
  });
  return result;
}
