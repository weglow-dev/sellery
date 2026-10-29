<script lang="ts">
	import { CATS, CREATORS, PRODUCTS } from '$lib/data';
	import Avatar from '$lib/components/Avatar.svelte';
	import CartButton from '$lib/components/CartButton.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ProductCard from '$lib/components/ProductCard.svelte';

	/** 홈 — 히어로 → 카테고리 칩 → 크리에이터 브랜드 → 제품 그리드 (docs/myr.md §4.1 `/`) */
	const homeCats = CATS.filter((c) => c.id !== 'all');
	const countOf = (creatorId: string) => PRODUCTS.filter((p) => p.creator === creatorId).length;
</script>

<div class="animate-up-in pb-[110px]">
	<header class="flex h-[60px] items-center justify-between px-5">
		<img src="/myr-logo.svg" alt="MYR" class="block h-8 w-auto" />
		<CartButton />
	</header>

	<section class="px-5 pt-3.5">
		<div class="relative flex min-h-[300px] flex-col justify-end overflow-hidden rounded-[26px] bg-panel p-[22px]">
			<div class="absolute -top-[90px] -right-[90px] h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,.45),rgba(21,22,26,0))]"></div>
			<div class="absolute -top-2.5 -right-2.5 text-[150px] leading-none font-extrabold tracking-[-.06em] text-white/5 select-none" aria-hidden="true">MYR</div>
			<p class="relative text-[12px] font-bold tracking-[.08em] text-accent">MAKE YOUR RECIPE</p>
			<h1 class="relative mt-2.5 text-[30px] leading-[1.22] font-extrabold tracking-[-.03em] text-balance">내가 믿는 사람이<br />직접 만든 웰니스</h1>
			<p class="relative mt-2.5 text-[14px] leading-[1.55] text-fg-soft">인플루언서가 레시피부터 패키지까지 직접 고른 제품만 모았어요.</p>
			<div class="relative mt-4 flex items-center gap-2">
				{#each CREATORS.slice(0, 3) as c, i (c.id)}
					<Avatar bg={c.bg} initial={c.initial} size={30} class="border-2 border-panel {i ? '-ml-2.5' : ''}" />
				{/each}
				<span class="ml-1 text-[12px] text-fg-faint">{CREATORS.length}명의 크리에이터 브랜드</span>
			</div>
		</div>
	</section>

	<section class="mt-[26px]">
		<div class="flex items-baseline justify-between px-5">
			<h2 class="text-[18px] font-extrabold tracking-[-.02em]">카테고리</h2>
			<a href="/category" class="text-[13px] font-semibold text-fg-faint">전체 보기</a>
		</div>
		<div class="no-bar mt-3 flex gap-2 overflow-x-auto px-5">
			{#each homeCats as c (c.id)}
				<a href="/category?cat={c.id}" class="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/4 py-2.5 pr-3.5 pl-2.5 text-fg">
					<span class="flex h-7 w-7 items-center justify-center rounded-[9px] bg-white/6 text-white/90"><Icon id={c.ic} size={20} /></span>
					<span class="text-[14px] font-bold">{c.name}</span>
				</a>
			{/each}
		</div>
	</section>

	<section class="mt-7">
		<div class="flex items-baseline justify-between px-5">
			<h2 class="text-[18px] font-extrabold tracking-[-.02em]">지금 뜨는 브랜드</h2>
		</div>
		<div class="no-bar mt-3 flex gap-2.5 overflow-x-auto px-5">
			{#each CREATORS as cr (cr.id)}
				<a href="/category?creator={cr.id}" class="flex w-[150px] shrink-0 flex-col gap-2.5 rounded-[20px] border border-white/8 bg-white/3 p-3.5 text-left text-fg">
					<Avatar bg={cr.bg} initial={cr.initial} size={44} />
					<span><span class="block text-[15px] font-bold">{cr.name}</span><span class="mt-0.5 block text-[12px] text-fg-faint">{cr.handle}</span></span>
					<span class="text-[12px] font-bold text-accent">{countOf(cr.id)}개 제품</span>
				</a>
			{/each}
		</div>
	</section>

	<section class="mt-7">
		<div class="flex items-baseline justify-between px-5">
			<h2 class="text-[18px] font-extrabold tracking-[-.02em]">새로 나온 레시피</h2>
			<span class="text-[13px] text-fg-faint">{PRODUCTS.length}개</span>
		</div>
		<div class="mt-3 grid grid-cols-2 gap-2.5 px-5">
			{#each PRODUCTS as p (p.id)}
				<ProductCard {p} />
			{/each}
		</div>
	</section>
</div>
