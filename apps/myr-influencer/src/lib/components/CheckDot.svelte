<script lang="ts">
	import Icon from './Icon.svelte';

	/** 타임라인·미리보기의 체크 점 — on 이면 주황 채움 + 체크, 아니면 빈 테두리 */
	let { on, size = 22 }: { on: boolean; size?: number } = $props();
</script>

<span
	class="box-border flex shrink-0 items-center justify-center rounded-full border-[1.5px] text-bg {on ? 'border-accent bg-accent' : 'border-white/30 bg-transparent'}"
	style:width="{size}px"
	style:height="{size}px"
	aria-hidden="true"
>
	{#if on}<Icon id="check" size={11} sw={3.5} />{/if}
</span>
