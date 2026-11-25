<script lang="ts">
	import type { Chip as ChipT } from '$lib/mock/types';
	import Avatar from './Avatar.svelte';
	import Chip from './Chip.svelte';
	import Icon from './Icon.svelte';
	import ProductThumb from './ProductThumb.svelte';

	/** 상세 화면 머리(시안 detail) — [뒤로] · 타일/아바타 · 제목 · (오른쪽) 칩 · 설명. PC 는 한 줄(제목 28px), 모바일은 제목 22px 아래에 칩 줄 */
	let { back, backLabel, title, sub, chips = [], thumb, avatar }: { back: string; backLabel: string; title: string; sub?: string; chips?: ChipT[]; thumb?: { tile: string; icon: string }; avatar?: { initial: string; bg: string } } = $props();
</script>

<div class="flex flex-wrap items-center gap-x-3.5 gap-y-2 lg:min-h-[52px] lg:flex-nowrap">
	<a href={back} aria-label={backLabel} class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 hover:bg-white/6"><Icon id="back" size={18} sw={2.2} /></a>
	{#if thumb}<span class="hidden lg:block"><ProductThumb tile={thumb.tile} icon={thumb.icon} size={48} radius={14} /></span>{/if}
	{#if avatar}<span class="hidden lg:block"><Avatar initial={avatar.initial} bg={avatar.bg} size={48} /></span>{/if}
	<h1 class="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-[-0.03em] lg:flex-none lg:text-[28px]">{title}</h1>
	<span class="hidden flex-1 lg:block"></span>
	<div class="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0">
		{#each chips as c (c.label)}<Chip label={c.label} tone={c.tone} lg />{/each}
		{#if sub}<span class="ml-1 text-[13px] text-white/50 tabular-nums lg:text-[14px]">{sub}</span>{/if}
	</div>
</div>
