<script lang="ts">
	import { page } from '$app/state';
	import { shop } from '$lib/state.svelte';

	/** PC(lg 이상) 상단 내비 — 로고 · 홈/전체 제품 · 검색(자리) · 마이(로그인 상태면 아바타) · 장바구니. 모바일은 각 화면 헤더 + 하단 탭바 */
	let { user = null }: { user?: { name: string; avatar: string | null } | null } = $props();
	const links = [
		{ href: '/', name: 'HOME' },
		{ href: '/category', name: '전체 제품' }
	];
	const active = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
</script>

<header class="sticky top-0 z-20 hidden h-[72px] border-b border-white/7 bg-bg/85 backdrop-blur-xl lg:block">
	<div class="mx-auto flex h-full max-w-[1240px] items-center gap-9 px-10">
		<a href="/" aria-label="MYR 홈" class="flex"><img src="/myr-logo.svg" alt="MYR" class="block h-[34px] w-auto" /></a>
		<nav class="flex h-full items-center gap-7" aria-label="주요 메뉴">
			{#each links as l (l.href)}
				{@const on = active(l.href)}
				<a href={l.href} aria-current={on ? 'page' : undefined} class="relative flex h-[72px] items-center text-[15px] font-bold transition-colors hover:text-fg {on ? 'text-fg' : 'text-fg-faint'}">
					{l.name}
					<span class="absolute right-0 bottom-0 left-0 h-0.5 rounded-sm transition-colors {on ? 'bg-accent' : 'bg-transparent'}"></span>
				</a>
			{/each}
		</nav>
		<div class="ml-auto flex items-center gap-2.5">
			<!-- 검색은 M4 이후(§9) — 지금은 자리만 -->
			<div class="flex h-11 w-[clamp(160px,22vw,260px)] items-center gap-2.5 rounded-[14px] border border-white/8 bg-white/5 px-4 text-white/40" aria-hidden="true">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
				<span class="truncate text-[14px]">레시피, 크리에이터, 성분 검색</span>
			</div>
			{#if user}
				<a href="/my" aria-label="마이페이지 — {user.name}" class="flex h-11 items-center gap-2 rounded-[14px] bg-white/5 pr-3.5 pl-1.5 text-[14px] font-bold text-fg transition-colors hover:bg-white/10">
					{#if user.avatar}
						<img src={user.avatar} alt="" class="h-8 w-8 rounded-full object-cover" />
					{:else}
						<span class="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[13px] font-extrabold text-bg" aria-hidden="true">{user.name[0]?.toUpperCase() ?? 'M'}</span>
					{/if}
					<span class="max-w-[96px] truncate">{user.name}</span>
				</a>
			{:else}
				<a href="/login" class="flex h-11 items-center rounded-[14px] bg-white/5 px-4 text-[14px] font-bold text-fg transition-colors hover:bg-white/10">로그인</a>
			{/if}
			<!-- 외곽선 버튼 + 오른쪽 위 주황 뱃지 (디자인 2026-10-30) -->
			<a href="/cart" class="relative flex h-11 items-center gap-2 rounded-[14px] border border-white/14 pr-4 pl-3.5 text-[14px] font-bold text-fg transition-colors hover:bg-white/6">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l1 13H5z" /><path d="M9 7V5a3 3 0 0 1 6 0v2" /></svg>
				<span>장바구니</span>
				{#if shop.cartCount}
					<!-- 뱃지: 테두리 대신 ring(상자 크기에 안 들어감) · leading-none · 두 자리면 알약으로 늘어난다 -->
					<span class="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] leading-none font-bold tabular-nums text-white ring-2 ring-bg">
						<span class="mt-0.5">{shop.cartBadge}</span>
					</span>
				{/if}
			</a>
		</div>
	</div>
</header>
