// 콘솔 경로 — 경로 모드만 (web/src/lib/hosts.ts 의 consolePath 경로 모드 분기와 같은 결과)
import { describe, expect, it } from "vitest";
import { CONSOLE_PUBLIC_PATHS, consolePath, consoleUrl, isConsolePublicPath } from "../console-paths";

describe("consolePath", () => {
  it("항상 접두 붙은 상대 경로", () => {
    expect(consolePath("seller", "/apply")).toBe("/influencer/apply");
    expect(consolePath("seller", "apply")).toBe("/influencer/apply");
    expect(consolePath("seller", "/")).toBe("/influencer");
    expect(consolePath("brand", "/home")).toBe("/brand/home");
  });
});

describe("consoleUrl", () => {
  it("siteUrl 이 있으면 절대 URL, 없으면 상대 경로", () => {
    expect(consoleUrl("seller", "/home", "https://sellery.life/")).toBe("https://sellery.life/influencer/home");
    expect(consoleUrl("seller", "/home", "")).toBe("/influencer/home");
    expect(consoleUrl("seller", "/home", null)).toBe("/influencer/home");
  });
});

describe("isConsolePublicPath", () => {
  it("정확 일치 또는 하위 경로", () => {
    for (const p of CONSOLE_PUBLIC_PATHS) expect(isConsolePublicPath(p)).toBe(true);
    expect(isConsolePublicPath("/password/new")).toBe(true);
    expect(isConsolePublicPath("/login/x")).toBe(true);
    expect(isConsolePublicPath("/loginx")).toBe(false);
    expect(isConsolePublicPath("/home")).toBe(false);
  });
});
