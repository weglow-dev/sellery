<script lang="ts">
	import StepHead from './StepHead.svelte';
	import { MAX_LEN, SUGGESTED_INGREDIENTS, type Category } from '$lib/utils/apply-options';
	import { bodyCls, ctaOff, ctaOn, footCls, inputCls, labelCls, scrollCls } from './shared';

	/** 메인 성분(선택) + 더 전달하고 싶은 내용(선택). 카테고리별 자주 쓰는 성분 칩은 쉼표로 이어 붙이고, 다시 누르면 뺀다. */
	let {
		q,
		category,
		ingredient = $bindable(''),
		note = $bindable(''),
		onnext
	}: { q: string; category: string; ingredient: string; note: string; onnext: () => void } = $props();

	const suggestions = $derived(SUGGESTED_INGREDIENTS[category as Category] ?? []);
	const picked = $derived(
		ingredient
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
	);
	function toggle(label: string) {
		const cur = [...picked];
		const i = cur.indexOf(label);
		if (i >= 0) cur.splice(i, 1);
		else cur.push(label);
		ingredient = cur.join(', ');
	}
	const filled = $derived(picked.length > 0 || note.trim() !== '');
</script>

<div class={scrollCls}>
	<StepHead eyebrow="{q} · 메인 성분" optional title={['꼭 넣고 싶은', '성분이 있나요?']} help="비워두면 매니저가 제안드려요. 미팅 때 같이 정해요." />
	<div class="{bodyCls} lg:mt-7 lg:grid lg:grid-cols-2 lg:gap-10">
		<div>
			<div class="mt-6 flex flex-col gap-2 lg:mt-0">
				<label for="ingredient" class={labelCls}>성분 이름</label>
				<input id="ingredient" bind:value={ingredient} type="text" maxlength={MAX_LEN.ingredient} autocomplete="off" placeholder="예: 가르시니아, 저분자 콜라겐, 밀크씨슬" class="{inputCls} h-14" />
			</div>
			{#if suggestions.length > 0}
				<p class="mt-6 mb-2.5 text-[13px] font-semibold text-fg/55">{category} 제품에 자주 쓰는 성분</p>
				<div class="flex flex-wrap gap-2">
					{#each suggestions as s (s)}
						{@const on = picked.includes(s)}
						<button
							type="button"
							aria-pressed={on}
							onclick={() => toggle(s)}
							class="h-11 rounded-full border-[1.5px] px-4 text-[15px] font-semibold whitespace-nowrap transition active:scale-95 {on
								? 'border-accent bg-accent/[0.12] text-accent'
								: 'border-white/[0.14] text-fg/85 hover:border-white/30'}"
						>
							{on ? '✓' : '+'} {s}
						</button>
					{/each}
				</div>
			{/if}
		</div>
		<div class="mt-6 flex flex-col gap-2 lg:mt-0">
			<label for="note" class={labelCls}>더 전달하고 싶은 내용 <span class="font-medium text-fg/50">(선택)</span></label>
			<textarea id="note" bind:value={note} rows="3" maxlength={MAX_LEN.note} placeholder="브랜드 컨셉, 참고하는 제품, 론칭 희망 시기 등 편하게 적어주세요" class="{inputCls} resize-none py-3.5 leading-normal lg:min-h-[214px]"></textarea>
		</div>
	</div>
</div>
<div class={footCls}>
	<button type="button" onclick={onnext} class={filled ? ctaOn : ctaOff}>{filled ? '다음' : '건너뛰기'}</button>
</div>
