<script lang="ts">
	/** 크리에이터 이니셜 원 — 크리에이터 콘솔 홈의 프로필 원과 같은 모양(사진은 기능 단계) */
	let { initial, bg, size = 36 }: { initial: string; bg: string; size?: number } = $props();
</script>

<span class="flex shrink-0 items-center justify-center rounded-full font-extrabold text-bg" style:width="{size}px" style:height="{size}px" style:font-size="{Math.round(size * 0.4)}px" style:background={bg} aria-hidden="true">{initial}</span>
