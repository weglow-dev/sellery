<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 목록 화면 머리 — 요약 한 줄(왼쪽) · 버튼(오른쪽) (§1-2 목록 화면). 큰 제목은 보이지 않는다(2026-11-26 — PC 상단 메뉴 · 하단 탭에 이름이 있어서 · 주문 · CS 와 같게) — 제목은 화면 읽기용 h1 로만 남긴다.
	 *  요약도 버튼도 없으면 h1 만 남고 화면에는 아무것도 안 그린다 */
	let { title, sum, actions }: { title: string; sum?: Snippet; actions?: Snippet } = $props();
</script>

<h1 class="sr-only">{title}</h1>
{#if sum || actions}
	<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 lg:min-h-[44px]">
		{#if sum}<p class="min-w-0 text-[13px] text-white/60 lg:text-[14px]">{@render sum()}</p>{:else}<span></span>{/if}
		{#if actions}<div class="flex items-center gap-2">{@render actions()}</div>{/if}
	</div>
{/if}
