import { describe, expect, it } from "vitest";
import {
  SAMPLE_REFUND_NOTICE,
  parseSampleRefundDue,
  sampleRefundMessage,
  parseSampleSettleResult,
  parseSampleSettleRows,
  sampleSettleMessage,
} from "../admin/sample-rules";

describe("parseSampleSettleRows — 샘플 대금 정산 대기 (0024)", () => {
  const raw = {
    ok: true,
    rows: [
      {
        campaign_id: "a1",
        campaign_code: "c2",
        campaign_status: "PASSED",
        seller: { code: "s1", name: "지유", handle: "@jiyu_beauty" },
        brand: { code: "b2", name: "글로헬스" },
        product: { code: "p4", name: "GL-01 스킨 샷", sample_refund: true },
        sample_price: 75650,
        sample_cash: 75650,
        sample_cel: 0,
        shipped_on: "2026-09-20",
        brand_payout: 67404,
        seller_payout: 0,
      },
    ],
  };

  it("행을 읽는다", () => {
    const [r] = parseSampleSettleRows(raw);
    expect(r.campaignCode).toBe("c2");
    expect(r.campaignStatus).toBe("PASSED");
    expect(r.sellerHandle).toBe("@jiyu_beauty");
    expect(r.brandName).toBe("글로헬스");
    expect(r.brandPayout).toBe(67404);
    expect(r.shippedOn).toBe("2026-09-20");
  });

  it("환급 옵션 여부를 읽는다 — 켜져 있어도 판매 미확정이라 환급하지 않는다(화면이 안내)", () => {
    expect(parseSampleSettleRows(raw)[0].productSampleRefund).toBe(true);
    expect(parseSampleSettleRows(raw)[0].sellerPayout).toBe(0);
  });

  it("ok 가 아니거나 rows 가 배열이 아니면 빈 목록", () => {
    expect(parseSampleSettleRows({ ok: false })).toEqual([]);
    expect(parseSampleSettleRows({ ok: true, rows: "x" })).toEqual([]);
    expect(parseSampleSettleRows(null)).toEqual([]);
  });

  it("빠진 값은 0 · null 로 채운다", () => {
    const [r] = parseSampleSettleRows({ ok: true, rows: [{ campaign_id: "x", campaign_status: "PASSED" }] });
    expect(r.brandPayout).toBe(0);
    expect(r.sellerName).toBeNull();
    expect(r.productSampleRefund).toBe(false);
  });
});

describe("parseSampleRefundDue — 미발송 환불 대상 (0024)", () => {
  const raw = {
    ok: true,
    today: "2026-09-29",
    ship_days: 5,
    rows: [
      {
        campaign_id: "a1",
        campaign_code: "c2",
        payment_id: "pp1",
        seller: { code: "s1", name: "지유", handle: "@jiyu_beauty" },
        brand: { code: "b2", name: "글로헬스" },
        product: { code: "p4", name: "GL-01 스킨 샷" },
        amount_total: 75650,
        amount_cash: 75650,
        amount_cel: 0,
        paid_on: "2026-09-18",
        due_on: "2026-09-25",
        days_over: 4,
      },
    ],
  };

  it("기한·경과일을 읽는다", () => {
    const d = parseSampleRefundDue(raw);
    expect(d.today).toBe("2026-09-29");
    expect(d.shipDays).toBe(5);
    expect(d.rows[0].paidOn).toBe("2026-09-18");
    expect(d.rows[0].dueOn).toBe("2026-09-25");
    expect(d.rows[0].daysOver).toBe(4);
    expect(d.rows[0].paymentId).toBe("pp1"); // 환불 실행에 쓰는 키
  });

  it("🥬 분할 결제도 읽는다", () => {
    const d = parseSampleRefundDue({ ...raw, rows: [{ ...raw.rows[0], amount_cash: 55650, amount_cel: 1 }] });
    expect(d.rows[0].amountTotal).toBe(75650);
    expect(d.rows[0].amountCash).toBe(55650);
    expect(d.rows[0].amountCel).toBe(1);
  });

  it("ok 가 아니면 빈 결과 · 기한 기본값 5", () => {
    const d = parseSampleRefundDue({ ok: false });
    expect(d.rows).toEqual([]);
    expect(d.shipDays).toBe(5);
    expect(d.today).toBeNull();
  });

  it("ship_days 가 없으면 5 로 본다", () => {
    expect(parseSampleRefundDue({ ok: true, rows: [] }).shipDays).toBe(5);
  });
});

describe("parseSampleSettleResult", () => {
  it("성공", () => {
    const r = parseSampleSettleResult({ ok: true, already: false, settlement_id: "st1", brand_payout: 67404 });
    expect(r).toEqual({ ok: true, already: false, settlementId: "st1", brandPayout: 67404 });
  });

  it("멱등(already)", () => {
    const r = parseSampleSettleResult({ ok: true, already: true, settlement_id: "st1" });
    expect(r.ok && r.already).toBe(true);
  });

  it("실패 코드를 그대로 전달", () => {
    expect(parseSampleSettleResult({ ok: false, code: "NOT_SHIPPED" })).toEqual({ ok: false, code: "NOT_SHIPPED", status: null });
    expect(parseSampleSettleResult({ ok: false, code: "NOT_TERMINAL", status: "TESTING" })).toMatchObject({ code: "NOT_TERMINAL", status: "TESTING" });
  });

  it("객체가 아니면 DB_ERROR", () => {
    expect(parseSampleSettleResult(null)).toEqual({ ok: false, code: "DB_ERROR" });
    expect(parseSampleSettleResult([])).toEqual({ ok: false, code: "DB_ERROR" });
  });
});

describe("sampleSettleMessage", () => {
  it("0024 실패 코드를 사람 말로", () => {
    expect(sampleSettleMessage("settled")).toContain("정산");
    expect(sampleSettleMessage("err_NOT_SHIPPED")).toContain("환불");
    expect(sampleSettleMessage("err_NOT_TERMINAL")).toContain("판매 정산");
    expect(sampleSettleMessage("err_REFUNDED")).toContain("환불된");
  });

  it("모르는 키 · 빈 값은 null — 다른 화면 메시지를 가로채지 않는다", () => {
    expect(sampleSettleMessage("err_rate")).toBeNull();
    expect(sampleSettleMessage(null)).toBeNull();
    expect(sampleSettleMessage("")).toBeNull();
  });
});

describe("sampleRefundMessage — 환불 결과 (refundSamplePurchase 반환 코드)", () => {
  it("성공 · 멱등", () => {
    expect(sampleRefundMessage("refunded")).toContain("환불");
    expect(sampleRefundMessage("refund_already")).toContain("이미");
  });

  it("발송된 건은 브랜드 지급이라는 것을 알린다", () => {
    expect(sampleRefundMessage("err_refund_NOT_CANCELABLE")).toContain("브랜드");
  });

  it("토스 실패와 DB 실패를 구분한다 — 재시도 안내가 다르다", () => {
    expect(sampleRefundMessage("err_refund_TOSS")).toContain("DB 는 바꾸지 않았");
    expect(sampleRefundMessage("err_refund_DB_ERROR")).toContain("토스 취소는 됐");
  });

  it("모르는 키는 null", () => {
    expect(sampleRefundMessage("err_rate")).toBeNull();
    expect(sampleRefundMessage(null)).toBeNull();
  });
});

describe("SAMPLE_REFUND_NOTICE", () => {
  it("토스 취소가 먼저이고 되돌릴 수 없다는 것을 알린다", () => {
    expect(SAMPLE_REFUND_NOTICE).toContain("토스");
    expect(SAMPLE_REFUND_NOTICE).toContain("되돌릴 수 없");
  });
});
