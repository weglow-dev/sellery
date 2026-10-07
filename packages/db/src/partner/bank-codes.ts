/**
 * 은행명 → 토스페이먼츠 지급대행 은행 코드 — 순수 모듈 (0040 · docs.tosspayments.com/codes/org-codes 의 금융결제원 3자리 코드).
 *
 * 정산 계좌 은행은 `BANKS`(@sellery/core/constants · 0013 `app_set_settle_info` v_banks) 의 9개 이름으로만 저장된다.
 * 지급대행 `account.bankCode` 는 "2 또는 3자리" 를 받는데, 지급대행 안내의 실패 테스트 계좌가 3자리(011 · 002 …)를 쓰므로 3자리 금결원 코드로 통일한다.
 * 목록에 없는 이름(옛 데이터 · 표기 변형)은 `tossBankCodeOf` 가 null — 호출자는 토스에 보내지 않고 계좌 오류로 다룬다.
 */

/** 금융결제원 3자리 코드 — 한글 이름은 정산 폼 `BANKS` 와 같은 표기 + 흔한 변형 */
export const TOSS_BANK_CODES: Readonly<Record<string, string>> = {
  산업: "002",
  산업은행: "002",
  기업: "003",
  기업은행: "003",
  IBK기업은행: "003",
  국민: "004",
  국민은행: "004",
  KB국민은행: "004",
  수협: "007",
  수협은행: "007",
  농협: "011",
  농협은행: "011",
  NH농협은행: "011",
  우리: "020",
  우리은행: "020",
  SC제일: "023",
  SC제일은행: "023",
  씨티: "027",
  씨티은행: "027",
  한국씨티은행: "027",
  대구: "031",
  대구은행: "031",
  iM뱅크: "031",
  부산: "032",
  부산은행: "032",
  광주: "034",
  광주은행: "034",
  제주: "035",
  제주은행: "035",
  전북: "037",
  전북은행: "037",
  경남: "039",
  경남은행: "039",
  새마을: "045",
  새마을금고: "045",
  신협: "048",
  저축은행: "050",
  산림조합: "064",
  우체국: "071",
  하나: "081",
  하나은행: "081",
  KEB하나은행: "081",
  신한: "088",
  신한은행: "088",
  케이뱅크: "089",
  K뱅크: "089",
  카카오뱅크: "090",
  카카오: "090",
  토스뱅크: "092",
  토스: "092",
};

/** 은행명 → 3자리 코드. 공백 제거 · 모르는 이름은 null */
export function tossBankCodeOf(bankName: string | null | undefined): string | null {
  const key = String(bankName ?? "").replace(/\s+/g, "");
  if (!key) return null;
  return TOSS_BANK_CODES[key] ?? null;
}

/** 코드 → 대표 이름(표시용) — 모르는 코드는 코드 그대로 */
export function bankNameOfTossCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = String(code).padStart(3, "0");
  for (const [name, v] of Object.entries(TOSS_BANK_CODES)) if (v === c) return name;
  return c;
}
