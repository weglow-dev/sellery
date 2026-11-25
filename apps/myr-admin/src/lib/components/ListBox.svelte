<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 목록 줄(ListRow)을 담는 상자 — PC 는 둥근 컨테이너 하나에 줄이 선으로 나뉘고, 모바일은 카드 사이 12px. n 이 0 이면 빈 상태 한 줄(§1-2) */
	let { n, empty, children }: { n: number; empty: string; children: Snippet } = $props();
</script>

<div class="mt-4 flex flex-col gap-3 lg:gap-0 lg:overflow-hidden lg:rounded-3xl lg:border lg:border-white/8 lg:bg-white/3">
	{#if n}
		{@render children()}
	{:else}
		<p class="rounded-[20px] border border-white/8 bg-white/3 px-5 py-14 text-center text-[14.5px] text-white/45 lg:rounded-none lg:border-0 lg:bg-transparent lg:py-[72px] lg:text-[15px]">{empty}</p>
	{/if}
</div>
