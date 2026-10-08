/**
 * 캠페인 오픈 알림 — 순수 규칙 (0043). DB·메일 접근 없음.
 *
 * 발송 **창**과 버튼 **문구**를 여기 모은다. 서버 모듈(`server/campaign-alerts.server.ts`)은 이 판정을
 * 그대로 쓰고, 테스트는 이 파일만 본다(결정 E — 테스트는 순수 규칙만).
 */

/** 발송 창 시작 — KST 8시(이 시각부터 보낸다) */
export const ALERT_SEND_HOUR_FROM = 8;
/** 발송 창 끝 — KST 22시(이 시각 이후로는 보내지 않는다) */
export const ALERT_SEND_HOUR_TO = 22;

/**
 * 지금(KST 기준 시)이 오픈 알림을 보낼 시간인가.
 *
 * 캠페인은 KST 자정에 `LIVE` 가 된다(크론 `5 * * * *` → KST 00:05). 그 시각에 메일을 보내면 새벽 0시에
 * 도착한다 — 고객 경험이 나쁘고 야간 발송이기도 하다. 그래서 전이와 발송을 분리하고 **아침부터** 보낸다.
 * 크론은 매시 돌기 때문에 창에 들어온 첫 틱에서 그날 신청자 전원이 처리된다.
 */
export function inAlertSendWindow(kstHour: number): boolean {
  return Number.isInteger(kstHour) && kstHour >= ALERT_SEND_HOUR_FROM && kstHour < ALERT_SEND_HOUR_TO;
}

/** 지금의 KST 시(0~23) — `Date` 를 받아 테스트할 수 있게 둔다 */
export function kstHourOf(now: Date = new Date()): number {
  const s = now.toLocaleString("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false });
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n % 24 : 0;
}

/* ---------------- 버튼 · 안내 문구 ---------------- */

/**
 * 신청 상태 — `app_campaign_alert_state`(0043) 결과. **순수 모듈에 두는 이유**: UI(`@sellery/ui`)가
 * 이 타입을 prop 으로 받아야 하는데 서버 모듈(`server/campaign-alerts.server.ts`)은 import 할 수 없다
 * (경계 규칙 · docs/monorepo-migration.md §3.3). 서버 모듈이 여기서 가져다 쓴다.
 */
export type AlertState = {
  /** 지금 신청해 둔 상태인가(취소하지 않은 행이 있는가) */
  subscribed: boolean;
  /** 캠페인이 `SCHEDULE_CONFIRMED` 이고 이메일이 있는가 */
  canSubscribe: boolean;
  /** 계정에 이메일이 있는가 — 없으면 보낼 수단이 없다(카카오는 주지 않을 수 있다) */
  hasEmail: boolean;
};

export type AlertButtonView =
  | { kind: "subscribe"; label: string; hint: string }
  | { kind: "cancel"; label: string; hint: string }
  | { kind: "login"; label: string; hint: string }
  | { kind: "no_email"; label: string; hint: string }
  | { kind: "none" };

/**
 * 오픈 전 판매 페이지의 알림 버튼. **이메일이 등록된 회원만** 신청할 수 있다(0043 범위 결정) —
 * 비로그인은 로그인 안내, 이메일 없는 계정(카카오가 주지 않은 경우)은 받을 수 없다고 알린다.
 * 신청하지 않았는데 신청 가능한 상태가 아니면(이미 LIVE·종료 등) 버튼을 아예 두지 않는다.
 */
export function alertButtonView(state: {
  signedIn: boolean;
  subscribed: boolean;
  canSubscribe: boolean;
  hasEmail: boolean;
}): AlertButtonView {  if (state.subscribed) {
    return { kind: "cancel", label: "오픈 알림 신청됨 · 취소", hint: "판매가 시작되면 가입 이메일로 한 번 알려드려요." };
  }
  if (!state.signedIn) {
    return { kind: "login", label: "로그인하고 오픈 알림 받기", hint: "알림은 이메일로 보내드려요 — 로그인이 필요해요." };
  }
  if (!state.hasEmail) {
    return { kind: "no_email", label: "오픈 알림 받을 수 없음", hint: "알림은 이메일로만 보내드려요. 이 계정에는 이메일이 없어요." };
  }
  if (!state.canSubscribe) return { kind: "none" };
  return { kind: "subscribe", label: "오픈 알림 받기", hint: "판매가 시작되는 날 아침에 가입 이메일로 한 번 알려드려요." };
}

/** 신청·취소 결과 토스트 — 라우트가 `?msg=` 로 옮긴다 */
export const ALERT_MESSAGES: Record<string, string> = {
  on: "오픈 알림을 신청했어요 — 판매가 시작되는 날 아침에 이메일로 알려드려요.",
  on_already: "이미 신청해 두셨어요.",
  off: "오픈 알림을 취소했어요.",
  off_already: "이미 취소된 상태예요.",
  err_NOT_FOUND: "판매 페이지를 찾을 수 없어요.",
  err_WRONG_STATUS: "지금은 신청할 수 없어요 — 이미 판매가 시작되었거나 종료되었어요.",
  err_NO_EMAIL: "이 계정에는 이메일이 없어 알림을 보낼 수 없어요.",
  err_DB_ERROR: "잠시 후 다시 시도해주세요.",
};

export function alertMessage(key: string | null | undefined): string | null {
  if (!key) return null;
  return ALERT_MESSAGES[key] ?? null;
}
