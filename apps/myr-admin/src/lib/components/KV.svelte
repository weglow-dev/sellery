<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 키 · 값 한 줄 (서랍 정보 표) */
	let { k, children, strong = false }: { k: string; children: Snippet; strong?: boolean } = $props();
</script>

<div class="flex items-start justify-between gap-4 border-b border-white/6 py-2.5 text-[14px] last:border-b-0">
	<span class="shrink-0 text-white/55">{k}</span>
	<span class="min-w-0 text-right {strong ? 'font-extrabold' : 'font-semibold text-white/90'}">{@render children()}</span>
</div>
