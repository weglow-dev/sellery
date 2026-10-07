// 은행명 → 토스 지급대행 은행 코드 — packages/db/src/partner/bank-codes.ts (0040). 정산 폼 BANKS 9개는 전부 코드가 있어야 한다.
import { describe, expect, it } from "vitest";
import { BANKS } from "../partner/settle-rules";
import { bankNameOfTossCode, TOSS_BANK_CODES, tossBankCodeOf } from "../partner/bank-codes";

describe("tossBankCodeOf", () => {
  it("정산 폼 BANKS 9개 전부 3자리 코드가 있다", () => {
    for (const b of BANKS) expect(tossBankCodeOf(b), b).toMatch(/^\d{3}$/);
  });
  it("금융결제원 코드 — 국민 004 · 신한 088 · 우리 020 · 하나 081 · 농협 011 · 카카오뱅크 090 · 토스뱅크 092 · 기업 003 · SC제일 023", () => {
    expect(tossBankCodeOf("국민")).toBe("004");
    expect(tossBankCodeOf("신한")).toBe("088");
    expect(tossBankCodeOf("우리")).toBe("020");
    expect(tossBankCodeOf("하나")).toBe("081");
    expect(tossBankCodeOf("농협")).toBe("011");
    expect(tossBankCodeOf("카카오뱅크")).toBe("090");
    expect(tossBankCodeOf("토스뱅크")).toBe("092");
    expect(tossBankCodeOf("기업")).toBe("003");
    expect(tossBankCodeOf("SC제일")).toBe("023");
  });
  it("표기 변형 · 공백 허용 · 모르는 이름은 null", () => {
    expect(tossBankCodeOf("KB국민은행")).toBe("004");
    expect(tossBankCodeOf(" 카카오 뱅크 ")).toBe("090");
    expect(tossBankCodeOf("케이뱅크")).toBe("089");
    expect(tossBankCodeOf("외계은행")).toBeNull();
    expect(tossBankCodeOf("")).toBeNull();
    expect(tossBankCodeOf(null)).toBeNull();
  });
  it("코드 값은 전부 3자리 숫자 · 역매핑", () => {
    for (const v of Object.values(TOSS_BANK_CODES)) expect(v).toMatch(/^\d{3}$/);
    expect(bankNameOfTossCode("90")).toBe("카카오뱅크");
    expect(bankNameOfTossCode("999")).toBe("999");
    expect(bankNameOfTossCode(null)).toBeNull();
  });
});
