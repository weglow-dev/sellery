import "server-only";

/**
 * 결제 세션 ↔ 토스 상태 동기화 — /api/payments/{confirm,webhook} · /api/cron/reconcile 의 공용 서버 로직. 소유: E.
 * (app-plan §10.1 E 행에 없는 새 파일 — 세 라우트가 같은 분기표(§7.2·§7.3·§7.5)를 쓰므로 한 곳에 둔다.)
 *
 * 원칙(app-plan §0 결정 5·5-1):
 *   - 상태 변경은 DB 함수(app_claim_checkout / app_confirm_checkout / app_refund_record) 또는 `.in('status', 기대값)` 조건부 update 로만.
 *   - 돈이 토스에서 움직인 뒤(DONE·CANCELED)의 기록은 현실을 거부하지 않는다. app_confirm_checkout 이 ok:false 를 주면
 *     반드시 토스 전액 취소 → FAILED(code). 취소 실패 → FAILED(CANCEL_PENDING, fail_message=원래 code) + payment_events handled=false.
 *   - 각 코드 경로에 "DB 함수 반환 {ok, code} → 어떻게 매핑하는지" 를 주석으로 남긴다.
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import {
  isTossError,
  tossCancel,
  tossCanceledTotal,
  type TossPayment,
  type TossResult,
} from "@/lib/toss";

export type Admin = SupabaseClient<Database>;

/** 토스 paymentKey / orderId 입력 형식 (app-plan §6.2) */
export const TOSS_KEY_RE = /^[A-Za-z0-9_-]{6,200}$/;

/** payment_events.source */
export type EventSource = "webhook" | "deposit_callback" | "confirm" | "cancel";

// ------------------------------------------------------------
// 응답 규약 §6.3 — 실패 본문은 항상 { ok:false, code, message }
// ------------------------------------------------------------

/** 세션 fail_code 와 같은 어휘의 사용자 문구 (§6.3 표의 서버측 기본값 — 성공 페이지가 code 로 다시 매핑한다) */
export const FAIL_MESSAGES: Record<string, string> = {
  NOT_LIVE: "현재 판매 중이 아닙니다",
  SOLD_OUT: "남은 수량이 부족합니다",
  AMOUNT_MISMATCH: "결제 금액이 주문과 달라 승인하지 않았어요",
  PAYMENT_MISMATCH: "결제 정보가 주문과 달라 승인하지 않았어요",
  EXPIRED: "결제 시간이 만료되었습니다",
  VIRTUAL_ACCOUNT_NOT_SUPPORTED: "가상계좌·계좌이체는 지원하지 않아요 — 카드·간편결제로 다시 시도해주세요",
  CANCEL_PENDING: "주문을 완료하지 못했고 결제 취소를 처리 중이에요 — 잠시 후 내 주문 또는 카드사 내역을 확인해주세요",
  CONFIRMING: "결제를 확인하고 있어요 — 잠시 후 내 주문에서 확인해주세요",
  PAYMENT_KEY_CONFLICT: "결제 정보가 다른 주문과 겹쳐 승인하지 않았어요",
  NOT_FOUND: "주문을 찾을 수 없습니다",
  UNAUTHORIZED: "로그인이 필요합니다",
  FORBIDDEN: "본인의 주문만 처리할 수 있습니다",
  BAD_REQUEST: "요청 형식이 올바르지 않습니다",
  SETTLED: "정산이 끝난 주문은 브랜드 고객 문의로 접수해주세요",
  SHIPPED: "발송된 주문은 고객센터로 접수해주세요",
  SAMPLE: "인플루언서 샘플 구매분은 브랜드 정산에 포함된 건이라 여기서 환불하지 않습니다",
  NOT_CONFIRMED: "결제가 승인되지 않았습니다",
  CANCELED: "결제가 취소되었습니다",
  PARTIAL_CANCELED: "결제가 일부 취소된 상태라 주문을 완료하지 못했어요 — 남은 금액은 자동 취소됩니다",
  ABORTED: "결제가 중단되었습니다",
  SUPERSEDED: "새 결제 시도로 대체되었습니다",
  BAD_ORIGIN: "요청 출처가 올바르지 않습니다",
};

export function failMessage(code: string, fallback?: string | null): string {
  return fallback || FAIL_MESSAGES[code] || "결제 확인에 실패했어요";
}

export function apiError(status: number, code: string, message?: string | null): NextResponse {
  return NextResponse.json({ ok: false, code, message: failMessage(code, message) }, { status });
}

/**
 * 상태 변경 API(/api/checkout · /api/payments/*) 의 CSRF 가드 — Supabase 세션 쿠키의 SameSite=Lax 에만 기대지 않는다.
 *   - `Sec-Fetch-Site` 가 있으면 `same-origin`(또는 `none`) 이어야 한다 (cross-site 폼 제출은 `cross-site`).
 *   - `Content-Type` 은 `application/json` 으로 시작해야 한다 (`enctype=text/plain` 폼으로 만든 JSON 모양 본문 차단).
 * 통과하면 null, 아니면 403 BAD_ORIGIN 응답.
 */
export function rejectCrossSite(request: Request): NextResponse | null {
  const site = (request.headers.get("sec-fetch-site") ?? "").toLowerCase();
  if (site && site !== "same-origin" && site !== "none") return apiError(403, "BAD_ORIGIN");
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) return apiError(403, "BAD_ORIGIN");
  return null;
}

// ------------------------------------------------------------
// DB 함수 반환 파싱 (jsonb → 좁힌 타입). 형식이 어긋나면 ok:false BAD_RESULT — 절대 성공으로 읽지 않는다.
// ------------------------------------------------------------

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function str(o: Record<string, unknown>, k: string): string | null {
  const v = o[k];
  return typeof v === "string" ? v : null;
}
function num(o: Record<string, unknown>, k: string): number | null {
  const v = o[k];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** checkout_session_brief() / SESSION_LITE_COLS select 결과 — PII 없음 */
export type SessionLite = {
  id: string;
  status: string;
  amount: number;
  qty: number;
  campaign_id: string;
  user_id: string | null;
  toss_order_id: string;
  payment_key: string | null;
  fail_code: string | null;
  fail_message: string | null;
};

export const SESSION_LITE_COLS =
  "id, status, amount, qty, campaign_id, user_id, toss_order_id, payment_key, fail_code, fail_message";

export function parseSessionLite(json: unknown): SessionLite | null {
  const o = obj(json);
  if (!o) return null;
  const id = str(o, "id");
  const status = str(o, "status");
  const amount = num(o, "amount");
  const qty = num(o, "qty");
  const campaign_id = str(o, "campaign_id");
  const toss_order_id = str(o, "toss_order_id");
  if (!id || !status || amount === null || qty === null || !campaign_id || !toss_order_id) return null;
  return {
    id,
    status,
    amount,
    qty,
    campaign_id,
    user_id: str(o, "user_id"),
    toss_order_id,
    payment_key: str(o, "payment_key"),
    fail_code: str(o, "fail_code"),
    fail_message: str(o, "fail_message"),
  };
}

/** app_claim_checkout 반환 (0008 주석) */
export type ClaimResult =
  | { ok: true; claimed: boolean; session: SessionLite }
  | { ok: false; code: string; message: string | null };

export function parseClaimResult(json: unknown): ClaimResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "BAD_RESULT", message: null };
  if (o.ok === true) {
    const session = parseSessionLite(o.session);
    if (!session) return { ok: false, code: "BAD_RESULT", message: null };
    return { ok: true, claimed: o.claimed === true, session };
  }
  return { ok: false, code: str(o, "code") ?? "BAD_RESULT", message: str(o, "message") };
}

/** app_confirm_checkout 반환 (0008 주석) */
export type ConfirmFnResult =
  | { ok: true; already: boolean; order_id: string; order_code: string }
  | { ok: false; code: string; message: string | null; left: number | null };

export function parseConfirmResult(json: unknown): ConfirmFnResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "BAD_RESULT", message: null, left: null };
  if (o.ok === true) {
    const order_id = str(o, "order_id");
    const order_code = str(o, "order_code");
    if (!order_id || !order_code) return { ok: false, code: "BAD_RESULT", message: null, left: null };
    return { ok: true, already: o.already === true, order_id, order_code };
  }
  return { ok: false, code: str(o, "code") ?? "BAD_RESULT", message: str(o, "message"), left: num(o, "left") };
}

/** app_refund_precheck 반환 */
export type PrecheckResult =
  | { ok: true; order_code: string; amount: number; payment_key: string | null; campaign_status: string | null }
  | { ok: false; code: string };

export function parsePrecheckResult(json: unknown): PrecheckResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "BAD_RESULT" };
  if (o.ok === true) {
    const order_code = str(o, "order_code");
    const amount = num(o, "amount");
    if (!order_code || amount === null) return { ok: false, code: "BAD_RESULT" };
    return {
      ok: true,
      order_code,
      amount,
      payment_key: str(o, "payment_key"),
      campaign_status: str(o, "campaign_status"),
    };
  }
  return { ok: false, code: str(o, "code") ?? "BAD_RESULT" };
}

/** app_refund_record 반환 */
export type RefundRecordResult =
  | {
      ok: true;
      already: boolean;
      order_code: string;
      amount: number | null;
      status: string | null;
      adjust: boolean;
      after_ship: boolean;
      partial: boolean;
    }
  | { ok: false; code: string };

export function parseRefundRecordResult(json: unknown): RefundRecordResult {
  const o = obj(json);
  if (!o) return { ok: false, code: "BAD_RESULT" };
  if (o.ok === true) {
    const order_code = str(o, "order_code");
    if (!order_code) return { ok: false, code: "BAD_RESULT" };
    return {
      ok: true,
      already: o.already === true,
      order_code,
      amount: num(o, "amount"),
      status: str(o, "status"),
      adjust: o.adjust === true,
      after_ship: o.after_ship === true,
      partial: o.partial === true,
    };
  }
  return { ok: false, code: str(o, "code") ?? "BAD_RESULT" };
}

// ------------------------------------------------------------
// payment_events — 감사 로그 (best-effort: 실패해도 결제 흐름을 막지 않는다)
// ------------------------------------------------------------

export async function logPaymentEvent(
  admin: Admin,
  ev: {
    source: EventSource;
    event_type?: string | null;
    toss_order_id?: string | null;
    payment_key?: string | null;
    payload: unknown;
    handled?: boolean;
    result?: string | null;
  },
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from("payment_events")
      .insert({
        source: ev.source,
        event_type: ev.event_type ?? null,
        toss_order_id: ev.toss_order_id ?? null,
        payment_key: ev.payment_key ?? null,
        payload: (ev.payload ?? {}) as Json,
        handled: ev.handled ?? false,
        result: ev.result ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[payment_events] insert failed:", error.message);
      return null;
    }
    return data.id;
  } catch (e) {
    console.error("[payment_events] insert threw:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function markPaymentEvent(
  admin: Admin,
  id: string | null,
  patch: { handled: boolean; result: string },
): Promise<void> {
  if (!id) return;
  const { error } = await admin.from("payment_events").update(patch).eq("id", id);
  if (error) console.error("[payment_events] update failed:", error.message);
}

// ------------------------------------------------------------
// 세션 상태 전이 (조건부 update — 경합 방어는 update 조건에 다시 건다)
// ------------------------------------------------------------

/**
 * 세션 → FAILED(code). `from` 에 없는 상태면 0행(=false) — CONFIRMED 는 절대 덮지 않는다.
 * raw 가 있으면 raw_payment 에 원문 저장(토스 실패 응답도 기록 — §6.3).
 */
export async function failSession(
  admin: Admin,
  sessionId: string,
  fail: { code: string; message?: string | null; raw?: unknown },
  from: string[] = ["PENDING", "CONFIRMING"],
): Promise<boolean> {
  const patch: Database["public"]["Tables"]["checkout_sessions"]["Update"] = {
    status: "FAILED",
    fail_code: fail.code,
    fail_message: failMessage(fail.code, fail.message),
  };
  if (fail.raw !== undefined) patch.raw_payment = fail.raw as Json;
  const { data, error } = await admin
    .from("checkout_sessions")
    .update(patch)
    .eq("id", sessionId)
    .in("status", from)
    .select("id");
  if (error) {
    console.error("[checkout-sync] failSession failed:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * FAILED(CANCEL_PENDING) 세션의 취소가 확정됐을 때: fail_code = fail_message(원래 code) 로 되돌린다 (§7.3·§7.5).
 */
export async function resolveCancelPending(admin: Admin, session: SessionLite, raw?: unknown): Promise<boolean> {
  // cancelAndFail 이 fail_message 에 원래 code 를 그대로 넣어 둔다(예: 'SOLD_OUT').
  const original = session.fail_message || "CANCELED";
  const patch: Database["public"]["Tables"]["checkout_sessions"]["Update"] = {
    fail_code: original,
    fail_message: `${failMessage(original)} (결제 취소 완료)`,
  };
  if (raw !== undefined) patch.raw_payment = raw as Json;
  const { data, error } = await admin
    .from("checkout_sessions")
    .update(patch)
    .eq("id", session.id)
    .eq("status", "FAILED")
    .eq("fail_code", "CANCEL_PENDING")
    .select("id");
  if (error) {
    console.error("[checkout-sync] resolveCancelPending failed:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * 자동 취소 cancelReason — **code 만으로 결정**된다. 첫 취소와 CANCEL_PENDING 재시도(웹훅·reconcile·confirm 재선점)가
 * 같은 Idempotency-Key(session.id) 를 쓰므로 본문도 같아야 한다(토스는 같은 키에 다른 본문을 거부할 수 있다).
 */
export function cancelReasonFor(code: string): string {
  if (code === "VIRTUAL_ACCOUNT_NOT_SUPPORTED") return "가상계좌 미지원";
  return `주문 미완료 자동 취소 (${code})`.slice(0, 200);
}

/**
 * 돈이 잡힌 뒤 주문을 만들 수 없을 때: 토스 전액 취소 → 세션 FAILED(code).
 *   - 취소 성공(또는 ALREADY_CANCELED_PAYMENT = 이미 취소됨) → FAILED(code) + payment_events result='refunded_orphan' → canceled:true
 *   - 취소 실패(4xx 기타·5xx·네트워크) → FAILED(CANCEL_PENDING, fail_message=원래 code) + payment_events(handled=false,
 *     result='error: cancel failed') → canceled:false. reconcile 잡(§7.5)이 같은 Idempotency-Key(session.id)·같은 본문으로 재시도.
 * cancelAmount 를 넣지 않으므로 PARTIAL_CANCELED(콘솔 부분취소 뒤) 결제도 남은 잔액 전부가 취소된다.
 * CONFIRMED 세션은 건드리지 않는다(update 조건).
 */
export async function cancelAndFail(
  admin: Admin,
  session: SessionLite,
  paymentKey: string,
  code: string,
  opts: { source: EventSource; message?: string | null },
): Promise<{ canceled: boolean; cancel: TossResult }> {
  const cancel = await tossCancel(paymentKey, cancelReasonFor(code), { idempotencyKey: session.id });
  const alreadyCanceled =
    !cancel.ok && isTossError(cancel.body) && cancel.body.code === "ALREADY_CANCELED_PAYMENT";

  if (cancel.ok || alreadyCanceled) {
    await failSession(
      admin,
      session.id,
      { code, message: opts.message, raw: cancel.body },
      ["PENDING", "CONFIRMING", "FAILED", "EXPIRED"],
    );
    await logPaymentEvent(admin, {
      source: opts.source,
      event_type: "auto_cancel",
      toss_order_id: session.toss_order_id,
      payment_key: paymentKey,
      payload: { code, cancel: cancel.body },
      handled: true,
      result: "refunded_orphan",
    });
    return { canceled: true, cancel };
  }

  // 취소 실패 — 돈은 토스에 잡혀 있다. FAILED(CANCEL_PENDING) 로 표시하고 운영 큐(handled=false)에 남긴다.
  await failSession(
    admin,
    session.id,
    { code: "CANCEL_PENDING", message: code, raw: cancel.body },
    ["PENDING", "CONFIRMING", "FAILED", "EXPIRED"],
  );
  await logPaymentEvent(admin, {
    source: opts.source,
    event_type: "auto_cancel",
    toss_order_id: session.toss_order_id,
    payment_key: paymentKey,
    payload: { code, cancel: cancel.body, status: cancel.status },
    handled: false,
    result: "error: cancel failed",
  });
  return { canceled: false, cancel };
}

/**
 * FAILED(CANCEL_PENDING) 세션의 취소 재시도 — 첫 취소와 **같은 Idempotency-Key(session.id)·같은 본문**(cancelReasonFor(원래 code)).
 * 원래 code 는 fail_message 에 있다(cancelAndFail 이 넣어 둔다); 넘어온 세션에 없으면 행을 다시 읽는다.
 *   성공 또는 ALREADY_CANCELED_PAYMENT → fail_code = 원래 code (resolveCancelPending) → canceled:true
 *   실패 → payment_events(auto_cancel_retry, handled=false) → canceled:false (다음 웹훅·reconcile 이 다시)
 */
export async function retryCancelPending(
  admin: Admin,
  session: SessionLite,
  paymentKey: string,
  source: EventSource,
): Promise<{ canceled: boolean; originalCode: string }> {
  let s = session;
  if (s.fail_code !== "CANCEL_PENDING" || !s.fail_message) {
    const { data } = await admin
      .from("checkout_sessions")
      .select(SESSION_LITE_COLS)
      .eq("id", session.id)
      .maybeSingle();
    if (data) s = data as SessionLite;
  }
  const originalCode = (s.fail_code === "CANCEL_PENDING" && s.fail_message) || "CANCELED";
  const cancel = await tossCancel(paymentKey, cancelReasonFor(originalCode), { idempotencyKey: session.id });
  const already = !cancel.ok && isTossError(cancel.body) && cancel.body.code === "ALREADY_CANCELED_PAYMENT";
  if (cancel.ok || already) {
    await resolveCancelPending(admin, s, cancel.body);
    return { canceled: true, originalCode };
  }
  await logPaymentEvent(admin, {
    source,
    event_type: "auto_cancel_retry",
    toss_order_id: session.toss_order_id,
    payment_key: paymentKey,
    payload: { code: originalCode, cancel: cancel.body, status: cancel.status },
    handled: false,
    result: "error: cancel failed",
  });
  return { canceled: false, originalCode };
}

/** app_confirm_checkout 이 ok:false 로 돌려주면 돈이 잡힌 뒤이므로 반드시 취소해야 하는 코드 (0008 주석) */
const CANCEL_ON_CODES = new Set(["PAYMENT_MISMATCH", "VIRTUAL_ACCOUNT_NOT_SUPPORTED", "NOT_LIVE", "SOLD_OUT"]);

export type ConfirmOutcome =
  /** recovered: 종결됐던 세션을 recover=true 로 살려 주문을 만들었다 (payment_events 'confirmed_recovered') */
  | { ok: true; already: boolean; recovered: boolean; orderId: string; orderCode: string }
  /** dbError: 함수 호출 자체가 실패(세션 CONFIRMING 유지, payment_key 있음 — 웹훅·reconcile 이 복구) */
  | { ok: false; code: string; message: string; canceled: boolean; dbError: boolean };

async function callConfirmFn(
  admin: Admin,
  session: SessionLite,
  paymentKey: string,
  payment: TossPayment,
  recover: boolean,
): Promise<ConfirmFnResult> {
  const { data, error } = await admin.rpc("app_confirm_checkout", {
    p_session_id: session.id,
    p_payment_key: paymentKey,
    p_payment: payment as unknown as Json,
    p_recover: recover,
  });
  if (error) throw new Error(error.message);
  return parseConfirmResult(data);
}

/**
 * 토스 status='DONE' 을 확인한 뒤 호출. app_confirm_checkout 반환 매핑:
 *   { ok:true, already, order_id, order_code }             → ok:true (already 는 멱등 — 성공 페이지 새로고침)
 *   { ok:false, code ∈ PAYMENT_MISMATCH|VIRTUAL_ACCOUNT_NOT_SUPPORTED|NOT_LIVE|SOLD_OUT }
 *                                                           → 토스 전액 취소 → FAILED(code) / 취소 실패 → FAILED(CANCEL_PENDING)
 *   { ok:false, code = 세션 fail_code|status (종결 세션, recover=false) } — 세션이 그 사이 다른 경로(reconcile READY 재조회·크론 만료)로
 *       종결됐는데 돈은 DONE 이다 → recover=true 로 1회 재시도(§7.3 두 번째 항목) → 그래도 못 만들면 **반드시 취소**(§0 결정 5-1):
 *       CANCEL_PENDING 세션은 retryCancelPending, 그 외는 cancelAndFail(원래 code 보존). 돈이 잡힌 채 주문 없는 세션을 남기지 않는다.
 *   rpc 예외 / BAD_RESULT                                    → code 'CONFIRMING', dbError:true, payment_events 'error: db …'
 * payment.status 가 'DONE' 이 아닌 호출(멱등 조회용 빈 payment) 은 위 취소 분기를 타지 않는다.
 */
export async function confirmDone(
  admin: Admin,
  session: SessionLite,
  paymentKey: string,
  payment: TossPayment,
  opts: { recover: boolean; source: EventSource },
): Promise<ConfirmOutcome> {
  let parsed: ConfirmFnResult;
  let recovered = false;
  try {
    parsed = await callConfirmFn(admin, session, paymentKey, payment, opts.recover);
    // 종결 세션 코드(CANCEL_ON_CODES·NOT_FOUND·CANCEL_PENDING 밖) + 돈은 DONE → recover=true 로 1회 재시도
    if (
      !parsed.ok &&
      !opts.recover &&
      payment.status === "DONE" &&
      !CANCEL_ON_CODES.has(parsed.code) &&
      parsed.code !== "BAD_RESULT" &&
      parsed.code !== "NOT_FOUND" &&
      parsed.code !== "CANCEL_PENDING"
    ) {
      parsed = await callConfirmFn(admin, session, paymentKey, payment, true);
      recovered = parsed.ok && !parsed.already;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[checkout-sync] app_confirm_checkout threw:", msg);
    await logPaymentEvent(admin, {
      source: opts.source,
      event_type: "confirm",
      toss_order_id: session.toss_order_id,
      payment_key: paymentKey,
      payload: { payment, error: msg },
      handled: false,
      result: `error: db ${msg}`.slice(0, 200),
    });
    return { ok: false, code: "CONFIRMING", message: failMessage("CONFIRMING"), canceled: false, dbError: true };
  }

  if (parsed.ok) {
    return { ok: true, already: parsed.already, recovered, orderId: parsed.order_id, orderCode: parsed.order_code };
  }

  // BAD_RESULT(형식 오류) 는 세션을 건드리지 않고 확인 중으로 둔다 — 돈이 잡혀 있을 수 있다.
  if (parsed.code === "BAD_RESULT") {
    return { ok: false, code: "CONFIRMING", message: failMessage("CONFIRMING"), canceled: false, dbError: true };
  }

  if (CANCEL_ON_CODES.has(parsed.code)) {
    const message =
      parsed.code === "SOLD_OUT" && parsed.left !== null
        ? `남은 수량이 부족합니다 (잔여 ${Math.max(0, parsed.left)}개)`
        : failMessage(parsed.code, parsed.message);
    const { canceled } = await cancelAndFail(admin, session, paymentKey, parsed.code, {
      source: opts.source,
      message,
    });
    return {
      ok: false,
      code: canceled ? parsed.code : "CANCEL_PENDING",
      message: canceled ? message : failMessage("CANCEL_PENDING"),
      canceled,
      dbError: false,
    };
  }

  if (payment.status !== "DONE") {
    // 멱등 조회 등 — 돈이 잡혔다는 확인이 없으므로 취소하지 않는다
    return { ok: false, code: parsed.code, message: failMessage(parsed.code, parsed.message), canceled: false, dbError: false };
  }

  // DONE 인데 주문을 만들 수 없는 나머지 전부(종결 세션·NOT_FOUND) → 취소로 종결
  if (parsed.code === "CANCEL_PENDING") {
    // 취소 의도가 이미 확정된 세션 — 같은 키·같은 본문으로 재시도. parsed.message = 원래 code (fail_message)
    const { canceled, originalCode } = await retryCancelPending(
      admin,
      { ...session, fail_code: "CANCEL_PENDING", fail_message: parsed.message ?? session.fail_message },
      paymentKey,
      opts.source,
    );
    return {
      ok: false,
      code: canceled ? originalCode : "CANCEL_PENDING",
      message: failMessage(canceled ? originalCode : "CANCEL_PENDING"),
      canceled,
      dbError: false,
    };
  }
  const { canceled } = await cancelAndFail(admin, session, paymentKey, parsed.code, {
    source: opts.source,
    message: parsed.message,
  });
  return {
    ok: false,
    code: canceled ? parsed.code : "CANCEL_PENDING",
    message: failMessage(canceled ? parsed.code : "CANCEL_PENDING", canceled ? parsed.message : null),
    canceled,
    dbError: false,
  };
}

// ------------------------------------------------------------
// 주문 측 동기화 (토스 콘솔 취소 등)
// ------------------------------------------------------------

export type OrderLite = {
  id: string;
  code: string;
  status: string;
  payment_key: string | null;
  checkout_session_id: string | null;
  campaign_id: string;
};
export const ORDER_LITE_COLS = "id, code, status, payment_key, checkout_session_id, campaign_id";

/**
 * 토스 재조회 결과가 CANCELED/PARTIAL_CANCELED 인 PAID 주문 → app_refund_record(actor='system') 반환 매핑:
 *   { ok:true, already:true }          → 'noop'                          (이미 REFUNDED/CANCELED)
 *   { ok:true, partial:true }          → 'partial_cancel_manual' handled=false (PAID 유지 + refund_amount — 정산 수동 조정)
 *   { ok:true, adjust:true }           → 'needs_manual_adjust'  handled=false (SETTLED·샘플 → status CANCELED 조정 큐)
 *   { ok:true }                        → 'refunded'
 *   { ok:false } / 예외                → 'error: refund record …' handled=false
 */
export async function recordRefundFromToss(
  admin: Admin,
  order: OrderLite,
  payment: TossPayment,
  opts: { reason: string; partial: boolean },
): Promise<{ result: string; handled: boolean }> {
  try {
    const { data, error } = await admin.rpc("app_refund_record", {
      p_order_id: order.id,
      p_actor: "system",
      p_reason: opts.reason,
      p_amount: tossCanceledTotal(payment),
      p_raw: payment as unknown as Json,
      p_partial: opts.partial,
    });
    if (error) throw new Error(error.message);
    const r = parseRefundRecordResult(data);
    if (!r.ok) return { result: `error: refund record ${r.code}`, handled: false };
    if (r.already) return { result: "noop", handled: true };
    if (r.partial) return { result: "partial_cancel_manual", handled: false };
    if (r.adjust) return { result: "needs_manual_adjust", handled: false };
    return { result: "refunded", handled: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[checkout-sync] app_refund_record threw:", msg);
    return { result: `error: refund record ${msg}`.slice(0, 200), handled: false };
  }
}

/** CONFIRMED 세션의 주문 raw_payment/payment_method 최신화 — 상태 불변 (§7.3 'noop') */
async function refreshOrderPayment(admin: Admin, order: OrderLite, payment: TossPayment): Promise<void> {
  const { error } = await admin
    .from("orders")
    .update({ raw_payment: payment as unknown as Json, payment_method: payment.method ?? null })
    .eq("id", order.id)
    .eq("status", "PAID");
  if (error) console.error("[checkout-sync] order refresh failed:", error.message);
}

async function findOrderBySession(admin: Admin, sessionId: string): Promise<OrderLite | null> {
  const { data, error } = await admin
    .from("orders")
    .select(ORDER_LITE_COLS)
    .eq("checkout_session_id", sessionId)
    .maybeSingle();
  if (error) {
    console.error("[checkout-sync] order lookup failed:", error.message);
    return null;
  }
  return (data as OrderLite | null) ?? null;
}

/**
 * 재조회한 토스 payment 로 세션/주문을 동기화 — app-plan §7.3(5) · §7.5 표를 그대로 옮긴 분기.
 * 웹훅·reconcile 공용. 반환 result 는 payment_events.result 어휘, handled=false 는 운영 큐.
 */
export async function syncFromPayment(
  admin: Admin,
  ctx: { session: SessionLite | null; order: OrderLite | null },
  payment: TossPayment,
  source: EventSource,
): Promise<{ result: string; handled: boolean }> {
  const { session } = ctx;
  const st = payment.status;
  const paymentKey = payment.paymentKey;

  // ---- 세션이 있는 경우 ----
  if (session) {
    if (session.status === "PENDING" || session.status === "CONFIRMING") {
      if (st === "DONE") {
        // DB 쓰기 실패·라우트 사망 복구: app_confirm_checkout → ok 면 confirmed, ok:false 면 함수 안에서 취소 분기
        const r = await confirmDone(admin, session, paymentKey, payment, { recover: false, source });
        if (r.ok) return { result: r.already ? "noop" : r.recovered ? "confirmed_recovered" : "confirmed", handled: true };
        if (r.dbError) return { result: `error: ${r.code}`, handled: false };
        return r.canceled
          ? { result: "refunded_orphan", handled: true }
          : { result: "error: cancel failed", handled: false };
      }
      if (st === "WAITING_FOR_DEPOSIT" || st === "PARTIAL_CANCELED") {
        // 가상계좌 — 입금 전 취소 (§0 결정 6) · 콘솔 부분취소 뒤 남은 잔액이 주문 없이 잡혀 있음 → 잔액 전부 취소
        const code = st === "WAITING_FOR_DEPOSIT" ? "VIRTUAL_ACCOUNT_NOT_SUPPORTED" : "PARTIAL_CANCELED";
        const { canceled } = await cancelAndFail(admin, session, paymentKey, code, { source });
        return canceled
          ? { result: "refunded_orphan", handled: true }
          : { result: "error: cancel failed", handled: false };
      }
      if (st === "CANCELED" || st === "EXPIRED" || st === "ABORTED") {
        // 승인 기록 없이 종료 → FAILED(토스 status)
        await failSession(admin, session.id, { code: st, raw: payment });
        return { result: `failed: ${st}`, handled: true };
      }
      // READY / IN_PROGRESS — 아직 결론 없음
      return { result: "noop", handled: true };
    }

    if (session.status === "CONFIRMED") {
      const order = ctx.order ?? (await findOrderBySession(admin, session.id));
      if (!order) return { result: "error: confirmed session without order", handled: false };
      if (st === "DONE") {
        await refreshOrderPayment(admin, order, payment);
        return { result: "noop", handled: true };
      }
      if (st === "CANCELED" && order.status === "PAID") {
        return recordRefundFromToss(admin, order, payment, { reason: "토스 콘솔 취소", partial: false });
      }
      if (st === "PARTIAL_CANCELED" && order.status === "PAID") {
        return recordRefundFromToss(admin, order, payment, { reason: "토스 콘솔 부분취소", partial: true });
      }
      return { result: "noop", handled: true };
    }

    // FAILED / EXPIRED
    const order = ctx.order ?? (await findOrderBySession(admin, session.id));
    if (session.fail_code === "CANCEL_PENDING" && !order) {
      if (st === "DONE" || st === "WAITING_FOR_DEPOSIT" || st === "PARTIAL_CANCELED") {
        // 취소 의도가 확정된 세션 — 복구하지 않고 취소 재시도(같은 Idempotency-Key·같은 본문). 가상계좌 입금 대기·부분취소 잔액도 취소 대상.
        const { canceled } = await retryCancelPending(admin, session, paymentKey, source);
        return canceled ? { result: "cancel_confirmed", handled: true } : { result: "error: cancel failed", handled: false };
      }
      if (st === "READY" || st === "IN_PROGRESS" || st === "ABORTED" || st === "EXPIRED") {
        // 잡힌 돈이 없다(승인 기록 없음) → 취소할 것도 없다 → 원래 code 로 종결 (stale 목록 영구 잔류 방지)
        await resolveCancelPending(admin, session, payment);
        return { result: "cancel_confirmed", handled: true };
      }
      // CANCELED 는 아래에서 종결
    }
    if (st === "DONE") {
      if (order) {
        await refreshOrderPayment(admin, order, payment);
        return { result: "noop", handled: true };
      }
      // 승인은 됐는데 종결된 세션(크론 만료 뒤 등) → recover=true 로 주문 생성 시도, 안 되면 함수 안에서 취소
      const r = await confirmDone(admin, session, paymentKey, payment, { recover: true, source });
      if (r.ok) return { result: r.already ? "noop" : "confirmed_recovered", handled: true };
      if (r.dbError) return { result: `error: ${r.code}`, handled: false };
      return r.canceled
        ? { result: "refunded_orphan", handled: true }
        : { result: "error: cancel failed", handled: false };
    }
    if (st === "CANCELED") {
      if (session.fail_code === "CANCEL_PENDING") {
        await resolveCancelPending(admin, session, payment);
        return { result: "cancel_confirmed", handled: true };
      }
      if (order && order.status === "PAID") {
        return recordRefundFromToss(admin, order, payment, { reason: "토스 콘솔 취소", partial: false });
      }
      return { result: "noop", handled: true };
    }
    if (st === "PARTIAL_CANCELED" && order && order.status === "PAID") {
      return recordRefundFromToss(admin, order, payment, { reason: "토스 콘솔 부분취소", partial: true });
    }
    return { result: "noop", handled: true };
  }

  // ---- 세션 없이 주문만 매칭된 경우 (시드·외부 경로 주문) ----
  const order = ctx.order;
  if (!order) return { result: "ignored", handled: true };
  if (st === "DONE") {
    await refreshOrderPayment(admin, order, payment);
    return { result: "noop", handled: true };
  }
  if (st === "CANCELED" && order.status === "PAID") {
    return recordRefundFromToss(admin, order, payment, { reason: "토스 콘솔 취소", partial: false });
  }
  if (st === "PARTIAL_CANCELED" && order.status === "PAID") {
    return recordRefundFromToss(admin, order, payment, { reason: "토스 콘솔 부분취소", partial: true });
  }
  return { result: "noop", handled: true };
}

// ------------------------------------------------------------
// 캠페인 사전 확인 (잠금 없음 — 최종 방어선은 app_confirm_checkout 안의 for update 재검사)
// ------------------------------------------------------------

export type CampaignGate = {
  code: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  qty: number | null;
  sold_qty: number | null;
  /** 서버 기준일 YYYY-MM-DD (Asia/Seoul) — campaign_card().campaign.today */
  today: string;
};

/**
 * campaign_card(code) RPC 를 직접 호출해 최소 필드만 좁힌다 (C 의 parseCampaignCard 에 의존하지 않는다 — B 의 readLinkCtx 와 같은 이유).
 * 캠페인이 공개 상태가 아니면(RPC null) null.
 */
export async function readCampaignGate(admin: Admin, campaignId: string): Promise<CampaignGate | null> {
  const { data: row, error } = await admin.from("campaigns").select("code").eq("id", campaignId).maybeSingle();
  if (error || !row) return null;
  const { data, error: rpcError } = await admin.rpc("campaign_card", { p_code: row.code });
  if (rpcError || data === null || data === undefined) return null;
  const card = obj(data);
  const c = card ? obj(card.campaign) : null;
  if (!c) return null;
  const today = str(c, "today");
  const status = str(c, "status");
  if (!today || !status) return null;
  return {
    code: row.code,
    status,
    start_date: str(c, "start_date"),
    end_date: str(c, "end_date"),
    qty: num(c, "qty"),
    sold_qty: num(c, "sold_qty"),
    today,
  };
}

/** LIVE + start_date ≤ today ≤ end_date (문자열 YYYY-MM-DD 비교) */
export function gateIsLive(g: CampaignGate): boolean {
  if (g.status !== "LIVE") return false;
  if (g.start_date && g.start_date > g.today) return false;
  if (g.end_date && g.end_date < g.today) return false;
  return true;
}

/**
 * 잔여 = qty − sold_qty − 소프트 예약(app_checkout_reserved: PENDING/CONFIRMING·미만료 세션 qty 합).
 * excludeQty: 호출자 자신의 세션이 예약에 포함돼 있으면 그만큼 되돌린다(confirm 사전 확인).
 */
export async function softStockLeft(admin: Admin, campaignId: string, g: CampaignGate, excludeQty = 0): Promise<number> {
  const { data, error } = await admin.rpc("app_checkout_reserved", { p_campaign_id: campaignId });
  if (error) {
    console.error("[checkout-sync] app_checkout_reserved failed:", error.message);
  }
  const reserved = typeof data === "number" && Number.isFinite(data) ? data : 0;
  const qty = g.qty ?? 0;
  const sold = g.sold_qty ?? 0;
  return qty - sold - Math.max(0, reserved - excludeQty);
}
