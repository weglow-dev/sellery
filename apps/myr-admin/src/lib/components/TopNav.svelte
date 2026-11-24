<script lang="ts">
	import { page } from '$app/state';
	import { MENUS, TOP_NAV, isActive } from '$lib/menus';
	import { ME, server } from '$lib/mock/server.svelte';
	import { app } from '$lib/state.svelte';
	import Icon from './Icon.svelte';

	/** PC(lg~) 상단 메뉴 72px — 시안 "MYR Admin PC"와 같게(2026-11-24).
	 *  로고 · 메뉴(처리할 건수 배지 = 홈 숫자 §1-1 · 고른 메뉴는 주황 밑줄) · 오른쪽 파트너팀 톡 아이콘(답할 차례 수) · 내 계정(이름 · 로그아웃).
	 *  모바일은 MobileTop + 하단 탭(TabBar) + 전체 메뉴(MenuSheet) */
	const nav = $derived(server.nav);
	const items = $derived(TOP_NAV.map((t) => ({ ...t, href: MENUS.find((m) => m.key === t.key)!.href })));
	const talkOn = $derived(isActive(page.url.pathname, '/talk'));
	let acctOpen = $state(false);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (acctOpen = false)} />

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

		<!-- 파트너팀 톡 — 메뉴가 아니라 아이콘 · 답할 차례 수 -->
		<a href="/talk" aria-label="파트너팀 톡{nav.talk?.n ? ` · 답할 차례 ${nav.talk.n}` : ''}" aria-current={talkOn ? 'page' : undefined} class="relative ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] transition-colors hover:bg-white/10 {talkOn ? 'bg-white/12' : 'bg-white/5'}">
			<Icon id="m_talk" size={20} />
			{#if nav.talk?.n}<span class="absolute -top-[5px] -right-[5px] flex h-5 min-w-5 items-center justify-center rounded-[10px] border-2 border-bg bg-accent px-[5px] text-[11px] font-extrabold text-bg tabular-nums">{nav.talk.n}</span>{/if}
		</a>

		<!-- 내 계정 -->
		<div class="relative -ml-[26px] shrink-0">
			<button type="button" onclick={() => (acctOpen = !acctOpen)} aria-label="내 계정" aria-haspopup="menu" aria-expanded={acctOpen} class="flex h-11 w-11 items-center justify-center rounded-[14px] transition-colors hover:bg-white/10 {acctOpen ? 'bg-white/12' : 'bg-white/5'}"><Icon id="user" size={20} /></button>
			{#if acctOpen}
				<button type="button" class="fixed inset-0 z-[9] cursor-default" aria-label="계정 메뉴 닫기" onclick={() => (acctOpen = false)}></button>
				<div role="menu" class="animate-menu absolute top-[calc(100%+8px)] right-0 z-10 w-[200px] rounded-2xl border border-white/12 bg-panel-2 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.5)]">
					<div class="px-3 pt-2.5 pb-2">
						<p class="text-[14px] font-bold">{ME.name}</p>
						<p class="mt-0.5 text-[12px] text-white/50">MYR 운영팀</p>
					</div>
					<div class="mx-2 my-1 h-px bg-white/8"></div>
					<button type="button" role="menuitem" onclick={() => { acctOpen = false; app.showToast('로그아웃은 기능 단계에서 붙어요'); }} class="flex h-11 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-[14px] font-bold text-white/70 hover:bg-white/6 hover:text-fg"><Icon id="logout" size={18} sw={2.2} />로그아웃</button>
				</div>
			{/if}
		</div>
	</div>
</header>
