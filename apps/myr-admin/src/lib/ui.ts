/** 입력 칸 Tailwind 클래스 — 크리에이터 콘솔 lib/ui.ts 와 같은 모양. 포커스는 주황 테두리 + 옅은 주황 배경 */
const FOCUS = 'outline-none transition-colors focus:border-accent focus:bg-accent/6';

export const INPUT = `h-12 w-full min-w-0 rounded-[14px] border-[1.5px] border-white/10 bg-white/4 px-4 text-[15px] text-fg ${FOCUS}`;
export const TEXTAREA = `w-full resize-none rounded-[14px] border-[1.5px] border-white/10 bg-white/4 px-4 py-3 text-[15px] leading-[1.55] text-fg ${FOCUS}`;
export const CARD = 'rounded-2xl border border-white/8 bg-white/3';
