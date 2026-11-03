<script lang="ts">
	import { TILE_BG, TILE_ICON, type TileKey } from '$lib/data';
	import Icon from './Icon.svelte';

	/** 제품 비주얼 타일 — 사진(thumbUrl)이 있으면 사진, 없으면 그라데이션 + 제형 아이콘 (샵 Tile 과 같은 그림).
	 *  icon 은 기본(모바일) 아이콘 크기, iconCls 로 PC 크기를 덮는다(예: 'lg:h-9 lg:w-9') */
	let { tile, thumbUrl = null, alt = '', icon = 36, iconCls = '', class: cls = '' }: { tile: TileKey; thumbUrl?: string | null; alt?: string; icon?: number; iconCls?: string; class?: string } = $props();
</script>

{#if thumbUrl}
	<span class="block shrink-0 overflow-hidden {cls}">
		<img src={thumbUrl} {alt} class="h-full w-full object-cover" />
	</span>
{:else}
	<span class="flex shrink-0 items-center justify-center text-white/92 {cls}" style:background={TILE_BG[tile]} aria-hidden="true">
		<Icon id={TILE_ICON[tile]} set="tile" size={icon} class={iconCls} />
	</span>
{/if}
