<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import type { ProductDraft } from '$lib/data';
	import { goBack } from '$lib/nav';
	import { detailToDraft, draftToPayload, saveFailure } from '$lib/product-draft';
	import { MODE_COPY, anyChanged, changedSections, primaryEnabled, primaryLabel, type EditorMode } from '$lib/product-edit';
	import { EDITOR_STEPS, blankDraft, editorTrail, stepValid } from '$lib/rules';
	import { app } from '$lib/state.svelte';
	import BottomBar from '$lib/components/BottomBar.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PcBack from '$lib/components/PcBack.svelte';
	import ExampleBody from '$lib/components/editor/ExampleBody.svelte';
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
	 *  저장은 서버(0073 · POST /api/products): 임시저장 = draft · 심사 요청 = pending(운영팀 검수 → 승인되면 MYR Shop · docs/myr.md §6.1).
	 *  `?id=<상품>` 이면 내 임시저장 · 반려 상품을 이어 쓴다(+page.server.ts). 반려 상품은 사유를 보여주고, 다시 심사 요청하면 사유가 지워진다.
	 *  **수정 모드(4-2 · 시안의 isEdit)** — 판매 중 · 일시중지 상품: 8단계(수정 내용 확인)에서 시작 · 섹션 [수정] → 그 단계 → "수정 완료" 로 8단계 · 바꾼 섹션 "변경됨" ·
	 *  바꾼 게 없으면 요청 못 함 · 보조 버튼 "취소" · 뒤로는 8단계로. 수정 심사 저장(서버)은 다음 단계 — 지금은 dev · Preview 에서만 완료 화면까지(UI 확인).
	 *  모바일: 단계 막대 헤더 · 하단 버튼 줄 · [예시] 바텀시트 / PC(lg~): 화면 높이 고정 — 왼쪽 입력(안에서 스크롤) + 바닥 버튼, 오른쪽 460px 예시 패널이 늘 보이고 쓰는 단계로 스크롤된다. */
	let { data } = $props();
	// 첫 값만 서버 데이터에서(이후는 이 화면 안에서 바뀐다)
	const source = untrack(() => data.product);
	const mode: EditorMode = untrack(() => data.mode);
	const copy = MODE_COPY[mode];
	let productId = $state<string | null>(source?.id ?? null);
	let ed = $state<ProductDraft>(source ? detailToDraft(source) : blankDraft());
	/** 수정 모드의 비교 기준(지금 샵에 보이는 내용) */
	const orig = mode === 'edit' && source ? detailToDraft(source) : null;
	const rejectReason = source?.status === 'rejected' ? source.rejectReason : null;
	let step = $state(mode === 'edit' ? EDITOR_STEPS : 1);
	let saving = $state(false);
	let exOpen = $state(false);
	let scroller: HTMLDivElement | undefined = $state();

	const valid = $derived(stepValid(step, ed));
	const changed = $derived(orig ? changedSections(ed, orig) : null);
	const isChanged = $derived(!!changed && anyChanged(changed));
	const label = $derived(primaryLabel(mode, step, ed, isChanged));
	const enabled = $derived(primaryEnabled(mode, step, valid, isChanged));
	const trail = $derived(copy.trailPrefix + editorTrail(ed));
	const segments = Array.from({ length: EDITOR_STEPS }, (_, i) => i);

	// 단계가 바뀌면 입력 영역을 맨 위로 — 모바일·PC 모두 이 화면의 입력 스크롤 영역
	$effect(() => {
		void step;
		scroller?.scrollTo(0, 0);
	});

	/** 뒤로 — 수정 모드는 단계 안에서 8단계(수정 내용 확인)로, 8단계에서는 나가기 */
	function back() {
		if (mode === 'edit') {
			if (step < EDITOR_STEPS) step = EDITOR_STEPS;
			else goBack('/products');
		} else if (step > 1) step -= 1;
		else goBack('/products');
	}
	/** 서버 저장 — 임시저장(submit=false) · 심사 요청(submit=true). 실패하면 안내 + 그 칸이 있는 단계로 */
	async function save(submit: boolean): Promise<boolean> {
		if (saving) return false;
		if (ed.images.some((u) => u.startsWith('blob:'))) {
			app.showToast('사진을 올리는 중이에요. 잠시 후 다시 눌러주세요');
			return false;
		}
		saving = true;
		try {
			const res = await fetch('/api/products', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: productId, payload: draftToPayload(ed), submit }) });
			const r = (await res.json().catch(() => null)) as { ok?: boolean; id?: string; code?: string; field?: string } | null;
			if (!r?.ok || !r.id) {
				const f = saveFailure(r?.code ?? 'DB_ERROR', r?.field);
				app.showToast(f.message);
				if (f.step) step = f.step;
				return false;
			}
			if (!productId) {
				productId = r.id;
				replaceState(`/products/new?id=${r.id}`, {});
			}
			return true;
		} catch {
			app.showToast('저장하지 못했어요. 인터넷 연결을 확인해주세요');
			return false;
		} finally {
			saving = false;
		}
	}

	async function next() {
		if (!enabled || saving) return;
		if (mode === 'edit') {
			if (step < EDITOR_STEPS) step = EDITOR_STEPS;
			else submitRevision();
			return;
		}
		if (step < EDITOR_STEPS) {
			step += 1;
			return;
		}
		if (!(await save(true))) return;
		app.lastSubmitted = ed.name.trim();
		app.lastSubmitMode = 'new';
		goto('/products/new/done', { replaceState: true });
	}
	/** 수정 심사 요청 — 서버 저장(수정본 보관 · 운영팀 승인 시 반영)은 다음 단계. 지금은 dev · Preview 에서만 완료 화면(UI 확인) */
	function submitRevision() {
		if (ed.images.some((u) => u.startsWith('blob:'))) {
			app.showToast('사진을 올리는 중이에요. 잠시 후 다시 눌러주세요');
			return;
		}
		if (!data.revisionPreview) {
			app.showToast('수정 심사는 곧 열려요. 조금만 기다려주세요');
			return;
		}
		app.lastSubmitted = ed.name.trim();
		app.lastSubmitMode = 'edit';
		if (productId) app.mockRevisions = { ...app.mockRevisions, [productId]: true };
		goto('/products/new/done', { replaceState: true });
	}
	/** 보조 버튼 — 새 상품은 임시저장, 수정 모드는 취소(바꾼 내용은 버린다 · 샵은 그대로) */
	function secondary() {
		if (mode === 'edit') goBack('/products');
		else saveDraft();
	}
	async function saveDraft() {
		if (await save(false)) app.showToast('임시저장했어요');
	}
	const editStep = (n: number) => (step = n);
</script>

{#snippet bar(cls: string)}
	<div class="flex flex-1 gap-1 {cls}" role="progressbar" aria-valuemin={1} aria-valuemax={EDITOR_STEPS} aria-valuenow={step} aria-label="등록 단계">
		{#each segments as i (i)}
			<div class="h-1 flex-1 rounded-sm transition-colors duration-350 {i < step ? 'bg-accent' : 'bg-white/12'}"></div>
		{/each}
	</div>
{/snippet}

{#snippet buttons(saveCls: string)}
	<button type="button" onclick={secondary} disabled={saving} class="h-14 shrink-0 rounded-2xl border-[1.5px] border-white/14 text-[14px] font-bold text-fg transition-colors lg:hover:border-white/35 {saveCls}">{saving ? '저장 중…' : copy.secondary}</button>
	<button type="button" onclick={next} disabled={!enabled || saving} aria-busy={saving} class="h-14 flex-1 rounded-2xl text-[16px] font-extrabold transition-colors duration-250 {enabled && !saving ? 'bg-accent text-bg' : 'bg-white/8 text-white/40'}">{saving && step >= EDITOR_STEPS ? '심사 요청 중…' : label}</button>
{/snippet}

<!--
	PC(lg~): 화면 높이 고정(<main> 높이 = 화면 − 상단 내비) — 왼쪽 열 = 머리(뒤로 · 한 줄 요약 · 단계 막대 전체 폭 · N / 8) + 입력(안에서만 스크롤) + 버튼 줄(늘 바닥),
	오른쪽 460px 예시 패널은 왼쪽과 같은 높이 (디자인 "MYR Influencer Admin PC" 2026-11-03 개정). 화면이 아주 낮으면 560px 아래로는 줄지 않고 <main> 이 스크롤한다.
-->
<div class="relative flex min-h-0 flex-1 animate-slide-in flex-col lg:mx-auto lg:h-full lg:min-h-[560px] lg:max-w-[1240px] lg:animate-fade-in lg:px-10 lg:pt-6 lg:pb-7">
	<!-- 모바일 헤더 -->
	<div class="flex h-[84px] shrink-0 flex-col pt-1.5 pr-4 pl-1.5 lg:hidden">
		<div class="flex h-[52px] items-center gap-2.5">
			<button type="button" onclick={back} aria-label={mode === 'edit' ? (step < EDITOR_STEPS ? '수정 내용 확인으로' : '나가기') : step > 1 ? '이전 단계' : '나가기'} class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-fg">
				<Icon id="back" size={22} sw={2.2} />
			</button>
			{@render bar('')}
			<div class="min-w-[38px] text-right text-[13px] font-semibold text-white/60 tabular-nums">{step} / {EDITOR_STEPS}</div>
			<button type="button" onclick={() => (exOpen = true)} class="flex h-[34px] shrink-0 items-center gap-[5px] rounded-full border border-accent/40 bg-accent/10 pr-3 pl-2.5 text-[12px] font-extrabold text-accent">
				<Icon id="eye" size={14} sw={2.2} />예시
			</button>
		</div>
		<div class="h-[22px] truncate pl-3.5 text-[12px] font-medium text-white/55">{trail}</div>
	</div>

	<div class="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_460px] lg:items-stretch lg:gap-10">
		<div class="flex min-h-0 min-w-0 flex-1 flex-col">
			<!-- PC 헤더 — 단계 막대는 왼쪽 열 전체 폭, N / 8 은 오른쪽 끝 -->
			<div class="hidden shrink-0 items-center gap-3.5 pb-5 lg:flex">
				<PcBack onclick={back} label={mode === 'edit' ? (step < EDITOR_STEPS ? '수정 내용 확인으로' : '나가기') : step > 1 ? '이전 단계' : '나가기'} />
				<div class="min-w-0 flex-1">
					<p class="truncate text-[12px] font-semibold text-white/50">{trail}</p>
					<div class="mt-2 flex">{@render bar('')}</div>
				</div>
				<div class="shrink-0 text-[13px] font-semibold text-white/60 tabular-nums">{step} / {EDITOR_STEPS}</div>
			</div>

			<!-- 입력 — 모바일·PC 모두 이 영역만 스크롤 (PC 는 포커스 테두리가 잘리지 않게 -4px 여유) -->
			<div bind:this={scroller} class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pt-2 pb-8 lg:-mx-1 lg:-mt-1 lg:px-1 lg:pt-1 lg:pb-2">
				{#if rejectReason}
					<p class="mb-4 rounded-2xl border border-[#ff6b6b]/30 bg-[#ff6b6b]/8 px-4 py-3 text-[13px] leading-[1.55] text-white/80" role="status">
						<b class="font-bold text-[#ff8a8a]">반려 사유</b> · {rejectReason}<br /><span class="text-white/55">고친 뒤 마지막 단계에서 다시 심사 요청해주세요.</span>
					</p>
				{/if}
				{#key step}
					<div class="animate-up-in lg:animate-slide-in">
						{#if step === 1}<StepBasics bind:ed />
						{:else if step === 2}<StepNote bind:ed />
						{:else if step === 3}<StepStory bind:ed />
						{:else if step === 4}<StepIngredients bind:ed />
						{:else if step === 5}<StepHowto bind:ed />
						{:else if step === 6}<StepInfo bind:ed />
						{:else if step === 7}<StepFaq bind:ed />
						{:else}<StepPreview {ed} {mode} {changed} onedit={editStep} />
						{/if}
					</div>
				{/key}
			</div>

			<div class="hidden shrink-0 gap-2.5 border-t border-white/7 pt-4 lg:flex">{@render buttons('w-[120px]')}</div>
		</div>

		<!-- PC 예시 패널 — 왼쪽 열과 같은 높이, 안에서 스크롤 -->
		<aside class="hidden min-h-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0d0e12] lg:flex" aria-label="완성된 상세페이지 예시">
			<div class="flex shrink-0 items-center gap-3 border-b border-white/6 px-6 py-[18px]">
				<span class="rounded-lg bg-accent/14 px-2.5 py-1.5 text-[12px] font-extrabold tracking-[0.06em] text-accent">예시</span>
				<p class="min-w-0 flex-1 text-[16px] font-extrabold">완성된 상세페이지</p>
				<span class="shrink-0 text-[12px] text-white/40">소이 클린의 샵</span>
			</div>
			<ExampleBody {step} class="pb-10" />
		</aside>
	</div>

	<BottomBar>{@render buttons('w-[104px]')}</BottomBar>

	{#if exOpen}
		<ExampleSheet {step} onclose={() => (exOpen = false)} />
	{/if}
</div>
