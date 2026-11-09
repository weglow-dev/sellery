/**
 * MYR 정산 숫자(docs/myr.md §9-6 · 2026-11-09 결정) — 순수. 화면(상품 등록 "예상 정산" · 로그인 패널)이 이 파일 하나를 쓴다.
 *   - 정산 금액 = 판매가(부가세 포함 · 공구가로 팔렸으면 공구가)의 65% − PG 수수료 5%(모든 셀러 고정) = **60%**
 *   - 매월 1일에 지난달 배송 완료분 · 제조금액 상계(상품별) · 보증금 = 제조금액의 25%
 * 정산 계산 · 확정을 DB 로 만들 때(작업 순서 5) 이 숫자는 `platform_settings` 로 옮기고, 화면은 서버 값을 읽는다 — 그때도 출처는 하나.
 * 퍼센트를 정수로 둔다(0.65 − 0.05 같은 소수 오차를 피한다).
 */
export const SETTLEMENT_GROSS_PCT = 65;
export const PG_FEE_PCT = 5;
/** 크리에이터 정산 비율(%) = 65 − 5 */
export const SETTLEMENT_PCT = SETTLEMENT_GROSS_PCT - PG_FEE_PCT;
/** 보증금 = 제조금액의 25% */
export const DEPOSIT_PCT = 25;
/** 정산일 — 매월 1일(지난달 배송 완료분) */
export const SETTLEMENT_DAY = 1;

/** 판매가(원) → 예상 정산(원) — 화면 추정값(제조금액 상계 전) · 원 단위 반올림 */
export const settlementOf = (price: number): number => (Number.isFinite(price) && price > 0 ? Math.round((price * SETTLEMENT_PCT) / 100) : 0);
