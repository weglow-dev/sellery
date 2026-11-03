<script lang="ts">
	import '../app.css';
	import { afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { bumpDepth } from '$lib/nav';
	import TabBar from '$lib/components/TabBar.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import TopNav from '$lib/components/TopNav.svelte';

	let { children } = $props();
	let main: HTMLElement | undefined = $state();

	// 첫 진입('enter')은 세지 않는다 — ssr=false 앱은 첫 렌더도 클라이언트 내비게이션이라 from 이 채워져 올 수 있고,
	// 그걸 세면 주소로 바로 연 상세에서 [뒤로]·승인이 history.back() 으로 앱 밖(이전 문서)에 나간다(2026-11-03 확인).
	// 첫 진입에서는 from 은 있어도 from.url 이 null 이다 — 여기서 던지면 SvelteKit 라우터 시작(start)이 끝나지 않아
	// 링크 클릭이 전부 전체 새로고침이 되고 목 상태가 날아간다(2026-11-03 확인). 그래서 첫 진입은 아무것도 하지 않는다.
	afterNavigate(({ from, to, type }) => {
		if (type === 'enter' || !from?.url) return;
		bumpDepth();
		// PC 는 <main> 이 문서 대신 스크롤하므로 화면이 바뀌면 직접 맨 위로 (모바일은 화면마다 자기 스크롤 영역이라 영향 없음)
		if (from.url.pathname !== to?.url.pathname) main?.scrollTo(0, 0);
	});

	/** 모바일 하단 탭은 세 화면에서만 — 상세 · 에디터 · 완료 화면은 자기 하단 버튼 줄을 쓴다. PC 상단 내비는 늘 보인다 */
	const TAB_ROUTES = ['/', '/cs', '/products'];
	const showTabs = $derived(TAB_ROUTES.includes(page.url.pathname));
</script>

<svelte:head>
	<title>MYR Creator — 내 제품 · CS 관리</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!--
	모바일(~lg): 앱 셸 — 높이 100dvh(보이는 영역)의 세로 flex, 최대 폭 430px(디자인 "MYR Influencer Admin"). 화면마다 자기 헤더 · 스크롤 영역 · 하단 버튼 줄을 갖고,
	  탭바·토스트는 셸 바닥에 보통 흐름/absolute 로 놓는다(fixed 는 모바일 브라우저에서 잘림 — myr-shop +layout.svelte 주석).
	PC(lg~): 상단 내비 72px + <main> 한 곳이 스크롤 · 화면은 1240px 컨테이너 (디자인 "MYR Influencer Admin PC"). sticky 패널(CS 처리 · 예시)은 <main> 기준.
-->
<div class="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-bg sm:border-x sm:border-white/8 lg:max-w-none lg:border-x-0">
	<TopNav />
	<main bind:this={main} class="no-bar flex min-h-0 flex-1 flex-col lg:block lg:overflow-y-auto">
		{#key page.url.pathname}
			{@render children()}
		{/key}
	</main>
	{#if showTabs}
		<TabBar />
	{/if}
	<Toast />
</div>
