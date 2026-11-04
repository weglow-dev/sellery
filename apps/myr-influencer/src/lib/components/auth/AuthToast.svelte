<script lang="ts">
	/** 화면 아래 알림 한 줄(2.6초) — 시안 TOAST. 모바일은 좌우 꽉, PC 는 가운데. bottom 은 하단 버튼 줄 위로 올릴 때 */
	let { message, bottom = 'bottom-7' }: { message: string | null; bottom?: string } = $props();
</script>

{#if message}
	<div
		role="status"
		class="absolute right-5 left-5 z-10 flex animate-toast items-center gap-3 rounded-2xl border border-white/10 bg-panel-2 px-4 py-3.5 shadow-[0_10px_30px_rgba(0,0,0,.4)] lg:right-auto lg:left-1/2 lg:min-w-[320px] lg:-translate-x-1/2 {bottom}"
	>
		<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent" aria-hidden="true">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0a0b0e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
		</span>
		<span class="flex-1 text-[14px] leading-[1.4] font-semibold">{message}</span>
	</div>
{/if}
