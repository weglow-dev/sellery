import "server-only";

/**
 * 토스페이먼츠 서버 API 래퍼 — 계약 docs/app-plan.md §10.0 · §7. 소유: E.
 *
 * 인증: Basic base64(`${TOSS_SECRET_KEY}:`). TOSS_SECRET_KEY 는 이 모듈에서만 process.env 로 읽는다
 * (결제위젯 키 짝 test_gsk_/live_gsk_ — API 개별연동 키 test_sk_ 를 섞으면 승인 실패, app-plan §3).
 *
 * 반환 { ok, status, body }:
 *   - ok = HTTP 2xx 이고 본문이 JSON 으로 읽혔다.
 *   - **status 0 = fetch 예외·타임아웃·2xx 인데 본문 파싱 실패(네트워크 오류 — 토스가 처리했는지 불명)**.
 *   - 5xx 도 같은 취급 — 라우트는 status 0 / 5xx 를 4xx(토스가 거절 = 미승인 확정)와 다르게 다룬다(§7.2).
 *     실패로 단정하지 말고 GET /v1/payments/{paymentKey} 재조회로 확정한다. `isUncertain(res)` 참고.
 *   - 4xx 본문은 { code, message } (TossError). 본문 파싱이 안 되면 code='HTTP_{status}' 로 합성.
 *
 * 이 모듈은 DB 를 모른다 — 세션/주문 동기화는 lib/checkout-sync.ts.
 */

const TOSS_BASE = "https://api.tosspayments.com";
/**
 * 기본 타임아웃 10초(AbortController). 재조회는 짧게(§7.2 "1회, 짧은 타임아웃").
 * confirm 라우트(maxDuration 60s)의 재선점 최악 체인 = 재조회 8s + confirm 10s + 재조회 8s + confirm 재시도 10s + 취소 10s ≈ 46s
 * 이 예산 안에 들어가야 한다 — 15s 로 올리면 Vercel 이 취소 호출 도중 함수를 끊을 수 있다.
 */
const DEFAULT_TIMEOUT_MS = 10_000;

/** 토스 payment.status 값 */
export type TossPaymentStatus =
  | "READY"
  | "IN_PROGRESS"
  | "WAITING_FOR_DEPOSIT"
  | "DONE"
  | "CANCELED"
  | "PARTIAL_CANCELED"
  | "ABORTED"
  | "EXPIRED";

export type TossCancel = {
  cancelAmount: number;
  cancelReason: string;
  canceledAt: string;
  transactionKey?: string;
  [k: string]: unknown;
};

/** GET/confirm/cancel 응답 본문(성공). 앱이 읽는 필드만 명시, 나머지는 인덱스 시그니처. */
export type TossPayment = {
  paymentKey: string;
  orderId: string;
  orderName?: string;
  /** TossPaymentStatus 중 하나 (미래 값 대비 string) */
  status: string;
  method?: string | null;
  approvedAt?: string | null;
  requestedAt?: string;
  totalAmount: number;
  balanceAmount?: number;
  cancels?: TossCancel[] | null;
  [k: string]: unknown;
};

/** 토스 에러 응답 본문 */
export type TossError = { code: string; message: string };

export type TossResult = {
  ok: boolean;
  /** HTTP 상태. 0 = fetch 예외·타임아웃(처리 여부 불명) */
  status: number;
  body: TossPayment | TossError;
};

/** 본문이 에러 형태({code, message})인지 — ok=false 이면 항상 TossError 다. */
export function isTossError(body: TossPayment | TossError): body is TossError {
  return (
    typeof (body as TossError).code === "string" &&
    typeof (body as TossPayment).paymentKey !== "string"
  );
}

/** 처리 여부 불명(네트워크 오류·타임아웃·5xx) — 실패로 단정하지 말고 재조회한다(§7.2). */
export function isUncertain(res: TossResult): boolean {
  return res.status === 0 || res.status >= 500;
}

/** cancels[].cancelAmount 합 (없으면 totalAmount − balanceAmount, 그것도 없으면 0) */
export function tossCanceledTotal(p: TossPayment): number {
  const cancels = Array.isArray(p.cancels) ? p.cancels : [];
  if (cancels.length > 0) {
    return cancels.reduce((sum, c) => sum + (Number.isFinite(c.cancelAmount) ? c.cancelAmount : 0), 0);
  }
  if (typeof p.balanceAmount === "number" && Number.isFinite(p.balanceAmount)) {
    return Math.max(0, p.totalAmount - p.balanceAmount);
  }
  return 0;
}

function authHeader(): string {
  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret) throw new Error("TOSS_SECRET_KEY is not set. Add it to web/.env.local.");
  return `Basic ${Buffer.from(`${secret}:`).toString("base64")}`;
}

function looksLikePayment(v: unknown): v is TossPayment {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as TossPayment).paymentKey === "string" &&
    typeof (v as TossPayment).status === "string"
  );
}

function looksLikeError(v: unknown): v is TossError {
  return !!v && typeof v === "object" && typeof (v as TossError).code === "string";
}

/**
 * 공통 호출. 예외·타임아웃·파싱 실패를 전부 TossResult 로 흡수한다 — 라우트가 try/catch 없이 status 로 분기.
 */
async function request(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; headers?: Record<string, string> },
  timeoutMs: number,
): Promise<TossResult> {
  let authorization: string;
  try {
    authorization = authHeader();
  } catch (e) {
    // 설정 오류 — 토스에 도달하지 않았으므로 미승인 확정(4xx 취급). 로그로 드러낸다.
    console.error("[toss]", e instanceof Error ? e.message : e);
    return { ok: false, status: 400, body: { code: "CONFIG_ERROR", message: "결제 서버 설정 오류" } };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${TOSS_BASE}${path}`, {
      method: init.method,
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal,
      cache: "no-store",
    });

    let json: unknown = null;
    let parsed = false;
    try {
      const text = await res.text();
      json = text ? JSON.parse(text) : null;
      parsed = true;
    } catch {
      parsed = false;
    }

    if (res.ok) {
      if (parsed && looksLikePayment(json)) return { ok: true, status: res.status, body: json };
      // 2xx 인데 본문을 읽지 못함 — 처리됐을 수 있다 → 불명(0)
      return {
        ok: false,
        status: 0,
        body: { code: "PARSE_ERROR", message: `토스 응답을 읽지 못했습니다 (HTTP ${res.status})` },
      };
    }

    const err: TossError =
      parsed && looksLikeError(json)
        ? { code: json.code, message: typeof json.message === "string" ? json.message : json.code }
        : { code: `HTTP_${res.status}`, message: `토스 API 오류 (HTTP ${res.status})` };
    return { ok: false, status: res.status, body: err };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      status: 0,
      body: {
        code: aborted ? "TIMEOUT" : "NETWORK_ERROR",
        message: aborted ? "토스 응답 시간 초과" : "토스 연결 오류",
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/** POST /v1/payments/confirm — amount 는 반드시 session.amount (요청값이 아니다) */
export async function tossConfirm(input: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<TossResult> {
  return request(
    "/v1/payments/confirm",
    { method: "POST", body: { paymentKey: input.paymentKey, orderId: input.orderId, amount: input.amount } },
    DEFAULT_TIMEOUT_MS,
  );
}

/**
 * POST /v1/payments/{paymentKey}/cancel — reason ≤ 200자, 헤더 Idempotency-Key(같은 키로 재시도하면 토스가 같은 응답).
 * cancelAmount 없으면 전액. 슬라이스 1 은 전액만 쓴다.
 */
export async function tossCancel(
  paymentKey: string,
  reason: string,
  opts: { idempotencyKey: string; cancelAmount?: number },
): Promise<TossResult> {
  const body: Record<string, unknown> = { cancelReason: (reason || "고객 요청").slice(0, 200) };
  if (typeof opts.cancelAmount === "number" && opts.cancelAmount > 0) body.cancelAmount = opts.cancelAmount;
  return request(
    `/v1/payments/${encodeURIComponent(paymentKey)}/cancel`,
    { method: "POST", body, headers: { "Idempotency-Key": opts.idempotencyKey } },
    DEFAULT_TIMEOUT_MS,
  );
}

/**
 * GET /v1/payments/{paymentKey} — 웹훅·재조회·reconcile 의 유일한 진실.
 * 4xx(NOT_FOUND_PAYMENT_KEY 등) = 토스에 승인 기록 없음. 재조회는 기본 8초 타임아웃.
 */
export async function tossGetPayment(
  paymentKey: string,
  opts: { timeoutMs?: number } = {},
): Promise<TossResult> {
  return request(
    `/v1/payments/${encodeURIComponent(paymentKey)}`,
    { method: "GET" },
    opts.timeoutMs ?? 8_000,
  );
}
