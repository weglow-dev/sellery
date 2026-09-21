import type { RequestHandler } from './$types';

/**
 * /admin/robots.txt — 관리자 데모 앱 전체를 검색 색인에서 제외 (docs/monorepo-migration.md §6 · 결정 D · S4 PR-7).
 * 프로덕션에서는 sellery.life/admin/* 가 shop 의 rewrites 를 거쳐 이 앱에 닿는다. 도메인 루트의 /robots.txt 는 shop 이 내고
 * 거기서도 /admin 를 disallow 하므로(apps/shop/src/routes/robots.txt) 이 파일은 프로젝트 자기 URL(sellery-admin.vercel.app/admin/robots.txt)과
 * 리라이트 경로 양쪽의 이중 안전장치다. app.html 의 <meta name="robots" content="noindex, nofollow"> 와 짝. 정적이라 prerender.
 */
export const prerender = true;

const BODY = 'User-Agent: *\nDisallow: /\n';

export const GET: RequestHandler = () => new Response(BODY, { headers: { 'content-type': 'text/plain' } });
