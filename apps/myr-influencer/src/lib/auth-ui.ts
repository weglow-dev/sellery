/**
 * 로그인 · 초대 가입 화면의 입력 칸 스타일 — 시안 "MYR Influencer Login" · "Signup" 의 field() 규칙:
 * 오류면 주황 테두리 + 옅은 주황 배경, 값이 있으면 조금 밝은 테두리, 비었으면 옅은 테두리. 포커스는 주황.
 * Tailwind 가 클래스를 찾을 수 있게 전체 문자열로 쓴다.
 */
const BASE =
	'w-full min-w-0 rounded-2xl border-[1.5px] text-[16px] text-fg outline-none transition-colors placeholder:text-white/34 focus:border-accent focus:bg-accent/6 disabled:cursor-not-allowed read-only:cursor-default';

/** h: md = 54px(모바일 가입 폼) · lg = 56px(로그인 · PC) */
export function authInput(opts: { invalid?: boolean; filled?: boolean; size?: 'md' | 'lg'; padLeft?: boolean; padRight?: boolean } = {}): string {
	const h = opts.size === 'md' ? 'h-[54px] lg:h-14' : 'h-14';
	const state = opts.invalid ? 'border-accent bg-accent/6' : opts.filled ? 'border-white/18 bg-white/4' : 'border-white/10 bg-white/4';
	const pl = opts.padLeft ? 'pl-9' : 'pl-4';
	const pr = opts.padRight ? 'pr-[52px]' : 'pr-4';
	return `${BASE} ${h} ${state} ${pl} ${pr}`;
}

export const AUTH_LABEL = 'text-[13px] font-semibold text-white/80 lg:text-[14px]';
export const AUTH_HINT = 'text-[12px] leading-[1.5] text-white/45';

/** 주 버튼 — 켜짐(주황) / 꺼짐(회색 · 누르면 빠진 칸을 보여준다) */
export const authButton = (on: boolean): string =>
	`flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-extrabold transition-colors lg:h-[60px] ${on ? 'bg-accent text-bg hover:bg-[#ff8f5c]' : 'bg-white/8 text-white/45'}`;
