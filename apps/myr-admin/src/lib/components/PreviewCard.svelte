<script lang="ts">
	import type { Snippet } from 'svelte';

	/** 심사 미리보기 카드(시안 상품 심사) — 머리 [미리보기] 샵에 보이는 상세페이지 · 오른쪽 한 줄(샵 이름 · 바뀐 섹션 수)
	 *  · 경로(홈 / 카테고리 / 상품명) · 가운데 520px 줄에 섹션 칸들 */
	let { right, cat, name, gap = 'gap-7', children }: { right: string; cat: string; name: string; gap?: string; children: Snippet } = $props();
</script>

<section class="overflow-hidden rounded-3xl border border-white/8 bg-white/3">
	<div class="flex items-center gap-3 border-b border-white/7 px-5 py-4 lg:px-6">
		<span class="shrink-0 rounded-[9px] bg-accent/14 px-2.5 py-[5px] text-[12px] font-extrabold text-accent">미리보기</span>
		<h2 class="min-w-0 truncate text-[16px] font-extrabold">샵에 보이는 상세페이지</h2>
		<span class="flex-1"></span>
		<span class="hidden shrink-0 text-[13px] text-white/50 sm:block">{right}</span>
	</div>
	<div class="px-4 pt-4 pb-8 lg:px-6">
		<p class="truncate text-[12.5px] text-white/45">홈 / {cat} / {name}</p>
		<div class="mx-auto mt-6 flex max-w-[520px] flex-col {gap}">
			{@render children()}
		</div>
	</div>
</section>
