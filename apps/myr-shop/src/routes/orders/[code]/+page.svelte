<script lang="ts">
	import { displayCode } from '@sellery/myr-core/order-view';
	import OrderDetail from '$lib/components/OrderDetail.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>주문 {displayCode(data.order.code)} — MYR Shop</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<OrderDetail order={data.order} inquiries={data.inquiries} claims={data.claims} />
