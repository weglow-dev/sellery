/**
 * 거래 메일 설정 주입 + 발송 — 앱의 `$lib/server/env.ts` 가 `$env/dynamic/private` 의 `RESEND_API_KEY`(·`RESEND_API_URL`) 와 `PUBLIC_SITE_URL` 오리진을
 * 모듈 로드 시 1회 넘긴다 (`configureDb` · `configurePayments` 와 같은 규칙 — 패키지는 `$env` 도 `process.env` 도 읽지 않는다).
 *
 *   configureMail({ apiKey: env.RESEND_API_KEY, apiUrl: env.RESEND_API_URL, siteUrl: SITE_URL });
 *
 * 키가 없어도 configure 는 실패하지 않는다 — `sendMail()` 이 비활성 경로({ ok:false, reason:'disabled' } · 프로세스당 1회 안내)로 조용히 끝난다.
 * 전송 규칙(멱등 키 · 절대 throw 하지 않음 · 24시간 중복 방지)은 `../mail/resend.ts`. 이벤트별 조회·조립은 `./mail-events.server.ts`.
 * 어디에 어떤 이름을 넣는지는 docs/deploy.md §1.2 · §5.7.
 */
import { createMailer, type MailMessage, type MailSendResult, type Mailer } from "../mail/resend";
import { MAIL_FROM_DEFAULT } from "../mail/layout";
import type { MailCtx } from "../mail/templates";

export type MailConfig = {
  /** RESEND_API_KEY — 없으면 발송 비활성 */
  apiKey?: string;
  /** 발신자 — 기본 `Sellery <noreply@sellery.life>` (Resend Verified 도메인 주소만) */
  from?: string;
  /** RESEND_API_URL — 기본 https://api.resend.com (로컬 목 서버 검증용) */
  apiUrl?: string;
  /** PUBLIC_SITE_URL 오리진 — 메일 링크의 절대 URL. 없으면 https://sellery.life */
  siteUrl?: string;
};

let config: MailConfig = {};
let mailer: Mailer | null = null;

export function configureMail(next: MailConfig): void {
  const clean: MailConfig = {};
  for (const k of ["apiKey", "from", "apiUrl", "siteUrl"] as const) {
    const v = next[k];
    if (typeof v === "string" && v.trim()) clean[k] = v.trim();
    else if (k in next) clean[k] = undefined;
  }
  config = { ...config, ...clean };
  mailer = null; // 다음 발송 때 새 설정으로 다시 만든다
}

export function mailConfig(): Readonly<MailConfig> {
  return config;
}

/** 템플릿 컨텍스트 — siteUrl 은 끝 슬래시 없는 오리진 */
export function mailCtx(): MailCtx {
  return { siteUrl: (config.siteUrl ?? "https://sellery.life").replace(/\/+$/, "") };
}

export function isMailEnabled(): boolean {
  return !!config.apiKey;
}

function getMailer(): Mailer {
  if (!mailer) mailer = createMailer({ apiKey: config.apiKey, from: config.from ?? MAIL_FROM_DEFAULT, apiUrl: config.apiUrl });
  return mailer;
}

/** 절대 throw 하지 않는다 — 결과는 로그용. 호출자는 `await` 해도 되고(서버리스에서 응답 전에 끝내려면 권장) `void` 로 흘려도 된다. */
export async function sendMail(msg: MailMessage): Promise<MailSendResult> {
  try {
    return await getMailer().send(msg);
  } catch (e) {
    console.error("[mail] send threw:", e instanceof Error ? e.message : e);
    return { ok: false, reason: "network", message: e instanceof Error ? e.message : String(e) };
  }
}

/** 테스트 전용 — 설정을 비운다 */
export function resetMailConfig(): void {
  config = {};
  mailer = null;
}

export type { MailMessage, MailSendResult } from "../mail/resend";
