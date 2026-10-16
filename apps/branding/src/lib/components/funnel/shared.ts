/** 제조의뢰 퍼널 공통 — 단계 타입 · 레일 항목 타입 · 단계 화면들이 같이 쓰는 클래스 상수. */

export type Step = 'intro' | 'category' | 'ingredient' | 'form' | 'sub' | 'package' | 'flavor' | 'contact' | 'done';

/** 데스크톱 사이드 레일 한 줄 */
export type RailItem = {
	step: Step;
	n: string;
	title: string;
	value: string;
	on: boolean;
	past: boolean;
	locked: boolean;
	dim: boolean;
};

export const eyebrowCls = 'text-[13px] font-bold text-accent';
export const h1Cls = 'mt-2 text-[27px] leading-[1.34] font-extrabold tracking-[-0.025em] text-fg lg:text-4xl lg:leading-[1.25] lg:tracking-[-0.03em]';
export const helperCls = 'mt-2.5 text-[15px] text-fg/60 lg:mt-3 lg:text-base';
export const labelCls = 'text-sm font-semibold text-fg/80';
export const inputCls =
	'w-full rounded-[14px] border-[1.5px] border-white/10 bg-white/[0.04] px-4 text-[16px] text-fg transition placeholder:text-white/[0.34] focus:border-accent focus:bg-accent/[0.06] focus:outline-none';
export const errCls = 'mt-2 text-xs text-accent';
export const ctaOn =
	'flex h-[58px] w-full items-center justify-center gap-2 rounded-2xl bg-accent text-[17px] font-extrabold text-bg transition hover:bg-accent-deep active:scale-[0.98] lg:h-14 lg:w-[260px]';
export const ctaOff =
	'flex h-[58px] w-full items-center justify-center gap-2 rounded-2xl bg-white/[0.08] text-[17px] font-extrabold text-fg transition active:scale-[0.98] lg:h-14 lg:w-[260px]';
/** 단계 화면 공통 — 내부 세로 스크롤, 아래 버튼은 고정 · 질문 본문은 데스크톱에서 900px 까지.
 *  데스크톱 푸터는 본문과 같은 폭(900px + 좌우 여백 56px)으로 묶고 그 안에서 오른쪽 정렬 — 버튼이 화면 끝이 아니라 입력란 끝선에 온다 */
export const scrollCls = 'no-scrollbar flex-1 overflow-y-auto px-5 pt-2 pb-7 lg:px-14 lg:pb-12';
export const footCls = 'shrink-0 px-5 pt-3 pb-7 lg:flex lg:w-full lg:max-w-[1012px] lg:flex-col lg:items-end lg:px-14 lg:pb-9';
export const bodyCls = 'lg:max-w-[900px]';
