import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** MYR 운영 콘솔 — 상품 검수 · 주문/CS · 정산 · 지급 · 세금계산서 (docs/myr.md §4.3 · 화면 구성 docs/myr-admin-screens.md).
 *  UI 단계(2026-11-17): 자동 이체(§11)가 붙어 있다고 가정하고 홈 · 지급 · 세금계산서 · 크리에이터 화면을 목 데이터로 만든 것만 있다 —
 *  로그인 · Supabase · 서버 라우트는 아직 없다(만들 때 필요한 것은 docs/myr-admin-plan.md).
 *  자기 도메인을 가질 예정이라 base '' · 리라이트 · trustedOrigins 없음 (docs/myr.md §2). */
export default {
	preprocess: vitePreprocess(),
	compilerOptions: { runes: true },
	kit: {
		adapter: adapter({ runtime: 'nodejs22.x' }),
		// ssr=false 라 페이지 셸이 하나 — 상대 경로 자산(./favicon.png)이 /payouts 같은 하위 경로에서 깨지므로 절대 경로로
		paths: { relative: false },
		env: { dir: '../..' } // 루트 .env.local 을 다른 앱과 공유 (인증을 붙일 때 PUBLIC_SUPABASE_* 가 같은 프로젝트)
	}
};
