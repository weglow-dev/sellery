<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { orders, type OrderTab } from '$lib/mock/orders.svelte';
	import { setParams } from '$lib/url';
	import FilterTabs from '$lib/components/FilterTabs.svelte';
	import ListBox from '$lib/components/ListBox.svelte';
	import ListRow from '$lib/components/ListRow.svelte';
	import SearchBox from '$lib/components/SearchBox.svelte';

	/** 주문 목록 — docs/myr-admin-screens.md §6-1 (시안 "MYR Admin PC" · "MYR Admin" 주문 · 2026-11-26).
	 *  큰 제목 · 하위 화면 없이 상태 탭(?tab= · 기본 결제 완료) + 검색 → 목록 줄 → 줄을 누르면 상세 화면(/orders/[id]).
	 *  이벗 발주 실패 · 배송 완료 예외는 탭이 아니라 줄의 빨간 칩. 칩 · 메타 · 설명 · 금액 · 건수 · 빈 상태 문구는 서버(목) 값 */
	const tabs = $derived(orders.tabs());
	const tab = $derived((page.url.searchParams.get('tab') ?? orders.defaultTab) as OrderTab);
	let q = $state('');
	const rows = $derived(orders.list({ tab, q }));

	// 예전 서랍 주소(?id=) — 상세 화면으로 넘긴다
	onMount(() => {
		const id = page.url.searchParams.get('id');
		if (id) goto(`/orders/${encodeURIComponent(id)}`, { replaceState: true });
	});
</script>

<div class="animate-up-in px-5 pb-10 lg:mx-auto lg:max-w-[1240px] lg:px-10 lg:pt-7 lg:pb-14">
	<h1 class="sr-only">주문 · 배송</h1>
	<div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
		<div class="min-w-0 flex-1"><FilterTabs {tabs} value={tab} label="주문 상태" onpick={(id) => setParams(page.url, { tab: id })} /></div>
		<SearchBox bind:value={q} placeholder="검색" label="주문 검색(주문번호 · 주문자 · 상품 · 크리에이터)" />
	</div>

	<ListBox n={rows.length} empty={orders.listEmpty}>
		{#each rows as r (r.id)}
			<ListRow thumb={r.thumb} chips={r.chips} meta={r.meta} title={r.title} sub={r.sub} right={r.right} onopen={() => goto(`/orders/${r.id}`)} />
		{/each}
	</ListBox>
</div>
