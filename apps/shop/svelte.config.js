import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** Vercel 프로젝트 sellery-shop (Root Directory apps/shop) — 도메인 루트(base '') 를 받는다 (docs/monorepo-migration.md §1).
 *  /influencer /brand /admin 은 apps/shop/vercel.json 의 rewrites 가 각 프로젝트로 프록시한다. 리전은 vercel.json "regions". */
export default {
	preprocess: vitePreprocess(),
	compilerOptions: { runes: true },
	kit: {
		adapter: adapter({ runtime: 'nodejs22.x' }),
		paths: { base: '' },
		env: { dir: '../..' } // 루트 .env.local 하나를 4 앱이 공유 (결정 11)
	}
};
