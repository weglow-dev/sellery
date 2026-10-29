<script lang="ts">
	import { goto } from '$app/navigation';
	import { won } from '$lib/data';
	import { formatPhoneInput } from '$lib/phone';
	import { shop } from '$lib/state.svelte';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import PriceSummary from '$lib/components/PriceSummary.svelte';
	import Tile from '$lib/components/Tile.svelte';

	/** 주문 · 결제 — 받는 분 / 결제 수단 / 금액 / 동의 → 주문 완료.
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

	const inputCls = 'h-[54px] w-full rounded-[14px] border-[1.5px] border-white/10 bg-white/4 px-4 text-[16px] text-fg outline-none focus:border-accent focus:bg-accent/6';
</script>

<svelte:head><title>주문 · 결제 — MYR Shop</title></svelte:head>

<!-- 등장 애니메이션은 내용에만 — fixed 하단 바는 애니메이션 요소 밖(상품 상세와 같은 이유). 버튼은 form 밖이라 form 속성으로 연결 -->
<div class="min-h-dvh">
	<div class="animate-slide-in">
	<BackHeader title="주문 · 결제" />

	<form id="checkout-form" class="px-5 pt-1.5 pb-[130px]" onsubmit={(e) => { e.preventDefault(); placeOrder(); }}>
		<div class="no-bar flex gap-2 overflow-x-auto pb-1">
			{#each shop.cartItems as it (it.id)}
				<div class="relative shrink-0">
					<Tile tile={it.tile} ic={it.ic} icon={26} class="h-14 w-14 rounded-[14px]" />
					<span class="absolute -right-1 -bottom-1 flex h-5 min-w-5 items-center justify-center rounded-[10px] border-[1.5px] border-white/15 bg-bg px-[5px] text-[11px] font-extrabold">{it.qty}</span>
				</div>
			{/each}
		</div>

		<h3 class="mt-6 mb-2.5 text-[15px] font-extrabold">받는 분</h3>
		<div class="flex flex-col gap-2.5">
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
			<input bind:value={shop.buyer.address} placeholder="주소 (동·호수까지)" autocomplete="street-address" aria-label="주소" class={inputCls} />
		</div>

		<h3 class="mt-6 mb-2.5 text-[15px] font-extrabold">결제 수단</h3>
		<!-- 토스 결제위젯 자리 — M4 에서 이 그리드를 위젯(#payment-method)으로 교체 -->
		<div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="결제 수단">
			{#each PAYS as pm (pm.id)}
				{@const on = pay === pm.id}
				<button
					type="button"
					role="radio"
					aria-checked={on}
					onclick={() => (pay = pm.id)}
					class="flex h-[54px] items-center gap-2.5 rounded-[14px] border-[1.5px] px-3.5 text-[14px] font-bold text-fg transition-all {on ? 'border-accent bg-accent/10' : 'border-white/10 bg-white/4'}"
				>
					<span class="h-2.5 w-2.5 shrink-0 rounded-full {on ? 'bg-accent' : 'bg-white/20'}"></span>{pm.name}
				</button>
			{/each}
		</div>

		<div class="mt-6">
			<PriceSummary subtotal={shop.subtotal} shipping={shop.shipping} total={shop.total} boxed />
		</div>

		<label class="mt-3.5 flex cursor-pointer items-start gap-3 rounded-[14px] bg-white/3 px-4 py-3.5">
			<input type="checkbox" bind:checked={agreed} class="m-0 h-[22px] w-[22px] shrink-0 accent-accent" />
			<span class="text-[13px] leading-[1.55] text-white/70"><b class="font-bold text-fg">(필수)</b> 주문 내용을 확인했으며 결제에 동의해요.</span>
		</label>
	</form>
	</div>

	<div class="fixed bottom-0 left-1/2 w-full max-w-[430px] -translate-x-1/2 bg-gradient-to-b from-bg/0 to-bg to-35% px-5 pt-3 pb-7">
		<button
			type="submit"
			form="checkout-form"
			disabled={!canPay}
			class="h-[58px] w-full rounded-2xl text-[17px] font-extrabold transition-colors duration-250 {canPay ? 'bg-accent text-bg' : 'bg-white/8 text-white/40'}"
		>
			{won(shop.total)} 결제하기
		</button>
	</div>
</div>
