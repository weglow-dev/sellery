// MYR 운영 스크립트 순수 부분 — packages/db/scripts/lib/myr-ops-plan.mjs (S8)
import { describe, expect, it } from "vitest";
// @ts-expect-error — .mjs 모듈(타입 선언 없음)
import { formatOrdersTable, formatPrepareTable, parseArgs, parseShipCsv, prepareCsv } from "../../scripts/lib/myr-ops-plan.mjs";

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

describe("배송준비중 수동 전환(0077 prepare)", () => {
  const lines = [
    { orderCode: "myr1001", paidAt: "2026-11-16T01:05:00Z", recipient: "홍길동", phone: "01012345678", postcode: "06100", address1: "서울 강남구", address2: "101호, 2층", goodsCode: "EB-A01", goodsName: '포도 "젤리"', goodsOption: "레몬", qty: 2, memo: "" },
  ];
  it("표 — 주문번호 대문자 · 상품 (옵션) × 수량", () => {
    expect(formatPrepareTable(lines)).toContain("MYR1001");
    expect(formatPrepareTable(lines)).toContain('포도 "젤리" (레몬) × 2');
    expect(formatPrepareTable([])).toBe("  (없음)");
  });
  it("CSV — BOM · 머리줄 · 쉼표·따옴표 칸은 따옴표로", () => {
    const csv = prepareCsv(lines);
    expect(csv.startsWith("﻿주문번호,수취인,연락처,우편번호,주소,상세주소,상품코드,상품,옵션,수량,배송메모\n")).toBe(true);
    expect(csv).toContain('MYR1001,홍길동,01012345678,06100,서울 강남구,"101호, 2층",EB-A01,"포도 ""젤리""",레몬,2,\n');
  });
  it("발송 표의 상태 칸은 줄 배송 상태(없으면 주문 상태)", () => {
    const row = { code: "myr1", paidAt: null, recipient: "a", lines: 1, amount: 1, status: "PAID", orderName: "x", shipStatus: "PREPARING" };
    expect(formatOrdersTable([row])).toContain("배송준비중");
    expect(formatOrdersTable([{ ...row, shipStatus: null }])).toContain("PAID");
  });
});
