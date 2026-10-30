<script lang="ts">
	/** 결제 실패/취소 랜딩 — 사유 + [장바구니] [다시 시도]. 장바구니는 그대로 남아 있다(결제되지 않음). */
	let { data } = $props();
</script>

<svelte:head>
	<title>결제 실패 — MYR Shop</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="flex h-full animate-slide-in flex-col lg:mx-auto lg:h-auto lg:max-w-[760px] lg:px-10 lg:pt-[72px] lg:pb-20 lg:text-center">
	<div class="no-bar min-h-0 flex-1 overflow-y-auto px-5 pt-16 pb-5 lg:overflow-visible lg:px-0 lg:pt-0">
		<div class="flex h-16 w-16 items-center justify-center rounded-full bg-[#ff6b6b]/15 lg:mx-auto lg:h-[72px] lg:w-[72px]">
			<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
		</div>
		<h1 class="mt-[22px] text-[26px] leading-[1.3] font-extrabold tracking-[-.03em] lg:text-[32px]">결제가 진행되지 않았어요</h1>
		<p class="mt-2.5 text-[15px] leading-[1.6] text-fg-soft">{data.reason}</p>
		{#if data.orderId}<p class="mt-1 font-mono text-[11px] text-fg-faint">주문 {data.orderId}</p>{/if}
		<p class="mt-4 text-[13px] text-fg-faint">장바구니는 그대로예요 — 다시 결제할 수 있어요.</p>
	</div>
	<div class="flex shrink-0 gap-2.5 px-5 pt-3 pb-7 lg:justify-center lg:px-0 lg:pt-7 lg:pb-0">
		<a href="/cart" class="flex h-14 flex-1 items-center justify-center rounded-2xl border-[1.5px] border-white/14 text-[15px] font-bold text-fg lg:h-[54px] lg:flex-none lg:px-7">장바구니</a>
		<a href="/checkout" class="flex h-14 flex-1 items-center justify-center rounded-2xl bg-accent text-[15px] font-extrabold text-bg lg:h-[54px] lg:flex-none lg:px-7">다시 시도</a>
	</div>
</div>
