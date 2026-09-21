// 파트너 가입 규칙 — web/src/lib/partner/signup-rules.ts 의 동작 (docs/inf-console-plan.md §4.1 · 프로토타입 login.html fJoin)
import { describe, expect, it } from "vitest";
import {
  HANDLE_RE,
  NAME_MAX,
  PASSWORD_RE,
  PLATFORMS,
  isPlatform,
  isSignupFailCode,
  normalizeHandleInput,
  normalizeReferralInput,
  parseSignupMeta,
} from "../partner/signup-rules";

describe("PASSWORD_RE — 영문+숫자 8자 이상", () => {
  it.each([
    ["sellery2026", true],
    ["abcdefg1", true],
    ["1234567a", true],
    ["abcdefgh", false],
    ["12345678", false],
    ["abc1234", false],
    ["", false],
  ])("%s → %s", (pw, ok) => {
    expect(PASSWORD_RE.test(pw)).toBe(ok);
  });
});

describe("isPlatform · PLATFORMS", () => {
  it("4개 플랫폼만", () => {
    expect(PLATFORMS).toEqual(["instagram", "youtube", "naver", "tiktok"]);
    expect(isPlatform("instagram")).toBe(true);
    expect(isPlatform("Instagram")).toBe(false);
    expect(isPlatform("facebook")).toBe(false);
    expect(isPlatform(null)).toBe(false);
  });
});

describe("핸들 · 추천 코드 정규화", () => {
  it("HANDLE_RE ^@?[A-Za-z0-9._]{2,30}$", () => {
    expect(HANDLE_RE.test("@jiyu_beauty")).toBe(true);
    expect(HANDLE_RE.test("jiyu.beauty")).toBe(true);
    expect(HANDLE_RE.test("a")).toBe(false);
    expect(HANDLE_RE.test("@jiyu-beauty")).toBe(false);
    expect(HANDLE_RE.test("a".repeat(31))).toBe(false);
  });
  it("normalizeHandleInput: 공백·앞 @ 제거·소문자", () => {
    expect(normalizeHandleInput("  @@Jiyu_Beauty ")).toBe("jiyu_beauty");
  });
  it("normalizeReferralInput: 대문자 정규화, 형식 밖이면 null(실패 아님)", () => {
    expect(normalizeReferralInput(" jiyu10 ")).toBe("JIYU10");
    expect(normalizeReferralInput("ab")).toBeNull();
    expect(normalizeReferralInput("")).toBeNull();
    expect(normalizeReferralInput(42)).toBeNull();
  });
});

describe("parseSignupMeta", () => {
  const good = { display_name: "지유", platform: "Instagram", handle: "@Jiyu_Beauty", ref: "jiyu10", terms_agreed_at: true };
  it("user_metadata → 검증·정규화된 메타", () => {
    const r = parseSignupMeta(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.meta.name).toBe("지유");
      expect(r.meta.platform).toBe("instagram");
      expect(r.meta.handle).toBe("jiyu_beauty");
      expect(r.meta.referralCode).toBe("JIYU10");
      expect(Number.isNaN(Date.parse(r.meta.termsAgreedAt))).toBe(false);
    }
  });
  it("첫 번째 어긋난 필드를 돌려준다 (name → platform → handle → terms)", () => {
    expect(parseSignupMeta({})).toMatchObject({ ok: false, field: "name" });
    expect(parseSignupMeta({ name: "a".repeat(NAME_MAX + 1) })).toMatchObject({ ok: false, field: "name" });
    expect(parseSignupMeta({ name: "지유" })).toMatchObject({ ok: false, field: "platform" });
    expect(parseSignupMeta({ name: "지유", platform: "naver", handle: "a" })).toMatchObject({ ok: false, field: "handle" });
    expect(parseSignupMeta({ name: "지유", platform: "naver", handle: "ok_handle" })).toMatchObject({ ok: false, field: "terms" });
    expect(parseSignupMeta({ ...good, terms_agreed_at: "not a date" })).toMatchObject({ ok: false, field: "terms" });
  });
  it("이모지는 활동명에서 제거되고(cleanText) 문자열 ISO 는 그대로 정규화", () => {
    const r = parseSignupMeta({ ...good, display_name: "지유💙", terms_agreed_at: "2026-09-21T00:00:00.000Z" });
    expect(r.ok && r.meta.name).toBe("지유");
    expect(r.ok && r.meta.termsAgreedAt).toBe("2026-09-21T00:00:00.000Z");
  });
  it("배열·문자열 입력은 빈 객체로 취급", () => {
    expect(parseSignupMeta([])).toMatchObject({ ok: false, field: "name" });
    expect(parseSignupMeta("x")).toMatchObject({ ok: false, field: "name" });
  });
});

describe("isSignupFailCode", () => {
  it("0010 코드 + 앱 코드만", () => {
    expect(isSignupFailCode("HANDLE_TAKEN")).toBe(true);
    expect(isSignupFailCode("DB_ERROR")).toBe(true);
    expect(isSignupFailCode("toString")).toBe(false);
    expect(isSignupFailCode(1)).toBe(false);
  });
});
