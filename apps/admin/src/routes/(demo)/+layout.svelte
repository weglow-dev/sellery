<script lang="ts">
	/**
	 * `(demo)` 그룹 레이아웃 — 이전 루트 +layout.svelte(데모 AppShell 탭 레이아웃 · DemoBanner) 를 그대로 옮긴 것
	 * (docs/monorepo-migration.md 결정 C · §6 · apps/influencer 의 `(demo)` 와 같은 구조).
	 * 데모 대시보드는 `/demo` — 루트 `/` 는 다음 PR 에서 실서비스 관리자 홈이 쓴다. core 의 `go.screen('home')`('/') 은 마운트 뒤 `/demo` 로 다시 연결한다.
	 * CSS 는 데모의 theme.css(legacy base+skin + Galmuri) — 실서비스 화면의 site.css 와 한 페이지에 섞지 않는다(결정 12).
	 */
	import '@sellery/ui/css/theme.css';
	import { S, counts, act, setNavigate } from '@sellery/core';
	import { AppShell, DemoBanner } from '@sellery/ui';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
	const n = $derived(counts().admin);
	const tabs = $derived([
		{ href: '/demo', label: '대시보드', badge: n }, { href: '/products', label: '상품' }, { href: '/influencers', label: '인플루언서' }, { href: '/brands', label: '브랜드' },
		{ href: '/orders', label: '주문·CS' }, { href: '/match', label: '매칭·자동 제안' }, { href: '/revenue', label: '매출·순수익' }, { href: '/settle', label: '정산 실행' }
	]);
	// AppShell 이 init 에서 등록한 goto(base + p) 를 덮어쓴다 — 데모 홈('/') 만 '/demo' 로 (실서비스 루트와 충돌 방지).
	// 상품 누끼 무대(body[data-stage=studio], theme.css)는 이전 app.html 의 body 속성이었다 — 콘솔 셸에는 없으므로 여기서 붙인다.
	onMount(() => {
		setNavigate((p) => goto(base + (p === '/' ? '/demo' : p)));
		document.body.dataset.stage = 'studio';
		return () => {
			delete document.body.dataset.stage;
		};
	});
</script>

<svelte:head>
	<title>셀러리 관리자 (데모)</title>
	<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/galmuri@2/dist/galmuri.css" />
</svelte:head>

<!-- 데모 띠 — sellery.life/admin 경로에 공개돼 있으므로 항상 표시 (docs/monorepo-migration.md §6 · 결정 D) -->
<DemoBanner />
<AppShell {tabs}>
	{#snippet persona()}
		<div class="persona"><span class="chip">셀러리 운영팀</span>{#if S.session}<button class="sm ghost" onclick={() => { act.logout(); location.reload(); }}>로그아웃</button>{/if}</div>
	{/snippet}
	{@render children()}
</AppShell>
