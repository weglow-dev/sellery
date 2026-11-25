<script lang="ts">
	import { PRODUCT_ART, PRODUCT_TILES } from '$lib/product-art';

	/** 상품 사진 자리 — 타일 그라데이션 + 그림(시안과 같은 모양 · 기능 단계에서 실제 사진) */
	let { tile, icon, size = 56, radius = 16, art }: { tile: string; icon: string; size?: number; radius?: number; art?: number } = $props();
	const a = $derived(art ?? Math.round(size * 0.6));
</script>

<span class="flex shrink-0 items-center justify-center text-bg" style:width="{size}px" style:height="{size}px" style:border-radius="{radius}px" style:background={PRODUCT_TILES[tile]} aria-hidden="true">
	<svg width={a} height={a} viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{@html PRODUCT_ART[icon] ?? ''}</svg>
</span>
