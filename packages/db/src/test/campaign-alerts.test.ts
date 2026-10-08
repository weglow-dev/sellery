import { describe, expect, it } from "vitest";
import {
  ALERT_MESSAGES,
  ALERT_SEND_HOUR_FROM,
  ALERT_SEND_HOUR_TO,
  alertButtonView,
  alertMessage,
  inAlertSendWindow,
  kstHourOf,
} from "../campaign-alerts";

/**
 * 오픈 알림 순수 규칙 (0043) — 발송 창과 버튼 문구.
 * DB·메일을 타는 `server/campaign-alerts.server.ts` 는 결정 E 에 따라 여기서 테스트하지 않고 DB 스모크로 확인한다.
 */

describe("inAlertSendWindow — 아침 발송 창", () => {
  it("KST 8시부터 22시 직전까지만 보낸다", () => {
    expect(inAlertSendWindow(ALERT_SEND_HOUR_FROM)).toBe(true);
    expect(inAlertSendWindow(12)).toBe(true);
    expect(inAlertSendWindow(ALERT_SEND_HOUR_TO - 1)).toBe(true);
  });

  it("전이 시각(KST 0시대)에는 보내지 않는다 — 새벽 메일 방지가 이 창의 목적", () => {
    expect(inAlertSendWindow(0)).toBe(false);
    expect(inAlertSendWindow(1)).toBe(false);
    expect(inAlertSendWindow(7)).toBe(false);
  });

  it("밤에는 보내지 않는다", () => {
    expect(inAlertSendWindow(ALERT_SEND_HOUR_TO)).toBe(false);
    expect(inAlertSendWindow(23)).toBe(false);
  });

  it("정수가 아니거나 범위를 벗어난 값은 false", () => {
    expect(inAlertSendWindow(8.5)).toBe(false);
    expect(inAlertSendWindow(Number.NaN)).toBe(false);
    expect(inAlertSendWindow(-1)).toBe(false);
  });
});

describe("kstHourOf", () => {
  it("UTC 15:00 = KST 0시 (전이 시각 — 창 밖이어야 한다)", () => {
    const h = kstHourOf(new Date("2026-10-08T15:00:00Z"));
    expect(h).toBe(0);
    expect(inAlertSendWindow(h)).toBe(false);
  });

  it("UTC 23:05 = KST 8시 (창 안 — 그날 첫 발송 틱)", () => {
    const h = kstHourOf(new Date("2026-10-08T23:05:00Z"));
    expect(h).toBe(8);
    expect(inAlertSendWindow(h)).toBe(true);
  });

  it("UTC 05:05 = KST 14시 (창 안)", () => {
    expect(kstHourOf(new Date("2026-10-08T05:05:00Z"))).toBe(14);
  });
});

describe("alertButtonView — 이메일 등록 회원만 신청 가능", () => {
  const base = { signedIn: true, subscribed: false, canSubscribe: true, hasEmail: true };

  it("신청 가능한 회원에게는 신청 버튼", () => {
    const v = alertButtonView(base);
    expect(v.kind).toBe("subscribe");
    if (v.kind !== "none") expect(v.label).not.toBe("");
  });

  it("이미 신청했으면 취소 버튼 — 다른 조건보다 먼저 본다", () => {
    expect(alertButtonView({ ...base, subscribed: true }).kind).toBe("cancel");
    // 캠페인이 이미 LIVE 로 넘어가도 신청한 사람에게는 취소 경로를 남긴다
    expect(alertButtonView({ ...base, subscribed: true, canSubscribe: false }).kind).toBe("cancel");
  });

  it("비로그인은 로그인 안내", () => {
    expect(alertButtonView({ ...base, signedIn: false }).kind).toBe("login");
  });

  it("이메일 없는 계정은 받을 수 없다고 알린다 (카카오가 주지 않은 경우)", () => {
    expect(alertButtonView({ ...base, hasEmail: false, canSubscribe: false }).kind).toBe("no_email");
  });

  it("신청할 수 없는 상태(이미 LIVE·종료)면 버튼을 두지 않는다", () => {
    expect(alertButtonView({ ...base, canSubscribe: false }).kind).toBe("none");
  });

  it("버튼이 있는 경우는 문구가 비어 있지 않다", () => {
    for (const s of [base, { ...base, subscribed: true }, { ...base, signedIn: false }, { ...base, hasEmail: false, canSubscribe: false }]) {
      const v = alertButtonView(s);
      if (v.kind === "none") continue;
      expect(v.label, v.kind).not.toBe("");
      expect(v.hint, v.kind).not.toBe("");
    }
  });
});

describe("alertMessage", () => {
  it("아는 키만 문구로 바꾼다", () => {
    expect(alertMessage("on")).toBe(ALERT_MESSAGES.on);
    expect(alertMessage("err_NO_EMAIL")).toBe(ALERT_MESSAGES.err_NO_EMAIL);
  });

  it("모르는 키·빈 값은 null — 주소로 들어온 값을 그대로 반사하지 않는다", () => {
    expect(alertMessage("wat")).toBeNull();
    expect(alertMessage("")).toBeNull();
    expect(alertMessage(null)).toBeNull();
    expect(alertMessage(undefined)).toBeNull();
    expect(alertMessage("<script>")).toBeNull();
  });
});
