<script lang="ts">
	/**
	 * `(demo)` 그룹 레이아웃 — 이전 루트 +layout.svelte(데모 AppShell 탭 레이아웃 · DemoBanner) 를 그대로 옮긴 것 (docs/monorepo-migration.md 결정 C · §5.1).
	 * CSS 는 콘솔의 site.css 가 아니라 데모의 theme.css(legacy base+skin + Galmuri) — 두 파일을 한 페이지에 섞지 않는다(결정 12).
	 * 데모 홈은 `/demo`(콘솔 루트 `/` 는 `/home` 리다이렉트), 데모 로그인은 `/demo-login`. core 의 `go.screen('home')`('/') 은 마운트 뒤 `/demo` 로 다시 연결한다.
	 */
	import '@sellery/ui/css/theme.css';
	import { S, D_, seller, celBal, dmUnreadN, sellerPending, CEL, act, go, setNavigate } from '@sellery/core';
	import { AppShell, DemoBanner } from '@sellery/ui';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
	const dmN = $derived(dmUnreadN('seller', S.actingSeller) + sellerPending(S.actingSeller).n);
	const tabs = $derived([
		{ href: '/demo', label: '홈' }, { href: '/camps', label: '내 캠페인' }, { href: '/dm', label: 'DM', badge: dmN }, { href: '/explore', label: '상품 갤러리' },
		{ href: '/sales', label: '실시간 매출' }, { href: '/settle', label: '정산' }, { href: '/rank', label: '랭킹·등급' }, { href: '/shop', label: '셀러리 샵' }, { href: '/ref', label: '추천 프로그램' }
	]);
	const me = $derived(seller(S.actingSeller));
	// AppShell 이 init 에서 등록한 goto(base + p) 를 덮어쓴다 — 데모 홈('/') 만 '/demo' 로 (콘솔 루트와 충돌 방지).
	// 상품 누끼 무대(body[data-stage=studio], theme.css)는 이전 app.html 의 body 속성이었다 — 콘솔 app.html 에는 없으므로 여기서 붙인다.
	onMount(() => {
		setNavigate((p) => goto(base + (p === '/' ? '/demo' : p)));
		document.body.dataset.stage = 'studio';
		return () => {
			delete document.body.dataset.stage;
		};
	});
</script>

<svelte:head>
	<title>셀러리 인플루언서 센터 (데모)</title>
	<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/galmuri@2/dist/galmuri.css" />
</svelte:head>

<!-- 데모 띠 — dev · PUBLIC_DEMO=1 에서만 열리지만 데모임을 항상 표시 (docs/monorepo-migration.md §6 · 결정 D) -->
<DemoBanner />
<AppShell {tabs}>
	{#snippet right()}
		<button class="celery-bal" onclick={() => go.screen('shop')} title="셀러리 샵">{@html CEL} {celBal(S.actingSeller)}</button>
		<button class="iconbtn" aria-label="마이페이지" title="마이페이지" onclick={() => goto(base + '/my')}><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/></svg></button>
	{/snippet}
	{#snippet persona()}
		<div class="persona">
			{#if S.session && S.session.role === 'seller'}
				<span title={S.session.email || ''}>{me.name} <span style="opacity:.75">{me.handle}</span></span><button class="sm ghost" onclick={() => { act.logout(); location.href = base + '/demo-login'; }}>로그아웃</button>
			{:else}
				접속 인플루언서 <select value={S.actingSeller} onchange={(e) => act.setSeller((e.target as HTMLSelectElement).value)}>{#each D_().sellers as s}<option value={s.id}>{s.name} {s.handle}</option>{/each}</select>
			{/if}
		</div>
	{/snippet}
	{@render children()}
</AppShell>
