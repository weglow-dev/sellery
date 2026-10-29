<script lang="ts">
	/** 크리에이터 이니셜 아바타 — 프로필 사진이 생기면 img 로 교체 */
	let { bg, initial, size = 44, class: cls = '' }: { bg: string; initial: string; size?: number; class?: string } = $props();
</script>

<span
	class="flex shrink-0 items-center justify-center rounded-full font-extrabold text-bg {cls}"
	style="width:{size}px;height:{size}px;background:{bg};font-size:{Math.round(size * 0.34)}px"
	aria-hidden="true">{initial}</span
>
