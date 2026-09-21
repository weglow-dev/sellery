// 브랜드 상품 규칙 — packages/db/src/brand/product-rules.ts (docs/brand-console-plan.md §4 "0015" · app_brand_upsert_product 와 같은 조건)
import { describe, expect, it } from "vitest";
import {
  EXCLUSIVE_GRADES,
  IMAGE_URLS_MAX,
  MIN_SELLER_RATE,
  OPTIONS_MAX,
  PRODUCT_NAME_MAX,
  allocatedOf,
  autoOptions,
  canDeleteProduct,
  commissionToTotalRate,
  isProductLocked,
  optionLines,
  parseOptionLines,
  parseProductInput,
  productFailMessage,
  productSavedMessage,
  productStatusChip,
  sampleTierOptions,
  stockLeftOf,
  totalRateToCommission,
} from "../brand/product-rules";

const base = {
  name: "콜라겐 부스터 샷",
  description: "저분자 콜라겐 · 30포",
  category: "이너뷰티·피부",
  consumer_price: "39,000",
  sale_price: 29900,
  total_rate: "30",
  stock: 1000,
  sample_text: "무상 1박스",
  sample_free_grade: "실버",
  sample_buy_mode: "auto",
  sample_fixed_price: "0",
  sample_refund: "on",
  exclusive_grade: "",
  exclusive_label: "",
  options: "1박스 (30포) | 29900\n2박스 세트 | 56,800\n\n잘못된 줄\n| 100",
  thumb_url: "",
};

describe("totalRateToCommission · commissionToTotalRate — 총 요율(플랫폼 10%p 포함) ↔ 인플루언서 수수료율", () => {
  it.each([
    [30, 0.2],
    [25, 0.15],
    [15, 0.05],
    [12, MIN_SELLER_RATE], // 하한 5% (데모 Math.max(5, …))
    [11, MIN_SELLER_RATE],
    [50, 0.4],
    [32.5, 0.225],
  ])("총 %s% → %s", (total, rate) => {
    expect(totalRateToCommission(total)).toBe(rate);
  });
  it("역변환 (폼 프리필)", () => {
    expect(commissionToTotalRate(0.2)).toBe(30);
    expect(commissionToTotalRate(0.15)).toBe(25);
    expect(commissionToTotalRate(0.225)).toBe(32.5);
  });
});

describe("autoOptions — optsOf / resolve_product_options 와 같은 결과", () => {
  it("29,900 → 1개 29,900 · 2개 세트 56,800 · 3개 세트 80,700", () => {
    expect(autoOptions(29900)).toEqual([
      { n: "1개", price: 29900 },
      { n: "2개 세트 · 5% 추가 할인", price: 56800 },
      { n: "3개 세트 · 10% 추가 할인", price: 80700 },
    ]);
  });
  it("89,000 → 169,100 · 240,300", () => {
    expect(autoOptions(89000).map((o) => o.price)).toEqual([89000, 169100, 240300]);
  });
});

describe("parseOptionLines · optionLines — 'name | price' 줄 (데모 parseOpts)", () => {
  it("이름·가격 없는 줄은 건너뛰고 가격의 콤마·문자는 버린다", () => {
    expect(parseOptionLines(base.options)).toEqual([
      { n: "1박스 (30포)", price: 29900 },
      { n: "2박스 세트", price: 56800 },
    ]);
  });
  it("빈 문자열 → []", () => {
    expect(parseOptionLines("")).toEqual([]);
  });
  it("왕복", () => {
    const opts = [{ n: "1박스", price: 29900 }];
    expect(parseOptionLines(optionLines(opts))).toEqual(opts);
  });
});

describe("parseProductInput — 폼 → RPC p_input", () => {
  it("정상 입력 (숫자 콤마 · 샘플 정책 평면 필드 · 옵션 textarea)", () => {
    const r = parseProductInput(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input).toEqual({
      name: "콜라겐 부스터 샷",
      description: "저분자 콜라겐 · 30포",
      emoji: null,
      category: "이너뷰티·피부",
      consumer_price: 39000,
      sale_price: 29900,
      total_rate: 30,
      stock: 1000,
      sample_text: "무상 1박스",
      sample_policy: { free_grade: "실버", buy_mode: "auto", fixed_price: 0, refund: true },
      exclusive_grade: null,
      exclusive_label: null,
      options: [
        { n: "1박스 (30포)", price: 29900 },
        { n: "2박스 세트", price: 56800 },
      ],
      thumb_url: null,
      image_urls: [],
    });
  });

  it("FormData 입력 (image_urls 반복 필드 · 체크박스)", () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(base)) fd.set(k, String(v));
    fd.append("image_urls", "https://x.supabase.co/a.webp");
    fd.append("image_urls", " https://x.supabase.co/b.webp ");
    fd.append("image_urls", "");
    fd.set("sample_refund", "");
    const r = parseProductInput(fd);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input.image_urls).toEqual(["https://x.supabase.co/a.webp", "https://x.supabase.co/b.webp"]);
    expect(r.input.sample_policy?.refund).toBe(false);
  });

  it("샘플 정책은 등급이 비면 null(전부-또는-없음) · sample_policy_enabled=off 도 null", () => {
    const a = parseProductInput({ ...base, sample_free_grade: "" });
    expect(a.ok && a.input.sample_policy).toBeNull();
    const b = parseProductInput({ ...base, sample_policy_enabled: "" });
    expect(b.ok && b.input.sample_policy).toBeNull();
    const c = parseProductInput({ ...base, sample_policy: { free_grade: "골드", buy_mode: "fixed", fixed_price: 15000, refund: false } });
    expect(c.ok && c.input.sample_policy).toEqual({ free_grade: "골드", buy_mode: "fixed", fixed_price: 15000, refund: false });
  });

  it("독점 오퍼 — 라벨 기본값 '<등급> 등급 독점권'", () => {
    const r = parseProductInput({ ...base, exclusive_grade: "다이아" });
    expect(r.ok && r.input.exclusive_grade).toBe("다이아");
    expect(r.ok && r.input.exclusive_label).toBe("다이아 등급 독점권");
    const r2 = parseProductInput({ ...base, exclusive_grade: "골드", exclusive_label: "  인스타 독점 · 3개월  " });
    expect(r2.ok && r2.input.exclusive_label).toBe("인스타 독점 · 3개월");
  });

  it("빈 입력 · 비객체 → name", () => {
    expect(parseProductInput(null)).toMatchObject({ ok: false, field: "name" });
    expect(parseProductInput({})).toMatchObject({ ok: false, field: "name" });
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["name 빈 값", { name: "  " }, "name"],
    ["name 길이", { name: "가".repeat(PRODUCT_NAME_MAX + 1) }, "name"],
    ["description 길이", { description: "a".repeat(301) }, "description"],
    ["emoji 길이", { emoji: "📦📦📦📦📦" }, "emoji"],
    ["category 빈 값", { category: "" }, "category"],
    ["consumer_price 음수", { consumer_price: -1 }, "consumer_price"],
    ["consumer_price 문자", { consumer_price: "abc" }, "consumer_price"],
    ["sale_price 0", { sale_price: 0 }, "sale_price"],
    ["sale_price 소수", { sale_price: 100.5 }, "sale_price"],
    ["sale_price 빈 값", { sale_price: "" }, "sale_price"],
    ["total_rate 10 (플랫폼 몫만)", { total_rate: 10 }, "total_rate"],
    ["total_rate 빈 값", { total_rate: "" }, "total_rate"],
    ["total_rate 101", { total_rate: 101 }, "total_rate"],
    ["stock 음수", { stock: -5 }, "stock"],
    ["sample_text 길이", { sample_text: "a".repeat(61) }, "sample_text"],
    ["sample_policy 낯선 등급", { sample_free_grade: "레전드" }, "sample_policy"],
    ["sample_policy buy_mode", { sample_buy_mode: "free" }, "sample_policy"],
    ["sample_policy 지정가인데 0", { sample_buy_mode: "fixed", sample_fixed_price: 0 }, "sample_policy"],
    ["exclusive_grade 실버", { exclusive_grade: "실버" }, "exclusive_grade"],
    ["exclusive_label 길이", { exclusive_grade: "골드", exclusive_label: "a".repeat(81) }, "exclusive_label"],
    ["options 개수", { options: Array.from({ length: OPTIONS_MAX + 1 }, (_, i) => `옵션${i} | 1000`).join("\n") }, "options"],
    ["options 배열 가격 0", { options: [{ n: "a", price: 0 }] }, "options"],
    ["options 배열 이름 없음", { options: [{ n: "", price: 100 }] }, "options"],
    ["thumb_url 공백", { thumb_url: "https://x/a b.png" }, "thumb_url"],
    ["image_urls 5장", { image_urls: Array.from({ length: IMAGE_URLS_MAX + 1 }, (_, i) => `https://x/${i}.png`) }, "image_urls"],
    ["image_urls 비문자열", { image_urls: [1] }, "image_urls"],
  ])("%s → %s", (_label, patch, field) => {
    const r = parseProductInput({ ...base, ...patch });
    expect(r).toMatchObject({ ok: false, field });
    if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
  });

  it("stock 비면 0 · sample_text 비면 기본값 · description 비면 null", () => {
    const r = parseProductInput({ ...base, stock: "", sample_text: "", description: "" });
    expect(r.ok && r.input.stock).toBe(0);
    expect(r.ok && r.input.sample_text).toBe("무상 1개");
    expect(r.ok && r.input.description).toBeNull();
  });
});

describe("잠금 · 배정 · 삭제 가드 (helpers.ts allocated · saveProduct locked · deleteProduct)", () => {
  it("isProductLocked — SCHEDULE_CONFIRMED · LIVE · CLEARING", () => {
    expect(isProductLocked(["TESTING", "SAMPLE_REQUESTED"])).toBe(false);
    expect(isProductLocked(["TESTING", "CLEARING"])).toBe(true);
    expect(isProductLocked([])).toBe(false);
  });
  it("allocatedOf — SCHEDULE_CONFIRMED · LIVE qty 합 (CLEARING 제외)", () => {
    expect(
      allocatedOf([
        { status: "LIVE", qty: 800 },
        { status: "SCHEDULE_CONFIRMED", qty: 1000 },
        { status: "CLEARING", qty: 500 },
        { status: "TESTING", qty: 0 },
      ]),
    ).toBe(1800);
    expect(stockLeftOf(2000, 1800)).toBe(200);
    expect(stockLeftOf(100, 1800)).toBe(0);
  });
  it("canDeleteProduct — 종결(REJECTED · PASSED · DECLINED)만 있으면 삭제 가능, SETTLED 는 이력", () => {
    expect(canDeleteProduct([])).toBe(true);
    expect(canDeleteProduct(["REJECTED", "DECLINED"])).toBe(true);
    expect(canDeleteProduct(["REJECTED", "SETTLED"])).toBe(false);
    expect(canDeleteProduct(["LIVE"])).toBe(false);
  });
});

describe("상수 · 칩 · 문구", () => {
  it("sampleTierOptions — 스타터 → 블랙", () => {
    expect(sampleTierOptions()).toEqual(["스타터", "브론즈", "실버", "골드", "플래티넘", "다이아", "블랙"]);
    expect(EXCLUSIVE_GRADES).toEqual(["블랙", "다이아", "플래티넘", "골드"]);
  });
  it("productStatusChip", () => {
    expect(productStatusChip("pending")).toEqual({ label: "검수 대기", tone: "amber" });
    expect(productStatusChip("listed").tone).toBe("green");
    expect(productStatusChip("paused").tone).toBe("gray");
    expect(productStatusChip("rejected").tone).toBe("red");
    expect(productStatusChip("weird")).toEqual({ label: "weird", tone: "gray" });
  });
  it("productFailMessage — 필드 · 잠금 필드명 · 배정량", () => {
    expect(productFailMessage({ code: "INVALID_INPUT", field: "total_rate" })).toContain("플랫폼 몫");
    expect(productFailMessage({ code: "INVALID_INPUT", field: "zzz" })).toBe("입력 내용을 확인해주세요");
    expect(productFailMessage({ code: "LOCKED_FIELD", field: "sale_price" })).toContain("판매가");
    expect(productFailMessage({ code: "LOCKED_FIELD", field: "options" })).toContain("구매 옵션");
    expect(productFailMessage({ code: "STOCK_BELOW_ALLOCATED", allocated: 1800 })).toContain("1,800");
    expect(productFailMessage({ code: "HAS_ACTIVE_CAMPAIGNS" })).toContain("노출 중단");
    expect(productFailMessage({ code: "???" })).toContain("문제가 생겼어요");
  });
  it("productSavedMessage", () => {
    expect(productSavedMessage({ created: true, status: "pending" }, "x")).toContain("검수 요청 완료");
    expect(productSavedMessage({ created: false, rereview: true, status: "pending" }, "버닝온")).toContain("재검수 대기");
    expect(productSavedMessage({ created: false, rereview: false, status: "pending" }, "버닝온")).toBe("버닝온 수정 저장 — 재검수 요청됨");
    expect(productSavedMessage({ created: false, rereview: false, status: "listed" }, "버닝온")).toBe("버닝온 수정 저장 완료");
  });
});
