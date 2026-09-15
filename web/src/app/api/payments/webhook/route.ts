import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isTossError, isUncertain, tossGetPayment } from "@/lib/toss";
import {
  logPaymentEvent,
  markPaymentEvent,
  ORDER_LITE_COLS,
  SESSION_LITE_COLS,
  syncFromPayment,
  TOSS_KEY_RE,
  type EventSource,
  type OrderLite,
  type SessionLite,
} from "@/lib/checkout-sync";

/**
 * POST /api/payments/webhook — 토스 웹훅 (app-plan §6.2 · §7.3). 소유: E.
 *
 * 토스 웹훅은 서명이 없다 — 공개 엔드포인트이며 **paymentKey 재조회가 유일한 인증**이다. 본문의 상태값은 절대 쓰지 않는다.
 *   1. 형식 검사(저장 전): 본문 ≤ 64KB · JSON · eventType 문자열 · orderId/paymentKey 는 ^[A-Za-z0-9_-]{6,200}$ → 실패 400, 로그 없음
 *   2. 매칭(재조회 전): orderId → checkout_sessions.toss_order_id, 없으면 paymentKey → 세션·주문. 모르는 주문 → 200 ignored
 *      (재조회·payload 저장 없음 — 공개 엔드포인트라 로그 팽창을 막는다)
 *   3. 매칭되면 payment_events insert(handled=false, payload 원문)
 *   4. 저장된 payment_key(없으면 본문 data.paymentKey — 응답 orderId 일치 확인)로 GET /v1/payments/{paymentKey} 재조회
 *   5. 재조회 결과로만 동기화(syncFromPayment — §7.3(5) 분기표) → payment_events handled/result 갱신
 *   6. 항상 200 { ok:true, … }. 재조회 실패(불명)만 502 — 토스가 재시도한다.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY_BYTES = 64 * 1024;

type WebhookBody = {
  eventType?: unknown;
  orderId?: unknown;
  paymentKey?: unknown;
  data?: { orderId?: unknown; paymentKey?: unknown; [k: string]: unknown } | null;
  [k: string]: unknown;
};

function bad(): NextResponse {
  return NextResponse.json({ ok: false, code: "BAD_REQUEST", message: "invalid webhook" }, { status: 400 });
}

export async function POST(request: Request) {
  // 1) 형식 검사 — 통과 전에는 저장도 재조회도 하지 않는다
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return bad();
  let text: string;
  try {
    text = await request.text();
  } catch {
    return bad();
  }
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) return bad();

  let body: WebhookBody;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return bad();
    body = parsed as WebhookBody;
  } catch {
    return bad();
  }
  if (typeof body.eventType !== "string" || !body.eventType) return bad();
  const eventType = body.eventType;
  const data = body.data && typeof body.data === "object" ? body.data : null;

  // DEPOSIT_CALLBACK 은 최상위 orderId, 일반 웹훅(v2)은 data.orderId / data.paymentKey
  const orderIdRaw = data?.orderId ?? body.orderId;
  const paymentKeyRaw = data?.paymentKey ?? body.paymentKey;
  const orderId = typeof orderIdRaw === "string" ? orderIdRaw : null;
  const bodyPaymentKey = typeof paymentKeyRaw === "string" ? paymentKeyRaw : null;
  if (orderIdRaw !== undefined && orderIdRaw !== null && (orderId === null || !TOSS_KEY_RE.test(orderId))) return bad();
  if (
    paymentKeyRaw !== undefined &&
    paymentKeyRaw !== null &&
    (bodyPaymentKey === null || !TOSS_KEY_RE.test(bodyPaymentKey))
  ) {
    return bad();
  }
  if (!orderId && !bodyPaymentKey) return bad();

  const admin = createAdminClient();

  // 2) 매칭 — 세션(toss_order_id) → 세션(payment_key) → 주문(payment_key)
  let session: SessionLite | null = null;
  let order: OrderLite | null = null;

  if (orderId) {
    const { data: s } = await admin
      .from("checkout_sessions")
      .select(SESSION_LITE_COLS)
      .eq("toss_order_id", orderId)
      .maybeSingle();
    session = (s as SessionLite | null) ?? null;
  }
  if (!session && bodyPaymentKey) {
    const { data: s } = await admin
      .from("checkout_sessions")
      .select(SESSION_LITE_COLS)
      .eq("payment_key", bodyPaymentKey)
      .maybeSingle();
    session = (s as SessionLite | null) ?? null;
    if (!session) {
      const { data: o } = await admin
        .from("orders")
        .select(ORDER_LITE_COLS)
        .eq("payment_key", bodyPaymentKey)
        .limit(1)
        .maybeSingle();
      order = (o as OrderLite | null) ?? null;
    }
  }
  if (!session && !order) {
    // 모르는 주문 — 재조회·payload 저장 없이 200 (토스 재시도 폭주 방지). 공개 엔드포인트라 로그도 남기지 않는다.
    console.warn("[webhook] ignored unknown order", { eventType, orderId, hasKey: !!bodyPaymentKey });
    return NextResponse.json({ ok: true, ignored: true });
  }

  // 3) 감사 로그 (원문)
  const source: EventSource = eventType === "DEPOSIT_CALLBACK" ? "deposit_callback" : "webhook";
  const eventId = await logPaymentEvent(admin, {
    source,
    event_type: eventType,
    toss_order_id: session?.toss_order_id ?? orderId,
    payment_key: session?.payment_key ?? order?.payment_key ?? bodyPaymentKey,
    payload: body,
    handled: false,
  });

  // 4) 재조회 — 저장된 payment_key 우선. PENDING(confirm 미도달) 세션은 본문 paymentKey 로 조회 후 orderId 일치 확인.
  const storedKey = session?.payment_key ?? order?.payment_key ?? null;
  const lookupKey = storedKey ?? bodyPaymentKey;
  if (!lookupKey) {
    await markPaymentEvent(admin, eventId, { handled: true, result: "ignored: no payment_key" });
    return NextResponse.json({ ok: true, ignored: true });
  }

  const look = await tossGetPayment(lookupKey);
  if (!look.ok || isTossError(look.body)) {
    if (isUncertain(look)) {
      // 토스 재조회 실패(불명) → 502, 토스가 재시도
      await markPaymentEvent(admin, eventId, { handled: false, result: "error: lookup failed" });
      return NextResponse.json({ ok: false, code: "LOOKUP_FAILED" }, { status: 502 });
    }
    // 4xx — 그런 결제가 없다 (본문 paymentKey 가 위조된 경우 포함)
    await markPaymentEvent(admin, eventId, {
      handled: true,
      result: `ignored: lookup ${isTossError(look.body) ? look.body.code : look.status}`,
    });
    return NextResponse.json({ ok: true, ignored: true });
  }
  const payment = look.body;

  // 저장된 키가 없어 본문 키로 조회한 경우: 응답의 orderId 가 세션과 같아야 한다 (불일치 → ignored)
  if (!storedKey && session && payment.orderId !== session.toss_order_id) {
    await markPaymentEvent(admin, eventId, { handled: true, result: "ignored: orderId mismatch" });
    return NextResponse.json({ ok: true, ignored: true });
  }
  if (storedKey && session && payment.orderId !== session.toss_order_id) {
    await markPaymentEvent(admin, eventId, { handled: false, result: "error: orderId mismatch" });
    return NextResponse.json({ ok: true, ignored: true });
  }

  // 5) 동기화 — 재조회 결과로만
  const { result, handled } = await syncFromPayment(admin, { session, order }, payment, source);
  await markPaymentEvent(admin, eventId, { handled, result });

  return NextResponse.json({ ok: true, result });
}
