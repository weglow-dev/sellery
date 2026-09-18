<script lang="ts">
	import { toasts } from '@sellery/core';
</script>

<div id="toasts" aria-live="polite">
	{#each toasts.list as t (t.id)}
		<div class="toast">{t.msg}</div>
	{/each}
</div>
