<script lang="ts">
	import { page } from '$app/state';
	import { products, type ProductTab } from '$lib/mock/products.svelte';
	import { setParams } from '$lib/url';
	import Chip from '$lib/components/Chip.svelte';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PageHead from '$lib/components/PageHead.svelte';
	import ProductThumb from '$lib/components/ProductThumb.svelte';

	/** 상품 목록 — docs/myr-admin-screens.md §4-1 (시안 "MYR Admin PC" 상품 · 2026-11-25).
	 *  탭 3개(심사 · 판매 중 · 판매 종료) · 표(PC: 상품코드 · 상품 · 카테고리 · 용량 · 가격 · 재고 · 상태) / 카드(모바일).
	 *  줄을 누르면 신규 심사 · 수정 심사 · 상품 관리. 칩 · 처리 시점 · 재고 색 · 정렬은 서버(목) 값 */
	const tabs = $derived(products.tabs());
	const summary = $derived(products.summary);
	const t0 = $derived(page.url.searchParams.get('tab'));
	const tab = $derived<ProductTab>(t0 === 'live' || t0 === 'ended' ? t0 : 'review');
	const res = $derived(products.list(tab));

	const COLS = 'grid-cols-[128px_minmax(0,1fr)_190px_100px_84px_216px_18px]';
	const STOCK_CLS = { dim: 'text-white/35', red: 'text-danger-fg', plain: 'text-fg' };
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-8 lg:pb-16">
	<PageHead title="상품">
		{#snippet sum()}
			심사 대기 <b class="font-bold text-accent">{summary.reviewN}건</b> · 판매 중 {summary.liveN}개
		{/snippet}
	</PageHead>

	<div class="mt-5">
		<FilterTabs {tabs} value={tab} label="상품 상태" onpick={(id) => setParams(page.url, { tab: id })} />
	</div>

	<!-- PC 표 -->
	<div class="mt-4 hidden overflow-hidden rounded-3xl border border-white/8 bg-white/3 lg:block">
		<div class="grid {COLS} h-[46px] items-center gap-x-5 bg-white/[0.025] pr-5 pl-6 text-[12.5px] font-semibold text-white/45">
			<span>상품코드</span><span>상품</span><span>카테고리 · 용량</span><span class="text-right">가격</span><span class="text-right">재고</span><span>상태</span><span></span>
		</div>
		{#each res.rows as r (r.id)}
			<a href={r.href} class="grid {COLS} min-h-[72px] items-center gap-x-5 border-t border-white/6 py-2.5 pr-5 pl-6 transition-colors hover:bg-white/4">
				<span class="text-[13.5px] font-bold tracking-[0.01em] whitespace-nowrap text-white/78 tabular-nums">{r.code}</span>
				<span class="flex min-w-0 items-center gap-3">
					<ProductThumb tile={r.tile} icon={r.icon} size={40} radius={12} />
					<span class="min-w-0">
						<span class="block truncate text-[15px] font-bold tracking-[-0.01em]">{r.name}</span>
						<span class="mt-[3px] block truncate text-[12.5px] text-white/50">{r.creator}</span>
					</span>
				</span>
				<span class="truncate text-[13.5px] text-white/60">{r.cat}</span>
				<span class="text-right text-[14.5px] font-semibold tabular-nums">{r.priceText}</span>
				<span class="text-right text-[15px] font-extrabold tabular-nums {STOCK_CLS[r.stockTone]}">{r.stockText}</span>
				<span class="min-w-0">
					<span class="flex flex-wrap gap-[5px]">{#each r.chips as c (c.label)}<Chip label={c.label} tone={c.tone} />{/each}</span>
					<span class="mt-1 block truncate text-[12px] text-white/45 tabular-nums">{r.meta}</span>
				</span>
				<span class="text-white/40"><Icon id="chev" size={18} sw={2.2} /></span>
			</a>
		{:else}
			<p class="border-t border-white/6 px-5 py-[72px] text-center text-[15px] text-white/45">{res.empty}</p>
		{/each}
	</div>

	<!-- 모바일 카드 -->
	<ul class="mt-4 flex flex-col gap-2 lg:hidden">
		{#each res.rows as r (r.id)}
			<li>
				<a href={r.href} class="flex items-start gap-3 rounded-[20px] border border-white/8 bg-white/3 p-4">
					<ProductThumb tile={r.tile} icon={r.icon} size={52} radius={15} />
					<span class="min-w-0 flex-1">
						<span class="flex flex-wrap items-center gap-1">{#each r.chips as c (c.label)}<Chip label={c.label} tone={c.tone} />{/each}<span class="ml-1 text-[12px] text-white/50 tabular-nums">{r.meta}</span></span>
						<span class="mt-1 block truncate text-[15px] font-bold">{r.name}</span>
						<span class="mt-0.5 block truncate text-[12px] text-white/55">{r.code} · {r.creator} · {r.cat}</span>
						<span class="mt-1.5 flex items-center justify-between text-[13px]"><span class="font-bold tabular-nums">{r.priceText}</span><span class="font-bold tabular-nums {STOCK_CLS[r.stockTone]}">재고 {r.stockText}</span></span>
					</span>
				</a>
			</li>
		{:else}
			<li class="rounded-[20px] border border-white/8 bg-white/3 px-4 py-12 text-center text-[14px] text-white/55">{res.empty}</li>
		{/each}
	</ul>
</div>
