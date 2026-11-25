<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 심사 미리보기 카드(시안 상품 심사) — 머리 [미리보기] 샵에 보이는 상세페이지 · 오른쪽 한 줄(샵 이름 · 바뀐 섹션 수)
	 *  · 경로(홈 / 카테고리 / 상품명) · 가운데 520px 줄에 섹션 칸들.
	 *  모바일(시안 "MYR Admin"): 경로 없음 · 오른쪽 한 줄은 rightMobile 이면 본문 맨 위에(수정 심사 "바뀐 섹션 N개 …") */
	let { right, rightMobile = false, cat, name, gap = 'gap-[26px] lg:gap-7', children }: { right: string; rightMobile?: boolean; cat: string; name: string; gap?: string; children: Snippet } = $props();
</script>

<section class="overflow-hidden rounded-3xl border border-white/8 bg-white/3">
	<div class="flex items-center gap-2.5 border-b border-white/7 px-4 py-3.5 lg:gap-3 lg:px-6 lg:py-4">
		<span class="shrink-0 rounded-lg bg-accent/14 px-[9px] py-1 text-[11.5px] font-extrabold text-accent lg:rounded-[9px] lg:px-2.5 lg:py-[5px] lg:text-[12px]">미리보기</span>
		<h2 class="min-w-0 truncate text-[15px] font-extrabold lg:text-[16px]">샵에 보이는 상세페이지</h2>
		<span class="flex-1"></span>
		<span class="hidden shrink-0 text-[13px] text-white/50 lg:block">{right}</span>
	</div>
	<div class="px-3 pt-6 pb-5 lg:px-6 lg:pt-4 lg:pb-8">
		<p class="hidden truncate text-[12.5px] text-white/45 lg:block">홈 / {cat} / {name}</p>
		{#if rightMobile}<p class="-mt-2.5 mb-2.5 px-1 text-[12.5px] text-white/50 lg:hidden">{right}</p>{/if}
		<div class="mx-auto flex max-w-[520px] flex-col lg:mt-6 {gap}">
			{@render children()}
		</div>
	</div>
</section>
