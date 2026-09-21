<script lang="ts">
	/** 상품 아이콘 `pIcon` (web campaign-card.tsx ProductIcon): 썸네일이 있으면 .picon img, 없으면 이모지 */
	import { imageSrc } from '@sellery/db/campaign';
	let { thumbUrl, emoji, size = 38 }: { thumbUrl: string | null; emoji: string; size?: number } = $props();
	const src = $derived(imageSrc(thumbUrl));
</script>

<span class="picon" style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.62)}px" aria-hidden="true">{#if src}<img {src} alt="" />{:else}{emoji}{/if}</span>
