<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { bumpDepth } from '$lib/nav';
	import { shop } from '$lib/state.svelte';
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

<!-- 폰 프레임 — 데스크톱에서는 430px 폭으로 가운데. 각 화면이 자기 상단 헤더와 하단 바를 가진다 -->
<div class="relative mx-auto min-h-dvh w-full max-w-[430px] bg-bg">
	{#key page.url.pathname}
		{@render children()}
	{/key}
	{#if showTabs}
		<TabBar />
	{/if}
	<Toast />
</div>
