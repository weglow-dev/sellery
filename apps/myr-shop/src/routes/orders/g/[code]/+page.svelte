<script lang="ts">
	import { displayCode } from '$lib/order-view';
	import BackHeader from '$lib/components/BackHeader.svelte';
	import OrderDetail from '$lib/components/OrderDetail.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>주문 {displayCode(data.order.code)} — MYR Shop</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="animate-slide-in lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-8 lg:pb-20">
	<BackHeader title="주문 상세" />
	<h1 class="hidden text-[32px] font-extrabold tracking-[-.03em] lg:block">주문 상세 <span class="ml-2 text-[15px] font-semibold text-white/45">비회원</span></h1>
	<div class="px-5 pt-1.5 pb-8 lg:mt-6 lg:px-0 lg:pt-0 lg:pb-0">
		<p class="mb-3 rounded-[14px] border border-white/8 bg-white/3 px-4 py-3 text-[13px] leading-[1.5] text-white/70">비회원 주문이에요 — 이 기기에서 90일 동안 바로 열리고, 다른 기기에서는 <a href="/orders/lookup" class="font-bold text-accent">주문 조회</a>에서 주문번호와 연락처로 열 수 있어요.</p>
		<OrderDetail order={data.order} inquiries={data.inquiries} />
	</div>
</div>
