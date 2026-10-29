<script lang="ts">
	import type { Product } from '$lib/data';
	import { creatorOf, won } from '$lib/data';
	import { shop } from '$lib/state.svelte';
	import Tile from './Tile.svelte';

	/** 홈 2열 그리드 카드 — 타일 · 태그 · 찜 · 크리에이터 · 이름 · 한 줄 · 가격 */
	let { p }: { p: Product } = $props();
	const liked = $derived(shop.liked(p.id));
</script>

<div class="relative flex flex-col overflow-hidden rounded-[20px] border border-white/8 bg-white/3">
	<a href="/p/{p.code}" class="flex flex-col text-fg">
		<Tile tile={p.tile} ic={p.ic} icon={72} class="relative aspect-square w-full" />
		{#if p.tag}
			<span class="absolute top-2.5 left-2.5 rounded-full bg-bg/60 px-2 py-1 text-[11px] font-bold backdrop-blur-sm">{p.tag}</span>
		{/if}
		<span class="flex flex-col gap-1 px-3 pt-3 pb-3.5">
			<span class="text-[11px] font-bold text-accent">{creatorOf(p.creator).name}</span>
			<span class="text-[14px] leading-[1.35] font-bold">{p.name}</span>
			<span class="text-[12px] text-fg-faint">{p.sub}</span>
			<span class="mt-1 text-[15px] font-extrabold tracking-[-.01em]">{won(p.price)}</span>
		</span>
	</a>
	<button
		type="button"
		onclick={() => shop.toggleLike(p.id)}
		aria-label={liked ? '찜 해제' : '찜'}
		aria-pressed={liked}
		class="absolute top-2 right-2 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-bg/50 {liked ? 'text-accent' : 'text-fg'}"
	>
		<svg width="15" height="15" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"
			><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" /></svg
		>
	</button>
</div>
