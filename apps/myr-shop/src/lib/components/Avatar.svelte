<script lang="ts">
	import { creatorStyle, type Creator } from '$lib/data';

	/** 크리에이터 아바타 — 프로필 사진(avatarUrl)이 있으면 사진, 없으면 이니셜 + 핸들 해시 배경색 */
	let { creator, size = 44, class: cls = '' }: { creator: Creator; size?: number; class?: string } = $props();
	const style = $derived(creatorStyle(creator));
</script>

{#if creator.avatarUrl}
	<img src={creator.avatarUrl} alt="" class="shrink-0 rounded-full object-cover {cls}" style="width:{size}px;height:{size}px" />
{:else}
	<span
		class="flex shrink-0 items-center justify-center rounded-full font-extrabold text-bg {cls}"
		style="width:{size}px;height:{size}px;background:{style.bg};font-size:{Math.round(size * 0.34)}px"
		aria-hidden="true">{style.initial}</span
	>
{/if}
