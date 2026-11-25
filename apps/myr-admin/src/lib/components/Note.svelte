<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 안내 블록(시안 note) — 상세 본문 · 오른쪽 패널 안 한 줄 + 오른쪽 버튼(선택). 주황 = 안내 · 빨강 = 막힘 · 회색 = 읽기 전용 */
	let { tone = 'orange', text, action }: { tone?: 'orange' | 'red' | 'grey'; text: string; action?: Snippet } = $props();
	const CLS = {
		orange: 'border-accent/26 bg-accent/8 text-[#ff9a66]',
		red: 'border-danger/28 bg-danger/8 text-danger-fg',
		grey: 'border-white/8 bg-white/4 text-white/60'
	};
</script>

<div class="flex flex-wrap items-center gap-3 rounded-[14px] border px-4 py-[13px] text-[13.5px] leading-[1.5] font-semibold {CLS[tone]}">
	<span class="min-w-[200px] flex-1">{text}</span>
	{#if action}<span class="shrink-0">{@render action()}</span>{/if}
</div>
