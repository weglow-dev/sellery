<script lang="ts">
	import { creatorOf, won } from '$lib/data';
	import { shop } from '$lib/state.svelte';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import PriceSummary from '$lib/components/PriceSummary.svelte';
	import QtyStepper from '$lib/components/QtyStepper.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 장바구니 — 줄마다 수량 · 삭제, 무료배송까지 남은 금액, 합계 → 주문하기 */
</script>

<svelte:head><title>장바구니 — MYR Shop</title></svelte:head>

<!-- 등장 애니메이션은 내용에만 — fixed 하단 바는 애니메이션 요소 밖(상품 상세와 같은 이유) -->
<div class="min-h-dvh">
	<div class="animate-slide-in">
	<BackHeader title="장바구니">
		{#snippet right()}<span class="text-[13px] text-fg-faint">{shop.cartCount}개</span>{/snippet}
	</BackHeader>

	<div class="px-5 pt-1.5 pb-[220px]">
		{#if shop.ready && shop.cartItems.length === 0}
			<div class="flex flex-col items-center gap-4 pt-20 text-center">
				<span class="flex h-[72px] w-[72px] items-center justify-center rounded-3xl bg-white/4 text-fg-faint">
					<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 7h12l1 13H5z" /><path d="M9 7V5a3 3 0 0 1 6 0v2" /></svg>
				</span>
				<div><p class="text-[17px] font-bold">아직 비어 있어요</p><p class="mt-1.5 text-[14px] text-fg-faint">마음에 드는 레시피를 담아보세요</p></div>
				<a href="/" class="flex h-12 items-center rounded-[14px] border border-white/14 px-[22px] text-[14px] font-bold text-fg">둘러보기</a>
			</div>
		{/if}

		<div class="flex flex-col gap-2.5">
			{#each shop.cartItems as it (it.id)}
				<div class="flex items-center gap-3 rounded-[20px] border border-white/8 bg-white/3 p-3">
					<a href="/p/{it.code}" aria-label={it.name}><Tile tile={it.tile} ic={it.ic} icon={44} class="h-[72px] w-[72px] rounded-[14px]" /></a>
					<div class="flex min-w-0 flex-1 flex-col gap-[3px]">
						<span class="text-[11px] font-bold text-accent">{creatorOf(it.creator).name}</span>
						<span class="text-[14px] leading-[1.3] font-bold">{it.name}</span>
						<div class="mt-1.5 flex items-center justify-between">
							<QtyStepper qty={it.qty} size="sm" onchange={(q) => shop.setQty(it.id, q)} />
							<span class="text-[15px] font-extrabold">{won(it.lineAmount)}</span>
						</div>
					</div>
					<button type="button" onclick={() => shop.remove(it.id)} aria-label="{it.name} 삭제" class="flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-[10px] text-white/40">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
					</button>
				</div>
			{/each}
		</div>

		{#if shop.cartItems.length}
			<div class="mt-3.5 flex items-center gap-2.5 rounded-2xl border border-accent/20 bg-accent/8 px-4 py-3.5">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff7a3d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0" aria-hidden="true"><path d="M3 7h13v10H3z" /><path d="M16 10h4l1 3v4h-5" /><circle cx="7" cy="19" r="1.5" /><circle cx="18" cy="19" r="1.5" /></svg>
				<span class="text-[13px] leading-[1.5] text-white/85">{shop.shippingMsg}</span>
			</div>
		{/if}
	</div>
	</div>

	{#if shop.cartItems.length}
		<div class="fixed bottom-0 left-1/2 w-full max-w-[430px] -translate-x-1/2 bg-gradient-to-b from-bg/0 to-bg to-25% px-5 pt-4 pb-7">
			<PriceSummary subtotal={shop.subtotal} shipping={shop.shipping} total={shop.total} />
			<a href="/checkout" class="flex h-[58px] w-full items-center justify-center rounded-2xl bg-accent text-[17px] font-extrabold text-bg">{won(shop.total)} 주문하기</a>
		</div>
	{/if}
</div>
