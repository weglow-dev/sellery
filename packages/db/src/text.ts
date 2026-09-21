/**
 * 문자열 정리 — 계약 docs/app-plan.md §10.0. 소유: E.
 *
 * 배송지(recipient/address1/address2/memo)·환불 사유는 브랜드 발주 CSV·알림톡·택배사 시스템으로 흘러가므로
 * 저장 시점에 이모지·비BMP 문자를 제거한다 (glo ebut.ts cleanText — "선경💙" 한 행이 WMS 배치 전체를 거부한 실사고).
 */

/**
 * 제거 대상:
 *   - 비BMP 전체(U+10000 이상: 이모지·희귀 한자 확장 등 — 서로게이트 쌍)
 *   - BMP 기호 블록 U+2190~U+2BFF(화살표·기술 기호·딩뱃·기타 기호 — glo 와 동일 범위)
 *   - 변형 선택자 U+FE0F · ZWJ U+200D · 제로폭 U+200B~U+200F · BOM U+FEFF
 *   - C0/C1 제어문자(탭·개행 포함 — 뒤에서 공백으로 정리)
 * 그 뒤 연속 공백을 하나로 접고 양끝을 잘라 낸다.
 */
const STRIP_RE =
  /[\u{10000}-\u{10FFFF}\u{2190}-\u{2BFF}\u{FE0F}\u{200B}-\u{200F}\u{FEFF}\u{0000}-\u{0008}\u{000B}\u{000C}\u{000E}-\u{001F}\u{007F}-\u{009F}]/gu;

/** 이모지·비BMP 문자 제거 + 공백 정리 */
export function cleanText(s: string): string {
  if (typeof s !== "string") return "";
  return s.replace(STRIP_RE, "").replace(/\s+/g, " ").trim();
}

/** 숫자만 남겨 ^\d{8,15}$ 이면 그 값, 아니면 null (토스 customerMobilePhone 제약 — '010-1234-5678' → '01012345678') */
export function normalizePhone(s: string): string | null {
  if (typeof s !== "string") return null;
  const digits = s.replace(/\D/g, "");
  return /^\d{8,15}$/.test(digits) ? digits : null;
}
