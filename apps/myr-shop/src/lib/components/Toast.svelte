<script lang="ts">
	import { shop } from '$lib/state.svelte';
</script>

{#if shop.toast}
	<!-- 담기 토스트는 아래(모바일 담기 바 위 · PC 오른쪽 아래), 안내 토스트(info)는 위(모바일 화면 위 · PC 상단 내비 아래 가운데) -->
	<div
		role="status"
		class="z-30 flex w-[calc(100%-40px)] max-w-[390px] items-center gap-3 rounded-2xl border border-white/10 bg-panel-2 px-4 py-3.5 shadow-[0_10px_30px_rgba(0,0,0,.4)] {shop.toastKind === 'info'
			? 'absolute top-[max(12px,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 animate-toast-top lg:fixed lg:top-[88px] lg:w-[400px] lg:max-w-none'
			: 'absolute bottom-[104px] left-1/2 -translate-x-1/2 animate-toast lg:fixed lg:right-8 lg:bottom-8 lg:left-auto lg:w-[360px] lg:translate-x-0'}"
	>
		{#if shop.toastKind === 'info'}
			<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/12 text-fg">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 11v6" /><path d="M12 7.5v.01" /></svg>
			</span>
			<span class="flex-1 text-[14px] leading-[1.4] font-semibold">{shop.toast}</span>
		{:else}
			<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0b0e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
			</span>
			<span class="flex-1 text-[14px] leading-[1.4] font-semibold">{shop.toast}</span>
			<a href="/cart" class="px-1 py-1.5 text-[13px] font-extrabold whitespace-nowrap text-accent">보기</a>
		{/if}
	</div>
{/if}
