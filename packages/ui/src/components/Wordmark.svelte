<script lang="ts">
	import { LOGO_ICON } from '@sellery/core';
	let { href = '/', label = 'SELLERY' }: { href?: string; label?: string } = $props();
</script>

<a class="wordmark" {href} aria-label="Sellery 홈" style="text-decoration:none">{@html LOGO_ICON}{label}<span class="dot">.</span></a>
