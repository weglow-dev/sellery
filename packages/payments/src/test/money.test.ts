// formatKRW · generateOrderId · orderId 접두 — packages/payments/src/money.ts (checkout_sessions.toss_order_id check: 6~64자 [A-Za-z0-9_-] · partner_payments: ^slrp_…{6,59})
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_ORDER_ID_RE,
  ORDER_ID_PREFIX,
  PARTNER_ORDER_ID_RE,
  formatKRW,
  generateOrderId,
  isCustomerOrderId,
  isPartnerOrderId,
  orderIdKind,
} from "../money";

describe("formatKRW", () => {
  it("반올림 + ko-KR 천 단위 + 원", () => {
    expect(formatKRW(29900)).toBe("29,900원");
    expect(formatKRW(1234.5)).toBe("1,235원");
    expect(formatKRW(NaN)).toBe("0원");
  });
});

describe("ORDER_ID_PREFIX", () => {
  it("고객 slry_ · 파트너 slrp_ (0012 check 와 동일)", () => {
    expect(ORDER_ID_PREFIX.customer).toBe("slry_");
    expect(ORDER_ID_PREFIX.partner).toBe("slrp_");
    expect(PARTNER_ORDER_ID_RE.source).toBe("^slrp_[A-Za-z0-9_-]{6,59}$");
    expect(CUSTOMER_ORDER_ID_RE.source).toBe("^slry_[A-Za-z0-9_-]{6,59}$");
  });
});

describe("generateOrderId", () => {
  it("(기존 동작) slry_{ts}_{hex 12자} — 접두 · 형식 · 길이 6~64 · 토스 orderId 문자 집합", () => {
    const id = generateOrderId(1789876543210);
    expect(id.startsWith(ORDER_ID_PREFIX.customer)).toBe(true);
    expect(id).toMatch(/^slry_1789876543210_[0-9a-f]{12}$/);
    expect(id.length).toBe(31);
    expect(id.length).toBeGreaterThanOrEqual(6);
    expect(id.length).toBeLessThanOrEqual(64);
    expect(/^[A-Za-z0-9_-]+$/.test(id)).toBe(true);
  });
  it("인자 없음 · 'customer' 명시 · 호출마다 다르다", () => {
    const a = generateOrderId();
    const b = generateOrderId("customer");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^slry_\d{13}_[0-9a-f]{12}$/);
    expect(b).toMatch(/^slry_\d{13}_[0-9a-f]{12}$/);
  });
  it("'partner' → slrp_ 접두, 같은 꼴 · DB check 통과", () => {
    const id = generateOrderId("partner", 1789876543210);
    expect(id).toMatch(/^slrp_1789876543210_[0-9a-f]{12}$/);
    expect(id.length).toBe(31);
    expect(PARTNER_ORDER_ID_RE.test(id)).toBe(true);
    expect(generateOrderId("partner")).toMatch(/^slrp_\d{13}_[0-9a-f]{12}$/);
  });
});

describe("isPartnerOrderId · isCustomerOrderId · orderIdKind", () => {
  it("접두·형식으로 판정", () => {
    expect(isPartnerOrderId("slrp_1789876543210_abcdef012345")).toBe(true);
    expect(isPartnerOrderId("slry_1789876543210_abcdef012345")).toBe(false);
    expect(isPartnerOrderId("slrp_ab")).toBe(false); // 접두 뒤 6자 미만
    expect(isPartnerOrderId("slrp_" + "a".repeat(60))).toBe(false); // 65자 — 토스 상한 초과
    expect(isPartnerOrderId("slrp_bad char")).toBe(false);
    expect(isPartnerOrderId(null)).toBe(false);
    expect(isCustomerOrderId("slry_1789876543210_abcdef012345")).toBe(true);
    expect(isCustomerOrderId("slrp_1789876543210_abcdef012345")).toBe(false);
    expect(orderIdKind(generateOrderId("partner"))).toBe("partner");
    expect(orderIdKind(generateOrderId())).toBe("customer");
    expect(orderIdKind("glo_123_abcd")).toBeNull();
    expect(orderIdKind(undefined)).toBeNull();
  });
});
