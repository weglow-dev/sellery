<script lang="ts">
	import { page } from '$app/state';
	import { MENUS, isActive } from '$lib/menus';
	import { server } from '$lib/mock/server.svelte';
	import { app } from '$lib/state.svelte';
	import Icon from './Icon.svelte';

	/** 모바일 상단 — 홈은 로고, 다른 화면은 화면 제목(모든 화면에서 제목이 보인다 · §3 모바일) · 알림(급한 일) · 전체 메뉴 */
	const cur = $derived(MENUS.find((m) => isActive(page.url.pathname, m.href)));
	const hot = $derived(server.hotCount);
</script>

<header class="flex h-[60px] shrink-0 items-center justify-between px-5 lg:hidden">
	{#if !cur || cur.key === 'home'}
		<a href="/" class="flex items-center gap-2.5" aria-label="MYR 운영 콘솔 홈">
			<img src="/myr-logo.svg" alt="MYR" class="block h-7 w-auto" />
			<span class="rounded-md bg-accent/14 px-2 py-1 text-[11px] font-extrabold tracking-[0.06em] text-accent">ADMIN</span>
		</a>
	{:else}
		<p class="text-[18px] font-extrabold tracking-[-0.02em]">{cur.name}</p>
	{/if}
	<div class="flex items-center gap-2">
		<a href="/" aria-label="급한 일 {hot}가지" class="relative flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/5">
			<Icon id="bell" size={20} />
			{#if hot}<span class="absolute top-2 right-[9px] h-2 w-2 rounded-full bg-danger"></span>{/if}
		</a>
		<button type="button" onclick={() => (app.menuOpen = true)} aria-label="전체 메뉴" class="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/5"><Icon id="menu" size={20} /></button>
	</div>
</header>
