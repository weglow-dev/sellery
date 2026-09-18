<script lang="ts">
	import { GICON } from '@sellery/core';
	let { tiers, cur }: { tiers: { g: string; pct: number }[]; cur: string } = $props();
</script>

<div class="pyr">
	{#each tiers as t, i}
		<div class="pyr-row {t.g === cur ? 'me' : ''}" style="width:calc(128px + {(i * 11).toFixed(1)}%)">
			<span>{@html (GICON as Record<string, string>)[t.g]} {t.g}{#if t.g === cur} <span class="mebadge">MY</span>{/if}</span><span class="pct">상위 {t.pct}%</span>
		</div>
	{/each}
</div>
