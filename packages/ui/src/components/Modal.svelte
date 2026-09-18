<script lang="ts">
	import { closeModal } from '@sellery/core';
	import type { Snippet } from 'svelte';
	let { title = '', wide = false, children }: { title?: string; wide?: boolean; children: Snippet } = $props();
	function onkey(e: KeyboardEvent) { if (e.key === 'Escape') closeModal(); }
</script>

<svelte:window onkeydown={onkey} />
<div class="modal-bg" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
	<div class="modal" role="dialog" aria-modal="true" style={wide ? 'max-width:720px' : ''}>
		{#if title}<h3>{@html title}</h3>{/if}
		{@render children()}
	</div>
</div>
