<script lang="ts">
	import { ME, type ProductDraft } from '$lib/data';
	import { TEXTAREA } from '$lib/ui';
	import StepHead from './StepHead.svelte';

	/** 2단계 레시피 노트 — 이미지 바로 아래 오렌지 박스의 한 문장. 아래에 샵에서 보일 모양을 바로 그린다 */
	let { ed = $bindable() }: { ed: ProductDraft } = $props();
	const has = $derived(!!ed.note.trim());
</script>

<StepHead n={2} name="레시피 노트" title={'한 문장으로\n소개한다면?'} desc="이미지 바로 아래, 오렌지 박스 안에 따옴표로 들어가요. 당신의 말투 그대로." where="레시피 노트" />

<div class="mt-4 lg:mt-5">
	<textarea class={TEXTAREA} rows="4" bind:value={ed.note} aria-label="레시피 노트" maxlength="200" placeholder="예: 아침 공복에 상큼하게. 쓴맛 때문에 못 먹던 글루타치온을 레몬청 느낌으로 바꿨어요."></textarea>
</div>

<div class="mt-[18px] rounded-[20px] border border-accent/22 bg-accent/8 p-[18px] lg:p-5">
	<div class="flex items-center gap-2.5">
		<span class="flex h-[30px] w-[30px] items-center justify-center rounded-full text-[11px] font-extrabold text-bg" style:background={ME.avatarBg}>{ME.noteInitial}</span>
		<span>
			<span class="block text-[11px] font-bold text-accent">{ME.name}의 레시피 노트</span>
			<span class="block text-[11px] text-white/50">{ME.handle}</span>
		</span>
	</div>
	<p class="mt-3 text-[16px] leading-[1.55] font-bold {has ? 'text-fg' : 'text-white/40'}">"{has ? ed.note.trim() : '레시피 노트가 여기에 들어가요'}"</p>
</div>
