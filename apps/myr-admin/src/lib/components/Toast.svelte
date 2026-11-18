<script lang="ts">
	import { app } from '$lib/state.svelte';
	import Icon from './Icon.svelte';
</script>

{#if app.toast}
	<div
		role="status"
		class="fixed right-5 bottom-[104px] left-5 z-[70] mx-auto flex max-w-[400px] animate-toast items-center gap-3 rounded-2xl border border-white/10 bg-panel-2 px-4 py-3.5 shadow-[0_10px_30px_rgba(0,0,0,.45)] lg:right-auto lg:bottom-8 lg:left-1/2 lg:max-w-none lg:min-w-[340px] lg:-translate-x-1/2"
	>
		<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full {app.toastTone === 'error' ? 'bg-danger text-bg' : 'bg-accent text-bg'}">
			<Icon id={app.toastTone === 'error' ? 'alert' : 'check'} size={14} sw={3} />
		</span>
		<span class="flex-1 text-[14px] leading-[1.45] font-semibold">{app.toast}</span>
	</div>
{/if}
