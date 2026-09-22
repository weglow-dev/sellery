<script lang="ts">
	/**
	 * 관리자 콘솔 셸 — `(demo)` 그룹의 형제. 데모 띠·AppShell·theme.css 는 `(demo)/+layout.svelte` 에 있고 여기는 콘솔 CSS(site.css)만 쓴다
	 * (docs/monorepo-migration.md 결정 12 — 두 CSS 를 한 페이지에 섞지 않는다).
	 * 상단 바·탭은 아직 두지 않는다 — 실서비스 화면이 로그인·홈 스텁뿐이다. 화면이 늘어나면 `PartnerShell` 의 관리자 판을 만든다.
	 * 게이트는 이 레이아웃이 아니라 각 page 의 `requireAdmin()` 이 한다 (docs/inf-console-plan.md 결정 6).
	 */
	import '../../app.css';
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<main class="site-main">
	{@render children()}
</main>
