/**
 * MYR 샵 주소 — 메일 링크 · canonical · sitemap 이 같은 오리진을 쓴다.
 * 값은 샵의 `PUBLIC_SITE_URL`(도메인이 정해지면 값만 교체). 인플루언서 · 운영 콘솔이 보내는 메일도 링크는 샵을 가리키므로
 * 각 앱이 샵 주소를 `configureMyrCore({ shopUrl })` 로 넘긴다.
 */
export const SITE_URL_FALLBACK = 'https://myr-shop.vercel.app';
/** 크리에이터 콘솔 주소 — 샵이 크리에이터에게 보내는 메일(교환·환불 요청 접수)의 [요청 확인하기] 링크. 샵의 `PUBLIC_MYR_CONSOLE_URL` 로 바꾼다(도메인이 생기면 값만 교체) */
export const CONSOLE_URL_FALLBACK = 'https://myr-influencer.vercel.app';

function origin(raw: unknown, fallback: string): string {
	if (typeof raw === 'string' && raw.trim()) {
		try {
			const u = new URL(raw.trim());
			if (u.protocol === 'https:' || u.protocol === 'http:') return u.origin;
		} catch {
			/* 기본값으로 */
		}
	}
	return fallback;
}
/** 주소 값 → 끝 슬래시 없는 오리진. 비었거나 http(s) URL 이 아니면 기본값 */
export const siteOrigin = (raw: unknown): string => origin(raw, SITE_URL_FALLBACK);
/** 콘솔 주소 값 → 오리진 · 비었거나 틀리면 myr-influencer.vercel.app */
export const consoleOrigin = (raw: unknown): string => origin(raw, CONSOLE_URL_FALLBACK);
