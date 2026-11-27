import type { Tone } from './mock/types';

/** 칩 · 안내 색 — docs/myr-admin-screens.md §1-2. 칩은 12px(§1-2 글자 크기 · 대비), 글자는 흰색 .55 이상 */
export const CHIP_CLS: Record<Tone, string> = {
	mint: 'bg-mint/16 text-mint',
	red: 'bg-danger/16 text-danger-fg',
	orange: 'bg-accent/16 text-accent',
	grey: 'bg-white/8 text-white/70',
	lilac: 'bg-lilac/16 text-lilac',
	plain: 'bg-white/6 text-white/70',
	/** 흰 글자 칩(시안 white — 정산 회차 상세 "지급 ₩…") */
	white: 'bg-white/12 text-fg'
};

/** 안내 한 줄 글자색 */
export const NOTE_CLS: Record<Tone, string> = {
	mint: 'text-mint',
	red: 'text-danger-fg',
	orange: 'text-accent',
	grey: 'text-white/55',
	lilac: 'text-lilac',
	plain: 'text-white/60',
	white: 'text-fg'
};

/** 점(상태 표시) */
export const DOT_CLS: Record<Tone, string> = {
	mint: 'bg-mint',
	red: 'bg-danger',
	orange: 'bg-accent',
	grey: 'bg-white/40',
	lilac: 'bg-lilac',
	plain: 'bg-white/30',
	white: 'bg-white'
};
