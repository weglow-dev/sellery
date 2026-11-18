<script lang="ts">
	import { page } from '$app/state';
	import { MENUS, isActive } from '$lib/menus';
	import { ME, server } from '$lib/mock/server.svelte';
	import Icon from './Icon.svelte';

	/** PC(lg~) 왼쪽 고정 메뉴 240px — 로고 · 메뉴(처리할 건수 배지 = 홈 숫자 · 급하면 빨강 §1-1) · 내 계정.
	 *  모바일은 하단 탭(TabBar) + 전체 메뉴(MenuSheet) */
	const nav = $derived(server.nav);
</script>

<aside class="hidden h-dvh w-60 shrink-0 flex-col border-r border-white/7 bg-bg lg:flex">
	<a href="/" aria-label="MYR 운영 콘솔 홈" class="flex h-[72px] shrink-0 items-center gap-2.5 px-6">
		<img src="/myr-logo.svg" alt="MYR" class="block h-[28px] w-auto" />
		<span class="rounded-md bg-accent/14 px-2 py-1 text-[11px] font-extrabold tracking-[0.06em] text-accent">ADMIN</span>
	</a>
	<nav class="no-bar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pt-2" aria-label="주요 메뉴">
		{#each MENUS as m (m.key)}
			{@const on = isActive(page.url.pathname, m.href)}
			{@const b = nav[m.key]}
			<a
				href={m.href}
				aria-current={on ? 'page' : undefined}
				class="relative flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-bold transition-colors {on ? 'bg-white/7 text-fg' : 'text-white/60 hover:bg-white/4 hover:text-fg'}"
			>
				{#if on}<span class="absolute top-2.5 bottom-2.5 -left-3 w-[3px] rounded-r bg-accent" aria-hidden="true"></span>{/if}
				<Icon id={m.icon} size={20} />
				<span class="min-w-0 flex-1 truncate">{m.name}</span>
				{#if b?.n}
					<span class="flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[12px] font-extrabold tabular-nums {b.hot ? 'bg-danger text-bg' : on ? 'bg-accent text-bg' : 'bg-white/10 text-white/75'}" aria-label="처리할 일 {b.n}건">{b.n}</span>
				{/if}
				{#if !m.ready}<span class="sr-only">(준비 중)</span>{/if}
			</a>
		{/each}
	</nav>
	<div class="shrink-0 border-t border-white/7 p-3">
		<div class="flex items-center gap-3 rounded-xl px-3 py-2.5">
			<span class="flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-[14px] font-extrabold">{ME.name.slice(0, 1)}</span>
			<div class="min-w-0 flex-1">
				<p class="truncate text-[14px] font-bold">{ME.role} {ME.name}</p>
				<p class="truncate text-[12px] text-white/55">MYR 운영팀</p>
			</div>
			<button type="button" class="flex h-9 w-9 items-center justify-center rounded-lg text-white/55 hover:bg-white/6 hover:text-fg" aria-label="로그아웃"><Icon id="logout" size={18} /></button>
		</div>
	</div>
</aside>
