<script lang="ts">
	/** 목록 "더보기 / 접기" — 마이 화면 목록들(최근 주문 · 교환/환불 · 내 문의 · 찜). 목록은 이미 다 받아 와 있고 화면에서만 앞부분을 자른다.
	 *  `total` 이 `preview` 이하면 그리지 않는다. 버튼 문구의 숫자 = 숨겨진 개수 */
	let { total, preview, expanded = $bindable(false), controls }: { total: number; preview: number; expanded?: boolean; controls?: string } = $props();
</script>

{#if total > preview}
	<button
		type="button"
		onclick={() => (expanded = !expanded)}
		aria-expanded={expanded}
		aria-controls={controls}
		class="mt-2.5 flex h-11 w-full items-center justify-center gap-1 rounded-[14px] border border-white/8 bg-white/2 text-[13px] font-bold text-fg-soft transition-colors lg:mt-3 lg:hover:bg-white/5 lg:hover:text-fg"
	>
		{expanded ? '접기' : `더보기 ${total - preview}`}
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="transition-transform {expanded ? 'rotate-180' : ''}"><path d="M6 9l6 6 6-6" /></svg>
	</button>
{/if}
