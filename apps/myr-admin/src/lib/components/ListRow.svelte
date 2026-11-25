<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Chip as ChipT, Tone } from '$lib/mock/types';
	import { NOTE_CLS } from '$lib/tone';
	import Avatar from './Avatar.svelte';
	import Chip from './Chip.svelte';
	import CopyButton from './CopyButton.svelte';
	import Icon from './Icon.svelte';
	import MaskValue from './MaskValue.svelte';
	import ProductThumb from './ProductThumb.svelte';

	/** 목록 줄 — 시안 "MYR Admin PC" 목록 줄(타일 · 칩 + 메타 · 제목 · 설명(+보기 · 복사) · 진행 막대 · 오른쪽 값 · 버튼 · ›).
	 *  PC(lg~)는 92px 가로 줄(ListBox 가 둥근 컨테이너 · 줄 사이 선), 모바일은 카드(칩 줄 → 타일 + 제목 → 막대 → 값 상자 → 버튼).
	 *  줄 전체를 누르면 href 로 가거나 onopen — 제목이 링크이고 after: 오버레이로 줄 전체를 덮는다 · 줄 안 버튼은 relative z-[1].
	 *  buttons 스니펫은 full(모바일 · 버튼이 가로를 나눠 채움)을 받는다. 칩 · 문구 · 색은 서버(목) 값 */
	let {
		href,
		onopen,
		thumb,
		avatar,
		tileText,
		chips = [],
		meta,
		title,
		sub,
		mask,
		copy,
		bar,
		right,
		rightSub,
		rightTone = 'plain',
		rightSubTone = 'grey',
		buttons,
		selected = false
	}: {
		href?: string;
		onopen?: () => void;
		thumb?: { tile: string; icon: string };
		avatar?: { initial: string; bg: string; light?: boolean };
		tileText?: string;
		chips?: ChipT[];
		meta?: string;
		title: string;
		sub?: string;
		/** 가린 값 + [보기] — sub 뒤에 붙는다 */
		mask?: { masked: string; raw: string; what?: string };
		/** [복사] — sub 뒤 */
		copy?: { text: string; what: string };
		bar?: { pct: number; text: string };
		right?: string;
		rightSub?: string;
		/** plain = 흰색 · grey = 흐리게(값이 없을 때) */
		rightTone?: 'plain' | 'grey' | Tone;
		rightSubTone?: Tone;
		buttons?: Snippet<[boolean]>;
		selected?: boolean;
	} = $props();

	const hasTop = $derived(chips.length > 0 || !!meta);
	const openable = $derived(!!href || !!onopen);
	const RIGHT: Record<string, string> = { ...NOTE_CLS, plain: 'text-fg', grey: 'text-white/45' };
</script>

{#snippet tile(size: number, radius: number)}
	{#if thumb}
		<ProductThumb tile={thumb.tile} icon={thumb.icon} {size} {radius} />
	{:else if avatar}
		{#if avatar.light}
			<span class="flex shrink-0 items-center justify-center rounded-full bg-[#2a2c33] font-extrabold text-white/70" style:width="{size}px" style:height="{size}px" style:font-size="{Math.round(size * 0.36)}px" aria-hidden="true">{avatar.initial}</span>
		{:else}
			<Avatar initial={avatar.initial} bg={avatar.bg} {size} />
		{/if}
	{:else if tileText}
		<span class="flex shrink-0 items-center justify-center bg-white/6 text-[15px] font-extrabold" style:width="{size}px" style:height="{size}px" style:border-radius="{radius}px" aria-hidden="true">{tileText}</span>
	{/if}
{/snippet}

{#snippet titleEl(cls: string)}
	{#if href}
		<a {href} class="block truncate {cls} after:absolute after:inset-0">{title}</a>
	{:else if onopen}
		<button type="button" onclick={onopen} class="block w-full truncate text-left {cls} after:absolute after:inset-0">{title}</button>
	{:else}
		<p class="truncate {cls}">{title}</p>
	{/if}
{/snippet}

{#snippet subEl()}
	{#if sub || mask || copy}
		<div class="flex min-w-0 items-center gap-2">
			{#if sub}<span class="min-w-0 truncate text-[13px] text-white/55 tabular-nums">{sub}</span>{/if}
			{#if mask}<span class="text-[13px] text-white/55"><MaskValue masked={mask.masked} raw={mask.raw} what={mask.what} /></span>{/if}
			{#if copy}<CopyButton text={copy.text} what={copy.what} />{/if}
		</div>
	{/if}
{/snippet}

{#snippet barEl()}
	{#if bar}
		<div class="flex items-center gap-2.5">
			<span class="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-white/9"><span class="block h-full rounded-[3px] bg-accent" style:width="{bar.pct}%"></span></span>
			<span class="shrink-0 text-[12.5px] font-semibold text-white/60 tabular-nums">{bar.text}</span>
		</div>
	{/if}
{/snippet}

<!-- PC 줄 -->
<div class="relative hidden min-h-[92px] items-center gap-4 border-t border-white/6 py-4 pr-5 pl-6 transition-colors first:border-t-0 lg:flex {openable ? 'hover:bg-white/4' : ''} {selected ? 'bg-white/5' : ''}">
	{@render tile(56, 16)}
	<div class="flex min-w-0 flex-1 flex-col gap-1">
		{#if hasTop}
			<div class="flex min-w-0 items-center gap-1.5">
				{#each chips as c (c.label)}<Chip label={c.label} tone={c.tone} />{/each}
				{#if meta}<span class="min-w-0 truncate text-[12px] text-white/45 tabular-nums">{meta}</span>{/if}
			</div>
		{/if}
		{@render titleEl('text-[16px] font-bold tracking-[-0.01em]')}
		{@render subEl()}
	</div>
	{#if bar}<div class="w-[168px] shrink-0">{@render barEl()}</div>{/if}
	{#if right !== undefined}
		<div class="min-w-[120px] shrink-0 text-right">
			<p class="text-[17px] font-extrabold tracking-[-0.02em] tabular-nums {RIGHT[rightTone]}">{right}</p>
			{#if rightSub}<p class="mt-[3px] text-[12.5px] tabular-nums {NOTE_CLS[rightSubTone]}">{rightSub}</p>{/if}
		</div>
	{/if}
	{#if buttons}
		<div class="relative z-[1] flex shrink-0 justify-end gap-1.5">{@render buttons(false)}</div>
	{:else if openable}
		<span class="shrink-0 text-white/40" aria-hidden="true"><Icon id="chev" size={18} sw={2.2} /></span>
	{/if}
</div>

<!-- 모바일 카드 -->
<div class="relative flex flex-col gap-3 rounded-[20px] border bg-white/3 p-4 lg:hidden {selected ? 'border-accent/50' : 'border-white/8'}">
	{#if hasTop || (right !== undefined && !rightSub)}
		<div class="flex min-w-0 items-center gap-1.5">
			{#each chips as c (c.label)}<Chip label={c.label} tone={c.tone} />{/each}
			<span class="min-w-0 flex-1 truncate text-[12px] text-white/45 tabular-nums">{meta ?? ''}</span>
			{#if right !== undefined && !rightSub}<span class="shrink-0 text-[15px] font-extrabold tracking-[-0.02em] tabular-nums {RIGHT[rightTone]}">{right}</span>{/if}
		</div>
	{/if}
	<div class="flex items-center gap-3">
		{@render tile(48, 14)}
		<div class="min-w-0 flex-1">
			{@render titleEl('text-[15px] font-bold')}
			<div class="mt-[3px]">{@render subEl()}</div>
		</div>
		{#if openable && !buttons}<span class="shrink-0 text-white/40" aria-hidden="true"><Icon id="chev" size={18} sw={2.2} /></span>{/if}
	</div>
	{@render barEl()}
	{#if right !== undefined && rightSub}
		<div class="flex items-center justify-between gap-3 rounded-[14px] bg-white/4 px-3.5 py-3">
			<span class="min-w-0 truncate text-[12.5px] tabular-nums {NOTE_CLS[rightSubTone]}">{rightSub}</span>
			<span class="shrink-0 text-[16px] font-extrabold tracking-[-0.02em] tabular-nums {RIGHT[rightTone]}">{right}</span>
		</div>
	{/if}
	{#if buttons}
		<div class="relative z-[1] flex gap-2 [&>*]:min-w-0 [&>*]:flex-1">{@render buttons(true)}</div>
	{/if}
</div>
