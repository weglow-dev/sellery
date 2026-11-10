<script lang="ts">
	import { page } from '$app/state';
		import { app } from '$lib/state.svelte';
	import Icon from './Icon.svelte';
	import UserMenu from './UserMenu.svelte';

	/** PC(lg~) 상단 내비 72px — 로고 · 홈 · CS 관리(처리 대기 뱃지) · 주문 · 내 제품 · 알림 · 내 계정 메뉴(내 정보 · 로그아웃 — UserMenu). 모바일은 하단 탭바(TabBar)가 대신한다.
	 *  활성 판정: 홈은 정확히 '/', CS 는 목록·상세, 내 제품은 목록·에디터·완료 화면까지 (디자인 "MYR Influencer Admin PC" navLinks) */
	const links = [
		{ href: '/', name: '홈' },
		{ href: '/cs', name: 'CS 관리' },
		{ href: '/orders', name: '주문' },
		{ href: '/settle', name: '정산' },
		{ href: '/products', name: '내 제품' }
	];
	const active = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
	/** 처리 대기 CS = 교환·환불 처리 대기(0078) + 고객 문의 답변 대기(0075) */
	const csCount = $derived(app.csBadge(page.data.inqWaiting, page.data.claimWaiting));
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
					{#if l.href === '/cs' && csCount}
						<span class="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-[5px] text-[11px] font-extrabold tabular-nums text-bg" aria-label="처리 대기 {csCount}건">{csCount}</span>
					{/if}
					<span class="absolute inset-x-0 bottom-0 h-0.5 rounded-[1px] transition-colors {on ? 'bg-accent' : 'bg-transparent'}" aria-hidden="true"></span>
				</a>
			{/each}
		</nav>
		<div class="ml-auto flex items-center gap-2.5">
			<a href="/cs" aria-label="알림 · 처리 대기 CS {csCount}건" class="relative flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/5 text-fg transition-colors hover:bg-white/10">
				<Icon id="bell" size={20} />
				{#if csCount}<span class="absolute top-2 right-[9px] h-2 w-2 rounded-full bg-accent"></span>{/if}
			</a>
			<UserMenu />
		</div>
	</div>
</header>
