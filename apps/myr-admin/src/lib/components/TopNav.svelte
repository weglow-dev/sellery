<script lang="ts">
	import { page } from '$app/state';
	import { MENUS, TOP_NAV, isActive } from '$lib/menus';
	import { server } from '$lib/mock/server.svelte';
	import HeadIcons from './HeadIcons.svelte';

	/** PC(lg~) 상단 메뉴 72px — 시안 "MYR Admin PC"와 같게(2026-11-24).
	 *  로고 · 메뉴(처리할 건수 배지 = 홈 숫자 §1-1 · 고른 메뉴는 주황 밑줄) · 오른쪽 파트너팀 톡 아이콘(답할 차례 수) · 내 계정(이름 · 로그아웃).
	 *  모바일은 MobileTop(로고 · 같은 HeadIcons) + 하단 탭(TabBar) + 전체 메뉴(MenuSheet) */
	const nav = $derived(server.nav);
	const items = $derived(TOP_NAV.map((t) => ({ ...t, href: MENUS.find((m) => m.key === t.key)!.href })));
</script>

<header class="z-[5] hidden h-[72px] shrink-0 border-b border-white/7 bg-bg/85 backdrop-blur-md lg:block">
	<div class="mx-auto flex h-full max-w-[1240px] items-center gap-9 px-10">
		<a href="/" aria-label="MYR 어드민 홈" class="flex shrink-0 items-center gap-2.5">
			<img src="/myr-logo.svg" alt="MYR" class="block h-[30px] w-auto" />
			<span class="rounded-md bg-accent/14 px-2 py-1 text-[11px] font-extrabold tracking-[0.06em] text-accent">ADMIN</span>
		</a>
		<nav class="no-bar flex h-full min-w-0 items-center gap-[26px] overflow-x-auto" aria-label="주요 메뉴">
			{#each items as m (m.key)}
				{@const on = isActive(page.url.pathname, m.href)}
				{@const b = nav[m.key]}
				<a href={m.href} aria-current={on ? 'page' : undefined} class="relative flex h-[72px] shrink-0 items-center gap-[7px] text-[15px] font-bold whitespace-nowrap transition-colors {on ? 'text-fg' : 'text-white/55 hover:text-fg'}">
					{m.label}
					{#if b?.n}<span class="flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] px-[5px] text-[11px] font-extrabold tabular-nums {on ? 'bg-accent text-bg' : 'bg-white/10 text-white/75'}" aria-label="처리할 일 {b.n}건">{b.n}</span>{/if}
					<span class="absolute inset-x-0 bottom-0 h-0.5 rounded-[1px] transition-colors {on ? 'bg-accent' : 'bg-transparent'}" aria-hidden="true"></span>
				</a>
			{/each}
		</nav>

		<!-- 파트너팀 톡 아이콘 · 내 계정(모바일 머리와 같은 컴포넌트) -->
		<HeadIcons />
	</div>
</header>
