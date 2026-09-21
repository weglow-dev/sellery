import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** Vercel 프로젝트 sellery-admin (Root Directory apps/admin) · base /admin (docs/monorepo-migration.md §1).
 *  프로덕션에서는 sellery.life/admin/* 가 shop 의 rewrites 를 거쳐 이 앱에 닿는다 — 브라우저 오리진은 sellery.life 이므로 trustedOrigins (§8.3). 리전은 vercel.json "regions". */
export default {
	preprocess: vitePreprocess(),
	compilerOptions: { runes: true },
	kit: {
		adapter: adapter({ runtime: 'nodejs22.x' }),
		paths: { base: '/admin' },
		env: { dir: '../..' }, // 루트 .env.local 하나를 4 앱이 공유 (결정 11)
		csrf: { trustedOrigins: ['https://sellery.life'] }
	}
};
