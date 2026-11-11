<script lang="ts">
	import { kstLabel } from '@sellery/myr-core/groupbuy';
	import { won } from '$lib/data';
	import { shop } from '$lib/state.svelte';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import PriceSummary from '$lib/components/PriceSummary.svelte';
	import QtyStepper from '$lib/components/QtyStepper.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 장바구니 — 줄마다 체크박스 · 수량 · 삭제, 전체 선택 · 선택 삭제, 무료배송까지 남은 금액, 합계(선택한 줄만) → 주문하기(선택한 줄만).
	 *  모바일: 하단 고정 합계 바 · PC(lg): 왼쪽 줄 목록 + 오른쪽 sticky 주문 요약.
	 *  공구 링크로 담은 줄(0086): 진행 중이면 공구가(기본가 취소선) · 예정이면 시작 안내 · 끝났으면 "기본가로 바뀌었어요" */
	const selectedCount = $derived(shop.selectedItems.length);
	const buyableCount = $derived(shop.cartItems.filter((it) => it.available).length);
	const checkCls = 'h-[22px] w-[22px] shrink-0 cursor-pointer appearance-none rounded-[7px] border-[1.5px] border-white/25 bg-transparent transition-colors checked:border-accent checked:bg-accent checked:bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%230a0b0e%27%20stroke-width=%273%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27M5%2012.5l4.5%204.5L19%207.5%27/%3E%3C/svg%3E")] checked:bg-[length:16px_16px] checked:bg-center checked:bg-no-repeat disabled:cursor-not-allowed disabled:opacity-30';
</script>

<svelte:head><title>장바구니 — MYR Shop</title></svelte:head>

<!-- 모바일: 화면 높이를 채우는 세로 flex — 내용만 스크롤, 합계 바는 바닥에 보통 흐름으로 (+layout.svelte 주석) -->
<div class="flex h-full flex-col lg:mx-auto lg:block lg:h-auto lg:max-w-[1240px] lg:px-10 lg:pt-8 lg:pb-20">
	<div class="no-bar min-h-0 flex-1 animate-slide-in overflow-y-auto overscroll-y-contain lg:overflow-visible">
		<BackHeader title="장바구니">
			{#snippet right()}<span class="text-[13px] text-fg-faint">{shop.cartCount}개</span>{/snippet}
		</BackHeader>
		<h1 class="hidden text-[32px] font-extrabold tracking-[-.03em] lg:block">장바구니 <span class="ml-1.5 text-[16px] font-semibold text-white/45">{shop.cartCount}개</span></h1>

		{#if shop.ready && shop.cartItems.length === 0}
			<div class="flex flex-col items-center gap-4 px-5 pt-20 text-center lg:gap-[18px] lg:pt-[100px]">
				<span class="flex h-[72px] w-[72px] items-center justify-center rounded-3xl bg-white/4 text-fg-faint lg:h-20 lg:w-20 lg:rounded-[26px]">
					<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l1 13H5z" /><path d="M9 7V5a3 3 0 0 1 6 0v2" /></svg>
				</span>
				<div><p class="text-[17px] font-bold lg:text-[20px]">아직 비어 있어요</p><p class="mt-1.5 text-[14px] text-fg-faint lg:text-[15px]">마음에 드는 레시피를 담아보세요</p></div>
				<a href="/category" class="flex h-12 items-center rounded-[14px] border border-white/14 px-[22px] text-[14px] font-bold text-fg lg:h-[50px] lg:px-6 lg:text-[15px]">둘러보기</a>
			</div>
		{/if}

		<div class="px-5 pt-1.5 pb-4 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] lg:items-start lg:gap-8 lg:px-0 lg:pt-6 lg:pb-0">
			<div class="flex flex-col gap-2.5 lg:gap-3">
				{#if shop.cartItems.length}
					<div class="flex items-center justify-between px-1 pb-0.5">
						<label class="flex cursor-pointer items-center gap-2.5 text-[13px] font-bold">
							<input type="checkbox" class={checkCls} checked={buyableCount > 0 && shop.allSelected} disabled={buyableCount === 0} onchange={(e) => shop.selectAll(e.currentTarget.checked)} aria-label="전체 선택" />
							전체 선택 <span class="font-semibold text-fg-faint">{selectedCount}/{buyableCount}</span>
						</label>
						<button type="button" onclick={() => shop.removeSelected()} disabled={selectedCount === 0} class="text-[13px] font-bold text-fg-faint hover:text-fg disabled:opacity-30">선택 삭제</button>
					</div>
				{/if}
				{#each shop.cartItems as it (it.code)}
					<div class="flex items-center gap-3 rounded-[20px] border bg-white/3 p-3 transition-colors lg:grid lg:grid-cols-[22px_96px_minmax(0,1fr)_40px] lg:gap-4 lg:rounded-[22px] lg:p-4 {it.selected ? 'border-white/8' : 'border-white/5 opacity-70'}">
						<input type="checkbox" class={checkCls} checked={it.selected} disabled={!it.available} onchange={(e) => shop.select(it.code, e.currentTarget.checked)} aria-label="{it.name} 선택" />
						<a href="/p/{it.code}" aria-label={it.name}><Tile tile={it.tile} ic={it.ic} thumbUrl={it.thumbUrl} alt={it.name} icon={44} class="h-[72px] w-[72px] rounded-[14px] lg:h-24 lg:w-24 lg:rounded-[18px]" /></a>
						<div class="flex min-w-0 flex-1 flex-col gap-[3px] lg:gap-1">
							<span class="text-[11px] font-bold text-accent lg:text-[12px]">{it.creator.name}</span>
							<span class="text-[14px] leading-[1.3] font-bold lg:text-[16px]">{it.name}</span>
							<span class="hidden text-[13px] text-fg-faint lg:block">{it.unit}</span>
							{#if it.gb && it.available}
								{#if it.gbState === 'active'}
									<span class="text-[12px] font-extrabold text-accent">공구가 · {it.gb.discountPct}% 할인</span>
								{:else if it.gbState === 'scheduled'}
									<span class="text-[12px] font-bold text-white/55">공구 예정 · {kstLabel(it.gb.startsAt)}부터 공구가</span>
								{:else if it.gbState === 'ended'}
									<span class="text-[12px] font-bold text-[#ff8a8a]">공구가 끝나 기본가로 바뀌었어요</span>
								{/if}
							{/if}
							{#if it.available}
								<div class="mt-1.5 flex items-center justify-between lg:mt-2 lg:flex-wrap lg:gap-3">
									<QtyStepper qty={it.qty} size="sm" max={it.stockLeft ?? undefined} onchange={(q) => shop.setQty(it.code, q)} />
									<span class="flex items-baseline gap-1.5">
										{#if it.baseAmount !== null && it.lineAmount !== null && it.baseAmount !== it.lineAmount}<span class="text-[12px] font-semibold text-white/40 line-through lg:text-[13px]">{won(it.baseAmount)}</span>{/if}
										<span class="text-[15px] font-extrabold lg:text-[17px]">{it.lineAmount === null ? '확인 중' : won(it.lineAmount)}</span>
									</span>
								</div>
								{#if it.stockLeft !== null && it.qty > it.stockLeft}<p class="mt-1.5 text-[12px] font-bold text-[#ff8a8a] lg:text-[13px]">남은 수량 {it.stockLeft.toLocaleString('ko-KR')}개 — 수량을 줄여주세요</p>{/if}
							{:else}
								<!-- 계정 장바구니(0057)에서 담은 뒤 품절·판매중지된 줄 — 합계에서 빠지고 삭제만 된다 -->
								<p class="mt-1.5 text-[12px] font-bold text-white/45 lg:mt-2 lg:text-[13px]">지금은 살 수 없어요 · 합계에서 뺐어요</p>
							{/if}
						</div>
						<button type="button" onclick={() => shop.remove(it.code)} aria-label="{it.name} 삭제" class="flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-[10px] text-white/40 lg:h-10 lg:w-10 lg:self-center lg:rounded-xl lg:hover:bg-white/6 lg:hover:text-fg">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
						</button>
					</div>
				{/each}
				{#if shop.cartItems.length}
					<div class="mt-1 flex items-center gap-2.5 rounded-2xl border border-accent/20 bg-accent/8 px-4 py-3.5 lg:mt-0">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff7a3d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><path d="M3 7h13v10H3z" /><path d="M16 10h4l1 3v4h-5" /><circle cx="7" cy="19" r="1.5" /><circle cx="18" cy="19" r="1.5" /></svg>
						<span class="text-[13px] leading-[1.5] text-white/85 lg:text-[14px]">{shop.shippingMsg || (shop.quoteFailed ? '금액을 확인하지 못했어요 — 잠시 후 다시 시도해주세요' : '배송비를 확인하고 있어요')}</span>
					</div>
				{/if}
			</div>

			<!-- PC 주문 요약 -->
			{#if shop.cartItems.length}
				<aside class="hidden rounded-3xl border border-white/8 bg-panel p-6 lg:sticky lg:top-[104px] lg:block">
					<p class="mb-4 text-[16px] font-extrabold">주문 요약</p>
					<PriceSummary subtotal={shop.subtotal} shipping={shop.shipping} total={shop.total} />
					{#if selectedCount}
						<a href="/checkout" class="mt-2 flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-[16px] font-extrabold text-bg transition-colors hover:bg-[#ff8f5c]">{selectedCount}개 주문하기</a>
					{:else}
						<span class="mt-2 flex h-14 w-full items-center justify-center rounded-2xl bg-white/8 text-[16px] font-extrabold text-white/40">주문할 상품을 선택해주세요</span>
					{/if}
					<a href="/category" class="mt-2 flex h-12 w-full items-center justify-center rounded-[14px] text-[14px] font-bold text-fg-soft hover:text-fg">계속 쇼핑하기</a>
				</aside>
			{/if}
		</div>
	</div>

	<!-- 모바일 하단 합계 바 -->
	{#if shop.cartItems.length}
		<div class="w-full shrink-0 border-t border-white/6 bg-bg px-5 pt-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:hidden">
			<PriceSummary subtotal={shop.subtotal} shipping={shop.shipping} total={shop.total} />
			{#if selectedCount}
				<a href="/checkout" class="flex h-[58px] w-full items-center justify-center rounded-2xl bg-accent text-[17px] font-extrabold text-bg">{shop.total === null ? '' : `${won(shop.total)} `}주문하기 ({selectedCount}개)</a>
			{:else}
				<span class="flex h-[58px] w-full items-center justify-center rounded-2xl bg-white/8 text-[17px] font-extrabold text-white/40">주문할 상품을 선택해주세요</span>
			{/if}
		</div>
	{/if}
</div>
