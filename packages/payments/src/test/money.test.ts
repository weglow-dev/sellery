// formatKRW · generateOrderId — web/src/lib/money.ts 의 동작 (checkout_sessions.toss_order_id check: 6~64자 [A-Za-z0-9_-])
import { describe, expect, it } from "vitest";
import { ORDER_ID_PREFIX, formatKRW, generateOrderId } from "../money";

describe("formatKRW", () => {
  it("반올림 + ko-KR 천 단위 + 원", () => {
    expect(formatKRW(29900)).toBe("29,900원");
    expect(formatKRW(1234.5)).toBe("1,235원");
    expect(formatKRW(NaN)).toBe("0원");
  });
});

describe("generateOrderId", () => {
  it("slry_{ts}_{hex 12자} — 접두 · 형식 · 길이 6~64 · 토스 orderId 문자 집합", () => {
    const id = generateOrderId(1789876543210);
    expect(id.startsWith(ORDER_ID_PREFIX)).toBe(true);
    expect(id).toMatch(/^slry_1789876543210_[0-9a-f]{12}$/);
    expect(id.length).toBe(31);
    expect(id.length).toBeGreaterThanOrEqual(6);
    expect(id.length).toBeLessThanOrEqual(64);
    expect(/^[A-Za-z0-9_-]+$/.test(id)).toBe(true);
  });
  it("호출마다 다르다", () => {
    const a = generateOrderId();
    const b = generateOrderId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^slry_\d{13}_[0-9a-f]{12}$/);
  });
});
