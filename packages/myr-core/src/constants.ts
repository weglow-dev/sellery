/** MYR 공용 상수 · 표시 헬퍼 — 체크아웃 규칙 · 메일 템플릿 · 각 앱 화면이 같은 값을 쓴다(샵 `lib/data.ts` 가 다시 내보낸다). */

/** 한 줄 수량의 **숫자 형식** 검사 값 — 구매 수량 상한은 없다(2026-11-11 · 0095 · 실제 한도는 결제 때 재고).
 *  API 본문이 정수 범위 안의 수량인지만 본다(서버 RPC 도 같은 999,999 로 형식만 본다) */
export const QTY_FORMAT_MAX = 999999;

/** 원화 표시 `₩32,000` */
export const won = (n: number): string => '₩' + n.toLocaleString('ko-KR');
