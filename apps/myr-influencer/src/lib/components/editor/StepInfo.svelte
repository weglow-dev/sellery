<script lang="ts">
	import { INFO_ROWS, type ProductDraft } from '$lib/data';
	import { INPUT_SUB, LABEL } from '$lib/ui';
	import StepHead from './StepHead.svelte';

	/** 6단계 제품 정보 — 표기 정보 표 5줄. 운영팀이 식약처 표시 기준으로 한 번 더 본다 */
	let { ed = $bindable() }: { ed: ProductDraft } = $props();
	const uid = $props.id();
</script>

<StepHead n={6} name="제품 정보" title={'표기 정보를\n채워주세요'} desc="정보 표로 보여줘요. 식약처 표시 기준에 맞춰 운영팀이 한 번 더 확인해요." where="04 · 제품 정보" />

<span class="mt-4 mb-2.5 block lg:mt-5 {LABEL}">정보 표</span>
<div class="flex flex-col overflow-hidden rounded-[18px] border border-white/8">
	{#each INFO_ROWS as row, i (row.label)}
		<div class="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-2.5 bg-white/2 py-2 pr-3 pl-4 lg:grid-cols-[120px_minmax(0,1fr)] lg:gap-3 lg:pl-[18px] {i ? 'border-t border-white/7' : ''}">
			<label class="text-[13px] text-white/50" for="{uid}-{i}">{row.label}</label>
			<input id="{uid}-{i}" class="{INPUT_SUB} rounded-[10px] text-[14px]" bind:value={ed.info[i]} placeholder={row.ph} />
		</div>
	{/each}
</div>
