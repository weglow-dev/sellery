import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** 한 도메인 아래 /brand 경로로 배포되는 SPA. 빌드 결과는 저장소 루트 dist/brand 로 모인다 (scripts/build.mjs 참고). */
export default {
	preprocess: vitePreprocess(),
	compilerOptions: { runes: true },
	kit: {
		adapter: adapter({ pages: '../../dist/brand', assets: '../../dist/brand', fallback: 'index.html', strict: false }),
		paths: { base: '/brand' }
	}
};
