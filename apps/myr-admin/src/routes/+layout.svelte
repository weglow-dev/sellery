<script lang="ts">
	import '../app.css';
	import { afterNavigate } from '$app/navigation';
	import MenuSheet from '$lib/components/MenuSheet.svelte';
	import PayoutModals from '$lib/components/PayoutModals.svelte';
	import MobileTop from '$lib/components/MobileTop.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import TopNav from '$lib/components/TopNav.svelte';
	import Toast from '$lib/components/Toast.svelte';

	let { children } = $props();
	let main: HTMLElement | undefined = $state();

	// 화면이 바뀌면 맨 위로 — 같은 화면에서 탭 · 서랍(?tab= · ?id=)만 바뀌면 그대로
	afterNavigate(({ from, to, type }) => {
		if (type === 'enter' || !from?.url) return;
		if (from.url.pathname !== to?.url.pathname) main?.scrollTo(0, 0);
	});
</script>

<svelte:head>
	<title>MYR Admin — 운영 콘솔</title>
</svelte:head>

<!--
	모바일(~lg): 앱 셸 — 높이 100dvh · 최대 폭 430px(크리에이터 콘솔과 같은 셸). <main> 스크롤(맨 위 머리 = 로고 · 파트너팀 톡 · 내 계정 — 시안 "MYR Admin" · 본문과 같이 스크롤) → 하단 플로팅 탭(본문 위에 떠 있다 · 그래서 <main> 아래 여백 88px · 홈 · 상품 · 주문 · CS 관리 · 전체 — "전체"는 화면을 덮는 전체 메뉴).
	PC(lg~): 상단 메뉴 72px(시안 "MYR Admin PC" · 파트너팀 톡 · 내 계정은 오른쪽 아이콘) + 그 아래 <main> 한 곳이 스크롤 · 화면은 1200~1240px 컨테이너. 상세는 오른쪽 서랍(Drawer · fixed).
-->
<div class="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-bg sm:border-x sm:border-white/8 lg:max-w-none lg:border-x-0">
	<TopNav />
	<main bind:this={main} class="no-bar min-h-0 flex-1 overflow-y-auto pb-[88px] lg:pb-0">
		<MobileTop />
		{@render children()}
	</main>
	<TabBar />
	<MenuSheet />
	<PayoutModals />
	<Toast />
</div>
