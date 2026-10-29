<script lang="ts">
	import Icon from './Icon.svelte';

	/** 제품 비주얼 타일 — 제품 사진(thumbUrl)이 있으면 사진, 없으면 그라데이션 배경 + 제형 아이콘 */
	let { tile, ic, thumbUrl = null, alt = '', icon = 44, class: cls = '' }: { tile: string; ic: string; thumbUrl?: string | null; alt?: string; icon?: number; class?: string } = $props();
</script>

{#if thumbUrl}
	<span class="block shrink-0 overflow-hidden {cls}">
		<img src={thumbUrl} {alt} class="h-full w-full object-cover" loading="lazy" />
	</span>
{:else}
	<span class="flex shrink-0 items-center justify-center text-white/92 {cls}" style="background:{tile}" aria-hidden="true">
		<Icon id={ic} size={icon} />
	</span>
{/if}
