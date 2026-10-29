<script lang="ts">
	import type { Product } from '$lib/data';
	import { won } from '$lib/data';
	import { shop } from '$lib/state.svelte';
	import Tile from './Tile.svelte';

	/** 제품 카드 — 모바일 홈 2열 그리드 · PC 홈/카테고리 그리드(hover 떠오름). `wide` 는 PC 카테고리의 4:3 타일 */
	let { p, wide = false }: { p: Product; wide?: boolean } = $props();
	const liked = $derived(shop.liked(p.code));
</script>

<div class="relative flex flex-col overflow-hidden rounded-[20px] border border-white/8 bg-white/3 transition-[border-color,transform] duration-250 lg:rounded-[22px] lg:hover:-translate-y-[3px] lg:hover:border-white/25">
	<a href="/p/{p.code}" class="flex flex-col text-fg">
		<Tile tile={p.tile} ic={p.ic} thumbUrl={p.thumbUrl} alt={p.name} icon={72} class="relative w-full {wide ? 'aspect-square lg:aspect-[4/3]' : 'aspect-square'} lg:[&>svg]:h-24 lg:[&>svg]:w-24" />
		{#if p.soldOut}
			<span class="absolute top-2.5 left-2.5 rounded-full bg-bg/70 px-2 py-1 text-[11px] font-bold text-fg-faint backdrop-blur-sm lg:top-3 lg:left-3">품절</span>
		{:else if p.tag}
			<span class="absolute top-2.5 left-2.5 rounded-full bg-bg/60 px-2 py-1 text-[11px] font-bold backdrop-blur-sm lg:top-3 lg:left-3">{p.tag}</span>
		{/if}
		<span class="flex flex-col gap-1 px-3 pt-3 pb-3.5 lg:px-4 lg:pt-4 lg:pb-[18px]">
			<span class="text-[11px] font-bold text-accent lg:text-[12px]">{p.creator.name}</span>
			<span class="text-[14px] leading-[1.35] font-bold lg:text-[15px]">{p.name}</span>
			<span class="text-[12px] text-fg-faint lg:text-[13px]">{p.sub}{wide ? ` · ${p.form}` : ''}</span>
			<span class="mt-1 text-[15px] font-extrabold tracking-[-.01em] lg:mt-1.5 lg:text-[17px]">{won(p.price)}</span>
		</span>
	</a>
	<button
		type="button"
		onclick={() => shop.toggleLike(p)}
		aria-label={liked ? '찜 해제' : '찜'}
		aria-pressed={liked}
		class="absolute top-2 right-2 flex h-[30px] w-[30px] items-center justify-center rounded-full bg-bg/50 lg:top-2.5 lg:right-2.5 lg:h-[34px] lg:w-[34px] {liked ? 'text-accent' : 'text-fg'}"
	>
		<svg width="15" height="15" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"
			><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" /></svg
		>
	</button>
</div>
