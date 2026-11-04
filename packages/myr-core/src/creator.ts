/** 크리에이터 표시 — 핸들 정규화 · 아바타(사진이 없을 때의 이니셜 + 배경색). 샵 상품 카드와 크리에이터 콘솔이 같은 사람을 같은 모양으로 그린다. */

/** 사진이 없을 때 고르는 배경색 — 핸들 해시로 결정적 */
const AVATAR_BG = ['#FFB088', '#C4B5FD', '#86EFAC', '#FDE68A', '#7DA8FF', '#F9A8D4', '#99F6E4'];
/** 디자인 시안의 네 크리에이터는 시안 색 그대로 */
const DESIGN_BG: Record<string, string> = { 'minji.routine': '#FFB088', 'haru.well': '#C4B5FD', 'jun.fit': '#86EFAC', 'soy.clean': '#FDE68A' };

/** `@Minji.Routine` → `minji.routine` (@ 제거 + 소문자) */
export const handleSlug = (handle: string): string => handle.replace(/^@+/, '').toLowerCase();

/** 아바타 배경색 · 이니셜(활동명 첫 글자) */
export function creatorStyle(c: { name: string; handle: string }): { bg: string; initial: string } {
	const slug = handleSlug(c.handle);
	let h = 0;
	for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
	return { bg: DESIGN_BG[slug] ?? AVATAR_BG[h % AVATAR_BG.length], initial: (c.name.trim()[0] ?? 'M').toUpperCase() };
}
