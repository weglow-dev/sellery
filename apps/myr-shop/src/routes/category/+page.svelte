<script lang="ts">
	import { CATS } from '$lib/data';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import ProductCard from '$lib/components/ProductCard.svelte';
	import ProductRow from '$lib/components/ProductRow.svelte';

	/** 카테고리 — `?cat=<id>` 탭 · `?creator=<handle>` 크리에이터별 보기. 필터는 +page.server.ts 가 적용하고 상태는 URL 에만.
	 *  모바일: 가로 칩 + 세로 행 카드 · PC: 왼쪽 200px 사이드바 + 4:3 카드 그리드 */
	let { data } = $props();
	const tabHref = (id: string) => `/category?cat=${id}${data.creatorParam ? `&creator=${data.creatorParam}` : ''}`;
</script>

<svelte:head><title>{data.title} — MYR Shop</title></svelte:head>

<div class="flex animate-slide-in flex-col lg:mx-auto lg:grid lg:max-w-[1240px] lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start lg:gap-8 lg:px-10 lg:pt-7 lg:pb-20">
	<BackHeader title={data.title} home>
		{#snippet right()}<span class="text-[13px] text-fg-faint">{data.list.length}개</span>{/snippet}
	</BackHeader>

	<!-- 필터: 모바일 가로 칩 / PC 세로 사이드바 -->
	<nav class="no-bar flex shrink-0 gap-2 overflow-x-auto px-5 pt-1.5 pb-3.5 lg:sticky lg:top-[100px] lg:flex-col lg:gap-1 lg:overflow-visible lg:p-0" aria-label="카테고리 필터">
		<p class="mb-2.5 ml-3 hidden text-[12px] font-bold tracking-[.06em] text-white/45 lg:block">카테고리</p>
		{#each CATS as c (c.id)}
			{@const on = c.id === data.cat}
			<a
				href={tabHref(c.id)}
				aria-current={on ? 'page' : undefined}
				data-sveltekit-replacestate
				data-sveltekit-noscroll
				class="shrink-0 rounded-full border px-3.5 py-[9px] text-[13px] font-bold transition-all lg:flex lg:h-11 lg:items-center lg:rounded-xl lg:px-3.5 lg:py-0 lg:text-[14px] {on ? 'border-accent bg-accent text-bg' : 'border-white/10 text-white/80'}"
			>
				{c.name}
			</a>
		{/each}
	</nav>

	<div class="px-5 pb-5 lg:min-w-0 lg:px-0 lg:pb-0">
		<div class="hidden items-baseline justify-between lg:flex">
			<h1 class="text-[32px] font-extrabold tracking-[-.03em]">{data.title}</h1>
			<span class="text-[14px] text-fg-faint">{data.list.length}개 제품</span>
		</div>
		<div class="flex flex-col gap-2.5 lg:hidden">
			{#each data.list as p (p.code)}
				<ProductRow {p} />
			{/each}
		</div>
		<div class="hidden lg:mt-5 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] lg:gap-3.5">
			{#each data.list as p (p.code)}
				<ProductCard {p} wide />
			{/each}
		</div>
		{#if data.list.length === 0}
			<div class="py-[60px] text-center text-[14px] text-fg-faint lg:py-[100px] lg:text-[15px]">아직 이 카테고리엔 제품이 없어요.<br />곧 새로운 레시피가 올라와요.</div>
		{/if}
	</div>
</div>
