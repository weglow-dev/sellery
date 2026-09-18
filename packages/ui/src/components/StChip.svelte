<script lang="ts">
	import { ST, type Status } from '@sellery/core';
	let { st, still = false }: { st: Status; still?: boolean } = $props();
	const m = $derived(ST[st]);
</script>

<span class="st {m.c}" style={still ? 'animation:none' : ''}>{#if st === 'LIVE'}<span class="pulse"></span>{/if}{m.l}</span>
