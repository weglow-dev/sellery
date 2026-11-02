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
	<h1 class="hidden text-[32px] font-extrabold tracking-[-.03em] lg:block">주문 상세</h1>
	<div class="px-5 pt-1.5 pb-8 lg:mt-6 lg:px-0 lg:pt-0 lg:pb-0">
		<OrderDetail order={data.order} inquiries={data.inquiries} />
	</div>
</div>
