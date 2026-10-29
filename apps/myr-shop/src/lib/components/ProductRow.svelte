<script lang="ts">
	import type { Product } from '$lib/data';
	import { won } from '$lib/data';
	import Tile from './Tile.svelte';

	/** 카테고리 목록의 가로 행 카드 */
	let { p }: { p: Product } = $props();
</script>

<a href="/p/{p.code}" class="flex items-center gap-3.5 rounded-[20px] border border-white/8 bg-white/3 p-3 text-fg">
	<Tile tile={p.tile} ic={p.ic} thumbUrl={p.thumbUrl} alt={p.name} icon={44} class="h-[88px] w-[88px] rounded-2xl" />
	<span class="flex min-w-0 flex-1 flex-col gap-[3px]">
		<span class="text-[11px] font-bold text-accent">{p.creator.name}</span>
		<span class="text-[15px] leading-[1.35] font-bold">{p.name}</span>
		<span class="text-[12px] text-fg-faint">{p.sub} · {p.form}</span>
		<span class="mt-1 text-[15px] font-extrabold">{p.soldOut ? '품절' : won(p.price)}</span>
	</span>
	<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
</a>
