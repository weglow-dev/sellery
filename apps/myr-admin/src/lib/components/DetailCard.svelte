<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Chip as ChipT } from '$lib/mock/types';
	import Chip from './Chip.svelte';

	/** 상세 화면 카드(시안 card) — 머리(제목 17px · 설명 · 칩 · 오른쪽 버튼) + 내용. PC 안쪽 여백 24px · 모바일 18px.
	 *  오른쪽 고정 패널 안에서는 plain(테두리 없이 구획만) */
	let { title, sub, chips = [], actions, plain = false, children }: { title?: string; sub?: string; chips?: ChipT[]; actions?: Snippet; plain?: boolean; children: Snippet } = $props();
</script>

<section class={plain ? 'min-w-0' : 'min-w-0 rounded-3xl border border-white/8 bg-white/3 p-[18px] lg:p-6'}>
	{#if title || actions}
		<div class="mb-3.5 flex flex-wrap items-center gap-2">
			{#if title}<h2 class="text-[17px] font-extrabold tracking-[-0.01em]">{title}</h2>{/if}
			{#if sub}<span class="text-[13px] font-semibold text-white/45">{sub}</span>{/if}
			{#each chips as c (c.label)}<Chip label={c.label} tone={c.tone} />{/each}
			{#if actions}<span class="ml-auto flex shrink-0 items-center gap-2">{@render actions()}</span>{/if}
		</div>
	{/if}
	{@render children()}
</section>
