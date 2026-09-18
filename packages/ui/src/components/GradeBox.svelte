<script lang="ts">
	import { gfull } from '@sellery/core';
	let { g, sm = true, style = '' }: { g: string; sm?: boolean; style?: string } = $props();
</script>

<span class="gradebox {sm ? 'sm' : ''}" {style}>{@html gfull(g)}</span>
