<script lang="ts">
	/** 데스크톱 상단 바 — [이전](완료 화면에선 숨김) · 고른 경로 */
	let { trail, showBack, onback }: { trail: string; showBack: boolean; onback: () => void } = $props();
</script>

<div class="hidden h-[72px] shrink-0 items-center gap-2 px-14 lg:flex">
	{#if showBack}
		<button type="button" onclick={onback} class="flex h-10 items-center gap-1.5 rounded-xl border border-white/10 pr-3.5 pl-2.5 text-[13px] font-semibold text-fg/80 transition hover:border-white/30 hover:text-fg">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
			이전
		</button>
	{/if}
	<span class="ml-auto text-xs text-fg/40">{trail}</span>
</div>
