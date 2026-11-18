<script lang="ts">
	import { page } from '$app/state';
	import { TABS, isActive } from '$lib/menus';
	import { server } from '$lib/mock/server.svelte';
	import { app } from '$lib/state.svelte';
	import Icon from './Icon.svelte';

	/** 모바일 하단 플로팅 탭 — 크리에이터 콘솔 TabBar 와 같은 모양(칸 56px 고정 · justify-between). 다섯째 칸 = 전체 메뉴 */
	const nav = $derived(server.nav);
</script>

<nav class="w-full shrink-0 bg-bg px-5 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden" aria-label="주요 메뉴">
	<div class="flex h-16 items-center justify-between rounded-[22px] border border-white/8 bg-panel px-2 shadow-[0_10px_30px_rgba(0,0,0,.4)]">
		{#each TABS as t (t.key)}
			{@const on = !app.menuOpen && isActive(page.url.pathname, t.href)}
			{@const b = nav[t.key]}
			<a href={t.href} aria-current={on ? 'page' : undefined} class="relative flex h-[52px] w-14 shrink-0 flex-col items-center justify-center gap-1 transition-colors {on ? 'text-accent' : 'text-white/55'}">
				<Icon id={t.icon} size={22} />
				<span class="text-[11px] font-bold whitespace-nowrap">{t.name}</span>
				{#if b?.n}
					<span class="absolute top-1.5 right-[calc(50%-20px)] flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-extrabold tabular-nums text-bg {b.hot ? 'bg-danger' : 'bg-accent'}">{b.n}</span>
				{/if}
			</a>
		{/each}
		<button type="button" onclick={() => (app.menuOpen = !app.menuOpen)} aria-expanded={app.menuOpen} class="flex h-[52px] w-14 shrink-0 flex-col items-center justify-center gap-1 transition-colors {app.menuOpen ? 'text-accent' : 'text-white/55'}">
			<Icon id="menu" size={22} />
			<span class="text-[11px] font-bold">전체</span>
		</button>
	</div>
</nav>
