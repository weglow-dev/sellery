import { describe, expect, it } from "vitest";
import { PLAT_RATE } from "@sellery/core/constants";
import {
  CATEGORY_POLICY_NOTE,
  PRODUCT_ACTION_MESSAGES,
  PRODUCT_STATUSES,
  PRODUCT_STATUS_LABELS,
  REVIEW_FAIL_MESSAGES,
  nextListingDecision,
  parseProductStatusFilter,
  productSearchHit,
  productStatusChip,
  reviewFailMessage,
  totalFeeLine,
} from "../admin/product-rules";

/**
 * 관리자 파트너 관리 — 상품 검수 규칙(순수). DB 를 타는 `server/admin/products.server.ts` 는
 * 결정 E(테스트는 순수 규칙만)에 따라 여기서 테스트하지 않고 화면 시나리오로 확인한다.
 */

describe("productStatusChip", () => {
  it("네 상태 모두 문구·색이 있다", () => {
    expect(productStatusChip("pending")).toEqual({ label: "검수 대기", tone: "amber" });
    expect(productStatusChip("listed")).toEqual({ label: "노출 중", tone: "green" });
    expect(productStatusChip("paused")).toEqual({ label: "노출 중단", tone: "gray" });
    expect(productStatusChip("rejected")).toEqual({ label: "반려", tone: "red" });
  });
  it("모르는 값은 그대로 회색", () => {
    expect(productStatusChip("weird")).toEqual({ label: "weird", tone: "gray" });
  });
  it("상태마다 라벨이 있다", () => {
    for (const s of PRODUCT_STATUSES) expect(PRODUCT_STATUS_LABELS[s]).toBeTruthy();
  });
});

describe("parseProductStatusFilter", () => {
  it("아는 값은 그대로", () => {
    for (const s of PRODUCT_STATUSES) expect(parseProductStatusFilter(s)).toBe(s);
  });
  it("모르는 값 · 빈 값 · null 은 null(전체)", () => {
    expect(parseProductStatusFilter("nope")).toBeNull();
    expect(parseProductStatusFilter("")).toBeNull();
    expect(parseProductStatusFilter(null)).toBeNull();
    expect(parseProductStatusFilter(undefined)).toBeNull();
  });
});

describe("totalFeeLine — commission_rate 는 인플루언서 몫, 플랫폼은 상수", () => {
  it("인플 20% + 플랫폼 10% = 30%", () => {
    expect(PLAT_RATE).toBe(0.1);
    expect(totalFeeLine(0.2)).toEqual({ total: "30%", detail: "인플 20 + 플랫폼 10" });
  });
  it("최소 요율(5%)도 더한다", () => {
    expect(totalFeeLine(0.05)).toEqual({ total: "15%", detail: "인플 5 + 플랫폼 10" });
  });
  it("소수는 반올림한다", () => {
    expect(totalFeeLine(0.185).detail).toBe("인플 19 + 플랫폼 10");
  });
});

describe("nextListingDecision — 데모 toggleListing 과 같은 동작", () => {
  it("노출 중이면 pause", () => {
    expect(nextListingDecision("listed")).toEqual({ decision: "pause", label: "노출 중단" });
  });
  it("노출 중단이면 approve(재개)", () => {
    expect(nextListingDecision("paused")).toEqual({ decision: "approve", label: "재개" });
  });
});

describe("reviewFailMessage — 0015 실패 코드", () => {
  it("코드마다 문구가 있다", () => {
    for (const code of ["NOT_FOUND", "BAD_DECISION", "BAD_REASON", "WRONG_STATUS", "DB_ERROR"]) {
      expect(REVIEW_FAIL_MESSAGES[code]).toBeTruthy();
      expect(reviewFailMessage(code)).toBe(REVIEW_FAIL_MESSAGES[code]);
    }
  });
  it("모르는 코드 · null 은 DB_ERROR 문구로 떨어진다", () => {
    expect(reviewFailMessage("WHAT")).toBe(REVIEW_FAIL_MESSAGES.DB_ERROR);
    expect(reviewFailMessage(null)).toBe(REVIEW_FAIL_MESSAGES.DB_ERROR);
    expect(reviewFailMessage(undefined)).toBe(REVIEW_FAIL_MESSAGES.DB_ERROR);
  });
  it("BAD_REASON 은 200자 제한을 알려 준다", () => {
    expect(REVIEW_FAIL_MESSAGES.BAD_REASON).toContain("200");
  });
  it("WRONG_STATUS 는 노출 중만 중단 가능함을 알려 준다", () => {
    expect(REVIEW_FAIL_MESSAGES.WRONG_STATUS).toContain("노출 중");
  });
});

describe("PRODUCT_ACTION_MESSAGES", () => {
  it("서버가 돌려주는 코드마다 문구가 있다", () => {
    for (const code of ["approved", "approved_already", "rejected", "paused", "resumed", "err_input", "err"]) {
      expect(PRODUCT_ACTION_MESSAGES[code]).toBeTruthy();
    }
  });
});

describe("productSearchHit", () => {
  const p = {
    name: "버닝온 다이어트",
    description: "체지방 감소 기능성",
    code: "p4",
    category: "다이어트·체형",
    brand_name: "바인허브",
  };
  it("빈 검색어는 전부 통과", () => {
    expect(productSearchHit(p, "")).toBe(true);
  });
  it("상품명 · 설명 · code · 카테고리 · 브랜드명에서 찾는다", () => {
    expect(productSearchHit(p, "버닝온")).toBe(true);
    expect(productSearchHit(p, "체지방")).toBe(true);
    expect(productSearchHit(p, "p4")).toBe(true);
    expect(productSearchHit(p, "다이어트")).toBe(true);
    expect(productSearchHit(p, "바인허브")).toBe(true);
  });
  it("없는 값은 false · null 필드에서 터지지 않는다", () => {
    expect(productSearchHit(p, "콜라겐")).toBe(false);
    expect(productSearchHit({ name: "X", description: null, code: null, category: null, brand_name: null }, "p4")).toBe(false);
  });
});

describe("카테고리 정책 안내", () => {
  it("건강·웰니스 한정과 표시광고 사전 심의를 함께 담는다", () => {
    expect(CATEGORY_POLICY_NOTE).toContain("건강·웰니스");
    expect(CATEGORY_POLICY_NOTE).toContain("사전 심의");
  });
});
