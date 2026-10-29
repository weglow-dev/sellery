<script lang="ts">
	import { page } from '$app/state';
	import { shop } from '$lib/state.svelte';
	import Icon from './Icon.svelte';

	/** 모바일 하단 플로팅 탭바 — 홈 · 카테고리 · 장바구니(뱃지) · 마이. 홈 · 카테고리 · 마이에서만(레이아웃이 결정) · PC 는 상단 내비 */
	const tabs = [
		{ href: '/', name: '홈', ic: 'home' },
		{ href: '/category', name: '카테고리', ic: 'grid' },
		{ href: '/cart', name: '장바구니', ic: 'cart' },
		{ href: '/my', name: '마이', ic: 'user' }
	];
	const active = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
</script>

<!-- `sticky bottom-0` — 레이아웃이 화면 내용 뒤에 두어 문서 흐름의 마지막이 된다. fixed 는 iOS 툴바에 가려지거나 잘려서 쓰지 않는다 -->
<nav class="pointer-events-none sticky bottom-0 z-10 w-full bg-bg px-5 pt-2.5 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:hidden" aria-label="주요 메뉴">
	<div class="pointer-events-auto grid h-16 grid-cols-4 items-center rounded-[22px] border border-white/8 bg-panel px-1.5 shadow-[0_10px_30px_rgba(0,0,0,.4)]">
		{#each tabs as t (t.href)}
			{@const on = active(t.href)}
			<a
				href={t.href}
				aria-current={on ? 'page' : undefined}
				class="relative flex h-[52px] flex-col items-center justify-center gap-1 transition-colors {on ? 'text-accent' : 'text-white/45'}"
			>
				<Icon id={t.ic} tab size={22} />
				<span class="text-[11px] font-bold">{t.name}</span>
				{#if t.href === '/cart' && shop.cartCount}
					<span class="absolute top-2 right-[calc(50%-16px)] flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-extrabold text-bg">{shop.cartCount}</span>
				{/if}
			</a>
		{/each}
	</div>
</nav>
