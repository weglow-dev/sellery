<script lang="ts">
	import { displayCode } from '@sellery/myr-core/order-view';
	import RefundPage from '$lib/components/RefundPage.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>교환 · 환불 신청 {displayCode(data.order.code)} — MYR Shop</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<RefundPage order={data.order} rules={data.rules} backHref={data.backHref} />
