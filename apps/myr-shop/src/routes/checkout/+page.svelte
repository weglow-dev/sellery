<script lang="ts">
	import { goto } from '$app/navigation';
	import { won } from '$lib/data';
	import { formatPhoneInput } from '$lib/phone';
	import { shop } from '$lib/state.svelte';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import PriceSummary from '$lib/components/PriceSummary.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 주문 · 결제 — 받는 분 / 결제 수단 / 주문 상품 / 금액 / 동의 → 주문 완료.
	 *  모바일: 세로 한 줄 + 하단 고정 [결제하기] · PC(lg): 왼쪽 폼 + 오른쪽 sticky 결제 금액(동의 · 버튼 포함).
	 *  결제 수단 칸은 디자인의 그림이다. M4 에서 이 자리를 토스 결제위젯이 렌더하고(docs/myr.md §6.7 · §9-13),
	 *  [결제하기]는 /api/checkout → 위젯 requestPayment 로 바뀐다. 지금은 목 주문을 만들고 완료 화면으로 간다. */
	const PAYS = [
		{ id: 'kakao', name: '카카오페이' },
		{ id: 'naver', name: '네이버페이' },
		{ id: 'card', name: '신용 · 체크카드' },
		{ id: 'toss', name: '토스페이' }
	];
	let pay = $state('kakao');
	let agreed = $state(false);

	const canPay = $derived(!!(shop.buyer.name.trim() && shop.buyer.phone.replace(/\D/g, '').length >= 10 && shop.buyer.address.trim() && agreed && shop.cartItems.length));

	function placeOrder() {
		if (!canPay) return;
		shop.placeOrder(PAYS.find((p) => p.id === pay)?.name ?? '');
		goto('/checkout/done');
	}

	const inputCls = 'h-[54px] w-full rounded-[14px] border-[1.5px] border-white/10 bg-white/4 px-4 text-[16px] text-fg outline-none focus:border-accent focus:bg-accent/6 lg:text-[15px]';
	const payBtn = 'h-[58px] w-full rounded-2xl text-[17px] font-extrabold transition-colors duration-250 lg:h-14 lg:text-[16px]';
</script>

<svelte:head><title>주문 · 결제 — MYR Shop</title></svelte:head>

<!-- 모바일: 화면 높이를 채우는 세로 flex — 내용만 스크롤, 결제 바는 바닥에 보통 흐름으로 (+layout.svelte 주석). 버튼은 form 밖이라 form 속성으로 연결 -->
<div class="flex h-full flex-col lg:mx-auto lg:block lg:h-auto lg:max-w-[1240px] lg:px-10 lg:pt-8 lg:pb-20">
	<div class="no-bar min-h-0 flex-1 animate-slide-in overflow-y-auto overscroll-y-contain lg:overflow-visible">
		<BackHeader title="주문 · 결제" />
		<h1 class="hidden text-[32px] font-extrabold tracking-[-.03em] lg:block">주문 · 결제</h1>

		{#if shop.ready && shop.cartItems.length === 0}
			<div class="flex flex-col items-center gap-4 px-5 pt-20 text-center lg:pt-[100px]">
				<p class="text-[17px] font-bold lg:text-[20px]">담긴 상품이 없어요</p>
				<p class="text-[14px] text-fg-faint lg:text-[15px]">장바구니에 레시피를 담은 뒤 결제할 수 있어요</p>
				<a href="/category" class="mt-2 flex h-12 items-center rounded-[14px] border border-white/14 px-[22px] text-[14px] font-bold text-fg">둘러보기</a>
			</div>
		{/if}
		<div class="lg:mt-6 lg:grid lg:grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] lg:items-start lg:gap-8 {shop.ready && shop.cartItems.length === 0 ? 'hidden' : ''}">
			<form id="checkout-form" class="px-5 pt-1.5 pb-4 lg:flex lg:flex-col lg:gap-7 lg:px-0 lg:pt-0 lg:pb-0" onsubmit={(e) => { e.preventDefault(); placeOrder(); }}>
				<div class="no-bar flex gap-2 overflow-x-auto pb-1 lg:hidden">
					{#each shop.cartItems as it (it.id)}
						<div class="relative shrink-0">
							<Tile tile={it.tile} ic={it.ic} icon={26} class="h-14 w-14 rounded-[14px]" />
							<span class="absolute -right-1 -bottom-1 flex h-5 min-w-5 items-center justify-center rounded-[10px] border-[1.5px] border-white/15 bg-bg px-[5px] text-[11px] font-extrabold">{it.qty}</span>
						</div>
					{/each}
				</div>

				<div>
					<h3 class="mt-6 mb-2.5 text-[15px] font-extrabold lg:mt-0 lg:mb-3 lg:text-[17px]">받는 분</h3>
					<div class="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:gap-3">
						<input bind:value={shop.buyer.name} placeholder="이름" autocomplete="name" aria-label="이름" class={inputCls} />
						<input
							value={shop.buyer.phone}
							oninput={(e) => (shop.buyer.phone = formatPhoneInput(e.currentTarget))}
							type="tel"
							inputmode="numeric"
							placeholder="010-0000-0000"
							autocomplete="tel"
							aria-label="연락처"
							class="{inputCls} tabular-nums"
						/>
						<input bind:value={shop.buyer.address} placeholder="주소 (동·호수까지)" autocomplete="street-address" aria-label="주소" class="{inputCls} lg:col-span-2" />
					</div>
				</div>

				<div>
					<h3 class="mt-6 mb-2.5 text-[15px] font-extrabold lg:mt-0 lg:mb-3 lg:text-[17px]">결제 수단</h3>
					<!-- 토스 결제위젯 자리 — M4 에서 이 그리드를 위젯(#payment-method)으로 교체 -->
					<div class="grid grid-cols-2 gap-2 lg:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] lg:gap-2.5" role="radiogroup" aria-label="결제 수단">
						{#each PAYS as pm (pm.id)}
							{@const on = pay === pm.id}
							<button
								type="button"
								role="radio"
								aria-checked={on}
								onclick={() => (pay = pm.id)}
								class="flex h-[54px] items-center gap-2.5 rounded-[14px] border-[1.5px] px-3.5 text-[14px] font-bold whitespace-nowrap text-fg transition-all lg:h-14 lg:px-4 {on ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/4'}"
							>
								<span class="h-2.5 w-2.5 shrink-0 rounded-full {on ? 'bg-accent' : 'bg-white/20'}"></span>{pm.name}
							</button>
						{/each}
					</div>
				</div>

				<!-- PC 주문 상품 목록 -->
				<div class="hidden lg:block">
					<h3 class="mb-3 text-[17px] font-extrabold">주문 상품</h3>
					<div class="flex flex-col gap-2">
						{#each shop.cartItems as it (it.id)}
							<div class="flex items-center gap-3.5 rounded-2xl border border-white/8 bg-white/3 px-3.5 py-3">
								<Tile tile={it.tile} ic={it.ic} icon={26} class="h-[52px] w-[52px] rounded-xl" />
								<span class="min-w-0 flex-1 text-[14px] font-bold">{it.name}<span class="font-semibold text-fg-faint"> × {it.qty}</span></span>
								<span class="text-[15px] font-extrabold">{won(it.lineAmount)}</span>
							</div>
						{/each}
					</div>
				</div>

				<!-- 모바일 금액 · 동의 -->
				<div class="mt-6 lg:hidden">
					<PriceSummary subtotal={shop.subtotal} shipping={shop.shipping} total={shop.total} boxed />
				</div>
				<label class="mt-3.5 flex cursor-pointer items-start gap-3 rounded-[14px] bg-white/3 px-4 py-3.5 lg:hidden">
					<input type="checkbox" bind:checked={agreed} class="m-0 h-[22px] w-[22px] shrink-0 accent-accent" />
					<span class="text-[13px] leading-[1.55] text-white/70"><b class="font-bold text-fg">(필수)</b> 주문 내용을 확인했으며 결제에 동의해요.</span>
				</label>
			</form>

			<!-- PC 결제 금액 패널 -->
			<aside class="hidden rounded-3xl border border-white/8 bg-panel p-6 lg:sticky lg:top-[104px] lg:block">
				<p class="mb-4 text-[16px] font-extrabold">결제 금액</p>
				<PriceSummary subtotal={shop.subtotal} shipping={shop.shipping} total={shop.total} />
				<label class="mt-2 flex cursor-pointer items-start gap-3 rounded-[14px] bg-white/3 p-3.5">
					<input type="checkbox" bind:checked={agreed} class="m-0 h-5 w-5 shrink-0 accent-accent" />
					<span class="text-[13px] leading-[1.55] text-white/70"><b class="font-bold text-fg">(필수)</b> 주문 내용을 확인했으며 결제에 동의해요.</span>
				</label>
				<button type="submit" form="checkout-form" disabled={!canPay} class="{payBtn} mt-3.5 {canPay ? 'bg-accent text-bg hover:bg-[#ff8f5c]' : 'bg-white/8 text-white/40'}">{won(shop.total)} 결제하기</button>
			</aside>
		</div>
	</div>

	<!-- 모바일 하단 결제 바 -->
	<div class="w-full shrink-0 border-t border-white/6 bg-bg px-5 pt-3 pb-[max(1.75rem,env(safe-area-inset-bottom))] lg:hidden {shop.ready && shop.cartItems.length === 0 ? 'hidden' : ''}">
		<button type="submit" form="checkout-form" disabled={!canPay} class="{payBtn} {canPay ? 'bg-accent text-bg' : 'bg-white/8 text-white/40'}">{won(shop.total)} 결제하기</button>
	</div>
</div>
