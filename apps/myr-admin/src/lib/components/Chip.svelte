<script lang="ts">
	import type { Tone } from '$lib/mock/types';
	import { CHIP_CLS } from '$lib/tone';

	/** 상태 칩 — 이름 · 색은 서버 값(용어집 §1-3). 기본 12px · lg 는 상세 서랍 머리 */
	let { label, tone, lg = false, dot = false }: { label: string; tone: Tone; lg?: boolean; dot?: boolean } = $props();
</script>

<span class="inline-flex items-center gap-1.5 whitespace-nowrap font-extrabold {lg ? 'rounded-lg px-2.5 py-[5px] text-[13px]' : 'rounded-md px-2 py-[3px] text-[12px]'} {CHIP_CLS[tone]}">
	{#if dot}<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-current"></span>{/if}
	{label}
</span>
