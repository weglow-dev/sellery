<script lang="ts">
	/**
	 * 인플루언서 콘솔 셸 — web (partner)/layout.tsx + partner-shell.tsx 1:1 (docs/monorepo-migration.md §5.1 "셸" · PR-9).
	 * `PartnerShell`(@sellery/ui/site · PR-8): 상단 바(워드마크 → /influencer/home · "인플루언서 콘솔" · 활동명·등급·🥬·로그아웃) · 본문 · 하단 탭 5.
	 * `me` 는 +layout.server.ts(getSellerContext — 표시용). 활성 탭은 `page.url.pathname`(접두 포함) 으로 판정. 게이트는 각 page 의 requireSeller().
	 * `(demo)` 그룹은 이 레이아웃 밖(형제 그룹) — 데모 띠·AppShell·theme.css 는 (demo)/+layout.svelte 에 있다.
	 */
	import '../../app.css';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
	import { PartnerShell, setSiteEnv } from '@sellery/ui/site';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	// 콘솔 화면의 실시간 갱신(LiveRefresh — Realtime 공개 채널 구독)이 브라우저에서 쓰는 Supabase 공개값 — shop 레이아웃과 같은 컨텍스트
	setSiteEnv({ supabaseUrl: PUBLIC_SUPABASE_URL, supabaseAnonKey: PUBLIC_SUPABASE_ANON_KEY });
</script>

<PartnerShell role="seller" me={data.me} pathname={page.url.pathname}>
	{@render children()}
</PartnerShell>
