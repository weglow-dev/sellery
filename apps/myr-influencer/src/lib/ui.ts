/** 입력 칸 Tailwind 클래스 — 디자인의 네 가지 크기를 그대로. 포커스는 주황 테두리 + 옅은 주황 배경 */
const FOCUS = 'outline-none transition-colors focus:border-accent focus:bg-accent/6';

/** 52px 한 줄 (제품명 · 가격 · 섹션 제목) */
export const INPUT_LG = `h-[52px] w-full min-w-0 rounded-[14px] border-[1.5px] border-white/10 bg-white/4 px-4 text-[16px] text-fg ${FOCUS}`;
/** 여러 줄 (레시피 노트 · 본문 · 고객 메시지) */
export const TEXTAREA = `w-full resize-none rounded-[14px] border-[1.5px] border-white/10 bg-white/4 px-4 py-3.5 text-[15px] leading-[1.6] text-fg ${FOCUS}`;
/** 46px 표 안 칸 (성분명 · 스텝 제목 · 태그 · Q) */
export const INPUT_SM = `h-[46px] min-w-0 rounded-xl border-[1.5px] border-white/10 bg-white/4 px-3 text-[14px] text-fg ${FOCUS}`;
/** 42px 보조 칸 (넣은 이유 · 스텝 설명 · 정보 표 값 · A) */
export const INPUT_SUB = `h-[42px] min-w-0 rounded-xl border-[1.5px] border-white/8 bg-white/3 px-3 text-[13px] text-fg ${FOCUS}`;

export const LABEL = 'text-[13px] font-semibold text-white/80';

/** 점선 "+ 추가" 버튼 (성분 · 질문) */
export const ADD_ROW = 'h-[50px] w-full rounded-2xl border-[1.5px] border-dashed border-white/18 bg-transparent text-[14px] font-semibold text-white/75';

/** 카드 테두리 — 목록 카드 · 입력 묶음 */
export const CARD = 'rounded-2xl border border-white/8 bg-white/3';
