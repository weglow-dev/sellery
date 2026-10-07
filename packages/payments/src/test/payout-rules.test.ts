// 토스 지급대행 규칙 — packages/payments/src/payout-rules.ts (0040). 셀러 본문(개인/사업자) · 지급 본문 · 분할 · 상태 · 웹훅 파서 · 문구.
import { describe, expect, it } from "vitest";
import {
  buildTossPayoutItem,
  buildTossSellerPayload,
  businessTypeOfBizNo,
  chunkPayouts,
  nextBusinessDay,
  parsePayoutWebhook,
  parseSellerWebhook,
  parseTossPayout,
  payoutInFlight,
  payoutRequestable,
  TOSS_PAYOUT_MAX_AMOUNT,
  TOSS_PAYOUT_MAX_PER_REQUEST,
  tossRefId,
  tossSellerReady,
  tossSellerStatusLine,
} from "../payout-rules";

const SELLER_ID = "a0000000-0000-4000-8000-000000000001";
const BRAND_ID = "b0000000-0000-4000-8000-000000000001";
const bank = { bank: "카카오뱅크", account: "3333-01-2345678", holder: "지유" };

describe("refSellerId · businessType", () => {
  it("tossRefId — 접두 + uuid 앞 18자 = 19자 (7~20 제약)", () => {
    expect(tossRefId("s", SELLER_ID)).toBe("sa00000000000400080");
    expect(tossRefId("b", BRAND_ID).length).toBe(19);
  });
  it("businessTypeOfBizNo — 가운데 2자리 80~89 법인 · 그 외 개인사업자 · 형식 아니면 null", () => {
    expect(businessTypeOfBizNo("123-81-00011")).toBe("CORPORATE");
    expect(businessTypeOfBizNo("1238500011")).toBe("CORPORATE");
    expect(businessTypeOfBizNo("512-21-00987")).toBe("INDIVIDUAL_BUSINESS");
    expect(businessTypeOfBizNo("512-95-00987")).toBe("INDIVIDUAL_BUSINESS");
    expect(businessTypeOfBizNo("12345")).toBeNull();
    expect(businessTypeOfBizNo(null)).toBeNull();
  });
});

describe("buildTossSellerPayload", () => {
  it("개인 인플루언서 → INDIVIDUAL · individual{name,email,phone} · account 3자리 코드 · 숫자만", () => {
    const r = buildTossSellerPayload({ payeeType: "seller", payeeId: SELLER_ID, settleType: "personal", name: "지유", email: "Jiyu@Sellery.demo", phone: "010-1234-5678", bank });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body).toEqual({
      refSellerId: "sa00000000000400080",
      businessType: "INDIVIDUAL",
      individual: { name: "지유", email: "jiyu@sellery.demo", phone: "01012345678" },
      account: { bankCode: "090", accountNumber: "3333012345678", holderName: "지유" },
      metadata: { payee_type: "seller", payee_id: SELLER_ID },
    });
    expect(r.body.company).toBeUndefined();
  });
  it("사업자 인플루언서 → 가운데 2자리로 INDIVIDUAL_BUSINESS · company 상호/대표자 기본값(활동명 · 예금주)", () => {
    const r = buildTossSellerPayload({ payeeType: "seller", payeeId: SELLER_ID, settleType: "biz", name: "혜린", email: "h@x.io", phone: "01000000000", bizNo: "512-21-00987", bank });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.businessType).toBe("INDIVIDUAL_BUSINESS");
    expect(r.body.company).toEqual({ name: "혜린", representativeName: "지유", businessRegistrationNumber: "5122100987", email: "h@x.io", phone: "01000000000" });
    expect(r.body.individual).toBeUndefined();
  });
  it("브랜드 → 항상 사업자 · 법인 번호면 CORPORATE · 상호/대표자 지정값", () => {
    const r = buildTossSellerPayload({
      payeeType: "brand",
      payeeId: BRAND_ID,
      name: "바인허브",
      email: "partner@vyneherb.co",
      phone: "02-123-4567",
      bizNo: "1238100011",
      company: "(주)바인허브",
      ceo: "김대표",
      bank: { bank: "기업", account: "12345678901234", holder: "(주)바인허브" },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.refSellerId.startsWith("b")).toBe(true);
    expect(r.body.businessType).toBe("CORPORATE");
    expect(r.body.company?.name).toBe("(주)바인허브");
    expect(r.body.company?.representativeName).toBe("김대표");
    expect(r.body.account.bankCode).toBe("003");
  });
  it("실패 코드 — 계좌 · 은행 코드 · 계좌번호 · 예금주 · 이메일 · 휴대폰 · 사업자번호", () => {
    const base = { payeeType: "seller" as const, payeeId: SELLER_ID, settleType: "personal", name: "지유", email: "j@x.io", phone: "01012345678", bank };
    expect(buildTossSellerPayload({ ...base, bank: null })).toMatchObject({ ok: false, code: "BANK_MISSING" });
    expect(buildTossSellerPayload({ ...base, bank: { ...bank, bank: "외계은행" } })).toMatchObject({ ok: false, code: "BANK_CODE_UNKNOWN" });
    expect(buildTossSellerPayload({ ...base, bank: { ...bank, account: "123" } })).toMatchObject({ ok: false, code: "BAD_ACCOUNT" });
    expect(buildTossSellerPayload({ ...base, bank: { ...bank, account: "123456789012345" } })).toMatchObject({ ok: false, code: "BAD_ACCOUNT" }); // 15자리 > 14
    expect(buildTossSellerPayload({ ...base, bank: { ...bank, holder: " " } })).toMatchObject({ ok: false, code: "HOLDER_REQUIRED" });
    expect(buildTossSellerPayload({ ...base, email: null })).toMatchObject({ ok: false, code: "EMAIL_REQUIRED" });
    expect(buildTossSellerPayload({ ...base, phone: "" })).toMatchObject({ ok: false, code: "PHONE_MISSING", field: "phone" });
    expect(buildTossSellerPayload({ ...base, name: "" })).toMatchObject({ ok: false, code: "NAME_REQUIRED" });
    expect(buildTossSellerPayload({ ...base, settleType: "biz", bizNo: "12-34" })).toMatchObject({ ok: false, code: "BIZ_NO_REQUIRED" });
  });
});

describe("buildTossPayoutItem · chunkPayouts", () => {
  it("EXPRESS — refPayoutId = payouts.id · amount {KRW,value} · 설명 ≤7자", () => {
    const r = buildTossPayoutItem({ payoutId: "75182cdc-6dcf-4bec-81c5-9e653b53f824", tossSellerId: "seller_x", amount: 2493188.4, scheduleType: "EXPRESS" });
    expect(r).toEqual({
      ok: true,
      item: { refPayoutId: "75182cdc-6dcf-4bec-81c5-9e653b53f824", destination: "seller_x", scheduleType: "EXPRESS", amount: { currency: "KRW", value: 2493188 }, transactionDescription: "셀러리정산" },
    });
  });
  it("SCHEDULED — payoutDate 필수 · 형식 검사 · 긴 설명은 7자로", () => {
    expect(buildTossPayoutItem({ payoutId: "p1", tossSellerId: "s", amount: 1000, scheduleType: "SCHEDULED" })).toEqual({ ok: false, code: "DATE_REQUIRED" });
    expect(buildTossPayoutItem({ payoutId: "p1", tossSellerId: "s", amount: 1000, scheduleType: "SCHEDULED", payoutDate: "2026/10/08" })).toEqual({ ok: false, code: "BAD_DATE" });
    const r = buildTossPayoutItem({ payoutId: "p1", tossSellerId: "s", amount: 1000, scheduleType: "SCHEDULED", payoutDate: "2026-10-08", description: "셀러리 10월 정산금" });
    expect(r.ok && r.item.payoutDate).toBe("2026-10-08");
    expect(r.ok && r.item.transactionDescription.length).toBeLessThanOrEqual(7);
  });
  it("금액 — 0 이하 · 10억 이상 · NaN 거부 · 셀러 없음 거부", () => {
    expect(buildTossPayoutItem({ payoutId: "p", tossSellerId: "s", amount: 0, scheduleType: "EXPRESS" })).toEqual({ ok: false, code: "BAD_AMOUNT" });
    expect(buildTossPayoutItem({ payoutId: "p", tossSellerId: "s", amount: TOSS_PAYOUT_MAX_AMOUNT, scheduleType: "EXPRESS" })).toEqual({ ok: false, code: "BAD_AMOUNT" });
    expect(buildTossPayoutItem({ payoutId: "p", tossSellerId: "s", amount: Number.NaN, scheduleType: "EXPRESS" })).toEqual({ ok: false, code: "BAD_AMOUNT" });
    expect(buildTossPayoutItem({ payoutId: "p", tossSellerId: "", amount: 10, scheduleType: "EXPRESS" })).toEqual({ ok: false, code: "NO_SELLER" });
  });
  it("chunkPayouts — 100건씩", () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    const chunks = chunkPayouts(items);
    expect(TOSS_PAYOUT_MAX_PER_REQUEST).toBe(100);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunkPayouts([])).toEqual([]);
  });
  it("nextBusinessDay — 주말 건너뜀", () => {
    expect(nextBusinessDay("2026-10-07")).toBe("2026-10-08"); // 수 → 목
    expect(nextBusinessDay("2026-10-09")).toBe("2026-10-12"); // 금 → 월
    expect(nextBusinessDay("2026-10-10")).toBe("2026-10-12"); // 토 → 월
  });
});

describe("상태 규칙 · 문구", () => {
  it("tossSellerReady / payoutInFlight / payoutRequestable", () => {
    expect(tossSellerReady("APPROVED")).toBe(true);
    expect(tossSellerReady("PARTIALLY_APPROVED")).toBe(true);
    expect(tossSellerReady("KYC_REQUIRED")).toBe(false);
    expect(tossSellerReady(null)).toBe(false);
    expect(payoutInFlight("REQUESTED")).toBe(true);
    expect(payoutInFlight("IN_PROGRESS")).toBe(true);
    expect(payoutInFlight("COMPLETED")).toBe(false);
    expect(payoutRequestable(null)).toBe(true);
    expect(payoutRequestable("FAILED")).toBe(true);
    expect(payoutRequestable("CANCELED")).toBe(true);
    expect(payoutRequestable("REQUESTED")).toBe(false);
    expect(payoutRequestable("COMPLETED")).toBe(false);
  });
  it("tossSellerStatusLine — 오류 우선 · 상태별 문구 · 개인/사업자 본인인증 안내", () => {
    expect(tossSellerStatusLine("APPROVED", { code: "INVALID_ACCOUNT", message: "계좌 오류" })).toMatchObject({ label: "계좌 오류", tone: "red", sub: "계좌 오류 (INVALID_ACCOUNT)" });
    expect(tossSellerStatusLine("APPROVED", null)).toMatchObject({ label: "지급 가능", tone: "green" });
    expect(tossSellerStatusLine("PARTIALLY_APPROVED", null).sub).toMatch(/1천만/);
    expect(tossSellerStatusLine("KYC_REQUIRED", null).tone).toBe("amber");
    expect(tossSellerStatusLine("APPROVAL_REQUIRED", null, "personal").sub).toMatch(/본인인증 문자/);
    expect(tossSellerStatusLine("APPROVAL_REQUIRED", null, "biz").sub).toMatch(/대표자/);
    expect(tossSellerStatusLine(null, null)).toMatchObject({ label: "계좌 확인 중", tone: "blue" });
  });
});

describe("웹훅 · 응답 파서", () => {
  it("parseSellerWebhook — eventType seller.changed 만 · data 는 id/status 필수", () => {
    const w = parseSellerWebhook({ eventType: "seller.changed", createdAt: "2026-10-07T09:00:00+09:00", data: { id: "seller_1", refSellerId: "sa0000", status: "PARTIALLY_APPROVED", account: { bankCode: "090" } } });
    expect(w?.data.id).toBe("seller_1");
    expect(w?.data.status).toBe("PARTIALLY_APPROVED");
    expect(w?.createdAt).toBe("2026-10-07T09:00:00+09:00");
    expect(parseSellerWebhook({ eventType: "payout.changed", data: { id: "x", status: "COMPLETED" } })).toBeNull();
    expect(parseSellerWebhook({ eventType: "seller.changed", data: { status: "APPROVED" } })).toBeNull();
    expect(parseSellerWebhook("nope")).toBeNull();
  });
  it("parsePayoutWebhook · parseTossPayout — error · amount · 날짜", () => {
    const w = parsePayoutWebhook({
      eventType: "payout.changed",
      createdAt: null,
      data: { id: "payout_1", refPayoutId: "75182cdc", destination: "seller_1", scheduleType: "EXPRESS", payoutDate: "2026-10-07", amount: { currency: "KRW", value: 1000 }, status: "FAILED", error: { code: "BANK_ERROR", message: "은행 점검" }, requestedAt: "2026-10-07T09:00:00+09:00" },
    });
    expect(w?.data).toMatchObject({ id: "payout_1", refPayoutId: "75182cdc", status: "FAILED", error: { code: "BANK_ERROR", message: "은행 점검" }, amount: { value: 1000 } });
    expect(parseTossPayout({ id: "p", status: "COMPLETED" })?.error).toBeNull();
    expect(parseTossPayout({ status: "COMPLETED" })).toBeNull();
    expect(parsePayoutWebhook({ eventType: "seller.changed", data: { id: "s", status: "APPROVED" } })).toBeNull();
  });
});
