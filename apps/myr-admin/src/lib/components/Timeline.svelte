<script lang="ts">
	import type { LogEntry } from '$lib/mock/types';

	/** 이력 타임라인 — 최근 것이 위 · 사람(자동은 "자동") · 시각 (§1-2 처리한 사람 · 시각) */
	let { items }: { items: LogEntry[] } = $props();
	const rows = $derived([...items].reverse());
</script>

<ol class="relative flex flex-col gap-3.5 pl-5">
	<span class="absolute top-1.5 bottom-1.5 left-[5px] w-px bg-white/10" aria-hidden="true"></span>
	{#each rows as l, i (i)}
		<li class="relative">
			<span class="absolute top-[5px] -left-5 h-[11px] w-[11px] rounded-full border-2 border-bg {i === 0 ? 'bg-accent' : 'bg-white/30'}" aria-hidden="true"></span>
			<p class="text-[14px] leading-[1.45] font-semibold text-white/90">{l.text}</p>
			<p class="mt-0.5 text-[12px] text-white/55">{l.who} · {l.at}</p>
		</li>
	{/each}
</ol>
