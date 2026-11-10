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
	pill: `<g transform="rotate(-40 24 24)"><path d="M24 17h9a7 7 0 0 1 0 14h-9z" fill="${A}" stroke="none"/><rect x="8" y="17" width="32" height="14" rx="7"/><path d="M24 17v14"/></g>`,
	// 2026-11-05 샵(apps/myr-shop/src/lib/icons.ts)에서 복사 — DB myr_products.icon 값을 콘솔 내 제품에서 그대로 그리기 위해
	liquid: `<path d="M16 27h16v11a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4z" fill="${A}" stroke="none"/><path d="M20 6h8v7l4 6v19a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V19l4-6z"/><path d="M20 10h8"/>`,
	stick: `<g transform="rotate(-22 24 24)"><rect x="18" y="5" width="12" height="38" rx="2" fill="${A}" opacity="0.4" stroke="none"/><rect x="18" y="5" width="12" height="38" rx="2"/><path d="M18 10h12M18 38h12"/></g>`,
	jelly: `<path d="M10 36c0-11 6.5-20 14-20s14 9 14 20z" fill="${A}" opacity="0.45" stroke="none"/><path d="M10 36c0-11 6.5-20 14-20s14 9 14 20"/><path d="M7 36h34"/>`,
	bottle: `<rect x="17" y="5" width="14" height="7" rx="2" fill="${A}" stroke="none"/><rect x="12" y="22" width="24" height="11" fill="${A}" opacity="0.35" stroke="none"/><path d="M15 12h18a3 3 0 0 1 3 3v23a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V15a3 3 0 0 1 3-3z"/>`,
	pouch: `<path d="M13 9h22l-1.5 29a4 4 0 0 1-4 3.8H18.5a4 4 0 0 1-4-3.8z" fill="${A}" opacity="0.35" stroke="none"/><path d="M13 9h22l-1.5 29a4 4 0 0 1-4 3.8H18.5a4 4 0 0 1-4-3.8z"/><path d="M14 15.5h20" stroke="${A}" stroke-dasharray="2 3"/>`,
	ptp: `<rect x="9" y="7" width="30" height="34" rx="4"/><circle cx="18" cy="15.5" r="3.5"/><circle cx="30" cy="15.5" r="3.5"/><circle cx="18" cy="24" r="3.5"/><circle cx="30" cy="24" r="3.5" fill="${A}" stroke="none"/><circle cx="18" cy="32.5" r="3.5"/><circle cx="30" cy="32.5" r="3.5"/>`,
	peach: `<circle cx="24" cy="27" r="15" fill="#FB923C" stroke="none"/><path d="M24 12c0 8-1 14-1 30" stroke="#F97316" stroke-width="2.5"/><circle cx="18" cy="22" r="4" fill="#FDBA74" opacity="0.7" stroke="none"/><path d="M24 12c-1-4 1-7 5-7 1 4-1 7-5 7z" fill="#4ADE80" stroke="none"/>`,
	strawberry: `<path d="M24 42C14 38 9 30 9 22c0-5 4-8 8-8h14c4 0 8 3 8 8 0 8-5 16-15 20z" fill="#F43F5E" stroke="none"/><circle cx="18" cy="23" r="1.4" fill="#FECDD3" stroke="none"/><circle cx="26" cy="21" r="1.4" fill="#FECDD3" stroke="none"/><circle cx="30" cy="28" r="1.4" fill="#FECDD3" stroke="none"/><circle cx="21" cy="30" r="1.4" fill="#FECDD3" stroke="none"/><path d="M16 14c2-4 5-6 8-6s6 2 8 6" fill="#22C55E" stroke="none"/><path d="M24 8V5" stroke="#22C55E" stroke-width="2.5"/>`
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
	frame: `<path d="M4 4h16v16H4z"/><path d="M4 9h16"/>`,
	order: `<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>`,
	wallet: `<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17v2.5"/><rect x="4" y="7.5" width="16" height="11.5" rx="2.5"/><path d="M15.5 13.25h1.5"/>`,
	user: `<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c.8-3.9 3.9-6.5 7.5-6.5s6.7 2.6 7.5 6.5"/>`,
	logout: `<path d="M14 4h4.5a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M9.5 8l4 4-4 4"/><path d="M13.5 12H4"/>`
};
