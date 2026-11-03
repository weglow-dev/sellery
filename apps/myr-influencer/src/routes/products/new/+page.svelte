<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { ProductDraft } from '$lib/data';
	import { goBack } from '$lib/nav';
	import { EDITOR_STEPS, blankDraft, editorTrail, nextLabel, stepValid } from '$lib/rules';
	import { app } from '$lib/state.svelte';
	import BottomBar from '$lib/components/BottomBar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ExampleSheet from '$lib/components/editor/ExampleSheet.svelte';
	import StepBasics from '$lib/components/editor/StepBasics.svelte';
	import StepFaq from '$lib/components/editor/StepFaq.svelte';
	import StepHowto from '$lib/components/editor/StepHowto.svelte';
	import StepInfo from '$lib/components/editor/StepInfo.svelte';
	import StepIngredients from '$lib/components/editor/StepIngredients.svelte';
	import StepNote from '$lib/components/editor/StepNote.svelte';
	import StepPreview from '$lib/components/editor/StepPreview.svelte';
	import StepStory from '$lib/components/editor/StepStory.svelte';

	/** 상품 등록 — 8단계 위저드. 1 기본 정보(필수) · 2 레시피 노트(필수) · 3~7 선택(비우면 샵에서 숨김 · 버튼이 "건너뛰기") · 8 미리보기 → 심사 요청.
	 *  `?draft=<id>` 면 임시저장한 입력값을 이어 쓴다. 심사 요청 = 운영팀 검수 대기(review) — 승인되면 MYR Shop 에 열린다(docs/myr.md §6.1). */
	const draftParam = page.url.searchParams.get('draft');
	const source = draftParam ? app.products.find((p) => p.id === draftParam && p.status === 'draft') : undefined;

	let draftId = $state<string | null>(source?.id ?? null);
	let ed = $state<ProductDraft>(source?.draft ? structuredClone(source.draft) : source ? { ...blankDraft(), name: source.name, tile: source.tile } : blankDraft());
	let step = $state(1);
	let exOpen = $state(false);
	let scroller: HTMLDivElement | undefined = $state();

	const valid = $derived(stepValid(step, ed));
	const label = $derived(nextLabel(step, ed));
	const trail = $derived(editorTrail(ed, app.categories));

	// 단계가 바뀌면 입력 영역을 맨 위로
	$effect(() => {
		void step;
		scroller?.scrollTo(0, 0);
	});

	function back() {
		if (step > 1) step -= 1;
		else goBack('/products');
	}
	function next() {
		if (!valid) return;
		if (step < EDITOR_STEPS) {
			step += 1;
			return;
		}
		app.submitProduct(ed, draftId);
		goto('/products/new/done', { replaceState: true });
	}
	function saveDraft() {
		const id = app.saveDraft(ed, draftId);
		if (id) draftId = id;
	}
	const editStep = (n: number) => (step = n);
</script>

<div class="relative flex min-h-0 flex-1 animate-slide-in flex-col">
	<div class="flex h-[84px] shrink-0 flex-col pt-1.5 pr-4 pl-1.5">
		<div class="flex h-[52px] items-center gap-2.5">
			<button type="button" onclick={back} aria-label={step > 1 ? '이전 단계' : '나가기'} class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-fg">
				<Icon id="back" size={22} sw={2.2} />
			</button>
			<div class="flex flex-1 gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={EDITOR_STEPS} aria-valuenow={step} aria-label="등록 단계">
				{#each Array.from({ length: EDITOR_STEPS }, (_, i) => i) as i (i)}
					<div class="h-1 flex-1 rounded-sm transition-colors duration-350 {i < step ? 'bg-accent' : 'bg-white/12'}"></div>
				{/each}
			</div>
			<div class="min-w-[38px] text-right text-[13px] font-semibold text-white/60 tabular-nums">{step} / {EDITOR_STEPS}</div>
			<button type="button" onclick={() => (exOpen = true)} class="flex h-[34px] shrink-0 items-center gap-[5px] rounded-full border border-accent/40 bg-accent/10 pr-3 pl-2.5 text-[12px] font-extrabold text-accent">
				<Icon id="eye" size={14} sw={2.2} />예시
			</button>
		</div>
		<div class="h-[22px] truncate pl-3.5 text-[12px] font-medium text-white/55">{trail}</div>
	</div>

	<div bind:this={scroller} class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-8">
		{#key step}
			<div class="animate-up-in">
				{#if step === 1}<StepBasics bind:ed />
				{:else if step === 2}<StepNote bind:ed />
				{:else if step === 3}<StepStory bind:ed />
				{:else if step === 4}<StepIngredients bind:ed />
				{:else if step === 5}<StepHowto bind:ed />
				{:else if step === 6}<StepInfo bind:ed />
				{:else if step === 7}<StepFaq bind:ed />
				{:else}<StepPreview {ed} onedit={editStep} />
				{/if}
			</div>
		{/key}
	</div>

	<BottomBar>
		<button type="button" onclick={saveDraft} class="h-14 w-[104px] shrink-0 rounded-2xl border-[1.5px] border-white/14 text-[14px] font-bold text-fg">임시저장</button>
		<button type="button" onclick={next} disabled={!valid} class="h-14 flex-1 rounded-2xl text-[16px] font-extrabold transition-colors duration-250 {valid ? 'bg-accent text-bg' : 'bg-white/8 text-white/40'}">{label}</button>
	</BottomBar>

	{#if exOpen}
		<ExampleSheet {step} onclose={() => (exOpen = false)} />
	{/if}
</div>
