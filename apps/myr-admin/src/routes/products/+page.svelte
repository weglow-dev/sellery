<script lang="ts">
	import { page } from '$app/state';
	import { products, type ProductTab } from '$lib/mock/products.svelte';
	import { setParams } from '$lib/url';
	import Chip from '$lib/components/Chip.svelte';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import ProductThumb from '$lib/components/ProductThumb.svelte';
	import SubNav from '$lib/components/SubNav.svelte';

	/** 상품 목록 — docs/myr-admin-screens.md §4-1 (시안 "MYR Admin PC" 상품 · 2026-11-25). SubNav(상품 | 공구 링크 — 2026-11-27 공구 링크 메뉴를 합침) → 요약 → 탭.
	 *  탭 3개(심사 · 판매 중 · 판매 종료) · 표(상품코드 · 상품 · 카테고리 · 용량 · 가격 · 재고 · 상태 — 모바일은 같은 칸을 좁게 두고 옆으로 밀어서 본다).
	 *  줄을 누르면 신규 심사 · 수정 심사 · 상품 관리. 칩 · 처리 시점 · 재고 색 · 정렬은 서버(목) 값 */
	const subs = $derived(products.subs());
	const tabs = $derived(products.tabs());
	const summary = $derived(products.summary);
	const t0 = $derived(page.url.searchParams.get('tab'));
	const tab = $derived<ProductTab>(t0 === 'live' || t0 === 'ended' ? t0 : 'review');
	const res = $derived(products.list(tab));

	const COLS = 'grid-cols-[128px_minmax(0,1fr)_190px_100px_84px_216px_18px]';
	/** 모바일 — 같은 칸을 좁게(848px · 옆으로 밀기) */
	const COLS_M = 'grid-cols-[104px_200px_150px_78px_60px_170px]';
	const STOCK_CLS = { dim: 'text-white/35', red: 'text-danger-fg', plain: 'text-fg' };
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-8 lg:pb-16">
	<h1 class="sr-only">상품</h1>
	<!-- 하위 화면(왼쪽) · 요약(오른쪽) → 탭 — 큰 제목 없음(2026-11-26) -->
	<div class="flex flex-col gap-3 lg:min-h-[52px] lg:flex-row lg:items-center lg:justify-between lg:gap-4">
		<SubNav items={subs} value="products" label="상품 화면" />
		<p class="text-[13px] text-white/60 tabular-nums lg:text-[14px]">심사 대기 <b class="font-bold text-accent">{summary.reviewN}건</b> · 판매 중 {summary.liveN}개</p>
	</div>
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

	<!-- 모바일 표 — PC 와 같은 칸을 좁게 · 옆으로 밀어서 본다(시안 "MYR Admin" · 2026-11-25) -->
	<div class="mt-3.5 overflow-hidden rounded-[20px] border border-white/8 bg-white/3 lg:hidden">
		<div class="thin-bar overflow-x-auto pb-2">
			<div class="min-w-[848px]">
				<div class="grid {COLS_M} h-10 items-center gap-x-3.5 bg-white/[0.025] px-4 text-[12px] font-semibold whitespace-nowrap text-white/45">
					<span>상품코드</span><span>상품</span><span>카테고리 · 용량</span><span class="text-right">가격</span><span class="text-right">재고</span><span>상태</span>
				</div>
				{#each res.rows as r (r.id)}
					<a href={r.href} class="grid {COLS_M} min-h-16 items-center gap-x-3.5 border-t border-white/6 px-4 py-2.5 active:bg-white/4">
						<span class="text-[12.5px] font-bold whitespace-nowrap text-white/78 tabular-nums">{r.code}</span>
						<span class="flex min-w-0 items-center gap-2.5">
							<ProductThumb tile={r.tile} icon={r.icon} size={36} radius={11} />
							<span class="min-w-0">
								<span class="block truncate text-[14px] font-bold">{r.name}</span>
								<span class="mt-0.5 block truncate text-[12px] text-white/50">{r.creator}</span>
							</span>
						</span>
						<span class="truncate text-[13px] text-white/70 tabular-nums">{r.cat}</span>
						<span class="text-right text-[13.5px] font-semibold whitespace-nowrap tabular-nums">{r.priceText}</span>
						<span class="text-right text-[14px] font-extrabold whitespace-nowrap tabular-nums {STOCK_CLS[r.stockTone]}">{r.stockText}</span>
						<span class="min-w-0">
							<span class="flex flex-wrap gap-1">{#each r.chips as c (c.label)}<Chip label={c.label} tone={c.tone} />{/each}</span>
							<span class="mt-1 block truncate text-[11.5px] text-white/45 tabular-nums">{r.meta}</span>
						</span>
					</a>
				{/each}
			</div>
		</div>
		{#if !res.rows.length}<p class="border-t border-white/6 px-4 py-12 text-center text-[14px] text-white/45">{res.empty}</p>{/if}
	</div>
</div>
