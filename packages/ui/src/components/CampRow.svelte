<script lang="ts">
	import { brand, prod, seller, platIcon, fmt, md, P, go, type Campaign } from '@sellery/core';
	import PIcon from './PIcon.svelte';
	import StChip from './StChip.svelte';
	let { c, who = 'seller' }: { c: Campaign; who?: 'seller' | 'brand' } = $props();
	const p = $derived(prod(c.productId));
	const b = $derived(brand(p.brandId));
	const s = $derived(seller(c.sellerId));
</script>

<div class="rowitem" role="button" tabindex="0" onclick={() => go.camp(c.id)} onkeydown={(e) => e.key === 'Enter' && go.camp(c.id)}>
	<PIcon {p} sz={38} />
	<div class="grow">
		<div class="nm">{p.name}</div>
		<div class="sub">
			{#if who === 'seller'}{b.name} · 수수료 {(p.rate * 100).toFixed(0)}%{:else}{@html platIcon(s)} {s.name} {s.handle} · 팔로워 {fmt(s.followers)}{/if}
		</div>
	</div>
	{#if c.start}<span class="sub num">{md(P(c.start))}–{md(P(c.end!))}</span>{/if}
	<StChip st={c.status} />
</div>
