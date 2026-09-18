<script lang="ts">
	import { FLOW, FLOW_L, type Status } from '@sellery/core';
	let { status }: { status: Status } = $props();
	const idx = $derived(FLOW.indexOf(status === 'SAMPLE_PURCHASED' ? 'SAMPLE_APPROVED' : status === 'INVITED' ? 'SAMPLE_REQUESTED' : status));
</script>

<div class="stepper">
	{#each FLOW_L as l, i}
		<span class="stp {i < idx ? 'done' : i === idx ? 'now' : ''}">{l}</span>
	{/each}
</div>
