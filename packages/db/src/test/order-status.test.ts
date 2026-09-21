// orderStatusLabel · shipLabel · isRefundable — web/src/lib/order-status.ts 의 동작 (ux-spec §3.6 · app-plan §0-8 · §7.4)
import { describe, expect, it } from "vitest";
import { DEFAULT_CLEAR_DAYS, REFUND_BLOCK_MESSAGES, isRefundable, orderStatusLabel, shipLabel, won } from "../order-status";

const paid = { status: "PAID", tracking_no: null, courier: null };
const live = { status: "LIVE", end_date: "2026-09-25" };

describe("orderStatusLabel", () => {
  it("PAID → 결제 완료(green) · REFUNDED/CANCELED → 환불 완료(gray) · 그 외 원문", () => {
    expect(orderStatusLabel(paid, live)).toEqual({ label: "결제 완료", tone: "green" });
    expect(orderStatusLabel({ ...paid, status: "REFUNDED" }, live)).toEqual({ label: "환불 완료", tone: "gray" });
    expect(orderStatusLabel({ ...paid, status: "CANCELED" }, live)).toEqual({ label: "환불 완료", tone: "gray" });
    expect(orderStatusLabel({ ...paid, status: "WEIRD" }, live)).toEqual({ label: "WEIRD", tone: "gray" });
  });
});

describe("shipLabel", () => {
  const settings = { clear_days: 21 };
  it("PAID 가 아니면 null", () => {
    expect(shipLabel({ ...paid, status: "REFUNDED" }, live, settings)).toBeNull();
  });
  it("LIVE: 송장 없으면 발송 준비 중, 있으면 배송 중 + 택배사·송장", () => {
    expect(shipLabel(paid, live, settings)).toBe("브랜드 발송 준비 중");
    expect(shipLabel({ ...paid, tracking_no: "1234", courier: "CJ대한통운" }, live, settings)).toBe("CJ대한통운 1234 · 배송 중");
    expect(shipLabel({ ...paid, tracking_no: "1234", courier: null }, live, settings)).toBe("택배 1234 · 배송 중");
  });
  it("CLEARING: 교환·환불 {end+clear_days}까지 (clear_days 가 비정상이면 기본 21)", () => {
    expect(shipLabel(paid, { status: "CLEARING", end_date: "2026-09-10" }, settings)).toBe("교환·환불 10/1까지");
    expect(shipLabel(paid, { status: "CLEARING", end_date: "2026-09-10" }, { clear_days: NaN })).toBe("교환·환불 10/1까지");
    expect(shipLabel(paid, { status: "CLEARING", end_date: null }, settings)).toBe("교환·환불 신청 가능");
  });
  it("그 외(SETTLED 등): 배송 완료", () => {
    expect(shipLabel(paid, { status: "SETTLED", end_date: "2026-08-01" }, settings)).toBe("배송 완료");
  });
});

describe("isRefundable — PAID · 비샘플 · 캠페인 ≠ SETTLED · 발송 전, 서버 app_refund_precheck 와 같은 순서", () => {
  it("순서대로 NOT_PAID → SAMPLE → SETTLED → SHIPPED", () => {
    expect(isRefundable({ ...paid, status: "REFUNDED" }, live)).toEqual({ ok: false, code: "NOT_PAID" });
    expect(isRefundable({ ...paid, is_sample: true }, live)).toEqual({ ok: false, code: "SAMPLE" });
    expect(isRefundable(paid, { status: "SETTLED", end_date: null })).toEqual({ ok: false, code: "SETTLED" });
    expect(isRefundable({ ...paid, tracking_no: "1" }, live)).toEqual({ ok: false, code: "SHIPPED" });
    expect(isRefundable(paid, live)).toEqual({ ok: true });
  });
  it("차단 코드마다 문구가 있다", () => {
    for (const code of ["NOT_PAID", "SAMPLE", "SETTLED", "SHIPPED"] as const) expect(REFUND_BLOCK_MESSAGES[code]).toBeTruthy();
  });
});

describe("won · DEFAULT_CLEAR_DAYS", () => {
  it("₩ + ko-KR 천 단위, null 은 ₩0", () => {
    expect(won(29900)).toBe("₩29,900");
    expect(won(null)).toBe("₩0");
    expect(won(1234.6)).toBe("₩1,235");
  });
  it("기본 교환·환불 기간 21일 (프로토타입 CLEAR_DAYS · 0008 기본값)", () => {
    expect(DEFAULT_CLEAR_DAYS).toBe(21);
  });
});
