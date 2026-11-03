<script lang="ts">
	import type { ProductDraft } from '$lib/data';
	import { ADD_ROW, INPUT_SM, INPUT_SUB } from '$lib/ui';
	import Icon from '../Icon.svelte';
	import StepHead from './StepHead.svelte';

	/** 4단계 성분 — 성분명 · 함량(또는 역할) · 넣은 이유. 줄을 늘리고 지울 수 있다(마지막 한 줄은 비우기만).
	 *  모바일: [성분명 · 함량 · ×] 아래에 넣은 이유 / PC(lg~): 한 줄 [성분명 · 함량 · 넣은 이유 · ×] — 안쪽 줄을 lg:contents 로 풀고 order 로 순서를 맞춘다 */
	let { ed = $bindable() }: { ed: ProductDraft } = $props();

	const add = () => (ed.ingredients = [...ed.ingredients, { name: '', why: '', amount: '' }]);
	const remove = (i: number) => (ed.ingredients = ed.ingredients.length > 1 ? ed.ingredients.filter((_, j) => j !== i) : [{ name: '', why: '', amount: '' }]);
</script>

<StepHead n={4} name="성분" title={'성분표에 모르는\n이름이 없게'} desc="성분명 · 왜 넣었는지 · 함량(또는 역할). 표 형태로 올라가요." where="02 · 무엇이 들어있나요" />

<div class="mt-4 flex flex-col gap-2 lg:mt-5">
	{#each ed.ingredients as row, i (i)}
		<div class="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-white/3 p-3 lg:grid lg:grid-cols-[minmax(0,1fr)_110px_minmax(0,1.6fr)_40px] lg:items-center lg:gap-2">
			<div class="grid grid-cols-[minmax(0,1fr)_96px_36px] items-center gap-1.5 lg:contents">
				<input class="{INPUT_SM} font-bold lg:order-1" bind:value={row.name} placeholder="성분명" aria-label="성분명 {i + 1}" />
				<input class="{INPUT_SM} px-2.5 text-center text-[13px] font-bold text-accent lg:order-2" bind:value={row.amount} placeholder="100mg" aria-label="함량 {i + 1}" />
				<button type="button" onclick={() => remove(i)} aria-label="성분 {i + 1} 삭제" class="flex h-[46px] w-9 items-center justify-center text-white/35 transition-colors lg:order-4 lg:w-10 lg:hover:text-fg">
					<Icon id="x" size={16} sw={2.2} />
				</button>
			</div>
			<input class="{INPUT_SUB} lg:order-3 lg:h-[46px]" bind:value={row.why} placeholder="이 성분을 넣은 이유 (예: 흡수가 빠른 500Da 이하 분자)" aria-label="넣은 이유 {i + 1}" />
		</div>
	{/each}
	<button type="button" onclick={add} class="{ADD_ROW} transition-colors lg:hover:border-accent">+ 성분 추가</button>
</div>
