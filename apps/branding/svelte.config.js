import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** 셀러리 브랜딩(인플루언서 PB 제조의뢰) 랜딩 — Vercel 프로젝트 sellery-branding (Root Directory apps/branding).
 *  다른 4개 앱과 달리 독립 배포(자체 오리진)라 base '' · Supabase/SSR hooks 없음 · @sellery/* 패키지도 쓰지 않는 완전 독립 UI. */
export default {
	preprocess: vitePreprocess(),
	compilerOptions: { runes: true },
	kit: {
		adapter: adapter({ runtime: 'nodejs22.x' })
	}
};
