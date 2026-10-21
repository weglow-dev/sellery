<script lang="ts">
	import type { RailItem, Step } from './shared';

	/** 데스크톱 사이드 레일 — 로고(처음으로) · 진행 · 질문 목록(지난/현재/도달 가능한 질문은 눌러 이동, 나머지는 잠금) · 안내 카드 */
	let {
		items,
		questions,
		qi,
		done,
		stepLabel,
		onrestart,
		ongo
	}: { items: RailItem[]; questions: Step[]; qi: number; done: boolean; stepLabel: string; onrestart: () => void; ongo: (step: Step) => void } = $props();
</script>

<aside class="hidden min-h-0 flex-col gap-7 border-r border-white/[0.07] px-8 pt-7 pb-8 lg:flex">
	<button type="button" onclick={onrestart} class="flex items-center gap-2.5 text-left text-[15px] font-bold tracking-tight text-fg">
		<span class="grid size-7 place-items-center rounded-lg bg-accent text-[15px] font-extrabold text-bg">B</span>
		Sellery Branding
	</button>
	<div>
		<div class="flex items-baseline justify-between">
			<span class="text-xs font-bold tracking-[0.06em] text-fg/50">제조의뢰</span>
			<span class="text-[13px] font-bold text-accent tabular-nums">{stepLabel}</span>
		</div>
		<div class="mt-2.5 flex gap-1">
			{#each questions as s, i (s)}
				<div class="h-1 flex-1 rounded-full transition-colors duration-300 {done || i < qi ? 'bg-accent' : 'bg-white/[0.12]'}"></div>
			{/each}
		</div>
	</div>
	<nav class="no-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto" aria-label="질문 목록">
		{#each items as r (r.step)}
			<button
				type="button"
				disabled={r.locked}
				aria-current={r.on ? 'step' : undefined}
				onclick={() => ongo(r.step)}
				class="flex items-center gap-3.5 rounded-[14px] px-3 py-[11px] text-left transition-colors {r.on ? 'bg-accent/10' : ''} {r.locked
					? 'cursor-default'
					: 'cursor-pointer hover:bg-white/[0.03]'}"
			>
				<!-- 번호 원 — 답이 들어온 순간(filled) 살짝 튀며 포인트색으로 채워진다. 지난 질문도 채워진 채로 남는다 -->
				<span
					class="grid size-[26px] shrink-0 place-items-center rounded-full border-[1.5px] text-[11px] font-extrabold transition-colors {r.filled
						? 'border-accent bg-accent text-bg motion-safe:animate-fill'
						: r.on
							? 'border-accent text-accent'
							: 'border-white/[0.18] text-fg/40'}"
				>
					{r.n}
				</span>
				<span class="flex min-w-0 flex-1 flex-col gap-px">
					<span class="text-sm font-bold {r.dim ? 'text-fg/40' : 'text-fg'}">{r.title}</span>
					<!-- 값이 바뀔 때마다(답 선택 · 건너뜀 · 진행 중) 아래에서 떠오르며 나타난다 -->
					{#key r.value}
						<span class="truncate text-xs text-fg/50 motion-safe:animate-value">{r.value}</span>
					{/key}
				</span>
			</button>
		{/each}
	</nav>
	<div class="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3.5">
		<svg class="mt-0.5 shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
		<span class="text-xs leading-[1.55] text-fg/65">약 1분이면 끝나요. 확실하지 않은 건 건너뛰고 <br />첫 미팅에서 같이 정해요.</span>
	</div>
</aside>
