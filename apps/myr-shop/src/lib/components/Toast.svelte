<script lang="ts">
	import { shop } from '$lib/state.svelte';
</script>

{#if shop.toast}
	<div
		role="status"
		class="fixed bottom-[104px] left-1/2 z-30 flex w-[calc(100%-40px)] max-w-[390px] -translate-x-1/2 animate-toast items-center gap-3 rounded-2xl border border-white/10 bg-panel-2 px-4 py-3.5 shadow-[0_10px_30px_rgba(0,0,0,.4)] lg:right-8 lg:bottom-8 lg:left-auto lg:w-[360px] lg:translate-x-0"
	>
		<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0b0e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
		</span>
		<span class="flex-1 text-[14px] leading-[1.4] font-semibold">{shop.toast}</span>
		<a href="/cart" class="px-1 py-1.5 text-[13px] font-extrabold whitespace-nowrap text-accent">보기</a>
	</div>
{/if}
