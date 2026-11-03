<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 작은 상태·종류 칩 — 색은 cls(rules.ts 의 *_META.cls). lg 는 상세 화면 크기, strong=false 는 굵기 700 */
	let { cls, lg = false, strong = true, children }: { cls: string; lg?: boolean; strong?: boolean; children: Snippet } = $props();
</script>

<span class="{lg ? 'rounded-lg px-2.5 py-[5px] text-[12px]' : 'rounded-md px-[7px] py-[3px] text-[11px]'} {strong ? 'font-extrabold' : 'font-bold'} whitespace-nowrap {cls}">
	{@render children()}
</span>
