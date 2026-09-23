/**
 * Resend HTTP API 전송기 — 순수 모듈(설정·환경을 읽지 않는다 · fetch 주입 가능 → 테스트 src/test/mail-resend.test.ts).
 * 서버에서는 `../server/mail.server.ts` 의 `sendMail()` 이 `configureMail()` 값으로 인스턴스를 만들어 쓴다.
 *
 * 규칙
 *   - API 키가 없으면 **비활성** — 첫 호출에 한 번만 console.info 를 남기고 { ok:false, reason:'disabled' }. 로컬·CI·Preview 는 이 경로.
 *   - 절대 throw 하지 않는다 — 네트워크·4xx·5xx·타임아웃 전부 { ok:false } + console.error. 주문·환불·발송 흐름을 메일이 막지 않는다.
 *   - `Idempotency-Key` 헤더(Resend 지원 · 24시간) = 템플릿의 idempotencyKey → 같은 이벤트를 다시 훅해도(웹훅 재시도 · 새로고침) 한 통.
 *     프로세스 안에서도 같은 키를 24시간 기억해(`GUARD_TTL_MS`) API 호출 자체를 건너뛴다({ ok:false, reason:'duplicate' }).
 *   - 받는 주소 형식이 아니면 { ok:false, reason:'invalid' } (비회원 이메일 없음 · 시드 `*.example` 은 형식상 유효 — Resend 가 거른다).
 */

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Resend tag `event` 값 — ASCII 영숫자 · _ · - 만 */
  tag?: string;
  idempotencyKey: string;
};

export type MailSendResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: "disabled" | "duplicate" | "invalid" | "http" | "network"; status?: number; message?: string };

export type MailerOptions = {
  apiKey?: string | null;
  /** 발신자 — 기본 `Sellery <noreply@sellery.life>` */
  from?: string | null;
  /** Resend API 베이스 — 기본 https://api.resend.com (로컬 검증용 목 서버로 바꿀 수 있다 · RESEND_API_URL) */
  apiUrl?: string | null;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
};

export type Mailer = {
  enabled: boolean;
  send(msg: MailMessage): Promise<MailSendResult>;
};

export const RESEND_API_URL_DEFAULT = "https://api.resend.com";
export const MAIL_FROM_FALLBACK = "Sellery <noreply@sellery.life>";
/** 프로세스 내 중복 방지 창 — Resend 의 Idempotency-Key 보존 기간과 같은 24시간 */
export const GUARD_TTL_MS = 24 * 60 * 60 * 1000;
const GUARD_MAX = 5000;
const DEFAULT_TIMEOUT_MS = 8_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAG_RE = /^[A-Za-z0-9_-]+$/;

/**
 * 실제로 배달될 수 없는 예약 도메인(RFC 2606/6761 `.example` `.test` `.invalid` `.localhost` · `example.com/net/org`) 과 시드 전용 `@sellery.demo`.
 * 시드 브랜드(`official@glohealth.example` 등)·데모 인플루언서에게 보내면 Resend 에서 반송(bounce)되고, 같은 Resend 계정을 쓰는
 * 다른 프로젝트의 반송 웹훅(vyneherb CS 슬랙)까지 울린다 — 2026-09-23 실제 발생. 형식은 유효해도 보내지 않는다.
 */
const RESERVED_DOMAIN_RE = /(\.(example|test|invalid|localhost)|@(example\.(com|net|org)|sellery\.demo))$/i;

export function isReservedAddress(v: string): boolean {
  return RESERVED_DOMAIN_RE.test(v.trim());
}

export function isEmailAddress(v: string | null | undefined): v is string {
  return typeof v === "string" && EMAIL_RE.test(v.trim()) && v.trim().length <= 254 && !isReservedAddress(v);
}

/**
 * HTTP 헤더 값은 ByteString(Latin-1)이어야 한다 — 한글(택배사 이름 등)이 섞이면 fetch 가 throw 한다.
 * 비ASCII·공백·제어 문자를 코드포인트 16진수(`u{ac00}` 꼴 대신 `_ac00_`)로 바꿔 **결정적·충돌 없이** ASCII 로 만든다. 멱등 키 전용.
 */
export function asciiToken(s: string): string {
  return s.replace(/[^\x21-\x7e]/g, (c) => `_${c.codePointAt(0)!.toString(16)}_`);
}

export function createMailer(opts: MailerOptions = {}): Mailer {
  const apiKey = typeof opts.apiKey === "string" && opts.apiKey.trim() ? opts.apiKey.trim() : null;
  const from = typeof opts.from === "string" && opts.from.trim() ? opts.from.trim() : MAIL_FROM_FALLBACK;
  const apiUrl = (typeof opts.apiUrl === "string" && opts.apiUrl.trim() ? opts.apiUrl.trim() : RESEND_API_URL_DEFAULT).replace(/\/+$/, "");
  const fetchFn = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = opts.now ?? Date.now;
  const guard = new Map<string, number>();
  let warnedDisabled = false;

  function seen(key: string): boolean {
    const t = now();
    const prev = guard.get(key);
    if (prev !== undefined && t - prev < GUARD_TTL_MS) return true;
    if (guard.size >= GUARD_MAX) {
      for (const [k, v] of guard) if (t - v >= GUARD_TTL_MS) guard.delete(k);
      if (guard.size >= GUARD_MAX) guard.delete(guard.keys().next().value as string);
    }
    guard.set(key, t);
    return false;
  }

  async function send(msg: MailMessage): Promise<MailSendResult> {
    if (!apiKey) {
      if (!warnedDisabled) {
        warnedDisabled = true;
        console.info("[mail] RESEND_API_KEY 가 없어 거래 메일을 보내지 않습니다 (이 프로세스에서 한 번만 안내) —", msg.subject);
      }
      return { ok: false, reason: "disabled" };
    }
    const to = (msg.to ?? "").trim();
    if (!isEmailAddress(to)) return { ok: false, reason: "invalid", message: "recipient" };
    if (!msg.idempotencyKey) return { ok: false, reason: "invalid", message: "idempotencyKey" };
    const key = asciiToken(msg.idempotencyKey).slice(0, 200); // 템플릿이 이미 ASCII 로 주지만 헤더 안전을 여기서도 보장
    if (seen(key)) return { ok: false, reason: "duplicate" };

    const body: Record<string, unknown> = { from, to: [to], subject: msg.subject, html: msg.html, text: msg.text };
    if (msg.tag && TAG_RE.test(msg.tag)) body.tags = [{ name: "event", value: msg.tag }];

    try {
      const res = await fetchFn(`${apiUrl}/emails`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      if (!res.ok) {
        const o = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
        const message = typeof o.message === "string" ? o.message : `HTTP ${res.status}`;
        // 같은 키·같은 본문의 재요청은 Resend 가 첫 응답을 돌려준다(200). 409 는 같은 키·다른 본문 — 이미 보낸 것으로 취급하고 조용히 넘긴다.
        if (res.status === 409) return { ok: false, reason: "duplicate", status: 409, message };
        guard.delete(key); // 실패한 키는 다음 훅이 다시 시도할 수 있게
        console.error("[mail] resend responded", res.status, message, "—", msg.subject);
        return { ok: false, reason: "http", status: res.status, message };
      }
      const o = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
      return { ok: true, id: typeof o.id === "string" ? o.id : null };
    } catch (e) {
      guard.delete(key);
      const message = e instanceof Error ? e.message : String(e);
      console.error("[mail] resend request failed:", message, "—", msg.subject);
      return { ok: false, reason: "network", message };
    }
  }

  return { enabled: apiKey !== null, send };
}
