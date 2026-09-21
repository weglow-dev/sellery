<script lang="ts">
	/**
	 * 고객 사이트 셸 — web (customer)/layout.tsx 1:1 (docs/monorepo-migration.md §4.1 "셸"):
	 *   skip link(#main) · AppBar(워드마크 · 마이페이지) · SubNav(탭 · persona) · <main id="main" class="site-main"> · Footer · ToastHost.
	 * persona 는 +layout.server.ts 의 { user: { name } | null }. 사이트 컴포넌트가 브라우저에서 쓰는 Supabase 공개값은 setSiteEnv 컨텍스트로.
	 */
	import '../app.css';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { AppBar, SiteFooter, SubNav, ToastHost, setSiteEnv } from '@sellery/ui/site';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	setSiteEnv({ supabaseUrl: PUBLIC_SUPABASE_URL, supabaseAnonKey: PUBLIC_SUPABASE_ANON_KEY });
</script>

<svelte:head>
	<meta property="og:site_name" content="셀러리" />
	<meta property="og:locale" content="ko_KR" />
	<meta property="og:type" content="website" />
</svelte:head>

<a href="#main" class="skip">본문으로 건너뛰기</a>
<AppBar signedIn={data.user !== null} />
<SubNav user={data.user} pathname={page.url.pathname} />
<main id="main" class="site-main">
	{@render children()}
</main>
<SiteFooter />
<ToastHost />
