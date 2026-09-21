<script lang="ts">
	/**
	 * `(demo)` 그룹 레이아웃 — 이전 루트 +layout.svelte(데모 AppShell 10탭 · DemoBanner) 를 그대로 옮긴 것 (docs/brand-console-plan.md §2 · monorepo-migration.md 결정 C).
	 * CSS 는 콘솔의 site.css 가 아니라 데모의 theme.css(legacy base+skin + Galmuri) — 두 파일을 한 페이지에 섞지 않는다(결정 12).
	 * 콘솔과 겹치는 경로는 `/demo-*` 로 옮겼다(홈 `/demo` · 로그인 `/demo-login` · `/demo-orders` `/demo-cs` `/demo-sales` `/demo-settle` `/demo-my`). 상품 관리 탭은 2단계에서 콘솔 `/products` 로 넘어가 데모에서 뺐다(`go.screen('products')` 는 콘솔 화면에 닿는다).
	 * core 의 `go.screen('products')`('/products') 같은 화면 경로는 마운트 뒤 `demoPathOf` 로 다시 연결한다 — 콘솔이 그 화면을 실제로 만드는 단계에서 항목을 지운다.
	 */
	import '@sellery/ui/css/theme.css';
	import { S, D_, brand, celBal, dmUnreadN, brandPending, csOpen, CEL, act, go, setNavigate } from '@sellery/core';
	import { AppShell, DemoBanner } from '@sellery/ui';
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { demoPathOf } from '$lib/demo';
	let { children }: { children: Snippet } = $props();
	const dmN = $derived(dmUnreadN('brand', S.actingBrand) + brandPending(S.actingBrand).n);
	const csN = $derived(csOpen(S.actingBrand).length);
	const tabs = $derived([
		{ href: '/demo', label: '홈' }, { href: '/dm', label: 'DM', badge: dmN }, { href: '/camps', label: '내 캠페인' }, { href: '/demo-orders', label: '주문·발주' }, { href: '/demo-cs', label: '고객 문의', badge: csN },
		{ href: '/demo-sales', label: '실시간 매출' }, { href: '/demo-settle', label: '정산' }, { href: '/gallery', label: '인플루언서 갤러리' }, { href: '/shop', label: '셀러리 샵' }
	]);
	const me = $derived(brand(S.actingBrand));
	// AppShell 이 init 에서 등록한 goto(base + p) 를 덮어쓴다 — 콘솔과 겹치는 화면 경로만 /demo-* 로 (콘솔 루트·탭과 충돌 방지).
	// 상품 누끼 무대(body[data-stage=studio], theme.css)는 이전 app.html 의 body 속성이었다 — 콘솔 app.html 에는 없으므로 여기서 붙인다.
	onMount(() => {
		setNavigate((p) => goto(base + demoPathOf(p)));
		document.body.dataset.stage = 'studio';
		return () => {
			delete document.body.dataset.stage;
		};
	});
</script>

<svelte:head>
	<title>셀러리 브랜드 센터 (데모)</title>
	<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/galmuri@2/dist/galmuri.css" />
</svelte:head>

<!-- 데모 띠 — dev · PUBLIC_DEMO=1 에서만 열리지만 데모임을 항상 표시 (docs/monorepo-migration.md §6 · 결정 D) -->
<DemoBanner />
<AppShell {tabs}>
	{#snippet right()}
		<button class="celery-bal" onclick={() => go.screen('shop')} title="셀러리 샵">{@html CEL} {celBal(S.actingBrand)}</button>
		<button class="iconbtn" aria-label="마이페이지" title="마이페이지" onclick={() => go.screen('my')}><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-3.6 4.1-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/></svg></button>
	{/snippet}
	{#snippet persona()}
		<div class="persona">
			{#if S.session && S.session.role === 'brand'}
				<span title={S.session.email || ''}>{me.name}</span><button class="sm ghost" onclick={() => { act.logout(); location.href = base + '/demo-login'; }}>로그아웃</button>
			{:else}
				접속 브랜드 <select value={S.actingBrand} onchange={(e) => act.setBrand((e.target as HTMLSelectElement).value)}>{#each D_().brands as b}<option value={b.id}>{b.name}</option>{/each}</select>
			{/if}
		</div>
	{/snippet}
	{@render children()}
</AppShell>
