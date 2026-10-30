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
		<span class="absolute top-1.5 right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] leading-none font-extrabold tabular-nums text-bg">{shop.cartCount}</span>
	{/if}
</a>
