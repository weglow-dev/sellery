// 샘플 결제 순수 규칙 — packages/db/src/partner/sample-rules.ts 의 0012 partner_payments 부분 (RPC jsonb 파싱 · 문구 · isPayable)
import { describe, expect, it } from "vitest";
import {
  PARTNER_PAYMENT_STATUSES,
  SAMPLE_BUY_ENABLED,
  isPayable,
  parseBeginSampleResult,
  parseConfirmSampleResult,
  parsePartnerPaymentView,
  parseSimplePaymentResult,
  partnerPayFailMessage,
  partnerPaymentStatusLabel,
  payLine,
  samplePaidLine,
} from "../partner/sample-rules";

/** 0012 스모크의 실제 응답 (s7 브론즈 🥬4 × p4 ₩75,650 · use_cel=true) */
const CLAIM_OK = {
  ok: true,
  reused: false,
  payment_id: "41d3ddd8-3338-45f6-949f-6c777db595b4",
  order_id: "slrp_1789980697828_4d94f4f09018",
  order_name: "샘플 · GL-01 스킨 샷",
  amount_total: 75650,
  amount_cel: 3,
  amount_cash: 15650,
  cash_required: true,
  use_cel: true,
  expires_at: "2026-09-21T09:21:37.799677+00:00",
  quote: { mode: "buy", reason: "GRADE_BELOW", price: 75650, cel: 3, cash: 15650, use_cel: true, method: "cel", balance: 4, cel_won: 20000 },
};

const BRIEF = {
  id: "41d3ddd8-3338-45f6-949f-6c777db595b4",
  status: "CONFIRMED",
  kind: "sample",
  owner_type: "seller",
  seller_id: "a0000000-0000-4000-8000-000000000007",
  user_id: null,
  product_id: "d0000000-0000-4000-8000-000000000004",
  campaign_id: "013a0ed1-ed2b-4bbb-8842-3abeb7cd3682",
  toss_order_id: "slrp_1789980697828_4d94f4f09018",
  payment_key: "tviva20260921smokeKEY001",
  order_name: "샘플 · GL-01 스킨 샷",
  amount_total: 75650,
  amount_cel: 3,
  amount_cash: 15650,
  cel_won: 20000,
  use_cel: true,
  payment_method: "카드",
  approved_at: "2026-09-21T09:00:00+00:00",
  fail_code: null,
  fail_message: null,
  expires_at: "2026-09-21T09:21:37+00:00",
  created_at: "2026-09-21T08:51:37+00:00",
  updated_at: "2026-09-21T09:00:00+00:00",
};

describe("SAMPLE_BUY_ENABLED", () => {
  it("PR-B 부터 true — 결제 화면(/pay/*) 이 붙었다", () => {
    expect(SAMPLE_BUY_ENABLED).toBe(true);
  });
});

describe("parsePartnerPaymentView", () => {
  it("brief jsonb → 뷰 (status 열거 · 금액 정수)", () => {
    const v = parsePartnerPaymentView(BRIEF);
    expect(v).not.toBeNull();
    expect(v?.status).toBe("CONFIRMED");
    expect(v?.amount_total).toBe(75650);
    expect(v?.amount_cel).toBe(3);
    expect(v?.amount_cash).toBe(15650);
    expect(v?.cel_won).toBe(20000);
    expect(v?.use_cel).toBe(true);
    expect(v?.payment_key).toBe("tviva20260921smokeKEY001");
  });
  it("낯선 status · 필수 키 누락 → null", () => {
    expect(parsePartnerPaymentView({ ...BRIEF, status: "paid" })).toBeNull();
    expect(parsePartnerPaymentView({ ...BRIEF, amount_total: undefined })).toBeNull();
    expect(parsePartnerPaymentView({ ...BRIEF, toss_order_id: null })).toBeNull();
    expect(parsePartnerPaymentView(null)).toBeNull();
    expect(parsePartnerPaymentView("x")).toBeNull();
  });
  it("상태 열거는 0012 check 와 같다", () => {
    expect([...PARTNER_PAYMENT_STATUSES]).toEqual(["PENDING", "CONFIRMING", "CONFIRMED", "FAILED", "CANCELED", "EXPIRED", "REFUNDED"]);
  });
});

describe("isPayable", () => {
  const now = Date.parse("2026-09-21T09:00:00Z");
  it("PENDING 이고 만료 전일 때만", () => {
    expect(isPayable("PENDING", "2026-09-21T09:21:37+00:00", now)).toBe(true);
    expect(isPayable("PENDING", new Date(now + 1000), now)).toBe(true);
    expect(isPayable("PENDING", "2026-09-21T08:59:59+00:00", now)).toBe(false);
    expect(isPayable("CONFIRMING", "2026-09-21T09:21:37+00:00", now)).toBe(false);
    expect(isPayable("CONFIRMED", "2026-09-21T09:21:37+00:00", now)).toBe(false);
    expect(isPayable("PENDING", null, now)).toBe(false);
    expect(isPayable("PENDING", "", now)).toBe(false);
    expect(isPayable("PENDING", "not a date", now)).toBe(false);
  });
});

describe("partnerPaymentStatusLabel", () => {
  it("상태 → 칩 · CANCEL_PENDING · SUPERSEDED 구분", () => {
    expect(partnerPaymentStatusLabel("PENDING")).toEqual({ label: "결제 대기", tone: "amber" });
    expect(partnerPaymentStatusLabel("CONFIRMED")).toEqual({ label: "결제 완료", tone: "green" });
    expect(partnerPaymentStatusLabel("FAILED")).toEqual({ label: "결제 실패", tone: "red" });
    expect(partnerPaymentStatusLabel("FAILED", "CANCEL_PENDING").label).toBe("결제 취소 처리 중");
    expect(partnerPaymentStatusLabel("CANCELED", "SUPERSEDED").label).toBe("새 결제로 대체됨");
    expect(partnerPaymentStatusLabel("CANCELED").label).toBe("결제 취소");
    expect(partnerPaymentStatusLabel("REFUNDED").tone).toBe("blue");
    expect(partnerPaymentStatusLabel("WHATEVER")).toEqual({ label: "WHATEVER", tone: "gray" });
  });
});

describe("payLine · samplePaidLine", () => {
  it("혼합 · 현금 · 🥬 전액 (프로토타입 시스템 메시지의 금액부)", () => {
    expect(payLine({ amount_total: 75650, amount_cel: 3, amount_cash: 15650 })).toBe("₩75,650 (🥬 3 + ₩15,650)");
    expect(payLine({ amount_total: 75650, amount_cel: 0, amount_cash: 75650 })).toBe("₩75,650 (현금)");
    expect(payLine({ amount_total: 40000, amount_cel: 2, amount_cash: 0 })).toBe("₩40,000 (🥬 2)");
    expect(payLine({ amount_total: 40000, amount_cel: 2, amount_cash: 0 }, "C")).toBe("₩40,000 (C 2)");
  });
  it("캠페인 상세 — purchased 아니면 빈 문자열", () => {
    expect(samplePaidLine({ purchased: true, sample_price: 75650, sample_cel: 3, sample_cash: 15650 })).toBe("샘플 결제 ₩75,650 (🥬 3 + ₩15,650)");
    expect(samplePaidLine({ purchased: false, sample_price: null, sample_cel: 0, sample_cash: 0 })).toBe("");
    expect(samplePaidLine({ purchased: true, sample_price: null, sample_cel: 0, sample_cash: 0 })).toBe("");
  });
});

describe("parseBeginSampleResult (app_partner_payment_claim)", () => {
  it("ok → camelCase · cashRequired · quote 파싱", () => {
    const r = parseBeginSampleResult(CLAIM_OK);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.paymentId).toBe(CLAIM_OK.payment_id);
    expect(r.orderId).toBe(CLAIM_OK.order_id);
    expect(r.amountTotal).toBe(75650);
    expect(r.amountCel).toBe(3);
    expect(r.amountCash).toBe(15650);
    expect(r.cashRequired).toBe(true);
    expect(r.useCel).toBe(true);
    expect(r.reused).toBe(false);
    expect(r.quote?.mode).toBe("buy");
  });
  it("🥬 전액 → cashRequired false", () => {
    const r = parseBeginSampleResult({ ...CLAIM_OK, amount_cel: 2, amount_cash: 0, amount_total: 40000, cash_required: false });
    expect(r.ok && r.cashRequired).toBe(false);
  });
  it("NOT_BUYABLE — mode/reason 유지 · 낯선 code → DB_ERROR · 형식 오류 → DB_ERROR", () => {
    const r = parseBeginSampleResult({ ok: false, code: "NOT_BUYABLE", mode: "active", reason: "ALREADY_ACTIVE", quote: { mode: "active", campaign_code: "c11" } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("NOT_BUYABLE");
    expect(r.mode).toBe("active");
    expect(r.reason).toBe("ALREADY_ACTIVE");
    expect(r.quote?.campaign_code).toBe("c11");
    const bad = parseBeginSampleResult({ ok: false, code: "BAD_SHIPPING", field: "phone" });
    expect(!bad.ok && bad.code === "BAD_SHIPPING" && bad.field === "phone").toBe(true);
    expect(parseBeginSampleResult({ ok: false, code: "WHAT" })).toMatchObject({ ok: false, code: "DB_ERROR" });
    expect(parseBeginSampleResult({ ok: true, payment_id: "x" })).toMatchObject({ ok: false, code: "DB_ERROR" });
    expect(parseBeginSampleResult(null)).toMatchObject({ ok: false, code: "DB_ERROR" });
  });
});

describe("parseConfirmSampleResult · parseSimplePaymentResult", () => {
  it("확정 ok/already · 실패 code", () => {
    const ok = parseConfirmSampleResult({
      ok: true,
      already: false,
      payment_id: "p",
      campaign_id: "c",
      campaign_code: "c102",
      order_id: "o",
      order_code: "o2007",
      amount_cel: 3,
      amount_cash: 15650,
      balance: 1,
    });
    expect(ok).toMatchObject({ ok: true, already: false, campaignCode: "c102", orderCode: "o2007", amountCel: 3, balance: 1 });
    expect(parseConfirmSampleResult({ ok: true, already: true, payment_id: "p" })).toMatchObject({ ok: true, already: true });
    expect(parseConfirmSampleResult({ ok: false, code: "CEL_INSUFFICIENT", cel: 1, balance: -3 })).toMatchObject({ ok: false, code: "CEL_INSUFFICIENT", cel: 1, balance: -3 });
    expect(parseConfirmSampleResult({ ok: true })).toMatchObject({ ok: false, code: "BAD_RESULT" });
    expect(parseConfirmSampleResult(undefined)).toMatchObject({ ok: false, code: "BAD_RESULT" });
  });
  it("fail/cancel/refund/confirming 공통 꼴", () => {
    expect(parseSimplePaymentResult({ ok: true, claimed: true })).toMatchObject({ ok: true, claimed: true, already: false });
    expect(parseSimplePaymentResult({ ok: true, already: true, status: "FAILED" })).toMatchObject({ ok: true, already: true, status: "FAILED" });
    expect(parseSimplePaymentResult({ ok: false, code: "CONFIRMING" })).toMatchObject({ ok: false, code: "CONFIRMING" });
    expect(parseSimplePaymentResult(42)).toMatchObject({ ok: false, code: "BAD_RESULT" });
  });
});

describe("partnerPayFailMessage", () => {
  it("코드 문구 · fallback · 기본 문구", () => {
    expect(partnerPayFailMessage("CEL_INSUFFICIENT")).toContain("🥬");
    expect(partnerPayFailMessage("AMOUNT_MISMATCH")).toBe("결제 금액이 주문과 달라 승인하지 않았어요");
    expect(partnerPayFailMessage("UNKNOWN_TOSS_CODE", "토스 원문")).toBe("토스 원문");
    expect(partnerPayFailMessage(null)).toBe("결제를 완료하지 못했어요 — 잠시 후 다시 시도해주세요");
  });
});
