<script lang="ts">
	import '../app.css';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { bumpDepth } from '$lib/nav';
	import TabBar from '$lib/components/TabBar.svelte';
	import Toast from '$lib/components/Toast.svelte';

	let { children } = $props();

	// 첫 진입('enter')은 세지 않는다 — ssr=false 앱은 첫 렌더도 클라이언트 내비게이션이라 from 이 채워져 올 수 있고,
	// 그걸 세면 주소로 바로 연 상세에서 [뒤로]·승인이 history.back() 으로 앱 밖(이전 문서)에 나간다(2026-11-03 확인)
	afterNavigate(({ from, type }) => {
		if (from && type !== 'enter') bumpDepth();
	});

	/** 하단 탭은 세 화면에서만 — 상세 · 에디터 · 완료 화면은 자기 하단 버튼 줄을 쓴다 */
	const TAB_ROUTES = ['/', '/cs', '/products'];
	const showTabs = $derived(TAB_ROUTES.includes(page.url.pathname));
</script>

<svelte:head>
	<title>MYR Creator — 내 제품 · CS 관리</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!--
	앱 셸 — 높이 100dvh(보이는 영역)의 세로 flex, 최대 폭 430px(디자인은 모바일 한 벌). 화면마다 자기 헤더 · 스크롤 영역 · 하단 버튼 줄을 갖고,
	탭바·토스트는 셸 바닥에 보통 흐름/absolute 로 놓는다(fixed 는 모바일 브라우저에서 잘림 — myr-shop +layout.svelte 주석).
	PC 에서는 가운데 정렬 + 양옆 경계선만 — PC 전용 레이아웃은 시안이 없다.
-->
<div class="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-bg sm:border-x sm:border-white/8">
	<main class="flex min-h-0 flex-1 flex-col">
		{#key page.url.pathname}
			{@render children()}
		{/key}
	</main>
	{#if showTabs}
		<TabBar />
	{/if}
	<Toast />
</div>
