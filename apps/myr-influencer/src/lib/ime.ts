/**
 * 한글 입력(IME) 조합 중인지 — 값을 다시 쓰는 칸(판매가 · 핸들 · 연락처)은 조합 중에 값을 바꾸지 않는다.
 * 조합 중에 바꾸면 덜 끝난 글자("ㅇ")가 남거나 다음 칸으로 넘어간다(2026-11-05 상품 등록 내용량). 조합이 끝나면(compositionend) 정리한다.
 */
export const isComposing = (e: Event): boolean => (e as Event & { isComposing?: boolean }).isComposing === true;
