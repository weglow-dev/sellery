<script lang="ts">
	import type { Tone } from '$lib/mock/types';
	import { NOTE_CLS } from '$lib/tone';

	/** 숫자 묶음(시안 stats) — 이름 13px · 값 22px(모바일 18px) · 아래 진행 막대(선택) */
	let { items, bar }: { items: { k: string; v: string; tone?: Tone | 'plain' }[]; bar?: { pct: number; text: string } } = $props();
	const C: Record<string, string> = { ...NOTE_CLS, plain: 'text-fg' };
</script>

<div class="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-x-[18px] gap-y-3.5 lg:grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
	{#each items as it (it.k)}
		<div>
			<p class="text-[13px] text-white/50">{it.k}</p>
			<p class="mt-[5px] text-[18px] font-extrabold tracking-[-0.01em] tabular-nums lg:text-[22px] {C[it.tone ?? 'plain']}">{it.v}</p>
		</div>
	{/each}
</div>
{#if bar}
	<div class="mt-4 flex items-center gap-2.5">
		<span class="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-white/9"><span class="block h-full rounded-[3px] bg-accent" style:width="{bar.pct}%"></span></span>
		<span class="shrink-0 text-[12.5px] font-semibold text-white/60 tabular-nums">{bar.text}</span>
	</div>
{/if}
