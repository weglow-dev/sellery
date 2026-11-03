<script lang="ts">
	import { ME, TILE_BG, TILE_ICON, type ProductDraft } from '$lib/data';
	import { parsePrice, previewSections, won } from '$lib/rules';
	import CheckDot from '../CheckDot.svelte';
	import Icon from '../Icon.svelte';
	import StepHead from './StepHead.svelte';

	/** 8단계 미리보기 · 제출 — 샵 상세페이지 순서대로 요약하고, 섹션마다 [수정] 으로 그 단계에 간다.
	 *  모바일: 카드 하나 안에 섹션 목록 · 아래 안내 / PC(lg~): 왼쪽 카드(사진 · 이름 · 가격 · 노트) · 오른쪽 섹션 목록 + 안내 */
	let { ed, onedit }: { ed: ProductDraft; onedit: (step: number) => void } = $props();

	const price = $derived(parsePrice(ed.price));
	const chips = $derived(ed.chips.map((c) => c.trim()).filter(Boolean));
	const note = $derived(ed.note.trim());
	const sections = $derived(previewSections(ed));
</script>

{#snippet sectionList(cls: string)}
	<div class="flex-col gap-2.5 {cls}">
		{#each sections as sec (sec.key)}
			<div class="flex items-center gap-2.5 rounded-[14px] border border-white/7 bg-white/3 px-3.5 py-3">
				<CheckDot on={sec.filled} size={20} />
				<span class="min-w-0 flex-1">
					<span class="block text-[13px] font-bold {sec.filled ? 'text-fg' : 'text-white/60'}">{sec.name}</span>
					<span class="block truncate text-[12px] text-white/50">{sec.summary}</span>
				</span>
				<button type="button" onclick={() => onedit(sec.step)} class="shrink-0 p-1.5 text-[12px] font-bold text-accent">수정</button>
			</div>
		{/each}
	</div>
{/snippet}

{#snippet notice(cls: string)}
	<div class="rounded-2xl border border-white/7 bg-white/3 px-4 py-3.5 text-[13px] leading-[1.55] text-white/65 {cls}">
		제출하면 MYR 운영팀이 표시·광고 문구를 검토해요. 보통 영업일 1~2일 안에 승인되고, 수정이 필요하면 알림으로 알려드려요.
	</div>
{/snippet}

<StepHead n={8} name="미리보기 · 제출" title={'팔로워에게\n이렇게 보여요'} desc="샵 상세페이지 순서 그대로예요. 비어 있는 섹션은 샵에서 숨겨져요." />

<div class="mt-[18px] lg:mt-5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
	<div class="overflow-hidden rounded-3xl border border-white/8 bg-white/2">
		<div class="relative flex aspect-[16/10] items-center justify-center text-white/95" style:background={ed.images[0] ? undefined : TILE_BG[ed.tile]}>
			{#if ed.images[0]}
				<img src={ed.images[0]} alt="" class="absolute inset-0 h-full w-full object-cover" />
			{:else}
				<Icon id={TILE_ICON[ed.tile]} set="tile" size={110} />
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
		<div class="p-4">
			<p class="text-[11px] font-bold text-accent">{ME.name}</p>
			<p class="mt-1 text-[18px] font-extrabold tracking-[-0.02em]">{ed.name.trim() || '제품명을 입력하면 여기에 보여요'}</p>
			<p class="mt-2.5 text-[18px] font-extrabold">{price ? won(price) : '₩ —'} <span class="text-[12px] font-medium text-white/45">{ed.unit}</span></p>
			<div class="mt-3.5 rounded-[14px] border border-accent/20 bg-accent/8 p-3.5">
				<p class="text-[11px] font-bold text-accent">레시피 노트</p>
				<p class="mt-1.5 text-[14px] leading-[1.55] text-white/85">"{note || '레시피 노트가 여기에 들어가요'}"</p>
			</div>
			{@render sectionList('mt-3.5 flex lg:hidden')}
		</div>
	</div>
	<div class="hidden flex-col gap-2.5 lg:flex">
		{@render sectionList('flex')}
		{@render notice('')}
	</div>
</div>

{@render notice('mt-3.5 lg:hidden')}
