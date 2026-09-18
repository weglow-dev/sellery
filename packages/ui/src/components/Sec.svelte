<script lang="ts">
	import type { Snippet } from 'svelte';
	let { badge = 0, note = '', style = '', children }: { badge?: number; note?: string; style?: string; children: Snippet } = $props();
</script>

<div class="sec" {style}>{@render children()}{#if badge}<span class="badge">{badge}</span>{/if}{#if note}<span class="font-normal tracking-normal normal-case text-mute">{note}</span>{/if}</div>
