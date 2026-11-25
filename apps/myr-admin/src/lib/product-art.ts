/** 상품 사진 자리(UI 단계) — 시안 "MYR Admin" 상품 타일 색 · 그림(48×48 viewBox). 기능 단계에서 실제 사진(myr-products 버킷)으로 바뀐다 */
const A = '#FF7A3D';

export const PRODUCT_TILES: Record<string, string> = {
	grape: 'linear-gradient(145deg,#B9A6F2,#6E57C8)',
	straw: 'linear-gradient(145deg,#FFB3C0,#E8667F)',
	peach: 'linear-gradient(145deg,#FFD0B5,#F2905F)',
	lemon: 'linear-gradient(145deg,#FFF0A8,#E6C04A)',
	teal: 'linear-gradient(145deg,#B4EDE3,#4FB8A8)',
	navy: 'linear-gradient(145deg,#B9CFFF,#6A8FE8)',
	plum: 'linear-gradient(145deg,#E3BDF5,#A86BD1)',
	slate: 'linear-gradient(145deg,#D6DAE3,#8A93A6)'
};

export const PRODUCT_ART: Record<string, string> = {
	pill: `<g transform="rotate(-40 24 24)"><path d="M24 17h9a7 7 0 0 1 0 14h-9z" fill="${A}" stroke="none"/><rect x="8" y="17" width="32" height="14" rx="7"/><path d="M24 17v14"/></g>`,
	jelly: `<path d="M10 36c0-11 6.5-20 14-20s14 9 14 20z" fill="${A}" opacity="0.45" stroke="none"/><path d="M10 36c0-11 6.5-20 14-20s14 9 14 20"/><path d="M7 36h34"/>`,
	powder: `<path d="M8 37c3.5-8.5 9.5-13 16-13s12.5 4.5 16 13z" fill="${A}" stroke="none"/><path d="M6 37h36"/><circle cx="19" cy="15" r="1.6" fill="currentColor" stroke="none"/><circle cx="27" cy="11" r="1.6" fill="currentColor" stroke="none"/><circle cx="25" cy="18" r="1.6" fill="currentColor" stroke="none"/>`,
	liquid: `<path d="M16 27h16v11a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4z" fill="${A}" stroke="none"/><path d="M20 6h8v7l4 6v19a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V19l4-6z"/><path d="M20 10h8"/>`,
	film: `<rect x="9" y="15" width="20" height="26" rx="2.5" transform="rotate(-12 19 28)" fill="${A}" opacity="0.4" stroke="none"/><rect x="9" y="15" width="20" height="26" rx="2.5" transform="rotate(-12 19 28)"/><rect x="19" y="7" width="20" height="26" rx="2.5" transform="rotate(8 29 20)" fill="#15161A"/><path d="M24 14h9M24 19h7" transform="rotate(8 29 20)"/>`,
	gummy: `<path d="M11 30c0-8.5 5.5-16 13-16s13 7.5 13 16c0 5-5.5 8-13 8s-13-3-13-8z" fill="${A}" opacity="0.45" stroke="none"/><path d="M11 30c0-8.5 5.5-16 13-16s13 7.5 13 16c0 5-5.5 8-13 8s-13-3-13-8z"/><circle cx="19" cy="24" r="1.2" fill="currentColor" stroke="none"/><circle cx="26" cy="21" r="1.2" fill="currentColor" stroke="none"/><circle cx="29" cy="29" r="1.2" fill="currentColor" stroke="none"/>`,
	stick: `<g transform="rotate(-22 24 24)"><rect x="18" y="5" width="12" height="38" rx="2" fill="${A}" opacity="0.4" stroke="none"/><rect x="18" y="5" width="12" height="38" rx="2"/><path d="M18 10h12M18 38h12"/></g>`
};
