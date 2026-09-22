// 비회원 구매·주문 조회 규칙 — packages/db/src/guest-order.ts (0021 · docs/app-plan.md §6.1 /orders/lookup)
import { describe, expect, it } from "vitest";
import {
  GUEST_CHECKOUT_COOKIE,
  GUEST_TOKEN_COOKIE_MAX_AGE,
  guestOrderHref,
  guestTokenCookieName,
  parseGuestBody,
  parseGuestLookupInput,
  parseGuestLookupResult,
  parseGuestToken,
  validateGuestBuyer,
} from "../guest-order";

const TOKEN = "a".repeat(64);

describe("쿠키 이름 · 토큰 형식", () => {
  it("주문번호는 소문자로 고정 — 화면(대문자)과 DB(소문자)가 같은 쿠키를 본다", () => {
    expect(guestTokenCookieName("O2013")).toBe("slry_guest_o2013");
    expect(guestTokenCookieName(" o2013 ")).toBe("slry_guest_o2013");
    expect(GUEST_CHECKOUT_COOKIE).toBe("slry_gck");
    expect(GUEST_TOKEN_COOKIE_MAX_AGE).toBe(90 * 86400);
  });
  it("토큰은 64 hex 만", () => {
    expect(parseGuestToken(TOKEN)).toBe(TOKEN);
    expect(parseGuestToken(` ${TOKEN} `)).toBe(TOKEN);
    expect(parseGuestToken("A".repeat(64))).toBeNull();
    expect(parseGuestToken("a".repeat(63))).toBeNull();
    expect(parseGuestToken(undefined)).toBeNull();
  });
  it("상세 경로", () => {
    expect(guestOrderHref("O2013")).toBe("/orders/g/o2013");
  });
});

describe("parseGuestLookupInput", () => {
  it("주문번호 공백·#·대소문자 정리 + 연락처 정규화", () => {
    const r = parseGuestLookupInput(" #O 2013 ", "010-1234-5678");
    expect(r).toEqual({ ok: true, input: { orderCode: "o2013", phone: "01012345678" } });
  });
  it("빈 값·형식 오류는 칸을 가리킨다", () => {
    expect(parseGuestLookupInput("", "01012345678")).toMatchObject({ ok: false, field: "code" });
    expect(parseGuestLookupInput("o2013!!", "01012345678")).toMatchObject({ ok: false, field: "code" });
    expect(parseGuestLookupInput("o2013", "")).toMatchObject({ ok: false, field: "phone" });
    expect(parseGuestLookupInput("o2013", "1234")).toMatchObject({ ok: false, field: "phone" });
    expect(parseGuestLookupInput(null, undefined)).toMatchObject({ ok: false, field: "code" });
  });
});

describe("validateGuestBuyer · parseGuestBody", () => {
  it("이름·연락처·동의 필수, 이메일 선택", () => {
    expect(validateGuestBuyer({ name: " 김손님💙 ", phone: "010 9999 0001", email: "", consent: true })).toEqual({
      ok: true,
      buyer: { name: "김손님", phone: "01099990001", email: null },
    });
    expect(validateGuestBuyer({ name: "", phone: "01099990001", email: "", consent: true })).toMatchObject({ ok: false, field: "name" });
    expect(validateGuestBuyer({ name: "김", phone: "", email: "", consent: true })).toMatchObject({ ok: false, field: "phone" });
    expect(validateGuestBuyer({ name: "김", phone: "01099990001", email: "nope", consent: true })).toMatchObject({ ok: false, field: "email" });
    expect(validateGuestBuyer({ name: "김", phone: "01099990001", email: "a@b.co", consent: false })).toMatchObject({ ok: false, field: "consent" });
  });
  it("본문 guest 객체 — 형식이 어긋나면 null", () => {
    expect(parseGuestBody({ name: "김", phone: "01099990001", email: "a@b.co", consent: true })).toEqual({ name: "김", phone: "01099990001", email: "a@b.co" });
    expect(parseGuestBody({ name: "김", phone: "01099990001", consent: "true" })).toBeNull();
    expect(parseGuestBody("x")).toBeNull();
    expect(parseGuestBody(null)).toBeNull();
  });
});

describe("parseGuestLookupResult", () => {
  it("ok 반환은 토큰 형식까지 확인", () => {
    const j = { ok: true, order_id: "id", order_code: "o2013", customer_id: "cid", token: TOKEN };
    expect(parseGuestLookupResult(j)).toEqual({ ok: true, orderId: "id", orderCode: "o2013", customerId: "cid", token: TOKEN });
    expect(parseGuestLookupResult({ ...j, token: "short" })).toEqual({ ok: false, code: "BAD_RESULT" });
  });
  it("NOT_FOUND 와 그 외", () => {
    expect(parseGuestLookupResult({ ok: false, code: "NOT_FOUND" })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(parseGuestLookupResult({ ok: false, code: "WHAT" })).toEqual({ ok: false, code: "BAD_RESULT" });
    expect(parseGuestLookupResult(null)).toEqual({ ok: false, code: "BAD_RESULT" });
  });
});
