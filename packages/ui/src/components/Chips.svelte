<script lang="ts">
	/* 필터 칩 (js/50-admin.js admChips) */
	let { list, cur, onpick, style = 'margin:0 0 12px' }: { list: [string, string, number?][]; cur: string; onpick: (k: string) => void; style?: string } = $props();
</script>

<div class="cats" {style}>
	{#each list as [k, l, n]}
		<button class="catchip {cur === k ? 'on' : ''}" onclick={() => onpick(k)}>{l}{#if n != null} <span style="color:var(--mute);font-weight:400">{n}</span>{/if}</button>
	{/each}
</div>
