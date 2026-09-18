<script lang="ts">
	import { SEMOJI, type Seller } from '@sellery/core';
	let { s, sz = 58, style = '' }: { s: Seller; sz?: number; style?: string } = $props();
	const src = $derived(s.img ? (s.img.startsWith('assets/') ? '/' + s.img : s.img) : '');
</script>

{#if src}
	<span class="sc-av" style="width:{sz}px;height:{sz}px;background-image:url('{src}');{style}"></span>
{:else}
	<span class="sc-av em" style="width:{sz}px;height:{sz}px;font-size:{Math.round(sz * 0.45)}px;{style}">{SEMOJI[s.id] || '⭐'}</span>
{/if}
