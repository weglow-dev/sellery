<script lang="ts">
	import Icon from './Icon.svelte';

	/** 제품 비주얼 타일 — 그라데이션 배경 + 제형 아이콘. 실제 제품 사진이 생기면 img 로 교체 */
	let { tile, ic, icon = 44, class: cls = '' }: { tile: string; ic: string; icon?: number; class?: string } = $props();
</script>

<span class="flex shrink-0 items-center justify-center text-white/92 {cls}" style="background:{tile}" aria-hidden="true">
	<Icon id={ic} size={icon} />
</span>
