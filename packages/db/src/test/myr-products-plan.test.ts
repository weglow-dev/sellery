// MYR 상품 운영 스크립트 순수 부분 — packages/db/scripts/lib/myr-products-plan.mjs (myr-products.mjs import 가 쓴다)
import { describe, expect, it } from "vitest";
import { CATEGORIES, CODE_RE, normHandle, toRow, validateProduct, withDetail } from "../../scripts/lib/myr-products-plan.mjs";
import seedJson from "../../scripts/myr-products.seed.json";

const seed = seedJson as { creators: { handle: string }[]; products: Record<string, unknown>[] };

describe("normHandle", () => {
  it("'@' 하나 + 소문자 · 공백 제거", () => {
    expect(normHandle(" @Minji.Routine ")).toBe("@minji.routine");
    expect(normHandle("haru.well")).toBe("@haru.well");
    expect(normHandle(undefined)).toBe("@");
  });
});

describe("validateProduct", () => {
  const ok = { code: "minji-grape-jelly", creator: "@minji.routine", category: "diet", name: "젤리", price: 32000 };
  it("정상은 []", () => expect(validateProduct(ok)).toEqual([]));
  it("code 형식 · creator · category · name · price · stock · tag · margin 을 각각 잡는다", () => {
    expect(validateProduct({ ...ok, code: "Bad Code" })[0]).toMatch(/code 형식/);
    expect(validateProduct({ ...ok, creator: "" })[0]).toMatch(/creator/);
    expect(validateProduct({ ...ok, category: "food" })[0]).toMatch(/category/);
    expect(validateProduct({ ...ok, name: " " })[0]).toMatch(/name/);
    expect(validateProduct({ ...ok, price: -1 })[0]).toMatch(/price/);
    expect(validateProduct({ ...ok, price: 1.5 })[0]).toMatch(/price/);
    expect(validateProduct({ ...ok, stock: -1 })[0]).toMatch(/stock/);
    expect(validateProduct({ ...ok, tag: "HOT" })[0]).toMatch(/tag/);
    expect(validateProduct({ ...ok, seller_margin_rate: 1.2 })[0]).toMatch(/margin/);
  });
  it("시드 파일의 상품 8개는 전부 통과 · 카테고리는 MYR 6개 · 크리에이터 핸들은 '@' 포함", () => {
    expect(seed.products).toHaveLength(8);
    for (const p of seed.products) expect(validateProduct(p)).toEqual([]);
    for (const p of seed.products) expect(CATEGORIES).toContain(p.category);
    for (const c of seed.creators) expect(c.handle.startsWith("@")).toBe(true);
    expect(CODE_RE.test("m100")).toBe(true);
  });
});

describe("withDetail · toRow", () => {
  it("상세가 없으면 템플릿 — 성분 수 포인트 · 성분별 행 · 섭취법 재사용", () => {
    const d = withDetail({ ingredients: ["A", "B", "C"], howto: "하루 1포" });
    expect(d.story_title).toBe("매일 챙기기 쉬운 것만 남겼어요");
    expect(d.points[1]).toEqual({ big: "3가지", t: "핵심 성분", d: "필요한 것만" });
    expect(d.ingredient_rows.map((r) => r.amount)).toEqual(["주성분", "보조", "기본"]);
    expect(d.howto_steps[0]).toEqual({ t: "하루 한 번", d: "하루 1포" });
    expect(d.faq[0].a).toBe("하루 1포");
  });
  it("상세가 있으면 그대로", () => {
    const d = withDetail({ story_title: "X", story: "Y", points: [], ingredient_rows: [], howto_title: "H", howto_steps: [], faq: [] });
    expect(d).toEqual({ story_title: "X", story: "Y", points: [], ingredient_rows: [], howto_title: "H", howto_steps: [], faq: [] });
  });
  it("toRow — code 소문자 · 기본값 · status · 잘못된 status 는 throw", () => {
    const row = toRow({ code: " ABC-1 ", name: " 이름 ", category: "diet", price: 100, ingredients: ["x"], howto: "h" }, "seller-uuid", "pending");
    expect(row).toMatchObject({ code: "abc-1", seller_id: "seller-uuid", name: "이름", price: 100, status: "pending", stock: 0, icon: "pill", tag: "", options: [], seller_margin_rate: null });
    expect(row.ingredient_rows).toHaveLength(1);
    expect(() => toRow({ code: "a", name: "n", category: "diet", price: 1 }, "s", "live")).toThrow(/status/);
    expect(toRow(seed.products[0], "s", "listed").status).toBe("listed");
  });
});
