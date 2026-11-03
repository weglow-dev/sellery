/** 디자인(Claude Design "MYR Influencer Admin")의 선 아이콘.
 *  TILE_ICONS = 제품 타일(48×48 viewBox · `A` 포인트색 채움) — 샵(apps/myr-shop/src/lib/icons.ts)과 같은 그림.
 *  UI_ICONS  = 탭바·헤더·버튼(24×24 viewBox). 전부 stroke currentColor. */
const A = '#FF7A3D';

export const TILE_ICONS: Record<string, string> = {
	grape: `<circle cx="18" cy="22" r="5.5" fill="#8B5CF6" stroke="none"/><circle cx="30" cy="22" r="5.5" fill="#8B5CF6" stroke="none"/><circle cx="24" cy="31" r="5.5" fill="#7C3AED" stroke="none"/><circle cx="14" cy="31" r="5" fill="#A78BFA" stroke="none"/><circle cx="34" cy="31" r="5" fill="#A78BFA" stroke="none"/><circle cx="19" cy="39" r="5" fill="#7C3AED" stroke="none"/><circle cx="29" cy="39" r="5" fill="#6D28D9" stroke="none"/><path d="M24 16V9" stroke="#84CC16" stroke-width="2.5"/><path d="M24 11c3-4 8-4 10-1-3 2-7 3-10 1z" fill="#84CC16" stroke="none"/>`,
	lemon: `<ellipse cx="24" cy="26" rx="16" ry="12" transform="rotate(-25 24 26)" fill="#FACC15" stroke="none"/><path d="M18 20l12 12M30 20L18 32" stroke="#FDE68A" stroke-width="2.5"/><path d="M34 13c3-2 6-2 7 1" stroke="#4ADE80" stroke-width="2.5"/>`,
	film: `<rect x="9" y="15" width="20" height="26" rx="2.5" transform="rotate(-12 19 28)" fill="${A}" opacity="0.4" stroke="none"/><rect x="9" y="15" width="20" height="26" rx="2.5" transform="rotate(-12 19 28)"/><rect x="19" y="7" width="20" height="26" rx="2.5" transform="rotate(8 29 20)" fill="#15161A"/><path d="M24 14h9M24 19h7" transform="rotate(8 29 20)"/>`,
	powder: `<path d="M8 37c3.5-8.5 9.5-13 16-13s12.5 4.5 16 13z" fill="${A}" stroke="none"/><path d="M6 37h36"/><circle cx="19" cy="15" r="1.6" fill="currentColor" stroke="none"/><circle cx="27" cy="11" r="1.6" fill="currentColor" stroke="none"/><circle cx="25" cy="18" r="1.6" fill="currentColor" stroke="none"/>`,
	gummy: `<path d="M11 30c0-8.5 5.5-16 13-16s13 7.5 13 16c0 5-5.5 8-13 8s-13-3-13-8z" fill="${A}" opacity="0.45" stroke="none"/><path d="M11 30c0-8.5 5.5-16 13-16s13 7.5 13 16c0 5-5.5 8-13 8s-13-3-13-8z"/><circle cx="19" cy="24" r="1.2" fill="currentColor" stroke="none"/><circle cx="26" cy="21" r="1.2" fill="currentColor" stroke="none"/><circle cx="29" cy="29" r="1.2" fill="currentColor" stroke="none"/>`,
	pill: `<g transform="rotate(-40 24 24)"><path d="M24 17h9a7 7 0 0 1 0 14h-9z" fill="${A}" stroke="none"/><rect x="8" y="17" width="32" height="14" rx="7"/><path d="M24 17v14"/></g>`
};

export const UI_ICONS: Record<string, string> = {
	home: `<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>`,
	cs: `<path d="M4 7h11l-3-3M20 17H9l3 3"/>`,
	box: `<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>`,
	bell: `<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>`,
	back: `<path d="M15 5l-7 7 7 7"/>`,
	chev: `<path d="M9 5l7 7-7 7"/>`,
	plus: `<path d="M12 5v14M5 12h14"/>`,
	cam: `<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>`,
	eye: `<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`,
	x: `<path d="M6 6l12 12M18 6L6 18"/>`,
	check: `<path d="M5 12.5l4.5 4.5L19 7.5"/>`,
	clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
	frame: `<path d="M4 4h16v16H4z"/><path d="M4 9h16"/>`
};
