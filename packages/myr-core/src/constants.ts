/** MYR 공용 상수 · 표시 헬퍼 — 체크아웃 규칙 · 메일 템플릿 · 각 앱 화면이 같은 값을 쓴다(샵 `lib/data.ts` 가 다시 내보낸다). */

/** 한 줄 최대 수량 — 장바구니 · 체크아웃 검증 · 0057/0058 RPC 의 상한(9)과 같은 값 */
export const MAX_QTY = 9;

/** 원화 표시 `₩32,000` */
export const won = (n: number): string => '₩' + n.toLocaleString('ko-KR');
