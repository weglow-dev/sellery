<script lang="ts">
	import type { Snippet } from 'svelte';
	let { h, hint = '', wait = false, children }: { h: string; hint?: string; wait?: boolean; children?: Snippet } = $props();
</script>

<div class="card"><h4>{@html h}{wait ? ' ⏳' : ''}</h4>{#if hint}<p class="hint">{@html hint}</p>{/if}{#if children}<div class="btnrow">{@render children()}</div>{/if}</div>
