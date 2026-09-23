import { describe, expect, it } from "vitest";
import {
  BRAND_ACTION_MESSAGES,
  BRAND_FILTER_LABELS,
  BRAND_FILTERS,
  SUSPEND_BRAND_NOTE,
  autoProposeLabel,
  brandSearchHit,
  brandStatusChip,
  parseBrandFilter,
  productCountLine,
  settleInfoChip,
} from "../admin/brand-rules";

/**
 * 관리자 파트너 관리 — 브랜드 규칙(순수). DB 를 타는 `server/admin/brands.server.ts` 는
 * 결정 E(테스트는 순수 규칙만)에 따라 여기서 테스트하지 않고 화면 시나리오로 확인한다.
 */

describe("parseBrandFilter", () => {
  it("아는 값은 그대로", () => {
    for (const f of BRAND_FILTERS) expect(parseBrandFilter(f)).toBe(f);
  });
  it("모르는 값 · 빈 값 · null 은 all", () => {
    expect(parseBrandFilter("nope")).toBe("all");
    expect(parseBrandFilter("")).toBe("all");
    expect(parseBrandFilter(null)).toBe("all");
    expect(parseBrandFilter(undefined)).toBe("all");
  });
  it("필터마다 라벨이 있다", () => {
    for (const f of BRAND_FILTERS) expect(BRAND_FILTER_LABELS[f]).toBeTruthy();
  });
});

describe("brandStatusChip — 브랜드에는 hidden 이 없다", () => {
  it("활동 중 / 정지 둘뿐", () => {
    expect(brandStatusChip({ active: true })).toEqual({ label: "활동 중", tone: "green" });
    expect(brandStatusChip({ active: false })).toEqual({ label: "정지", tone: "red" });
  });
});

describe("settleInfoChip — 지급 보류 판정(M4)과 같은 방향", () => {
  it("계좌가 없으면 미등록", () => {
    expect(settleInfoChip({ has_bank_info: false, biz_no: "214-88-01234", has_tax_info: true })).toEqual({
      label: "미등록",
      tone: "amber",
    });
  });
  it("계좌만 있고 사업자번호가 없으면 일부", () => {
    expect(settleInfoChip({ has_bank_info: true, biz_no: null, has_tax_info: true }).label).toBe("일부");
  });
  it("계좌·사업자번호는 있고 세금계산서 정보가 없으면 일부", () => {
    expect(settleInfoChip({ has_bank_info: true, biz_no: "214-88-01234", has_tax_info: false }).label).toBe("일부");
  });
  it("셋 다 있으면 등록", () => {
    expect(settleInfoChip({ has_bank_info: true, biz_no: "214-88-01234", has_tax_info: true })).toEqual({
      label: "등록",
      tone: "green",
    });
  });
});

describe("productCountLine · autoProposeLabel", () => {
  it("데모 문구를 그대로", () => {
    expect(productCountLine({ products_listed: 3, products_pending: 1 })).toBe("노출 3 · 대기 1");
    expect(productCountLine({ products_listed: 0, products_pending: 0 })).toBe("노출 0 · 대기 0");
  });
  it("자동 제안은 ON/OFF", () => {
    expect(autoProposeLabel(true)).toBe("ON");
    expect(autoProposeLabel(false)).toBe("OFF");
  });
});

describe("brandSearchHit", () => {
  const b = { name: "바인허브", manager_name: "김바인", email: "partner@vyneherb.example", code: "b1", category: "건강기능식품" };
  it("빈 검색어는 전부 통과", () => {
    expect(brandSearchHit(b, "")).toBe(true);
    expect(brandSearchHit(b, "  ")).toBe(true);
  });
  it("상호 · 담당자 · 이메일 · code · 카테고리에서 찾는다", () => {
    expect(brandSearchHit(b, "바인허브")).toBe(true);
    expect(brandSearchHit(b, "김바인")).toBe(true);
    expect(brandSearchHit(b, "vyneherb")).toBe(true);
    expect(brandSearchHit(b, "b1")).toBe(true);
    expect(brandSearchHit(b, "건강")).toBe(true);
  });
  it("대소문자를 무시한다 (서버 ilike 와 같은 결과)", () => {
    expect(brandSearchHit(b, "VYNEHERB")).toBe(true);
  });
  it("없는 값은 false · null 필드에서 터지지 않는다", () => {
    expect(brandSearchHit(b, "글로헬스")).toBe(false);
    expect(brandSearchHit({ name: "글로헬스", manager_name: null, email: null, code: null, category: null }, "b1")).toBe(false);
  });
});

describe("문구", () => {
  it("액션 코드마다 문구가 있다", () => {
    for (const code of ["suspended", "reactivated", "auto_on", "auto_off", "celery_granted", "err_not_found", "err_input", "err"]) {
      expect(BRAND_ACTION_MESSAGES[code]).toBeTruthy();
    }
  });
  it("정지 경고는 listed 상품이 내려가지 않는다는 사실을 담는다 (brand-console-plan §8)", () => {
    expect(SUSPEND_BRAND_NOTE).toContain("판매 중");
    expect(SUSPEND_BRAND_NOTE).toContain("내려가지 않습니다");
  });
});
