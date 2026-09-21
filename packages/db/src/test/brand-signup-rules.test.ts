// 브랜드 가입 규칙 — packages/db/src/brand/signup-rules.ts (docs/brand-console-plan.md §3 · 0014 create_brand_from_signup 과 같은 조건)
import { describe, expect, it } from "vitest";
import {
  BIZ_NO_RE,
  BRAND_CATEGORIES,
  BRAND_NAME_MAX,
  MANAGER_NAME_MAX,
  PHONE_RE,
  isBrandCategory,
  isBrandSignupFailCode,
  normalizeBizNo,
  normalizePhone,
  parseBrandSignupMeta,
} from "../brand/signup-rules";

describe("BIZ_NO_RE · normalizeBizNo — 사업자등록번호", () => {
  it.each([
    ["214-88-01234", true, "214-88-01234"],
    ["2148801234", true, "214-88-01234"],
    ["214-8801234", true, "214-88-01234"],
    ["21488-01234", true, "214-88-01234"],
    ["214-88-0123", false, null],
    ["214-88-012345", false, null],
    ["abc-88-01234", false, null],
    ["", false, null],
  ])("%s → %s", (raw, ok, normalized) => {
    expect(BIZ_NO_RE.test(raw)).toBe(ok);
    expect(normalizeBizNo(raw)).toBe(normalized);
  });
});

describe("PHONE_RE · normalizePhone — 담당자 연락처 (0014 과 같은 하이픈 표기)", () => {
  it.each([
    ["010-1234-5678", "010-1234-5678"],
    ["01012345678", "010-1234-5678"],
    ["02-123-4567", "02-123-4567"],
    ["021234567", "02-123-4567"],
    ["02-1234-5678", "02-1234-5678"],
    ["031-123-4567", "031-123-4567"],
    ["0507-1234-5678", null], // 4자리 국번은 지원하지 않는다(0\d{1,2})
    ["1234-5678", null],
    ["010-12-5678", null],
    ["", null],
  ])("%s → %s", (raw, out) => {
    expect(normalizePhone(raw)).toBe(out);
    expect(PHONE_RE.test(raw)).toBe(out !== null);
  });
});

describe("BRAND_CATEGORIES · isBrandCategory", () => {
  it("0001 check 와 같은 두 값만", () => {
    expect(BRAND_CATEGORIES).toEqual(["건강기능식품", "이너뷰티"]);
    expect(isBrandCategory("건강기능식품")).toBe(true);
    expect(isBrandCategory("건기식")).toBe(false); // 데모 기본값 '건기식' 은 FK/check 위반 (plan §4 0015 메모)
    expect(isBrandCategory(null)).toBe(false);
  });
});

describe("parseBrandSignupMeta", () => {
  const good = {
    company_name: "바인허브",
    biz_no: "2148801234",
    manager_name: "김바인",
    manager_phone: "01012345678",
    category: "건강기능식품",
    ref: "glo-002",
    terms_agreed_at: true,
  };
  it("user_metadata → 검증·정규화된 메타", () => {
    const r = parseBrandSignupMeta(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.meta.name).toBe("바인허브");
      expect(r.meta.bizNo).toBe("214-88-01234");
      expect(r.meta.managerName).toBe("김바인");
      expect(r.meta.managerPhone).toBe("010-1234-5678");
      expect(r.meta.category).toBe("건강기능식품");
      expect(r.meta.referralCode).toBe("GLO-002");
      expect(Number.isNaN(Date.parse(r.meta.termsAgreedAt))).toBe(false);
    }
  });
  it("첫 번째 어긋난 필드를 돌려준다 (name → biz_no → manager_name → manager_phone → category → terms)", () => {
    expect(parseBrandSignupMeta({})).toMatchObject({ ok: false, field: "name" });
    expect(parseBrandSignupMeta({ name: "a".repeat(BRAND_NAME_MAX + 1) })).toMatchObject({ ok: false, field: "name" });
    expect(parseBrandSignupMeta({ name: "바인허브" })).toMatchObject({ ok: false, field: "biz_no" });
    expect(parseBrandSignupMeta({ name: "바인허브", biz_no: "214-88-0123" })).toMatchObject({ ok: false, field: "biz_no" });
    expect(parseBrandSignupMeta({ name: "바인허브", biz_no: "214-88-01234" })).toMatchObject({ ok: false, field: "manager_name" });
    expect(parseBrandSignupMeta({ name: "바인허브", biz_no: "214-88-01234", manager_name: "a".repeat(MANAGER_NAME_MAX + 1) })).toMatchObject({
      ok: false,
      field: "manager_name",
    });
    expect(parseBrandSignupMeta({ ...good, manager_phone: "1234" })).toMatchObject({ ok: false, field: "manager_phone" });
    expect(parseBrandSignupMeta({ ...good, category: "건기식" })).toMatchObject({ ok: false, field: "category" });
    expect(parseBrandSignupMeta({ ...good, terms_agreed_at: undefined })).toMatchObject({ ok: false, field: "terms" });
    expect(parseBrandSignupMeta({ ...good, terms_agreed_at: "not a date" })).toMatchObject({ ok: false, field: "terms" });
  });
  it("이모지는 상호·담당자에서 제거되고(cleanText) 문자열 ISO 는 그대로 · 추천 코드 형식 밖은 null(실패 아님)", () => {
    const r = parseBrandSignupMeta({ ...good, company_name: "바인허브🌿", manager_name: "김바인💚", ref: "ab", terms_agreed_at: "2026-09-21T00:00:00.000Z" });
    expect(r.ok && r.meta.name).toBe("바인허브");
    expect(r.ok && r.meta.managerName).toBe("김바인");
    expect(r.ok && r.meta.referralCode).toBeNull();
    expect(r.ok && r.meta.termsAgreedAt).toBe("2026-09-21T00:00:00.000Z");
  });
  it("배열·문자열 입력은 빈 객체로 취급", () => {
    expect(parseBrandSignupMeta([])).toMatchObject({ ok: false, field: "name" });
    expect(parseBrandSignupMeta("x")).toMatchObject({ ok: false, field: "name" });
  });
});

describe("isBrandSignupFailCode", () => {
  it("0014 코드 + 앱 코드만", () => {
    expect(isBrandSignupFailCode("BIZ_NO_TAKEN")).toBe(true);
    expect(isBrandSignupFailCode("EMAIL_TAKEN")).toBe(true);
    expect(isBrandSignupFailCode("HANDLE_TAKEN")).toBe(false); // 인플루언서 코드
    expect(isBrandSignupFailCode("toString")).toBe(false);
    expect(isBrandSignupFailCode(1)).toBe(false);
  });
});
