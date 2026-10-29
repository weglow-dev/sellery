import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** MYR 샵(인플루언서 PB 제품 마켓플레이스) — docs/myr.md §4.1.
 *  M4-UI 단계: 디자인(Claude Design "MYR Shop")을 목 데이터로 화면만 옮긴 상태 — Supabase/SSR hooks · @sellery/* 패키지 없음.
 *  자기 도메인(서브도메인)을 가질 예정이라 base '' · 리라이트 · trustedOrigins 없음 (docs/myr.md §2). */
export default {
	preprocess: vitePreprocess(),
	compilerOptions: { runes: true },
	kit: {
		adapter: adapter({ runtime: 'nodejs22.x' })
	}
};
