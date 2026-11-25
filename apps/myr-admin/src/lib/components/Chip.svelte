<script lang="ts">
	import type { Tone } from '$lib/mock/types';
	import { CHIP_CLS } from '$lib/tone';

	/** 상태 칩 — 이름 · 색은 서버 값(용어집 §1-3). 기본 11px(표 · 목록 줄 · 시안) · md 12px(상세 머리 · 카드 머리) · lg 13px(상세 서랍 머리) */
	let { label, tone, md = false, lg = false, dot = false }: { label: string; tone: Tone; md?: boolean; lg?: boolean; dot?: boolean } = $props();
</script>

<span class="inline-flex items-center gap-1.5 whitespace-nowrap font-extrabold {lg ? 'rounded-lg px-2.5 py-[5px] text-[13px]' : md ? 'rounded-lg px-[9px] py-1 text-[12px] leading-[1.3]' : 'rounded-md px-[7px] py-[3px] text-[11px]'} {CHIP_CLS[tone]}">
	{#if dot}<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-current"></span>{/if}
	{label}
</span>
