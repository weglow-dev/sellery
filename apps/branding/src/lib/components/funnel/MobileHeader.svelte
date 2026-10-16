<script lang="ts">
	import type { Step } from './shared';

	/** 모바일 고정 헤더 — 뒤로 · 진행 세그먼트 · n/N · 고른 경로. 데스크톱(lg)에서는 숨기고 Rail 이 대신한다. */
	let { questions, qi, trail, onback }: { questions: Step[]; qi: number; trail: string; onback: () => void } = $props();
</script>

<header class="flex h-[84px] shrink-0 flex-col pt-1.5 pr-4 pl-1.5 lg:hidden">
	<div class="flex h-[52px] items-center gap-2.5">
		<button type="button" aria-label="이전 질문으로" onclick={onback} class="grid size-11 shrink-0 place-items-center rounded-xl text-fg transition hover:bg-white/5 active:scale-95">
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
		</button>
		<div class="flex flex-1 gap-1" role="progressbar" aria-valuemin="1" aria-valuemax={questions.length} aria-valuenow={qi} aria-label="질문 진행">
			{#each questions as s, i (s)}
				<div class="h-1 flex-1 rounded-full transition-colors duration-300 {i < qi ? 'bg-accent' : 'bg-white/[0.12]'}"></div>
			{/each}
		</div>
		<span class="min-w-[38px] text-right text-[13px] font-semibold text-fg/60 tabular-nums">{qi} / {questions.length}</span>
	</div>
	<p class="h-[22px] truncate pl-3.5 text-xs font-medium text-fg/55">{trail}</p>
</header>
