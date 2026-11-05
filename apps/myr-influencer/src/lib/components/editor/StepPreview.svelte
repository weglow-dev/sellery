<script lang="ts">
	import { page } from '$app/state';
	import type { Me, ProductDraft } from '$lib/data';
	import { draftVisual } from '$lib/product-draft';
	import { MODE_COPY, type CopyKey } from '$lib/product-edit';
	import { parsePrice, previewSections, won, type SectionKey } from '$lib/rules';
	import CheckDot from '../CheckDot.svelte';
	import Icon from '../Icon.svelte';
	import StepHead from './StepHead.svelte';

	/** 8단계 미리보기 · 제출 — 샵 상세페이지 순서대로 요약하고, 섹션마다 [수정] 으로 그 단계에 간다.
	 *  수정 모드(4-2)는 "수정 내용 확인" — 바꾼 섹션에 "변경됨" · 안내 문구가 "판매는 계속돼요"(시안 isEdit · product-edit MODE_COPY).
	 *  모바일: 카드 하나 안에 섹션 목록 · 아래 안내 / PC(lg~ · 시안 "… PC" E8): 2열 같은 높이 — 왼쪽 카드(사진 · 이름 · 가격 · 노트)가 늘어나고
	 *  오른쪽 섹션 줄이 그 높이를 나눠 채운다(최소 52px) · 안내는 두 열 아래 전체 폭 + ⓘ
	 *  반려 고치기(시안 isFix)는 운영팀 의견이 달렸는데 아직 안 바꾼 섹션에 "수정 필요"(flagged). */
	let {
		ed,
		onedit,
		copyKey = 'new',
		changed = null,
		flagged = null
	}: { ed: ProductDraft; onedit: (step: number) => void; copyKey?: CopyKey; changed?: Record<SectionKey, boolean> | null; flagged?: Partial<Record<SectionKey, boolean>> | null } = $props();
	const copy = $derived(MODE_COPY[copyKey]);
	/** 로그인한 크리에이터 — 미리보기에 실제 활동명 · 핸들 · 아바타 색 */
	const me = $derived(page.data.me as Me);

	const price = $derived(parsePrice(ed.price));
	const chips = $derived(ed.chips.map((c) => c.trim()).filter(Boolean));
	const note = $derived(ed.note.trim());
	const sections = $derived(previewSections(ed));
</script>

{#snippet sectionList(cls: string, rowCls: string)}
	<div class="flex-col {cls}">
		{#each sections as sec (sec.key)}
			<div class="flex items-center border border-white/7 bg-white/3 {rowCls}">
				<CheckDot on={sec.filled} size={20} />
				<span class="min-w-0 flex-1">
					<span class="flex items-center gap-1.5 text-[13px] font-bold {sec.filled ? 'text-fg' : 'text-white/60'}">{sec.name}{#if changed?.[sec.key]}<span class="rounded-[5px] bg-accent/16 px-1.5 py-0.5 text-[10px] font-extrabold text-accent">변경됨</span>{/if}{#if flagged?.[sec.key]}<span class="rounded-[5px] bg-[#ff6b6b]/14 px-1.5 py-0.5 text-[10px] font-extrabold text-[#ff8a8a]">수정 필요</span>{/if}</span>
					<span class="block truncate text-[12px] text-white/50">{sec.summary}</span>
				</span>
				<button type="button" onclick={() => onedit(sec.step)} class="shrink-0 p-1.5 text-[12px] font-bold text-accent transition-colors lg:h-8 lg:rounded-[10px] lg:px-2.5 lg:py-0 lg:hover:bg-accent/10">수정</button>
			</div>
		{/each}
	</div>
{/snippet}

{#snippet notice(cls: string)}
	<div class="rounded-2xl border border-white/7 bg-white/3 px-4 py-3.5 text-[13px] leading-[1.55] text-white/65 lg:items-center lg:gap-3 lg:px-5 lg:py-4 {cls}">
		<svg class="hidden shrink-0 lg:block" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
		<span>{copy.step8Notice}</span>
	</div>
{/snippet}

<StepHead n={8} name={copy.step8Name} title={copy.step8Title} desc={copy.step8Desc} />

<div class="mt-[18px] lg:mt-6 lg:grid lg:grid-cols-2 lg:items-stretch lg:gap-4">
	<div class="overflow-hidden rounded-3xl border border-white/8 bg-white/2 lg:flex lg:flex-col lg:rounded-[20px]">
		<div class="relative flex aspect-[16/10] items-center justify-center text-white/95" style:background={ed.images[0] ? undefined : draftVisual(ed).tile}>
			{#if ed.images[0]}
				<img src={ed.images[0]} alt="" class="absolute inset-0 h-full w-full object-cover" />
			{:else}
				<Icon id={draftVisual(ed).icon} set="tile" size={110} />
			{/if}
			{#if ed.images.length > 1}
				<span class="absolute top-3 right-3 rounded-full bg-bg/60 px-[9px] py-1 text-[11px] font-bold">1/{ed.images.length}</span>
			{/if}
			<div class="absolute bottom-3 left-3.5 flex gap-1.5">
				{#each chips.length ? chips : ['태그'] as ch, i (i)}
					<span class="rounded-full bg-bg/55 px-2.5 py-[5px] text-[11px] font-bold">{ch}</span>
				{/each}
			</div>
		</div>
		<div class="p-4 lg:flex-1 lg:p-5">
			<p class="text-[11px] font-bold text-accent">{me.name}</p>
			<p class="mt-1 text-[18px] font-extrabold tracking-[-0.02em]">{ed.name.trim() || '제품명을 입력하면 여기에 보여요'}</p>
			<p class="mt-2.5 text-[18px] font-extrabold">{price ? won(price) : '₩ —'} <span class="text-[12px] font-medium text-white/45">{ed.unit}</span></p>
			<div class="mt-3.5 rounded-[14px] border border-accent/20 bg-accent/8 p-3.5">
				<p class="text-[11px] font-bold text-accent">레시피 노트</p>
				<p class="mt-1.5 text-[14px] leading-[1.55] text-white/85">"{note || '레시피 노트가 여기에 들어가요'}"</p>
			</div>
			{@render sectionList('mt-3.5 flex gap-2.5 lg:hidden', 'gap-2.5 rounded-[14px] px-3.5 py-3')}
		</div>
	</div>
	{@render sectionList('hidden min-h-0 gap-2 lg:flex', 'min-h-[52px] flex-[1_1_0] gap-3 rounded-2xl py-0 pr-2 pl-4')}
	{@render notice('hidden lg:col-span-2 lg:flex')}
</div>

{@render notice('mt-3.5 lg:hidden')}
