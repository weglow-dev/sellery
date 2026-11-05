<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Product } from '$lib/data';
	import { PRODUCT_STATUS_META, filterProducts, productTabCounts, showsStock, won, type ProductTab } from '$lib/rules';
	import { app } from '$lib/state.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 내 제품 — 로그인한 크리에이터의 실제 상품(+page.server.ts · 0071). 탭 전체 · 판매 중(일시중지 포함) · 심사 중(반려 포함) · 임시저장 · 종료.
	 *  [상품 등록] → 8단계 에디터(4번 전까지 목 — 에디터에서 저장한 것은 아직 이 목록에 안 나온다). 재고는 읽기 전용(남은 재고 = 입고 − 판매).
	 *  모바일은 한 줄 목록, PC(lg~)는 32px 제목 + 2단 카드(누적 판매 수량까지).
	 *  상세(가격·소개글 수정 · 판매/일시중지 토글)는 시안이 아직 없어 토스트로 상태만 알린다. */
	let { data } = $props();
	let tab = $state<ProductTab>('all');
	const tabs = $derived(productTabCounts(data.products));
	const list = $derived(filterProducts(data.products, tab));

	function open(p: Product) {
		if (p.status === 'draft') goto(`/products/new?draft=${encodeURIComponent(p.id)}`);
		else if (p.status === 'rejected' && p.rejectReason) app.showToast(`반려 사유 · ${p.rejectReason}`);
		else app.showToast(`${p.name} · ${PRODUCT_STATUS_META[p.status].label}`);
	}
</script>

<div class="flex min-h-0 flex-1 animate-up-in flex-col lg:mx-auto lg:block lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-10">
	<div class="flex h-[60px] shrink-0 items-center justify-between px-5 lg:h-auto lg:px-0">
		<h1 class="text-[18px] font-extrabold tracking-[-0.02em] lg:text-[32px] lg:tracking-[-0.03em]">내 제품</h1>
		<a href="/products/new" class="flex h-10 items-center gap-1.5 rounded-xl bg-accent pr-3.5 pl-2.5 text-[13px] font-extrabold text-bg transition-colors lg:h-[46px] lg:rounded-[14px] lg:pr-[18px] lg:pl-3.5 lg:text-[14px] lg:hover:bg-[#ff8f5c]">
			<Icon id="plus" size={16} sw={2.6} />상품 등록
		</a>
	</div>
	<FilterTabs {tabs} bind:value={tab} label="제품 상태" />
	<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pb-6 lg:mt-5 lg:overflow-visible lg:px-0 lg:pb-0">
		<div class="flex flex-col gap-2 lg:grid lg:grid-cols-2 lg:gap-3">
			{#each list as p (p.id)}
				{@const m = PRODUCT_STATUS_META[p.status]}
				<button type="button" onclick={() => open(p)} class="flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/3 p-3 text-left transition-colors lg:gap-4 lg:rounded-[20px] lg:p-4 lg:hover:border-white/30">
					<Tile tile={p.tile} thumbUrl={p.thumbUrl} bg={p.bg} iconId={p.iconId} icon={36} iconCls="lg:h-11 lg:w-11" class="h-16 w-16 rounded-[14px] lg:h-20 lg:w-20 lg:rounded-[18px] {p.status === 'ended' || p.status === 'paused' ? 'opacity-50' : ''}" />
					<span class="flex min-w-0 flex-1 flex-col gap-[3px] lg:gap-1">
						<span class="flex min-w-0 items-center gap-1.5"><Badge cls={m.cls}>{m.label}</Badge><span class="truncate text-[11px] text-white/45 lg:text-[12px]">{p.meta}</span></span>
						<span class="text-[14px] leading-[1.3] font-bold lg:text-[16px]">{p.name}</span>
						<span class="text-[12px] text-white/55 lg:text-[13px]">
							{p.price ? won(p.price) : '가격 미정'} · 재고 {showsStock(p.status) ? `${p.stock.toLocaleString('ko-KR')}개` : '—'}<span class="hidden lg:inline">{' · '}누적 판매 {p.sold ? `${p.sold.toLocaleString('ko-KR')}개` : '—'}</span>
						</span>
					</span>
					<Icon id="chev" size={18} sw={2.2} class="shrink-0 text-white/35" />
				</button>
			{:else}
				{#if data.products.length === 0}
					<!-- 아직 상품이 하나도 없는 크리에이터(가입 직후) -->
					<div class="flex flex-col items-center py-[60px] text-center lg:col-span-2 lg:py-20">
						<span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/6 text-white/60"><Icon id="box" size={26} /></span>
						<p class="mt-4 text-[16px] font-bold">아직 등록한 제품이 없어요</p>
						<p class="mt-1.5 text-[13px] leading-[1.55] text-white/50">레시피로 만든 제품을 등록하면 운영팀 심사 뒤 MYR Shop 에 올라가요.</p>
						<a href="/products/new" class="mt-5 flex h-11 items-center gap-1.5 rounded-xl bg-accent px-4 text-[14px] font-extrabold text-bg lg:hover:bg-[#ff8f5c]"><Icon id="plus" size={16} sw={2.6} />첫 제품 등록하기</a>
					</div>
				{:else}
					<div class="py-[60px] text-center text-[14px] text-white/50 lg:col-span-2 lg:py-20 lg:text-[15px]">해당하는 제품이 없어요</div>
				{/if}
			{/each}
		</div>
	</div>
</div>
