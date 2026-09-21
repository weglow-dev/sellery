// linkCtxFromCard · custVisible · LINK_CODE_RE — web/src/lib/linkctx.ts 의 동작 (docs/app-plan.md §8 · docs/monorepo-migration.md §8.1)
import { describe, expect, it } from "vitest";
import { LINKCTX_COOKIE, LINKCTX_MAX_AGE, LINK_CODE_RE, custVisible, linkCtxFromCard, type LinkCtx } from "../linkctx";

function card(over: { end_date?: string | null; today?: string; link_protect_days?: unknown } = {}) {
  return {
    campaign: { id: "c-uuid", code: "c1", end_date: over.end_date ?? "2026-09-20", today: over.today ?? "2026-09-21" },
    product: { id: "p1", category: "다이어트·체형" },
    seller: { id: "s1", name: "지유" },
    settings: { link_protect_days: over.link_protect_days ?? 7 },
  };
}

describe("linkCtxFromCard", () => {
  it("최소 필드를 좁혀 LinkCtx 로", () => {
    expect(linkCtxFromCard(card(), "c1")).toEqual<LinkCtx>({
      code: "c1",
      sellerId: "s1",
      productId: "p1",
      category: "다이어트·체형",
      sellerName: "지유",
    });
  });

  it("보호 기간: today − end_date > link_protect_days 면 null, 같으면 유지", () => {
    expect(linkCtxFromCard(card({ end_date: "2026-09-14", today: "2026-09-21" }), "c1")).not.toBeNull(); // 7일 = 경계 유지
    expect(linkCtxFromCard(card({ end_date: "2026-09-13", today: "2026-09-21" }), "c1")).toBeNull(); // 8일
    expect(linkCtxFromCard(card({ end_date: "2026-09-13", today: "2026-09-21", link_protect_days: 10 }), "c1")).not.toBeNull();
    // settings 가 비정상이면 기본 7일
    expect(linkCtxFromCard(card({ end_date: "2026-09-13", today: "2026-09-21", link_protect_days: "x" }), "c1")).toBeNull();
  });

  it("end_date 가 없으면(진행 중·예정) 보호 유지", () => {
    expect(linkCtxFromCard(card({ end_date: null }), "c1")).not.toBeNull();
  });

  it("형식이 어긋나면 null (필수 필드 누락 · 객체 아님)", () => {
    expect(linkCtxFromCard(null, "c1")).toBeNull();
    expect(linkCtxFromCard("x", "c1")).toBeNull();
    expect(linkCtxFromCard({ campaign: {}, product: {}, seller: {} }, "c1")).toBeNull();
    const c = card();
    expect(linkCtxFromCard({ ...c, product: { id: "p1" } }, "c1")).toBeNull();
  });
});

describe("custVisible — 3분기", () => {
  const L: LinkCtx = { code: "c1", sellerId: "s1", productId: "p1", category: "다이어트·체형", sellerName: "지유" };
  it("링크 컨텍스트가 없으면 전부 보임", () => {
    expect(custVisible({ seller_id: "s2", product_id: "p1", category: "다이어트·체형" }, null)).toBe(true);
  });
  it("같은 인플루언서의 판매는 보임", () => {
    expect(custVisible({ seller_id: "s1", product_id: "p9", category: "다이어트·체형" }, L)).toBe(true);
  });
  it("다른 인플루언서는 상품 id 와 카테고리가 모두 달라야 보임", () => {
    expect(custVisible({ seller_id: "s2", product_id: "p2", category: "이너뷰티·피부" }, L)).toBe(true);
    expect(custVisible({ seller_id: "s2", product_id: "p1", category: "이너뷰티·피부" }, L)).toBe(false); // 같은 상품
    expect(custVisible({ seller_id: "s2", product_id: "p2", category: "다이어트·체형" }, L)).toBe(false); // 같은 카테고리
  });
});

describe("쿠키 상수", () => {
  it("이름 · 90일 · code 형식", () => {
    expect(LINKCTX_COOKIE).toBe("slry_linkctx");
    expect(LINKCTX_MAX_AGE).toBe(7776000);
    expect(LINK_CODE_RE.test("c1")).toBe(true);
    expect(LINK_CODE_RE.test("C1!")).toBe(false);
    expect(LINK_CODE_RE.test("a".repeat(33))).toBe(false);
  });
});
