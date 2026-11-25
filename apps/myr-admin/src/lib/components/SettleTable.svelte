<script lang="ts">
	import type { SettleTable, TableCell } from '$lib/mock/settle.svelte';
	import { NOTE_CLS } from '$lib/tone';
	import Chip from './Chip.svelte';

	/** 정산 상세 안 격자 표(시안 table 블록) — 머리 12.5px · 줄 56px · 숫자 오른쪽 고정폭 · 무효 줄은 줄 긋기 · 펼치는 줄은 아래 bg-white/4 상자.
	 *  열 폭 · 셀 색 · 굵기 · 아래 글자 · 펼치는 내용은 전부 서버(settle.svelte.ts) 값. 모바일은 overflow-x-auto 안에서 minW 로 가로 스크롤 */
	let { table }: { table: SettleTable } = $props();

	let open = $state<Record<number, boolean>>({});
	$effect(() => {
		void table.title;
		open = {};
	});
	const TONE: Record<string, string> = { ...NOTE_CLS, plain: 'text-fg', dim: 'text-white/35' };
	const W = { semi: 'font-semibold', bold: 'font-bold', black: 'font-extrabold' };
	const isRight = (i: number) => !!table.head[i]?.right;
</script>

{#snippet cell(c: TableCell, i: number)}
	<div class="min-w-0 {isRight(i) ? 'text-right' : 'text-left'}">
		{#if c.chips}
			<div class="flex gap-1.5 {isRight(i) ? 'justify-end' : ''}">{#each c.chips as ch (ch.label)}<Chip label={ch.label} tone={ch.tone} />{/each}</div>
		{:else}
			<p class="truncate text-[14.5px] tabular-nums {TONE[c.tone ?? 'plain']} {c.w ? W[c.w] : 'font-medium'}">{c.t}</p>
		{/if}
		{#if c.sub}<p class="mt-[3px] truncate text-[12.5px] {NOTE_CLS[c.subTone ?? 'grey']}">{c.sub}</p>{/if}
	</div>
{/snippet}

<div class="no-bar -mx-1 overflow-x-auto px-1">
	<div style:min-width="{table.minW}px">
		<div class="grid gap-x-4 border-b border-white/8 pb-2.5 text-[12.5px] leading-[1.3] font-semibold text-white/42" style:grid-template-columns={table.cols}>
			{#each table.head as h (h.label)}<span class={h.right ? 'text-right' : ''}>{h.label}</span>{/each}
		</div>
		{#each table.rows as r, i (i)}
			{@const subs = r.subs ?? []}
			<div class="border-b border-white/5">
				{#if subs.length}
					<button type="button" aria-expanded={!!open[i]} onclick={() => (open = { ...open, [i]: !open[i] })} class="grid min-h-[56px] w-full items-center gap-x-4 py-1.5 text-left hover:bg-white/2 {r.strike ? 'line-through opacity-45' : ''}" style:grid-template-columns={table.cols}>
						{#each r.cells as c, ci (ci)}{@render cell(c, ci)}{/each}
					</button>
					{#if open[i]}
						<div class="mb-2.5 flex flex-col gap-1.5 rounded-[10px] bg-white/4 px-3.5 py-2.5 text-[13px]">
							{#each subs as sb (sb.t)}<div class="flex justify-between gap-3"><span class="text-white/55">{sb.t}</span><span class="font-semibold tabular-nums">{sb.v}</span></div>{/each}
						</div>
					{/if}
				{:else}
					<div class="grid min-h-[56px] items-center gap-x-4 py-1.5 {r.strike ? 'line-through opacity-45' : ''}" style:grid-template-columns={table.cols}>
						{#each r.cells as c, ci (ci)}{@render cell(c, ci)}{/each}
					</div>
				{/if}
			</div>
		{:else}
			<p class="pt-[22px] pb-2 text-center text-[13.5px] text-white/55">{table.empty ?? '아직 없어요'}</p>
		{/each}
	</div>
</div>
