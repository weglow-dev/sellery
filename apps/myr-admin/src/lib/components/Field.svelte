<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 입력칸 이름 + 칸 + 글자 수 · 도움말 */
	let { label, hint, count, children }: { label: string; hint?: string; count?: string; children: Snippet } = $props();
</script>

<label class="flex flex-col gap-1.5">
	<span class="flex items-center justify-between text-[13px] font-semibold text-white/80">{label}{#if count}<span class="font-medium text-white/55 tabular-nums">{count}</span>{/if}</span>
	{@render children()}
	{#if hint}<span class="text-[12px] text-white/55">{hint}</span>{/if}
</label>
