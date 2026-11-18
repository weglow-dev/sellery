/** 금액 표시 — 서버가 보낸 숫자를 ₩ 와 천 단위 쉼표로만 바꾼다(계산하지 않는다) */
export const won = (n: number) => `₩${n.toLocaleString('ko-KR')}`;
