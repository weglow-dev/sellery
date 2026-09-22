<script lang="ts">
	/**
	 * 비회원 주문 상세 (0021) — 본문은 $lib/components/OrderDetail (회원 /account/orders/[code] 와 공용). 환불 성공 → `invalidateAll()`.
	 */
	import { invalidateAll } from '$app/navigation';
	import OrderDetail from '$lib/components/OrderDetail.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const CODE = $derived(data.order.code.toUpperCase());
	const refresh = () => invalidateAll();
</script>

<svelte:head>
	<title>주문 {CODE} — 셀러리</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<OrderDetail order={data.order} settings={data.settings} back={{ href: '/orders/lookup', label: '← 주문 조회' }} guest onRefreshed={refresh} />
