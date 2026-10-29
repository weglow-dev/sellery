<script lang="ts">
	import { creatorOf, won } from '$lib/data';
	import { goBack } from '$lib/nav';
	import { shop } from '$lib/state.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import CartButton from '$lib/components/CartButton.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import QtyStepper from '$lib/components/QtyStepper.svelte';

	let { data } = $props();
	const p = $derived(data.product);
	const creator = $derived(creatorOf(p.creator));

	let qty = $state(1);
	let added = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	function add() {
		if (added) return;
		shop.add(p.id, qty);
		added = true;
		clearTimeout(timer);
		timer = setTimeout(() => (added = false), 1600);
	}
</script>

<svelte:head>
	<title>{p.name} · {creator.name} — MYR Shop</title>
	<meta name="description" content={p.sub} />
</svelte:head>

<!-- 등장 애니메이션(transform)은 스크롤 내용에만 — 조상에 걸면 아래 fixed 바의 기준이 그 요소가 돼 화면 밖으로 밀린다 -->
<div class="min-h-dvh">
	<div class="animate-slide-in pb-[120px]">
		<!-- 풀블리드 타일 -->
		<div class="relative flex aspect-square items-center justify-center text-white/95" style="background:{p.tile}">
			<div class="absolute -right-[60px] -bottom-[60px] h-[260px] w-[260px] rounded-full bg-[radial-gradient(closest-side,rgba(255,255,255,.14),rgba(255,255,255,0))]"></div>
			<span class="relative"><Icon id={p.ic} size={150} /></span>
			<div class="absolute top-2.5 right-3 left-3 flex justify-between">
				<button type="button" onclick={goBack} aria-label="뒤로" class="flex h-11 w-11 items-center justify-center rounded-[14px] bg-bg/45 text-fg backdrop-blur-md">
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
				</button>
				<CartButton glass />
			</div>
			<div class="absolute bottom-3.5 left-4 flex gap-1.5">
				{#each p.chips as ch (ch)}
					<span class="rounded-full bg-bg/55 px-2.5 py-1.5 text-[12px] font-bold backdrop-blur-md">{ch}</span>
				{/each}
			</div>
		</div>

		<div class="px-5 pt-5">
			<a href="/category?creator={creator.id}" class="flex items-center gap-2.5 text-left text-fg">
				<Avatar bg={creator.bg} initial={creator.initial} size={34} />
				<span><span class="block text-[14px] font-bold">{creator.name}</span><span class="block text-[12px] text-fg-faint">{creator.handle} · 레시피 보기</span></span>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
			</a>
			<h1 class="mt-4 text-[26px] leading-[1.28] font-extrabold tracking-[-.03em]">{p.name}</h1>
			<p class="mt-1.5 text-[14px] text-fg-soft">{p.sub}</p>
			<div class="mt-3.5 flex items-baseline gap-2">
				<span class="text-[26px] font-extrabold tracking-[-.02em]">{won(p.price)}</span>
				<span class="text-[13px] text-white/45">{p.unit}</span>
			</div>

			<div class="mt-5 rounded-[20px] border border-accent/22 bg-accent/8 p-[18px]">
				<p class="text-[12px] font-bold tracking-[.04em] text-accent">{creator.name}의 레시피 노트</p>
				<p class="mt-2 text-[14px] leading-[1.6] text-white/85 text-pretty">"{p.note}"</p>
			</div>

			<div class="mt-5 grid grid-cols-3 gap-2">
				{#each p.specs as sp (sp.k)}
					<div class="flex flex-col items-start gap-1.5 rounded-2xl border border-white/8 bg-white/4 px-3 py-3.5">
						<span class="text-white/90"><Icon id={sp.ic} size={22} /></span>
						<span class="text-[11px] text-fg-faint">{sp.k}</span>
						<span class="text-[13px] font-bold">{sp.v}</span>
					</div>
				{/each}
			</div>

			<h3 class="mt-6 mb-2.5 text-[15px] font-extrabold">주요 성분</h3>
			<div class="flex flex-wrap gap-1.5">
				{#each p.ingredients as ig (ig)}
					<span class="rounded-full border border-white/12 px-3 py-2 text-[13px] font-semibold text-white/80">{ig}</span>
				{/each}
			</div>

			<h3 class="mt-6 mb-2.5 text-[15px] font-extrabold">이렇게 드세요</h3>
			<p class="text-[14px] leading-[1.65] text-white/70">{p.howto}</p>
		</div>
	</div>

	<!-- 하단 담기 바 -->
	<div class="fixed bottom-0 left-1/2 flex w-full max-w-[430px] -translate-x-1/2 items-center gap-2.5 bg-gradient-to-b from-bg/0 to-bg to-35% px-5 pt-3 pb-7">
		<QtyStepper {qty} onchange={(q) => (qty = q)} />
		<button
			type="button"
			onclick={add}
			class="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl text-[16px] font-extrabold transition-colors duration-250 {added ? 'bg-panel-2 text-fg' : 'bg-accent text-bg'}"
		>
			{#if added}
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
				<span>담았어요</span>
			{:else}
				<span>{won(p.price * qty)} 담기</span>
			{/if}
		</button>
	</div>
</div>
