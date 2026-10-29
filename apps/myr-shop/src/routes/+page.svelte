<script lang="ts">
	import { CATS, CREATORS, PRODUCTS, creatorOf, won } from '$lib/data';
	import Avatar from '$lib/components/Avatar.svelte';
	import CartButton from '$lib/components/CartButton.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ProductCard from '$lib/components/ProductCard.svelte';

	/** 홈 — 히어로 → 카테고리 → 크리에이터 브랜드 → 제품 그리드 (docs/myr.md §4.1 `/`).
	 *  PC(lg): 히어로 + "이번 주 레시피" 카드 2단, 카테고리·브랜드·제품은 auto-fill 그리드 */
	const homeCats = CATS.filter((c) => c.id !== 'all');
	const countOf = (creatorId: string) => PRODUCTS.filter((p) => p.creator === creatorId).length;
	const featured = PRODUCTS[0];
</script>

<div class="animate-up-in pb-5 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-20">
	<header class="flex h-[60px] items-center justify-between px-5 lg:hidden">
		<img src="/myr-logo.svg" alt="MYR" class="block h-8 w-auto" />
		<CartButton />
	</header>

	<section class="px-5 pt-3.5 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] lg:items-stretch lg:gap-4 lg:px-0 lg:pt-0">
		<div class="relative flex min-h-[300px] flex-col justify-end overflow-hidden rounded-[26px] bg-panel p-[22px] lg:min-h-[420px] lg:rounded-[30px] lg:p-10">
			<div class="absolute -top-[90px] -right-[90px] h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,61,.45),rgba(21,22,26,0))] lg:-top-40 lg:-right-[140px] lg:h-[620px] lg:w-[620px]"></div>
			<div class="absolute -top-2.5 -right-2.5 text-[150px] leading-none font-extrabold tracking-[-.06em] text-white/5 select-none lg:-top-[30px] lg:-right-5 lg:text-[260px] lg:text-white/4" aria-hidden="true">MYR</div>
			<p class="relative text-[12px] font-bold tracking-[.08em] text-accent lg:text-[13px] lg:tracking-[.1em]">MAKE YOUR RECIPE</p>
			<h1 class="relative mt-2.5 text-[30px] leading-[1.22] font-extrabold tracking-[-.03em] text-balance lg:mt-3.5 lg:max-w-[560px] lg:text-[48px] lg:leading-[1.15] lg:tracking-[-.035em]">내가 믿는 사람이<br />직접 만든 웰니스</h1>
			<p class="relative mt-2.5 text-[14px] leading-[1.55] text-fg-soft lg:mt-4 lg:max-w-[480px] lg:text-[17px] lg:leading-[1.6]">인플루언서가 레시피부터 패키지까지 직접 고른 제품만 모았어요.</p>
			<div class="relative mt-4 flex flex-wrap items-center gap-2 lg:mt-[26px] lg:gap-4">
				<a href="/category" class="hidden h-[52px] items-center gap-2 rounded-[14px] bg-accent px-6 text-[15px] font-extrabold whitespace-nowrap text-bg transition-colors hover:bg-[#ff8f5c] lg:flex">
					전체 레시피 보기<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
				</a>
				<div class="flex items-center gap-2">
					{#each CREATORS.slice(0, 3) as c, i (c.id)}
						<Avatar bg={c.bg} initial={c.initial} size={30} class="border-2 border-panel {i ? '-ml-2.5' : ''}" />
					{/each}
					<span class="ml-1 text-[12px] whitespace-nowrap text-fg-faint lg:text-[13px]">{CREATORS.length}명의 크리에이터 브랜드</span>
				</div>
			</div>
		</div>
		<!-- PC 전용: 이번 주 레시피 -->
		<a href="/p/{featured.code}" class="relative hidden min-h-[420px] flex-col justify-between overflow-hidden rounded-[30px] border border-white/8 p-7 text-fg lg:flex" style="background:{featured.tile}">
			<span class="flex items-center justify-between"><span class="rounded-full bg-bg/55 px-2.5 py-1.5 text-[12px] font-extrabold backdrop-blur-sm">이번 주 레시피</span><span class="text-[13px] font-bold opacity-85">{creatorOf(featured.creator).name}</span></span>
			<span class="flex flex-1 items-center justify-center text-white/95"><Icon id={featured.ic} size={150} /></span>
			<span class="flex items-end justify-between gap-3"><span><span class="block text-[20px] font-extrabold tracking-[-.02em]">{featured.name}</span><span class="mt-1 block text-[13px] opacity-75">{featured.sub}</span></span><span class="text-[20px] font-extrabold whitespace-nowrap">{won(featured.price)}</span></span>
		</a>
	</section>

	<section class="mt-[26px] lg:mt-11">
		<div class="flex items-baseline justify-between px-5 lg:px-0">
			<h2 class="text-[18px] font-extrabold tracking-[-.02em] lg:text-[24px] lg:tracking-[-.025em]">카테고리</h2>
			<a href="/category" class="text-[13px] font-semibold text-fg-faint hover:text-fg lg:text-[14px]">전체 보기<span class="hidden lg:inline"> →</span></a>
		</div>
		<div class="no-bar mt-3 flex gap-2 overflow-x-auto px-5 lg:mt-4 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(130px,1fr))] lg:gap-3 lg:overflow-visible lg:px-0">
			{#each homeCats as c (c.id)}
				<a
					href="/category?cat={c.id}"
					class="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/4 py-2.5 pr-3.5 pl-2.5 text-fg transition-colors lg:flex-col lg:items-start lg:gap-3.5 lg:rounded-[20px] lg:border-white/8 lg:bg-white/3 lg:p-[18px] lg:hover:border-accent/60 lg:hover:bg-accent/6"
				>
					<span class="flex h-7 w-7 items-center justify-center rounded-[9px] bg-white/6 text-white/90 lg:h-11 lg:w-11 lg:rounded-[13px] lg:[&>svg]:h-[22px] lg:[&>svg]:w-[22px]"><Icon id={c.ic} size={20} /></span>
					<span class="text-[14px] font-bold lg:text-[15px]">{c.name}</span>
				</a>
			{/each}
		</div>
	</section>

	<section class="mt-7 lg:mt-11">
		<div class="flex items-baseline justify-between px-5 lg:px-0">
			<h2 class="text-[18px] font-extrabold tracking-[-.02em] lg:text-[24px] lg:tracking-[-.025em]">지금 뜨는 브랜드</h2>
		</div>
		<div class="no-bar mt-3 flex gap-2.5 overflow-x-auto px-5 lg:mt-4 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] lg:gap-3 lg:overflow-visible lg:px-0">
			{#each CREATORS as cr (cr.id)}
				<a
					href="/category?creator={cr.id}"
					class="flex w-[150px] shrink-0 flex-col gap-2.5 rounded-[20px] border border-white/8 bg-white/3 p-3.5 text-left text-fg transition-colors lg:w-auto lg:flex-row lg:items-center lg:gap-4 lg:rounded-[22px] lg:p-5 lg:hover:border-white/25"
				>
					<Avatar bg={cr.bg} initial={cr.initial} size={44} class="lg:h-14 lg:w-14 lg:text-[18px]" />
					<span class="min-w-0">
						<span class="block text-[15px] font-bold lg:text-[16px]">{cr.name}</span>
						<span class="mt-0.5 block text-[12px] text-fg-faint lg:text-[13px]">{cr.handle}</span>
						<span class="mt-2.5 block text-[12px] font-bold text-accent lg:mt-1.5">{countOf(cr.id)}개 제품</span>
					</span>
				</a>
			{/each}
		</div>
	</section>

	<section class="mt-7 lg:mt-11">
		<div class="flex items-baseline justify-between px-5 lg:px-0">
			<h2 class="text-[18px] font-extrabold tracking-[-.02em] lg:text-[24px] lg:tracking-[-.025em]">새로 나온 레시피</h2>
			<span class="text-[13px] text-fg-faint lg:text-[14px]">{PRODUCTS.length}개</span>
		</div>
		<div class="mt-3 grid grid-cols-2 gap-2.5 px-5 lg:mt-4 lg:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] lg:gap-3.5 lg:px-0">
			{#each PRODUCTS as p (p.id)}
				<ProductCard {p} />
			{/each}
		</div>
	</section>
</div>
