<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Chip as ChipT, Tone } from '$lib/mock/types';
	import { NOTE_CLS } from '$lib/tone';
	import Chip from './Chip.svelte';

	/** 상세 카드 안 키 · 값 한 줄(시안 kv · 38px · 15px) — 값은 글자 · 칩 · 가린 값(MaskValue) 무엇이든. tone 은 값 색 */
	let { k, tone = 'plain', chips, children }: { k: string; tone?: Tone | 'plain'; chips?: ChipT[]; children?: Snippet } = $props();
	const C: Record<string, string> = { ...NOTE_CLS, plain: 'text-fg' };
</script>

<div class="flex min-h-[36px] items-center justify-between gap-4 text-[14.5px] lg:min-h-[38px] lg:text-[15px]">
	<span class="shrink-0 text-white/60">{k}</span>
	<span class="flex min-w-0 items-center justify-end gap-2 text-right font-semibold tabular-nums {C[tone]}">
		{#if children}{@render children()}{/if}
		{#if chips}{#each chips as c (c.label)}<Chip label={c.label} tone={c.tone} />{/each}{/if}
	</span>
</div>
