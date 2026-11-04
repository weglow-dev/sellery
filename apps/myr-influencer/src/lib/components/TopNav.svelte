<script lang="ts">
	import { page } from '$app/state';
	import type { Me } from '$lib/data';
	import { app } from '$lib/state.svelte';
	import Icon from './Icon.svelte';

	/** PC(lg~) 상단 내비 72px — 로고 · 홈 · CS 관리(처리 대기 뱃지) · 내 제품 · 알림. 모바일은 하단 탭바(TabBar)가 대신한다.
	 *  활성 판정: 홈은 정확히 '/', CS 는 목록·상세, 내 제품은 목록·에디터·완료 화면까지 (디자인 "MYR Influencer Admin PC" navLinks) */
	const links = [
		{ href: '/', name: '홈' },
		{ href: '/cs', name: 'CS 관리' },
		{ href: '/products', name: '내 제품' }
	];
	const active = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
	/** 로그인한 크리에이터 — 오른쪽 끝 이름 · 로그아웃 */
	const me = $derived(page.data.me as Me | undefined);
</script>

<header class="z-10 hidden h-[72px] shrink-0 border-b border-white/7 bg-bg/85 backdrop-blur-md lg:block">
	<div class="mx-auto flex h-full max-w-[1240px] items-center gap-9 px-10">
		<a href="/" aria-label="MYR 크리에이터 홈" class="flex items-center gap-2.5">
			<img src="/myr-logo.svg" alt="MYR" class="block h-[30px] w-auto" />
			<span class="rounded-md bg-accent/14 px-2 py-1 text-[11px] font-extrabold tracking-[0.06em] text-accent">CREATOR</span>
		</a>
		<nav class="flex h-full items-center gap-7" aria-label="주요 메뉴">
			{#each links as l (l.href)}
				{@const on = active(l.href)}
				<a href={l.href} aria-current={on ? 'page' : undefined} class="relative flex h-[72px] items-center gap-[7px] text-[15px] font-bold transition-colors {on ? 'text-fg' : 'text-white/55 hover:text-fg'}">
					{l.name}
					{#if l.href === '/cs' && app.pending.length}
						<span class="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-[5px] text-[11px] font-extrabold tabular-nums text-bg" aria-label="처리 대기 {app.pending.length}건">{app.pending.length}</span>
					{/if}
					<span class="absolute inset-x-0 bottom-0 h-0.5 rounded-[1px] transition-colors {on ? 'bg-accent' : 'bg-transparent'}" aria-hidden="true"></span>
				</a>
			{/each}
		</nav>
		<a href="/cs" aria-label="알림 · 처리 대기 CS {app.pending.length}건" class="relative ml-auto flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/5 text-fg transition-colors hover:bg-white/10">
			<Icon id="bell" size={20} />
			{#if app.pending.length}<span class="absolute top-2 right-[9px] h-2 w-2 rounded-full bg-accent"></span>{/if}
		</a>
		{#if me}
			<div class="flex items-center gap-3">
				<span class="max-w-[160px] truncate text-[14px] font-bold text-white/80" title={me.handle}>{me.name}</span>
				<form method="POST" action="/auth/signout">
					<button type="submit" class="h-9 rounded-xl border border-white/12 px-3 text-[13px] font-bold text-white/70 transition-colors hover:border-white/25 hover:text-fg">로그아웃</button>
				</form>
			</div>
		{/if}
	</div>
</header>
