<script lang="ts">
	import type { Product } from '@sellery/core';
	let { p, sz = 38 }: { p: Product | undefined | null; sz?: number } = $props();
	const src = $derived(p?.thumb ? (p.thumb.startsWith('assets/') ? '/' + p.thumb : p.thumb) : '');
</script>

{#if src}
	<span class="picon" style="width:{sz}px;height:{sz}px"><img {src} alt="" /></span>
{:else}
	<span class="picon em" style="width:{sz}px;height:{sz}px;font-size:{Math.round(sz * 0.62)}px">{p ? p.em : '📦'}</span>
{/if}
