// 체크아웃 순수 규칙 — web/src/components/checkout/rules.ts 의 동작 (ux-spec §3.4 · §3.5 · app-plan §6.3 · §10.1 D 행)
import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAFT,
  FAIL_FALLBACK,
  FAIL_PAGE_DEFAULT,
  FAIL_SESSION_DEFAULT_CODE,
  FAIL_TEXT,
  MEMO_MAX,
  QTY_MAX,
  checkoutHref,
  failPageReason,
  failSessionCode,
  failText,
  ownsCheckoutSession,
  parseCheckoutParams,
  parseCheckoutReturn,
  parseSuccessParams,
  validateShipping,
} from "../checkout-rules";

describe("parseCheckoutParams — /checkout?c&o&q", () => {
  it("정상 · 소문자 정규화", () => {
    expect(parseCheckoutParams({ c: "C1", o: "0", q: "2" })).toEqual({ code: "c1", optionIndex: 0, qty: 2 });
    expect(parseCheckoutParams({ c: ["c1", "c2"], o: "1", q: "1" })).toEqual({ code: "c1", optionIndex: 1, qty: 1 });
  });
  it("형식이 어긋나면 null (코드 형식 · 정수 아님 · 수량 범위)", () => {
    expect(parseCheckoutParams({ c: "c1!", o: "0", q: "1" })).toBeNull();
    expect(parseCheckoutParams({ c: "c1", o: "x", q: "1" })).toBeNull();
    expect(parseCheckoutParams({ c: "c1", o: "0", q: "0" })).toBeNull();
    expect(parseCheckoutParams({ c: "c1", o: "0", q: String(QTY_MAX + 1) })).toBeNull();
    expect(parseCheckoutParams({ c: "c1", o: "0", q: "1e1" })).toBeNull();
    expect(parseCheckoutParams({})).toBeNull();
  });
  it("checkoutHref", () => {
    expect(checkoutHref("c1", 0, 2)).toBe("/checkout?c=c1&o=0&q=2");
  });
});

describe("validateShipping — 배송지 검증 문구 · 전화번호 정규화", () => {
  const ok = { recipient: " 홍길동 ", phone: "010-1234-5678", postcode: "06236", address1: "서울시 강남구", address2: "", memo: "" };
  it("통과하면 phone 정규화 · 선택 필드는 비면 생략", () => {
    expect(validateShipping(ok)).toEqual({
      ok: true,
      shipping: { recipient: "홍길동", phone: "01012345678", postcode: "06236", address1: "서울시 강남구" },
    });
    const r = validateShipping({ ...ok, address2: " 101호 ", memo: " 문 앞 " });
    expect(r.ok && r.shipping.address2).toBe("101호");
    expect(r.ok && r.shipping.memo).toBe("문 앞");
  });
  it("첫 번째 어긋난 필드와 문구", () => {
    expect(validateShipping(EMPTY_DRAFT)).toMatchObject({ ok: false, field: "recipient", message: "받는 분 이름을 입력해주세요" });
    expect(validateShipping({ ...ok, phone: "" })).toMatchObject({ ok: false, field: "phone", message: "연락처를 입력해주세요" });
    expect(validateShipping({ ...ok, phone: "12-34" })).toMatchObject({ ok: false, field: "phone", message: "연락처는 숫자 8~15자리로 입력해주세요" });
    expect(validateShipping({ ...ok, postcode: "1234" })).toMatchObject({ ok: false, field: "postcode" });
    expect(validateShipping({ ...ok, postcode: "062-36" })).toMatchObject({ ok: true }); // 숫자만 남겨 5자리
    expect(validateShipping({ ...ok, address1: " " })).toMatchObject({ ok: false, field: "address1" });
    expect(validateShipping({ ...ok, memo: "a".repeat(MEMO_MAX + 1) })).toMatchObject({ ok: false, field: "memo" });
  });
});

describe("parseSuccessParams — /checkout/success?paymentKey&orderId&amount", () => {
  it("amount 는 ^\\d{1,15}$ 만 — '1e4' · 소수 · 공백 · 0 거부", () => {
    expect(parseSuccessParams("pk_123456", "slry_1_abc", "29900")).toEqual({ paymentKey: "pk_123456", orderId: "slry_1_abc", amount: 29900 });
    expect(parseSuccessParams("pk_123456", "slry_1_abc", "1e4")).toBeNull();
    expect(parseSuccessParams("pk_123456", "slry_1_abc", "299.00")).toBeNull();
    expect(parseSuccessParams("pk_123456", "slry_1_abc", " 29900")).toBeNull();
    expect(parseSuccessParams("pk_123456", "slry_1_abc", "0")).toBeNull();
    expect(parseSuccessParams("short", "slry_1_abc", "1")).toBeNull();
    expect(parseSuccessParams(null, "slry_1_abc", "1")).toBeNull();
  });
});

describe("failText — 성공 페이지 실패 뷰 문구 (app-plan §6.3 표)", () => {
  it("표의 code → 표 문구", () => {
    for (const code of Object.keys(FAIL_TEXT)) expect(failText(code)).toBe(FAIL_TEXT[code]);
    expect(failText("SOLD_OUT").kind).toBe("final");
    expect(failText("CANCEL_PENDING").kind).toBe("pending");
  });
  it("앱 자체 code · 빈 code · message 없음 → 폴백", () => {
    expect(failText("UNAUTHORIZED", "x")).toEqual({ text: FAIL_FALLBACK, money: "", kind: "final" });
    expect(failText("", "x")).toEqual({ text: FAIL_FALLBACK, money: "", kind: "final" });
    expect(failText("SOME_TOSS_CODE")).toEqual({ text: FAIL_FALLBACK, money: "", kind: "final" });
  });
  it("토스 code → message 원문 + 코드", () => {
    expect(failText("INVALID_CARD", "카드가 유효하지 않습니다")).toEqual({
      text: "카드가 유효하지 않습니다 (코드 INVALID_CARD)",
      money: "결제되지 않았습니다",
      kind: "final",
    });
  });
});

describe("failPageReason — /checkout/fail 반사 방어", () => {
  it("PAY_PROCESS_CANCELED → 고객 취소 문구", () => {
    expect(failPageReason("PAY_PROCESS_CANCELED", "whatever")).toBe("결제를 취소했어요. 결제는 진행되지 않았습니다.");
  });
  it("code 형식이 아니면 기본 문구(message 무시)", () => {
    expect(failPageReason("bad code", "x")).toBe(FAIL_PAGE_DEFAULT);
    expect(failPageReason(null, "x")).toBe(FAIL_PAGE_DEFAULT);
  });
  it("URL·전화번호 모양(스푸핑) 은 기본 문구 + 코드, 정상 message 는 cleanText 후 반사", () => {
    expect(failPageReason("REJECT_CARD", "고객센터 02-1234-5678 로 전화")).toBe(`${FAIL_PAGE_DEFAULT} (코드 REJECT_CARD)`);
    expect(failPageReason("REJECT_CARD", "https://evil.example 방문")).toBe(`${FAIL_PAGE_DEFAULT} (코드 REJECT_CARD)`);
    expect(failPageReason("REJECT_CARD", "한도 초과💳")).toBe("한도 초과 (코드 REJECT_CARD)");
    expect(failPageReason("REJECT_CARD", "a".repeat(200))).toBe(`${"a".repeat(120)} (코드 REJECT_CARD)`);
  });
});

describe("parseCheckoutReturn — sessionStorage 복귀 링크", () => {
  it("store 는 같은 오리진 경로, retry 는 /checkout? 로 시작해야 한다", () => {
    expect(parseCheckoutReturn(JSON.stringify({ store: "/s/jiyu_beauty/c1", retry: "/checkout?c=c1&o=0&q=1" }))).toEqual({
      store: "/s/jiyu_beauty/c1",
      retry: "/checkout?c=c1&o=0&q=1",
    });
    expect(parseCheckoutReturn(JSON.stringify({ store: "//evil", retry: "/checkout?c=c1" }))).toBeNull();
    expect(parseCheckoutReturn(JSON.stringify({ store: "/s/x/c1", retry: "/evil" }))).toBeNull();
    expect(parseCheckoutReturn("not json")).toBeNull();
    expect(parseCheckoutReturn(null)).toBeNull();
  });
});

/**
 * `/checkout/fail` 이 PENDING 세션을 종결하기 전에 거치는 경계(0042).
 * `orderId` 는 공개 URL 값이라 이 판정이 없으면 주문번호만 알면 남의 결제 세션을 끝낼 수 있다.
 */
describe("ownsCheckoutSession — 결제 세션 소유 판정", () => {
  const member = { id: "s-member", user_id: "u1" };
  const guest = { id: "s-guest", user_id: null };

  it("회원 세션은 user_id 가 같을 때만", () => {
    expect(ownsCheckoutSession(member, { userId: "u1" })).toBe(true);
    expect(ownsCheckoutSession(member, { userId: "u2" })).toBe(false);
    expect(ownsCheckoutSession(member, { userId: null })).toBe(false);
    expect(ownsCheckoutSession(member, {})).toBe(false);
  });

  it("회원 세션은 쿠키로 열리지 않는다 — 세션 id 를 알아도 남의 회원 세션은 못 끝낸다", () => {
    expect(ownsCheckoutSession(member, { guestSessionId: "s-member" })).toBe(false);
    expect(ownsCheckoutSession(member, { userId: "u2", guestSessionId: "s-member" })).toBe(false);
  });

  it("비회원 세션은 slry_gck 쿠키가 그 세션 id 일 때만", () => {
    expect(ownsCheckoutSession(guest, { guestSessionId: "s-guest" })).toBe(true);
    expect(ownsCheckoutSession(guest, { guestSessionId: "s-other" })).toBe(false);
    expect(ownsCheckoutSession(guest, { guestSessionId: null })).toBe(false);
    expect(ownsCheckoutSession(guest, {})).toBe(false);
  });

  it("비회원 세션은 로그인만으로는 열리지 않는다 (쿠키가 있어야 한다)", () => {
    expect(ownsCheckoutSession(guest, { userId: "u1" })).toBe(false);
    expect(ownsCheckoutSession(guest, { userId: "u1", guestSessionId: "s-guest" })).toBe(true);
  });
});

describe("failSessionCode — 세션에 적을 실패 코드", () => {
  it("토스 code 형식만 그대로 쓴다", () => {
    expect(failSessionCode("PAY_PROCESS_CANCELED")).toBe("PAY_PROCESS_CANCELED");
    expect(failSessionCode("REJECT_CARD")).toBe("REJECT_CARD");
  });

  it("형식이 어긋나면 기본 코드 — 공개 URL 값을 그대로 저장하지 않는다", () => {
    expect(failSessionCode("")).toBe(FAIL_SESSION_DEFAULT_CODE);
    expect(failSessionCode(null)).toBe(FAIL_SESSION_DEFAULT_CODE);
    expect(failSessionCode(undefined)).toBe(FAIL_SESSION_DEFAULT_CODE);
    expect(failSessionCode("drop table")).toBe(FAIL_SESSION_DEFAULT_CODE);
    expect(failSessionCode("reject_card")).toBe(FAIL_SESSION_DEFAULT_CODE);
    expect(failSessionCode("A".repeat(41))).toBe(FAIL_SESSION_DEFAULT_CODE);
  });
});
