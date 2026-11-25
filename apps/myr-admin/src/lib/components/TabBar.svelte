<script lang="ts">
	import { page } from '$app/state';
	import { TABS, isActive } from '$lib/menus';
	import { server } from '$lib/mock/server.svelte';
	import { app } from '$lib/state.svelte';
	import Icon from './Icon.svelte';

	/** 모바일 하단 플로팅 탭 — 시안 "MYR Admin"과 같게(2026-11-24): 본문 위에 떠 있고 아래로 진해지는 그라데이션 · 5칸 균등(홈 · 상품 · 주문 · CS 관리 · 전체)
	 *  · 고른 탭은 주황 · 배지는 주황(처리할 건수 = 상단 메뉴와 같은 값). "전체"는 전체 메뉴(MenuSheet)를 열고 닫는다 */
	const nav = $derived(server.nav);
</script>

<nav class="absolute inset-x-0 bottom-0 z-[26] bg-linear-to-b from-bg/0 to-bg to-40% px-5 pt-2.5 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:hidden" aria-label="주요 메뉴">
	<div class="grid h-16 grid-cols-5 items-center rounded-[22px] border border-white/8 bg-panel px-1 shadow-[0_10px_30px_rgba(0,0,0,.4)]">
		{#each TABS as t (t.key)}
			{@const on = !app.menuOpen && isActive(page.url.pathname, t.href)}
			{@const b = nav[t.key]}
			<a href={t.href} onclick={() => (app.menuOpen = false)} aria-current={on ? 'page' : undefined} class="relative flex h-[52px] flex-col items-center justify-center gap-1 transition-colors {on ? 'text-accent' : 'text-white/55'}">
				<Icon id={t.icon} size={22} sw={1.8} />
				<span class="text-[11px] font-bold whitespace-nowrap">{t.name}</span>
				{#if b?.n}
					<span class="absolute top-2 right-[calc(50%-18px)] flex h-4 min-w-4 items-center justify-center rounded-lg bg-accent px-1 text-[10px] font-extrabold text-bg tabular-nums">{b.n}</span>
				{/if}
			</a>
		{/each}
		<button type="button" onclick={() => (app.menuOpen = !app.menuOpen)} aria-expanded={app.menuOpen} class="flex h-[52px] flex-col items-center justify-center gap-1 transition-colors {app.menuOpen ? 'text-accent' : 'text-white/55'}">
			<Icon id="menu" size={22} sw={1.8} />
			<span class="text-[11px] font-bold">전체</span>
		</button>
	</div>
</nav>
