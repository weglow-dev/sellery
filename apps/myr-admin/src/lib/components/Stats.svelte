<script lang="ts">
	import type { Tone } from '$lib/mock/types';
	import { NOTE_CLS } from '$lib/tone';

	/** 숫자 묶음(시안 stats) — 이름 13px · 값 22px(모바일 18px) · 값 아래 작은 글씨(선택) · 아래 진행 막대(선택).
	 *  op(− + =)가 있으면 시안처럼 값 앞에 기호를 두고 칸을 양끝 맞춤으로 늘어놓는다(정산 회차 상세) */
	let { items, bar }: { items: { k: string; v: string; tone?: Tone | 'plain'; op?: string; note?: string }[]; bar?: { pct: number; text: string } } = $props();
	const C: Record<string, string> = { ...NOTE_CLS, plain: 'text-fg' };
	const eq = $derived(items.some((it) => it.op));
</script>

{#snippet stat(it: (typeof items)[number])}
	<div class="min-w-0">
		<p class="text-[13px] text-white/50">{it.k}</p>
		<p class="mt-[5px] text-[18px] font-extrabold tracking-[-0.01em] tabular-nums lg:text-[22px] {C[it.tone ?? 'plain']}">{it.v}</p>
		{#if it.note}<p class="mt-1 text-[12px] text-white/50 tabular-nums">{it.note}</p>{/if}
	</div>
{/snippet}

{#if eq}
	<div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-3.5">
		{#each items as it (it.k)}
			{#if it.op}<span class="mt-[23px] shrink-0 text-[20px] leading-[1.3] font-bold text-white/40" aria-hidden="true">{it.op}</span>{/if}
			{@render stat(it)}
		{/each}
	</div>
{:else}
	<div class="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-x-[18px] gap-y-3.5 lg:grid-cols-[repeat(auto-fit,minmax(130px,1fr))]">
		{#each items as it (it.k)}{@render stat(it)}{/each}
	</div>
{/if}
{#if bar}
	<div class="mt-4 flex items-center gap-2.5">
		<span class="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-white/9"><span class="block h-full rounded-[3px] bg-accent" style:width="{bar.pct}%"></span></span>
		<span class="shrink-0 text-[12.5px] font-semibold text-white/60 tabular-nums">{bar.text}</span>
	</div>
{/if}
