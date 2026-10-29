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

	// 장바구니·찜은 브라우저 저장 — 마운트 뒤 읽고, 그 뒤 바뀔 때마다 저장
	onMount(() => shop.hydrate());
	$effect(() => {
		void [shop.cart, shop.likes, shop.buyer, shop.orders];
		shop.persist();
	});
	afterNavigate(({ from }) => {
		if (from) bumpDepth();
	});

	const TAB_ROUTES = ['/', '/category', '/my'];
	const showTabs = $derived(TAB_ROUTES.includes(page.url.pathname));
</script>

<svelte:head>
	<title>MYR Shop — 내가 믿는 사람이 직접 만든 웰니스</title>
	<meta name="description" content="인플루언서가 레시피부터 패키지까지 직접 고른 제품만 모았어요. Make Your Recipe." />
</svelte:head>

<!-- 모바일(~lg): 430px 폰 프레임을 가운데 · 각 화면이 자기 헤더와 하단 바. PC(lg~): 상단 내비 + 1240px 컨테이너 (디자인 "MYR Shop PC") -->
<SiteHeader />
<div class="relative mx-auto min-h-dvh w-full max-w-[430px] bg-bg lg:min-h-0 lg:max-w-none">
	{#key page.url.pathname}
		{@render children()}
	{/key}
	{#if showTabs}
		<TabBar />
	{/if}
	<Toast />
</div>
