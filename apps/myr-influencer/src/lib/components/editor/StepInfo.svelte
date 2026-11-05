<script lang="ts">
	import { INFO_MAKER, INFO_PH, type ProductDraft } from '$lib/data';
	import { INPUT_SUB, LABEL } from '$lib/ui';
	import StepHead from './StepHead.svelte';

	/** 6단계 제품 정보 — 샵 "04 · 제품 정보" 표. 제조만 고정(INFO_MAKER), 나머지는 입력(2026-11-05 대표 결정).
	 *  내용량은 1단계 "내용량 · 구성"과 같은 값(ed.unit) — 어느 쪽에서 고쳐도 같이 바뀐다. 운영팀이 식약처 표시 기준으로 한 번 더 본다 */
	let { ed = $bindable() }: { ed: ProductDraft } = $props();
	const uid = $props.id();
	const ROW = 'grid grid-cols-[84px_minmax(0,1fr)] items-center gap-2.5 bg-white/2 py-2 pr-3 pl-4 lg:grid-cols-[120px_minmax(0,1fr)] lg:gap-3 lg:pl-[18px]';
	const INPUT = `${INPUT_SUB} rounded-[10px] text-[14px]`;
</script>

<StepHead n={6} name="제품 정보" title={'표기 정보를\n채워주세요'} desc="정보 표로 보여줘요. 식약처 표시 기준에 맞춰 운영팀이 한 번 더 확인해요." where="04 · 제품 정보" />

<span class="mt-4 mb-2.5 block lg:mt-5 {LABEL}">정보 표</span>
<div class="flex flex-col overflow-hidden rounded-[18px] border border-white/8">
	<div class={ROW}>
		<label class="text-[13px] text-white/50" for="{uid}-fp">제형 / 포장</label>
		<input id="{uid}-fp" class={INPUT} bind:value={ed.formPack} maxlength="60" placeholder={INFO_PH.formPack} />
	</div>
	<div class="{ROW} border-t border-white/7">
		<label class="text-[13px] text-white/50" for="{uid}-unit">내용량</label>
		<input id="{uid}-unit" class={INPUT} bind:value={ed.unit} maxlength="40" placeholder={INFO_PH.unit} />
	</div>
	<div class="{ROW} border-t border-white/7">
		<span class="text-[13px] text-white/50">제조</span>
		<span class="px-3 py-2.5 text-[14px] text-white/70">{INFO_MAKER} <span class="text-[12px] text-white/40">· 고정</span></span>
	</div>
	<div class="{ROW} border-t border-white/7">
		<label class="text-[13px] text-white/50" for="{uid}-life">유통기한</label>
		<input id="{uid}-life" class={INPUT} bind:value={ed.shelfLife} maxlength="80" placeholder={INFO_PH.shelfLife} />
	</div>
	<div class="{ROW} border-t border-white/7">
		<label class="text-[13px] text-white/50" for="{uid}-keep">보관</label>
		<input id="{uid}-keep" class={INPUT} bind:value={ed.storageMethod} maxlength="80" placeholder={INFO_PH.storageMethod} />
	</div>
</div>
<p class="mt-2.5 text-[12px] leading-normal text-white/50">내용량은 1단계 "내용량 · 구성"과 같은 값이에요.</p>
