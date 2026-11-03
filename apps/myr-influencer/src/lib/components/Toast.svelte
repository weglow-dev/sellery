<script lang="ts">
	import { app } from '$lib/state.svelte';
	import Icon from './Icon.svelte';
</script>

{#if app.toast}
	<div
		role="status"
		class="absolute bottom-[104px] left-5 right-5 z-40 flex animate-toast items-center gap-3 rounded-2xl border border-white/10 bg-panel-2 px-4 py-3.5 shadow-[0_10px_30px_rgba(0,0,0,.4)] lg:right-auto lg:bottom-8 lg:left-1/2 lg:min-w-[320px] lg:-translate-x-1/2 lg:px-[18px]"
	>
		<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-bg">
			<Icon id="check" size={14} sw={3} />
		</span>
		<span class="flex-1 text-[14px] leading-[1.4] font-semibold lg:whitespace-nowrap">{app.toast}</span>
	</div>
{/if}
