/** 금액 표시 — 서버가 보낸 숫자를 ₩ 와 천 단위 쉼표로만 바꾼다(계산하지 않는다) · 음수는 "−₩150,400"(시안) */
export const won = (n: number) => `${n < 0 ? '−₩' : '₩'}${Math.abs(n).toLocaleString('ko-KR')}`;
