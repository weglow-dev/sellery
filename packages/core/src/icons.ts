/* ============ SVG 마크 (문자열 · {@html}로 렌더) ============ */
import type { Grade } from './types';

const CEL_BODY = `<ellipse cx="7" cy="9" rx="4.6" ry="5.4" fill="#7cc142" transform="rotate(-28 7 9)"/><ellipse cx="21" cy="9" rx="4.6" ry="5.4" fill="#7cc142" transform="rotate(28 21 9)"/><ellipse cx="14" cy="7.4" rx="5.4" ry="6.2" fill="#93d64f"/><path d="M14 3.6v7.2M6.6 6.2l1.8 5.2M21.4 6.2l-1.8 5.2" stroke="#3f7a24" stroke-width="1.2"/><path d="M7.2 13h4.6v12.6a2.3 2.3 0 0 1-4.6 0z" fill="#d6ecad"/><path d="M16.2 13h4.6v12.6a2.3 2.3 0 0 1-4.6 0z" fill="#d6ecad"/><path d="M11.7 12.4h4.6v15a2.3 2.3 0 0 1-4.6 0z" fill="#eaf6cf"/><path d="M9.5 15.5v8.5M14 15v11M18.5 15.5v8.5" stroke="#b5dc85" stroke-width="1.2"/>`;
const CEL_ATTR = `fill="none" stroke="#2f5a1a" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"`;
/** 인라인 포인트 마크 (똑바로) */
export const CEL = `<svg class="celic" viewBox="0 0 28 32" width="15" height="17" aria-label="셀러리" ${CEL_ATTR}>${CEL_BODY}</svg>`;
/** 로고 자리 마크 — 위치 로고일 때만 -14° 기울임 (CSS .celogo) */
export const LOGO_ICON = `<svg class="celogo" viewBox="0 0 28 32" aria-hidden="true" ${CEL_ATTR}>${CEL_BODY}</svg>`;
export const FAVICON = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 32" ${CEL_ATTR}>${CEL_BODY}</svg>`);

/* 등급 마크 — shield: chevrons → star → wings → crown */
const _SH = (f: string) => `<path d="M10 1.3 14.2 2.9v3.9c0 2.6-1.7 4.4-4.2 5.3-2.5-.9-4.2-2.7-4.2-5.3V2.9z" fill="${f}" stroke="#141414" stroke-width="1.3" stroke-linejoin="round"/>`;
const _STAR = (f: string) => `<path d="M10 3.9 10.8 5.7 12.7 5.9 11.3 7.2 11.7 9.1 10 8.1 8.3 9.1 8.7 7.2 7.3 5.9 9.2 5.7z" fill="${f}"/>`;
const _WING2 = `<path d="M5.2 4.8H2.6M5.2 6.9H3.6M14.8 4.8h2.6M14.8 6.9h1.6" stroke="#141414" stroke-width="1.3" stroke-linecap="round"/>`;
const _WING3 = `<path d="M5.2 4.2H1.6M5.2 6.2H2.6M5.2 8.2H3.6M14.8 4.2h3.6M14.8 6.2h2.6M14.8 8.2h1.6" stroke="#141414" stroke-width="1.3" stroke-linecap="round"/>`;
const _CROWN = `<path d="M7.6 1 8.7-.9 10 .7 11.3-.9 12.4 1z" fill="#f7df3e" stroke="#141414" stroke-width=".9" stroke-linejoin="round"/>`;
const _gsvg = (inner: string) => `<svg class="gi" viewBox="0 -2 20 16" width="17" height="13.6">${inner}</svg>`;
export const GICON: Record<Grade, string> = {
	스타터: _gsvg(_SH('#e6e3d2')),
	브론즈: _gsvg(_SH('#cd8f5a') + `<path d="M8.2 5.6 10 7.1 11.8 5.6" fill="none" stroke="#141414" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`),
	실버: _gsvg(_SH('#cdd2da') + `<path d="M8.2 4.6 10 6.1 11.8 4.6M8.2 6.8 10 8.3 11.8 6.8" fill="none" stroke="#141414" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`),
	골드: _gsvg(_SH('#f2a91d') + _STAR('#fff')),
	플래티넘: _gsvg(_WING2 + _SH('#9fd8d3') + _STAR('#141414')),
	다이아: _gsvg(_WING3 + _SH('#a9c6ff') + `<path d="M10 3.7 12 6.2 10 8.7 8 6.2z" fill="#fff" stroke="#141414" stroke-width=".7"/>`),
	블랙: _gsvg(_WING3 + _CROWN + _SH('#17150f') + _STAR('#f7df3e'))
};
/** 등급 마크 + 이름 (HTML) */
export const gfull = (n: Grade | string) => `${(GICON as Record<string, string>)[n] || ''} ${n}`;

export const PLAT_ICONS: Record<string, string> = {
	instagram: `<svg class="plic" viewBox="0 0 24 24" width="14" height="14" aria-label="Instagram"><rect x="2.5" y="2.5" width="19" height="19" rx="5.5" fill="none" stroke="#C13584" stroke-width="2.4"/><circle cx="12" cy="12" r="4.4" fill="none" stroke="#C13584" stroke-width="2.4"/><circle cx="17.6" cy="6.4" r="1.5" fill="#C13584"/></svg>`,
	youtube: `<svg class="plic" viewBox="0 0 24 24" width="15" height="15" aria-label="YouTube"><rect x="1.5" y="5" width="21" height="14" rx="4" fill="#FF0000"/><path d="M10 9.3v5.4l4.8-2.7z" fill="#fff"/></svg>`,
	naver: `<svg class="plic" viewBox="0 0 24 24" width="13" height="13" aria-label="Naver Blog"><rect width="24" height="24" rx="4" fill="#03C75A"/><path d="M6.5 5.5h3.6l3.3 5V5.5h4.1v13h-3.6l-3.3-5v5H6.5z" fill="#fff"/></svg>`,
	tiktok: `<svg class="plic" viewBox="0 0 24 24" width="13" height="13" aria-label="TikTok"><path d="M15.2 2c.4 2.4 1.9 4 4.3 4.3v3.2c-1.7 0-3.2-.5-4.3-1.4v6.9a5.8 5.8 0 11-5.8-5.8c.4 0 .7 0 1.1.1v3.3a2.6 2.6 0 101.6 2.4V2h3.1z" fill="#191919"/></svg>`
};
export const platIcon = (s: { platform?: string } | null | undefined) => (s && PLAT_ICONS[s.platform || '']) || '';
export const PEN = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:5px"><path d="M17 3l4 4L8 20l-5 1 1-5z"/></svg>`;
export const KAKAO_ICON = `<svg class="kico" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="#191919" d="M12 3C6.5 3 2 6.4 2 10.6c0 2.7 1.8 5 4.5 6.4l-1 3.6c-.1.3.3.6.5.4l4.3-2.9c.6.1 1.1.1 1.7.1 5.5 0 10-3.4 10-7.6S17.5 3 12 3z"/></svg>`;
