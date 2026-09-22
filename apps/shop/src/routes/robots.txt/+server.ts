import type { RequestHandler } from './$types';

/**
 * /robots.txt (app-plan §2 · web app/robots.ts — 콘솔 호스트 분기는 경로 모드 전환으로 삭제).
 * 판매 링크 `/s/` · `/c/` 와 홈, 셀러리 소개(`/about`)·인플루언서 목록(`/influencers`), 이용약관·개인정보처리방침은 색인 허용, 개인화·결제·인증·고객 문의(`/cs`)·비회원 주문 조회(`/orders` — 0021)·API 경로와 리라이트되는 콘솔·데모(`/influencer` `/brand` `/admin`)는 제외.
 * 슬라이스 1 에는 sitemap 이 없다. 정적이라 prerender.
 */
export const prerender = true;

const RULES = {
	allow: ['/', '/s/', '/c/', '/about', '/influencers', '/terms', '/privacy'],
	disallow: ['/api/', '/checkout', '/account', '/orders', '/cs', '/login', '/auth/', '/influencer', '/brand', '/admin']
};

const BODY = ['User-Agent: *', ...RULES.allow.map((p) => `Allow: ${p}`), ...RULES.disallow.map((p) => `Disallow: ${p}`)].join('\n') + '\n';

export const GET: RequestHandler = () => new Response(BODY, { headers: { 'content-type': 'text/plain' } });
