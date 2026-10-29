<script lang="ts">
	import { creatorOf, won } from '$lib/data';
	import { shop } from '$lib/state.svelte';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import PriceSummary from '$lib/components/PriceSummary.svelte';
	import QtyStepper from '$lib/components/QtyStepper.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 장바구니 — 줄마다 수량 · 삭제, 무료배송까지 남은 금액, 합계 → 주문하기.
	 *  모바일: 하단 고정 합계 바 · PC(lg): 왼쪽 줄 목록 + 오른쪽 sticky 주문 요약 */
</script>

<svelte:head><title>장바구니 — MYR Shop</title></svelte:head>

<!-- 모바일 하단 합계 바는 `sticky bottom-0`(문서 흐름의 마지막) — 상품 상세와 같은 이유로 fixed 를 쓰지 않는다 -->
<div class="flex min-h-dvh flex-col lg:mx-auto lg:block lg:min-h-0 lg:max-w-[1240px] lg:px-10 lg:pt-8 lg:pb-20">
	<div class="flex-1 animate-slide-in">
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
				{#each shop.cartItems as it (it.id)}
					<div class="flex items-center gap-3 rounded-[20px] border border-white/8 bg-white/3 p-3 lg:grid lg:grid-cols-[96px_minmax(0,1fr)_40px] lg:gap-4 lg:rounded-[22px] lg:p-4">
						<a href="/p/{it.code}" aria-label={it.name}><Tile tile={it.tile} ic={it.ic} icon={44} class="h-[72px] w-[72px] rounded-[14px] lg:h-24 lg:w-24 lg:rounded-[18px]" /></a>
						<div class="flex min-w-0 flex-1 flex-col gap-[3px] lg:gap-1">
							<span class="text-[11px] font-bold text-accent lg:text-[12px]">{creatorOf(it.creator).name}</span>
							<span class="text-[14px] leading-[1.3] font-bold lg:text-[16px]">{it.name}</span>
							<span class="hidden text-[13px] text-fg-faint lg:block">{it.unit}</span>
							<div class="mt-1.5 flex items-center justify-between lg:mt-2 lg:flex-wrap lg:gap-3">
								<QtyStepper qty={it.qty} size="sm" onchange={(q) => shop.setQty(it.id, q)} />
								<span class="text-[15px] font-extrabold lg:text-[17px]">{won(it.lineAmount)}</span>
							</div>
						</div>
						<button type="button" onclick={() => shop.remove(it.id)} aria-label="{it.name} 삭제" class="flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-[10px] text-white/40 lg:h-10 lg:w-10 lg:self-center lg:rounded-xl lg:hover:bg-white/6 lg:hover:text-fg">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
						</button>
					</div>
				{/each}
				{#if shop.cartItems.length}
					<div class="mt-1 flex items-center gap-2.5 rounded-2xl border border-accent/20 bg-accent/8 px-4 py-3.5 lg:mt-0">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff7a3d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><path d="M3 7h13v10H3z" /><path d="M16 10h4l1 3v4h-5" /><circle cx="7" cy="19" r="1.5" /><circle cx="18" cy="19" r="1.5" /></svg>
						<span class="text-[13px] leading-[1.5] text-white/85 lg:text-[14px]">{shop.shippingMsg}</span>
					</div>
				{/if}
			</div>

			<!-- PC 주문 요약 -->
			{#if shop.cartItems.length}
				<aside class="hidden rounded-3xl border border-white/8 bg-panel p-6 lg:sticky lg:top-[104px] lg:block">
					<p class="mb-4 text-[16px] font-extrabold">주문 요약</p>
					<PriceSummary subtotal={shop.subtotal} shipping={shop.shipping} total={shop.total} />
					<a href="/checkout" class="mt-2 flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-[16px] font-extrabold text-bg transition-colors hover:bg-[#ff8f5c]">주문하기</a>
					<a href="/category" class="mt-2 flex h-12 w-full items-center justify-center rounded-[14px] text-[14px] font-bold text-fg-soft hover:text-fg">계속 쇼핑하기</a>
				</aside>
			{/if}
		</div>
	</div>

	<!-- 모바일 하단 합계 바 -->
	{#if shop.cartItems.length}
		<div class="sticky bottom-0 z-10 w-full border-t border-white/6 bg-bg px-5 pt-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:hidden">
			<PriceSummary subtotal={shop.subtotal} shipping={shop.shipping} total={shop.total} />
			<a href="/checkout" class="flex h-[58px] w-full items-center justify-center rounded-2xl bg-accent text-[17px] font-extrabold text-bg">{won(shop.total)} 주문하기</a>
		</div>
	{/if}
</div>
