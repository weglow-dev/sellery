<script lang="ts">
	/** 홈 `👀 지금 보는 중` = Σ viewersOf(LIVE & custVisible) + 41 (ux-spec §1.10 · web campaign-card.tsx ViewersSum) */
	import { onMount } from 'svelte';
	import { fmtNum, viewersOf } from '@sellery/db/campaign';
	let { codes, base = 41 }: { codes: string[]; base?: number } = $props();
	const sum = () => codes.reduce((a, code) => a + viewersOf(code), 0) + base;
	let n = $state(sum());
	onMount(() => {
		const t = window.setInterval(() => (n = sum()), 20000);
		return () => window.clearInterval(t);
	});
</script>

<span>{fmtNum(n)}</span>
