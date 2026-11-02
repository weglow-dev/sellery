<script lang="ts">
	import { displayCode } from '$lib/order-view';
	import OrderDetail from '$lib/components/OrderDetail.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>주문 {displayCode(data.order.code)} — MYR Shop</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<OrderDetail order={data.order} inquiries={data.inquiries} guestNote />
