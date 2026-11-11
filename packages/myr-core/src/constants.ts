/** MYR 공용 상수 · 표시 헬퍼 — 체크아웃 규칙 · 메일 템플릿 · 각 앱 화면이 같은 값을 쓴다(샵 `lib/data.ts` 가 다시 내보낸다). */

/** API 본문의 수량이 DB 정수(int4)로 보낼 수 있는 값인지 — 전송 형식일 뿐이다.
 *  구매 수량 상한은 없고(0095 · 실제 한도는 재고), 수량 숫자 형식 범위는 서버 `myr_qty_parse` · `myr_qty_max` 한 곳(0097)이 정한다 — 화면은 그 숫자를 들고 있지 않는다 */
export const QTY_INT_MAX = 2_147_483_647;

/** 원화 표시 `₩32,000` */
export const won = (n: number): string => '₩' + n.toLocaleString('ko-KR');
