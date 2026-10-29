<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { bumpDepth } from '$lib/nav';
	import { shop } from '$lib/state.svelte';
	import SiteHeader from '$lib/components/SiteHeader.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import Toast from '$lib/components/Toast.svelte';

	let { children } = $props();
	let main: HTMLElement | undefined = $state();

	// 장바구니·찜은 브라우저 저장 — 마운트 뒤 읽고, 그 뒤 바뀔 때마다 저장
	onMount(() => shop.hydrate());
	$effect(() => {
		void [shop.cart, shop.likes, shop.buyer, shop.orders];
		shop.persist();
	});
	afterNavigate(({ from, to }) => {
		if (from) bumpDepth();
		// 모바일은 문서가 아니라 <main> 이 스크롤 컨테이너라 화면이 바뀔 때 직접 맨 위로 (해시 이동은 제외)
		if (main && !to?.url.hash) main.scrollTo(0, 0);
	});

	const TAB_ROUTES = ['/', '/category', '/my'];
	const showTabs = $derived(TAB_ROUTES.includes(page.url.pathname));
</script>

<svelte:head>
	<title>MYR Shop — 내가 믿는 사람이 직접 만든 웰니스</title>
	<meta name="description" content="인플루언서가 레시피부터 패키지까지 직접 고른 제품만 모았어요. Make Your Recipe." />
</svelte:head>

<!--
	모바일(~lg): 앱 셸 — 높이 100dvh(보이는 영역) 의 세로 flex. 내용(<main>)만 안에서 스크롤하고 탭바·하단 바는 셸 바닥에 놓인다.
	  position: fixed/sticky bottom:0 은 쓰지 않는다 — 모바일 브라우저(DevTools 기기 모드 · 주소창이 있는 실기기)에서는 그 기준인
	  layout viewport(innerHeight) 가 보이는 영역(visualViewport · dvh) 보다 커서 바가 아래로 잘린다(2026-10-29 iPhone SE 에뮬레이션: 717 vs 667).
	PC(lg~): 보통 문서 흐름 — 상단 내비 + 1240px 컨테이너 · 문서 스크롤 · sticky 패널 (디자인 "MYR Shop PC")
-->
<SiteHeader />
<div class="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col bg-bg lg:static lg:block lg:h-auto lg:max-w-none">
	<main bind:this={main} class="no-bar min-h-0 flex-1 overflow-y-auto overscroll-y-contain lg:overflow-visible">
		{#key page.url.pathname}
			{@render children()}
		{/key}
	</main>
	{#if showTabs}
		<TabBar />
	{/if}
	<Toast />
</div>
