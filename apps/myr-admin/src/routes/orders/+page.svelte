<script lang="ts">
	import { page } from '$app/state';
	import { orders, type OrderTab } from '$lib/mock/orders.svelte';
	import { closeDrawer, setParams } from '$lib/url';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import ListBox from '$lib/components/ListBox.svelte';
	import ListRow from '$lib/components/ListRow.svelte';
	import OrderDrawer from '$lib/components/OrderDrawer.svelte';
	import OrderModals from '$lib/components/OrderModals.svelte';
	import OrdersHead from '$lib/components/OrdersHead.svelte';
	import SearchBox from '$lib/components/SearchBox.svelte';

	/** 주문 목록 — docs/myr-admin-screens.md §6-1. 머리(화면 고르기 · 발송 대기 · 배송 중) → 상태 탭(?tab= · 기본 결제 완료) + 검색 → 목록 줄 → 서랍(?id=).
	 *  상태 칩 · 메타 · 설명 · 금액 · 건수 · 빈 상태 문구는 서버(목) 값 — 화면은 탭 · 검색어를 넘기고 그린다 */
	const tabs = $derived(orders.tabs());
	const tab = $derived((page.url.searchParams.get('tab') ?? orders.defaultTab) as OrderTab);
	const openId = $derived(page.url.searchParams.get('id'));
	let q = $state('');
	const rows = $derived(orders.list({ tab, q }));
	const openRow = (id: string) => setParams(page.url, { id }, true);
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
	<OrdersHead value="list" sum={orders.listSum} />

	<div class="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
		<div class="min-w-0 flex-1"><FilterTabs {tabs} value={tab} label="주문 상태" onpick={(id) => setParams(page.url, { tab: id })} /></div>
		<SearchBox bind:value={q} placeholder="주문번호 · 주문자 · 상품 · 크리에이터" label="주문 검색" />
	</div>

	<ListBox n={rows.length} empty={orders.listEmpty}>
		{#each rows as r (r.id)}
			<ListRow thumb={r.thumb} chips={r.chips} meta={r.meta} title={r.title} sub={r.sub} right={r.right} onopen={() => openRow(r.id)} selected={openId === r.id} />
		{/each}
	</ListBox>
</div>

{#if openId}
	<OrderDrawer id={openId} onclose={() => closeDrawer(page.url)} />
{/if}
<OrderModals />
