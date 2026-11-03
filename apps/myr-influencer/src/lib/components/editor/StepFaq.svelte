<script lang="ts">
	import type { ProductDraft } from '$lib/data';
	import { ADD_ROW, INPUT_SM, INPUT_SUB } from '$lib/ui';
	import StepHead from './StepHead.svelte';

	/** 7단계 FAQ — 질문 · 답변 쌍. 질문을 늘릴 수 있다 */
	let { ed = $bindable() }: { ed: ProductDraft } = $props();
	const add = () => (ed.faq = [...ed.faq, { q: '', a: '' }]);
</script>

<StepHead n={7} name="FAQ" title={'자주 받을 질문에\n미리 답해둘까요?'} desc="팔로워가 자주 묻는 질문과 답변을 적어주세요." where="05 · 자주 묻는 질문" />

<div class="mt-4 flex flex-col gap-2">
	{#each ed.faq as f, i (i)}
		<div class="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-white/3 px-3.5 py-3">
			<div class="flex items-center gap-2">
				<span class="shrink-0 text-[13px] font-extrabold text-accent" aria-hidden="true">Q</span>
				<input class="{INPUT_SM} h-11 flex-1 rounded-[10px] font-bold" bind:value={f.q} placeholder="질문" aria-label="질문 {i + 1}" />
			</div>
			<div class="flex items-center gap-2">
				<span class="shrink-0 text-[13px] font-extrabold text-white/40" aria-hidden="true">A</span>
				<input class="{INPUT_SUB} h-11 flex-1 rounded-[10px] text-[14px]" bind:value={f.a} placeholder="답변" aria-label="답변 {i + 1}" />
			</div>
		</div>
	{/each}
	<button type="button" onclick={add} class={ADD_ROW}>+ 질문 추가</button>
</div>
