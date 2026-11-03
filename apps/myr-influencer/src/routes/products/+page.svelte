<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Product } from '$lib/data';
	import { PRODUCT_STATUS_META, filterProducts, productTabCounts, won, type ProductTab } from '$lib/rules';
	import { app } from '$lib/state.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 내 제품 — 전체 · 판매 중 · 심사 중 · 임시저장. [상품 등록] → 8단계 에디터. 임시저장 행은 에디터로 이어 쓴다.
	 *  판매 중 · 심사 중 · 종료 제품의 상세(가격·소개글 수정 · 판매/일시중지 토글)는 시안이 아직 없어 토스트로 상태만 알린다. */
	let tab = $state<ProductTab>('all');
	const tabs = $derived(productTabCounts(app.products));
	const list = $derived(filterProducts(app.products, tab));

	function open(p: Product) {
		if (p.status === 'draft') goto(`/products/new?draft=${encodeURIComponent(p.id)}`);
		else app.showToast(`${p.name} · ${PRODUCT_STATUS_META[p.status].label}`);
	}
</script>

<div class="flex min-h-0 flex-1 animate-up-in flex-col">
	<div class="flex h-[60px] shrink-0 items-center justify-between px-5">
		<h1 class="text-[18px] font-extrabold tracking-[-0.02em]">내 제품</h1>
		<a href="/products/new" class="flex h-10 items-center gap-1.5 rounded-xl bg-accent pr-3.5 pl-2.5 text-[13px] font-extrabold text-bg">
			<Icon id="plus" size={16} sw={2.6} />상품 등록
		</a>
	</div>
	<FilterTabs {tabs} bind:value={tab} label="제품 상태" />
	<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pb-6">
		<div class="flex flex-col gap-2">
			{#each list as p (p.id)}
				{@const m = PRODUCT_STATUS_META[p.status]}
				<button type="button" onclick={() => open(p)} class="flex items-center gap-3 rounded-[18px] border border-white/8 bg-white/3 p-3 text-left">
					<Tile tile={p.tile} thumbUrl={p.thumbUrl} icon={36} class="h-16 w-16 rounded-[14px] {p.status === 'ended' ? 'opacity-50' : ''}" />
					<span class="flex min-w-0 flex-1 flex-col gap-[3px]">
						<span class="flex items-center gap-1.5"><Badge cls={m.cls}>{m.label}</Badge><span class="text-[11px] text-white/45">{p.meta}</span></span>
						<span class="text-[14px] leading-[1.3] font-bold">{p.name}</span>
						<span class="text-[12px] text-white/55">{p.price ? won(p.price) : '가격 미정'} · 재고 {p.status === 'live' ? `${p.stock}개` : '—'}</span>
					</span>
					<Icon id="chev" size={18} sw={2.2} class="shrink-0 text-white/35" />
				</button>
			{:else}
				<div class="py-[60px] text-center text-[14px] text-white/50">해당하는 제품이 없어요</div>
			{/each}
		</div>
	</div>
</div>
