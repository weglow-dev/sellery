<script lang="ts">
	import type { Tone } from '$lib/mock/types';
	import { DOT_CLS } from '$lib/tone';

	/** 탭 안 하위 필터(실패 종류 · 보류 이유) — 탭보다 작은 칩 · 0건은 흐리게. total = 탭 건수(보류 이유는 겹칠 수 있어 하위 합과 다르다) */
	let { items, total, value, onpick }: { items: { id: string; name: string; count: number; tone: Tone }[]; total: number; value: string; onpick: (id: string) => void } = $props();
</script>

<div class="no-bar -mx-5 flex gap-1.5 overflow-x-auto px-5 lg:mx-0 lg:flex-wrap lg:px-0" role="group" aria-label="하위 필터">
	{#each [{ id: '', name: '전체', count: total, tone: 'plain' as Tone }, ...items] as s (s.id)}
		{@const on = value === s.id}
		<button
			type="button"
			aria-pressed={on}
			onclick={() => onpick(s.id)}
			disabled={!s.count && s.id !== ''}
			class="flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[13px] font-bold transition-colors disabled:opacity-40 {on ? 'bg-white/12 text-fg' : 'text-white/65 hover:bg-white/6'}"
		>
			{#if s.id}<span class="h-1.5 w-1.5 rounded-full {DOT_CLS[s.tone]}"></span>{/if}
			{s.name}
			<span class="tabular-nums text-white/55">{s.count}</span>
		</button>
	{/each}
</div>
