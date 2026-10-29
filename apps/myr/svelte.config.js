import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** 셀러리 브랜딩(인플루언서 PB 제조의뢰) 랜딩 — Vercel 프로젝트 myr(옛 sellery-branding) (Root Directory apps/myr).
 *  Supabase/SSR hooks 없음 · @sellery/* 패키지도 쓰지 않는 완전 독립 UI.
 *  공개 주소는 **sellery.life/influencer/oem** (대표 결정 2026-10-19) — apps/shop/vercel.json 이 `/influencer/oem*` 을 이 프로젝트로 리라이트(인플루언서 콘솔 `/influencer/*` 규칙보다 앞).
 *  그래서 base '/influencer/oem' — 내부 링크·정적 파일은 `$app/paths` 의 base 를 붙인다. makeyourrecipe.vercel.app 루트는 vercel.json 이 이 경로로 리다이렉트. */
export default {
	preprocess: vitePreprocess(),
	compilerOptions: { runes: true },
	kit: {
		adapter: adapter({ runtime: 'nodejs22.x' }),
		paths: { base: '/influencer/oem' },
		// 브라우저 오리진은 sellery.life, 이 앱이 보는 호스트는 makeyourrecipe.vercel.app — 다른 콘솔과 같은 이유(§8.3)로 trustedOrigins.
		// 없으면 제조의뢰 접수 POST 가 "Cross-site POST form submissions are forbidden" 403 (2026-10-19 대표 QA — 버튼이 안 넘어감)
		csrf: { trustedOrigins: ['https://sellery.life'] }
	}
};
