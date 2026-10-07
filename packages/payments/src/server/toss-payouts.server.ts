/**
 * 토스페이먼츠 지급대행(Payouts) API 래퍼 — `toss.server.ts`(결제) 와 같은 never-throw 스타일. DB 를 모른다(글루는 `payouts.server.ts`).
 * 문서: docs.tosspayments.com/guides/v2/payouts · /reference/additional (2026-10-07).
 *
 * 인증: Basic base64(`${secretKey}:`) — 키는 **API 개별 연동 시크릿 키**(`test_sk_` / `live_sk_`)다. 결제위젯 키(`gsk_`)와 다르고, 상점(MID)도 다를 수 있다
 *   (지급대행 계약 상점). `configurePayouts({ secretKey, securityKey })` 로 주입 — 앱 `$lib/server/env.ts` 가 `TOSS_PAYOUT_SECRET_KEY` · `TOSS_PAYOUT_SECURITY_KEY` 를 넘긴다.
 * 암호화: 셀러 등록 · 셀러 수정 · 지급 요청은 본문을 JWE(dir · A256GCM · 보안 키)로 보내고 `TossPayments-api-security-mode: ENCRYPTION` 헤더를 붙인다.
 *   응답도 같은 키의 JWE 다(본문이 JSON 이면 그대로 — 오류 응답은 평문 JSON 일 수 있다). 나머지(GET · 삭제 · 취소)는 평문.
 * 반환 { ok, status, body }: ok = 2xx + JSON 읽음 · status 0 = 네트워크/타임아웃/복호 실패(처리 여부 불명 — `isUncertain`) · 4xx 본문 { code, message }.
 * v2 응답은 봉투 { version, traceId, entityType, entityBody, error } 다(2026-10-07 실측) — body 는 entityBody 를 푼 값, 오류는 envelope.error.
 *
 *   registerSeller(body) · updateSeller(id, body) · deleteSeller(id) · getSeller(id) · listSellers({ limit, startingAfter })
 *   getPayoutBalance() → { pendingAmount, availableAmount } (value 숫자)
 *   requestPayouts(items, { idempotencyKey }) — 한 번에 ≤100건(호출자가 chunkPayouts). 응답은 Payout 객체 배열
 *   cancelPayout(id) · getPayout(id)
 *   createTossPayouts({ secretKey, securityKey, fetch, baseUrl, now }) — 키 명시 인스턴스(스크립트 · 테스트)
 */
import { isJweCompact, jweDecrypt, jweEncrypt, tossIat } from "../jwe";
import { parseTossPayout, parseTossSeller, type TossPayout, type TossPayoutItem, type TossSeller, type TossSellerBody } from "../payout-rules";
import { payoutsConfig } from "./config.server";

const TOSS_BASE = "https://api.tosspayments.com";
const DEFAULT_TIMEOUT_MS = 10_000;

export type TossPayoutError = { code: string; message: string };

export type TossPayoutResult<T> = { ok: true; status: number; body: T } | { ok: false; status: number; body: TossPayoutError };

export type TossBalance = { pendingAmount: number; availableAmount: number; currency: string; raw: unknown };

export type TossPayoutsApi = {
  registerSeller(body: TossSellerBody): Promise<TossPayoutResult<TossSeller>>;
  updateSeller(id: string, body: Partial<TossSellerBody>): Promise<TossPayoutResult<TossSeller>>;
  deleteSeller(id: string): Promise<TossPayoutResult<{ id: string; [k: string]: unknown }>>;
  getSeller(id: string): Promise<TossPayoutResult<TossSeller>>;
  listSellers(opts?: { limit?: number; startingAfter?: string }): Promise<TossPayoutResult<TossSeller[]>>;
  getPayoutBalance(): Promise<TossPayoutResult<TossBalance>>;
  requestPayouts(items: readonly TossPayoutItem[], opts: { idempotencyKey: string }): Promise<TossPayoutResult<TossPayout[]>>;
  cancelPayout(id: string): Promise<TossPayoutResult<TossPayout>>;
  getPayout(id: string): Promise<TossPayoutResult<TossPayout>>;
};

export type CreateTossPayoutsOptions = {
  secretKey?: string;
  securityKey?: string;
  fetch?: typeof fetch;
  baseUrl?: string;
  /** 테스트용 시각(iat) */
  now?: () => Date;
};

export function isUncertainPayout(res: { ok: boolean; status: number }): boolean {
  return res.status === 0 || res.status >= 500;
}

function looksLikeError(v: unknown): v is TossPayoutError {
  return !!v && typeof v === "object" && typeof (v as TossPayoutError).code === "string";
}

const amountOf = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && typeof (v as { value?: unknown }).value === "number") return (v as { value: number }).value;
  return 0;
};

export function createTossPayouts(opts: CreateTossPayoutsOptions = {}): TossPayoutsApi {
  const fetchFn = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? TOSS_BASE;

  function keys(): { secretKey: string; securityKey?: string } {
    const cfg = payoutsConfig();
    const secretKey = opts.secretKey || cfg.payoutSecretKey;
    const securityKey = opts.securityKey || cfg.payoutSecurityKey;
    if (!secretKey) throw new Error("TOSS_PAYOUT_SECRET_KEY is not set — configurePayouts({ secretKey }) in $lib/server/env.ts");
    return { secretKey, securityKey };
  }

  async function request<T>(
    path: string,
    init: { method: "GET" | "POST" | "DELETE"; body?: unknown; encrypt?: boolean; headers?: Record<string, string> },
    parse: (json: unknown) => T | null,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<TossPayoutResult<T>> {
    let auth: string;
    let securityKey: string | undefined;
    try {
      const k = keys();
      auth = `Basic ${btoa(`${k.secretKey}:`)}`;
      securityKey = k.securityKey;
      if (init.encrypt && !securityKey) throw new Error("TOSS_PAYOUT_SECURITY_KEY is not set — configurePayouts({ securityKey })");
    } catch (e) {
      console.error("[toss-payouts]", e instanceof Error ? e.message : e);
      return { ok: false, status: 400, body: { code: "CONFIG_ERROR", message: "지급대행 서버 설정 오류" } };
    }

    let bodyText: string | undefined;
    const headers: Record<string, string> = { Authorization: auth, "Content-Type": "application/json", ...(init.headers ?? {}) };
    if (init.body !== undefined) {
      const plain = JSON.stringify(init.body);
      if (init.encrypt) {
        try {
          bodyText = await jweEncrypt(plain, securityKey as string, { iat: tossIat(opts.now?.() ?? new Date()) });
        } catch (e) {
          console.error("[toss-payouts] encrypt failed:", e instanceof Error ? e.message : e);
          return { ok: false, status: 400, body: { code: "ENCRYPT_ERROR", message: "지급대행 요청 암호화 실패" } };
        }
        headers["TossPayments-api-security-mode"] = "ENCRYPTION";
        headers["Content-Type"] = "text/plain";
      } else {
        bodyText = plain;
      }
    } else if (init.encrypt) {
      headers["TossPayments-api-security-mode"] = "ENCRYPTION";
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchFn(`${base}${path}`, { method: init.method, headers, body: bodyText, signal: ctrl.signal, cache: "no-store" });
      let text = "";
      try {
        text = await res.text();
      } catch {
        text = "";
      }
      let json: unknown = null;
      let parsed = false;
      if (text.trim()) {
        if (isJweCompact(text)) {
          try {
            json = JSON.parse(await jweDecrypt(text, securityKey as string));
            parsed = true;
          } catch (e) {
            console.error("[toss-payouts] decrypt failed:", e instanceof Error ? e.message : e);
            parsed = false;
          }
        } else {
          try {
            json = JSON.parse(text);
            parsed = true;
          } catch {
            parsed = false;
          }
        }
      } else {
        json = null;
        parsed = true;
      }

      // v2 봉투 { version, traceId, entityType, entityBody, error } — 본문은 entityBody, 오류는 error
      const envelope = json && typeof json === "object" && !Array.isArray(json) && "entityBody" in (json as object) ? (json as { entityBody?: unknown; error?: unknown }) : null;
      const entity = envelope ? envelope.entityBody : json;
      const envErr = envelope && looksLikeError(envelope.error) ? envelope.error : null;
      if (res.ok && !envErr) {
        const out = parsed ? parse(entity) : null;
        if (out !== null) return { ok: true, status: res.status, body: out };
        return { ok: false, status: 0, body: { code: "PARSE_ERROR", message: `토스 응답을 읽지 못했습니다 (HTTP ${res.status})` } };
      }
      const src = envErr ?? (parsed && looksLikeError(json) ? json : null);
      const err: TossPayoutError = src
        ? { code: src.code, message: typeof src.message === "string" ? src.message : src.code }
        : { code: `HTTP_${res.status}`, message: `토스 지급대행 API 오류 (HTTP ${res.status})` };
      return { ok: false, status: res.ok ? 400 : res.status, body: err };
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return { ok: false, status: 0, body: { code: aborted ? "TIMEOUT" : "NETWORK_ERROR", message: aborted ? "토스 응답 시간 초과" : "토스 연결 오류" } };
    } finally {
      clearTimeout(timer);
    }
  }

  const parseSellerList = (j: unknown): TossSeller[] | null => {
    const arr = Array.isArray(j) ? j : j && typeof j === "object" && Array.isArray((j as { data?: unknown }).data) ? (j as { data: unknown[] }).data : null;
    if (!arr) return null;
    const out: TossSeller[] = [];
    for (const x of arr) {
      const s = parseTossSeller(x);
      if (s) out.push(s);
    }
    return out;
  };
  const parsePayoutList = (j: unknown): TossPayout[] | null => {
    const arr = Array.isArray(j) ? j : j && typeof j === "object" && Array.isArray((j as { data?: unknown }).data) ? (j as { data: unknown[] }).data : null;
    if (!arr) return null;
    const out: TossPayout[] = [];
    for (const x of arr) {
      const p = parseTossPayout(x);
      if (p) out.push(p);
    }
    return out;
  };

  return {
    registerSeller(body) {
      return request("/v2/sellers", { method: "POST", body, encrypt: true }, parseTossSeller);
    },
    updateSeller(id, body) {
      return request(`/v2/sellers/${encodeURIComponent(id)}`, { method: "POST", body, encrypt: true }, parseTossSeller);
    },
    deleteSeller(id) {
      return request(`/v2/sellers/${encodeURIComponent(id)}`, { method: "DELETE" }, (j) => (j && typeof j === "object" ? (j as { id: string }) : { id }));
    },
    getSeller(id) {
      return request(`/v2/sellers/${encodeURIComponent(id)}`, { method: "GET" }, parseTossSeller, 8_000);
    },
    listSellers(o = {}) {
      const q = new URLSearchParams();
      if (o.limit) q.set("limit", String(o.limit));
      if (o.startingAfter) q.set("startingAfter", o.startingAfter);
      const qs = q.toString();
      return request(`/v2/sellers${qs ? `?${qs}` : ""}`, { method: "GET" }, parseSellerList);
    },
    getPayoutBalance() {
      return request(
        "/v2/balances",
        { method: "GET" },
        (j) => {
          const o = j && typeof j === "object" && !Array.isArray(j) ? (j as Record<string, unknown>) : null;
          if (!o) return null;
          const pending = o.pendingAmount;
          const available = o.availableAmount;
          const currency =
            (available && typeof available === "object" && typeof (available as { currency?: unknown }).currency === "string" ? (available as { currency: string }).currency : null) ?? "KRW";
          return { pendingAmount: amountOf(pending), availableAmount: amountOf(available), currency, raw: o };
        },
        8_000,
      );
    },
    requestPayouts(items, o) {
      return request("/v2/payouts", { method: "POST", body: items, encrypt: true, headers: { "Idempotency-Key": o.idempotencyKey } }, parsePayoutList, 20_000);
    },
    cancelPayout(id) {
      return request(`/v2/payouts/${encodeURIComponent(id)}/cancel`, { method: "POST" }, parseTossPayout);
    },
    getPayout(id) {
      return request(`/v2/payouts/${encodeURIComponent(id)}`, { method: "GET" }, parseTossPayout, 8_000);
    },
  };
}

/** 기본 인스턴스 — `configurePayouts()` 값을 호출 시점에 읽는다 */
const defaultApi = createTossPayouts();

export const registerSeller: TossPayoutsApi["registerSeller"] = (b) => defaultApi.registerSeller(b);
export const updateSeller: TossPayoutsApi["updateSeller"] = (id, b) => defaultApi.updateSeller(id, b);
export const deleteSeller: TossPayoutsApi["deleteSeller"] = (id) => defaultApi.deleteSeller(id);
export const getSeller: TossPayoutsApi["getSeller"] = (id) => defaultApi.getSeller(id);
export const listSellers: TossPayoutsApi["listSellers"] = (o) => defaultApi.listSellers(o);
export const getPayoutBalance: TossPayoutsApi["getPayoutBalance"] = () => defaultApi.getPayoutBalance();
export const requestPayouts: TossPayoutsApi["requestPayouts"] = (items, o) => defaultApi.requestPayouts(items, o);
export const cancelPayout: TossPayoutsApi["cancelPayout"] = (id) => defaultApi.cancelPayout(id);
export const getPayout: TossPayoutsApi["getPayout"] = (id) => defaultApi.getPayout(id);
