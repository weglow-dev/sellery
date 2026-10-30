<script lang="ts">
	import { DETAIL_ANCHORS, catName, handleSlug, infoRowsOf, won } from '$lib/data';
	import { goBack } from '$lib/nav';
	import { shop } from '$lib/state.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import CartButton from '$lib/components/CartButton.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import QtyStepper from '$lib/components/QtyStepper.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 상품 페이지 — 모바일: 풀블리드 타일 → 구매 정보 → 상세 섹션(스크롤) + 하단 고정 담기 바.
	 *  PC(lg): 왼쪽 상세 스크롤 + 오른쪽 고정 구매 패널(280~360px) (디자인 "MYR Shop PC" 상세).
	 *  상세 섹션 01~05 는 인플루언서가 상품 등록 때 채우는 템플릿 — 각 섹션이 입력 필드가 된다(docs/myr.md §4.2). */
	let { data } = $props();
	const p = $derived(data.product);
	const creator = $derived(p.creator);
	const infoRows = $derived(infoRowsOf(p));
	const related = $derived(data.related);
	const liked = $derived(shop.liked(p.code));

	let qty = $state(1);
	let added = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	function add() {
		if (added || p.soldOut) return;
		shop.add(p, qty);
		added = true;
		clearTimeout(timer);
		timer = setTimeout(() => (added = false), 1600);
	}

	const label = 'text-[12px] font-bold tracking-[.08em] text-accent';
	const h2 = 'mt-3 text-[22px] leading-[1.3] font-extrabold tracking-[-.03em] lg:text-[30px]';
	const card = 'rounded-[20px] border border-white/8 bg-white/4';
</script>

<svelte:head>
	<title>{p.name} · {creator.name} — MYR Shop</title>
	<meta name="description" content="{creator.name}의 {p.name} — {p.form}{p.unit ? ` · ${p.unit}` : ''}" />
</svelte:head>

<!-- 모바일: 화면 높이(앱 셸 <main>) 를 꽉 채우는 세로 flex — 내용만 스크롤, 담기 바는 바닥에 보통 흐름으로 (+layout.svelte 주석) -->
<div class="flex h-full flex-col lg:mx-auto lg:grid lg:h-auto lg:max-w-[1240px] lg:grid-cols-[minmax(0,1fr)_clamp(280px,30%,360px)] lg:items-start lg:gap-10 lg:px-10 lg:pt-6 lg:pb-20">
	<div class="no-bar min-h-0 flex-1 animate-slide-in overflow-y-auto overscroll-y-contain pb-4 lg:min-w-0 lg:overflow-visible lg:pb-0">
		<!-- PC 브레드크럼 -->
		<nav class="hidden items-center gap-2 text-[13px] text-fg-faint lg:flex" aria-label="현재 위치">
			<a href="/" class="hover:text-fg">홈</a><span>/</span>
			<a href="/category?cat={p.cat}" class="hover:text-fg">{catName(p.cat)}</a><span>/</span>
			<span class="text-white/85">{p.name}</span>
		</nav>

		<!-- 타일: 모바일 풀블리드 정사각 / PC 16:10 둥근 카드 -->
		<div class="relative flex aspect-square items-center justify-center overflow-hidden text-white/95 lg:mt-[18px] lg:aspect-[16/10] lg:rounded-[30px]" style="background:{p.tile}">
			<div class="absolute -right-[60px] -bottom-[60px] h-[260px] w-[260px] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,.14),rgba(255,255,255,0))] lg:-right-[100px] lg:-bottom-[100px] lg:h-[460px] lg:w-[460px]"></div>
			<span class="relative lg:[&>svg]:h-[260px] lg:[&>svg]:w-[260px]"><Icon id={p.ic} size={150} /></span>
			<div class="absolute top-2.5 right-3 left-3 flex justify-between lg:hidden">
				<button type="button" onclick={goBack} aria-label="뒤로" class="flex h-11 w-11 items-center justify-center rounded-[14px] bg-bg/45 text-fg backdrop-blur-md">
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
				</button>
				<CartButton glass />
			</div>
			<div class="absolute bottom-3.5 left-4 flex gap-1.5 lg:hidden">
				{#each p.chips as ch (ch)}
					<span class="rounded-full bg-bg/55 px-2.5 py-1.5 text-[12px] font-bold backdrop-blur-md">{ch}</span>
				{/each}
			</div>
		</div>

		<div class="px-5 pt-5 lg:px-0 lg:pt-0">
			<!-- 모바일 구매 정보 (PC 는 오른쪽 패널) -->
			<div class="lg:hidden">
				<a href="/category?creator={handleSlug(creator.handle)}" class="flex items-center gap-2.5 text-left text-fg">
					<Avatar {creator} size={34} />
					<span><span class="block text-[14px] font-bold">{creator.name}</span><span class="block text-[12px] text-fg-faint">{creator.handle} · 레시피 보기</span></span>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
				</a>
				<h1 class="mt-4 text-[26px] leading-[1.28] font-extrabold tracking-[-.03em]">{p.name}</h1>
				<div class="mt-3.5 flex items-baseline gap-2">
					<span class="text-[26px] font-extrabold tracking-[-.02em]">{won(p.price)}</span>
					<span class="text-[13px] text-white/45">{p.unit}</span>
				</div>
			</div>

			<!-- 섹션 앵커 -->
			<div class="no-bar mt-5 flex gap-1.5 overflow-x-auto lg:mt-7 lg:flex-wrap lg:overflow-visible">
				{#each DETAIL_ANCHORS as an (an.id)}
					<a href="#{an.id}" class="shrink-0 rounded-full border border-white/10 bg-white/3 px-3 py-1.5 text-[12px] font-bold text-white/75 hover:text-fg lg:px-3.5 lg:py-2 lg:text-[13px]">{an.name}</a>
				{/each}
			</div>

			<!-- 레시피 노트 (크리에이터가 작성) -->
			<section id="note" class="mt-5 scroll-mt-24 rounded-[20px] border border-accent/22 bg-accent/8 p-[18px] lg:mt-9 lg:rounded-[26px] lg:p-8">
				<div class="flex items-center gap-3">
					<Avatar {creator} size={36} class="hidden lg:flex lg:h-11 lg:w-11 lg:text-[14px]" />
					<span>
						<span class="block text-[12px] font-bold tracking-[.04em] text-accent">{creator.name}의 레시피 노트</span>
						<span class="mt-0.5 hidden text-[13px] text-fg-faint lg:block">{creator.handle}</span>
					</span>
				</div>
				<p class="mt-2 text-[14px] leading-[1.6] text-white/85 text-pretty lg:mt-5 lg:max-w-[680px] lg:text-[24px] lg:leading-[1.5] lg:font-bold lg:tracking-[-.02em] lg:text-fg">"{p.note}"</p>
			</section>

			<!-- 01 왜 만들었나 -->
			<section id="why" class="mt-10 scroll-mt-24 lg:mt-14 lg:max-w-[720px]">
				<p class={label}>01 · 왜 만들었나요</p>
				<h2 class={h2}>{p.storyTitle}</h2>
				<p class="mt-3 text-[14px] leading-[1.75] text-white/72 text-pretty lg:mt-4 lg:text-[16px] lg:leading-[1.8]">{p.story}</p>
			</section>
			<!-- 02 성분 -->
			<section id="ingredients" class="mt-10 scroll-mt-24 lg:mt-14">
				<p class={label}>02 · 무엇이 들어있나요</p>
				<h2 class={h2}>성분표에 모르는 이름이 없게</h2>
				<div class="mt-4 flex flex-col overflow-hidden rounded-[18px] border border-white/8 lg:mt-5 lg:rounded-[22px]">
					{#each p.ingredientRows as row, i (row.name)}
						<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 bg-white/2 px-4 py-3.5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] lg:items-center lg:gap-5 lg:px-[22px] lg:py-[18px] {i ? 'border-t border-white/7' : ''}">
							<span class="col-start-1 row-start-1 text-[14px] font-bold lg:text-[16px]">{row.name}</span>
							<span class="col-start-2 row-start-1 justify-self-end text-[12px] font-bold whitespace-nowrap text-accent lg:col-start-3 lg:text-[13px]">{row.amount}</span>
							<span class="col-span-2 col-start-1 row-start-2 text-[13px] leading-[1.5] text-fg-soft lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:text-[14px]">{row.why}</span>
						</div>
					{/each}
				</div>
			</section>

			<!-- 03 섭취법 -->
			<section id="howto" class="mt-10 scroll-mt-24 lg:mt-14">
				<p class={label}>03 · 이렇게 드세요</p>
				<div class="mt-4 flex flex-col gap-2 lg:mt-5 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] lg:gap-3">
					{#each p.howtoSteps as s, i (s.t)}
						<div class="{card} flex gap-3.5 p-4 lg:flex-col lg:gap-3 lg:p-[22px]">
							<span class="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] bg-accent/14 text-[13px] font-extrabold text-accent">{String(i + 1).padStart(2, '0')}</span>
							<span class="flex flex-col gap-1 lg:gap-3">
								<span class="text-[15px] font-bold lg:text-[16px]">{s.t}</span>
								<span class="text-[13px] leading-[1.55] text-fg-soft lg:text-[14px]">{s.d}</span>
							</span>
						</div>
					{/each}
				</div>
			</section>

			<!-- 04 제품 정보 -->
			<section id="info" class="mt-10 scroll-mt-24 lg:mt-14">
				<p class={label}>04 · 제품 정보</p>
				<div class="mt-4 flex flex-col overflow-hidden rounded-[18px] border border-white/8 lg:mt-5">
					{#each infoRows as r, i (r.k)}
						<div class="grid grid-cols-[88px_minmax(0,1fr)] gap-3 bg-white/2 px-4 py-3 text-[13px] lg:grid-cols-[160px_minmax(0,1fr)] lg:gap-4 lg:px-5 lg:py-3.5 lg:text-[14px] {i ? 'border-t border-white/7' : ''}">
							<span class="text-fg-faint">{r.k}</span><span class="text-white/85">{r.v}</span>
						</div>
					{/each}
				</div>
			</section>

			<!-- 05 FAQ -->
			<section id="faq" class="mt-10 scroll-mt-24 lg:mt-14 lg:max-w-[760px]">
				<p class={label}>05 · 자주 묻는 질문</p>
				<div class="mt-4 flex flex-col gap-2">
					{#each p.faq as f (f.q)}
						<div class="rounded-[18px] border border-white/8 bg-white/3 px-4 py-3.5 lg:px-[22px] lg:py-[18px]">
							<p class="text-[14px] font-bold lg:text-[15px]"><span class="mr-2 text-accent">Q</span>{f.q}</p>
							<p class="mt-1.5 ml-[22px] text-[13px] leading-[1.6] text-fg-soft lg:mt-2 lg:text-[14px]">{f.a}</p>
						</div>
					{/each}
				</div>
			</section>

			<!-- 함께 보면 좋은 레시피 -->
			{#if related.length}
				<h2 class="mt-12 mb-3 text-[18px] font-extrabold tracking-[-.02em] lg:mt-16 lg:mb-4 lg:text-[22px]">함께 보면 좋은 레시피</h2>
				<div class="grid grid-cols-1 gap-2.5 lg:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] lg:gap-3.5">
					{#each related as r (r.id)}
						<a href="/p/{r.code}" class="flex items-center gap-3.5 rounded-[20px] border border-white/8 bg-white/3 p-3 text-left text-fg transition-colors lg:hover:border-white/25">
							<Tile tile={r.tile} ic={r.ic} thumbUrl={r.thumbUrl} alt={r.name} icon={44} class="h-[72px] w-[72px] rounded-2xl" />
							<span class="flex min-w-0 flex-col gap-[3px]">
								<span class="text-[11px] font-bold text-accent">{r.creator.name}</span>
								<span class="text-[14px] leading-[1.3] font-bold">{r.name}</span>
								<span class="mt-0.5 text-[14px] font-extrabold">{won(r.price)}</span>
							</span>
						</a>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<!-- PC 고정 구매 패널 -->
	<aside class="hidden lg:sticky lg:top-[106px] lg:flex lg:flex-col lg:gap-5">
		<a href="/category?creator={handleSlug(creator.handle)}" class="flex items-center gap-3 text-left text-fg">
			<Avatar {creator} size={40} />
			<span><span class="block text-[15px] font-bold">{creator.name}</span><span class="block text-[13px] text-fg-faint">{creator.handle} · 레시피 더 보기</span></span>
		</a>
		<div>
			<h1 class="text-[30px] leading-[1.22] font-extrabold tracking-[-.03em]">{p.name}</h1>
			<div class="mt-4 flex items-baseline gap-2.5">
				<span class="text-[30px] font-extrabold tracking-[-.02em]">{won(p.price)}</span>
				<span class="text-[14px] text-white/45">{p.unit}</span>
			</div>
		</div>
		<div class="flex flex-wrap gap-1.5">
			{#each p.chips as ch (ch)}
				<span class="rounded-full border border-white/12 px-[11px] py-[7px] text-[12px] font-semibold text-white/75">{ch}</span>
			{/each}
		</div>
		<div class="flex items-center gap-2.5">
			<QtyStepper {qty} onchange={(q) => (qty = q)} />
			<button
				type="button"
				onclick={() => shop.toggleLike(p)}
				aria-label={liked ? '찜 해제' : '찜'}
				aria-pressed={liked}
				class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/4 {liked ? 'text-accent' : 'text-fg'}"
			>
				<svg width="20" height="20" viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" /></svg>
			</button>
		</div>
		<button
			type="button"
			onclick={add}
			disabled={p.soldOut}
			class="flex h-[58px] w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-extrabold whitespace-nowrap transition-colors duration-250 {added ? 'bg-panel-2 text-fg' : 'bg-accent text-bg hover:bg-[#ff8f5c]'}"
		>
			{#if added}
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg><span>담았어요</span>
			{:else}
				<span>{p.soldOut ? '품절' : `${won(p.price * qty)} 담기`}</span>
			{/if}
		</button>
		<div class="flex flex-col gap-2.5 rounded-2xl border border-white/7 bg-white/3 p-4 text-[13px] text-fg-soft">
			<span class="flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff7a3d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h13v10H3z" /><path d="M16 10h4l1 3v4h-5" /></svg>5만원 이상 무료배송</span>
			<span class="flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff7a3d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>영업일 2~3일 도착</span>
			<span class="flex items-center gap-2"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff7a3d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 4v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /><path d="M9 12l2 2 4-4" /></svg>식약처 인증 제조시설 생산</span>
		</div>
	</aside>

	<!-- 모바일 하단 담기 바 -->
	<div class="flex w-full shrink-0 items-center gap-2.5 border-t border-white/6 bg-bg px-5 pt-3 pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:hidden">
		<QtyStepper {qty} onchange={(q) => (qty = q)} />
		<button
			type="button"
			onclick={add}
			disabled={p.soldOut}
			class="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-[16px] font-extrabold transition-colors duration-250 {added ? 'bg-panel-2 text-fg' : 'bg-accent text-bg'}"
		>
			{#if added}
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
				<span>담았어요</span>
			{:else}
				<span>{p.soldOut ? '품절' : `${won(p.price * qty)} 담기`}</span>
			{/if}
		</button>
	</div>
</div>
