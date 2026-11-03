<script lang="ts">
	import type { ProductDraft } from '$lib/data';
	import { INPUT_SM, INPUT_SUB } from '$lib/ui';
	import StepHead from './StepHead.svelte';

	/** 5단계 섭취법 — 3스텝 카드(제목 · 설명). 모바일은 세로로 쌓인 줄(번호 왼쪽), PC(lg~)는 3단 카드(번호 위) */
	let { ed = $bindable() }: { ed: ProductDraft } = $props();
</script>

<StepHead n={5} name="섭취법" title="어떻게 먹으면 가장 좋을까요?" desc="3스텝 카드로 보여줘요. 간단할수록 좋아요." where="03 · 이렇게 드세요" />

<div class="mt-3.5 flex flex-col gap-2 lg:mt-5 lg:grid lg:grid-cols-3 lg:gap-2.5">
	{#each ed.steps as st, i (i)}
		<div class="flex items-start gap-2.5 rounded-2xl border border-white/8 bg-white/3 p-3 lg:flex-col lg:gap-2 lg:p-3.5">
			<span class="mt-2 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] bg-accent/14 text-[12px] font-extrabold text-accent lg:mt-0">{String(i + 1).padStart(2, '0')}</span>
			<div class="flex w-full min-w-0 flex-1 flex-col gap-1.5 lg:gap-2">
				<input class="{INPUT_SM} font-bold" bind:value={st.title} placeholder="제목 (예: 아침 공복에)" aria-label="스텝 {i + 1} 제목" />
				<input class={INPUT_SUB} bind:value={st.desc} placeholder="설명" aria-label="스텝 {i + 1} 설명" />
			</div>
		</div>
	{/each}
</div>
