// MYR 크리에이터 계정 스크립트 순수 부분 — packages/db/scripts/lib/myr-creators-plan.mjs
import { describe, expect, it } from "vitest";
// @ts-expect-error — .mjs 모듈(타입 선언 없음)
import { PASSWORD_MIN, formatCreatorsTable, generatePassword, inviteRedirect, normEmail, passwordProblem } from "../../scripts/lib/myr-creators-plan.mjs";

describe("normEmail", () => {
  it("공백 제거 · 소문자 · 형식이 아니면 null", () => {
    expect(normEmail("  Minji@MYR.test ")).toBe("minji@myr.test");
    for (const bad of ["", "nope", "a@b", "a b@c.de", null, undefined]) expect(normEmail(bad)).toBeNull();
  });
});

describe("passwordProblem", () => {
  it("콘솔 로그인 규칙과 같은 8자 하한 · 72자 상한", () => {
    expect(PASSWORD_MIN).toBe(8);
    expect(passwordProblem("abcd1234")).toBeNull();
    expect(passwordProblem("short")).toContain("8자");
    expect(passwordProblem("a".repeat(73))).toContain("72자");
  });
});

describe("generatePassword", () => {
  it("14자 · 헷갈리는 글자 없음 · 숫자 포함 · 매번 다르다", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toHaveLength(14);
      expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]+$/);
      expect(p).toMatch(/\d/);
      expect(passwordProblem(p)).toBeNull();
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });
});

describe("inviteRedirect — 템플릿이 &token_hash 를 붙이므로 ? 쿼리가 있어야 한다", () => {
  it("콘솔 오리진 + /auth/confirm?next=/", () => {
    expect(inviteRedirect("https://myr-influencer.vercel.app")).toBe("https://myr-influencer.vercel.app/auth/confirm?next=%2F");
    expect(inviteRedirect("https://myr-influencer.vercel.app/some/path/")).toBe("https://myr-influencer.vercel.app/auth/confirm?next=%2F");
    expect(inviteRedirect("http://localhost:5179")).toBe("http://localhost:5179/auth/confirm?next=%2F");
  });
  it("주소가 없거나 http(s) 가 아니면 null", () => {
    for (const bad of [undefined, true, "", "myr-influencer.vercel.app", "ftp://x.com"]) expect(inviteRedirect(bad)).toBeNull();
  });
});

describe("formatCreatorsTable", () => {
  it("머리줄 + 크리에이터 줄 · 미연결 · 정지 표시", () => {
    const t = formatCreatorsTable([
      { handle: "@minji.routine", name: "민지 루틴", total: 3, listed: 2, active: true, email: "minji@myr.test" },
      { handle: "@jun.fit", name: "준 피트", total: 1, listed: 1, active: false, email: null }
    ]);
    const lines = t.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("@minji.routine\t민지 루틴\t2/3\tY\tminji@myr.test");
    expect(lines[2]).toBe("@jun.fit\t준 피트\t1/1\tN(정지)\t(미연결)");
    expect(formatCreatorsTable([])).toBe("(없음)");
  });
});
