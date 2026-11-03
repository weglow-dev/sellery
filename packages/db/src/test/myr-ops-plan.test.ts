// MYR 운영 스크립트 순수 부분 — packages/db/scripts/lib/myr-ops-plan.mjs (S8)
import { describe, expect, it } from "vitest";
// @ts-expect-error — .mjs 모듈(타입 선언 없음)
import { formatOrdersTable, parseArgs, parseShipCsv } from "../../scripts/lib/myr-ops-plan.mjs";

describe("parseArgs", () => {
  it("cmd · 위치 인자 · --flag [value]", () => {
    expect(parseArgs(["ship", "MYR1001", "cj", "1234567890"])).toEqual({ cmd: "ship", args: ["MYR1001", "cj", "1234567890"], flags: {} });
    expect(parseArgs(["orders", "--shipped", "--limit", "20"])).toEqual({ cmd: "orders", args: [], flags: { shipped: true, limit: "20" } });
    expect(parseArgs([])).toEqual({ cmd: undefined, args: [], flags: {} });
  });
});

describe("parseShipCsv", () => {
  it("머리줄·빈 줄 건너뜀 · 쉼표/탭 · 따옴표 제거 · 행 번호", () => {
    const { rows, problems } = parseShipCsv('주문번호,택배사,운송장\nMYR1001,cj,"1234-5678-90"\n\nMYR1002\t한진\t99998888777\n');
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { line: 2, orderCode: "MYR1001", courier: "cj", trackingNo: "1234-5678-90" },
      { line: 4, orderCode: "MYR1002", courier: "한진", trackingNo: "99998888777" },
    ]);
  });
  it("칸이 모자라면 problems (판정은 서버가)", () => {
    const { rows, problems } = parseShipCsv("MYR1001,cj\nMYR1002,cj,123");
    expect(rows).toHaveLength(1);
    expect(problems[0]).toContain("1행");
    expect(parseShipCsv("")).toEqual({ rows: [], problems: [] });
  });
});

describe("formatOrdersTable", () => {
  const o = { code: "myr1001", status: "PAID", buyerName: "홍길동", recipient: "김수취", orderName: "상품 A 외 1건", amount: 58000, lines: 2, paidAt: "2026-11-03T01:00:00Z", createdAt: "", courier: null, trackingNo: null, shippedAt: null };
  it("대기 표 — 대문자 코드 · 수취인 · 줄 수 · 금액 · 주소 없음", () => {
    const t = formatOrdersTable([o]);
    expect(t).toContain("MYR1001");
    expect(t).toContain("김수취");
    expect(t).toContain("₩58,000");
    expect(t).not.toContain("서울");
    expect(formatOrdersTable([])).toBe("  (없음)");
  });
  it("발송 표 — 택배사·운송장", () => {
    const t = formatOrdersTable([{ ...o, courier: "CJ대한통운", trackingNo: "1234567890", shippedAt: "2026-11-03T02:00:00Z" }], true);
    expect(t).toContain("CJ대한통운");
    expect(t).toContain("1234567890");
  });
});
