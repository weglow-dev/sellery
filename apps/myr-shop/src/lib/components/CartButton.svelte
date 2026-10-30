<script lang="ts">
	import { shop } from '$lib/state.svelte';

	/** 헤더 오른쪽 장바구니 버튼(담긴 수 뱃지). `glass` 는 상품 상세의 타일 위 버전 */
	let { glass = false }: { glass?: boolean } = $props();
</script>

<a
	href="/cart"
	aria-label="장바구니"
	class="relative flex h-11 w-11 items-center justify-center rounded-[14px] text-fg {glass ? 'bg-bg/45 backdrop-blur-md' : 'bg-white/5'}"
>
	<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
		><path d="M6 7h12l1 13H5z" /><path d="M9 7V5a3 3 0 0 1 6 0v2" /></svg
	>
	{#if shop.cartCount}
		<!-- 버튼 오른쪽 위 모서리에 반쯤 걸치는 알약 뱃지(디자인 2026-10-30) — ring 으로 배경과 분리 · 두 자리까지 그대로 -->
		<span class="absolute -top-2 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] leading-none font-bold tabular-nums text-white ring-2 ring-bg"><span class="mt-px">{shop.cartBadge}</span></span>
	{/if}
</a>
