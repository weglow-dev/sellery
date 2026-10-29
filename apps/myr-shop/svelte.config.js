import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** MYR 샵(인플루언서 PB 제품 마켓플레이스) — docs/myr.md §4.1.
 *  S2(2026-10-29): 홈 · 카테고리 · 상품 페이지가 Supabase 공개 RPC(0056 `myr_home_products` · `myr_product_card`) 를 읽는다 — `lib/server/db.ts`.
 *  `PUBLIC_SUPABASE_URL` · `PUBLIC_SUPABASE_ANON_KEY` 가 비면(키 없는 로컬 · CI 더미) 목 데이터로 렌더한다.
 *  로그인(S3) · 결제(S4) 는 아직 — 세션 쿠키 hooks 없음. 자기 도메인을 가질 예정이라 base '' · 리라이트 · trustedOrigins 없음 (docs/myr.md §2). */
export default {
	preprocess: vitePreprocess(),
	compilerOptions: { runes: true },
	kit: {
		adapter: adapter({ runtime: 'nodejs22.x' }),
		env: { dir: '../..' } // 루트 .env.local 을 셀러리 4 앱과 공유 (PUBLIC_SUPABASE_* 는 같은 프로젝트)
	}
};
