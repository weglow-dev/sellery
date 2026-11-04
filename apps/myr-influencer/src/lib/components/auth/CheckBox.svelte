<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 네모 체크박스 — 진짜 <input type="checkbox"> 를 숨겨 두고 모양만 그린다(키보드 · 스크린리더 · 폼 전송 그대로). 켜지면 주황 + 체크 */
	let {
		checked = $bindable(false),
		name = undefined,
		size = 22,
		onchange = undefined,
		children
	}: { checked?: boolean; name?: string; size?: 22 | 24; onchange?: () => void; children: Snippet } = $props();
</script>

<label class="flex min-h-11 w-fit cursor-pointer items-center gap-2.5">
	<input type="checkbox" class="peer sr-only" {name} value="1" bind:checked {onchange} />
	<span
		class="flex shrink-0 items-center justify-center border-[1.5px] transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60 {size === 24 ? 'h-6 w-6 rounded-lg' : 'h-[22px] w-[22px] rounded-[7px]'} {checked
			? 'border-accent bg-accent'
			: 'border-white/30 bg-transparent'}"
		aria-hidden="true"
	>
		{#if checked}<svg width={size === 24 ? 14 : 13} height={size === 24 ? 14 : 13} viewBox="0 0 24 24" fill="none" stroke="#0a0b0e" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{/if}
	</span>
	{@render children()}
</label>
