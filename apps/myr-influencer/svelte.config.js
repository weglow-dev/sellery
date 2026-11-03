import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** MYR 인플루언서 콘솔 — 자기 제품의 등록 · 판매실적 · 교환/환불 CS (docs/myr.md §4.2).
 *  UI 단계(2026-11-03): Claude Design "MYR Influencer Admin" 시안을 목 데이터로 옮긴 화면만 있다 — 로그인 · Supabase · 서버 라우트는 아직 없다.
 *  자기 도메인을 가질 예정이라 base '' · 리라이트 · trustedOrigins 없음 (docs/myr.md §2). */
export default {
	preprocess: vitePreprocess(),
	compilerOptions: { runes: true },
	kit: {
		adapter: adapter({ runtime: 'nodejs22.x' }),
		env: { dir: '../..' } // 루트 .env.local 을 다른 앱과 공유 (인증을 붙일 때 PUBLIC_SUPABASE_* 가 같은 프로젝트)
	}
};
