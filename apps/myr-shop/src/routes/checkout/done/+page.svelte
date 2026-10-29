<script lang="ts">
	import { won } from '$lib/data';
	import { shop } from '$lib/state.svelte';

	/** 주문 완료 — 마지막 (목) 주문을 보여준다. M4 에서는 `/checkout/success` 가 confirm 응답 카드로 그린다 */
	const order = $derived(shop.lastOrder);
	const nameDisplay = $derived(shop.buyer.name.trim() ? `${shop.buyer.name.trim()}님, ` : '');
</script>

<svelte:head><title>주문 완료 — MYR Shop</title></svelte:head>

<div class="flex min-h-dvh animate-slide-in flex-col">
	<div class="flex-1 px-5 pt-16 pb-5">
		<div class="flex h-16 w-16 animate-pop items-center justify-center rounded-full bg-accent">
			<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0a0b0e" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
		</div>
		<h1 class="mt-[22px] text-[30px] leading-[1.3] font-extrabold tracking-[-.03em]">주문이 완료됐어요</h1>
		{#if order}
			<p class="mt-2.5 text-[15px] leading-[1.6] text-fg-soft">{nameDisplay}주문번호 <b class="font-bold text-fg">{order.no}</b><br />영업일 기준 2~3일 안에 도착해요.</p>
			<div class="mt-6 rounded-[18px] border border-white/7 bg-white/3 px-[18px] pt-1.5 pb-2">
				<p class="mt-3 mb-1 text-[13px] font-bold text-fg-faint">주문 내역</p>
				{#each order.lines as l (l.id)}
					<div class="flex items-baseline justify-between gap-4 border-t border-white/6 py-[11px] text-[14px]"><span class="text-white/75">{l.name} × {l.qty}</span><span class="font-bold whitespace-nowrap">{won(l.amount)}</span></div>
				{/each}
				{#if order.shipping}
					<div class="flex items-baseline justify-between gap-4 border-t border-white/6 py-[11px] text-[14px]"><span class="text-white/75">배송비</span><span class="font-bold whitespace-nowrap">{won(order.shipping)}</span></div>
				{/if}
				<div class="flex items-baseline justify-between border-t border-white/10 pt-3 pb-2.5"><span class="font-bold">총 결제</span><span class="text-[18px] font-extrabold text-accent">{won(order.total)}</span></div>
			</div>
			<div class="mt-3.5 flex items-start gap-3 rounded-[18px] border border-white/7 bg-white/3 p-4">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff7a3d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mt-0.5 shrink-0" aria-hidden="true"><path d="M4 6h16v12H4z" /><path d="M4 7l8 6 8-6" /></svg>
				<span class="text-[13px] leading-[1.55] text-white/70">{order.address}<br /><span class="text-fg-faint">{order.pay} · 배송 알림은 문자로 보내드려요</span></span>
			</div>
		{:else if shop.ready}
			<p class="mt-2.5 text-[15px] leading-[1.6] text-fg-soft">최근 주문이 없어요.</p>
		{/if}
	</div>
	<div class="flex shrink-0 gap-2.5 px-5 pt-3 pb-7">
		<a href="/my" class="flex h-14 flex-1 items-center justify-center rounded-2xl border-[1.5px] border-white/14 text-[15px] font-bold text-fg">주문 내역</a>
		<a href="/" class="flex h-14 flex-1 items-center justify-center rounded-2xl bg-accent text-[15px] font-extrabold text-bg">계속 쇼핑하기</a>
	</div>
</div>
