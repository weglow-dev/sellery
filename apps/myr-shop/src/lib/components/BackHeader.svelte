<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goBack } from '$lib/nav';

	/** 카테고리 · 장바구니 · 결제의 60px 헤더 — [뒤로] · 제목 · 오른쪽 보조(개수 등) */
	let { title, right, home = false }: { title: string; right?: Snippet; home?: boolean } = $props();
</script>

<div class="flex h-[60px] shrink-0 items-center gap-2 pr-5 pl-1.5">
	{#if home}
		<a href="/" aria-label="뒤로" class="flex h-11 w-11 items-center justify-center text-fg">
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
		</a>
	{:else}
		<button type="button" onclick={goBack} aria-label="뒤로" class="flex h-11 w-11 items-center justify-center text-fg">
			<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
		</button>
	{/if}
	<span class="flex-1 text-[16px] font-bold">{title}</span>
	{#if right}{@render right()}{/if}
</div>
