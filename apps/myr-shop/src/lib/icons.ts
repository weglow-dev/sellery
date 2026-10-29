/** 디자인의 선 아이콘(48×48 viewBox · stroke currentColor) — 카테고리 · 제형 · 패키지 · 맛 · 스펙 · 탭바.
 *  `A` 는 포인트색 채움. 제품 비주얼은 아직 아이콘 타일이라(실제 제품 사진이 생기면 교체) 여기가 비주얼의 전부다. */
const A = '#FF7A3D';

export const ICONS: Record<string, string> = {
	diet: `<circle cx="19" cy="23" r="11"/><circle cx="19" cy="23" r="3.5" fill="${A}" stroke="none"/><path d="M19 34h21v-7"/><path d="M26 34v-3M31 34v-3M36 34v-3"/>`,
	inner: `<path d="M24 40s-13-8-13-18a7 7 0 0 1 13-3.5A7 7 0 0 1 37 22c0 10-13 18-13 18z" fill="${A}" opacity="0.35" stroke="none"/><path d="M24 40s-13-8-13-18a7 7 0 0 1 13-3.5A7 7 0 0 1 37 22c0 10-13 18-13 18z"/><path d="M38 6v6M35 9h6" stroke="${A}"/>`,
	derma: `<path d="M18 10h12v6l4 4v18a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V20l4-4z"/><path d="M20 10V6h8v4"/><path d="M14 28h20" stroke="${A}"/>`,
	hair: `<path d="M14 20c0-7 4.5-11 10-11s10 4 10 11c0 3-1.5 5-1.5 8v11h-17V28c0-3-1.5-5-1.5-8z"/><path d="M20 9c1.5 5 1.5 9 0 15" stroke="${A}"/><path d="M28 9c-1.5 5-1.5 9 0 15" stroke="${A}"/>`,
	mental: `<path d="M36 29a13 13 0 1 1-17-17 10 10 0 0 0 17 17z" fill="${A}" opacity="0.35" stroke="none"/><path d="M36 29a13 13 0 1 1-17-17 10 10 0 0 0 17 17z"/><path d="M33 8v6M30 11h6" stroke="${A}"/>`,
	mens: `<circle cx="20" cy="28" r="11"/><circle cx="20" cy="28" r="4" fill="${A}" stroke="none"/><path d="M28 20L40 8" stroke="${A}"/><path d="M31 8h9v9" stroke="${A}"/>`,
	pill: `<g transform="rotate(-40 24 24)"><path d="M24 17h9a7 7 0 0 1 0 14h-9z" fill="${A}" stroke="none"/><rect x="8" y="17" width="32" height="14" rx="7"/><path d="M24 17v14"/></g>`,
	jelly: `<path d="M10 36c0-11 6.5-20 14-20s14 9 14 20z" fill="${A}" opacity="0.45" stroke="none"/><path d="M10 36c0-11 6.5-20 14-20s14 9 14 20"/><path d="M7 36h34"/>`,
	powder: `<path d="M8 37c3.5-8.5 9.5-13 16-13s12.5 4.5 16 13z" fill="${A}" stroke="none"/><path d="M6 37h36"/><circle cx="19" cy="15" r="1.6" fill="currentColor" stroke="none"/><circle cx="27" cy="11" r="1.6" fill="currentColor" stroke="none"/><circle cx="25" cy="18" r="1.6" fill="currentColor" stroke="none"/>`,
	liquid: `<path d="M16 27h16v11a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4z" fill="${A}" stroke="none"/><path d="M20 6h8v7l4 6v19a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V19l4-6z"/><path d="M20 10h8"/>`,
	film: `<rect x="9" y="15" width="20" height="26" rx="2.5" transform="rotate(-12 19 28)" fill="${A}" opacity="0.4" stroke="none"/><rect x="9" y="15" width="20" height="26" rx="2.5" transform="rotate(-12 19 28)"/><rect x="19" y="7" width="20" height="26" rx="2.5" transform="rotate(8 29 20)" fill="#15161A"/><path d="M24 14h9M24 19h7" transform="rotate(8 29 20)"/>`,
	gummy: `<path d="M11 30c0-8.5 5.5-16 13-16s13 7.5 13 16c0 5-5.5 8-13 8s-13-3-13-8z" fill="${A}" opacity="0.45" stroke="none"/><path d="M11 30c0-8.5 5.5-16 13-16s13 7.5 13 16c0 5-5.5 8-13 8s-13-3-13-8z"/><circle cx="19" cy="24" r="1.2" fill="currentColor" stroke="none"/><circle cx="26" cy="21" r="1.2" fill="currentColor" stroke="none"/><circle cx="29" cy="29" r="1.2" fill="currentColor" stroke="none"/>`,
	stick: `<g transform="rotate(-22 24 24)"><rect x="18" y="5" width="12" height="38" rx="2" fill="${A}" opacity="0.4" stroke="none"/><rect x="18" y="5" width="12" height="38" rx="2"/><path d="M18 10h12M18 38h12"/></g>`,
	bottle: `<rect x="17" y="5" width="14" height="7" rx="2" fill="${A}" stroke="none"/><rect x="12" y="22" width="24" height="11" fill="${A}" opacity="0.35" stroke="none"/><path d="M15 12h18a3 3 0 0 1 3 3v23a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V15a3 3 0 0 1 3-3z"/>`,
	pouch: `<path d="M13 9h22l-1.5 29a4 4 0 0 1-4 3.8H18.5a4 4 0 0 1-4-3.8z" fill="${A}" opacity="0.35" stroke="none"/><path d="M13 9h22l-1.5 29a4 4 0 0 1-4 3.8H18.5a4 4 0 0 1-4-3.8z"/><path d="M14 15.5h20" stroke="${A}" stroke-dasharray="2 3"/>`,
	ptp: `<rect x="9" y="7" width="30" height="34" rx="4"/><circle cx="18" cy="15.5" r="3.5"/><circle cx="30" cy="15.5" r="3.5"/><circle cx="18" cy="24" r="3.5"/><circle cx="30" cy="24" r="3.5" fill="${A}" stroke="none"/><circle cx="18" cy="32.5" r="3.5"/><circle cx="30" cy="32.5" r="3.5"/>`,
	grape: `<circle cx="18" cy="22" r="5.5" fill="#8B5CF6" stroke="none"/><circle cx="30" cy="22" r="5.5" fill="#8B5CF6" stroke="none"/><circle cx="24" cy="31" r="5.5" fill="#7C3AED" stroke="none"/><circle cx="14" cy="31" r="5" fill="#A78BFA" stroke="none"/><circle cx="34" cy="31" r="5" fill="#A78BFA" stroke="none"/><circle cx="19" cy="39" r="5" fill="#7C3AED" stroke="none"/><circle cx="29" cy="39" r="5" fill="#6D28D9" stroke="none"/><path d="M24 16V9" stroke="#84CC16" stroke-width="2.5"/><path d="M24 11c3-4 8-4 10-1-3 2-7 3-10 1z" fill="#84CC16" stroke="none"/>`,
	strawberry: `<path d="M24 42C14 38 9 30 9 22c0-5 4-8 8-8h14c4 0 8 3 8 8 0 8-5 16-15 20z" fill="#F43F5E" stroke="none"/><circle cx="18" cy="23" r="1.4" fill="#FECDD3" stroke="none"/><circle cx="26" cy="21" r="1.4" fill="#FECDD3" stroke="none"/><circle cx="30" cy="28" r="1.4" fill="#FECDD3" stroke="none"/><circle cx="21" cy="30" r="1.4" fill="#FECDD3" stroke="none"/><path d="M16 14c2-4 5-6 8-6s6 2 8 6" fill="#22C55E" stroke="none"/><path d="M24 8V5" stroke="#22C55E" stroke-width="2.5"/>`,
	peach: `<circle cx="24" cy="27" r="15" fill="#FB923C" stroke="none"/><path d="M24 12c0 8-1 14-1 30" stroke="#F97316" stroke-width="2.5"/><circle cx="18" cy="22" r="4" fill="#FDBA74" opacity="0.7" stroke="none"/><path d="M24 12c-1-4 1-7 5-7 1 4-1 7-5 7z" fill="#4ADE80" stroke="none"/>`,
	lemon: `<ellipse cx="24" cy="26" rx="16" ry="12" transform="rotate(-25 24 26)" fill="#FACC15" stroke="none"/><path d="M18 20l12 12M30 20L18 32" stroke="#FDE68A" stroke-width="2.5"/><path d="M34 13c3-2 6-2 7 1" stroke="#4ADE80" stroke-width="2.5"/>`,
	clock: `<circle cx="24" cy="24" r="14"/><path d="M24 14v10l6 4" stroke="${A}"/>`,
	box: `<path d="M8 16l16-8 16 8v16l-16 8-16-8z"/><path d="M8 16l16 8 16-8M24 24v16" stroke="${A}"/>`
};

/** 탭바 아이콘(24×24 viewBox) */
export const TAB_ICONS: Record<string, string> = {
	home: `<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>`,
	grid: `<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>`,
	cart: `<path d="M6 7h12l1 13H5z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>`,
	user: `<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>`
};
