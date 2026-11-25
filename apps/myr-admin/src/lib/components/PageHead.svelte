<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 목록 화면 머리 — 제목 · 요약 한 줄 · 오른쪽 버튼 (§1-2 목록 화면). 모바일도 제목을 본문 맨 위에(머리는 로고만 · 시안 "MYR Admin") */
	let { title, sum, actions }: { title: string; sum?: Snippet; actions?: Snippet } = $props();
</script>

<div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
	<div class="min-w-0">
		<h1 class="mt-1.5 text-[26px] font-extrabold tracking-[-0.03em] lg:mt-0 lg:tracking-[-0.02em]">{title}</h1>
		{#if sum}<p class="mt-1.5 text-[13px] text-white/60 lg:mt-1 lg:text-[14px]">{@render sum()}</p>{/if}
	</div>
	{#if actions}<div class="flex items-center gap-2">{@render actions()}</div>{/if}
</div>
