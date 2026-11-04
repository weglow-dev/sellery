// MYR 초대 스크립트 순수 부분 — packages/db/scripts/lib/myr-invites-plan.mjs (0070)
import { describe, expect, it } from "vitest";
// @ts-expect-error — .mjs 모듈(타입 선언 없음)
import { DEFAULT_CONSOLE_URL, consoleBase, formatInvitesTable } from "../../scripts/lib/myr-invites-plan.mjs";

describe("consoleBase", () => {
  it("http(s) 오리진만 · 끝 슬래시 정리", () => {
    expect(consoleBase(DEFAULT_CONSOLE_URL)).toBe("https://myr-influencer.vercel.app");
    expect(consoleBase("http://localhost:5179/")).toBe("http://localhost:5179");
    for (const bad of ["", "myr-influencer.vercel.app", "https://x.app/invite", "ftp://x", null]) expect(consoleBase(bad), String(bad)).toBeNull();
  });
});

describe("formatInvitesTable", () => {
  const row = (o: Record<string, unknown>) => ({ email: "a@myr.kr", state: "pending", created_at: "2026-11-04T01:00:00Z", expires_at: "2026-11-11T01:00:00Z", requested_at: null, request_count: 0, revoked_reason: null, seller: null, ...o });
  it("빈 목록", () => expect(formatInvitesTable([])).toBe("  (없음)"));
  it("상태 한글 · 재발급 취소 구분 · 요청 횟수 · 가입한 크리에이터 · 토큰은 없음", () => {
    const t = formatInvitesTable([
      row({}),
      row({ email: "b@myr.kr", state: "revoked", revoked_reason: "reissued" }),
      row({ email: "c@myr.kr", state: "expired", requested_at: "2026-11-12T03:00:00Z", request_count: 2 }),
      row({ email: "d@myr.kr", state: "used", seller: { handle: "@minji.new", name: "민지" } }),
    ]);
    expect(t).toContain("대기");
    expect(t).toContain("취소(재발급)");
    expect(t).toMatch(/c@myr\.kr\s+만료.*×2/);
    expect(t).toContain("@minji.new 민지");
    expect(t).not.toContain("token");
  });
});
