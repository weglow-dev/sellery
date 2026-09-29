// 콘솔 경로 — 경로 모드만 (web/src/lib/hosts.ts 의 consolePath 경로 모드 분기와 같은 결과)
import { describe, expect, it } from "vitest";
import { CONSOLE_PUBLIC_PATHS, activeNavHref, consolePath, consoleUrl, isConsolePublicPath } from "../console-paths";

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

describe("activeNavHref — 내비 활성 판정 (접두 포함 전체 경로끼리)", () => {
  /** 관리자 정산·돈 칩 (apps/admin/src/lib/money-nav.ts 를 consolePath 로 접두 붙인 결과) */
  const MONEY = [
    "/admin/settle",
    "/admin/settle/payouts",
    "/admin/orders",
    "/admin/payments",
    "/admin/revenue",
    "/admin/cs",
  ] as const;

  it("정확히 일치하면 그 항목", () => {
    expect(activeNavHref("/admin/revenue", MONEY)).toBe("/admin/revenue");
    expect(activeNavHref("/admin/payments", MONEY)).toBe("/admin/payments");
    expect(activeNavHref("/admin/settle", MONEY)).toBe("/admin/settle");
  });

  it("하위 경로도 그 항목 — 상세 화면에서도 칩이 켜진다", () => {
    expect(activeNavHref("/admin/orders/o1151", MONEY)).toBe("/admin/orders");
    expect(activeNavHref("/admin/cs/q1", MONEY)).toBe("/admin/cs");
    expect(activeNavHref("/admin/settle/c5", MONEY)).toBe("/admin/settle");
  });

  it("겹치면 더 구체적인 쪽만 — /settle/payouts 에서 /settle 은 켜지지 않는다", () => {
    expect(activeNavHref("/admin/settle/payouts", MONEY)).toBe("/admin/settle/payouts");
    expect(activeNavHref("/admin/settle/payouts/p1", MONEY)).toBe("/admin/settle/payouts");
  });

  it("어느 항목도 아니면 null", () => {
    expect(activeNavHref("/admin/home", MONEY)).toBeNull();
    expect(activeNavHref("/admin/sellers", MONEY)).toBeNull();
    expect(activeNavHref("/admin", MONEY)).toBeNull();
  });

  it("접두를 뺀 경로로는 맞지 않는다 — base 를 빼서 비교하면 안 되는 이유", () => {
    expect(activeNavHref("/revenue", MONEY)).toBeNull();
    // SvelteKit paths.relative=true 일 때 pathname.slice(base.length) 가 만들어내던 값
    expect(activeNavHref("admin/revenue", MONEY)).toBeNull();
  });

  it("부분 문자열에 걸리지 않는다", () => {
    expect(activeNavHref("/admin/revenues", MONEY)).toBeNull();
    expect(activeNavHref("/admin/settled", MONEY)).toBeNull();
  });

  it("빈 href · 빈 목록", () => {
    expect(activeNavHref("/admin/revenue", [])).toBeNull();
    expect(activeNavHref("/admin/revenue", ["", "/admin/revenue"])).toBe("/admin/revenue");
  });

  it("셸 탭에도 같은 기준이 쓰인다", () => {
    const TABS = ["/admin/home", "/admin/sellers", "/admin/brands", "/admin/products", "/admin/settle"] as const;
    expect(activeNavHref("/admin/products/p1/preview", TABS)).toBe("/admin/products");
    expect(activeNavHref("/admin/settle/payouts", TABS)).toBe("/admin/settle");
  });
});

describe("activeNavHref — 탭 하나가 여러 화면을 묶을 때 (ConsoleTab.match)", () => {
  /** 관리자 하단 탭 — 정산 탭은 정산 그룹의 화면 칩이 가는 곳도 자기 것으로 본다 */
  const TAB_HREFS = [
    "/admin/home",
    "/admin/campaigns", // 홈 탭의 match — 캠페인 상세는 홈 대시보드에서 들어온다
    "/admin/sellers",
    "/admin/brands",
    "/admin/products",
    "/admin/settle",
    // 정산 탭의 match
    "/admin/orders",
    "/admin/payments",
    "/admin/revenue",
    "/admin/cs",
  ] as const;

  it("정산 그룹 화면에서도 히트한다 — 어느 탭에도 안 걸려 탭이 꺼지던 문제", () => {
    expect(activeNavHref("/admin/orders", TAB_HREFS)).toBe("/admin/orders");
    expect(activeNavHref("/admin/payments", TAB_HREFS)).toBe("/admin/payments");
    expect(activeNavHref("/admin/revenue", TAB_HREFS)).toBe("/admin/revenue");
    expect(activeNavHref("/admin/cs", TAB_HREFS)).toBe("/admin/cs");
  });

  it("하위 경로도 마찬가지", () => {
    expect(activeNavHref("/admin/orders/o1151", TAB_HREFS)).toBe("/admin/orders");
    expect(activeNavHref("/admin/cs/q1", TAB_HREFS)).toBe("/admin/cs");
  });

  it("match 가 다른 탭을 가로채지 않는다 — 더 구체적인 쪽이 이긴다", () => {
    expect(activeNavHref("/admin/products/p1/preview", TAB_HREFS)).toBe("/admin/products");
    expect(activeNavHref("/admin/settle/payouts", TAB_HREFS)).toBe("/admin/settle");
  });

  it("캠페인 상세는 홈 탭 — 홈 대시보드에서 들어온다", () => {
    expect(activeNavHref("/admin/campaigns/c1", TAB_HREFS)).toBe("/admin/campaigns");
  });

  it("탭에도 match 에도 없는 경로는 여전히 null", () => {
    expect(activeNavHref("/admin/login", TAB_HREFS)).toBeNull();
    expect(activeNavHref("/admin/demo", TAB_HREFS)).toBeNull();
  });
});

describe("activeNavHref — 세 콘솔의 탭 밖 라우트가 없다 (ConsoleTab.match)", () => {
  /** PartnerShell TABS 를 consolePath 로 접두 붙인 결과 — 탭 href + match 전부 */
  const SELLER = [
    "/influencer/home",
    "/influencer/products",
    "/influencer/pay", // 상품 탭의 match — 샘플 구매 결제
    "/influencer/campaigns",
    "/influencer/sales",
    "/influencer/settle", // 매출 탭의 match — 정산 자료
    "/influencer/my",
  ] as const;

  const BRAND = [
    "/brand/home",
    "/brand/sales", // 홈 탭의 match
    "/brand/settle", // 홈 탭의 match
    "/brand/products",
    "/brand/campaigns",
    "/brand/requests", // 캠페인 탭의 match
    "/brand/orders",
    "/brand/cs", // 주문 탭의 match
    "/brand/my",
  ] as const;

  it("인플루언서 — 샘플 결제 · 정산 자료도 걸린다", () => {
    expect(activeNavHref("/influencer/pay/new", SELLER)).toBe("/influencer/pay");
    expect(activeNavHref("/influencer/pay/abc123", SELLER)).toBe("/influencer/pay");
    expect(activeNavHref("/influencer/pay/success", SELLER)).toBe("/influencer/pay");
    expect(activeNavHref("/influencer/settle", SELLER)).toBe("/influencer/settle");
    expect(activeNavHref("/influencer/settle/doc", SELLER)).toBe("/influencer/settle");
  });

  it("브랜드 — 매출·정산·처리 대기·문의도 걸린다", () => {
    expect(activeNavHref("/brand/sales", BRAND)).toBe("/brand/sales");
    expect(activeNavHref("/brand/settle", BRAND)).toBe("/brand/settle");
    expect(activeNavHref("/brand/settle/doc", BRAND)).toBe("/brand/settle");
    expect(activeNavHref("/brand/requests", BRAND)).toBe("/brand/requests");
    expect(activeNavHref("/brand/cs/q1", BRAND)).toBe("/brand/cs");
  });

  it("match 가 기존 탭을 가로채지 않는다", () => {
    expect(activeNavHref("/influencer/products/p1", SELLER)).toBe("/influencer/products");
    expect(activeNavHref("/brand/products/p1/invite", BRAND)).toBe("/brand/products");
    expect(activeNavHref("/brand/campaigns/c1", BRAND)).toBe("/brand/campaigns");
    expect(activeNavHref("/brand/orders/o1", BRAND)).toBe("/brand/orders");
  });

  it("공개 경로는 여전히 어느 탭도 아니다 — 셸 밖이다", () => {
    for (const p of ["/influencer/login", "/influencer/signup", "/brand/apply", "/brand/suspended"]) {
      expect(activeNavHref(p, [...SELLER, ...BRAND])).toBeNull();
    }
  });
});
